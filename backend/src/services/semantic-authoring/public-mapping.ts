import {
  AUTHORING_ANSWER_NOT_ALLOWED,
  AUTHORING_COMMAND_DIGEST_MISMATCH,
  AUTHORING_OWNER_ANSWER_REQUIRED,
  AUTHORING_RETRY_NOT_ALLOWED,
  OwnerAnswerCommandV1Schema,
  OwnerInteractionV1Schema,
  OwnerRetryCommandV1Schema,
  SemanticAuthoringAcceptedV1Schema,
  type OwnerAnswerCommandV1,
  type OwnerInteractionV1,
  type OwnerRetryCommandV1,
  type SemanticAuthoringAcceptedV1,
  type SemanticAuthoringResolverKindV1,
} from "@kshiai/shared";

export type SemanticAuthoringPublicProjectionV1 = Readonly<{
  status: "awaiting_owner_acceptance" | "failed";
  errorCode: string | null;
  ownerInteraction: OwnerInteractionV1 | null;
}>;

export function mapSemanticAuthoringResultToPublicV1(
  kind: SemanticAuthoringResolverKindV1,
  ownerInteraction: OwnerInteractionV1 | null,
): SemanticAuthoringPublicProjectionV1 {
  if (kind === "ready_for_review") {
    return {
      status: "awaiting_owner_acceptance",
      errorCode: null,
      ownerInteraction: null,
    };
  }
  if (kind === "needs_owner_answer") {
    return {
      status: "failed",
      errorCode: AUTHORING_OWNER_ANSWER_REQUIRED,
      ownerInteraction: OwnerInteractionV1Schema.parse(ownerInteraction),
    };
  }
  return {
    status: "failed",
    errorCode: "AUTHORING_FAILED",
    ownerInteraction: null,
  };
}

export type SemanticAuthoringCommandOutcomeV1 =
  | Readonly<{ accepted: true; response: SemanticAuthoringAcceptedV1 }>
  | Readonly<{ accepted: false; errorCode: string }>;

export function mapOwnerRetryCommandV1(
  kind: SemanticAuthoringResolverKindV1,
  command: OwnerRetryCommandV1,
  context: Readonly<{
    characterId: string;
    predecessorAttemptId: string;
    nextAttemptId: string;
    replay?: SemanticAuthoringAcceptedV1;
    requestDigest: string;
    storedDigest?: string;
  }>,
): SemanticAuthoringCommandOutcomeV1 {
  OwnerRetryCommandV1Schema.parse(command);
  if (kind === "needs_owner_answer") {
    return { accepted: false, errorCode: AUTHORING_RETRY_NOT_ALLOWED };
  }
  if (context.replay) {
    if (context.storedDigest !== context.requestDigest) {
      return { accepted: false, errorCode: AUTHORING_COMMAND_DIGEST_MISMATCH };
    }
    return { accepted: true, response: context.replay };
  }
  return {
    accepted: true,
    response: SemanticAuthoringAcceptedV1Schema.parse({
      attemptId: context.nextAttemptId,
      characterId: context.characterId,
      kind: "revision",
      progress: null,
      predecessorAttemptId: context.predecessorAttemptId,
    }),
  };
}

export function mapOwnerAnswerCommandV1(
  kind: SemanticAuthoringResolverKindV1,
  command: OwnerAnswerCommandV1,
  context: Readonly<{
    openQuestionId: string;
    presentedChoiceIds: readonly string[];
    characterId: string;
    predecessorAttemptId: string;
    nextAttemptId: string;
    replay?: SemanticAuthoringAcceptedV1;
    requestDigest: string;
    storedDigest?: string;
  }>,
): SemanticAuthoringCommandOutcomeV1 {
  const parsed = OwnerAnswerCommandV1Schema.parse(command);
  if (kind !== "needs_owner_answer") {
    return { accepted: false, errorCode: AUTHORING_ANSWER_NOT_ALLOWED };
  }
  if (parsed.questionId !== context.openQuestionId) {
    return { accepted: false, errorCode: AUTHORING_ANSWER_NOT_ALLOWED };
  }
  if (parsed.answerKind === "choice" && !context.presentedChoiceIds.includes(parsed.choiceId)) {
    return { accepted: false, errorCode: AUTHORING_ANSWER_NOT_ALLOWED };
  }
  if (context.replay) {
    if (context.storedDigest !== context.requestDigest) {
      return { accepted: false, errorCode: AUTHORING_COMMAND_DIGEST_MISMATCH };
    }
    return { accepted: true, response: context.replay };
  }
  return {
    accepted: true,
    response: SemanticAuthoringAcceptedV1Schema.parse({
      attemptId: context.nextAttemptId,
      characterId: context.characterId,
      kind: "revision",
      progress: null,
      predecessorAttemptId: context.predecessorAttemptId,
    }),
  };
}
