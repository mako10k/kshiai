import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTUAL_TURN_SHADOW_CAPTURE_VERSION,
  ActualTurnShadowObservationEnvelopeSchema,
  type ActualTurnShadowObservationEnvelope,
} from "./battle-actual-turn-shadow-observation.js";

function digest(character: string): string {
  return character.repeat(64);
}

function reference(
  kind: "proposal" | "claim" | "slice" | "issue" | "fact",
  character: string,
): string {
  return `${kind}:${digest(character)}`;
}

function envelope(): ActualTurnShadowObservationEnvelope {
  const issueRef = reference("issue", "e");
  return ActualTurnShadowObservationEnvelopeSchema.parse({
    schemaVersion: 1,
    observationId: `observation:${digest("a")}`,
    source: {
      battleRefHash: digest("b"),
      turn: 12,
      capturedAt: "2026-08-06T00:00:00.000Z",
      captureVersion: ACTUAL_TURN_SHADOW_CAPTURE_VERSION,
    },
    applicabilityInput: {
      allowedFallbacks: ["unknown"],
      proposals: [{
        proposalRef: reference("proposal", "c"),
        actionKind: "custom",
      }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [reference("claim", "d")],
        receipts: [{
          proposalRef: reference("proposal", "c"),
          resolution: "degraded",
          outcome: "indeterminate",
          failureReason: "budget_exhausted",
          fallbackFact: {
            factRef: reference("fact", "f"),
            strength: "unknown",
          },
        }],
      },
      reads: [{
        sliceRef: reference("slice", "1"),
        consistencyLevel: "conflicted",
        blockingIssueRefs: [issueRef],
      }],
      issues: [{ issueRef, status: "open" }],
    },
    authorityEvidence: {
      sourceBeforeDigest: digest("2"),
      sourceAfterDigest: digest("2"),
      authoritativeOutcomeDigest: digest("3"),
      battleResultChanged: false,
      canonicalCommitCount: 0,
      persistenceWriteCount: 0,
      addedExternalLlmCalls: 0,
      addedXaiCalls: 0,
    },
    privacyEvidence: {
      canonicalIdentifiersIncluded: false,
      characterNamesIncluded: false,
      speechOrNarrationIncluded: false,
      promptOrProviderPayloadIncluded: false,
      mediaUrlsIncluded: false,
    },
  });
}

describe("actual-turn shadow-observation envelope", () => {
  it("accepts only the fixed privacy-safe read-only contract", () => {
    const parsed = ActualTurnShadowObservationEnvelopeSchema.parse(envelope());

    assert.equal(parsed.schemaVersion, 1);
    assert.equal(
      parsed.authorityEvidence.sourceBeforeDigest,
      parsed.authorityEvidence.sourceAfterDigest,
    );
    assert.deepEqual(parsed.privacyEvidence, {
      canonicalIdentifiersIncluded: false,
      characterNamesIncluded: false,
      speechOrNarrationIncluded: false,
      promptOrProviderPayloadIncluded: false,
      mediaUrlsIncluded: false,
    });
  });

  it("rejects canonical-looking refs and source mutation claims", () => {
    const unsafeRef = structuredClone(envelope()) as unknown as {
      applicabilityInput: { proposals: Array<{ proposalRef: string }> };
    };
    unsafeRef.applicabilityInput.proposals[0]!.proposalRef = "character.a";
    assert.equal(
      ActualTurnShadowObservationEnvelopeSchema.safeParse(unsafeRef).success,
      false,
    );

    const mutated = structuredClone(envelope()) as unknown as {
      authorityEvidence: { sourceAfterDigest: string };
    };
    mutated.authorityEvidence.sourceAfterDigest = digest("4");
    assert.equal(
      ActualTurnShadowObservationEnvelopeSchema.safeParse(mutated).success,
      false,
    );

    const identityLeak = {
      ...envelope(),
      characterName: "must-not-be-accepted",
    };
    assert.equal(
      ActualTurnShadowObservationEnvelopeSchema.safeParse(identityLeak).success,
      false,
    );
  });
});
