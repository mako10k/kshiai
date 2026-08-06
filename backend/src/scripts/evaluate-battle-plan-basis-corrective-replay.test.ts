import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CorrectiveReplayEvaluationReportSchema,
  evaluateBattlePlanBasisCorrectiveReplay,
  verifyCorrectiveReplayEvaluationContentDigest,
  verifyCorrectiveReplayEvaluationCurrentSources,
} from "./evaluate-battle-plan-basis-corrective-replay.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidencePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json",
);

describe("plan-basis corrective replay evaluation", () => {
  it("keeps an incomplete diagnostic run indeterminate", async () => {
    let tick = 0;
    const report = await evaluateBattlePlanBasisCorrectiveReplay({
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
      clock: () => tick++,
    });

    CorrectiveReplayEvaluationReportSchema.parse(report);
    assert.equal(verifyCorrectiveReplayEvaluationContentDigest(report), true);
    assert.equal(report.execution.totalRuns, 14);
    assert.equal(report.gates.registeredRepetitionCount, false);
    assert.equal(report.gates.hardInvariantsPass, true);
    assert.equal(report.gates.registeredBehaviorSevenOfSeven, true);
    assert.equal(report.gates.normalizedControlReceiptParity, true);
    assert.equal(report.gates.allRequiredGatesPass, false);
    assert.equal(report.decision.label, "indeterminate");
    assert.equal(report.decision.externalReview.providerCalls, 0);
  });

  it("freezes the 140-run revise result without relaxing the rubric", async () => {
    const raw = JSON.parse(await readFile(evidencePath, "utf8")) as unknown;
    const report = CorrectiveReplayEvaluationReportSchema.parse(raw);

    assert.equal(verifyCorrectiveReplayEvaluationContentDigest(report), true);
    assert.equal(await verifyCorrectiveReplayEvaluationCurrentSources(report), true);
    assert.equal(report.execution.repetitionsPerScenario, 20);
    assert.equal(report.execution.totalRuns, 140);
    assert.equal(report.execution.derivedTranscriptPersisted, false);
    assert.equal(report.execution.evaluatorExternalLlmCalls, 0);
    assert.equal(report.execution.canonicalCommitCount, 0);
    assert.equal(report.lineage.unexpectedFieldDifferenceCount, 0);
    assert.equal(report.lineage.fieldDifferences.length, 4);
    assert.equal(report.controlEvaluation.length, 6);
    assert.ok(report.controlEvaluation.every((control) =>
      control.normalizedReceiptIdentical &&
      control.distinctEvaluationReceiptDigests === 1
    ));
    assert.equal(report.gates.registeredRepetitionCount, true);
    assert.equal(report.gates.exactTwoOperationContract, true);
    assert.equal(report.gates.derivedIntegrityValid, true);
    assert.equal(report.gates.hardInvariantsPass, true);
    assert.equal(report.gates.primaryProxiesPass, false);
    assert.equal(report.gates.registeredBehaviorSevenOfSeven, true);
    assert.equal(report.gates.registeredInterruptedBehaviorStable, true);
    assert.equal(report.gates.externalLlmCallsZero, true);
    assert.equal(report.gates.canonicalCommitCountZero, true);
    assert.equal(report.gates.allRequiredGatesPass, false);
    assert.equal(
      report.integratedEvaluation.aggregate
        .explicitConflictOrUnknownHandlingRate,
      0.857143,
    );
    assert.equal(
      report.integratedEvaluation.aggregate.integratedLocalP95Ms <= 50,
      true,
    );
    assert.equal(
      report.integratedEvaluation.aggregate
        .deterministicDigestStabilityRate,
      1,
    );
    assert.equal(
      report.integratedEvaluation.aggregate
        .registeredScenarioBehaviorCoverage,
      1,
    );
    assert.deepEqual(report.integratedEvaluation.aggregate.failedStrata, []);
    assert.equal(report.decision.label, "revise");
    assert.deepEqual(report.decision.blockingFindings, [
      "One or more primary proxies failed.",
    ]);
    assert.equal(report.decision.externalReview.required, false);
    assert.equal(report.decision.externalReview.providerCalls, 0);
  });
});
