import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ConflictHandlingHeldOutEvaluationReportSchema,
  evaluateBattleConflictHandlingHeldOut,
  verifyConflictHandlingHeldOutEvaluationContentDigest,
  verifyConflictHandlingHeldOutEvaluationCurrentSources,
} from "./evaluate-battle-conflict-handling-held-out.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidencePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-conflict-handling-held-out-evaluation-2026-08-06.json",
);

describe("conflict-handling held-out generalization evaluation", () => {
  it("keeps incomplete diagnostic runs indeterminate", async () => {
    let clockValue = 0;
    const report = await evaluateBattleConflictHandlingHeldOut({
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
      clock: () => {
        clockValue += 0.01;
        return clockValue;
      },
    });

    assert.equal(report.execution.classifierRuns, 60);
    assert.equal(report.execution.integrationRuns, 12);
    assert.equal(report.execution.totalRuns, 72);
    assert.equal(report.gates.registeredRepetitionCount, false);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.primaryProxiesPass, true);
    assert.equal(report.aggregate.exactClassifierLabelCorrectCases, 30);
    assert.equal(report.aggregate.exactTriggerKindSetCorrectCases, 30);
    assert.ok(report.aggregate.triggerKindRecall.every((item) =>
      item.recall === 1
    ));
    assert.equal(report.aggregate.triggerFalseNegativeRate, 0);
    assert.equal(report.aggregate.noTriggerSpecificityCorrectCases, 4);
    assert.equal(report.aggregate.missingRecallCorrectCases, 8);
    assert.equal(report.aggregate.handledAccuracyCorrectCases, 18);
    assert.equal(report.aggregate.dispositionAccuracyCorrectCases, 30);
    assert.equal(report.aggregate.expectedDistributionParity, true);
    assert.equal(report.aggregate.multiTriggerInterferenceCorrectCases, 6);
    assert.equal(report.aggregate.integrationExtractionCorrectControls, 6);
    assert.equal(report.aggregate.integrationLegacyParityControls, 6);
    assert.equal(report.aggregate.deterministicStableCases, 36);
    assert.equal(report.decision.label, "indeterminate");
    assert.equal(
      verifyConflictHandlingHeldOutEvaluationContentDigest(report),
      true,
    );
    assert.equal(
      await verifyConflictHandlingHeldOutEvaluationCurrentSources(report),
      true,
    );
  });

  it("verifies the frozen registered 720-run evidence", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as unknown;
    const report = ConflictHandlingHeldOutEvaluationReportSchema.parse(raw);

    assert.equal(report.execution.classifierRuns, 600);
    assert.equal(report.execution.integrationRuns, 120);
    assert.equal(report.execution.totalRuns, 720);
    assert.equal(report.gates.allRequiredGatesPass, true);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.primaryProxiesPass, true);
    assert.equal(report.aggregate.triggerFalseNegativeCount, 0);
    assert.equal(report.decision.label, "supported");
    assert.equal(
      verifyConflictHandlingHeldOutEvaluationContentDigest(raw),
      true,
    );
    assert.equal(
      await verifyConflictHandlingHeldOutEvaluationCurrentSources(raw),
      true,
    );
  });

  it("detects frozen report content tampering", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as {
      aggregate: { exactClassifierLabelCorrectCases: number };
    };
    raw.aggregate.exactClassifierLabelCorrectCases = 29;

    assert.equal(
      verifyConflictHandlingHeldOutEvaluationContentDigest(raw),
      false,
    );
  });
});
