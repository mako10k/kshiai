// R: Atomically commit unified private decisions with world facts, speech and narration outbox.
import { applyUnifiedConsciousnessBoundary, type BattleState } from "@kshiai/shared";
import { withTransaction } from "../db.js";
import { getUnifiedRuntimeInTransaction, writeUnifiedRuntime } from "../repositories/unified-consciousness.js";
import { saveBattleWithNarrationOutboxInTransaction, type saveBattle } from "../repositories/battles.js";
import { settleBattleRatingInTransaction } from "./rating-service.js";
import { assertIncompleteWorldUnchanged } from "./awareness-world-validation.js";
import type { BattleLeaseFence } from "./distributed-guard.js";
export async function commitUnifiedWorld(input: {
  state: BattleState; meta: Parameters<typeof saveBattle>[1]; fence: BattleLeaseFence; tick: number; now?: () => number;
}): Promise<BattleState> {
  if (input.state.assetManifest?.schemaVersion !== 6 || input.fence.battleId !== input.state.id) throw new Error("CONSCIOUSNESS_WORLD_SCOPE_MISMATCH");
  return withTransaction(async (connection) => {
    const latest = await getUnifiedRuntimeInTransaction(connection, input.state.id, { lock: true });
    if (!latest) throw new Error("CONSCIOUSNESS_RUNTIME_NOT_FOUND");
    const now = input.now ?? Date.now;
    const incomplete = input.state.status === "incomplete";
    const assertTime = () => { if (!incomplete && (latest.runtime.status !== "active" || now() >= latest.runtime.deadlineAt)) throw new Error("CONSCIOUSNESS_WORLD_DEADLINE"); };
    assertTime();
    if (incomplete) await assertIncompleteWorldUnchanged(connection, input.state);
    let runtime = incomplete ? { ...latest.runtime, status: "incomplete" as const, incompleteReason: input.state.incompleteReason ?? "CONSCIOUSNESS_FAILED" }
      : applyUnifiedConsciousnessBoundary(latest.runtime, input.tick);
    if (!incomplete) {
      const canonical = await connection.query<{ revision: number }>("SELECT revision FROM battles WHERE id=$1", [input.state.id]);
      const revision = canonical.rows[0]?.revision;
      const expected = latest.runtime.decisions.filter((decision) => decision.tick === input.tick);
      if (expected.some((decision) => decision.worldRevision !== Number(revision))) throw new Error("CONSCIOUSNESS_WORLD_REVISION_CONFLICT");
    }
    const state = input.state.status === "finished" ? await settleBattleRatingInTransaction(connection, input.state) : input.state;
    if (state.status === "finished") runtime = { ...runtime, status: "terminal", terminalAt: runtime.terminalAt ?? now() };
    assertTime();
    await writeUnifiedRuntime(connection, latest, runtime, new Date(now()).toISOString(), input.fence);
    await saveBattleWithNarrationOutboxInTransaction(connection, state, input.meta);
    assertTime();
    return state;
  });
}
