import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateBattleWorldProcessPoc,
  type WorldProcessJudgeClient,
} from "./evaluate-battle-world-process-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle active world-process PoC evaluator", () => {
  it("separates deterministic invariants from an order-balanced blind proxy", async () => {
    const judgeClient: WorldProcessJudgeClient = {
      async completeJson(input) {
        const candidateA = input.user.split("Candidate A:\n")[1]!
          .split("\n\nCandidate B:\n")[0]!;
        const activeIsA = candidateA.includes('"processRef"');
        return {
          data: {
            preference: activeIsA ? "A" : "B",
            plausibilityA: activeIsA ? 5 : 2,
            plausibilityB: activeIsA ? 2 : 5,
            continuityA: activeIsA ? 5 : 1,
            continuityB: activeIsA ? 1 : 5,
            causalClarityA: activeIsA ? 5 : 2,
            causalClarityB: activeIsA ? 2 : 5,
            unsupportedInventionsA: 0,
            unsupportedInventionsB: 0,
            reason: "The active candidate preserves the frozen process chain.",
          },
          measurement: {
            latencyMs: 1,
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        };
      },
    };
    const report = await evaluateBattleWorldProcessPoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-world-process-fixtures-v1.json",
      ),
      repetitions: 1,
      judgeClient,
      provider: "fixture-judge",
      model: "fixture-model",
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });
    const execution = report.execution as Record<string, unknown>;
    const aggregate = report.aggregate as Record<string, unknown>;
    const decision = report.decision as Record<string, unknown>;

    assert.equal(execution.scenarioCount, 9);
    assert.equal(execution.judgeCalls, 20);
    assert.equal(execution.shadowExternalLlmCalls, 0);
    assert.equal(aggregate.hardInvariantsPass, true);
    assert.equal(aggregate.deterministicEffectivenessPass, true);
    assert.equal(aggregate.semanticProxyPass, true);
    assert.equal(aggregate.expectedProcessProgressionRecall, 1);
    assert.equal(aggregate.triggerDecisionPrecision, 1);
    assert.equal(aggregate.triggerDecisionRecall, 1);
    assert.equal(aggregate.propagationTargetCoverage, 1);
    assert.equal(aggregate.characterProcessConflictHandling, 1);
    assert.equal(aggregate.causalTraceCompleteness, 1);
    assert.equal(aggregate.expectedProgressionGainOverBaseline, 1);
    assert.equal(aggregate.sideSwapSymmetry, 1);
    assert.equal(aggregate.sameBucketAtomicity, 1);
    assert.equal(aggregate.terminalBehaviorCorrectness, 1);
    assert.equal(aggregate.unsupportedEnvironmentalInventionCount, 0);
    assert.equal(aggregate.blindActivePreferenceShare, 1);
    assert.equal(aggregate.blindOrderConsistency, 1);
    assert.ok(
      decision.label === "supported" || decision.label === "revise",
    );
    if (decision.label === "revise") {
      assert.equal(aggregate.costAndComplexityPass, false);
    }
  });
});
