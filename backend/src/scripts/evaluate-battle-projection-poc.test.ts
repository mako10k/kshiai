import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBattleProjectionPoc } from "./evaluate-battle-projection-poc.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("battle projection PoC evaluator", () => {
  it("measures the frozen fixtures without external LLM calls", async () => {
    const report = await evaluateBattleProjectionPoc({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-projection-fixtures-v1.json",
      ),
      repetitions: 1,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(report.fixtureVersion, "battle-pipeline-projection-eval-v1");
    assert.equal(report.execution.fixtureCount, 6);
    assert.equal(report.execution.projectionReads, 6);
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.xaiUsed, false);
    assert.equal(report.baselineOutcomeComparison.scenarioCount, 9);
    assert.equal(report.baselineOutcomeComparison.mismatchCount, 0);
    assert.equal(report.aggregate.schemaFailureCount, 0);
    assert.equal(report.aggregate.sourceMutationCount, 0);
    assert.equal(report.aggregate.identityLeakageCount, 0);
    assert.equal(report.aggregate.observerIsolationViolationCount, 0);
    assert.equal(report.aggregate.limitViolationCount, 0);
    assert.equal(report.aggregate.baselineOutcomeMismatchCount, 0);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.ok(report.aggregate.decisiveFactRecall >= 0);
    assert.ok(report.aggregate.decisiveFactRecall <= 1);
    assert.ok(Number.isFinite(report.aggregate.irrelevantFactByteReduction));
    assert.ok(report.aggregate.p95ProjectionLatencyMs >= 0);
    assert.ok([
      "supported",
      "revise",
      "unsupported",
      "indeterminate",
    ].includes(report.decision.label));
  });
});
