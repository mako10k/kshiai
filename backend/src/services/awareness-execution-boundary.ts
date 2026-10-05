// R: Apply subjective readiness, cancellation and physical-timeout rules at a tick boundary.
import { AwarenessApplyConsciousReady, AwarenessCancelGeneration, type AwarenessCharacterState, type AwarenessPipelineState } from "@kshiai/shared";
import type { AwarenessExecutionContext, AwarenessPrepareTickInput } from "./awareness-execution.js";
function mergeReady(state: AwarenessCharacterState, cutoff: number | null, tick: number, readyId: string | null): AwarenessCharacterState {
  if (cutoff !== tick && readyId && state.job?.id === readyId && state.job.sourceTick <= tick) {
    const next = AwarenessApplyConsciousReady(state, tick);
    return { ...next, execution: { ...next.execution, consecutiveConsciousFailures: 0 } };
  }
  return state;
}
function recordPending(state: AwarenessCharacterState, context: AwarenessExecutionContext): AwarenessCharacterState {
  return { ...state, execution: { ...state.execution,
    pendingSpeech: state.execution.pendingSpeech || context.receivedSpeech,
    pendingInvalid: state.execution.pendingInvalid || context.intentInvalid,
    pendingCompleted: state.execution.pendingCompleted || context.intentCompleted } };
}
function cancelInvalid(state: AwarenessCharacterState, context: AwarenessExecutionContext, tick: number): AwarenessCharacterState {
  if (context.intentInvalid && state.job && (state.job.status === "running" || state.job.status === "ready") &&
      (state.execution.lastCancelTick === null || tick - state.execution.lastCancelTick >= 3)) {
    const next = AwarenessCancelGeneration(state);
    return { ...next, execution: { ...next.execution, lastCancelTick: tick } };
  }
  return state;
}
function recordFailure(state: AwarenessCharacterState): AwarenessCharacterState {
  const job = state.job;
  if (job && (job.status === "failed" || job.status === "expired") && state.execution.lastFailureJobId !== job.id) {
    return { ...state, execution: { ...state.execution, lastFailureJobId: job.id,
      consecutiveConsciousFailures: state.execution.consecutiveConsciousFailures + 1, pendingReconsider: true } };
  }
  return state;
}
function observeOutstanding(state: AwarenessCharacterState, tick: number, now: () => number): AwarenessCharacterState {
  const job = state.job;
  if (job && job.physicalStatus === "outstanding" && now() >= job.deadlineAt) {
    if (state.conscious.updatedTick === null) throw new Error("AWARENESS_INITIAL_THOUGHT_DEADLINE");
    const unknownSinceTick = state.execution.unknownSinceTick ?? tick;
    const unknownSinceAt = state.execution.unknownSinceAt ?? now();
    const next = { ...state, execution: { ...state.execution, unknownSinceTick, unknownSinceAt } };
    if (tick - unknownSinceTick >= 3 || now() - unknownSinceAt >= 5000) throw new Error("AWARENESS_PHYSICAL_SLOT_UNKNOWN");
    return next;
  }
  if (job?.physicalStatus !== "outstanding") return { ...state, execution: { ...state.execution, unknownSinceTick: null, unknownSinceAt: null } };
  return state;
}
function assertConsciousHealth(state: AwarenessCharacterState, now: () => number): void {
  if (state.execution.consecutiveConsciousFailures >= 2) throw new Error("AWARENESS_CONSCIOUS_FAILURE_LIMIT");
  const job = state.job;
  if (job && state.conscious.updatedTick === null && now() >= job.deadlineAt && job.status !== "applied") {
    throw new Error("AWARENESS_INITIAL_THOUGHT_DEADLINE");
  }
}
export function applyAwarenessTickBoundary(state: AwarenessPipelineState, input: AwarenessPrepareTickInput, readyIds: Record<"a" | "b", string | null>, now: () => number): AwarenessPipelineState {
  const sides = { ...state.sides };
  for (const side of ["a", "b"] as const) {
    let next = mergeReady(sides[side], state.cutoffTick, input.tick, readyIds[side]);
    next = recordPending(next, input.sides[side]);
    next = cancelInvalid(next, input.sides[side], input.tick);
    next = recordFailure(next);
    next = observeOutstanding(next, input.tick, now);
    assertConsciousHealth(next, now);
    sides[side] = next;
  }
  return { ...state, tick: input.tick, preparedTick: input.tick, cutoffTick: state.cutoffTick === input.tick ? state.cutoffTick : null, sides };
}
export function hasAwarenessExpiry(state: AwarenessCharacterState, tick: number): boolean {
  return state.desires.some((item) => item.validUntilTick <= tick) || state.latent.tendencies.some((item) => item.validUntilTick <= tick);
}
export function assertAwarenessTickLimit(runtime: AwarenessPipelineState, tick: number, now: () => number): void {
  if (!Number.isSafeInteger(tick) || tick < runtime.tick || tick > runtime.policy.maxTicks || now() >= runtime.deadlineAt) {
    throw new Error("AWARENESS_TICK_OR_TIME_LIMIT");
  }
}
function thoughtRequested(state: AwarenessCharacterState, tick: number, policy: AwarenessPipelineState["policy"]): boolean {
  const execution = state.execution;
  return execution.lastConsciousStartTick === null || execution.pendingReconsider || execution.pendingSpeech || execution.pendingInvalid ||
    execution.pendingCompleted || (state.conscious.updatedTick !== null && tick - state.conscious.updatedTick >= policy.consciousReassessmentTicks);
}
function thoughtIntervalAllowed(state: AwarenessCharacterState, tick: number, policy: AwarenessPipelineState["policy"]): boolean {
  const execution = state.execution;
  return execution.lastConsciousStartTick === null || execution.pendingSpeech || execution.pendingInvalid ||
    (execution.lastConsciousStartTick !== null && tick - execution.lastConsciousStartTick >= policy.consciousMinIntervalTicks);
}
export function shouldStartAwarenessThought(runtime: AwarenessPipelineState, side: "a" | "b", tick: number): boolean {
  const state = runtime.sides[side];
  const job = state.job;
  if (runtime.status !== "active" || (job && (job.status === "running" || job.status === "ready" || job.physicalStatus === "outstanding"))) return false;
  return thoughtRequested(state, tick, runtime.policy) && thoughtIntervalAllowed(state, tick, runtime.policy);
}
