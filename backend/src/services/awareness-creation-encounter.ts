// R: Admit and retain the immutable encounter judgment before canonical battle creation.
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import { AwarenessDefaultPolicy, BattleEncounterProposalSchema, type BattleEncounterProposal, type AwarenessPolicyV1 } from "@kshiai/shared";
import type { LlmProvider } from "../llm/types.js";
import { renderPromptSections } from "../llm/prompt-prose.js";
import { withAwarenessDispatchContext, type AwarenessDispatchContext } from "../llm/awareness-dispatch-context.js";
import { prepareObservedAwarenessDispatch, verifyAwarenessDispatchQuote } from "../llm/awareness-dispatch-admission.js";
import { claimAwarenessCreation, reserveAwarenessCreationAttempt, completeAwarenessCreationAttempt,
  type AwarenessCreationSnapshot } from "../repositories/battle-awareness-creation.js";
import { newId } from "../id.js";
import { requestDigest } from "./distributed-guard.js";

export async function prepareAwarenessCreationEncounter(input: {
  battleId: string;
  identity: { userId: string; characterGenerationIds: readonly [string, string] };
  encounter: Parameters<LlmProvider["prepareBattleEncounter"]>[0];
  llm: LlmProvider;
  policy?: AwarenessPolicyV1;
}): Promise<{ proposal: BattleEncounterProposal; creation: AwarenessCreationSnapshot }> {
  const policy = input.policy ?? AwarenessDefaultPolicy;
  const roles = input.llm.awareness;
  const provider = roles?.adjudicationProvider;
  if (!roles || !provider) throw new Error("AWARENESS_REQUIRED_MODEL_ROUTE_MISSING");
  const digest = requestDigest({ identity: input.identity, encounter: input.encounter });
  const creation = await claimAwarenessCreation({ battleId: input.battleId, requestDigest: digest,
    frozenInput: renderPromptSections([{ title: "確定した試合資料", value: input.encounter }]), policy, now: Date.now() });
  if (creation.status === "ready" && creation.result) return { proposal: creation.result, creation };
  if (creation.status !== "prepared") throw new Error(`AWARENESS_CREATION_${creation.status.toUpperCase()}`);
  const identity = roles.adjudication.identity;
  const contracts = (input.llm.awarenessBillingContracts ?? []).filter((contract) =>
    contract.provider === identity.provider && contract.model === identity.engineModel);
  const id = `encounter:${newId("attempt")}`;
  let reserved = false;
  let physicallyClosed = false;
  let sends = 0;
  const guard: AwarenessDispatchContext = {
    provider: identity.provider, model: identity.engineModel, limits: policy.roles.adjudication,
    async run(request, send) {
      if (sends !== 0) throw new Error("AWARENESS_CREATION_DUPLICATE_DISPATCH");
      if (request.provider !== identity.provider || request.model !== identity.engineModel) throw new Error("AWARENESS_DISPATCH_SCOPE_MISMATCH");
      const proof = policy.accountingMode === "observed" ? prepareObservedAwarenessDispatch(request, this.limits)
        : await verifyAwarenessDispatchQuote(request, contracts.length === 1 ? contracts[0] : undefined, this.limits);
      if (!proof) throw new Error("AWARENESS_VERIFIED_ADMISSION_REQUIRED");
      await reserveAwarenessCreationAttempt({ battleId: input.battleId, requestDigest: digest, id, proof, now: Date.now() });
      reserved = true;
      sends += 1;
      const receipt = await withLlmUsageScope({ battleId: input.battleId, role: "creation" }, send);
      physicallyClosed = true;
      return receipt.result;
    },
  };
  try {
    const result = await withAwarenessDispatchContext(guard, () => provider.prepareBattleEncounter(input.encounter));
    if (sends !== 1) throw new Error("AWARENESS_CREATION_UNACCOUNTED_PROVIDER");
    const proposal = BattleEncounterProposalSchema.parse(result);
    const finished = await completeAwarenessCreationAttempt({ battleId: input.battleId, id, result: proposal,
      actualUsd: null, physicalOutstanding: false, finishedAt: Date.now() });
    if (finished.status !== "ready") throw new Error("AWARENESS_CREATION_DEADLINE");
    return { proposal, creation: finished };
  } catch (error) {
    if (reserved) await completeAwarenessCreationAttempt({ battleId: input.battleId, id,
      failure: error instanceof Error ? error.message : "creation_failed", actualUsd: null,
      physicalOutstanding: !physicallyClosed, finishedAt: Date.now() });
    throw error;
  }
}
