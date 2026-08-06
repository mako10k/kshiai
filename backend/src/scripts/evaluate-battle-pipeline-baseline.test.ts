import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBattlePipelineBaseline } from "./evaluate-battle-pipeline-baseline.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle pipeline PoC baseline evaluator", () => {
  it("keeps the frozen local corpus stable and hard-invariant clean", async () => {
    const report = await evaluateBattlePipelineBaseline({
      corpusPath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-poc-corpus-v1.json",
      ),
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(report.corpusVersion, "battle-pipeline-poc-baseline-v1");
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.localScenarioCount, 9);
    assert.equal(report.aggregate.hardCheckFailCount, 0);
    assert.equal(report.aggregate.schemaValidityRate, 1);
    assert.equal(report.aggregate.authorityViolationCount, 0);
    assert.equal(report.aggregate.privacyLeakCount, 0);
    assert.equal(report.aggregate.atomicityFailureCount, 0);
    assert.equal(report.aggregate.causalReferenceGapCount, 0);
    assert.equal(report.aggregate.sideSwapMismatchCount, 0);
    assert.equal(report.aggregate.allLocalOutcomesStable, true);
    assert.equal(report.aggregate.existingEvidenceHashesMatch, true);
    assert.equal(report.humanQualityBaseline.status, "unmeasured");
    assert.ok(
      report.localScenarios.every((scenario) =>
        scenario.sizeBytes.projectionBytes === null
      ),
    );
  });
});
