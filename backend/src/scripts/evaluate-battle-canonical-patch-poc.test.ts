import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBattleCanonicalPatchPoc } from "./evaluate-battle-canonical-patch-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle canonical patch PoC evaluator", () => {
  it("measures parity, bounded audit behavior, and authority without LLM calls", async () => {
    const report = await evaluateBattleCanonicalPatchPoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-patch-fixtures-v1.json",
      ),
      repetitions: 1,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(report.fixtureVersion, "battle-pipeline-patch-eval-v1");
    assert.equal(report.execution.conversionFixtureCount, 6);
    assert.equal(report.execution.conversionAttempts, 6);
    assert.equal(report.execution.defectSeedCount, 11);
    assert.equal(report.execution.defectAudits, 11);
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.xaiUsed, false);
    assert.equal(report.aggregate.conversionClassificationAccuracy, 1);
    assert.equal(report.aggregate.reconstructedPostStateParity, 1);
    assert.equal(report.aggregate.causalSourceParity, 1);
    assert.equal(report.aggregate.seededDefectRecall, 1);
    assert.equal(report.aggregate.falseRejectionCount, 0);
    assert.equal(report.aggregate.unexplainedStateChangeCount, 0);
    assert.equal(report.aggregate.authorityRegressionCount, 0);
    assert.equal(report.aggregate.sourceMutationCount, 0);
    assert.equal(report.aggregate.schemaFailureCount, 0);
    assert.equal(report.aggregate.patchLimitViolationCount, 0);
    assert.ok(
      report.aggregate.auditScopeByteReduction >=
        report.thresholds.auditScopeByteReductionMinimum,
    );
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.seededDefectRecallPass, true);
    assert.equal(report.aggregate.falseRejectionPass, true);
    assert.equal(report.aggregate.auditScopeByteReductionPass, true);
    assert.deepEqual(report.staticAuthorityCheck.runtimeIntegrationFileRefs, []);
    assert.equal(report.staticAuthorityCheck.exportedCommitFunctionCount, 0);
    assert.equal(report.decision.label, "supported");
  });
});
