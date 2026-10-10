import { commitUnifiedWorld } from "./unified-consciousness-world.js";
import type { UnifiedPreparedBoundary } from "./unified-consciousness-execution.js";
// R: Scope one prepared awareness boundary and its required dispatch guard to canonical execution.
import { AsyncLocalStorage } from "node:async_hooks";
import { sheetCombatProfile, type BattleState } from "@kshiai/shared";
import type { AwarenessPreparedTick } from "./awareness-execution.js";
import type { BattleLeaseFence } from "./distributed-guard.js";
import { commitAwarenessWorld } from "./awareness-world-commit.js";
import { recordBattleFinished } from "./balance-observe.js";
import { saveBattleWithNarrationOutbox } from "../repositories/battles.js";

export type AwarenessAdvanceContext = {
  prepared: AwarenessPreparedTick | UnifiedPreparedBoundary;
  fence: BattleLeaseFence;
  tick: number;
  assertUsable(): void;
};
const context = new AsyncLocalStorage<AwarenessAdvanceContext>();
export function currentAwarenessAdvanceContext(): AwarenessAdvanceContext | undefined { return context.getStore(); }
export function withAwarenessAdvanceContext<T>(value: AwarenessAdvanceContext, run: () => Promise<T>): Promise<T> {
  return context.run(value, run);
}
export async function saveCompletedBattleBoundary(state: BattleState, meta: Parameters<typeof saveBattleWithNarrationOutbox>[1]): Promise<BattleState> {
  if (state.assetManifest?.schemaVersion !== 5 && state.assetManifest?.schemaVersion !== 6) { await saveBattleWithNarrationOutbox(state, meta); return state; }
  const current = context.getStore();
  if (!current) throw new Error("AWARENESS_ADVANCE_CONTEXT_REQUIRED");
  current.assertUsable();
  const committed = state.assetManifest.schemaVersion === 6
    ? await commitUnifiedWorld({ state, meta, fence: current.fence, tick: current.tick })
    : await commitAwarenessWorld({ state, meta, fence: current.fence, tick: current.tick, committedAt: Date.now() });
  if (committed.status === "finished") {
    const manifest = committed.assetManifest;
    if (manifest?.schemaVersion !== 5 && manifest?.schemaVersion !== 6) throw new Error("AWARENESS_MANIFEST_REQUIRED");
    try {
      await recordBattleFinished({ state: committed, sameOwner: committed.ratingSettlement?.sameOwner,
        ranked: committed.ratingSettlement?.ranked,
        sideAProfile: sheetCombatProfile(manifest.characters.a.snapshot), sideBProfile: sheetCombatProfile(manifest.characters.b.snapshot) });
    } catch (error) { console.warn("[balance] committed battle observation skipped", error instanceof Error ? error.message : error); }
  }
  return committed;
}
