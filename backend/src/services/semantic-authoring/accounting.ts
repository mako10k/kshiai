import type {
  SemanticAuthoringAccountingV1,
  SemanticAuthoringPolicyV1,
  SemanticAuthoringReservationV1,
} from "@kshiai/shared";

export type ReservationAdmissionV1 =
  | Readonly<{ admitted: true }>
  | Readonly<{
      admitted: false;
      exhausted:
        | "concurrency"
        | "llm_calls"
        | "elapsed"
        | "input_tokens"
        | "output_tokens"
        | "cost"
        | "per_call_input"
        | "per_call_output"
        | "per_call_elapsed";
    }>;

export type CountedStepResultV1 =
  | Readonly<{ accepted: true; accounting: SemanticAuthoringAccountingV1 }>
  | Readonly<{
      accepted: false;
      exhausted: "counted_steps";
      accounting: SemanticAuthoringAccountingV1;
    }>;

export function countSemanticAuthoringStepV1(
  policy: SemanticAuthoringPolicyV1,
  accounting: SemanticAuthoringAccountingV1,
): CountedStepResultV1 {
  if (accounting.countedSteps >= policy.maxCountedSteps) {
    return { accepted: false, exhausted: "counted_steps", accounting };
  }
  return {
    accepted: true,
    accounting: { ...accounting, countedSteps: accounting.countedSteps + 1 },
  };
}

export function admitSemanticAuthoringReservation(
  policy: SemanticAuthoringPolicyV1,
  accounting: SemanticAuthoringAccountingV1,
  outstanding: readonly SemanticAuthoringReservationV1[],
  requested: SemanticAuthoringReservationV1,
): ReservationAdmissionV1 {
  if (outstanding.length >= policy.maxConcurrentProviderRequests) {
    return { admitted: false, exhausted: "concurrency" };
  }
  if (
    requested.inputTokens > policy.maxInputTokensPerCall ||
    requested.inputBytes > policy.maxInputBytesPerCall
  ) {
    return { admitted: false, exhausted: "per_call_input" };
  }
  if (
    requested.outputTokens > policy.maxOutputTokensPerCall ||
    requested.outputBytes > policy.maxOutputBytesPerCall
  ) {
    return { admitted: false, exhausted: "per_call_output" };
  }
  if (requested.elapsedMs > policy.maxProviderCallElapsedMs) {
    return { admitted: false, exhausted: "per_call_elapsed" };
  }

  const reserved = outstanding.reduce(
    (sum, reservation) => ({
      inputTokens: sum.inputTokens + reservation.inputTokens,
      outputTokens: sum.outputTokens + reservation.outputTokens,
      costMicroUsd: sum.costMicroUsd + reservation.costMicroUsd,
      elapsedMs: sum.elapsedMs + reservation.elapsedMs,
    }),
    { inputTokens: 0, outputTokens: 0, costMicroUsd: 0, elapsedMs: 0 },
  );

  if (accounting.llmCalls + outstanding.length + 1 > policy.maxLlmCalls) {
    return { admitted: false, exhausted: "llm_calls" };
  }
  if (
    accounting.elapsedMs + reserved.elapsedMs + requested.elapsedMs >
    policy.maxAttemptElapsedMs
  ) {
    return { admitted: false, exhausted: "elapsed" };
  }
  if (
    accounting.inputTokens + reserved.inputTokens + requested.inputTokens >
    policy.maxCumulativeInputTokens
  ) {
    return { admitted: false, exhausted: "input_tokens" };
  }
  if (
    accounting.outputTokens + reserved.outputTokens + requested.outputTokens >
    policy.maxCumulativeOutputTokens
  ) {
    return { admitted: false, exhausted: "output_tokens" };
  }
  if (
    accounting.costMicroUsd + reserved.costMicroUsd + requested.costMicroUsd >
    policy.maxCostMicroUsd
  ) {
    return { admitted: false, exhausted: "cost" };
  }
  return { admitted: true };
}
