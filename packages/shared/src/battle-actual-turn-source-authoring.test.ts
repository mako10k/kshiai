import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActualTurnInputDerivationFixtureCorpus,
} from "./battle-actual-turn-input-derivation-fixtures.js";
import {
  sha256ApplicabilityDerivationValue,
  stableApplicabilityDerivationJson,
  type AdaptiveStageReceiptArtifact,
  type CoarseProposalRegistryArtifact,
  type ConsistencyIssueSnapshotArtifact,
  type PurposeReadSetArtifact,
  type TurnFallbackPolicyArtifact,
} from "./battle-actual-turn-input-derivation.js";
import {
  ACTUAL_TURN_SOURCE_AUTHORING_CORE_BOUNDARIES,
  ACTUAL_TURN_SOURCE_AUTHORING_CORE_CASE_REFS,
  ActualTurnSourceAuthoringContextSchema,
  appendPurposeRead,
  authorAdaptiveStageReceipt,
  authorCoarseProposalRegistry,
  authorConsistencyIssueSnapshot,
  authorTurnFallbackPolicy,
  closePurposeReadSet,
  createActualTurnSourceAuthoringContext,
  mapBattleActionKindToAdaptiveActionKind,
  openPurposeReadSet,
  sealActualTurnSourceAuthoringContext,
  sourceAuthoringArtifactLeafPaths,
  type ActualTurnSourceAuthoringContext,
  type SourceAuthoringFieldProvenance,
  type SourceAuthoringReceipt,
  type SourceAuthoringTransitionResult,
} from "./battle-actual-turn-source-authoring.js";
import {
  ConsistencyIssuePocEnvelopeSchema,
  type ConsistencyIssuePocEnvelope,
} from "./battle-consistency-issue.js";
import type { ActionKind } from "./battle.js";

const TURN = 12;
const corpusPromise = buildActualTurnInputDerivationFixtureCorpus();

function accepted(
  result: SourceAuthoringTransitionResult,
): ActualTurnSourceAuthoringContext {
  assert.equal(result.status, "accepted");
  return result.context;
}

function artifactForKind<K extends
  | TurnFallbackPolicyArtifact["kind"]
  | CoarseProposalRegistryArtifact["kind"]
  | AdaptiveStageReceiptArtifact["kind"]
  | PurposeReadSetArtifact["kind"]
  | ConsistencyIssueSnapshotArtifact["kind"]>(
  source: Awaited<ReturnType<
    typeof buildActualTurnInputDerivationFixtureCorpus
  >>["cases"][number]["source"],
  kind: K,
) {
  const artifact = source.artifacts.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(artifact);
  return artifact as Extract<typeof artifact, { kind: K }>;
}

function issueEnvelope(
  snapshot: ConsistencyIssueSnapshotArtifact,
): ConsistencyIssuePocEnvelope {
  return ConsistencyIssuePocEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "shadow_issue_registry",
    revision: snapshot.payload.issues.length,
    nextIssueSequence: snapshot.payload.issues.length + 1,
    issues: snapshot.payload.issues.map((issue, index) => ({
      id: issue.id,
      fingerprint: `issue-fingerprint:${(index + 1).toString(16).padStart(8, "0")}`,
      kind: "reported_conflict",
      involvedFactRefs: issue.involvedFactRefs,
      involvedEntityRefs: issue.involvedEntityRefs,
      discoveredAt: { stage: "adjudication", turn: TURN },
      blocksPurposes: issue.blocksPurposes,
      status: issue.status,
      sourceRefs: [`source.synthetic.${index + 1}`],
      sourceKinds: ["llm_alert"],
      reporters: ["adjudicator"],
      reporterClaimsBlocking: issue.status !== "resolved",
      occurrenceCount: 1,
      lastObservedTurn: TURN,
      ...(issue.status === "resolved"
        ? {
            resolution: {
              resolutionRef: `repair.synthetic.${index + 1}`,
              resolvedAtTurn: TURN,
              summary: "Synthetic resolved issue for source-authoring tests.",
            },
          }
        : {}),
    })),
    lifecycleEvents: [],
  });
}

type OwnerSources = {
  policy: unknown;
  proposals: unknown;
  adaptive: unknown;
  reads: PurposeReadSetArtifact["payload"]["reads"];
  issues: unknown;
};

async function ownerSources(empty = false): Promise<OwnerSources> {
  const corpus = await corpusPromise;
  const fixture = corpus.cases.find((candidate) =>
    candidate.caseRef === (empty
      ? "X02_complete_empty"
      : "X01_complete_nonempty")
  );
  assert.ok(fixture);
  const policy = artifactForKind(fixture.source, "turn_fallback_policy");
  const proposals = artifactForKind(
    fixture.source,
    "coarse_proposal_registry",
  );
  const adaptive = artifactForKind(fixture.source, "adaptive_stage_receipt");
  const reads = artifactForKind(fixture.source, "purpose_read_set");
  const issues = artifactForKind(
    fixture.source,
    "consistency_issue_snapshot",
  );
  return {
    policy: {
      turn: TURN,
      allowedFallbacks: policy.payload.allowedFallbacks,
    },
    proposals: {
      turn: TURN,
      proposals: proposals.payload.proposals.map((proposal, index) =>
        proposal.actionKind === "world_process"
          ? {
              origin: "world_process",
              proposalRef: proposal.proposalRef,
              actionKind: "world_process",
            }
          : {
              origin: "character",
              proposalRef: proposal.proposalRef,
              action: {
                actorSide: index === 0 ? "a" : "b",
                kind: "free_action",
                description: "Reach toward the synthetic fixture target.",
                subjectRefs: ["contact:a:001"],
              },
            }
      ),
    },
    adaptive: {
      turn: TURN,
      receipt: adaptive.payload,
    },
    reads: reads.payload.reads,
    issues: {
      turn: TURN,
      envelope: issueEnvelope(issues),
    },
  };
}

async function authorPrefix(input: {
  caseRef: string;
  through:
    | "none"
    | "policy"
    | "proposals"
    | "adaptive"
    | "reads"
    | "issues";
  empty?: boolean;
  sources?: OwnerSources;
}): Promise<{
  context: ActualTurnSourceAuthoringContext;
  sources: OwnerSources;
}> {
  const sources = input.sources ?? await ownerSources(input.empty);
  let context = createActualTurnSourceAuthoringContext({
    caseRef: input.caseRef,
    turn: TURN,
  });
  if (input.through === "none") return { context, sources };
  context = accepted(await authorTurnFallbackPolicy(context, sources.policy));
  if (input.through === "policy") return { context, sources };
  context = accepted(
    await authorCoarseProposalRegistry(context, sources.proposals),
  );
  if (input.through === "proposals") return { context, sources };
  context = accepted(
    await authorAdaptiveStageReceipt(context, sources.adaptive),
  );
  if (input.through === "adaptive") return { context, sources };
  context = accepted(openPurposeReadSet(context));
  for (const read of sources.reads) {
    context = accepted(appendPurposeRead(context, {
      turn: TURN,
      sliceRef: read.sliceRef,
      check: read.check,
    }));
  }
  context = accepted(await closePurposeReadSet(context));
  if (input.through === "reads") return { context, sources };
  context = accepted(
    await authorConsistencyIssueSnapshot(context, sources.issues),
  );
  return { context, sources };
}

describe("actual-turn source authoring core PoC", () => {
  it("freezes the eleven core cases and the zero-effect boundary", () => {
    assert.deepEqual(ACTUAL_TURN_SOURCE_AUTHORING_CORE_CASE_REFS, [
      "C01_complete_nonempty",
      "C02_complete_empty",
      "C03_policy_missing",
      "C04_proposals_missing",
      "C05_adaptive_missing",
      "C06_reads_missing",
      "C07_issues_missing",
      "C08_duplicate_freeze",
      "C09_wrong_turn",
      "C10_digest_mismatch",
      "C11_dangling_refs",
    ]);
    assert.deepEqual(ACTUAL_TURN_SOURCE_AUTHORING_CORE_BOUNDARIES, {
      syntheticDataOnly: true,
      runtimeHooks: 0,
      backendImports: 0,
      repositoryReads: 0,
      databaseQueries: 0,
      networkCalls: 0,
      providerCalls: 0,
      externalLlmCalls: 0,
      xaiCalls: 0,
      canonicalWrites: 0,
      battleStateWrites: 0,
      persistenceWrites: 0,
    });
  });

  it("maps every requested ActionKind at the pre-resolution owner boundary", () => {
    const expected: Record<ActionKind, string> = {
      basic_attack: "basic_attack",
      skill: "skill",
      rest: "custom",
      defend: "defense",
      wait: "custom",
      free_action: "free_action",
    };
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(expected).map((kind) => [
          kind,
          mapBattleActionKindToAdaptiveActionKind(kind as ActionKind),
        ]),
      ),
      expected,
    );
  });

  it("authors the exact action-kind map into a proposal registry", async () => {
    const kinds = [
      "basic_attack",
      "skill",
      "rest",
      "defend",
      "wait",
      "free_action",
    ] as const satisfies readonly ActionKind[];
    let context = createActualTurnSourceAuthoringContext({
      caseRef: "A01_action_kind_map",
      turn: TURN,
    });
    context = accepted(await authorTurnFallbackPolicy(context, {
      turn: TURN,
      allowedFallbacks: [],
    }));
    context = accepted(await authorCoarseProposalRegistry(context, {
      turn: TURN,
      proposals: kinds.map((kind, index) => ({
        origin: "character",
        proposalRef: `proposal.map.${index}`,
        action: kind === "free_action"
          ? {
              actorSide: "a",
              kind,
              description: "Synthetic proposal mapping action.",
              subjectRefs: ["contact:a:001"],
            }
          : { actorSide: "a", kind },
      })),
    }));
    const proposalRecord = context.records.find((record) =>
      record.artifact.kind === "coarse_proposal_registry"
    );
    assert.ok(proposalRecord);
    assert.equal(proposalRecord.artifact.kind, "coarse_proposal_registry");
    if (proposalRecord.artifact.kind !== "coarse_proposal_registry") return;
    assert.deepEqual(
      proposalRecord.artifact.payload.proposals.map((proposal) =>
        proposal.actionKind
      ),
      ["basic_attack", "skill", "custom", "defense", "custom", "free_action"],
    );
    assert.equal(proposalRecord.receipt.inferredFieldCount, 0);
    assert.equal(
      proposalRecord.receipt.fieldProvenance
        .filter((entry) => entry.transform === "action_kind_map").length,
      kinds.length,
    );
  });

  it("C01 authors all five non-empty artifacts with exact provenance", async () => {
    const sources = await ownerSources();
    const sourcesBefore = stableApplicabilityDerivationJson(sources);
    const { context } = await authorPrefix({
      caseRef: "A01_source_authoring_nonempty",
      through: "issues",
      sources,
    });
    const result = await sealActualTurnSourceAuthoringContext(context);
    assert.equal(result.status, "complete", JSON.stringify(result));
    assert.equal(result.inferredFieldCount, 0);
    assert.equal(result.authoringReceipts.length, 5);
    assert.equal(result.context.sealed, true);
    for (const record of context.records) {
      const receipt: SourceAuthoringReceipt | undefined =
        result.authoringReceipts.find((candidate) =>
        candidate.artifactRef === record.artifact.artifactRef
      );
      assert.ok(receipt);
      assert.equal(receipt.inferredFieldCount, 0);
      assert.deepEqual(
        receipt.fieldProvenance
          .map((entry: SourceAuthoringFieldProvenance) =>
            `artifact.${entry.artifactPath}`
          )
          .sort(),
        sourceAuthoringArtifactLeafPaths(record.artifact),
      );
    }
    assert.equal(
      stableApplicabilityDerivationJson(sources),
      sourcesBefore,
    );
  });

  it("C02 accepts empty collections only after explicit close and skip", async () => {
    const { context } = await authorPrefix({
      caseRef: "A02_source_authoring_empty",
      through: "issues",
      empty: true,
    });
    const result = await sealActualTurnSourceAuthoringContext(context);
    assert.equal(result.status, "complete", JSON.stringify(result));
    assert.deepEqual(result.applicabilityInput, {
      allowedFallbacks: [],
      proposals: [],
      adaptive: { status: "skipped" },
      reads: [],
      issues: [],
    });

    const open = await authorPrefix({
      caseRef: "A02_empty_not_closed",
      through: "adaptive",
      empty: true,
    });
    const openContext = accepted(openPurposeReadSet(open.context));
    const incomplete = await sealActualTurnSourceAuthoringContext(openContext);
    assert.equal(incomplete.status, "insufficient_source");
    assert.ok(incomplete.reasons.includes("purpose_read_collector_not_closed"));
  });

  it("C03-C07 fail closed for each missing owner stage", async () => {
    const cases = [
      ["A03_policy_missing", "none", "turn_fallback_policy"],
      ["A04_proposals_missing", "policy", "coarse_proposal_registry"],
      ["A05_adaptive_missing", "proposals", "adaptive_stage_receipt"],
      ["A06_reads_missing", "adaptive", "purpose_read_set"],
      ["A07_issues_missing", "reads", "consistency_issue_snapshot"],
    ] as const;
    for (const [caseRef, through, missingKind] of cases) {
      const { context } = await authorPrefix({ caseRef, through });
      const result = await sealActualTurnSourceAuthoringContext(context);
      assert.equal(result.status, "insufficient_source", caseRef);
      assert.ok(result.missingArtifactKinds.includes(missingKind), caseRef);
      assert.equal("bundle" in result, false, caseRef);
      assert.equal("applicabilityInput" in result, false, caseRef);
    }
  });

  it("C08 rejects duplicate freeze without changing the accepted context", async () => {
    const { context, sources } = await authorPrefix({
      caseRef: "A08_duplicate_freeze",
      through: "policy",
    });
    const before = structuredClone(context);
    const duplicate = await authorTurnFallbackPolicy(context, sources.policy);
    assert.equal(duplicate.status, "rejected");
    assert.deepEqual(duplicate.reasons, [
      "duplicate_artifact:turn_fallback_policy",
    ]);
    assert.deepEqual(duplicate.context, before);
  });

  it("C09 rejects a wrong-turn source without creating an artifact", async () => {
    const context = createActualTurnSourceAuthoringContext({
      caseRef: "A09_wrong_turn",
      turn: TURN,
    });
    const result = await authorTurnFallbackPolicy(context, {
      turn: TURN + 1,
      allowedFallbacks: ["unknown"],
    });
    assert.equal(result.status, "rejected");
    assert.deepEqual(result.reasons, [
      "source_turn_mismatch:turn_fallback_policy",
    ]);
    assert.deepEqual(result.context, context);
  });

  it("C10 rejects payload tampering after an owner freeze", async () => {
    const { context } = await authorPrefix({
      caseRef: "A10_digest_mismatch",
      through: "issues",
    });
    const tampered = structuredClone(context);
    const policy = tampered.records.find((record) =>
      record.artifact.kind === "turn_fallback_policy"
    );
    assert.ok(policy);
    assert.equal(policy.artifact.kind, "turn_fallback_policy");
    if (policy.artifact.kind !== "turn_fallback_policy") return;
    policy.artifact.payload.allowedFallbacks = ["defense", "weak"];
    const result = await sealActualTurnSourceAuthoringContext(tampered);
    assert.equal(result.status, "invalid_source");
    assert.ok(result.reasons.some((reason) =>
      reason.startsWith("payload_digest_mismatch:")
    ), JSON.stringify(result));
  });

  it("C11 rejects an adaptive receipt with a dangling proposal", async () => {
    const sources = await ownerSources();
    const proposals = structuredClone(sources.proposals) as {
      proposals: Array<{ proposalRef: string }>;
    };
    proposals.proposals[0]!.proposalRef = `proposal:${"f".repeat(64)}`;
    const { context } = await authorPrefix({
      caseRef: "A11_dangling_refs",
      through: "issues",
      sources: { ...sources, proposals },
    });
    const result = await sealActualTurnSourceAuthoringContext(context);
    assert.equal(result.status, "invalid_source");
    assert.ok(result.reasons.some((reason) =>
      reason.startsWith("adaptive_proposal_missing:")
    ));
  });

  it("rejects proxy-shaped proposal input and implicit adaptive absence", async () => {
    const sources = await ownerSources();
    let context = createActualTurnSourceAuthoringContext({
      caseRef: "A03_proxy_rejected",
      turn: TURN,
    });
    context = accepted(await authorTurnFallbackPolicy(context, sources.policy));
    const proxy = await authorCoarseProposalRegistry(context, {
      ...(sources.proposals as object),
      resolvedActions: [{ kind: "basic_attack" }],
    });
    assert.equal(proxy.status, "rejected");
    assert.ok(proxy.reasons.some((reason) =>
      reason.startsWith("schema_invalid:coarse_proposal_registry:")
    ));
    context = accepted(
      await authorCoarseProposalRegistry(context, sources.proposals),
    );
    const absent = await authorAdaptiveStageReceipt(context, { turn: TURN });
    assert.equal(absent.status, "rejected");
    assert.ok(absent.reasons.some((reason) =>
      reason.startsWith("schema_invalid:adaptive_stage_receipt:")
    ));
  });

  it("keeps one deterministic bundle digest over twenty complete replays", async () => {
    const digests = new Set<string>();
    for (let replay = 0; replay < 20; replay += 1) {
      const { context } = await authorPrefix({
        caseRef: "A01_source_authoring_nonempty",
        through: "issues",
      });
      ActualTurnSourceAuthoringContextSchema.parse(context);
      const result = await sealActualTurnSourceAuthoringContext(context);
      assert.equal(result.status, "complete", JSON.stringify(result));
      digests.add(await sha256ApplicabilityDerivationValue(result.bundle));
    }
    assert.equal(digests.size, 1);
  });

  it("detects concurrent source mutation and retains the prior context", async () => {
    const context = createActualTurnSourceAuthoringContext({
      caseRef: "A10_source_mutation",
      turn: TURN,
    });
    const source = { turn: TURN, allowedFallbacks: ["unknown"] };
    const pending = authorTurnFallbackPolicy(context, source);
    source.allowedFallbacks = ["defense"];
    const result = await pending;
    assert.equal(result.status, "rejected");
    assert.deepEqual(result.reasons, ["source_changed_during_authoring"]);
    assert.deepEqual(result.context, context);
  });
});
