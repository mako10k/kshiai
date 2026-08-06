import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateReadCoherencePoc } from "./evaluate-battle-read-coherence-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle read-coherence PoC evaluator", () => {
  it("requires causal selection safety before supporting the revision", async () => {
    const report = await evaluateReadCoherencePoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-read-coherence-fixtures-v1.json",
      ),
      repetitions: 1,
    });

    assert.equal(report.execution.scenarioRuns, 7);
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.xaiUsed, false);
    assert.equal(report.aggregate.conflictDetectionRecall, 1);
    assert.equal(report.aggregate.falseConflictRate, 0);
    assert.equal(report.aggregate.blockingConflictReduction, 0.8);
    assert.equal(report.aggregate.usableReadSuccess, 1);
    assert.equal(report.aggregate.correctSelectionRate, 1);
    assert.equal(report.aggregate.incorrectFactSelectionCount, 0);
    assert.equal(report.aggregate.causalRegressionCount, 0);
    assert.equal(report.aggregate.unnecessaryRepairRate, 0);
    assert.equal(report.aggregate.unknownFallbackRate, 0.5);
    assert.equal(report.aggregate.outOfScopeMutationCount, 0);
    assert.equal(report.aggregate.publicHistoryRewriteCount, 0);
    assert.equal(report.aggregate.sourceMutationCount, 0);
    assert.equal(report.aggregate.authorityRegressionCount, 0);
    assert.equal(report.aggregate.repeatedRepairLoopCount, 0);
    assert.equal(report.aggregate.limitViolationCount, 0);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.effectivenessThresholdsPass, true);
    assert.equal(report.decision.label, "supported");
    assert.deepEqual(report.decision.boundedRevisionHypotheses, []);
    assert.deepEqual(report.staticAuthorityCheck.runtimeIntegrationFileRefs, []);
    assert.equal(
      report.staticAuthorityCheck.exportedCanonicalWriteFunctionCount,
      0,
    );
  });
});
