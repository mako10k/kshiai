/** R: Freeze an owner-reviewed candidate as a correction source without inventing an active generation. */
import { z } from "zod";
import { assetContentDigest } from "../../repositories/asset-generations.js";
import { AssetDisclosurePolicyV1Schema, CharacterDefinitionV3Schema,
  CompilerRequirementSchema } from "@kshiai/shared";
import { FocusedCharacterCompleteReviewV1Schema } from "./adapters/character-profile-work.js";
import { CharacterRevisionScopeResolutionV1Schema } from "./character-revision-scope.js";
import type { CharacterAuthoringSourceV1 } from "./adapters/character-v3.js";

/** Old structural reviews retain their real receipts; they do not imply profile readiness. */
export const LegacyCharacterStructuralReviewV1Schema = z.object({
  kind: z.literal("legacy_character_structural_review_v1"),
  mode: z.enum(["create", "revise"]),
  attemptId: z.string().min(1).max(160),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  definition: CharacterDefinitionV3Schema,
  definitionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  candidateDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reconciliationReceiptIdentity: z.literal("character-reconciliation-v1"),
  compilerReceiptIdentity: z.literal("character-compiler-v3"),
  disclosureReceiptIdentity: z.literal("character-disclosure-v1"),
  disclosurePolicy: AssetDisclosurePolicyV1Schema,
  compilerCompatibility: z.array(CompilerRequirementSchema).min(1).max(24),
}).strict().superRefine((review, context) => {
  // The historical result digest is verified against its original JSON by the repository reader.
  if (assetContentDigest(review.definition) !== review.definitionDigest) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "LEGACY_STRUCTURAL_REVIEW_DIGEST_MISMATCH" });
  }
});
export const CharacterCorrectionPredecessorV1Schema = z.union([
  FocusedCharacterCompleteReviewV1Schema, LegacyCharacterStructuralReviewV1Schema,
]);
export type CharacterCorrectionPredecessorV1 = z.infer<typeof CharacterCorrectionPredecessorV1Schema>;

export function correctionPredecessorDefinition(predecessor: CharacterCorrectionPredecessorV1) {
  return predecessor.kind === "character_complete_review_v1" ? predecessor.envelope.definition : predecessor.definition;
}
export function correctionPredecessorDisclosure(predecessor: CharacterCorrectionPredecessorV1) {
  return predecessor.kind === "character_complete_review_v1" ? predecessor.envelope.disclosurePolicy : predecessor.disclosurePolicy;
}
export function correctionPredecessorCompatibility(predecessor: CharacterCorrectionPredecessorV1) {
  return predecessor.kind === "character_complete_review_v1" ? predecessor.envelope.compilerCompatibility : predecessor.compilerCompatibility;
}

export const CharacterReviewCorrectionSourceV1Schema = z.object({
  kind: z.literal("review_candidate_correction"),
  predecessorAttemptId: z.string().min(1).max(160),
  predecessorCandidate: CharacterCorrectionPredecessorV1Schema,
  naturalText: z.string().trim().min(1).max(8000),
  requestedCluster: CharacterRevisionScopeResolutionV1Schema.shape.requestedCluster.nullable(),
}).strict().superRefine((source, context) => {
  const predecessorId = source.predecessorCandidate.kind === "character_complete_review_v1"
    ? source.predecessorCandidate.envelope.provenance.attemptId : source.predecessorCandidate.attemptId;
  if (predecessorId !== source.predecessorAttemptId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CORRECTION_PREDECESSOR_BINDING_MISMATCH" });
  }
});
export type CharacterReviewCorrectionSourceV1 = z.infer<typeof CharacterReviewCorrectionSourceV1Schema>;
export type CompleteCharacterSourceV1 = CharacterAuthoringSourceV1 | CharacterReviewCorrectionSourceV1;

export function decodeCharacterReviewCorrectionSourceV1(value: unknown) {
  const result = CharacterReviewCorrectionSourceV1Schema.safeParse(value);
  return result.success ? result.data : null;
}

export function correctionStructuralSource(source: CompleteCharacterSourceV1): CharacterAuthoringSourceV1 {
  if (source.kind !== "review_candidate_correction") return source;
  if (!source.requestedCluster) throw new Error("CORRECTION_SCOPE_MISSING");
  return { kind: "revise", definition: correctionPredecessorDefinition(source.predecessorCandidate),
    naturalText: source.naturalText, requestedCluster: source.requestedCluster };
}
