// R: Commit a prepared awareness boundary with canonical facts and frozen narration sources atomically.
import { AwarenessCancelGeneration as cancelGeneration, type AwarenessPipelineState, type BattleState } from "@kshiai/shared";
import { assertAwarenessWorldBoundary, assertIncompleteWorldUnchanged, assertAwarenessCommitTime } from "./awareness-world-validation.js";
import { withTransaction } from "../db.js";
import { commitAwarenessRuntimeInTransaction, getAwarenessRuntimeInTransaction } from "../repositories/battle-awareness.js";
import { saveBattleWithNarrationOutboxInTransaction, type saveBattle } from "../repositories/battles.js";
import { settleBattleRatingInTransaction } from "./rating-service.js";
import type { BattleLeaseFence } from "./distributed-guard.js";

export async function commitAwarenessWorld(input: {
  state: BattleState;
  meta: Parameters<typeof saveBattle>[1];
  fence: BattleLeaseFence;
  tick: number;
  committedAt: number;
  clock?: () => number;
}): Promise<BattleState> {
  if (input.state.assetManifest?.schemaVersion !== 5 || input.fence.battleId !== input.state.id) {
    throw new Error("AWARENESS_WORLD_COMMIT_SCOPE_MISMATCH");
  }
  return withTransaction(async (connection) => {
    const latest = await getAwarenessRuntimeInTransaction(connection, input.state.id, { lock: true });
    if (!latest) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    const runtime = latest.runtime;
    const incomplete = input.state.status === "incomplete";
    assertAwarenessWorldBoundary(runtime, input.tick, incomplete);
    if (incomplete) await assertIncompleteWorldUnchanged(connection, input.state);
    const clock = input.clock ?? Date.now;
    const assertDeadline = () => assertAwarenessCommitTime(runtime, incomplete, clock());
    assertDeadline();
    assertAwarenessCommitTime(runtime, incomplete, input.committedAt);
    const state = input.state.status === "finished"
      ? await settleBattleRatingInTransaction(connection, input.state) : input.state;
    await commitAwarenessRuntimeInTransaction(connection, {
      battleId: input.state.id, expectedRevision: latest.revision, fence: input.fence,
      now: new Date(input.committedAt).toISOString(),
    }, committedAwarenessRuntime(runtime, state, input.committedAt));
    assertDeadline();
    await saveBattleWithNarrationOutboxInTransaction(connection, state, input.meta);
    assertDeadline();
    return state;
  });
}

function committedAwarenessRuntime(runtime: AwarenessPipelineState, state: BattleState, at: number): AwarenessPipelineState {
  const incomplete = state.status === "incomplete";
  const terminal = state.status !== "active";
  return { ...runtime, preparedTick: null,
    terminalAt: terminal && !incomplete ? runtime.terminalAt ?? at : runtime.terminalAt,
    lastCommittedAt: incomplete ? runtime.lastCommittedAt : at,
    status: incomplete ? "incomplete" : terminal ? "terminal" : "active",
    sides: terminal ? { a: cancelGeneration(runtime.sides.a), b: cancelGeneration(runtime.sides.b) } : runtime.sides };
}
