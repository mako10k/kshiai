import type { BattleOperationalRuntime } from "./battle-operational-runtime.js";
// R: Apply identical physical-attempt reservation bounds and accounting aggregates across authorized storage paths.
import type { AwarenessPipelineState, AwarenessReservation, AwarenessRole } from "@kshiai/shared";

export function budgetSnapshot(reservations: AwarenessReservation[]) {
  return {
    physicalAttempts: reservations.length,
    physicalOutstanding: reservations.filter((item) => item.physicalOutstanding).length,
    reservedUsd: reservations.reduce((sum, item) => sum + (item.status === "settled" ? 0 : item.maximumUsd ?? 0), 0),
    settledUsd: reservations.reduce((sum, item) => sum + (item.status === "settled" ? item.actualUsd ?? 0 : 0), 0),
    unknownAttemptIds: reservations.filter((item) => item.status === "unknown" || item.status === "cancelled" ||
      (item.status !== "settled" && item.maximumUsd === null)).map((item) => item.id),
    reservations,
  } satisfies AwarenessPipelineState["budget"];
}

function roleGroup(role: AwarenessRole): keyof AwarenessPipelineState["policy"]["budgetShares"] {
  return role === "subconscious" || role === "adjudication" ? "required" : role;
}

function validateReservationWindow(state: BattleOperationalRuntime, input: { now: string }, attempt: { role: AwarenessRole }): void {
  if (state.status !== "active" && !(state.status === "terminal" && attempt.role === "narration" && state.terminalAt !== null &&
      Date.parse(input.now) < Math.min(state.deadlineAt, state.terminalAt + state.policy.narration.terminalDrainMs))) throw new Error("AWARENESS_RUNTIME_INACTIVE");
  const now = Date.parse(input.now);
  if (now >= state.deadlineAt || now < state.startedAt) throw new Error("AWARENESS_DISPATCH_DEADLINE");
}

function validateReservationBudget(state: BattleOperationalRuntime, attempt: { id: string; role: AwarenessRole; maximumUsd: number | null }): void {
  const observed = state.policy.accountingMode === "observed";
  if (!observed && attempt.maximumUsd === null) throw new Error("AWARENESS_VERIFIED_ADMISSION_REQUIRED");
  const reservations = state.budget.reservations;
  if (reservations.some((item) => item.id === attempt.id)) throw new Error("AWARENESS_ATTEMPT_ALREADY_RESERVED");
  const group = roleGroup(attempt.role);
  const roleSpend = reservations.filter((item) => roleGroup(item.role) === group)
    .reduce((sum, item) => sum + (item.status === "settled" ? item.actualUsd ?? 0 : item.maximumUsd ?? 0), 0);
  const outstanding = reservations.filter((item) => item.physicalOutstanding);
  if (state.budget.physicalAttempts >= state.policy.maxPhysicalAttempts || state.budget.physicalOutstanding >= state.policy.maxPhysicalConcurrent ||
      outstanding.filter((item) => item.role === attempt.role).length >= state.policy.roles[attempt.role].concurrent ||
      (!observed && (state.budget.reservedUsd + state.budget.settledUsd + (attempt.maximumUsd ?? 0) > state.policy.maxCostUsd ||
        roleSpend + (attempt.maximumUsd ?? 0) > state.policy.maxCostUsd * state.policy.budgetShares[group]))) {
    throw new Error("AWARENESS_BUDGET_ADMISSION_REJECTED");
  }
}

export function validateReservationAdmission(state: BattleOperationalRuntime, input: { now: string }, attempt: { id: string; role: AwarenessRole; maximumUsd: number | null }): void {
  validateReservationWindow(state, input, attempt);
  validateReservationBudget(state, attempt);
}
