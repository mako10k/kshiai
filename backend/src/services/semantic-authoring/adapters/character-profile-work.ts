/** R: Bind focused character profile work and complete review payloads to validated public facts. */
import { z } from "zod";
import {
  AssetClaimValidationReceiptV1Schema,
  AssetDisclosurePolicyV1Schema,
  AssetPublicPresentationV2Schema,
  CharacterDefinitionV3Schema,
  CharacterGenerationEnvelopeV3Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  projectCharacterProfileSourceV3,
  validateCharacterProfileClaimAssessmentV2,
  validateCharacterPublicPresentationV2,
  type AssetDisclosurePolicyV1,
  type CharacterDefinitionV3,
  type CharacterGenerationEnvelopeV3,
} from "@kshiai/shared";
import { assetContentDigest } from "../../../repositories/asset-generations.js";
import { assertCharacterCandidateReady } from "../../character-authoring-candidate.js";
import {
  CHARACTER_PROFILE_GENERATION_SYSTEM_V1,
  CHARACTER_PROFILE_CLAIM_SYSTEM_V1,
} from "../../../llm/character-profile-prompts.js";
import type { FocusedProviderRequestV1 } from "../execution.js";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const profileFields = {
  definitionDigest: digestSchema,
  disclosureDigest: digestSchema,
  sourceBindingDigest: digestSchema,
  presentation: AssetPublicPresentationV2Schema,
  assistantMessage: z.string().min(1).max(4000),
};
const profileStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z.object({ status: z.literal("generated"), ...profileFields,
    presentation: AssetPublicPresentationV2Schema.omit({ claimValidation: true }).strict(),
  }).strict(),
  z.object({ status: z.literal("validated"), ...profileFields,
    presentation: AssetPublicPresentationV2Schema.extend({
      claimValidation: AssetClaimValidationReceiptV1Schema,
    }).strict(),
  }).strict(),
]);

/** All persisted progress must revalidate the current definition/disclosure binding. */
export const FocusedCharacterProfileCandidateV1Schema = z.object({
  definition: CharacterDefinitionV3Schema,
  disclosurePolicy: AssetDisclosurePolicyV1Schema,
  source: z.object({
    mode: z.enum(["create", "revise"]),
    attemptId: z.string().min(1).max(160),
    sourceDigest: digestSchema,
  }).strict(),
  profile: profileStateSchema,
}).strict().superRefine((candidate, context) => {
  if (candidate.profile.status === "pending") return;
  try {
    if (candidate.profile.disclosureDigest !== assetContentDigest(candidate.disclosurePolicy)
      || candidate.profile.sourceBindingDigest !== assetContentDigest(candidate.source)) {
      throw new Error("CHARACTER_PROFILE_INPUT_BINDING_MISMATCH");
    }
    if (candidate.profile.definitionDigest !== assetContentDigest(candidate.definition)) {
      throw new Error("CHARACTER_PROFILE_DEFINITION_DIGEST_MISMATCH");
    }
    const projection = projectCharacterProfileSourceV3(candidate.definition, candidate.disclosurePolicy);
    const presentation = candidate.profile.presentation;
    if (presentation.projectionContractVersion !== projection.contractVersion
      || presentation.projectionDigest !== assetContentDigest(projection)
      || presentation.descriptionInputDigest !== assetContentDigest({
        sourceDigest: candidate.source.sourceDigest, projectionDigest: presentation.projectionDigest,
      })) {
      throw new Error("CHARACTER_PROFILE_INPUT_BINDING_MISMATCH");
    }
    validateCharacterPublicPresentationV2(projection, presentation);
    if (candidate.profile.status === "validated") {
      validateCharacterProfileClaimAssessmentV2(projection, presentation,
        candidate.profile.presentation.claimValidation);
    }
  } catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile"],
      message: error instanceof Error ? error.message : "CHARACTER_PROFILE_INVALID" });
  }
});
export type FocusedCharacterProfileCandidateV1 = z.infer<typeof FocusedCharacterProfileCandidateV1Schema>;

export const FocusedCharacterProfileGenerationV1Schema = z.object({
  description: AssetPublicPresentationV2Schema.shape.description,
  segments: AssetPublicPresentationV2Schema.shape.segments,
  assistantMessage: z.string().min(1).max(4000),
}).strict();
export const FocusedCharacterProfileClaimsV1Schema = z.object({
  segments: AssetClaimValidationReceiptV1Schema.shape.segments,
}).strict();

export type FocusedCharacterProfileWorkV1 = Readonly<{
  kind: "profile_generation" | "profile_claim_validation";
  workItemId: string;
}>;

export function startFocusedCharacterProfileV1(input: {
  definition: CharacterDefinitionV3;
  disclosurePolicy: AssetDisclosurePolicyV1;
  mode: "create" | "revise";
  attemptId: string;
  sourceDigest: string;
}): FocusedCharacterProfileCandidateV1 {
  return FocusedCharacterProfileCandidateV1Schema.parse({
    definition: input.definition, disclosurePolicy: input.disclosurePolicy,
    source: { mode: input.mode, attemptId: input.attemptId, sourceDigest: input.sourceDigest },
    profile: { status: "pending" },
  });
}

/** A semantic repair invalidates both dependent work products, without retaining a stale receipt. */
export function replaceFocusedCharacterProfileDefinitionV1(
  candidate: FocusedCharacterProfileCandidateV1,
  definition: CharacterDefinitionV3,
  disclosurePolicy = candidate.disclosurePolicy,
): FocusedCharacterProfileCandidateV1 {
  const changed = assetContentDigest(definition) !== assetContentDigest(candidate.definition)
    || assetContentDigest(disclosurePolicy) !== assetContentDigest(candidate.disclosurePolicy);
  return FocusedCharacterProfileCandidateV1Schema.parse({
    ...candidate, definition, disclosurePolicy,
    profile: changed ? { status: "pending" } : candidate.profile,
  });
}

export function selectFocusedCharacterProfileWorkV1(candidate: FocusedCharacterProfileCandidateV1):
  FocusedCharacterProfileWorkV1 | null {
  const parsed = FocusedCharacterProfileCandidateV1Schema.parse(candidate);
  if (parsed.profile.status === "validated") return null;
  const kind = parsed.profile.status === "pending" ? "profile_generation" : "profile_claim_validation";
  return { kind, workItemId: `work-${kind}` };
}

export function projectFocusedCharacterProfileWorkV1(
  candidate: FocusedCharacterProfileCandidateV1,
  work: FocusedCharacterProfileWorkV1,
): FocusedProviderRequestV1 {
  const parsed = FocusedCharacterProfileCandidateV1Schema.parse(candidate);
  const projection = projectCharacterProfileSourceV3(parsed.definition, parsed.disclosurePolicy);
  if (work.kind === "profile_generation" && parsed.profile.status === "pending") {
    return { system: `${CHARACTER_PROFILE_GENERATION_SYSTEM_V1}
No owner source is supplied. Use the language of the approved public facts.`,
      context: JSON.stringify({ displayName: projection.displayName, approvedFacts: projection.facts }) };
  }
  if (work.kind === "profile_claim_validation" && parsed.profile.status === "generated") {
    return { system: CHARACTER_PROFILE_CLAIM_SYSTEM_V1,
      context: JSON.stringify({ approvedProjection: projection,
        candidateProfile: { description: parsed.profile.presentation.description,
          segments: parsed.profile.presentation.segments } }) };
  }
  throw new Error("CHARACTER_PROFILE_WORK_PHASE_MISMATCH");
}

export function applyFocusedCharacterProfileGenerationV1(
  candidate: FocusedCharacterProfileCandidateV1,
  output: unknown,
): FocusedCharacterProfileCandidateV1 {
  const parsed = FocusedCharacterProfileCandidateV1Schema.parse(candidate);
  if (parsed.profile.status !== "pending") throw new Error("CHARACTER_PROFILE_WORK_PHASE_MISMATCH");
  const generated = FocusedCharacterProfileGenerationV1Schema.parse(output);
  const projection = projectCharacterProfileSourceV3(parsed.definition, parsed.disclosurePolicy);
  const projectionDigest = assetContentDigest(projection);
  return FocusedCharacterProfileCandidateV1Schema.parse({ ...parsed, profile: {
    status: "generated", definitionDigest: assetContentDigest(parsed.definition),
    disclosureDigest: assetContentDigest(parsed.disclosurePolicy),
    sourceBindingDigest: assetContentDigest(parsed.source),
    assistantMessage: generated.assistantMessage,
    presentation: { description: generated.description, segments: generated.segments,
      projectionContractVersion: projection.contractVersion, projectionDigest,
      descriptionInputDigest: assetContentDigest({ sourceDigest: parsed.source.sourceDigest, projectionDigest }) },
  } });
}

export function applyFocusedCharacterProfileClaimsV1(
  candidate: FocusedCharacterProfileCandidateV1,
  output: unknown,
): FocusedCharacterProfileCandidateV1 {
  const parsed = FocusedCharacterProfileCandidateV1Schema.parse(candidate);
  if (parsed.profile.status !== "generated") throw new Error("CHARACTER_PROFILE_WORK_PHASE_MISMATCH");
  const assessment = FocusedCharacterProfileClaimsV1Schema.parse(output);
  return FocusedCharacterProfileCandidateV1Schema.parse({ ...parsed, profile: {
    ...parsed.profile, status: "validated",
    presentation: { ...parsed.profile.presentation, claimValidation: {
      contractVersion: 1, validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
      projectionDigest: parsed.profile.presentation.projectionDigest, segments: assessment.segments,
    } },
  } });
}

export const FocusedCharacterDefinitionReceiptV1Schema = z.object({
  contract: z.literal("character-compiler-v3"), definitionDigest: digestSchema,
}).strict();

/** A complete family final payload cannot omit the independent profile receipt. */
export const FocusedCharacterCompleteReviewV1Schema = z.object({
  kind: z.literal("character_complete_review_v1"),
  mode: z.enum(["create", "revise"]),
  envelope: CharacterGenerationEnvelopeV3Schema,
  definitionReceipt: FocusedCharacterDefinitionReceiptV1Schema,
  profileReceipt: z.object({ contract: z.literal("character-profile-generation-v1"), projectionDigest: digestSchema }).strict(),
  claimReceipt: AssetClaimValidationReceiptV1Schema,
  candidateDigest: digestSchema,
  assistantMessage: z.string().min(1).max(4000),
}).strict().superRefine((result, context) => {
  try {
    assertCharacterCandidateReady(result.envelope);
    if (result.envelope.provenance.sourceKind !== (result.mode === "create" ? "create_instruction" : "revision_instruction")
      || result.definitionReceipt.definitionDigest !== assetContentDigest(result.envelope.definition)
      || result.profileReceipt.projectionDigest !== result.envelope.publicPresentation.projectionDigest
      || result.candidateDigest !== assetContentDigest(result.envelope)
      || assetContentDigest(result.claimReceipt) !== assetContentDigest(result.envelope.publicPresentation.claimValidation)) {
      throw new Error("CHARACTER_COMPLETE_REVIEW_BINDING_MISMATCH");
    }
  } catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "CHARACTER_COMPLETE_REVIEW_INVALID" });
  }
});
export type FocusedCharacterCompleteReviewV1 = z.infer<typeof FocusedCharacterCompleteReviewV1Schema>;

export function completeFocusedCharacterProfileV1(
  candidate: FocusedCharacterProfileCandidateV1,
  structural: {
    compilerCompatibility: CharacterGenerationEnvelopeV3["compilerCompatibility"];
    definitionReceipt: z.infer<typeof FocusedCharacterDefinitionReceiptV1Schema>;
  },
): FocusedCharacterCompleteReviewV1 {
  const parsed = FocusedCharacterProfileCandidateV1Schema.parse(candidate);
  if (parsed.profile.status !== "validated") throw new Error("CHARACTER_PROFILE_CLAIM_RECEIPT_MISSING");
  const envelope = CharacterGenerationEnvelopeV3Schema.parse({
    envelopeVersion: 2, definitionSchema: { family: "character", version: 3 },
    definition: parsed.definition, disclosurePolicy: parsed.disclosurePolicy,
    publicPresentation: parsed.profile.presentation,
    provenance: { sourceKind: parsed.source.mode === "create" ? "create_instruction" : "revision_instruction",
      sourceDigest: parsed.source.sourceDigest, attemptId: parsed.source.attemptId,
      structureGeneratorContract: "character-focused-semantic-authoring-v3",
      descriptionGeneratorContract: "character-profile-generation-v1" },
    compilerCompatibility: structural.compilerCompatibility, deferredValues: { contractVersion: 1, values: [] },
  });
  return FocusedCharacterCompleteReviewV1Schema.parse({
    kind: "character_complete_review_v1", mode: parsed.source.mode, envelope,
    definitionReceipt: structural.definitionReceipt,
    profileReceipt: { contract: "character-profile-generation-v1", projectionDigest: parsed.profile.presentation.projectionDigest },
    claimReceipt: parsed.profile.presentation.claimValidation,
    candidateDigest: assetContentDigest(envelope), assistantMessage: parsed.profile.assistantMessage,
  });
}
