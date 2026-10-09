// R: Verify private awareness contracts reject invalid lifetime, source and history inputs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AwarenessBudgetSnapshotSchema, AwarenessDefaultPolicy, AwarenessPolicyV1Schema, AwarenessDesireSchema, AwarenessLatentInputSchema, AwarenessLatentOutputSchema, AwarenessPipelineStateSchema } from "./awareness-pipeline.js";
import { AwarenessInitialize, AwarenessInitialCharacterState } from "./awareness-state.js";
import { AwarenessNarrationBatchOutputSchema } from "./awareness-narration-contract.js";

describe("awareness-v5 authoritative contracts", () => {
  it("retains unknown fees and requires scalar budgets to agree with reservations", () => {
    const budget = { physicalAttempts: 1, physicalOutstanding: 1, reservedUsd: 0.01, settledUsd: 0, unknownAttemptIds: ["attempt"], reservations: [{ id: "attempt", role: "subconscious", maximumUsd: 0.01, status: "unknown", actualUsd: null, physicalOutstanding: true }] };
    assert.equal(AwarenessBudgetSnapshotSchema.safeParse(budget).success, true);
    assert.equal(AwarenessBudgetSnapshotSchema.safeParse({ ...budget, reservedUsd: 0 }).success, false);
    assert.equal(AwarenessBudgetSnapshotSchema.safeParse({ ...budget, unknownAttemptIds: [] }).success, false);
    const settled = { ...budget, physicalOutstanding: 0, reservedUsd: 0, settledUsd: 0.02, unknownAttemptIds: [], reservations: [{ ...budget.reservations[0], status: "settled", actualUsd: 0.02, physicalOutstanding: false }] };
    assert.equal(AwarenessBudgetSnapshotSchema.safeParse(settled).success, true);
  });
  it("bounds narration batch coverage and rejects repeated receipt identities", () => {
    const receipt = { battleId: "b", turnReceiptId: "r", turn: 1, narrator: ["動いた。", "近づいた。"], speeches: [], recognitionUpdates: [] };
    assert.equal(AwarenessNarrationBatchOutputSchema.safeParse({ receipts: [receipt] }).success, true);
    assert.equal(AwarenessNarrationBatchOutputSchema.safeParse({ receipts: [receipt, receipt] }).success, false);
    assert.equal(AwarenessNarrationBatchOutputSchema.safeParse({ receipts: Array.from({ length: 4 }, (_, i) => ({ ...receipt, turnReceiptId: String(i) })) }).success, false);
  });
  it("locks adopted trial bounds and initializes independent character states", () => {
    assert.deepEqual(AwarenessPolicyV1Schema.parse(AwarenessDefaultPolicy), AwarenessDefaultPolicy);
    assert.equal(AwarenessPolicyV1Schema.safeParse({ ...AwarenessDefaultPolicy, maxTicks: 37 }).success, false);
    const state = AwarenessInitialize({ startedAt: 1000, promptRevision: "prompt-v1", outputRevision: "output-v1" });
    assert.equal(AwarenessPipelineStateSchema.safeParse(state).success, true);
    assert.notEqual(state.sides.a.latent, state.sides.b.latent);
    assert.equal(state.deadlineAt, 181000);
    assert.equal(state.budget.reservations.length, 0);
  });
  it("rejects out-of-range strength, nonpositive or overly long lifetime and mixed resources", () => {
    const desire = { id: "reflex-1", source: "reflex", strength: 0.8, startTick: 1, validUntilTick: 4, resource: "voice", speech: "あっ" };
    assert.equal(AwarenessDesireSchema.safeParse(desire).success, true);
    for (const patch of [{ strength: 1.01 }, { validUntilTick: 1 }, { validUntilTick: 5 }, { action: { kind: "defend" } }]) {
      assert.equal(AwarenessDesireSchema.safeParse({ ...desire, ...patch }).success, false);
    }
  });
  it("keeps reflex and affective outputs separately sourced", () => {
    const state = AwarenessInitialCharacterState().latent;
    const desire = { id: "wrong-source", source: "conscious", strength: 0.5, startTick: 1, validUntilTick: 2, resource: "voice", speech: "痛い" };
    assert.equal(AwarenessLatentOutputSchema.safeParse({ state, reflexDesires: [desire], affectiveDesires: [], reconsider: false, cancelThought: false }).success, false);
  });
  it("has no event or utterance history contract in latent model input", () => {
    assert.equal(AwarenessLatentInputSchema.safeParse({ history: [] }).success, false);
    assert.equal(Object.hasOwn(AwarenessLatentInputSchema.innerType().innerType().shape, "history"), false);
  });
});
