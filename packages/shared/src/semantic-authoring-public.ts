import { z } from "zod";
import {
  AssetAuthoringAcceptedSchema,
  AssetAuthoringReviewBaseSchema,
} from "./structured-assets.js";

const CommandIdSchema = z.string().min(1).max(160);
const QuestionIdSchema = z.string().min(1).max(160);
const ClaimIdSchema = z.string().min(1).max(160);

export const ReviewSegmentV1Schema = z.object({
  claimId: ClaimIdSchema,
  label: z.string().min(1).max(120),
  text: z.string().min(1).max(1_200),
}).strict();
export type ReviewSegmentV1 = z.infer<typeof ReviewSegmentV1Schema>;

function uniqueSegmentIds(segments: readonly ReviewSegmentV1[], context: z.RefinementCtx) {
  const ids = segments.map((segment) => segment.claimId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "segment claimId values must be unique",
    });
  }
}

function boundedSegments(field: "relevantSource" | "relevantCandidate") {
  return z.array(ReviewSegmentV1Schema).min(1).max(8).superRefine((segments, context) => {
    uniqueSegmentIds(segments, context);
    const encoded = new TextEncoder().encode(JSON.stringify(segments)).byteLength;
    if (encoded > 12 * 1024) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} exceeds 12 KiB`,
      });
    }
  });
}

export const OwnerInteractionChoiceV1Schema = z.object({
  id: z.string().min(1).max(80),
  effect: z.string().min(1).max(400),
}).strict();

export const OwnerInteractionV1Schema = z.object({
  kind: z.literal("semantic_question"),
  questionId: QuestionIdSchema,
  prompt: z.string().min(1).max(800),
  relevantSource: boundedSegments("relevantSource"),
  relevantCandidate: boundedSegments("relevantCandidate"),
  unsafeReason: z.string().min(1).max(400),
  choices: z.array(OwnerInteractionChoiceV1Schema).min(2).max(6).superRefine((choices, context) => {
    const ids = choices.map((choice) => choice.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "choice ids must be unique",
      });
    }
  }),
  freeFormAllowed: z.literal(true),
  resumes: z.string().min(1).max(400),
}).strict();
export type OwnerInteractionV1 = z.infer<typeof OwnerInteractionV1Schema>;

export const OwnerAnswerCommandV1Schema = z.discriminatedUnion("answerKind", [
  z.object({
    questionId: QuestionIdSchema,
    commandId: CommandIdSchema,
    answerKind: z.literal("choice"),
    choiceId: z.string().min(1).max(80),
  }).strict(),
  z.object({
    questionId: QuestionIdSchema,
    commandId: CommandIdSchema,
    answerKind: z.literal("free-form"),
    freeForm: z.string().min(1).max(1_200),
  }).strict(),
]);
export type OwnerAnswerCommandV1 = z.infer<typeof OwnerAnswerCommandV1Schema>;

export const OwnerRetryCommandV1Schema = z.object({
  commandId: CommandIdSchema,
}).strict();
export type OwnerRetryCommandV1 = z.infer<typeof OwnerRetryCommandV1Schema>;

export const SemanticAuthoringAcceptedV1Schema = AssetAuthoringAcceptedSchema.extend({
  predecessorAttemptId: z.string().min(1).max(80),
}).strict();
export type SemanticAuthoringAcceptedV1 = z.infer<typeof SemanticAuthoringAcceptedV1Schema>;

export const SemanticAuthoringReviewV1Schema = AssetAuthoringReviewBaseSchema.extend({
  ownerInteraction: OwnerInteractionV1Schema.nullable().optional(),
}).strict();
export type SemanticAuthoringReviewV1 = z.infer<typeof SemanticAuthoringReviewV1Schema>;

export const AUTHORING_OWNER_ANSWER_REQUIRED = "AUTHORING_OWNER_ANSWER_REQUIRED" as const;
export const AUTHORING_RETRY_NOT_ALLOWED = "AUTHORING_RETRY_NOT_ALLOWED" as const;
export const AUTHORING_ANSWER_NOT_ALLOWED = "AUTHORING_ANSWER_NOT_ALLOWED" as const;
export const AUTHORING_COMMAND_DIGEST_MISMATCH = "AUTHORING_COMMAND_DIGEST_MISMATCH" as const;
