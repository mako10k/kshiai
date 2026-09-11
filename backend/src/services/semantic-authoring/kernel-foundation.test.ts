import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSemanticAuthoringQueryInputV1Schema,
  createSemanticAuthoringQueryResultV1Schema,
  createSemanticAuthoringSubmissionIssueV1Schema,
  createSemanticProposalV1Schema,
  type AdapterProgressObservationV1,
  type SemanticAuthoringAccountingV1,
  type SemanticAuthoringPolicyV1,
  type SemanticAuthoringReservationV1,
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
    findings: new Map<string, string>(),
  };

  it("atomically replaces staged state only after every hard check passes", () => {
    const result = applyProposalTransactionV1(
      initial,
      2,
      { value: "replacement" },
      (_candidate, findings, proposal) => ({
        accepted: true,
        candidate: proposal,
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
      (_candidate, findings, proposal) => ({
        accepted: true,
        candidate: proposal,
        findings,
      }),
      [() => hardFailure],
      { key: "revision", finding: "stale revision" },
    );
    const second = applyProposalTransactionV1(
      first.state,
      2,
      { value: "still-unsafe" },
      (_candidate, findings, proposal) => ({
        accepted: true,
        candidate: proposal,
        findings,
      }),
      [() => hardFailure],
      { key: "revision", finding: "stale revision" },
    );

    assert.equal(first.accepted, false);
    assert.deepEqual(first.state.candidate, { value: "trusted" });
    assert.equal(second.state.findings.size, 1);
  });

  it("rejects a stale base revision before staging", () => {
    let staged = false;
    const result = applyProposalTransactionV1(
      initial,
      1,
      { value: "ignored" },
      (_candidate, findings, proposal) => {
        staged = true;
        return { accepted: true, candidate: proposal, findings };
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
