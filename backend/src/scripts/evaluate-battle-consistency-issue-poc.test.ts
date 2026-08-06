import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBattleConsistencyIssuePoc } from "./evaluate-battle-consistency-issue-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle consistency issue PoC evaluator", () => {
  it("measures issue lifecycle effectiveness without LLM or canonical writes", async () => {
    const report = await evaluateBattleConsistencyIssuePoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-consistency-issue-fixtures-v1.json",
      ),
      repetitions: 1,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(
      report.fixtureVersion,
      "battle-pipeline-consistency-issue-eval-v1",
    );
    assert.equal(report.execution.scenarioCount, 3);
    assert.equal(report.execution.scenarioRuns, 3);
    assert.equal(report.execution.trueIssueObservations, 12);
    assert.equal(report.execution.falsePositiveBoundaryInputs, 2);
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.xaiUsed, false);
    assert.equal(report.aggregate.issueDetectionRecall, 1);
    assert.equal(report.aggregate.falsePositiveRate, 0);
    assert.equal(report.aggregate.deduplicationRecall, 1);
    assert.equal(report.aggregate.distinctIssuePreservation, 1);
    assert.equal(report.aggregate.staleReplayNoOpAccuracy, 1);
    assert.equal(report.aggregate.purposeBlockingAccuracy, 1);
    assert.equal(report.aggregate.lifecycleTraceability, 1);
    assert.equal(report.aggregate.actionableIssueRate, 1);
    assert.ok(
      report.aggregate.storageBytesPerUniqueIssue <=
        report.thresholds.storageBytesPerUniqueIssueMaximum,
    );
    assert.equal(report.aggregate.operatorReviewInflation, 1);
    assert.equal(report.aggregate.sourceMutationCount, 0);
    assert.equal(report.aggregate.authorityRegressionCount, 0);
    assert.equal(report.aggregate.globalCoherenceClaimCount, 0);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.effectivenessThresholdsPass, true);
    assert.deepEqual(report.staticAuthorityCheck.runtimeIntegrationFileRefs, []);
    assert.equal(
      report.staticAuthorityCheck.exportedCanonicalWriteFunctionCount,
      0,
    );
    assert.equal(report.scenarios[2]?.deduplicationRecall, null);
    assert.equal(report.scenarios[2]?.staleReplayNoOpAccuracy, null);
    assert.equal(report.decision.label, "supported");
  });
});
