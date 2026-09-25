import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  SemanticAuthoringAccountingV1,
  SemanticAuthoringPolicyV1,
  SemanticAuthoringReservationV1,
  SemanticAuthoringRunV1,
  SemanticAuthoringStateV1,
} from "@kshiai/shared";
import {
  acceptSemanticAuthoringDeliveryV1,
  expireOutstandingSemanticAuthoringV1,
  scheduleSemanticAuthoringReservationV1,
} from "./ports.js";
import { createScriptedSemanticAuthoringPortsV1 } from "./scripted-ports.js";

const policy: SemanticAuthoringPolicyV1 = {
  identity: "semantic_authoring_policy_v1",
  maxConcurrentProviderRequests: 1,
  maxLlmCalls: 8,
  maxCountedSteps: 48,
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

const fence = {
  ownerId: "owner-1",
  fencingToken: 1,
  runVersion: 1,
};

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
  adapterIdentity: "scripted-v1",
  policyIdentity: "semantic_authoring_policy_v1",
  pricingIdentity: "pricing-v1",
  tokenEstimatorIdentity: "bytes-upper-bound-v1",
  expectedCurrentGenerationId: null,
  executionFence: fence,
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

function claimedState(
  overrides: Partial<SemanticAuthoringStateV1<string, string, string, string, string, string>> = {},
): SemanticAuthoringStateV1<string, string, string, string, string, string> {
  return {
    run,
    policy,
    candidateRevision: 0,
    candidate: "baseline",
    obligations: new Map(),
    findings: new Map(),
    provenance: new Map(),
    sourceDispositions: new Map(),
    accounting: zeroAccounting,
    outstandingReservation: null,
    phase: "baseline",
    progressHistory: [],
    recoveryStrategyChanges: 0,
    cycleRecoveryAlreadyUsed: false,
    activeWorkItem: null,
    capabilitySession: null,
    terminalResult: null,
    ...overrides,
  };
}

describe("scripted semantic authoring ports", () => {
  it("rejects a reservation that would exhaust cost before dispatch", () => {
    const ports = createScriptedSemanticAuthoringPortsV1({ nowMs: 0, fence, timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 });
    const result = scheduleSemanticAuthoringReservationV1(
      claimedState({
        accounting: { ...zeroAccounting, costMicroUsd: 480_000 },
      }),
      reservation({ costMicroUsd: 30_000 }),
      ports,
    );
    assert.equal(result.status, "not_admitted");
    if (result.status !== "not_admitted") {
      assert.fail("cost exhaustion was admitted");
    }
    assert.equal(result.exhausted, "cost");
    assert.equal(result.state.outstandingReservation, null);
    assert.equal(ports.provider.dispatchedAtMs("request-1"), null);
  });

  it("uses the route timeout, charges the reservation, and ignores a late result", () => {
    const ports = createScriptedSemanticAuthoringPortsV1({ nowMs: 1_000, fence, timeoutMs: 2_000, maxRecoveriesPerWorkItem: 0 });
    const scheduled = scheduleSemanticAuthoringReservationV1(
      claimedState(),
      reservation(),
      ports,
    );
    assert.equal(scheduled.status, "scheduled");
    if (scheduled.status !== "scheduled") {
      assert.fail("reservation was not scheduled");
    }

    ports.advanceMs(2_000);
    const expired = expireOutstandingSemanticAuthoringV1(scheduled.state, ports);
    assert.equal(expired.status, "terminal");
    assert.equal(expired.state.terminalResult?.kind, "failed");
    if (expired.state.terminalResult?.kind !== "failed") {
      assert.fail("timeout did not fail the run");
    }
    assert.equal(expired.state.terminalResult.receipt.category, "provider_transport_unavailable");
    assert.equal(expired.state.terminalResult.receipt.transportReason, "policy_disallows_recovery");
    assert.equal(expired.state.accounting.llmCalls, 1);
    assert.equal(expired.state.accounting.elapsedMs, 2_000);
    assert.equal(expired.state.accounting.costMicroUsd, 50_000);
    assert.equal(expired.state.outstandingReservation, null);
    assert.equal("outcome" in expired.state, false);

    const late = acceptSemanticAuthoringDeliveryV1(
      expired.state,
      "request-1",
      ports,
    );
    assert.equal(late.status, "rejected");
    if (late.status !== "rejected") {
      assert.fail("late result was applied");
    }
    assert.equal(late.reason, "late_result");
    assert.equal(late.state.candidate, "baseline");
    assert.equal(late.state.terminalResult?.kind, "failed");
    assert.equal(late.state.accounting.llmCalls, 1);
  });

  it("accepts an in-time delivery only while the same fence owns the outstanding request", () => {
    const ports = createScriptedSemanticAuthoringPortsV1({ nowMs: 1_000, fence, timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 });
    const scheduled = scheduleSemanticAuthoringReservationV1(
      claimedState(),
      reservation(),
      ports,
    );
    assert.equal(scheduled.status, "scheduled");
    if (scheduled.status !== "scheduled") {
      assert.fail("reservation was not scheduled");
    }

    const stale = createScriptedSemanticAuthoringPortsV1({ nowMs: 1_000, fence, timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 });
    stale.provider.recordDispatch(reservation(), 1_000);
    stale.replaceFence({ ownerId: "owner-1", fencingToken: 2, runVersion: 1 });
    const mismatched = acceptSemanticAuthoringDeliveryV1(
      scheduled.state,
      "request-1",
      stale,
    );
    assert.equal(mismatched.status, "rejected");
    if (mismatched.status !== "rejected") {
      assert.fail("stale fence applied a result");
    }
    assert.equal(mismatched.reason, "fence_mismatch");
    assert.equal(mismatched.state.candidate, "baseline");
    assert.equal(mismatched.state.outstandingReservation?.requestId, "request-1");
    assert.equal(mismatched.state.accounting.llmCalls, 0);

    ports.advanceMs(1_000);
    const onTime = acceptSemanticAuthoringDeliveryV1(
      scheduled.state,
      "request-1",
      ports,
    );
    assert.equal(onTime.status, "accepted");
    if (onTime.status !== "accepted") {
      assert.fail("in-time delivery was rejected");
    }
    assert.equal(onTime.state.outstandingReservation, null);
    assert.equal(onTime.state.accounting.llmCalls, 1);
    assert.equal(onTime.state.terminalResult, null);
    assert.equal(onTime.state.candidate, "baseline");
  });

  it("fails trusted-state corruption before dispatch or delivery", () => {
    const ports = createScriptedSemanticAuthoringPortsV1({ nowMs: 0, fence, timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 });
    const corrupt = claimedState({ candidateRevision: -1 });
    const scheduled = scheduleSemanticAuthoringReservationV1(
      corrupt,
      reservation(),
      ports,
    );
    assert.equal(scheduled.status, "terminal");
    if (scheduled.status !== "terminal") {
      assert.fail("corrupt state was scheduled");
    }
    assert.equal(scheduled.state.terminalResult?.kind, "failed");
    if (scheduled.state.terminalResult?.kind !== "failed") {
      assert.fail("corrupt state did not fail");
    }
    assert.equal(scheduled.state.terminalResult.receipt.category, "trusted_state_corrupt");
    assert.equal(scheduled.state.outstandingReservation, null);
    assert.equal(ports.provider.dispatchedAtMs("request-1"), null);

    const livePorts = createScriptedSemanticAuthoringPortsV1({ nowMs: 0, fence, timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 });
    const live = scheduleSemanticAuthoringReservationV1(
      claimedState(),
      reservation(),
      livePorts,
    );
    assert.equal(live.status, "scheduled");
    if (live.status !== "scheduled") {
      assert.fail("valid reservation was not scheduled");
    }
    const delivered = acceptSemanticAuthoringDeliveryV1(
      { ...live.state, candidateRevision: -1 },
      "request-1",
      livePorts,
    );
    assert.equal(delivered.status, "terminal");
    if (delivered.status !== "terminal") {
      assert.fail("corrupt delivery did not fail");
    }
    assert.equal(delivered.state.terminalResult?.kind, "failed");
    if (delivered.state.terminalResult?.kind !== "failed") {
      assert.fail("corrupt delivery did not record failure");
    }
    assert.equal(delivered.state.terminalResult.receipt.category, "trusted_state_corrupt");
    assert.equal(delivered.state.candidate, "baseline");
    assert.equal(delivered.state.outstandingReservation, null);
    assert.equal(delivered.state.accounting.llmCalls, 1);
    assert.equal(delivered.state.accounting.costMicroUsd, 50_000);
  });

  it("charges an outstanding reservation when expire hits step exhaustion", () => {
    const ports = createScriptedSemanticAuthoringPortsV1({ nowMs: 0, fence, timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 });
    const scheduled = scheduleSemanticAuthoringReservationV1(
      claimedState(),
      reservation(),
      ports,
    );
    assert.equal(scheduled.status, "scheduled");
    if (scheduled.status !== "scheduled") {
      assert.fail("reservation was not scheduled");
    }
    const expired = expireOutstandingSemanticAuthoringV1(
      {
        ...scheduled.state,
        accounting: { ...scheduled.state.accounting, countedSteps: 48 },
      },
      ports,
    );
    assert.equal(expired.status, "terminal");
    if (expired.state.terminalResult?.kind !== "failed") {
      assert.fail("step exhaustion did not fail");
    }
    assert.equal(expired.state.terminalResult.receipt.category, "resource_exhausted");
    assert.equal(expired.state.outstandingReservation, null);
    assert.equal(expired.state.accounting.llmCalls, 1);
    assert.equal(expired.state.accounting.costMicroUsd, 50_000);
  });
});
