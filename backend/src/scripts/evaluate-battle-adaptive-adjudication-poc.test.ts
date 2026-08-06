import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateBattleAdaptiveAdjudicationPoc,
  type AdaptiveAdjudicationJudgeClient,
} from "./evaluate-battle-adaptive-adjudication-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle adaptive adjudication PoC evaluator", () => {
  it("separates deterministic invariants from an order-balanced blind proxy", async () => {
    const judgeClient: AdaptiveAdjudicationJudgeClient = {
      async completeJson(input) {
        const candidateA = input.user.split("Candidate A:\n")[1]!
          .split("\n\nCandidate B:\n")[0]!;
        const adaptiveIsA = candidateA.includes("completedSteps");
        return {
          data: {
            preference: adaptiveIsA ? "A" : "B",
            plausibilityA: adaptiveIsA ? 5 : 2,
            plausibilityB: adaptiveIsA ? 2 : 5,
            explanationA: adaptiveIsA ? 5 : 2,
            explanationB: adaptiveIsA ? 2 : 5,
            causalClarityA: adaptiveIsA ? 5 : 2,
            causalClarityB: adaptiveIsA ? 2 : 5,
            knownFactContradictionsA: adaptiveIsA ? 0 : 1,
            knownFactContradictionsB: adaptiveIsA ? 1 : 0,
            unsupportedAssertionsA: adaptiveIsA ? 0 : 1,
            unsupportedAssertionsB: adaptiveIsA ? 1 : 0,
            reason: "The adaptive candidate preserves the frozen causal boundary.",
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
    const report = await evaluateBattleAdaptiveAdjudicationPoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-adaptive-adjudication-fixtures-v1.json",
      ),
      repetitions: 1,
      judgeClient,
      provider: "fixture-judge",
      model: "fixture-model",
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(report.execution.scenarioCount, 7);
    assert.equal(report.execution.judgeCalls, 20);
    assert.equal(report.execution.shadowExternalLlmCalls, 0);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.deterministicEffectivenessPass, true);
    assert.equal(report.aggregate.semanticProxyPass, true);
    assert.equal(report.aggregate.fastPathOutcomeParity, 1);
    assert.equal(report.aggregate.expansionTriggerPrecision, 1);
    assert.equal(report.aggregate.expansionTriggerRecall, 1);
    assert.equal(report.aggregate.partialPrefixCorrectness, 1);
    assert.equal(report.aggregate.budgetDegradationCorrectness, 1);
    assert.equal(report.aggregate.blindAdaptivePreferenceShare, 1);
    assert.equal(report.aggregate.blindOrderConsistency, 1);
    assert.ok(
      report.decision.label === "supported" ||
        report.decision.label === "revise",
    );
    if (report.decision.label === "revise") {
      assert.equal(report.aggregate.costAndComplexityPass, false);
    }
  });
});
