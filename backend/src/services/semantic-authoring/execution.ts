import { randomUUID } from "node:crypto";
import type {
  SemanticAuthoringAdapterV1,
  SemanticAuthoringAccountingV1,
  SemanticAuthoringPolicyV1,
  ProviderTransportPolicyV1,
  SemanticAuthoringReservationV1,
  SemanticAuthoringResolverResultV1,
  SemanticAuthoringRunV1,
  SemanticAuthoringStateV1,
  SemanticProposalV1,
} from "@kshiai/shared";
import { admitSemanticAuthoringReservation } from "./accounting.js";
import {
  applySemanticAuthoringProposalV1,
  failSemanticAuthoringV1,
  selectSemanticAuthoringWorkV1,
  startSemanticAuthoringV1,
  type SemanticAuthoringKernelIssuesV1,
} from "./orchestration.js";
import {
  acceptSemanticAuthoringDeliveryV1,
  scheduleSemanticAuthoringReservationV1,
  type SemanticAuthoringPortsV1,
} from "./ports.js";

export type FocusedProviderRequestV1 = Readonly<{
  system: string;
  context: string;
}>;

export type PreparedFocusedRequestV1 = Readonly<{
  body: string;
  reservation: SemanticAuthoringReservationV1;
  providerRoute: string;
}>;

export type FocusedUsageV1 = Readonly<{ inputTokens: number; outputTokens: number; costMicroUsd: number }>;
export type FocusedProviderReplyV1 = Readonly<{ content: string; usage?: FocusedUsageV1 }>;

export interface FocusedProviderTransportV1 {
  readonly pricingIdentity: string;
  readonly tokenEstimatorIdentity: string;
  readonly transportPolicy: ProviderTransportPolicyV1;
  prepare(request: FocusedProviderRequestV1, requestId: string,
    policy: SemanticAuthoringPolicyV1): PreparedFocusedRequestV1;
  exchange(request: PreparedFocusedRequestV1, signal: AbortSignal): Promise<FocusedProviderReplyV1>;
}

export interface SemanticAuthoringExecutionPersistenceV1<FinalCandidate, Question> {
  // These operations must check the current owner fence. No send precedes reserve.
  reserve(request: PreparedFocusedRequestV1): Promise<boolean>;
  settle(requestId: string, outcome: "received" | "invalid" | "failed" | "provider_transport_timeout", elapsedMs?: number,
    usage?: FocusedUsageV1): Promise<boolean>;
  owns(): Promise<boolean>;
  finish(result: SemanticAuthoringResolverResultV1<FinalCandidate, Question>): Promise<boolean>;
}

export type SemanticAuthoringExecutionOutcomeV1<FC, Q> =
  | Readonly<{ status: "saved"; result: SemanticAuthoringResolverResultV1<FC, Q> }>
  | Readonly<{ status: "lost_ownership" }>
  | Readonly<{ status: "invalid_source" }>;

/** The shared asynchronous execution path. Domain context remains adapter-owned. */
export async function executeSemanticAuthoringV1<S, C, O, W, P, F, Q, A, FC>(input: {
  adapter: SemanticAuthoringAdapterV1<S, C, O, W, SemanticProposalV1<P>, F, Q, A, FC>;
  run: SemanticAuthoringRunV1;
  policy: SemanticAuthoringPolicyV1;
  frozenSource: S;
  provider: FocusedProviderTransportV1;
  persistence: SemanticAuthoringExecutionPersistenceV1<FC, Q>;
  project(state: SemanticAuthoringStateV1<C, O, F, W, Q, FC>, source: S): FocusedProviderRequestV1;
  issues: SemanticAuthoringKernelIssuesV1<F>;
  initialAccounting?: SemanticAuthoringAccountingV1;
  nowMs?: () => number;
}): Promise<SemanticAuthoringExecutionOutcomeV1<FC, Q>> {
  const { adapter, policy, provider, persistence } = input;
  if (input.run.pricingIdentity !== provider.pricingIdentity
    || policy.pricingIdentity !== provider.pricingIdentity
    || input.run.tokenEstimatorIdentity !== provider.tokenEstimatorIdentity
    || policy.tokenEstimatorIdentity !== provider.tokenEstimatorIdentity) {
    throw new Error("SEMANTIC_AUTHORING_PROVIDER_IDENTITY_MISMATCH");
  }
  if (!Number.isSafeInteger(provider.transportPolicy.timeoutMs)
    || provider.transportPolicy.timeoutMs <= 0
    || ![0, 1].includes(provider.transportPolicy.maxRecoveriesPerWorkItem)) {
    throw new Error("SEMANTIC_AUTHORING_INVALID_TRANSPORT_POLICY");
  }
  const started = startSemanticAuthoringV1(adapter, input.run, policy, input.frozenSource);
  if (!started.accepted) return { status: "invalid_source" };
  let state = input.initialAccounting
    ? { ...started.state, accounting: input.initialAccounting }
    : started.state;
  const nowMs = input.nowMs ?? Date.now;
  const beganAt = nowMs();
  const dispatches = new Map<string, number>();
  const ports: SemanticAuthoringPortsV1 = {
    clock: { nowMs },
    accounting: { admit: admitSemanticAuthoringReservation },
    provider: {
      timeoutMs: provider.transportPolicy.timeoutMs,
      maxRecoveriesPerWorkItem: provider.transportPolicy.maxRecoveriesPerWorkItem,
      recordDispatch: (request, at) => { dispatches.set(request.requestId, at); },
      dispatchedAtMs: (id) => dispatches.get(id) ?? null,
      abandon: (id) => { dispatches.delete(id); },
    },
    // Durable ownership is checked immediately before receiving/applying a result.
    fence: { owns: () => true },
  };
  const fail = (category: "technical_failure" | "resource_exhausted") => {
    state = failSemanticAuthoringV1(state, category).state;
  };
  while (!state.terminalResult) {
    if (!await persistence.owns()) return { status: "lost_ownership" };
    if (!state.activeWorkItem || state.capabilitySession?.revoked) {
      const selected = selectSemanticAuthoringWorkV1(state, adapter, {
        workItemId: randomUUID(), capabilitySessionId: randomUUID(),
        questionId: randomUUID(), nowMs: nowMs(),
        expiresAtMs: nowMs() + provider.transportPolicy.timeoutMs,
      });
      state = selected.state;
      if (state.terminalResult) break;
    }
    let request: PreparedFocusedRequestV1;
    try {
      request = provider.prepare(input.project(state, input.frozenSource), randomUUID(), policy);
    } catch {
      // Size/budget rejection is reported by admission below. A failed projector
      // or request encoder is a technical failure, not evidence of budget use.
      fail("technical_failure"); break;
    }
    const scheduled = scheduleSemanticAuthoringReservationV1(state, request.reservation, ports);
    state = scheduled.state;
    if (scheduled.status !== "scheduled") {
      if (!state.terminalResult) fail("resource_exhausted");
      break;
    }
    if (!await persistence.reserve(request)) return { status: "lost_ownership" };
    const dispatchedAt = nowMs();
    let reply: FocusedProviderReplyV1;
    let timedOut = false;
    try {
      // Enforce the deadline even if an injected/provider transport ignores cancellation.
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        reply = await Promise.race([
          provider.exchange(request, controller.signal),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort(); reject(new Error("SEMANTIC_AUTHORING_TIMEOUT"));
            }, provider.transportPolicy.timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        controller.abort();
      }
    } catch {
      // Ambiguous consumption is never retried or refunded to zero.
      if (!await persistence.settle(request.reservation.requestId,
        timedOut ? "provider_transport_timeout" : "failed",
        Math.max(0, nowMs() - dispatchedAt))) {
        return { status: "lost_ownership" };
      }
      if (timedOut) {
        state = failSemanticAuthoringV1(state, "provider_transport_unavailable",
          provider.transportPolicy.maxRecoveriesPerWorkItem === 0
            ? "policy_disallows_recovery" : "no_admissible_recovery_basis",
          Math.max(0, nowMs() - dispatchedAt)).state;
      } else {
        fail("technical_failure");
      }
      break;
    }
    if (!await persistence.owns()) return { status: "lost_ownership" };
    const delivery = acceptSemanticAuthoringDeliveryV1(state, request.reservation.requestId, ports);
    state = delivery.state;
    if (delivery.status !== "accepted") {
      if (delivery.status === "terminal") {
        const timedOutAtDelivery = state.terminalResult?.kind === "failed"
          && state.terminalResult.receipt.category === "provider_transport_unavailable";
        if (!await persistence.settle(request.reservation.requestId,
          timedOutAtDelivery ? "provider_transport_timeout" : "failed",
          Math.max(0, nowMs() - dispatchedAt))) return { status: "lost_ownership" };
      }
      if (!state.terminalResult) fail("resource_exhausted");
      break;
    }
    const measuredElapsedMs = Math.max(0, nowMs() - dispatchedAt);
    const usage = reply.usage;
    const reserved = request.reservation;
    // Reject an untrusted receipt as a refund; unknown consumption stays fully charged.
    const trustedUsage = usage && [usage.inputTokens, usage.outputTokens, usage.costMicroUsd]
      .every((value) => Number.isSafeInteger(value) && value >= 0)
      && usage.inputTokens <= reserved.inputTokens && usage.outputTokens <= reserved.outputTokens
      && usage.costMicroUsd <= reserved.costMicroUsd ? usage : undefined;
    state = { ...state, accounting: {
      ...state.accounting,
      ...(trustedUsage ? {
        inputTokens: state.accounting.inputTokens - reserved.inputTokens + trustedUsage.inputTokens,
        outputTokens: state.accounting.outputTokens - reserved.outputTokens + trustedUsage.outputTokens,
        costMicroUsd: state.accounting.costMicroUsd - reserved.costMicroUsd + trustedUsage.costMicroUsd,
      } : {}),
      // Time is observed locally. Missing/invalid usage keeps the full reservation.
      elapsedMs: (input.initialAccounting?.elapsedMs ?? 0) + Math.max(0, nowMs() - beganAt),
    } };
    let proposal: unknown = null;
    if (Buffer.byteLength(reply.content, "utf8") <= policy.maxOutputBytesPerCall) {
      try { proposal = JSON.parse(reply.content); } catch { /* passed as an invalid proposal */ }
    }
    const decoded = state.activeWorkItem && adapter.decodeProposal(state.activeWorkItem, proposal);
    if (!await persistence.settle(request.reservation.requestId,
      decoded && decoded.accepted ? "received" : "invalid", measuredElapsedMs, trustedUsage)) return { status: "lost_ownership" };
    // Invalid JSON/schema goes through the same bounded focused recovery loop.
    state = applySemanticAuthoringProposalV1(state, adapter, proposal, nowMs(), input.issues).state;
  }
  const result = state.terminalResult;
  if (!result) throw new Error("SEMANTIC_AUTHORING_TERMINAL_MISSING");
  return await persistence.finish(result)
    ? { status: "saved", result }
    : { status: "lost_ownership" };
}
