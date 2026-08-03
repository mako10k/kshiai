import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPROVEMENT_ANALYSIS_FIRST_AT,
  IMPROVEMENT_ANALYSIS_INTERVAL,
  defaultImprovementMemo,
  getImprovementAnalysisEligibility,
} from "./character-improvement.js";

describe("improvement analysis eligibility", () => {
  it("blocks until the first threshold", () => {
    const e = getImprovementAnalysisEligibility(4, null);
    assert.equal(e.canAnalyze, false);
    assert.equal(e.battlesUntilNext, 1);
    assert.equal(e.nextAnalyzeAtBattleCount, IMPROVEMENT_ANALYSIS_FIRST_AT);
    assert.match(e.reason ?? "", /初回/);
  });

  it("allows the first analysis at 5 finished battles", () => {
    const e = getImprovementAnalysisEligibility(5, defaultImprovementMemo());
    assert.equal(e.canAnalyze, true);
    assert.equal(e.battlesUntilNext, 0);
    assert.equal(e.reason, null);
  });

  it("requires 10 more battles after an analysis", () => {
    const memo = {
      ...defaultImprovementMemo(),
      analysisCount: 1,
      lastAnalyzedBattleCount: 5,
      lastAnalyzedAt: "2026-01-01T00:00:00.000Z",
      strengths: ["押しが強い"],
      improvements: ["終盤の粘り"],
    };
    const blocked = getImprovementAnalysisEligibility(14, memo);
    assert.equal(blocked.canAnalyze, false);
    assert.equal(blocked.battlesUntilNext, 1);
    assert.equal(
      blocked.nextAnalyzeAtBattleCount,
      5 + IMPROVEMENT_ANALYSIS_INTERVAL,
    );

    const allowed = getImprovementAnalysisEligibility(15, memo);
    assert.equal(allowed.canAnalyze, true);
    assert.equal(allowed.battlesUntilNext, 0);
  });

  it("uses the snapshot battle count, not absolute multiples of 10", () => {
    const memo = {
      ...defaultImprovementMemo(),
      analysisCount: 2,
      lastAnalyzedBattleCount: 17,
    };
    assert.equal(getImprovementAnalysisEligibility(26, memo).canAnalyze, false);
    assert.equal(getImprovementAnalysisEligibility(27, memo).canAnalyze, true);
  });
});
