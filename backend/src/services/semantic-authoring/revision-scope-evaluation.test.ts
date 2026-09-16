import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterRevisionScopeCandidateV1Schema,
  evaluateCharacterRevisionScopeCandidateV1,
} from "./revision-scope-evaluation.js";

describe("character revision scope evaluation", () => {
  it("classifies the existing focused appearance revision as one cluster", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "外套を青に変更",
      expectation: { kind: "resolved", clusters: ["appearance"] },
      candidate: {
        kind: "resolved",
        clusters: ["appearance"],
        evidence: [{ sourceQuote: "外套を青に変更", clusters: ["appearance"] }],
      },
    });

    assert.deepEqual(result, {
      outcome: "single_cluster",
      clusters: ["appearance"],
    });
  });

  it("preserves both parts of a controlled cross-cluster revision", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "戦い方を荒々しくし、口調もぶっきらぼうに",
      expectation: { kind: "resolved", clusters: ["mechanics", "relationship-expression"] },
      candidate: {
        kind: "resolved",
        clusters: ["mechanics", "relationship-expression"],
        evidence: [
          { sourceQuote: "戦い方を荒々しく", clusters: ["mechanics"] },
          { sourceQuote: "口調もぶっきらぼうに", clusters: ["relationship-expression"] },
        ],
      },
    });

    assert.deepEqual(result, {
      outcome: "cross_cluster",
      clusters: ["mechanics", "relationship-expression"],
    });
  });

  it("keeps materially different interpretations ambiguous", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "もっと鋭い感じにして",
      expectation: {
        kind: "ambiguous",
        alternativeScopes: [["appearance"], ["mechanics"]],
      },
      candidate: {
        kind: "ambiguous",
        sourceQuote: "鋭い感じ",
        unsafeReason: "外見と戦い方では変更される意味が異なる",
        alternatives: [
          { id: "appearance", clusters: ["appearance"], effect: "外見の印象を鋭くする" },
          { id: "mechanics", clusters: ["mechanics"], effect: "戦い方を鋭くする" },
        ],
      },
    });

    assert.deepEqual(result, {
      outcome: "ambiguous",
      alternativeScopes: [["appearance"], ["mechanics"]],
    });
  });

  it("rejects strict-schema violations and duplicate clusters", () => {
    assert.equal(CharacterRevisionScopeCandidateV1Schema.safeParse({
      kind: "resolved",
      clusters: ["appearance"],
      evidence: [{ sourceQuote: "外套", clusters: ["appearance"] }],
      extra: true,
    }).success, false);
    assert.equal(CharacterRevisionScopeCandidateV1Schema.safeParse({
      kind: "resolved",
      clusters: ["appearance", "appearance"],
      evidence: [{ sourceQuote: "外套", clusters: ["appearance"] }],
    }).success, false);
  });

  it("reports a scope that exceeds the trusted corpus label", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "外套を青に変更",
      expectation: { kind: "resolved", clusters: ["appearance"] },
      candidate: {
        kind: "resolved",
        clusters: ["appearance", "mechanics"],
        evidence: [{ sourceQuote: "外套を青に変更", clusters: ["appearance", "mechanics"] }],
      },
    });

    assert.deepEqual(result, {
      outcome: "over_broad",
      clusters: ["appearance", "mechanics"],
      unexpectedClusters: ["mechanics"],
    });
  });

  it("rejects a single-cluster result that drops part of the trusted request", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "戦い方を荒々しくし、口調もぶっきらぼうに",
      expectation: { kind: "resolved", clusters: ["mechanics", "relationship-expression"] },
      candidate: {
        kind: "resolved",
        clusters: ["mechanics"],
        evidence: [{ sourceQuote: "戦い方を荒々しく", clusters: ["mechanics"] }],
      },
    });

    assert.deepEqual(result, {
      outcome: "invalid",
      reason: "missing_expected_cluster",
      missingClusters: ["relationship-expression"],
    });
  });

  it("rejects evidence that is not quoted from the request", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "外套を青に変更",
      expectation: { kind: "resolved", clusters: ["appearance"] },
      candidate: {
        kind: "resolved",
        clusters: ["appearance"],
        evidence: [{ sourceQuote: "髪型を変更", clusters: ["appearance"] }],
      },
    });

    assert.deepEqual(result, {
      outcome: "invalid",
      reason: "ungrounded_source_quote",
    });
  });

  it("grounds a lexical quote across Japanese decorative quotation marks", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "口調を丁寧にして、相手を『あなた』と呼ぶようにして",
      expectation: { kind: "resolved", clusters: ["relationship-expression"] },
      candidate: {
        kind: "resolved",
        clusters: ["relationship-expression"],
        evidence: [
          { sourceQuote: "丁寧にして", clusters: ["relationship-expression"] },
          { sourceQuote: "あなたと呼ぶようにして", clusters: ["relationship-expression"] },
        ],
      },
    });

    assert.deepEqual(result, {
      outcome: "single_cluster",
      clusters: ["relationship-expression"],
    });
  });

  it("rejects certainty when the trusted corpus requires an owner choice", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "もっと鋭い感じにして",
      expectation: {
        kind: "ambiguous",
        alternativeScopes: [["appearance"], ["mechanics"]],
      },
      candidate: {
        kind: "resolved",
        clusters: ["appearance"],
        evidence: [{ sourceQuote: "鋭い感じ", clusters: ["appearance"] }],
      },
    });

    assert.deepEqual(result, {
      outcome: "invalid",
      reason: "expected_ambiguity",
    });
  });

  it("rejects ambiguity when the trusted request has one safe scope", () => {
    const result = evaluateCharacterRevisionScopeCandidateV1({
      request: "外套を青に変更",
      expectation: { kind: "resolved", clusters: ["appearance"] },
      candidate: {
        kind: "ambiguous",
        sourceQuote: "外套を青に変更",
        unsafeReason: "不要な曖昧性",
        alternatives: [
          { id: "appearance", clusters: ["appearance"], effect: "外套の色を変える" },
          { id: "mechanics", clusters: ["mechanics"], effect: "戦い方を変える" },
        ],
      },
    });

    assert.deepEqual(result, {
      outcome: "invalid",
      reason: "unexpected_ambiguity",
    });
  });
});
