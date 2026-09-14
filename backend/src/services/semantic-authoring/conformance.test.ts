import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHORING_OWNER_ANSWER_REQUIRED,
  AUTHORING_RETRY_NOT_ALLOWED,
  AssetAuthoringAttemptStatusSchema,
  OwnerInteractionV1Schema,
  OwnerRetryCommandV1Schema,
  createSemanticProposalV1Schema,
  type AdapterProgressObservationV1,
  type SemanticAuthoringAdapterV1,
  type SemanticAuthoringPolicyV1,
  type SemanticAuthoringReservationV1,
  type SemanticAuthoringRunV1,
} from "@kshiai/shared";
import { z } from "zod";
import { createBattlefieldConformanceAdapter } from "./adapters/battlefield-conformance.js";
import { createCharacterSemanticAuthoringAdapterV3 } from "./adapters/character-v3.js";
import { createNarrationConformanceAdapter } from "./adapters/narration-conformance.js";
import {
  mapOwnerRetryCommandV1,
  mapSemanticAuthoringResultToPublicV1,
} from "./public-mapping.js";
import type {
  FamilyConformanceProposalV1,
  FamilyConformanceSourceV1,
} from "./adapters/family-conformance.js";
import {
  applySemanticAuthoringProposalV1,
  selectSemanticAuthoringWorkV1,
  startSemanticAuthoringV1,
} from "./orchestration.js";
import {
  acceptSemanticAuthoringDeliveryV1,
  expireOutstandingSemanticAuthoringV1,
  scheduleSemanticAuthoringReservationV1,
} from "./ports.js";
import { createScriptedSemanticAuthoringPortsV1 } from "./scripted-ports.js";
import { classifyProgressCondition } from "./progress-monitor.js";

const familyProposalSchema = createSemanticProposalV1Schema(
  "family_conformance_proposal_v1",
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("set_display_name"),
      value: z.string().min(1).max(48),
    }).strict(),
    z.object({
      kind: z.literal("record_disposition"),
    }).strict(),
  ]),
);

const policy: SemanticAuthoringPolicyV1 = {
  identity: "semantic_authoring_policy_v1",
  maxConcurrentProviderRequests: 1,
  maxLlmCalls: 8,
  maxCountedSteps: 48,
  maxAttemptElapsedMs: 240_000,
  maxProviderCallElapsedMs: 60_000,
  maxInputTokensPerCall: 6_000,
  maxInputBytesPerCall: 24_576,
  maxOutputTokensPerCall: 1_500,
  maxOutputBytesPerCall: 6_144,
  maxCumulativeInputTokens: 32_000,
  maxCumulativeOutputTokens: 8_000,
  maxCostMicroUsd: 500_000,
  maxProgressObservations: 8,
  maxRecoveryStrategyChanges: 2,
  pricingIdentity: "pricing-v1",
  tokenEstimatorIdentity: "bytes-upper-bound-v1",
};

const issues = {
  revisionMismatch: { key: "revision", finding: "stale revision" },
  proposalRejected: { key: "proposal", finding: "rejected proposal" },
  referenceCheckFailed: { key: "reference", finding: "missing reference" },
};

function familyEnvelope(
  payload: { kind: "set_display_name"; value: string } | { kind: "record_disposition" },
  affectedObligationIds: string[],
) {
  return familyProposalSchema.parse({
    proposalId: "proposal-1",
    runId: "run-1",
    workItemId: payload.kind === "record_disposition" ? "ledger" : "identity",
    baseCandidateRevision: 0,
    capabilitySessionId: "session-1",
    proposalSchemaIdentity: "family_conformance_proposal_v1",
    sourceClaimIds: ["source-1"],
    affectedObligationIds,
    declaredSemanticDependantIds: [],
    provenance: [{
      targetClaimId: "identity",
      sourceClaimIds: ["source-1"],
      method: "generated",
    }],
    ownerExplanation: "Focused family proposal.",
    uncertainty: [],
    payload,
  });
}

function assertCreateHasWork<S, C, O, W, P, F, Q, A, FC>(
  adapter: SemanticAuthoringAdapterV1<S, C, O, W, P, F, Q, A, FC>,
) {
  const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "sparse source" });
  assert.equal(source.accepted, true);
  if (!source.accepted) {
    assert.fail(`${adapter.identity} rejected create source`);
  }
  const baseline = adapter.buildBaseline(source.value, "create");
  const work = adapter.selectWork({
    candidate: baseline.candidate,
    obligations: baseline.obligations,
    findings: new Map(),
  });
  assert.equal(work.selected, true);
  if (!work.selected) {
    assert.fail(`${adapter.identity} had no create work`);
  }
  const tools = adapter.describeCapabilities(work.workItem);
  assert.equal(tools.allowedSelectors.includes("preservation-capsule"), false);
  return { source: source.value, baseline, work };
}

function completeFamilyCreate<Candidate>(
  adapter: SemanticAuthoringAdapterV1<
    FamilyConformanceSourceV1,
    Candidate,
    string,
    string,
    FamilyConformanceProposalV1,
    string,
    string,
    string,
    Candidate
  >,
) {
  const started = assertCreateHasWork(adapter);
  const staged = adapter.stageProposal({
    candidate: started.baseline.candidate,
    obligations: started.baseline.obligations,
    findings: new Map(),
    proposal: familyEnvelope({ kind: "set_display_name", value: "完成名" }, ["identity"]),
  });
  assert.equal(staged.accepted, true);
  if (!staged.accepted) {
    assert.fail(`${adapter.identity} stage rejected`);
  }
  const finalized = adapter.finalize({
    candidate: staged.candidate,
    obligations: staged.obligations,
    findings: staged.findings,
  });
  assert.equal(finalized.accepted, true);
}

const observation = (
  digest: string,
  materialProgress: boolean,
): AdapterProgressObservationV1 => ({
  phase: "identity",
  resolvedRequiredObligationCount: materialProgress ? 1 : 0,
  coveredMaterialClaimCount: materialProgress ? 1 : 0,
  unresolvedMaterialFindingKeys: [],
  relevantStateDigest: digest,
  activeSemanticClusterKey: "identity",
  materialProgress,
});

describe("semantic authoring adapter conformance", () => {
  it("F1 sparse create starts focused work for every family and completes family adapters", () => {
    assertCreateHasWork(createCharacterSemanticAuthoringAdapterV3());
    completeFamilyCreate(createBattlefieldConformanceAdapter());
    completeFamilyCreate(createNarrationConformanceAdapter());
  });

  it("F2 revision of a named family definition does not reopen identity", () => {
    const adapter = createBattlefieldConformanceAdapter();
    const created = adapter.decodeFrozenSource({ kind: "create", naturalText: "森" });
    if (!created.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(created.value, "create");
    const named = adapter.stageProposal({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
      proposal: familyEnvelope({ kind: "set_display_name", value: "霧の闘技場" }, ["identity"]),
    });
    if (!named.accepted) {
      assert.fail("name stage rejected");
    }
    const reviseSource = adapter.decodeFrozenSource({
      kind: "revise",
      definition: named.candidate,
    });
    assert.equal(reviseSource.accepted, true);
    if (!reviseSource.accepted) {
      assert.fail("revise source rejected");
    }
    const revised = adapter.buildBaseline(reviseSource.value, "revise");
    const work = adapter.selectWork({
      candidate: revised.candidate,
      obligations: revised.obligations,
      findings: new Map(),
    });
    assert.equal(work.selected, false);
  });

  it("F3 migrate exposes the capsule only on ledger work", () => {
    const adapter = createNarrationConformanceAdapter();
    const created = adapter.decodeFrozenSource({ kind: "create", naturalText: "語り" });
    if (!created.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(created.value, "create");
    const named = adapter.stageProposal({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
      proposal: familyEnvelope({ kind: "set_display_name", value: "古風" }, ["identity"]),
    });
    if (!named.accepted) {
      assert.fail("name stage rejected");
    }
    const migrateSource = adapter.decodeFrozenSource({
      kind: "migrate",
      definition: named.candidate,
    });
    if (!migrateSource.accepted) {
      assert.fail("migrate source rejected");
    }
    const migrated = adapter.buildBaseline(migrateSource.value, "migrate");
    const work = adapter.selectWork({
      candidate: migrated.candidate,
      obligations: migrated.obligations,
      findings: new Map(),
    });
    assert.equal(work.selected, true);
    if (!work.selected) {
      assert.fail("migrate had no ledger work");
    }
    const tools = adapter.describeCapabilities(work.workItem);
    assert.equal(tools.allowedSelectors.includes("preservation-capsule"), true);
    const createTools = adapter.describeCapabilities("identity");
    assert.equal(createTools.allowedSelectors.includes("preservation-capsule"), false);
  });

  it("F4 focused repair retains prior valid work after a rejected proposal", () => {
    const adapter = createBattlefieldConformanceAdapter();
    const started = assertCreateHasWork(adapter);
    const first = adapter.stageProposal({
      candidate: started.baseline.candidate,
      obligations: started.baseline.obligations,
      findings: new Map(),
      proposal: familyEnvelope({ kind: "set_display_name", value: "保持名" }, ["identity"]),
    });
    assert.equal(first.accepted, true);
    if (!first.accepted) {
      assert.fail("first valid stage rejected");
    }
    const rejected = adapter.decodeProposal(started.work.workItem, { not: "a proposal" });
    assert.equal(rejected.accepted, false);
    assert.equal(first.candidate.displayName, "保持名");
    assert.equal(first.obligations.get("identity"), "resolved");
  });

  it("F5 minor contradiction does not force an owner question", () => {
    const adapter = createBattlefieldConformanceAdapter();
    const started = assertCreateHasWork(adapter);
    const assessment = adapter.assessQuestion({
      candidate: started.baseline.candidate,
      obligations: started.baseline.obligations,
      findings: new Map([["minor", "adaptable contradiction"]]),
    });
    assert.equal(assessment.ask, false);
  });

  it("F6 protected contradiction maps to a question, not a silent review", () => {
    const adapter = createBattlefieldConformanceAdapter();
    const started = assertCreateHasWork(adapter);
    const named = adapter.stageProposal({
      candidate: started.baseline.candidate,
      obligations: started.baseline.obligations,
      findings: new Map(),
      proposal: familyEnvelope({ kind: "set_display_name", value: "保護名" }, ["identity"]),
    });
    if (!named.accepted) {
      assert.fail("protected name stage rejected");
    }
    const findings = new Map([["protected", "protected anchor"]]);
    const assessment = adapter.assessQuestion({
      candidate: named.candidate,
      obligations: named.obligations,
      findings,
    });
    assert.equal(assessment.ask, true);
    if (!assessment.ask) {
      assert.fail("protected finding did not ask");
    }
    const finalized = adapter.finalize({
      candidate: named.candidate,
      obligations: named.obligations,
      findings,
    });
    assert.equal(finalized.accepted, false);
    const interaction = OwnerInteractionV1Schema.parse({
      kind: "semantic_question",
      questionId: "question-1",
      prompt: assessment.question,
      relevantSource: [{ claimId: "source-1", label: "source", text: "灯" }],
      relevantCandidate: [{ claimId: "identity", label: "candidate", text: "保護名" }],
      unsafeReason: "The name is a protected anchor.",
      choices: [
        { id: "keep", effect: "Keep the source name." },
        { id: "owner", effect: "Wait for an owner-specified name." },
      ],
      freeFormAllowed: true,
      resumes: "A new attempt will freeze the answer as source clarification.",
    });
    const mapped = mapSemanticAuthoringResultToPublicV1("needs_owner_answer", interaction);
    assert.equal(mapped.status, "failed");
    assert.equal(mapped.errorCode, AUTHORING_OWNER_ANSWER_REQUIRED);
    assert.equal(mapped.ownerInteraction?.prompt, assessment.question);
    assert.equal(mapSemanticAuthoringResultToPublicV1("ready_for_review", interaction).ownerInteraction, null);
  });

  it("F7 finalization is schema-gated after focused completion", () => {
    completeFamilyCreate(createNarrationConformanceAdapter());
    const character = createCharacterSemanticAuthoringAdapterV3();
    const started = assertCreateHasWork(character);
    const finalized = character.finalize({
      candidate: started.baseline.candidate,
      obligations: started.baseline.obligations,
      findings: new Map(),
    });
    assert.equal(finalized.accepted, false);
  });

  it("F8 restricted preservation is excluded from ordinary create consumers", () => {
    assertCreateHasWork(createCharacterSemanticAuthoringAdapterV3());
    assertCreateHasWork(createBattlefieldConformanceAdapter());
    assertCreateHasWork(createNarrationConformanceAdapter());
  });

  it("F9 public attempt statuses stay unchanged during internal adoption", () => {
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("needs_owner_answer").success, false);
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("ready_for_review").success, false);
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("failed").success, true);
    assert.equal(AssetAuthoringAttemptStatusSchema.safeParse("awaiting_owner_acceptance").success, true);
  });

  it("F10 counted steps accumulate across select and staging", () => {
    const adapter = createBattlefieldConformanceAdapter();
    const run: SemanticAuthoringRunV1 = {
      runId: "run-1",
      attemptId: "attempt-1",
      family: "battlefield-preset",
      mode: "create",
      ownerUserId: "owner-1",
      sourceIdentity: {
        assetId: "asset-1",
        generationId: null,
        contentDigest: "a".repeat(64),
      },
      targetContract: { family: "battlefield-preset", version: 2 },
      adapterIdentity: adapter.identity,
      policyIdentity: policy.identity,
      pricingIdentity: "pricing-v1",
      tokenEstimatorIdentity: "bytes-upper-bound-v1",
      expectedCurrentGenerationId: null,
      executionFence: { ownerId: "owner-1", fencingToken: 1, runVersion: 1 },
    };
    const started = startSemanticAuthoringV1(adapter, run, policy, {
      kind: "create",
      naturalText: "森",
    });
    assert.equal(started.accepted, true);
    if (!started.accepted) {
      assert.fail("start rejected");
    }
    const selected = selectSemanticAuthoringWorkV1(started.state, adapter, {
      workItemId: "identity",
      capabilitySessionId: "session-1",
      questionId: "question-1",
      expiresAtMs: 10_000,
      nowMs: 1_000,
    });
    assert.equal(selected.status, "awaiting_proposal");
    const firstSteps = selected.state.accounting.countedSteps;
    const applied = applySemanticAuthoringProposalV1(
      selected.state,
      adapter,
      familyEnvelope({ kind: "set_display_name", value: "霧の闘技場" }, ["identity"]),
      1_000,
      issues,
    );
    assert.equal(applied.state.accounting.countedSteps > firstSteps, true);
  });

  it("F11 no-progress repetition and A-B oscillation are bounded", () => {
    assert.equal(
      classifyProgressCondition(
        ["a", "b", "c", "d", "e", "f", "g"].map((digest) => observation(digest, false)),
        { strategyChanges: 1, cycleRecoveryAlreadyUsed: true },
      ),
      "stalled_without_progress",
    );
    assert.equal(
      classifyProgressCondition(
        ["a", "b", "a", "b", "a", "b"].map((digest) => observation(digest, false)),
        { strategyChanges: 2, cycleRecoveryAlreadyUsed: true },
      ),
      "repeated_state_cycle",
    );
  });

  it("F12 temporary regression is not treated as mandatory every-step improvement", () => {
    const history = [
      observation("start", true),
      observation("dip", false),
      observation("recover", true),
    ];
    assert.equal(
      classifyProgressCondition(history, {
        strategyChanges: 0,
        cycleRecoveryAlreadyUsed: false,
      }),
      "continue",
    );
  });

  it("F13 invalid proposals retain trusted state and corruption fails closed", () => {
    const adapter = createBattlefieldConformanceAdapter();
    const started = assertCreateHasWork(adapter);
    const trusted = started.baseline.candidate;
    const decoded = adapter.decodeProposal(started.work.workItem, { not: "a proposal" });
    assert.equal(decoded.accepted, false);
    assert.equal(started.baseline.candidate, trusted);
    const runStarted = startSemanticAuthoringV1(
      adapter,
      {
        runId: "run-corrupt",
        attemptId: "attempt-corrupt",
        family: "battlefield-preset",
        mode: "create",
        ownerUserId: "owner-1",
        sourceIdentity: {
          assetId: "asset-1",
          generationId: null,
          contentDigest: "a".repeat(64),
        },
        targetContract: { family: "battlefield-preset", version: 2 },
        adapterIdentity: adapter.identity,
        policyIdentity: policy.identity,
        pricingIdentity: "pricing-v1",
        tokenEstimatorIdentity: "bytes-upper-bound-v1",
        expectedCurrentGenerationId: null,
        executionFence: { ownerId: "owner-1", fencingToken: 1, runVersion: 1 },
      },
      policy,
      { kind: "create", naturalText: "森" },
    );
    if (!runStarted.accepted) {
      assert.fail("corrupt start rejected");
    }
    const failed = selectSemanticAuthoringWorkV1(
      { ...runStarted.state, candidateRevision: -1 },
      adapter,
      {
        workItemId: "identity",
        capabilitySessionId: "session-1",
        questionId: "question-1",
        expiresAtMs: 10_000,
        nowMs: 1_000,
      },
    );
    assert.equal(failed.status, "terminal");
    assert.equal(failed.state.terminalResult?.kind, "failed");
  });

  it("F14 timeout charges the reservation and ignores a late result", () => {
    const fence = { ownerId: "owner-1", fencingToken: 1, runVersion: 1 };
    const ports = createScriptedSemanticAuthoringPortsV1({ nowMs: 1_000, fence });
    const adapter = createBattlefieldConformanceAdapter();
    const started = startSemanticAuthoringV1(
      adapter,
      {
        runId: "run-timeout",
        attemptId: "attempt-timeout",
        family: "battlefield-preset",
        mode: "create",
        ownerUserId: "owner-1",
        sourceIdentity: {
          assetId: "asset-1",
          generationId: null,
          contentDigest: "a".repeat(64),
        },
        targetContract: { family: "battlefield-preset", version: 2 },
        adapterIdentity: adapter.identity,
        policyIdentity: policy.identity,
        pricingIdentity: "pricing-v1",
        tokenEstimatorIdentity: "bytes-upper-bound-v1",
        expectedCurrentGenerationId: null,
        executionFence: fence,
      },
      policy,
      { kind: "create", naturalText: "森" },
    );
    if (!started.accepted) {
      assert.fail("timeout start rejected");
    }
    const reservation: SemanticAuthoringReservationV1 = {
      requestId: "request-1",
      inputTokens: 1_000,
      inputBytes: 4_000,
      outputTokens: 500,
      outputBytes: 2_000,
      costMicroUsd: 50_000,
      elapsedMs: 60_000,
    };
    const scheduled = scheduleSemanticAuthoringReservationV1(
      started.state,
      reservation,
      ports,
    );
    assert.equal(scheduled.status, "scheduled");
    if (scheduled.status !== "scheduled") {
      assert.fail("reservation was not scheduled");
    }
    ports.advanceMs(60_000);
    const expired = expireOutstandingSemanticAuthoringV1(scheduled.state, ports);
    assert.equal(expired.status, "terminal");
    const late = acceptSemanticAuthoringDeliveryV1(expired.state, "request-1", ports);
    assert.equal(late.status, "rejected");
  });

  it("F15 failure receipts support source-based retry without answering a question", () => {
    const retry = mapOwnerRetryCommandV1(
      "failed",
      OwnerRetryCommandV1Schema.parse({ commandId: "cmd-retry" }),
      {
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-2",
        requestDigest: "digest-1",
      },
    );
    assert.equal(retry.accepted, true);
    const blocked = mapOwnerRetryCommandV1(
      "needs_owner_answer",
      OwnerRetryCommandV1Schema.parse({ commandId: "cmd-retry" }),
      {
        characterId: "char-1",
        predecessorAttemptId: "attempt-1",
        nextAttemptId: "attempt-2",
        requestDigest: "digest-1",
      },
    );
    assert.equal(blocked.accepted, false);
    if (blocked.accepted) {
      assert.fail("retry was accepted for a question");
    }
    assert.equal(blocked.errorCode, AUTHORING_RETRY_NOT_ALLOWED);
  });
});
