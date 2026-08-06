import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ActualTurnInputDerivationEvaluationReportSchema,
  evaluateBattleActualTurnInputDerivation,
  verifyActualTurnInputDerivationEvaluationContentDigest,
  verifyActualTurnInputDerivationEvaluationCurrentSources,
} from "./evaluate-battle-actual-turn-input-derivation.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidencePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-actual-turn-input-derivability-evaluation-2026-08-06.json",
);

describe("actual-turn input derivability evaluation", () => {
  it("keeps incomplete diagnostic repetitions indeterminate", async () => {
    const report = await evaluateBattleActualTurnInputDerivation({
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(report.execution.caseCount, 20);
    assert.equal(report.execution.totalRuns, 40);
    assert.equal(report.gates.registeredCaseCount, true);
    assert.equal(report.gates.registeredRepetitionCount, false);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.transformationFeasibility, "indeterminate");
    assert.equal(report.aggregate.fixtureDispositionRate, 1);
    assert.equal(report.aggregate.completeRunCount, 16);
    assert.equal(report.aggregate.provenanceFieldNumerator, 80);
    assert.equal(report.aggregate.provenanceFieldDenominator, 80);
    assert.equal(report.aggregate.provenanceCoverage, 1);
    assert.equal(report.aggregate.inferredFieldCount, 0);
    assert.equal(report.aggregate.missingSourceRunCount, 16);
    assert.equal(report.aggregate.missingSourceRejectionRate, 1);
    assert.equal(report.aggregate.ambiguousSourceRunCount, 2);
    assert.equal(report.aggregate.ambiguousSourceRejectionRate, 1);
    assert.equal(report.aggregate.forbiddenProxyUsedAsSourceCount, 0);
    assert.equal(report.aggregate.danglingReferenceAcceptedCount, 0);
    assert.equal(report.aggregate.inputDigestChangeCount, 0);
    assert.equal(report.aggregate.deterministicCaseRate, 1);
    assert.equal(report.aggregate.runtimeServiceImportCount, 0);
    assert.equal(report.runtimeAudit.authoritativeAvailabilityCount, 0);
    assert.equal(report.decision.label, "indeterminate");
    assert.equal(report.execution.classifierInvocations, 0);
    assert.equal(
      verifyActualTurnInputDerivationEvaluationContentDigest(report),
      true,
    );
    assert.equal(
      await verifyActualTurnInputDerivationEvaluationCurrentSources(report),
      true,
    );
  });

  it("verifies the frozen registered four-hundred-run revise evidence", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as unknown;
    const report = ActualTurnInputDerivationEvaluationReportSchema.parse(raw);

    assert.equal(report.execution.totalRuns, 400);
    assert.equal(report.gates.registeredCaseCount, true);
    assert.equal(report.gates.registeredRepetitionCount, true);
    assert.equal(report.gates.transformationGatesPass, true);
    assert.equal(report.gates.ordinaryRuntimeReady, false);
    assert.equal(report.gates.supportedGatesPass, false);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.equal(report.aggregate.transformationFeasibility, "pass");
    assert.equal(report.aggregate.fixtureDispositionRate, 1);
    assert.equal(report.aggregate.completeRunCount, 160);
    assert.equal(report.aggregate.provenanceFieldNumerator, 800);
    assert.equal(report.aggregate.provenanceFieldDenominator, 800);
    assert.equal(report.aggregate.provenanceCoverage, 1);
    assert.equal(report.aggregate.inferredFieldCount, 0);
    assert.equal(report.aggregate.missingSourceRunCount, 160);
    assert.equal(report.aggregate.missingSourceRejectedRunCount, 160);
    assert.equal(report.aggregate.missingSourceRejectionRate, 1);
    assert.equal(report.aggregate.ambiguousSourceRunCount, 20);
    assert.equal(report.aggregate.ambiguousSourceRejectedRunCount, 20);
    assert.equal(report.aggregate.ambiguousSourceRejectionRate, 1);
    assert.equal(report.aggregate.forbiddenProxyUsedAsSourceCount, 0);
    assert.equal(report.aggregate.danglingReferenceAcceptedCount, 0);
    assert.equal(report.aggregate.inputDigestChangeCount, 0);
    assert.equal(report.aggregate.deterministicCaseRate, 1);
    assert.equal(report.aggregate.runtimeServiceImportCount, 0);
    assert.equal(report.aggregate.ordinaryRuntimeAuthoritativeAvailability, 0);
    assert.equal(report.decision.label, "revise");
    assert.equal(report.execution.classifierInvocations, 0);
    assert.equal(report.execution.externalLlmCalls, 0);
    assert.equal(report.execution.xaiCalls, 0);
    assert.equal(
      verifyActualTurnInputDerivationEvaluationContentDigest(raw),
      true,
    );
    assert.equal(
      await verifyActualTurnInputDerivationEvaluationCurrentSources(raw),
      true,
    );
  });
});
