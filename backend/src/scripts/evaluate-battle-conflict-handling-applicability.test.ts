import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ConflictHandlingApplicabilityEvaluationReportSchema,
  evaluateBattleConflictHandlingApplicability,
  verifyConflictHandlingApplicabilityEvaluationContentDigest,
  verifyConflictHandlingApplicabilityEvaluationCurrentSources,
} from "./evaluate-battle-conflict-handling-applicability.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidencePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-conflict-handling-applicability-evaluation-2026-08-06.json",
);

describe("conflict-handling applicability evaluation", () => {
  it("keeps diagnostic runs indeterminate while evaluating the fixed rubric", async () => {
    let clockValue = 0;
    const report = await evaluateBattleConflictHandlingApplicability({
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
      clock: () => clockValue++,
    });

    assert.equal(report.execution.totalRuns, 14);
    assert.equal(report.gates.registeredRepetitionCount, false);
    assert.equal(report.gates.hardInvariantsPass, true);
    assert.equal(report.aggregate.primaryProxiesPass, true);
    assert.equal(report.aggregate.classificationAccuracy, 1);
    assert.equal(report.aggregate.applicableStratumCount, 3);
    assert.equal(report.aggregate.applicableHandlingRate, 1);
    assert.equal(report.aggregate.legacyReceiptParity, 1);
    assert.equal(report.aggregate.registeredBattleBehavior, 1);
    assert.equal(report.aggregate.deterministicDigestStabilityRate, 1);
    assert.equal(report.aggregate.applicabilityDanglingReferenceCount, 0);
    assert.equal(
      report.aggregate.legacyExplicitConflictOrUnknownHandlingRate,
      6 / 7,
    );
    assert.equal(report.decision.label, "indeterminate");
    assert.equal(
      verifyConflictHandlingApplicabilityEvaluationContentDigest(report),
      true,
    );
    assert.equal(
      await verifyConflictHandlingApplicabilityEvaluationCurrentSources(report),
      true,
    );
  });

  it("verifies the frozen registered 140-run evidence", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as unknown;
    const report = ConflictHandlingApplicabilityEvaluationReportSchema.parse(
      raw,
    );

    assert.equal(report.execution.totalRuns, 140);
    assert.equal(report.gates.allRequiredGatesPass, true);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.primaryProxiesPass, true);
    assert.equal(report.decision.label, "supported");
    assert.equal(
      verifyConflictHandlingApplicabilityEvaluationContentDigest(raw),
      true,
    );
    assert.equal(
      await verifyConflictHandlingApplicabilityEvaluationCurrentSources(raw),
      true,
    );
  });
});
