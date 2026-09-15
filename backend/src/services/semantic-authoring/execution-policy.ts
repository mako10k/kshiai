import type { SemanticAuthoringPolicyV1 } from "@kshiai/shared";

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
