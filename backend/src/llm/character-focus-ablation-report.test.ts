import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCharacterFocusAblationRequests } from "./character-focus-ablation.js";
import {
  CHARACTER_FOCUS_SCORE_KEYS,
  buildCharacterFocusAblationReport,
  type CharacterFocusHumanScore,
} from "./character-focus-ablation-report.js";

function passingScores(): CharacterFocusHumanScore[] {
  return buildCharacterFocusAblationRequests().map((request) => {
    const treatment = request.arm === "C" || request.arm === "D";
    const weakStrainedD = request.arm === "D" && request.cueClass === "weak" &&
      request.replayEffectiveness === "strained";
    const scores = Object.fromEntries(CHARACTER_FOCUS_SCORE_KEYS.map((key) => {
      const eligible = key === "freshEvidenceGrounding"
        ? request.freshEvidenceEligible
        : key === "semanticResponse"
          ? request.semanticResponseEligible
          : key === "noChangeRestraint"
            ? request.noChangeRestraintEligible
            : true;
      if (!eligible) return [key, null];
      if (key === "observerSafetyViolation" || key === "unsupportedNovelty") {
        return [key, 0];
      }
      if (key === "freshEvidenceGrounding" || key === "semanticResponse") {
        return [key, treatment && !weakStrainedD ? 1 : 0];
      }
      return [key, 1];
    })) as CharacterFocusHumanScore["scores"];
    return { outputId: request.outputId, scores };
  });
}

describe("character-focus ablation report", () => {
  it("requires two complete eligibility-correct reviews and a reconciled set", () => {
    const scores = passingScores();
    const invalid = scores.slice(1);
    assert.throws(() => buildCharacterFocusAblationReport({
      reviewerA: invalid,
      reviewerB: scores,
      reconciled: scores,
      speeches: new Map(),
    }), /expected 144 rows/);
  });

  it("macro-aggregates the frozen thresholds only after reconciliation", () => {
    const scores = passingScores();
    const speeches = new Map(
      buildCharacterFocusAblationRequests().map((request) => [
        request.outputId,
        `${request.outputId}の発言`,
      ]),
    );
    const report = buildCharacterFocusAblationReport({
      reviewerA: scores,
      reviewerB: scores,
      reconciled: scores,
      speeches,
    });
    assert.equal(report.logicalOutputs, 144);
    assert.equal(report.reviewerAgreement.rate, 1);
    assert.equal(report.arms.C.freshEvidenceGrounding.scenarioMacroRate, 1);
    assert.equal(report.directionalComparisons.cMinusB.freshEvidenceGrounding, 1);
    assert.equal(report.focusCalibration.sharpMinusStrained, 1);
    assert.equal(report.acceptance.observerSafetyZeroEveryArm, true);
    assert.equal(report.acceptance.cFreshEvidenceGrounding, true);
    assert.equal(report.acceptance.weakCueFocusCalibration, true);
    assert.equal(report.acceptance.strongCueNonInferiority, true);
    assert.equal(report.acceptance.lowFocusProseNonInferiority, true);
    assert.equal(report.acceptance.worstSpeakerExactUnique, true);
    assert.equal(report.acceptance.longestExactRepeatRun, true);
  });
});
