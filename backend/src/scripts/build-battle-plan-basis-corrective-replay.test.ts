import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PlanBasisReplayConstructionReportSchema,
  PlanBasisReplayDeltaSchema,
  buildPlanBasisCorrectiveReplay,
  verifyPlanBasisReplayConstructionReportContentDigest,
  verifyPlanBasisReplayDeltaContentDigest,
} from "./build-battle-plan-basis-corrective-replay.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const deltaPath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-integrated-shadow-plan-basis-delta-v2.json",
);
const constructionEvidencePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-plan-basis-corrective-replay-construction-v2-2026-08-06.json",
);

describe("versioned plan-basis corrective replay", () => {
  it("derives only the fixed v2 delta and preserves all six controls", async () => {
    const now = () => new Date("2026-08-06T00:00:00.000Z");
    const first = await buildPlanBasisCorrectiveReplay({ now });
    const second = await buildPlanBasisCorrectiveReplay({ now });

    PlanBasisReplayConstructionReportSchema.parse(first.report);
    assert.equal(
      verifyPlanBasisReplayConstructionReportContentDigest(first.report),
      true,
    );
    assert.deepEqual(first.report, second.report);
    const frozenEvidence = JSON.parse(
      await readFile(constructionEvidencePath, "utf8"),
    ) as unknown;
    PlanBasisReplayConstructionReportSchema.parse(frozenEvidence);
    assert.equal(
      verifyPlanBasisReplayConstructionReportContentDigest(frozenEvidence),
      true,
    );
    assert.deepEqual(frozenEvidence, first.report);
    assert.equal(
      first.parentTranscript.fixtureVersion,
      "battle-pipeline-integrated-shadow-transcripts-v1",
    );
    assert.equal(
      first.targetTranscript.fixtureVersion,
      "battle-pipeline-integrated-shadow-transcripts-v2",
    );
    assert.deepEqual(
      first.report.fieldDifferences.map((difference) => difference.path),
      [
        "/fixtureVersion",
        "/integrity/contentDigest",
        "/scenarios/3/characterInputs/cases/0/characterPlan/steps/0/basisRefs/1",
        "/scenarios/3/characterInputs/cases/0/characterPlan/steps/1/basisRefs/1",
      ],
    );
    assert.equal(first.report.unexpectedFieldDifferenceCount, 0);
    assert.equal(first.report.controlComparisons.length, 6);
    assert.ok(first.report.controlComparisons.every((comparison) =>
      comparison.inputIdentical && comparison.normalizedReceiptIdentical
    ));
    assert.deepEqual(first.report.interruptedReplay, {
      parentReceiptDigest:
        "1470cfefa1953866d4159dcd78cd0d18308fcd095415591bbde3c0ff0103dbb7",
      targetReceiptDigest:
        "86dbb59851854cf9e86bced45a32be34bb5f6c189a65b0a1c113a475270f2f58",
      adaptiveStatus: "executed",
      resolution: "expanded",
      outcome: "partial",
      completedSteps: ["step.interrupted.approach"],
      failedStep: "step.interrupted.strike",
      failureReason: "precondition_failed",
      effectIds: ["effect.interrupted.approached"],
      costIds: ["cost.interrupted.exposure"],
      fallbackFactPresent: false,
      patchCount: 1,
      assertedFactIds: ["input-fact.interrupted.approached"],
      retractionCount: 0,
      allPatchAuditsNoIssueFound: true,
      strikeEffectPresent: false,
      causalCreatedLinkPresent: true,
      passed: true,
    });
    assert.equal(first.report.execution.constructionReplayRuns, 14);
    assert.equal(first.report.execution.externalLlmCallsMade, 0);
    assert.equal(first.report.execution.canonicalCommitCount, 0);
    assert.equal(first.report.target.persisted, false);
  });

  it("rejects unknown delta fields and detects content tampering", async () => {
    const raw = JSON.parse(await readFile(deltaPath, "utf8")) as Record<
      string,
      unknown
    >;
    assert.equal(PlanBasisReplayDeltaSchema.safeParse(raw).success, true);
    assert.equal(verifyPlanBasisReplayDeltaContentDigest(raw), true);

    const withUnknownField = structuredClone(raw);
    withUnknownField.unregisteredChange = true;
    assert.equal(
      PlanBasisReplayDeltaSchema.safeParse(withUnknownField).success,
      false,
    );

    const tampered = structuredClone(raw) as {
      provenance: { fixedAt: string };
    } & Record<string, unknown>;
    tampered.provenance.fixedAt = "2026-08-06T00:00:01.000Z";
    assert.equal(verifyPlanBasisReplayDeltaContentDigest(tampered), false);
  });
});
