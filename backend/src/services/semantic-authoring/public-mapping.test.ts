import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHORING_ANSWER_NOT_ALLOWED,
  AUTHORING_COMMAND_DIGEST_MISMATCH,
  AUTHORING_OWNER_ANSWER_REQUIRED,
  AUTHORING_RETRY_NOT_ALLOWED,
  AssetAuthoringAttemptStatusSchema,
  OwnerAnswerCommandV1Schema,
  OwnerInteractionV1Schema,
  OwnerRetryCommandV1Schema,
  SemanticAuthoringReviewV1Schema,
} from "@kshiai/shared";
import {
  mapOwnerAnswerCommandV1,
  mapOwnerRetryCommandV1,
  mapSemanticAuthoringResultToPublicV1,
} from "./public-mapping.js";

const interaction = OwnerInteractionV1Schema.parse({
  kind: "semantic_question",
  questionId: "question-1",
  prompt: "Which protected name is intended?",
  relevantSource: [{ claimId: "source-1", label: "source", text: "灯" }],
  relevantCandidate: [{ claimId: "identity", label: "candidate", text: "未設定" }],
  unsafeReason: "The name is a protected anchor.",
  choices: [
    { id: "keep", effect: "Keep the source name." },
    { id: "owner", effect: "Wait for an owner-specified name." },
  ],
  freeFormAllowed: true,
  resumes: "A new attempt will freeze the answer as source clarification.",
});

describe("semantic authoring public mapping", () => {
  it("does not add statuses to the existing attempt status schema", () => {
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("needs_owner_answer").success, false);
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("ready_for_review").success, false);
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("failed").success, true);
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("awaiting_owner_acceptance").success, true);
  });

  it("maps closed internal results onto existing public statuses", () => {
    const ready = mapSemanticAuthoringResultToPublicV1("ready_for_review", null);
    assert.equal(ready.status, "awaiting_owner_acceptance");
    assert.equal(ready.ownerInteraction, null);

    const question = mapSemanticAuthoringResultToPublicV1("needs_owner_answer", interaction);
    assert.equal(question.status, "failed");
    assert.equal(question.errorCode, AUTHORING_OWNER_ANSWER_REQUIRED);
    assert.equal(question.ownerInteraction?.questionId, "question-1");

    const failed = mapSemanticAuthoringResultToPublicV1("failed", interaction);
    assert.equal(failed.status, "failed");
    assert.equal(failed.ownerInteraction, null);
    assert.notEqual(failed.errorCode, AUTHORING_OWNER_ANSWER_REQUIRED);
  });

  it("rejects retry on a question and answer on an ordinary failure", () => {
    const retry = mapOwnerRetryCommandV1(
      "needs_owner_answer",
      OwnerRetryCommandV1Schema.parse({ commandId: "cmd-retry" }),
      {
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-2",
        requestDigest: "digest-1",
      },
    );
    assert.equal(retry.accepted, false);
    if (retry.accepted) {
      assert.fail("retry was accepted for a question");
    }
    assert.equal(retry.errorCode, AUTHORING_RETRY_NOT_ALLOWED);

    const answer = mapOwnerAnswerCommandV1(
      "failed",
      OwnerAnswerCommandV1Schema.parse({
        questionId: "question-1",
        commandId: "cmd-answer",
        answerKind: "choice",
        choiceId: "keep",
      }),
      {
        openQuestionId: "question-1",
        presentedChoiceIds: ["keep", "owner"],
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-2",
        requestDigest: "digest-1",
      },
    );
    assert.equal(answer.accepted, false);
    if (answer.accepted) {
      assert.fail("answer was accepted for an ordinary failure");
    }
    assert.equal(answer.errorCode, AUTHORING_ANSWER_NOT_ALLOWED);
  });

  it("replays the same owner command identity", () => {
    const first = mapOwnerRetryCommandV1(
      "failed",
      OwnerRetryCommandV1Schema.parse({ commandId: "cmd-retry" }),
      {
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-2",
        requestDigest: "digest-1",
      },
    );
    assert.equal(first.accepted, true);
    if (!first.accepted) {
      assert.fail("first retry was rejected");
    }
    const replay = mapOwnerRetryCommandV1(
      "failed",
      OwnerRetryCommandV1Schema.parse({ commandId: "cmd-retry" }),
      {
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-9",
        requestDigest: "digest-1",
        storedDigest: "digest-1",
        replay: first.response,
      },
    );
    assert.equal(replay.accepted, true);
    if (!replay.accepted) {
      assert.fail("replay was rejected");
    }
    assert.equal(replay.response.attemptId, "attempt-2");
    assert.equal(replay.response.predecessorAttemptId, "attempt-1");
  });

  it("rejects command replay when the digest differs and replays a successful answer", () => {
    const mismatch = mapOwnerRetryCommandV1(
      "failed",
      OwnerRetryCommandV1Schema.parse({ commandId: "cmd-retry" }),
      {
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-2",
        requestDigest: "digest-2",
        storedDigest: "digest-1",
        replay: {
          attemptId: "attempt-2",
          characterId: "char-1",
          kind: "revision",
          progress: null,
          predecessorAttemptId: "attempt-1",
        },
      },
    );
    assert.equal(mismatch.accepted, false);
    if (mismatch.accepted) {
      assert.fail("digest mismatch was accepted");
    }
    assert.equal(mismatch.errorCode, AUTHORING_COMMAND_DIGEST_MISMATCH);

    const firstAnswer = mapOwnerAnswerCommandV1(
      "needs_owner_answer",
      OwnerAnswerCommandV1Schema.parse({
        questionId: "question-1",
        commandId: "cmd-answer",
        answerKind: "choice",
        choiceId: "keep",
      }),
      {
        openQuestionId: "question-1",
        presentedChoiceIds: ["keep", "owner"],
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-3",
        requestDigest: "digest-answer",
      },
    );
    assert.equal(firstAnswer.accepted, true);
    if (!firstAnswer.accepted) {
      assert.fail("first answer was rejected");
    }
    const replayAnswer = mapOwnerAnswerCommandV1(
      "needs_owner_answer",
      OwnerAnswerCommandV1Schema.parse({
        questionId: "question-1",
        commandId: "cmd-answer",
        answerKind: "choice",
        choiceId: "keep",
      }),
      {
        openQuestionId: "question-1",
        presentedChoiceIds: ["keep", "owner"],
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-9",
        requestDigest: "digest-answer",
        storedDigest: "digest-answer",
        replay: firstAnswer.response,
      },
    );
    assert.equal(replayAnswer.accepted, true);
    if (!replayAnswer.accepted) {
      assert.fail("answer replay was rejected");
    }
    assert.equal(replayAnswer.response.attemptId, "attempt-3");
  });

  it("rejects unknown ownerInteraction on the strict review schema", () => {
    const parsed = SemanticAuthoringReviewV1Schema.safeParse({
      attemptId: "attempt-1",
      kind: "revision",
      status: "failed",
      assistantMessage: "Need an owner answer.",
      expiresAt: "2026-09-12T00:00:00.000Z",
      latestAttemptId: "attempt-1",
      stale: false,
      canAccept: false,
      failed: null,
      progress: null,
      ownerInteraction: { kind: "not-a-question" },
    });
    assert.equal(parsed.success, false);
  });
});
