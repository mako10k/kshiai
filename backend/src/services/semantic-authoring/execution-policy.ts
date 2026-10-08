/** R: Select immutable semantic authoring resource limits from the frozen run policy. */
import type { SemanticAuthoringModeV1, SemanticAuthoringPolicyV1 } from "@kshiai/shared";

// Accepted D11 design revision 5. Time boundaries are separate explicit policies.
export function semanticAuthoringExecutionPolicyV1(
  pricingIdentity: string,
  tokenEstimatorIdentity = "utf8-byte-upper-bound-v1",
): SemanticAuthoringPolicyV1 {
  return {
    identity: "semantic_authoring_policy_v1",
    maxConcurrentProviderRequests: 1,
    maxLlmCalls: 8,
    maxCountedSteps: 48,
    maxInputTokensPerCall: 6_000,
    maxInputBytesPerCall: 24_576,
    maxOutputTokensPerCall: 1_500,
    maxOutputBytesPerCall: 6_144,
    maxCumulativeInputTokens: 32_000,
    maxCumulativeOutputTokens: 8_000,
    maxCostMicroUsd: 500_000,
    maxProgressObservations: 8,
    maxRecoveryStrategyChanges: 2,
    pricingIdentity,
    tokenEstimatorIdentity,
  };
}

/** Accepted ADR0059: profile generation and claim validation share this run's budget. */
export function characterAuthoringExecutionPolicyV2(
  mode: SemanticAuthoringModeV1,
  pricingIdentity: string,
  tokenEstimatorIdentity = "utf8-byte-upper-bound-v1",
): SemanticAuthoringPolicyV1 {
  const previous = semanticAuthoringExecutionPolicyV1(pricingIdentity, tokenEstimatorIdentity);
  return mode === "migrate" ? previous : {
    ...previous,
    identity: "character_complete_review_policy_v2",
    maxLlmCalls: 10,
  };
}

/** Restore recorded policy identity; never upgrade an already registered run. */
export function frozenCharacterAuthoringExecutionPolicyV1(run: Readonly<{
  policyIdentity: string;
  mode: SemanticAuthoringModeV1;
  pricingIdentity: string;
  tokenEstimatorIdentity: string;
}>): SemanticAuthoringPolicyV1 {
  if (run.policyIdentity === "semantic_authoring_policy_v1") {
    return semanticAuthoringExecutionPolicyV1(run.pricingIdentity, run.tokenEstimatorIdentity);
  }
  if (run.policyIdentity === "character_complete_review_policy_v2" && run.mode !== "migrate") {
    return characterAuthoringExecutionPolicyV2(run.mode, run.pricingIdentity, run.tokenEstimatorIdentity);
  }
  throw new Error("FOCUSED_CHARACTER_POLICY_INVALID");
}
