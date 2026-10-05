// R: Validate execution admission proofs against the battle's bound accounting policy.
import type { AwarenessPipelineState } from "@kshiai/shared";
import type { AwarenessDispatchProof } from "./awareness-execution.js";
function assertObserved(proof: AwarenessDispatchProof): void {
  if (proof.mode !== "observed" || proof.verifiedFullPrompt || proof.inputTokens !== null || proof.maximumChargeUsd !== null) {
    throw new Error("AWARENESS_OBSERVED_ADMISSION_REQUIRED");
  }
}
function assertCertified(proof: AwarenessDispatchProof, inputLimit: number): void {
  if (proof.mode === "observed" || !proof.verifiedFullPrompt || !Number.isSafeInteger(proof.inputTokens) ||
      proof.inputTokens < 0 || proof.inputTokens > inputLimit || !Number.isFinite(proof.maximumChargeUsd) || proof.maximumChargeUsd < 0) {
    throw new Error("AWARENESS_VERIFIED_ADMISSION_REQUIRED");
  }
}
export function verifyAwarenessExecutionProof(proof: AwarenessDispatchProof | null, policy: AwarenessPipelineState["policy"], role: "subconscious" | "conscious"): AwarenessDispatchProof {
  const limits = policy.roles[role];
  if (!proof || !proof.requestDigest || proof.outputTokenLimit !== limits.outputTokens) throw new Error("AWARENESS_VERIFIED_ADMISSION_REQUIRED");
  if (policy.accountingMode === "observed") assertObserved(proof);
  else assertCertified(proof, limits.inputTokens);
  return proof;
}
