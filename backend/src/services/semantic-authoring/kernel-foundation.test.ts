import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSemanticAuthoringQueryInputV1Schema,
  createSemanticAuthoringQueryResultV1Schema,
  createSemanticAuthoringSubmissionIssueV1Schema,
  createSemanticProposalV1Schema,
  isSemanticAuthoringResolverKindV1,
  type AdapterProgressObservationV1,
  type SemanticAuthoringAccountingV1,
  type SemanticAuthoringAdapterV1,
  type SemanticAuthoringPolicyV1,
  type SemanticAuthoringReservationV1,
  type SemanticAuthoringResolverResultV1,
  type SemanticAuthoringRunV1,
  type SemanticAuthoringStateV1,
  type SemanticProposalV1,
} from "@kshiai/shared";
import { z } from "zod";
import {
  admitSemanticAuthoringReservation,
  countSemanticAuthoringStepV1,
} from "./accounting.js";
import {
  recordCapabilityInvocationV1,
  visibleCapabilityToolsV1,
  type CapabilitySessionV1,
} from "./capability-session.js";
import { applyProposalTransactionV1 } from "./kernel.js";
import {
  applySemanticAuthoringProposalV1,
  selectSemanticAuthoringWorkV1,
  startSemanticAuthoringV1,
} from "./orchestration.js";
import {
  appendProgressObservationV1,
  classifyProgressCondition,
  detectRepeatedStateCycle,
} from "./progress-monitor.js";
import {
  isTerminalSemanticAuthoringStatusV1,
  transitionSemanticAuthoringRunV1,
} from "./run-state.js";
import { decodeProposalResponseV1 } from "./proposal-decoder.js";

/*
 * Decoder tests intentionally exercise the external string boundary. Internal
 * semantic-authoring calls continue to pass typed values directly.
 */

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

const zeroAccounting: SemanticAuthoringAccountingV1 = {
  llmCalls: 0,
  countedSteps: 0,
  elapsedMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  costMicroUsd: 0,
};

function reservation(
  overrides: Partial<SemanticAuthoringReservationV1> = {},
): SemanticAuthoringReservationV1 {
  return {
    requestId: "request-1",
    inputTokens: 1_000,
    inputBytes: 4_000,
    outputTokens: 500,
    outputBytes: 2_000,
    costMicroUsd: 50_000,
    elapsedMs: 60_000,
    ...overrides,
  };
}

function observation(
  digest: string,
  materialProgress = false,
): AdapterProgressObservationV1 {
  return {
    phase: "repair",
    resolvedRequiredObligationCount: 0,
    coveredMaterialClaimCount: 0,
    unresolvedMaterialFindingKeys: ["finding-1"],
    relevantStateDigest: digest,
    activeSemanticClusterKey: "cluster-1",
    materialProgress,
  };
}

describe("semantic authoring resource admission", () => {
  it("admits a reservation that fits all per-call and cumulative maxima", () => {
    assert.deepEqual(
      admitSemanticAuthoringReservation(policy, zeroAccounting, [], reservation()),
      { admitted: true },
    );
  });

  it("charges settled accounting before admitting another call", () => {
    const result = admitSemanticAuthoringReservation(
      policy,
      { ...zeroAccounting, costMicroUsd: 480_000 },
      [],
      reservation({ requestId: "next", costMicroUsd: 30_000 }),
    );
    assert.deepEqual(result, { admitted: false, exhausted: "cost" });
  });

  it("allows only one outstanding provider request by default", () => {
    const result = admitSemanticAuthoringReservation(
      policy,
      zeroAccounting,
      [reservation({ requestId: "outstanding" })],
      reservation({ requestId: "next" }),
    );
    assert.deepEqual(result, { admitted: false, exhausted: "concurrency" });
  });

  it("rejects an oversized individual response before cumulative admission", () => {
    const result = admitSemanticAuthoringReservation(
      policy,
      zeroAccounting,
      [],
      reservation({ outputBytes: 6_145 }),
    );
    assert.deepEqual(result, {
      admitted: false,
      exhausted: "per_call_output",
    });
  });

  it("counts through the last permitted step and preserves state after exhaustion", () => {
    const beforeLast = { ...zeroAccounting, countedSteps: 47 };
    const last = countSemanticAuthoringStepV1(policy, beforeLast);
    assert.equal(last.accepted, true);
    assert.equal(last.accounting.countedSteps, 48);

    const exhausted = countSemanticAuthoringStepV1(policy, last.accounting);
    assert.deepEqual(exhausted, {
      accepted: false,
      exhausted: "counted_steps",
      accounting: last.accounting,
    });
  });
});

describe("semantic authoring progress monitor", () => {
  it("appends observations and drops the oldest past the policy window", () => {
    const original: AdapterProgressObservationV1[] = [];
    const first = appendProgressObservationV1(original, observation("a"), policy);
    assert.equal(original.length, 0);
    assert.deepEqual(first.map((item) => item.relevantStateDigest), ["a"]);

    let history = first;
    for (const digest of ["b", "c", "d", "e", "f", "g", "h"]) {
      history = appendProgressObservationV1(history, observation(digest), policy);
    }
    assert.deepEqual(
      history.map((item) => item.relevantStateDigest),
      ["a", "b", "c", "d", "e", "f", "g", "h"],
    );

    const bounded = appendProgressObservationV1(history, observation("i"), policy);
    assert.deepEqual(
      bounded.map((item) => item.relevantStateDigest),
      ["b", "c", "d", "e", "f", "g", "h", "i"],
    );
    assert.deepEqual(
      history.map((item) => item.relevantStateDigest),
      ["a", "b", "c", "d", "e", "f", "g", "h"],
    );
  });

  it("keeps adapter-supplied materialProgress and does not treat prose-only drift as progress", () => {
    const proseOnly: AdapterProgressObservationV1 = {
      ...observation("same-digest"),
      phase: "review",
      resolvedRequiredObligationCount: 3,
      coveredMaterialClaimCount: 4,
      unresolvedMaterialFindingKeys: [],
      materialProgress: false,
    };
    const history = appendProgressObservationV1([], proseOnly, policy);
    assert.equal(history[0]?.materialProgress, false);
    assert.equal(history[0]?.phase, "review");
    assert.equal(
      classifyProgressCondition(history, {
        strategyChanges: 0,
        cycleRecoveryAlreadyUsed: false,
      }),
      "continue",
    );
  });

  it("classifies stall from the retained window after dropping an older progress marker", () => {
    let history: readonly AdapterProgressObservationV1[] = [];
    history = appendProgressObservationV1(history, observation("progress", true), policy);
    for (const digest of ["a", "b", "c", "d", "e", "f", "g"]) {
      history = appendProgressObservationV1(history, observation(digest), policy);
    }
    assert.equal(
      classifyProgressCondition(history, {
        strategyChanges: 1,
        cycleRecoveryAlreadyUsed: false,
      }),
      "stalled_without_progress",
    );

    const droppedProgress = appendProgressObservationV1(history, observation("h"), policy);
    assert.equal(droppedProgress.some((item) => item.materialProgress), false);
    assert.equal(
      classifyProgressCondition(droppedProgress, {
        strategyChanges: 1,
        cycleRecoveryAlreadyUsed: false,
      }),
      "stalled_without_progress",
    );
  });

  it("requires recovery after four steps and fails after three more", () => {
    assert.equal(
      classifyProgressCondition(
        ["a", "b", "c", "d"].map((value) => observation(value)),
        { strategyChanges: 0, cycleRecoveryAlreadyUsed: false },
      ),
      "recovery_required",
    );
    assert.equal(
      classifyProgressCondition(
        ["a", "b", "c", "d", "e", "f", "g"].map((value) => observation(value)),
        { strategyChanges: 1, cycleRecoveryAlreadyUsed: false },
      ),
      "stalled_without_progress",
    );
  });

  it("detects repeated and alternating state cycles without intervening progress", () => {
    assert.equal(
      detectRepeatedStateCycle(["a", "b", "a", "c", "a"].map((value) => observation(value))),
      true,
    );
    assert.equal(
      detectRepeatedStateCycle(["a", "b", "a", "b"].map((value) => observation(value))),
      true,
    );
  });

  it("uses material progress as the history boundary", () => {
    const history = [
      observation("a"),
      observation("a"),
      observation("progress", true),
      observation("a"),
    ];
    assert.equal(detectRepeatedStateCycle(history), false);
    assert.equal(
      classifyProgressCondition(history, {
        strategyChanges: 0,
        cycleRecoveryAlreadyUsed: false,
      }),
      "continue",
    );
  });

  it("fails only when a detected cycle repeats after cycle recovery", () => {
    const cycle = ["a", "b", "a", "b"].map((value) => observation(value));
    assert.equal(
      classifyProgressCondition(cycle, {
        strategyChanges: 1,
        cycleRecoveryAlreadyUsed: false,
      }),
      "recovery_required",
    );
    assert.equal(
      classifyProgressCondition(cycle, {
        strategyChanges: 1,
        cycleRecoveryAlreadyUsed: true,
      }),
      "repeated_state_cycle",
    );
  });
});

describe("semantic authoring proposal transaction", () => {
  const initial = {
    candidateRevision: 2,
    candidate: { value: "trusted" },
    obligations: new Map<string, string>(),
    findings: new Map<string, string>(),
  };

  it("atomically replaces staged state only after every hard check passes", () => {
    const result = applyProposalTransactionV1(
      initial,
      2,
      { value: "replacement" },
      (_candidate, obligations, findings, proposal) => ({
        accepted: true,
        candidate: proposal,
        obligations,
        findings,
      }),
      [(candidate) => candidate.value === "replacement" ? null : {
        key: "wrong-value",
        finding: "wrong value",
      }],
      { key: "revision", finding: "stale revision" },
    );

    assert.equal(result.accepted, true);
    assert.deepEqual(result.state.candidate, { value: "replacement" });
    assert.equal(result.state.candidateRevision, 3);
    assert.deepEqual(initial.candidate, { value: "trusted" });
  });

  it("retains the trusted candidate and deduplicates a failed hard check", () => {
    const hardFailure = { key: "authority", finding: "protected claim" };
    const first = applyProposalTransactionV1(
      initial,
      2,
      { value: "unsafe" },
      (_candidate, obligations, findings, proposal) => ({
        accepted: true,
        candidate: proposal,
        obligations,
        findings,
      }),
      [() => hardFailure],
      { key: "revision", finding: "stale revision" },
    );
    const second = applyProposalTransactionV1(
      first.state,
      2,
      { value: "still-unsafe" },
      (_candidate, obligations, findings, proposal) => ({
        accepted: true,
        candidate: proposal,
        obligations,
        findings,
      }),
      [() => hardFailure],
      { key: "revision", finding: "stale revision" },
    );

    assert.equal(first.accepted, false);
    assert.deepEqual(first.state.candidate, { value: "trusted" });
    assert.equal(second.state.findings.size, 1);
  });

  it("does not let a rejecting stage mutate trusted ledgers in place", () => {
    const obligations = new Map([["keep", "ok"]]);
    const findings = new Map([["old", "prior"]]);
    const result = applyProposalTransactionV1(
      {
        candidateRevision: 1,
        candidate: { value: "trusted" },
        obligations,
        findings,
      },
      1,
      { value: "unsafe" },
      (_candidate, stagedObligations, stagedFindings) => {
        if (stagedObligations instanceof Map) {
          stagedObligations.set("injected", "bad");
        }
        if (stagedFindings instanceof Map) {
          stagedFindings.set("injected", "bad");
        }
        return { accepted: false, issue: { key: "stage", finding: "rejected" } };
      },
      [],
      { key: "revision", finding: "stale revision" },
    );
    assert.equal(result.accepted, false);
    assert.equal(obligations.has("injected"), false);
    assert.equal(findings.has("injected"), false);
    assert.equal(result.state.obligations.has("injected"), false);
    assert.equal(result.state.findings.get("stage"), "rejected");
    assert.equal(result.state.candidate.value, "trusted");
  });

  it("rejects a stale base revision before staging", () => {
    let staged = false;
    const result = applyProposalTransactionV1(
      initial,
      1,
      { value: "ignored" },
      (_candidate, obligations, findings, proposal) => {
        staged = true;
        return { accepted: true, candidate: proposal, obligations, findings };
      },
      [],
      { key: "revision", finding: "stale revision" },
    );

    assert.equal(result.accepted, false);
    assert.equal(staged, false);
    assert.deepEqual(result.state.candidate, { value: "trusted" });
  });
});

describe("semantic authoring capability session", () => {
  const session: CapabilitySessionV1 = {
    runId: "run-1",
    workItemId: "work-1",
    capabilitySessionId: "session-1",
    mutationRole: "propose-change",
    allowedSelectors: ["source-claims"],
    proposalSchemaIdentity: "character-proposal-v1",
    writeClosure: ["identity"],
    expiresAtMs: 2_000,
    queryInvocationCount: 0,
    mutationInvocationCount: 0,
    mutationSucceeded: false,
    revoked: false,
  };

  it("exposes only query and the work-item mutation tool", () => {
    assert.deepEqual(visibleCapabilityToolsV1(session, 1_000), [
      "authoring_query_context_v1",
      "authoring_propose_change_v1",
    ]);
    const wrongTool = recordCapabilityInvocationV1(
      session,
      {
        tool: "authoring_submit_review_v1",
        runId: "run-1",
        workItemId: "work-1",
        capabilitySessionId: "session-1",
        proposalSchemaIdentity: "character-proposal-v1",
      },
      1_000,
      false,
    );
    assert.deepEqual(wrongTool, {
      accepted: false,
      reason: "tool_not_exposed",
      session,
    });
  });

  it("revokes the complete session after one successful mutation", () => {
    const result = recordCapabilityInvocationV1(
      session,
      {
        tool: "authoring_propose_change_v1",
        runId: "run-1",
        workItemId: "work-1",
        capabilitySessionId: "session-1",
        proposalSchemaIdentity: "character-proposal-v1",
      },
      1_000,
      true,
    );
    assert.equal(result.accepted, true);
    assert.deepEqual(visibleCapabilityToolsV1(result.session, 1_001), []);
  });

  it("revokes an expired session without invoking a tool", () => {
    const result = recordCapabilityInvocationV1(
      session,
      {
        tool: "authoring_query_context_v1",
        runId: "run-1",
        workItemId: "work-1",
        capabilitySessionId: "session-1",
        selector: "source-claims",
      },
      2_000,
      false,
    );
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "expired");
    assert.equal(result.session.revoked, true);
  });

  it("rejects mismatched bindings before consuming an invocation", () => {
    const wrongRun = recordCapabilityInvocationV1(
      session,
      {
        tool: "authoring_query_context_v1",
        runId: "another-run",
        workItemId: "work-1",
        capabilitySessionId: "session-1",
        selector: "source-claims",
      },
      1_000,
      false,
    );
    const wrongSelector = recordCapabilityInvocationV1(
      session,
      {
        tool: "authoring_query_context_v1",
        runId: "run-1",
        workItemId: "work-1",
        capabilitySessionId: "session-1",
        selector: "query-all",
      },
      1_000,
      false,
    );
    const wrongSchema = recordCapabilityInvocationV1(
      session,
      {
        tool: "authoring_propose_change_v1",
        runId: "run-1",
        workItemId: "work-1",
        capabilitySessionId: "session-1",
        proposalSchemaIdentity: "other-schema",
      },
      1_000,
      false,
    );
    if (wrongRun.accepted || wrongSelector.accepted || wrongSchema.accepted) {
      assert.fail("mismatched capability invocation was accepted");
    }
    assert.equal(wrongRun.reason, "binding_mismatch");
    assert.equal(wrongSelector.reason, "selector_not_allowed");
    assert.equal(wrongSchema.reason, "proposal_schema_mismatch");
    assert.equal(wrongRun.session.queryInvocationCount, 0);
  });
});

describe("semantic authoring kernel state and resolver results", () => {
  const run: SemanticAuthoringRunV1 = {
    runId: "run-1",
    attemptId: "attempt-1",
    family: "character",
    mode: "create",
    ownerUserId: "owner-1",
    sourceIdentity: {
      assetId: "asset-1",
      generationId: null,
      contentDigest: "a".repeat(64),
    },
    targetContract: { family: "character", version: 3 },
    adapterIdentity: "character-v3",
    policyIdentity: "semantic_authoring_policy_v1",
    pricingIdentity: "pricing-v1",
    tokenEstimatorIdentity: "bytes-upper-bound-v1",
    expectedCurrentGenerationId: null,
    executionFence: {
      ownerId: "owner-1",
      fencingToken: 1,
      runVersion: 1,
    },
  };

  const identity = {
    runId: run.runId,
    attemptId: run.attemptId,
    sourceIdentity: run.sourceIdentity,
    policyIdentity: run.policyIdentity,
    adapterIdentity: run.adapterIdentity,
    accounting: zeroAccounting,
  };

  it("holds zero or one resolver result and at most one outstanding reservation", () => {
    const ready: SemanticAuthoringResolverResultV1<string, string> = {
      ...identity,
      kind: "ready_for_review",
      finalCandidate: "candidate",
      finalCandidateDigest: "b".repeat(64),
      obligationCoverage: {
        resolvedRequiredObligationCount: 1,
        requiredObligationCount: 1,
      },
      reconciliationReceiptIdentity: "reconciliation-1",
      compilerReceiptIdentity: "compiler-1",
      disclosureReceiptIdentity: "disclosure-1",
      expectedCurrentGenerationId: null,
    };
    const claimed: SemanticAuthoringStateV1<string, string, string, string, string, string> = {
      run,
      policy,
      candidateRevision: 0,
      candidate: "baseline",
      obligations: new Map(),
      findings: new Map(),
      provenance: new Map(),
      sourceDispositions: new Map(),
      accounting: zeroAccounting,
      outstandingReservation: reservation(),
      phase: "skeleton",
      progressHistory: [],
      recoveryStrategyChanges: 0,
      cycleRecoveryAlreadyUsed: false,
      activeWorkItem: "work-1",
      capabilitySession: null,
      terminalResult: null,
    };
    const finished = { ...claimed, outstandingReservation: null, terminalResult: ready };

    assert.equal(claimed.terminalResult, null);
    assert.equal(claimed.outstandingReservation?.requestId, "request-1");
    assert.equal(finished.terminalResult?.kind, "ready_for_review");
    assert.equal(finished.outstandingReservation, null);
    assert.equal("outcome" in (claimed.outstandingReservation ?? {}), false);
  });

  it("keeps owner questions and failures as resolver results, not cancel or expiry", () => {
    const question: SemanticAuthoringResolverResultV1<string, string> = {
      ...identity,
      kind: "needs_owner_answer",
      question: "Which protected name is intended?",
      resumption: {
        predecessorRunId: run.runId,
        predecessorAttemptId: run.attemptId,
        questionId: "question-1",
      },
    };
    const failure: SemanticAuthoringResolverResultV1<string, string> = {
      ...identity,
      kind: "failed",
      receipt: {
        category: "stalled_without_progress",
        accounting: zeroAccounting,
        relevantFindingKeys: ["finding-1"],
        sourceIdentity: run.sourceIdentity,
      },
    };

    assert.equal(isSemanticAuthoringResolverKindV1(question.kind), true);
    assert.equal(isSemanticAuthoringResolverKindV1(failure.kind), true);
    assert.equal(isSemanticAuthoringResolverKindV1("cancelled"), false);
    assert.equal(isSemanticAuthoringResolverKindV1("expired"), false);
  });
});

describe("semantic authoring run state", () => {
  it("allows one claim followed by one terminal transition", () => {
    assert.equal(transitionSemanticAuthoringRunV1("pending", "claimed"), "claimed");
    assert.equal(
      transitionSemanticAuthoringRunV1("claimed", "ready_for_review"),
      "ready_for_review",
    );
  });

  it("does not reopen or relabel a terminal run", () => {
    assert.equal(isTerminalSemanticAuthoringStatusV1("needs_owner_answer"), true);
    assert.equal(
      transitionSemanticAuthoringRunV1("needs_owner_answer", "pending"),
      null,
    );
    assert.equal(transitionSemanticAuthoringRunV1("failed", "claimed"), null);
  });
});

describe("semantic authoring proposal decoding", () => {
  const schema = createSemanticProposalV1Schema(
    "test-proposal-v1",
    z.object({ operation: z.literal("set-test-value") }).strict(),
  );
  const proposal = {
    proposalId: "proposal-1",
    runId: "run-1",
    workItemId: "work-1",
    baseCandidateRevision: 0,
    capabilitySessionId: "session-1",
    proposalSchemaIdentity: "test-proposal-v1",
    sourceClaimIds: ["source-1"],
    affectedObligationIds: ["obligation-1"],
    declaredSemanticDependantIds: [],
    provenance: [{
      targetClaimId: "target-1",
      sourceClaimIds: ["source-1"],
      method: "preserved",
    }],
    ownerExplanation: "Preserve the source claim.",
    uncertainty: [],
    payload: { operation: "set-test-value" },
  };

  it("decodes an exact adapter-owned proposal envelope", () => {
    const result = decodeProposalResponseV1(JSON.stringify(proposal), schema);
    assert.equal(result.accepted, true);
  });

  it("rejects unknown members and an unregistered schema identity", () => {
    const unknownMember = decodeProposalResponseV1(
      JSON.stringify({ ...proposal, extra: true }),
      schema,
    );
    const wrongIdentity = decodeProposalResponseV1(
      JSON.stringify({ ...proposal, proposalSchemaIdentity: "other" }),
      schema,
    );
    assert.equal(unknownMember.accepted, false);
    assert.equal(unknownMember.issue.code, "schema_mismatch");
    assert.equal(wrongIdentity.accepted, false);
    assert.equal(wrongIdentity.issue.code, "schema_mismatch");
  });

  it("rejects duplicate identifiers and an oversized encoded response", () => {
    const duplicate = decodeProposalResponseV1(
      JSON.stringify({ ...proposal, sourceClaimIds: ["source-1", "source-1"] }),
      schema,
    );
    const oversized = decodeProposalResponseV1(
      `${JSON.stringify(proposal)}${" ".repeat(6_144)}`,
      schema,
    );
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.issue.code, "schema_mismatch");
    assert.equal(oversized.accepted, false);
    assert.equal(oversized.issue.code, "encoded_size_exceeded");
  });
});

describe("semantic authoring focused tool schemas", () => {
  const selectorSchema = z.enum(["source-claims", "findings"]);
  const querySchema = createSemanticAuthoringQueryInputV1Schema(selectorSchema);

  it("admits only adapter-registered selectors and unique bounded claim IDs", () => {
    const query = {
      runId: "run-1",
      workItemId: "work-1",
      capabilitySessionId: "session-1",
      selector: "source-claims",
      claimIds: ["claim-1"],
    };
    assert.equal(querySchema.safeParse(query).success, true);
    assert.equal(querySchema.safeParse({ ...query, selector: "query-all" }).success, false);
    assert.equal(
      querySchema.safeParse({ ...query, claimIds: ["claim-1", "claim-1"] }).success,
      false,
    );
    assert.equal(querySchema.safeParse({ ...query, extra: true }).success, false);
  });

  it("bounds strict focused response segments without exposing arbitrary roles", () => {
    const resultSchema = createSemanticAuthoringQueryResultV1Schema(selectorSchema);
    const result = {
      selector: "findings",
      segments: [{
        segmentId: "segment-1",
        claimId: "claim-1",
        role: "finding",
        text: "A focused discrepancy.",
        referenceIds: [],
      }],
    };
    assert.equal(resultSchema.safeParse(result).success, true);
    assert.equal(
      resultSchema.safeParse({
        ...result,
        segments: [{ ...result.segments[0], role: "whole-candidate" }],
      }).success,
      false,
    );
  });

  it("keeps rejected-submission feedback compact and adapter-code closed", () => {
    const issueSchema = createSemanticAuthoringSubmissionIssueV1Schema(
      z.enum(["unknown-claim", "outside-write-closure"]),
    );
    const issue = {
      code: "outside-write-closure",
      operationIndex: 7,
      message: "The operation is outside the registered closure.",
      affectedClaimIds: ["claim-1"],
    };
    assert.equal(issueSchema.safeParse(issue).success, true);
    assert.equal(issueSchema.safeParse({ ...issue, operationIndex: 8 }).success, false);
    assert.equal(issueSchema.safeParse({ ...issue, code: "arbitrary" }).success, false);
  });
});

describe("semantic authoring pure orchestration", () => {
  type Payload = Readonly<{ value: string }>;
  type Proposal = SemanticProposalV1<Payload>;
  type ScriptedAdapter = SemanticAuthoringAdapterV1<
    string, string, string, string, Proposal, string, string, string, string
  >;

  const authoringRun: SemanticAuthoringRunV1 = {
    runId: "run-1",
    attemptId: "attempt-1",
    family: "character",
    mode: "create",
    ownerUserId: "owner-1",
    sourceIdentity: {
      assetId: "asset-1",
      generationId: null,
      contentDigest: "a".repeat(64),
    },
    targetContract: { family: "character", version: 3 },
    adapterIdentity: "scripted-v1",
    policyIdentity: "semantic_authoring_policy_v1",
    pricingIdentity: "pricing-v1",
    tokenEstimatorIdentity: "bytes-upper-bound-v1",
    expectedCurrentGenerationId: null,
    executionFence: { ownerId: "owner-1", fencingToken: 1, runVersion: 1 },
  };

  const issues = {
    revisionMismatch: { key: "revision", finding: "stale revision" },
    proposalRejected: { key: "proposal", finding: "rejected proposal" },
    referenceCheckFailed: { key: "reference", finding: "missing reference" },
  };

  function workIds(label: string) {
    return {
      workItemId: `work-${label}`,
      capabilitySessionId: `session-${label}`,
      questionId: `question-${label}`,
      expiresAtMs: 10_000,
      nowMs: 1_000,
    };
  }

  function createScriptedAdapter(control: {
    remainingWork: number;
    finalizePass: boolean;
    ask: boolean;
    materialProgress: boolean;
    rejectStage: boolean;
    evidence?: {
      explicitProblemClaimIds: readonly string[];
      materialProtectedImpactClaimIds: readonly string[];
      materiallyDifferentOutcomeClaimIds: readonly string[];
      exhaustedRecoveryFindingKeys: readonly string[];
      unsafeAutomaticResolutionClaimIds: readonly string[];
    };
    observeSeq?: number;
  }): ScriptedAdapter {
    return {
      identity: "scripted-v1",
      decodeFrozenSource(value) {
        return typeof value === "string" ? { accepted: true, value } : { accepted: false };
      },
      buildBaseline(source) {
        return { candidate: source, obligations: new Map([["obligation-1", "complete identity"]]) };
      },
      selectWork() {
        if (control.remainingWork <= 0) {
          return { selected: false };
        }
        control.remainingWork -= 1;
        return { selected: true, workItem: "cluster-1" };
      },
      describeCapabilities() {
        return {
          skill: {
            identity: "scripted-skill-v1",
            objective: "Complete the focused cluster.",
            phase: "cluster-1",
            legalCapabilityRoles: ["query-context", "propose-change"],
            capabilityRequestGuidance: "Propose a focused change.",
            resourceReminder: "Stay inside the frozen attempt budget.",
            disclosureReminder: "Do not request whole-candidate context.",
          },
          allowedSelectors: ["source-claims"],
          proposalSchemaIdentity: "scripted-proposal-v1",
          writeClosure: ["identity"],
        };
      },
      decodeProposal(_work, value) {
        if (typeof value !== "object" || value === null) {
          return { accepted: false };
        }
        const record = value;
        const payload = "payload" in record ? record.payload : undefined;
        if (
          !("proposalId" in record) || typeof record.proposalId !== "string" ||
          !("runId" in record) || typeof record.runId !== "string" ||
          !("workItemId" in record) || typeof record.workItemId !== "string" ||
          !("capabilitySessionId" in record) || typeof record.capabilitySessionId !== "string" ||
          !("proposalSchemaIdentity" in record) || typeof record.proposalSchemaIdentity !== "string" ||
          !("baseCandidateRevision" in record) || typeof record.baseCandidateRevision !== "number" ||
          !("affectedObligationIds" in record) || !Array.isArray(record.affectedObligationIds) ||
          !("declaredSemanticDependantIds" in record) || !Array.isArray(record.declaredSemanticDependantIds) ||
          !("provenance" in record) || !Array.isArray(record.provenance) ||
          typeof payload !== "object" || payload === null ||
          !("value" in payload) || typeof payload.value !== "string"
        ) {
          return { accepted: false };
        }
        return {
          accepted: true,
          value: {
            proposalId: record.proposalId,
            runId: record.runId,
            workItemId: record.workItemId,
            baseCandidateRevision: record.baseCandidateRevision,
            capabilitySessionId: record.capabilitySessionId,
            proposalSchemaIdentity: record.proposalSchemaIdentity,
            sourceClaimIds: ["source-1"],
            affectedObligationIds: record.affectedObligationIds.filter(
              (id): id is string => typeof id === "string",
            ),
            declaredSemanticDependantIds: record.declaredSemanticDependantIds.filter(
              (id): id is string => typeof id === "string",
            ),
            provenance: [{
              targetClaimId: "identity",
              sourceClaimIds: ["source-1"],
              method: "generated",
            }],
            ownerExplanation: "Set the candidate value.",
            uncertainty: [],
            payload: { value: payload.value },
          },
        };
      },
      stageProposal(input) {
        if (control.rejectStage) {
          return { accepted: false, findingKey: "stage", finding: "stage rejected" };
        }
        return {
          accepted: true,
          candidate: input.proposal.payload.value,
          obligations: input.obligations,
          findings: input.findings,
        };
      },
      reconcileAffected(input) {
        return { findings: input.findings };
      },
      observeProgress(input) {
        control.observeSeq = (control.observeSeq ?? 0) + 1;
        return {
          phase: input.phase,
          resolvedRequiredObligationCount: 1,
          coveredMaterialClaimCount: control.materialProgress ? 1 : 0,
          unresolvedMaterialFindingKeys: [...input.findings.keys()],
          relevantStateDigest: `${input.candidate}:${control.observeSeq}`,
          activeSemanticClusterKey: "cluster-1",
          materialProgress: control.materialProgress,
        };
      },
      assessQuestion() {
        if (!control.ask) {
          return { ask: false };
        }
        return {
          ask: true,
          question: "Which protected name is intended?",
          evidence: control.evidence ?? {
            explicitProblemClaimIds: ["conflict"],
            materialProtectedImpactClaimIds: ["conflict"],
            materiallyDifferentOutcomeClaimIds: ["conflict"],
            exhaustedRecoveryFindingKeys: ["conflict"],
            unsafeAutomaticResolutionClaimIds: ["conflict"],
          },
        };
      },
      applyAnswer() {
        return { questionId: "question-1", affectedClaimIds: ["conflict"] };
      },
      finalize(input) {
        if (!control.finalizePass) {
          const findings = new Map(input.findings);
          findings.set("conflict", "protected contradiction");
          return { accepted: false, findings };
        }
        return {
          accepted: true,
          finalCandidate: input.candidate,
          finalCandidateDigest: "c".repeat(64),
          obligationCoverage: {
            resolvedRequiredObligationCount: 1,
            requiredObligationCount: 1,
          },
          reconciliationReceiptIdentity: "reconciliation-1",
          compilerReceiptIdentity: "compiler-1",
          disclosureReceiptIdentity: "disclosure-1",
        };
      },
    };
  }

  function startState(adapter: ScriptedAdapter) {
    const started = startSemanticAuthoringV1(adapter, authoringRun, policy, "baseline");
    assert.equal(started.accepted, true);
    if (!started.accepted) {
      assert.fail("authoring start was rejected");
    }
    return started.state;
  }

  function boundProposal(
    state: SemanticAuthoringStateV1<string, string, string, string, string, string>,
    value: string,
  ): Proposal {
    const session = state.capabilitySession;
    assert.ok(session);
    return {
      proposalId: "proposal-1",
      runId: session.runId,
      workItemId: session.workItemId,
      baseCandidateRevision: state.candidateRevision,
      capabilitySessionId: session.capabilitySessionId,
      proposalSchemaIdentity: session.proposalSchemaIdentity,
      sourceClaimIds: ["source-1"],
      affectedObligationIds: ["obligation-1"],
      declaredSemanticDependantIds: [],
      provenance: [{
        targetClaimId: "identity",
        sourceClaimIds: ["source-1"],
        method: "generated",
      }],
      ownerExplanation: "Set the candidate value.",
      uncertainty: [],
      payload: { value },
    };
  }

  it("selects work, applies a proposal, reconciles, and finalizes ready_for_review", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 1,
      finalizePass: true,
      ask: false,
      materialProgress: true,
      rejectStage: false,
    });
    const selected = selectSemanticAuthoringWorkV1(startState(adapter), adapter, workIds("1"));
    assert.equal(selected.status, "awaiting_proposal");
    const applied = applySemanticAuthoringProposalV1(
      selected.state,
      adapter,
      boundProposal(selected.state, "complete"),
      1_000,
      issues,
    );
    assert.equal(applied.status, "continue");
    assert.equal(applied.state.candidate, "complete");
    const finished = selectSemanticAuthoringWorkV1(applied.state, adapter, workIds("2"));
    assert.equal(finished.status, "terminal");
    assert.equal(finished.state.terminalResult?.kind, "ready_for_review");
  });

  it("retains the trusted candidate when staging is rejected", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 1,
      finalizePass: true,
      ask: false,
      materialProgress: false,
      rejectStage: true,
    });
    const selected = selectSemanticAuthoringWorkV1(startState(adapter), adapter, workIds("1"));
    const applied = applySemanticAuthoringProposalV1(
      selected.state,
      adapter,
      boundProposal(selected.state, "unsafe"),
      1_000,
      issues,
    );
    assert.equal(applied.status, "awaiting_proposal");
    assert.equal(applied.state.candidate, "baseline");
    assert.equal(applied.state.findings.get("stage"), "stage rejected");
  });

  it("asks an owner question when finalization fails and the five conditions are evidenced", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 0,
      finalizePass: false,
      ask: true,
      materialProgress: false,
      rejectStage: false,
    });
    const finished = selectSemanticAuthoringWorkV1(startState(adapter), adapter, workIds("q"));
    assert.equal(finished.status, "terminal");
    assert.equal(finished.state.terminalResult?.kind, "needs_owner_answer");
  });

  it("fails closed on trusted-state corruption and resource exhaustion", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 1,
      finalizePass: true,
      ask: false,
      materialProgress: false,
      rejectStage: false,
    });
    const started = startState(adapter);
    const corrupt = selectSemanticAuthoringWorkV1(
      { ...started, candidateRevision: -1 },
      adapter,
      workIds("corrupt"),
    );
    assert.equal(corrupt.state.terminalResult?.kind, "failed");
    if (corrupt.state.terminalResult?.kind !== "failed") {
      assert.fail("corrupt state did not fail");
    }
    assert.equal(corrupt.state.terminalResult.receipt.category, "trusted_state_corrupt");

    const exhausted = selectSemanticAuthoringWorkV1(
      { ...started, accounting: { ...zeroAccounting, countedSteps: 48 } },
      adapter,
      workIds("exhausted"),
    );
    assert.equal(exhausted.state.terminalResult?.kind, "failed");
    if (exhausted.state.terminalResult?.kind !== "failed") {
      assert.fail("exhausted state did not fail");
    }
    assert.equal(exhausted.state.terminalResult.receipt.category, "resource_exhausted");
  });

  it("stops after a no-progress window instead of repeating work", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 20,
      finalizePass: true,
      ask: false,
      materialProgress: false,
      rejectStage: false,
    });
    let current = startState(adapter);
    let terminalKind: string | undefined;
    for (let index = 0; index < 8; index += 1) {
      const selected = selectSemanticAuthoringWorkV1(current, adapter, workIds(`stall-${index}`));
      if (selected.status === "terminal") {
        current = selected.state;
        terminalKind = selected.state.terminalResult?.kind;
        break;
      }
      const applied = applySemanticAuthoringProposalV1(
        selected.state,
        adapter,
        boundProposal(selected.state, `repeat-${index}`),
        1_000,
        issues,
      );
      current = applied.state;
      if (applied.status === "terminal") {
        terminalKind = applied.state.terminalResult?.kind;
        break;
      }
    }
    assert.equal(terminalKind, "failed");
    if (current.terminalResult?.kind !== "failed") {
      assert.fail("no-progress window did not fail the run");
    }
    assert.equal(
      current.terminalResult.receipt.category === "stalled_without_progress" ||
        current.terminalResult.receipt.category === "repeated_state_cycle",
      true,
    );
  });

  it("does not apply a late proposal after a terminal result", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 0,
      finalizePass: true,
      ask: false,
      materialProgress: false,
      rejectStage: false,
    });
    const finished = selectSemanticAuthoringWorkV1(startState(adapter), adapter, workIds("done"));
    assert.equal(finished.state.terminalResult?.kind, "ready_for_review");
    const late = applySemanticAuthoringProposalV1(
      finished.state,
      adapter,
      { not: "a proposal" },
      1_000,
      issues,
    );
    assert.equal(late.status, "terminal");
    assert.equal(late.state.candidate, finished.state.candidate);
    assert.equal(late.state.terminalResult?.kind, "ready_for_review");
  });

  it("does not apply a fourth proposal after three session mutations", () => {
    const control = {
      remainingWork: 1,
      finalizePass: true,
      ask: false,
      materialProgress: true,
      rejectStage: true,
    };
    const adapter = createScriptedAdapter(control);
    const selected = selectSemanticAuthoringWorkV1(startState(adapter), adapter, workIds("cap"));
    let current = selected.state;
    for (let index = 0; index < 3; index += 1) {
      const rejected = applySemanticAuthoringProposalV1(
        current,
        adapter,
        boundProposal(current, `unsafe-${index}`),
        1_000,
        issues,
      );
      assert.equal(rejected.status, "awaiting_proposal");
      current = rejected.state;
    }
    assert.equal(current.capabilitySession?.mutationInvocationCount, 3);
    control.rejectStage = false;
    const fourth = applySemanticAuthoringProposalV1(
      current,
      adapter,
      boundProposal(current, "mutated"),
      1_000,
      issues,
    );
    assert.equal(fourth.status, "awaiting_proposal");
    assert.equal(fourth.state.candidate, "baseline");
    assert.equal(fourth.state.findings.get("proposal"), "rejected proposal");
    assert.equal(fourth.state.capabilitySession?.mutationInvocationCount, 3);
  });

  it("consumes one recovery at four no-progress steps and fails after three more", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 10,
      finalizePass: true,
      ask: false,
      materialProgress: false,
      rejectStage: false,
    });
    let current = startState(adapter);
    for (let index = 0; index < 7; index += 1) {
      const selected = selectSemanticAuthoringWorkV1(current, adapter, workIds(`rec-${index}`));
      current = selected.state;
      if (index === 3) {
        assert.equal(selected.status, "awaiting_proposal");
        assert.equal(current.recoveryStrategyChanges, 1);
        assert.equal(current.terminalResult, null);
      }
    }
    assert.equal(current.terminalResult?.kind, "failed");
    if (current.terminalResult?.kind !== "failed") {
      assert.fail("expected stall after 4+3 no-progress steps");
    }
    assert.equal(current.terminalResult.receipt.category, "stalled_without_progress");
    assert.equal(current.recoveryStrategyChanges, 1);
  });

  it("finalizes remaining-work-empty candidates instead of stalling", () => {
    const adapter = createScriptedAdapter({
      remainingWork: 0,
      finalizePass: true,
      ask: false,
      materialProgress: false,
      rejectStage: false,
    });
    const seeded = {
      ...startState(adapter),
      progressHistory: ["a", "b", "c", "d", "e", "f"].map((digest) => observation(digest)),
    };
    const finished = selectSemanticAuthoringWorkV1(seeded, adapter, workIds("final"));
    assert.equal(finished.status, "terminal");
    assert.equal(finished.state.terminalResult?.kind, "ready_for_review");
  });

  it("does not ask an owner question when evidence is incomplete or unreferenced", () => {
    const missing = createScriptedAdapter({
      remainingWork: 0,
      finalizePass: false,
      ask: true,
      materialProgress: false,
      rejectStage: false,
      evidence: {
        explicitProblemClaimIds: [],
        materialProtectedImpactClaimIds: ["conflict"],
        materiallyDifferentOutcomeClaimIds: ["conflict"],
        exhaustedRecoveryFindingKeys: ["conflict"],
        unsafeAutomaticResolutionClaimIds: ["conflict"],
      },
    });
    const unknown = createScriptedAdapter({
      remainingWork: 0,
      finalizePass: false,
      ask: true,
      materialProgress: false,
      rejectStage: false,
      evidence: {
        explicitProblemClaimIds: ["missing-id"],
        materialProtectedImpactClaimIds: ["conflict"],
        materiallyDifferentOutcomeClaimIds: ["conflict"],
        exhaustedRecoveryFindingKeys: ["conflict"],
        unsafeAutomaticResolutionClaimIds: ["conflict"],
      },
    });
    const missingResult = selectSemanticAuthoringWorkV1(startState(missing), missing, workIds("ev-1"));
    const unknownResult = selectSemanticAuthoringWorkV1(startState(unknown), unknown, workIds("ev-2"));
    assert.equal(missingResult.state.terminalResult?.kind, "failed");
    assert.equal(unknownResult.state.terminalResult?.kind, "failed");
    if (missingResult.state.terminalResult?.kind !== "failed") {
      assert.fail("empty evidence group did not fail");
    }
    assert.equal(missingResult.state.terminalResult.receipt.category, "bounded_semantic_failure");
    if (unknownResult.state.terminalResult?.kind !== "failed") {
      assert.fail("unreferenced evidence did not fail");
    }
    assert.equal(unknownResult.state.terminalResult.receipt.category, "bounded_semantic_failure");
  });
});
