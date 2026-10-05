import { CurrentAwarenessPromptRevision } from "@kshiai/shared";
// R: Bind accounted model roles and immutable admission policy to durable awareness execution.
import { withLlmPhysicalCompletion } from "../llm/llm-physical-completion.js";
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import { AwarenessNormalPolicy, type AwarenessPolicyV1 } from "@kshiai/shared";
import { createAwarenessExecutionAdmission, type AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";
import type { AwarenessProviderRoles } from "../llm/awareness-provider-factory.js";
import { prepareAwarenessRequest, type AwarenessRequestInput } from "../llm/awareness-request.js";
import { requestDigest } from "./distributed-guard.js";
import { createAwarenessExecution, type AwarenessDispatchProof } from "./awareness-execution.js";
import { awarenessExecutionStorage } from "./awareness-execution-storage.js";
import { createAwarenessClock } from "./awareness-clock.js";

export function createConfiguredAwarenessExecution(
  roles: AwarenessProviderRoles,
  contracts: readonly AwarenessVerifiedBillingContract[],
  policy: AwarenessPolicyV1 = AwarenessNormalPolicy,
  battleId?: string,
  promptRevision: string = CurrentAwarenessPromptRevision,
) {
  const latent = { provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" };
  const conscious = roles.adjudication.identity;
  const validateDispatch = (request: AwarenessRequestInput, proof: AwarenessDispatchProof) => {
    const identity = request.role === "subconscious" ? latent : conscious;
    const model = request.role === "subconscious" ? identity.fastModel : identity.engineModel;
    const digest = requestDigest({ provider: identity.provider, model, ...prepareAwarenessRequest(request, policy, promptRevision) });
    if (proof.requestDigest !== digest) throw new Error("AWARENESS_DISPATCH_PROOF_MISMATCH");
  };
  return createAwarenessExecution({
    storage: awarenessExecutionStorage,
    clock: createAwarenessClock(),
    admission: createAwarenessExecutionAdmission({ latent, conscious, contracts, policy, promptRevision }),
    models: {
      async subconscious(input, proof) {
        validateDispatch({ role: "subconscious", input }, proof);
        const output = await withLlmPhysicalCompletion(() => (battleId
          ? withLlmUsageScope({ battleId, role: "subconscious", side: input.side, tick: input.tick }, () => roles.models.subconscious(input, promptRevision, policy))
          : roles.models.subconscious(input, promptRevision, policy)));
        return { output, actualUsd: null, physicalClosed: true };
      },
      async conscious(input, proof) {
        validateDispatch({ role: "conscious", input }, proof);
        const output = await withLlmPhysicalCompletion(() => (battleId
          ? withLlmUsageScope({ battleId, role: "conscious", side: input.side, tick: input.sourceTick }, () => roles.models.conscious(input, promptRevision, policy))
          : roles.models.conscious(input, promptRevision, policy)));
        return { output, actualUsd: null, physicalClosed: true };
      },
    },
  });
}
