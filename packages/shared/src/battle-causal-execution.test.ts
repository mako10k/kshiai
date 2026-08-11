import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptCausalExecutionDecision,
  causalExecutionDecisionSides,
  commitCausalExecutionBucket,
  createCausalTurnExecution,
  finishCausalTurnExecution,
} from "./battle-causal-execution.js";
import { buildBattleTemporalPlan } from "./battle-temporal-rules.js";

describe("causal turn execution", () => {
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
