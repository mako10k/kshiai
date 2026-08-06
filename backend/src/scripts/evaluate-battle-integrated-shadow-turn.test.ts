import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateBattleIntegratedShadowTurn,
  verifyIntegratedShadowEvaluationContentDigest,
} from "./evaluate-battle-integrated-shadow-turn.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("integrated shadow-turn evaluator", () => {
  it("keeps hard evidence separate from one bounded stratum revision", async () => {
    let tick = 0;
    const report = await evaluateBattleIntegratedShadowTurn({
      transcriptPath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json",
      ),
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
      clock: () => tick++,
    });

    assert.equal(report.execution.scenarioCount, 7);
    assert.equal(report.execution.totalRuns, 14);
    assert.equal(report.execution.evaluatorExternalLlmCalls, 0);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.primaryProxiesPass, true);
    assert.equal(report.aggregate.schemaValidityRate, 1);
    assert.equal(report.aggregate.minimumExpectedDependencyRecall, 1);
    assert.equal(report.aggregate.minimumComponentReceiptCoverage, 1);
    assert.equal(report.aggregate.explicitConflictOrUnknownHandlingRate, 1);
    assert.equal(report.aggregate.deterministicDigestStabilityRate, 1);
    assert.equal(report.aggregate.runtimeIntegrationRefCount, 0);
    assert.equal(report.aggregate.registeredScenarioBehaviorCoverage, 0.857143);
    assert.deepEqual(report.aggregate.failedStrata, [
      "interrupted_expanded_action",
    ]);
    assert.equal(report.decision.label, "revise");
    assert.equal(report.decision.blindReview.required, false);
    assert.equal(report.decision.blindReview.providerCalls, 0);
    assert.equal(verifyIntegratedShadowEvaluationContentDigest(report), true);
    assert.ok(report.scenarios.every((scenario) =>
      scenario.distinctReceiptDigests === 1
    ));
  });
});
