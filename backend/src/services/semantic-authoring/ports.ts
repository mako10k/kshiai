import type {
  SemanticAuthoringAccountingV1,
  SemanticAuthoringPolicyV1,
  SemanticAuthoringReservationV1,
  SemanticAuthoringRunV1,
  SemanticAuthoringStateV1,
} from "@kshiai/shared";
import type { ReservationAdmissionV1 } from "./accounting.js";
import {
  chargeOutstandingReservationV1,
  failSemanticAuthoringV1,
  guardSemanticAuthoringRunningV1,
  semanticAuthoringControlFailureV1,
  type SemanticAuthoringOrchestrationV1,
} from "./orchestration.js";

export interface SemanticAuthoringClockPortV1 {
  nowMs(): number;
}

export interface SemanticAuthoringAccountingPortV1 {
  admit(
    policy: SemanticAuthoringPolicyV1,
    accounting: SemanticAuthoringAccountingV1,
    outstanding: readonly SemanticAuthoringReservationV1[],
    requested: SemanticAuthoringReservationV1,
  ): ReservationAdmissionV1;
}

export interface SemanticAuthoringProviderPortV1 {
  recordDispatch(
    reservation: SemanticAuthoringReservationV1,
    dispatchedAtMs: number,
  ): void;
  dispatchedAtMs(requestId: string): number | null;
  abandon(requestId: string): void;
}

export interface SemanticAuthoringFencePortV1 {
  owns(fence: SemanticAuthoringRunV1["executionFence"]): boolean;
}

export type SemanticAuthoringPortsV1 = Readonly<{
  clock: SemanticAuthoringClockPortV1;
  accounting: SemanticAuthoringAccountingPortV1;
  provider: SemanticAuthoringProviderPortV1;
  fence: SemanticAuthoringFencePortV1;
}>;

export type SemanticAuthoringScheduleResultV1<C, O, F, W, Q, FC> =
  | Readonly<{
      status: "scheduled";
      state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>;
    }>
  | Readonly<{
      status: "not_admitted";
      exhausted: Extract<ReservationAdmissionV1, { admitted: false }>["exhausted"];
      state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>;
    }>
  | SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC>;

export type SemanticAuthoringDeliveryResultV1<C, O, F, W, Q, FC> =
  | Readonly<{
      status: "accepted";
      state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>;
    }>
  | Readonly<{
      status: "rejected";
      reason: "late_result" | "fence_mismatch" | "not_outstanding";
      state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>;
    }>
  | SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC>;

function outstandingTimedOut<C, O, F, W, Q, FC>(
  state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>,
  ports: SemanticAuthoringPortsV1,
): boolean {
  const reservation = state.outstandingReservation;
  if (!reservation) {
    return false;
  }
  const dispatchedAtMs = ports.provider.dispatchedAtMs(reservation.requestId);
  if (dispatchedAtMs === null) {
    return true;
  }
  const elapsed = Math.max(0, ports.clock.nowMs() - dispatchedAtMs);
  return (
    elapsed >= reservation.elapsedMs ||
    state.accounting.elapsedMs + elapsed >= state.policy.maxAttemptElapsedMs
  );
}

function abandonOutstanding<C, O, F, W, Q, FC>(
  state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>,
  ports: SemanticAuthoringPortsV1,
): void {
  const reservation = state.outstandingReservation;
  if (reservation) {
    ports.provider.abandon(reservation.requestId);
  }
}

export function scheduleSemanticAuthoringReservationV1<C, O, F, W, Q, FC>(
  state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>,
  reservation: SemanticAuthoringReservationV1,
  ports: SemanticAuthoringPortsV1,
): SemanticAuthoringScheduleResultV1<C, O, F, W, Q, FC> {
  const guarded = guardSemanticAuthoringRunningV1(state);
  if (guarded) {
    return guarded;
  }
  const outstanding = state.outstandingReservation ? [state.outstandingReservation] : [];
  const admission = ports.accounting.admit(
    state.policy,
    state.accounting,
    outstanding,
    reservation,
  );
  if (!admission.admitted) {
    return { status: "not_admitted", exhausted: admission.exhausted, state };
  }
  ports.provider.recordDispatch(reservation, ports.clock.nowMs());
  return {
    status: "scheduled",
    state: { ...state, outstandingReservation: reservation },
  };
}

export function expireOutstandingSemanticAuthoringV1<C, O, F, W, Q, FC>(
  state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>,
  ports: SemanticAuthoringPortsV1,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> {
  if (state.terminalResult) {
    return { status: "terminal", state };
  }
  const controlFailure = semanticAuthoringControlFailureV1(state);
  if (state.outstandingReservation && (controlFailure || outstandingTimedOut(state, ports))) {
    abandonOutstanding(state, ports);
    return failSemanticAuthoringV1(
      state,
      controlFailure ?? "resource_exhausted",
    );
  }
  const guarded = guardSemanticAuthoringRunningV1(state);
  if (guarded) {
    return guarded;
  }
  return { status: "continue", state };
}

export function acceptSemanticAuthoringDeliveryV1<C, O, F, W, Q, FC>(
  state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>,
  requestId: string,
  ports: SemanticAuthoringPortsV1,
): SemanticAuthoringDeliveryResultV1<C, O, F, W, Q, FC> {
  if (state.terminalResult) {
    return { status: "rejected", reason: "late_result", state };
  }
  if (!ports.fence.owns(state.run.executionFence)) {
    return { status: "rejected", reason: "fence_mismatch", state };
  }
  const reservation = state.outstandingReservation;
  if (!reservation || reservation.requestId !== requestId) {
    return { status: "rejected", reason: "not_outstanding", state };
  }
  const controlFailure = semanticAuthoringControlFailureV1(state);
  if (controlFailure || outstandingTimedOut(state, ports)) {
    abandonOutstanding(state, ports);
    return failSemanticAuthoringV1(state, controlFailure ?? "resource_exhausted");
  }
  ports.provider.abandon(requestId);
  return { status: "accepted", state: chargeOutstandingReservationV1(state) };
}
