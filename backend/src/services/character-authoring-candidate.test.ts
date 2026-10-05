// R: Lock complete, mode-specific owner review of persisted V3 candidates.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedCandidateOwnerReview } from "./character-authoring-candidate.js";
import { createV3StageTrialCandidate, createV3StageTrialSource } from "../fixtures/neva-v3.js";

describe("V3 persisted candidate owner review", () => {
  it("preserves plain revision instructions and displays the frozen baseline for changed and unchanged fields", () => {
    const current = createV3StageTrialCandidate();
    const candidate = structuredClone(current);
    const guidance = candidate.definition.consciousGuidance[0];
    assert.ok(guidance);
    guidance.priority += 1;
    const source = "意識上の指針の優先度を1上げる";
    const review = fixedCandidateOwnerReview(candidate, source, { kind: "revision", currentCandidate: current });
    assert.ok(review.semanticCandidateReview);
    const fields = review.semanticCandidateReview.fields;
    assert.equal(fields.find((field) => field.key === "revisionSource")?.source, source);
    assert.equal(fields.find((field) => field.key === "revisionSource")?.candidate, source);
    const change = fields.find((field) => field.key === "definition.consciousGuidance");
    assert.equal(change?.source, JSON.stringify(current.definition.consciousGuidance, null, 2));
    assert.equal(change?.candidate, JSON.stringify(candidate.definition.consciousGuidance, null, 2));
    assert.notEqual(change?.source, change?.candidate);
    const unchanged = fields.find((field) => field.key === "definition.identity");
    assert.equal(unchanged?.source, unchanged?.candidate);
    assert.ok(review.semanticCandidateReview.limitation.includes("編集開始時の不変世代"));
  });

  it("keeps the full fixed-create source and candidate disclosure", () => {
    const candidate = createV3StageTrialCandidate();
    const source = createV3StageTrialSource();
    const review = fixedCandidateOwnerReview(candidate, JSON.stringify(source));
    assert.ok(review.semanticCandidateReview);
    assert.equal(review.semanticCandidateReview.fields[0]?.key, "createSource");
    assert.equal(review.semanticCandidateReview.fields[0]?.candidate, JSON.stringify(source, null, 2));
    assert.equal(review.semanticCandidateReview.fields.filter((field) => field.key.startsWith("definition.")).length, Object.keys(candidate.definition).length);
  });
});
