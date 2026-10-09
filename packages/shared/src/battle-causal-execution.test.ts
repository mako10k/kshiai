import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptCausalExecutionDecision,
  causalExecutionDecisionSides,
  commitCausalExecutionBucket,
  createCausalTurnExecution,
  finishCausalTurnExecution,
  CausalTurnExecutionSchema,
} from "./battle-causal-execution.js";
import { selectSequentialInitiativeOrder } from "./battle-temporal-rules.js";
import { buildSequentialBattleTemporalPlan } from "./battle-temporal-rules.js";
import { buildBattleTemporalPlan } from "./battle-temporal-rules.js";

// R: Verify causal checkpoint ordering and receipt completeness for retained temporal rulesets.
describe("causal turn execution", () => {
  it("retains a sequential initiative receipt through serialized checkpoints", () => {
    const initiativeOrder = selectSequentialInitiativeOrder({
      effectiveSpeedA: 10,
      effectiveSpeedB: 10,
      previousOrder: ["b", "a"],
    });
    let execution = createCausalTurnExecution({
      executionId: "sequential-checkpoint",
      battleId: "battle-checkpoint",
      turn: 2,
      expectedStateRevision: 1,
      temporalPlan: buildSequentialBattleTemporalPlan(initiativeOrder),
      initiativeOrder,
    });
    assert.deepEqual(causalExecutionDecisionSides(execution), ["b"]);
    execution = acceptCausalExecutionDecision({ execution, side: "b" });
    execution = commitCausalExecutionBucket({ execution });
    execution = CausalTurnExecutionSchema.parse(JSON.parse(JSON.stringify(execution)));
    assert.deepEqual(execution.initiativeOrder, initiativeOrder);
    assert.deepEqual(causalExecutionDecisionSides(execution), ["a"]);
    execution = acceptCausalExecutionDecision({ execution, side: "a" });
    execution = commitCausalExecutionBucket({ execution });
    execution = finishCausalTurnExecution({ execution });
    assert.deepEqual(execution.committedBucketIndices, [0, 1]);
    assert.equal(execution.status, "finished");
    assert.deepEqual(CausalTurnExecutionSchema.parse(JSON.parse(JSON.stringify(execution))), execution);
  });
  it("rejects a repeated decision that leaves a simultaneous actor undecided", () => {
    const execution = createCausalTurnExecution({
      executionId: "duplicate-decision",
      battleId: "battle-duplicate-decision",
      turn: 1,
      expectedStateRevision: 0,
      temporalPlan: buildBattleTemporalPlan({ effectiveSpeedA: 12, effectiveSpeedB: 12 }),
    });
    assert.equal(CausalTurnExecutionSchema.safeParse({
      ...execution,
      status: "awaiting_bucket_commit",
      decidedSides: ["a", "a"],
    }).success, false);
  });

  it("rejects terminal receipts that omit a planned bucket", () => {
    const execution = createCausalTurnExecution({
      executionId: "missing-bucket",
      battleId: "battle-missing-bucket",
      turn: 1,
      expectedStateRevision: 0,
      temporalPlan: buildBattleTemporalPlan({ effectiveSpeedA: 15, effectiveSpeedB: 10 }),
    });
    for (const status of ["awaiting_finalize", "finished"]) {
      for (const committedBucketIndices of [[0, 0], [0, 5]]) {
        assert.equal(CausalTurnExecutionSchema.safeParse({
          ...execution,
          status,
          bucketIndex: 2,
          committedBucketIndices,
        }).success, false);
      }
    }
  });

  it("persists the initiative order receipt before decisions", () => {
    const initiativeOrder = selectSequentialInitiativeOrder({
      effectiveSpeedA: 15,
      effectiveSpeedB: 10,
    });
    const execution = createCausalTurnExecution({
      executionId: "battle-1:turn:1",
      battleId: "battle-1",
      turn: 1,
      expectedStateRevision: 0,
      temporalPlan: buildBattleTemporalPlan({
        effectiveSpeedA: 15,
        effectiveSpeedB: 10,
      }),
      initiativeOrder,
    });
    assert.deepEqual(execution.initiativeOrder, initiativeOrder);
    assert.deepEqual(causalExecutionDecisionSides(execution), ["a"]);
  });

  it("makes the later sequential bucket available only after a durable first commit", () => {
    let execution = createCausalTurnExecution({
      executionId: "exec-1",
      battleId: "battle-1",
      turn: 4,
      expectedStateRevision: 12,
      temporalPlan: buildBattleTemporalPlan({
        effectiveSpeedA: 15,
        effectiveSpeedB: 10,
      }),
    });

    assert.deepEqual(causalExecutionDecisionSides(execution), ["a"]);
    execution = acceptCausalExecutionDecision({ execution, side: "a" });
    assert.equal(execution.status, "awaiting_bucket_commit");
    execution = commitCausalExecutionBucket({ execution });
    assert.equal(execution.status, "awaiting_decision");
    assert.deepEqual(causalExecutionDecisionSides(execution), ["b"]);
    assert.deepEqual(execution.committedBucketIndices, [0]);

    execution = acceptCausalExecutionDecision({ execution, side: "b" });
    execution = commitCausalExecutionBucket({ execution });
    assert.equal(execution.status, "awaiting_finalize");
    execution = finishCausalTurnExecution({ execution });
    assert.equal(execution.status, "finished");
    assert.equal(execution.bucketIndex, 2);
  });

  it("requires all simultaneous-bucket decisions before commit", () => {
    let execution = createCausalTurnExecution({
      executionId: "exec-2",
      battleId: "battle-2",
      turn: 1,
      expectedStateRevision: 0,
      temporalPlan: buildBattleTemporalPlan({
        effectiveSpeedA: 12,
        effectiveSpeedB: 13,
      }),
    });

    assert.deepEqual(causalExecutionDecisionSides(execution), ["a", "b"]);
    execution = acceptCausalExecutionDecision({ execution, side: "b" });
    assert.equal(execution.status, "awaiting_decision");
    assert.throws(
      () => commitCausalExecutionBucket({ execution }),
      /not awaiting a bucket commit/,
    );
    execution = acceptCausalExecutionDecision({ execution, side: "a" });
    assert.equal(execution.status, "awaiting_bucket_commit");
  });

  it("rejects a decision for a later bucket before its predecessor commits", () => {
    const execution = createCausalTurnExecution({
      executionId: "exec-3",
      battleId: "battle-3",
      turn: 2,
      expectedStateRevision: 3,
      temporalPlan: buildBattleTemporalPlan({
        effectiveSpeedA: 16,
        effectiveSpeedB: 10,
      }),
    });

    assert.throws(
      () => acceptCausalExecutionDecision({ execution, side: "b" }),
      /not in the active bucket/,
    );
  });
});
