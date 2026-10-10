// R: Share world/narration accounting without exposing private consciousness to workers.
import { type AwarenessPipelineState, type AwarenessReservation, type UnifiedConsciousnessRuntime } from "@kshiai/shared";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import { getAwarenessRuntimeInTransaction, settleAwarenessAttemptInTransaction, type AwarenessAttemptSettlement } from "./battle-awareness.js";
import { getUnifiedRuntimeInTransaction, writeUnifiedRuntime } from "./unified-consciousness.js";
import { budgetSnapshot } from "./awareness-reservation-budget.js";
export type BattleOperationalRuntime = Pick<AwarenessPipelineState, "policy" | "budget" | "status" | "startedAt" | "deadlineAt" | "terminalAt">;
export type BattleOperationalSnapshot = { battleId: string; revision: number; fencingToken: number; updatedAt: string; runtime: BattleOperationalRuntime };
export function unifiedOperationalRuntime(runtime: UnifiedConsciousnessRuntime): BattleOperationalRuntime {
  return { policy: runtime.operatingPolicy, status: runtime.status, startedAt: runtime.startedAt,
    deadlineAt: runtime.deadlineAt, terminalAt: runtime.terminalAt,
    budget: { ...runtime.budget, physicalAttempts: runtime.budget.physicalAttempts + runtime.decisions.length,
      physicalOutstanding: runtime.budget.physicalOutstanding + runtime.decisions.filter((item) => item.physicalOutstanding).length } };
}
export async function getBattleOperationalRuntimeInTransaction(connection: DatabaseConnection, battleId: string, options = { lock: false }): Promise<BattleOperationalSnapshot | null> {
  const unified = await getUnifiedRuntimeInTransaction(connection, battleId, options);
  if (unified) return { battleId, revision: unified.revision, fencingToken: unified.fencingToken, updatedAt: unified.updatedAt, runtime: unifiedOperationalRuntime(unified.runtime) };
  return getAwarenessRuntimeInTransaction(connection, battleId, options);
}
export function getBattleOperationalRuntime(battleId: string): Promise<BattleOperationalSnapshot | null> {
  return getBattleOperationalRuntimeInTransaction({ query }, battleId);
}
export async function writeUnifiedOperationalBudget(connection: DatabaseConnection, battleId: string, expectedRevision: number, reservations: AwarenessReservation[], now: string): Promise<boolean> {
  const current = await getUnifiedRuntimeInTransaction(connection, battleId, { lock: true });
  if (!current) return false;
  if (current.revision !== expectedRevision) throw new Error("CONSCIOUSNESS_REVISION_OR_LEASE_CONFLICT");
  await writeUnifiedRuntime(connection, current, { ...current.runtime, budget: budgetSnapshot(reservations) }, now);
  return true;
}
function validateSettlement(input: AwarenessAttemptSettlement & { finishedAt: number }): void {
  if (!Number.isFinite(input.finishedAt) || input.finishedAt < 0 || (input.actualUsd !== null && (!Number.isFinite(input.actualUsd) || input.actualUsd < 0)) ||
    (input.outcome === "settled" ? input.actualUsd === null || input.physicalOutstanding : input.actualUsd !== null)) throw new Error("CONSCIOUSNESS_SETTLEMENT_INVALID");
}
export async function settleBattleOperationalAttemptInTransaction(connection: DatabaseConnection, input: AwarenessAttemptSettlement & { battleId: string; finishedAt: number }): Promise<BattleOperationalSnapshot> {
  const current = await getUnifiedRuntimeInTransaction(connection, input.battleId, { lock: true });
  if (!current) return settleAwarenessAttemptInTransaction(connection, input);
  validateSettlement(input);
  const reservation = current.runtime.budget.reservations.find((item) => item.id === input.id);
  if (!reservation) throw new Error("CONSCIOUSNESS_RESERVATION_NOT_FOUND");
  if ((!reservation.physicalOutstanding && input.physicalOutstanding) ||
    (reservation.status === "settled" && (input.outcome !== "settled" || reservation.actualUsd !== input.actualUsd))) throw new Error("CONSCIOUSNESS_SETTLEMENT_CONFLICT");
  const reservations = current.runtime.budget.reservations.map((item) => item.id !== input.id ? item : {
    ...item, status: input.outcome, actualUsd: input.actualUsd, physicalOutstanding: input.physicalOutstanding,
  });
  const saved = await writeUnifiedRuntime(connection, current, { ...current.runtime, budget: budgetSnapshot(reservations) }, new Date(input.finishedAt).toISOString());
  return { battleId: saved.battleId, revision: saved.revision, fencingToken: saved.fencingToken, updatedAt: saved.updatedAt, runtime: unifiedOperationalRuntime(saved.runtime) };
}
export function settleBattleOperationalAttempt(input: AwarenessAttemptSettlement & { battleId: string; finishedAt: number }): Promise<BattleOperationalSnapshot> {
  return withTransaction((connection) => settleBattleOperationalAttemptInTransaction(connection, input));
}
