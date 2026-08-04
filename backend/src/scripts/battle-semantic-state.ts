import { readFile } from "node:fs/promises";
import {
  TurnSemanticPatchSchema,
  applyTurnSemanticPatch,
  buildSemanticObservationState,
  semanticValueAtPointer,
} from "@kshiai/shared";
import { closeDatabase, initializeDatabase } from "../db.js";
import { getBattle, getBattleMeta, saveBattle } from "../repositories/battles.js";
import { withBattleLease } from "../services/distributed-guard.js";

function usage(): never {
  throw new Error([
    "Usage:",
    "  npm run battle-state -- inspect <battle-id> [json-pointer]",
    "  npm run battle-state -- diff <battle-id>",
    "  npm run battle-state -- patch <battle-id> <expected-revision> <patch.json>",
  ].join("\n"));
}

async function loadBattle(id: string) {
  const state = await getBattle(id);
  if (!state) throw new Error(`battle not found: ${id}`);
  if (!state.semanticState) throw new Error(`semantic state missing: ${id}`);
  return state;
}

async function main() {
  const [command, battleId, ...args] = process.argv.slice(2);
  if (!command || !battleId) usage();
  await initializeDatabase();
  const state = await loadBattle(battleId);

  if (command === "inspect") {
    const pointer = args[0];
    const value = pointer
      ? semanticValueAtPointer(state.semanticState!, pointer)
      : state.semanticState;
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (command === "diff") {
    const transition = state.latestSemanticTransition;
    console.log(JSON.stringify(transition
      ? {
          turn: transition.turn,
          status: transition.status,
          revisionBefore: transition.fromRevision,
          revisionAfter: transition.toRevision,
          operations: transition.patch?.operations ?? [],
        }
      : {
          turn: null,
          status: "no_semantic_patch",
          revisionBefore: state.semanticState!.revision,
          revisionAfter: state.semanticState!.revision,
          operations: [],
        }, null, 2));
    return;
  }

  if (command === "patch") {
    const [expectedRaw, patchPath] = args;
    if (!expectedRaw || !patchPath) usage();
    const expectedRevision = Number(expectedRaw);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("expected-revision must be a nonnegative integer");
    }
    const patch = TurnSemanticPatchSchema.parse(
      JSON.parse(await readFile(patchPath, "utf8")),
    );
    if (patch.baseRevision !== expectedRevision) {
      throw new Error(
        `patch baseRevision ${patch.baseRevision} does not match expected ${expectedRevision}`,
      );
    }
    const semanticState = await withBattleLease(battleId, async () => {
      const current = await loadBattle(battleId);
      if (current.semanticState!.revision !== expectedRevision) {
        throw new Error(
          `revision conflict: expected ${expectedRevision}, current ${current.semanticState!.revision}`,
        );
      }
      const applied = applyTurnSemanticPatch({
        state: current.semanticState!,
        patch,
        turn: patch.turn,
      });
      if (!applied.ok) {
        throw new Error(`${applied.error.code}: ${applied.error.message}`);
      }
      const meta = await getBattleMeta(battleId);
      if (!meta) throw new Error(`battle metadata not found: ${battleId}`);
      await saveBattle({
        ...current,
        semanticState: applied.state,
        observationStateA: buildSemanticObservationState({
          before: current.semanticState!,
          after: applied.state,
          observer: "a",
          previousSnapshot: current.observationStateA?.snapshot,
        }),
        observationStateB: buildSemanticObservationState({
          before: current.semanticState!,
          after: applied.state,
          observer: "b",
          previousSnapshot: current.observationStateB?.snapshot,
        }),
        observationStatePublic: buildSemanticObservationState({
          before: current.semanticState!,
          after: applied.state,
          observer: "public",
          previousSnapshot: current.observationStatePublic?.snapshot,
        }),
        latestSemanticTransition: {
          turn: patch.turn,
          status: "applied",
          fromRevision: current.semanticState!.revision,
          toRevision: applied.state.revision,
          patch,
        },
        updatedAt: new Date().toISOString(),
      }, {
        sideAUserId: meta.side_a_user_id,
        sideACharacterId: meta.side_a_character_id,
        sideBCharacterId: meta.side_b_character_id,
      });
      return applied.state;
    });
    console.log(JSON.stringify({
      battleId,
      revisionBefore: expectedRevision,
      revisionAfter: semanticState.revision,
    }, null, 2));
    return;
  }

  usage();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
