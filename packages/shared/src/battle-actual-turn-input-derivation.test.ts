import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS,
  ActualTurnInputDerivationFixtureCorpusSchema,
  buildActualTurnInputDerivationFixtureCorpus,
} from "./battle-actual-turn-input-derivation-fixtures.js";
import {
  ACTUAL_TURN_INPUT_DERIVATION_FIELDS,
  ApplicabilityDerivationResultSchema,
  deriveActualTurnApplicabilityInput,
  sha256ApplicabilityDerivationValue,
  stableApplicabilityDerivationJson,
  type ApplicabilityDerivationArtifact,
  type ApplicabilityDerivationResult,
  type ApplicabilityDerivationSourceBundle,
} from "./battle-actual-turn-input-derivation.js";

const corpusPromise = buildActualTurnInputDerivationFixtureCorpus();

function artifactForKind<K extends ApplicabilityDerivationArtifact["kind"]>(
  source: ApplicabilityDerivationSourceBundle,
  kind: K,
): Extract<ApplicabilityDerivationArtifact, { kind: K }> {
  const artifact = source.artifacts.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(artifact);
  return artifact as Extract<ApplicabilityDerivationArtifact, { kind: K }>;
}

async function reseal(artifact: ApplicabilityDerivationArtifact): Promise<void> {
  artifact.payloadSha256 = await sha256ApplicabilityDerivationValue(
    artifact.payload,
  );
}

function assertExpectedResult(
  result: ApplicabilityDerivationResult,
  expected: Awaited<ReturnType<
    typeof buildActualTurnInputDerivationFixtureCorpus
  >>["cases"][number]["expected"],
): void {
  ApplicabilityDerivationResultSchema.parse(result);
  assert.equal(result.status, expected.status);
  assert.equal(result.inferredFieldCount, 0);
  if (expected.status === "complete") {
    assert.equal(result.status, "complete");
    assert.deepEqual(
      Object.keys(result.provenance),
      ACTUAL_TURN_INPUT_DERIVATION_FIELDS,
    );
    return;
  }
  assert.equal("applicabilityInput" in result, false);
  if (expected.status === "insufficient_source") {
    assert.equal(result.status, "insufficient_source");
    const unavailable = new Set([
      ...expected.missingFields,
      ...expected.ambiguousFields,
    ]);
    assert.deepEqual(
      result.availableFields,
      ACTUAL_TURN_INPUT_DERIVATION_FIELDS.filter((field) =>
        !unavailable.has(field)
      ),
    );
    assert.deepEqual(result.missingFields, expected.missingFields);
    assert.deepEqual(result.ambiguousFields, expected.ambiguousFields);
    assert.deepEqual(
      result.forbiddenProxyKinds,
      expected.forbiddenProxyKinds,
    );
    return;
  }
  assert.equal(result.status, "invalid_source");
  for (const prefix of expected.reasonPrefixes) {
    assert.ok(result.reasons.some((reason) => reason.startsWith(prefix)));
  }
}

describe("actual-turn applicability input derivation PoC", () => {
  it("freezes exactly the twenty preregistered synthetic cases", async () => {
    const corpus = await corpusPromise;
    ActualTurnInputDerivationFixtureCorpusSchema.parse(corpus);
    assert.deepEqual(
      corpus.cases.map((fixture) => fixture.caseRef),
      ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS,
    );
    assert.deepEqual(corpus.boundaries, {
      syntheticDataOnly: true,
      runtimeHooks: 0,
      repositoryReads: 0,
      databaseQueries: 0,
      networkCalls: 0,
      providerCalls: 0,
      externalLlmCalls: 0,
      xaiCalls: 0,
      canonicalWrites: 0,
      persistenceWrites: 0,
    });
  });

  it("matches every frozen disposition without inferred fields", async () => {
    const corpus = await corpusPromise;
    for (const fixture of corpus.cases) {
      const result = await deriveActualTurnApplicabilityInput(fixture.source);
      assertExpectedResult(result, fixture.expected);
    }
  });

  it("emits complete field-level provenance only from the five artifacts", async () => {
    const corpus = await corpusPromise;
    const completeCases = corpus.cases.filter((fixture) =>
      fixture.expected.status === "complete"
    );
    assert.ok(completeCases.length > 0);
    for (const fixture of completeCases) {
      const result = await deriveActualTurnApplicabilityInput(fixture.source);
      assert.equal(result.status, "complete");
      const expectedKinds = {
        allowedFallbacks: "turn_fallback_policy",
        proposals: "coarse_proposal_registry",
        adaptive: "adaptive_stage_receipt",
        reads: "purpose_read_set",
        issues: "consistency_issue_snapshot",
      } as const;
      for (const field of ACTUAL_TURN_INPUT_DERIVATION_FIELDS) {
        const artifact = artifactForKind(fixture.source, expectedKinds[field]);
        assert.equal(
          result.provenance[field].artifactRef,
          artifact.artifactRef,
        );
        assert.equal(
          result.provenance[field].payloadSha256,
          artifact.payloadSha256,
        );
        assert.ok(result.provenance[field].sourcePaths.length > 0);
      }
    }
  });

  it("maps only the exact frozen source fields into complete inputs", async () => {
    const corpus = await corpusPromise;
    const nonempty = corpus.cases.find((fixture) =>
      fixture.caseRef === "X01_complete_nonempty"
    );
    const empty = corpus.cases.find((fixture) =>
      fixture.caseRef === "X02_complete_empty"
    );
    assert.ok(nonempty);
    assert.ok(empty);
    const result = await deriveActualTurnApplicabilityInput(nonempty.source);
    assert.equal(result.status, "complete");
    const policy = artifactForKind(
      nonempty.source,
      "turn_fallback_policy",
    );
    const proposals = artifactForKind(
      nonempty.source,
      "coarse_proposal_registry",
    );
    const adaptive = artifactForKind(
      nonempty.source,
      "adaptive_stage_receipt",
    );
    const reads = artifactForKind(nonempty.source, "purpose_read_set");
    const issues = artifactForKind(
      nonempty.source,
      "consistency_issue_snapshot",
    );
    assert.deepEqual(
      result.applicabilityInput.allowedFallbacks,
      policy.payload.allowedFallbacks,
    );
    assert.deepEqual(
      result.applicabilityInput.proposals,
      proposals.payload.proposals,
    );
    assert.equal(adaptive.payload.status, "executed");
    if (adaptive.payload.status !== "executed") return;
    assert.equal(result.applicabilityInput.adaptive.status, "executed");
    if (result.applicabilityInput.adaptive.status !== "executed") return;
    assert.deepEqual(
      result.applicabilityInput.adaptive.contestedClaimRefs,
      adaptive.payload.result.contestedClaimRefs,
    );
    assert.deepEqual(
      result.applicabilityInput.reads,
      reads.payload.reads.map((read) => ({
        sliceRef: read.sliceRef,
        consistencyLevel: read.check.consistency.level,
        blockingIssueRefs: read.check.blockingIssueRefs,
      })),
    );
    assert.deepEqual(
      result.applicabilityInput.issues,
      issues.payload.issues.map((issue) => ({
        issueRef: issue.id,
        status: issue.status,
      })),
    );
    const emptyResult = await deriveActualTurnApplicabilityInput(empty.source);
    assert.equal(emptyResult.status, "complete");
    assert.deepEqual(emptyResult.applicabilityInput, {
      allowedFallbacks: [],
      proposals: [],
      adaptive: { status: "skipped" },
      reads: [],
      issues: [],
    });
  });

  it("preserves every input and returns one output digest over twenty replays", async () => {
    const corpus = await corpusPromise;
    for (const fixture of corpus.cases) {
      const sourceBefore = stableApplicabilityDerivationJson(fixture.source);
      const sourceDigestBefore = await sha256ApplicabilityDerivationValue(
        fixture.source,
      );
      const outputDigests = new Set<string>();
      for (let replay = 0; replay < 20; replay += 1) {
        const result = await deriveActualTurnApplicabilityInput(fixture.source);
        outputDigests.add(await sha256ApplicabilityDerivationValue(result));
      }
      assert.equal(outputDigests.size, 1, fixture.caseRef);
      assert.equal(
        stableApplicabilityDerivationJson(fixture.source),
        sourceBefore,
        fixture.caseRef,
      );
      assert.equal(
        await sha256ApplicabilityDerivationValue(fixture.source),
        sourceDigestBefore,
        fixture.caseRef,
      );
    }
  });

  it("rejects a source that changes while payload digests are checked", async () => {
    const corpus = await corpusPromise;
    const source = structuredClone(corpus.cases[0]!.source);
    const pending = deriveActualTurnApplicabilityInput(source);
    source.observedProxyKinds.push("events_or_parameter_deltas");
    const result = await pending;
    assert.deepEqual(result, {
      status: "invalid_source",
      reasons: ["source_changed_during_derivation"],
      inferredFieldCount: 0,
    });
  });

  it("rejects adaptive receipts for proposals absent from the registry", async () => {
    const corpus = await corpusPromise;
    const source = structuredClone(corpus.cases[0]!.source);
    const adaptive = artifactForKind(source, "adaptive_stage_receipt");
    assert.equal(adaptive.payload.status, "executed");
    if (adaptive.payload.status !== "executed") return;
    adaptive.payload.result.receipts[0]!.proposalRef =
      `proposal:${"a".repeat(64)}`;
    await reseal(adaptive);
    const result = await deriveActualTurnApplicabilityInput(source);
    assert.equal(result.status, "invalid_source");
    if (result.status !== "invalid_source") return;
    assert.deepEqual(result.reasons, [
      `adaptive_proposal_missing:proposal:${"a".repeat(64)}`,
    ]);
  });

  it("rejects resolved issues presented as blocking read issues", async () => {
    const corpus = await corpusPromise;
    const source = structuredClone(corpus.cases[0]!.source);
    const issues = artifactForKind(source, "consistency_issue_snapshot");
    const reads = artifactForKind(source, "purpose_read_set");
    const blockingRef = reads.payload.reads
      .flatMap((read) => read.check.blockingIssueRefs)[0];
    assert.ok(blockingRef);
    const issue = issues.payload.issues.find((candidate) =>
      candidate.id === blockingRef
    );
    assert.ok(issue);
    issue.status = "resolved";
    await reseal(issues);
    const result = await deriveActualTurnApplicabilityInput(source);
    assert.equal(result.status, "invalid_source");
    if (result.status !== "invalid_source") return;
    assert.deepEqual(result.reasons, [
      `blocking_issue_resolved:${blockingRef}`,
    ]);
  });

  it("rejects non-opaque observation references after source mapping", async () => {
    const corpus = await corpusPromise;
    const source = structuredClone(corpus.cases[0]!.source);
    const proposals = artifactForKind(source, "coarse_proposal_registry");
    const adaptive = artifactForKind(source, "adaptive_stage_receipt");
    proposals.payload.proposals[0]!.proposalRef = "proposal.not-opaque";
    assert.equal(adaptive.payload.status, "executed");
    if (adaptive.payload.status !== "executed") return;
    adaptive.payload.result.receipts[0]!.proposalRef = "proposal.not-opaque";
    await Promise.all([reseal(proposals), reseal(adaptive)]);
    const result = await deriveActualTurnApplicabilityInput(source);
    assert.equal(result.status, "invalid_source");
    if (result.status !== "invalid_source") return;
    assert.ok(result.reasons.some((reason) =>
      reason.includes("reference must be an opaque proposal SHA-256 token")
    ));
  });
});
