/** R: Schedule verified public-profile work after character structure within one semantic run. */
import { z } from "zod";
import {
  createSemanticProposalV1Schema, defaultCharacterDisclosurePolicyV2, characterV3ProfileDefinitionV2,
  type AssetDisclosurePolicyV1, type CharacterProposalPayloadV1,
  type SemanticAuthoringAdapterV1, type SemanticAuthoringAdapterStateViewV1,
  type SemanticAuthoringStateV1, type SemanticProposalV1,
  type CharacterGenerationEnvelopeV3,
} from "@kshiai/shared";
import { assetContentDigest } from "../../../repositories/asset-generations.js";
import { createCharacterSemanticAuthoringAdapterV3,
  type CharacterAuthoringSourceV1, type CharacterFindingV1, type CharacterObligationV1,
  type CharacterWorkItemV1 } from "./character-v3.js";
import { projectFocusedCharacterWorkV1 } from "./character-context.js";
import { schemaNotation } from "./schema-notation.js";
import { correctionStructuralSource, correctionPredecessorDisclosure, decodeCharacterReviewCorrectionSourceV1,
  type CompleteCharacterSourceV1 } from "../character-review-correction-source.js";
import {
  FocusedCharacterProfileGenerationV1Schema, FocusedCharacterProfileClaimsV1Schema,
  startFocusedCharacterProfileV1, replaceFocusedCharacterProfileDefinitionV1,
  selectFocusedCharacterProfileWorkV1, projectFocusedCharacterProfileWorkV1,
  applyFocusedCharacterProfileGenerationV1, applyFocusedCharacterProfileClaimsV1,
  completeFocusedCharacterProfileV1,
  type FocusedCharacterProfileCandidateV1, type FocusedCharacterProfileWorkV1,
  type FocusedCharacterCompleteReviewV1,
} from "./character-profile-work.js";

export const COMPLETE_CHARACTER_ADAPTER_V1 = "character-complete-review-adapter-v1";
const generationPayloadSchema = z.object({ kind: z.literal("generate_profile"),
  value: FocusedCharacterProfileGenerationV1Schema }).strict();
const claimsPayloadSchema = z.object({ kind: z.literal("validate_profile_claims"),
  value: FocusedCharacterProfileClaimsV1Schema }).strict();
type ProfilePayload = z.infer<typeof generationPayloadSchema> | z.infer<typeof claimsPayloadSchema>;
type CompleteProposal = SemanticProposalV1<CharacterProposalPayloadV1 | ProfilePayload>;
type ProfileObligation = Readonly<{ obligationId: string; required: true; resolved: boolean;
  cluster: "profile_generation" | "profile_claim_validation" }>;
type CompleteObligation = CharacterObligationV1 | ProfileObligation;
type CompleteWork = CharacterWorkItemV1 | FocusedCharacterProfileWorkV1;
type CompleteView = SemanticAuthoringAdapterStateViewV1<FocusedCharacterProfileCandidateV1,
  CompleteObligation, CharacterFindingV1>;
export type CompleteCharacterStateV1 = SemanticAuthoringStateV1<FocusedCharacterProfileCandidateV1,
  CompleteObligation, CharacterFindingV1, CompleteWork, string, FocusedCharacterCompleteReviewV1>;

function structuralObligation(item: CompleteObligation): item is CharacterObligationV1 {
  return item.cluster !== "profile_generation" && item.cluster !== "profile_claim_validation";
}
function structuralObligations(items: ReadonlyMap<string, CompleteObligation>) {
  const result = new Map<string, CharacterObligationV1>();
  for (const [key, item] of items) {
    if (structuralObligation(item)) {
      result.set(key, item);
    }
  }
  return result;
}
function structuralView(view: CompleteView) {
  return { ...view, candidate: view.candidate.definition, obligations: structuralObligations(view.obligations) };
}
function combinedObligations(items: ReadonlyMap<string, CharacterObligationV1>,
  candidate: FocusedCharacterProfileCandidateV1): ReadonlyMap<string, CompleteObligation> {
  const result = new Map<string, CompleteObligation>(items);
  result.set("profile_generation", { obligationId: "profile_generation", required: true,
    cluster: "profile_generation", resolved: candidate.profile.status !== "pending" });
  result.set("profile_claim_validation", { obligationId: "profile_claim_validation", required: true,
    cluster: "profile_claim_validation", resolved: candidate.profile.status === "validated" });
  return result;
}
function profileWork(work: CompleteWork): work is FocusedCharacterProfileWorkV1 {
  return work.kind === "profile_generation" || work.kind === "profile_claim_validation";
}
function profilePayload(payload: CompleteProposal["payload"]): payload is ProfilePayload {
  return payload.kind === "generate_profile" || payload.kind === "validate_profile_claims";
}
function proposalIdentity(work: FocusedCharacterProfileWorkV1) {
  return `character_${work.kind}_proposal_v1`;
}

export function createCompleteCharacterAdapterV1(binding: {
  attemptId: string; sourceDigest: string;
  revisionDisclosurePolicy: AssetDisclosurePolicyV1 | null;
  compilerCompatibility: CharacterGenerationEnvelopeV3["compilerCompatibility"];
}): SemanticAuthoringAdapterV1<CompleteCharacterSourceV1, FocusedCharacterProfileCandidateV1,
  CompleteObligation, CompleteWork, CompleteProposal, CharacterFindingV1, string, string,
  FocusedCharacterCompleteReviewV1> {
  const structure = createCharacterSemanticAuthoringAdapterV3();
  return {
    identity: COMPLETE_CHARACTER_ADAPTER_V1,
    decodeFrozenSource(value) {
      const correction = decodeCharacterReviewCorrectionSourceV1(value);
      if (correction?.requestedCluster) return { accepted: true, value: correction };
      const decoded = structure.decodeFrozenSource(value);
      return decoded.accepted && decoded.value.kind !== "migrate" ? decoded : { accepted: false };
    },
    buildBaseline(source, mode) {
      if (source.kind === "review_candidate_correction") {
        if (mode !== source.predecessorCandidate.mode) throw new Error("COMPLETE_CHARACTER_SOURCE_MODE_MISMATCH");
        const baseline = structure.buildBaseline(correctionStructuralSource(source), "revise");
        const candidate = startFocusedCharacterProfileV1({ definition: baseline.candidate,
          disclosurePolicy: correctionPredecessorDisclosure(source.predecessorCandidate), mode,
          attemptId: binding.attemptId, sourceDigest: binding.sourceDigest });
        return { ...baseline, candidate, obligations: combinedObligations(baseline.obligations, candidate) };
      }
      if (source.kind === "migrate" || mode === "migrate" || mode !== source.kind) {
        throw new Error("COMPLETE_CHARACTER_SOURCE_MODE_MISMATCH");
      }
      if (source.kind === "revise" && !binding.revisionDisclosurePolicy) {
        throw new Error("COMPLETE_CHARACTER_REVISION_DISCLOSURE_MISSING");
      }
      const baseline = structure.buildBaseline(source, mode);
      const disclosurePolicy = binding.revisionDisclosurePolicy
        ?? defaultCharacterDisclosurePolicyV2(characterV3ProfileDefinitionV2(baseline.candidate));
      const candidate = startFocusedCharacterProfileV1({ definition: baseline.candidate,
        disclosurePolicy, mode, attemptId: binding.attemptId, sourceDigest: binding.sourceDigest });
      return { ...baseline, candidate, obligations: combinedObligations(baseline.obligations, candidate) };
    },
    selectWork(view) {
      const structural = structure.selectWork(structuralView(view));
      if (structural.selected) return structural;
      if (!structure.finalize(structuralView(view)).accepted) return { selected: false };
      const selected = selectFocusedCharacterProfileWorkV1(view.candidate);
      return selected ? { selected: true, workItem: selected } : { selected: false };
    },
    describeCapabilities(work) {
      if (!profileWork(work)) return structure.describeCapabilities(work);
      return { skill: { identity: proposalIdentity(work), objective: work.kind,
        phase: work.kind, legalCapabilityRoles: ["query-context", "propose-change"],
        capabilityRequestGuidance: "Submit only this bound public-profile work product.",
        resourceReminder: "Use the same frozen run budget.",
        disclosureReminder: "Only approved public facts and the actual public profile are available." },
      allowedSelectors: ["approved-public-profile"], proposalSchemaIdentity: proposalIdentity(work),
      writeClosure: [work.kind] };
    },
    decodeProposal(work, value) {
      if (!profileWork(work)) return structure.decodeProposal(work, value);
      const schema = work.kind === "profile_generation" ? generationPayloadSchema : claimsPayloadSchema;
      const parsed = createSemanticProposalV1Schema(proposalIdentity(work), schema).safeParse(value);
      return parsed.success ? { accepted: true, value: parsed.data } : { accepted: false };
    },
    stageProposal(input) {
      if (!profilePayload(input.proposal.payload)) {
        const staged = structure.stageProposal({ ...structuralView(input),
          proposal: { ...input.proposal, payload: input.proposal.payload } });
        if (!staged.accepted) return staged;
        const candidate = replaceFocusedCharacterProfileDefinitionV1(input.candidate, staged.candidate);
        return { ...staged, candidate, obligations: combinedObligations(staged.obligations, candidate) };
      }
      try {
        const payload = input.proposal.payload;
        const candidate = payload.kind === "generate_profile"
          ? applyFocusedCharacterProfileGenerationV1(input.candidate, payload.value)
          : applyFocusedCharacterProfileClaimsV1(input.candidate, payload.value);
        const findings = new Map(input.findings);
        findings.delete("profile:invalid");
        return { accepted: true, candidate,
          obligations: combinedObligations(structuralObligations(input.obligations), candidate), findings };
      } catch (error) {
        return { accepted: false, findingKey: "profile:invalid", finding: {
          code: "profile:invalid", explanation: error instanceof Error ? error.message : "Invalid public profile work" } };
      }
    },
    reconcileAffected(input) { return { findings: input.findings }; },
    observeProgress: observeCompleteCharacterProgress,
    assessQuestion() { return { ask: false }; },
    applyAnswer(source, question, answer) { return structure.applyAnswer(correctionStructuralSource(source), question, answer); },
    finalize(view) {
      const structural = structure.finalize(structuralView(view));
      if (!structural.accepted) return structural;
      if (structural.compilerReceiptIdentity !== "character-compiler-v3"
        || assetContentDigest(structural.finalCandidate) !== assetContentDigest(view.candidate.definition)) {
        return { accepted: false, findings: new Map([["profile:structural-receipt", {
          code: "profile:structural-receipt", explanation: "Structural final receipt does not match this definition" }]]) };
      }
      try {
        const complete = completeFocusedCharacterProfileV1(view.candidate, {
          compilerCompatibility: binding.compilerCompatibility,
          definitionReceipt: { contract: "character-compiler-v3",
            definitionDigest: assetContentDigest(structural.finalCandidate) } });
        return { ...structural, finalCandidate: complete,
          finalCandidateDigest: complete.candidateDigest,
          obligationCoverage: { resolvedRequiredObligationCount: structural.obligationCoverage.resolvedRequiredObligationCount + 2,
            requiredObligationCount: structural.obligationCoverage.requiredObligationCount + 2 },
          disclosureReceiptIdentity: "character-public-profile-claims-v1" };
      } catch (error) {
        return { accepted: false, findings: new Map([["profile:incomplete", {
          code: "profile:incomplete", explanation: error instanceof Error ? error.message : "Profile incomplete" }]]) };
      }
    },
  };
}

export function projectCompleteCharacterWorkV1(state: CompleteCharacterStateV1,
  source: CompleteCharacterSourceV1) {
  const work = state.activeWorkItem;
  const session = state.capabilitySession;
  if (!work || !session || state.terminalResult) throw new Error("COMPLETE_CHARACTER_WORK_MISSING");
  if (!profileWork(work)) {
    return projectFocusedCharacterWorkV1({ ...state, candidate: state.candidate.definition,
      obligations: structuralObligations(state.obligations), activeWorkItem: work, terminalResult: null },
    correctionStructuralSource(source));
  }
  const request = projectFocusedCharacterProfileWorkV1(state.candidate, work);
  const payloadSchema = work.kind === "profile_generation" ? generationPayloadSchema : claimsPayloadSchema;
  // Replace the raw output instruction, retaining the shared profile/claim semantic rules.
  const system = request.system.replace(/Return JSON only: \{[\s\S]*?\n\}/,
    "Return JSON only as the bound semantic proposal envelope in responseContract. Put the work product in payload.value and use the specified payload.kind. Do not return the work product at the top level. Schema notation str/int/num[min,max] gives string length/integer/number bounds; _ is unbounded; bare enum words are strings.");
  if (system === request.system) throw new Error("COMPLETE_CHARACTER_OUTPUT_INSTRUCTION_MISSING");
  return { system,
    context: JSON.stringify({ work, publicInput: z.record(z.unknown()).parse(JSON.parse(request.context)),
      proposal: { runId: session.runId, workItemId: session.workItemId,
        baseCandidateRevision: state.candidateRevision, capabilitySessionId: session.capabilitySessionId,
        proposalSchemaIdentity: session.proposalSchemaIdentity },
      responseContract: schemaNotation(createSemanticProposalV1Schema(proposalIdentity(work), payloadSchema)),
      obligationId: work.kind }) };
}

function observeCompleteCharacterProgress(
  input: Parameters<ReturnType<typeof createCompleteCharacterAdapterV1>["observeProgress"]>[0],
) {
      const resolved = [...input.obligations.values()].filter((item) => item.required && item.resolved).length;
      const digest = assetContentDigest(input.candidate);
      const keys = [...input.findings.keys()];
      return { phase: input.phase, resolvedRequiredObligationCount: resolved,
        coveredMaterialClaimCount: resolved, unresolvedMaterialFindingKeys: keys,
        relevantStateDigest: digest, activeSemanticClusterKey: input.phase,
        materialProgress: input.previous ? resolved > input.previous.resolvedRequiredObligationCount
          || keys.length < input.previous.unresolvedMaterialFindingKeys.length
          || digest !== input.previous.relevantStateDigest : false };

}
