// R: Verify accounting revision identity and unknown cost contracts remain explicit.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessDefaultPolicy, AwarenessObservedPolicy, AwarenessLongMeasurementPolicy, AwarenessNormalPolicy, AwarenessPolicyV1Schema } from "./awareness-policy.js";
import { AwarenessInitialize } from "./awareness-state.js";
import { AwarenessPipelineStateSchema } from "./awareness-pipeline.js";

describe("immutable trial accounting policy", () => {
  it("binds adequate normal timing to usage-v2 without rewriting existing policies", () => {
    assert.equal(AwarenessNormalPolicy.revision, "awareness-v5-usage-v3");
    assert.ok(AwarenessPolicyV1Schema.safeParse(AwarenessNormalPolicy).success);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessNormalPolicy, revision: "awareness-v5-usage-v1" }).success, false);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessNormalPolicy, maxDurationMs: 180000 }).success, false);
    assert.equal(AwarenessNormalPolicy.roles.subconscious.deadlineMs, 60000);
    assert.equal(AwarenessNormalPolicy.roles.conscious.deadlineMs, 90000);
    assert.equal(AwarenessNormalPolicy.roles.adjudication.deadlineMs, 180000);
    const historical = AwarenessPolicyV1Schema.parse({ ...AwarenessLongMeasurementPolicy, revision: "awareness-v5-usage-v2" });
    assert.equal(historical.roles.adjudication.deadlineMs, 60000);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessNormalPolicy, revision: "awareness-v5-usage-v2" }).success, false);
    assert.equal(AwarenessNormalPolicy.maxPhysicalAttempts, historical.maxPhysicalAttempts);
    assert.equal(AwarenessNormalPolicy.roles.narration.deadlineMs, 60000);
    assert.equal(AwarenessNormalPolicy.narration.publicationDeadlineMs, 180000);
    assert.equal(AwarenessNormalPolicy.narration.terminalDrainMs, 90000);
    assert.equal(AwarenessInitialize({ startedAt: 100, promptRevision: "p", outputRevision: "o", policy: AwarenessNormalPolicy }).deadlineAt, 600100);
    assert.equal(AwarenessObservedPolicy.roles.subconscious.deadlineMs, 5000);
    assert.equal(AwarenessObservedPolicy.roles.conscious.deadlineMs, 15000);
    assert.equal(AwarenessObservedPolicy.maxDurationMs, 180000);
  });
  it("correlates isolated measurement deadlines with their immutable revision", () => {
    assert.ok(AwarenessPolicyV1Schema.safeParse(AwarenessLongMeasurementPolicy).success);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessLongMeasurementPolicy, revision: "awareness-v5-usage-v1" }).success, false);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessObservedPolicy, roles: AwarenessLongMeasurementPolicy.roles }).success, false);
    const state = AwarenessInitialize({ startedAt: 100, promptRevision: "p", outputRevision: "o", policy: AwarenessLongMeasurementPolicy });
    assert.equal(state.deadlineAt, 600100);
    assert.equal(AwarenessInitialize({ startedAt: 100, promptRevision: "p", outputRevision: "o" }).deadlineAt, 180100);
  });
  it("keeps the historical certified policy and new measured policy distinct", () => {
    assert.ok(AwarenessPolicyV1Schema.safeParse(AwarenessDefaultPolicy).success);
    assert.ok(AwarenessPolicyV1Schema.safeParse(AwarenessObservedPolicy).success);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessDefaultPolicy, accountingMode: "observed" }).success, false);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessObservedPolicy, accountingMode: "certified" }).success, false);
  });
  it("allows unknown monetary reservations only under measured accounting", () => {
    const state = AwarenessInitialize({ startedAt: 1, promptRevision: "p", outputRevision: "o", policy: AwarenessObservedPolicy });
    const budget = { physicalAttempts: 1, physicalOutstanding: 1, reservedUsd: 0, settledUsd: 0,
      unknownAttemptIds: ["unknown"], reservations: [{ id: "unknown", role: "subconscious", maximumUsd: null,
        actualUsd: null, status: "reserved", physicalOutstanding: true }] };
    assert.ok(AwarenessPipelineStateSchema.safeParse({ ...state, budget }).success);
    assert.equal(AwarenessPipelineStateSchema.safeParse({ ...state, policy: AwarenessDefaultPolicy, budget }).success, false);
    assert.equal(AwarenessPipelineStateSchema.safeParse({ ...state, budget: { ...budget, unknownAttemptIds: [] } }).success, false);
  });
});
