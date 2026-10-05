// R: Validate awareness world boundaries, incomplete canonical immutability and commit timing.
import { BattleStateSchema, type BattleState, type AwarenessPipelineState } from "@kshiai/shared";
import { canonicalAssetJson } from "../repositories/asset-generations.js";
import type { DatabaseConnection } from "../db.js";

export function assertAwarenessWorldBoundary(runtime: AwarenessPipelineState, tick: number, incomplete: boolean): void {
  if (incomplete ? runtime.status !== "incomplete" : runtime.status !== "active" || runtime.preparedTick !== tick || runtime.cutoffTick !== tick) {
    throw new Error("AWARENESS_WORLD_BOUNDARY_NOT_PREPARED");
  }
}
function canonicalFacts(state: BattleState): string {
  const { status, incompleteReason, updatedAt, battleRevision, advanceOperation,
    prologuePending, aftermathPending, ...facts } = state;
  return canonicalAssetJson(facts);
}
export async function assertIncompleteWorldUnchanged(connection: DatabaseConnection, state: BattleState): Promise<void> {
  if (state.status !== "incomplete") return;
  const saved = await connection.query<{ state_json: unknown }>("SELECT state_json FROM battles WHERE id = $1", [state.id]);
  const raw = saved.rows[0]?.state_json;
  if (!raw) throw new Error("BATTLE_NOT_FOUND");
  const baseline = BattleStateSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  if (canonicalFacts(baseline) !== canonicalFacts(state)) throw new Error("AWARENESS_INCOMPLETE_CANONICAL_CHANGE");
}
export function assertAwarenessCommitTime(runtime: AwarenessPipelineState, incomplete: boolean, at: number): void {
  if (!incomplete && (!Number.isFinite(at) || at < runtime.startedAt || at >= runtime.deadlineAt)) {
    throw new Error("AWARENESS_WORLD_COMMIT_DEADLINE");
  }
}
