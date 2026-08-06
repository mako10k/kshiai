import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBattleCanonicalGraphPoc } from "./evaluate-battle-canonical-graph-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle canonical graph PoC evaluator", () => {
  it("measures the frozen graph boundaries without external LLM calls", async () => {
    const report = await evaluateBattleCanonicalGraphPoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-canonical-graph-fixtures-v1.json",
      ),
      repetitions: 1,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(
      report.fixtureVersion,
      "battle-pipeline-canonical-graph-eval-v1",
    );
    assert.equal(report.execution.fixtureCount, 4);
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.xaiUsed, false);
    assert.equal(report.execution.indexMaintenanceMode, "discard_and_full_rebuild");
    assert.equal(report.aggregate.schemaFailureCount, 0);
    assert.equal(report.aggregate.sourceMutationCount, 0);
    assert.equal(report.aggregate.runtimeIntegrationRefCount, 0);
    assert.equal(report.aggregate.exportedMutationAuthorityCount, 0);
    assert.equal(report.aggregate.committedOutcomeMismatchCount, 0);
    assert.equal(report.aggregate.projectionFactEquality, 1);
    assert.equal(report.aggregate.projectionScopeEquality, 1);
    assert.equal(report.aggregate.projectionCausalEquality, 1);
    assert.equal(report.aggregate.queryClaimRecall, 1);
    assert.equal(report.aggregate.orderIndependence, 1);
    assert.equal(report.aggregate.restartParity, 1);
    assert.equal(report.aggregate.committedOutcomeParity, 1);
    assert.equal(report.aggregate.rollbackSuccess, 1);
    assert.equal(report.aggregate.patchContextRecall, 1);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.effectivenessPass, true);
    assert.equal(report.componentAssessment.incrementalMaintenanceAvailable, false);
    assert.equal(report.componentAssessment.independentPersistenceSupported, false);
    assert.ok(
      report.decision.label === "supported" ||
        report.decision.label === "revise",
    );
    if (report.decision.label === "revise") {
      assert.equal(report.aggregate.costAndComplexityPass, false);
    }
  });
});
