import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessDialogueQuality,
  assessNarrationDialogueQuality,
} from "./dialogue-quality.js";

describe("dialogue quality observation", () => {
  it("measures exact repetition, reactions, lexical variety, and response contexts", () => {
    const metrics = assessDialogueQuality([{
      turn: 1,
      narrator: [],
      speeches: [
        { speaker: "ナギ", text: "足音が変わったね。" },
        { speaker: "ガク", text: "…" },
      ],
    }, {
      turn: 2,
      narrator: [],
      speeches: [
        { speaker: "ナギ", text: "足音が変わったね。" },
        { speaker: "ガク", text: "まだ立つ。" },
      ],
    }]);

    assert.equal(metrics.totalLines, 4);
    assert.equal(metrics.uniqueLines, 3);
    assert.equal(metrics.exactDuplicateLines, 1);
    assert.equal(metrics.reactionLines, 1);
    assert.equal(metrics.schemaVersion, 2);
    assert.equal(metrics.worstSpeakerExactUniqueRate, 0.5);
    assert.equal(metrics.longestExactRepeatRun, 2);
    const nagi = metrics.speakerMetrics.find((metric) => metric.speaker === "ナギ");
    const gaku = metrics.speakerMetrics.find((metric) => metric.speaker === "ガク");
    assert.deepEqual(nagi && {
      totalLines: nagi.totalLines,
      uniqueLines: nagi.uniqueLines,
      exactDuplicateLines: nagi.exactDuplicateLines,
      exactUniqueRate: nagi.exactUniqueRate,
      longestExactRepeatRun: nagi.longestExactRepeatRun,
      counterpartUtteranceContexts: nagi.counterpartUtteranceContexts,
      nonReactionLinesAfterCounterpartUtterance:
        nagi.nonReactionLinesAfterCounterpartUtterance,
    }, {
      totalLines: 2,
      uniqueLines: 1,
      exactDuplicateLines: 1,
      exactUniqueRate: 0.5,
      longestExactRepeatRun: 2,
      counterpartUtteranceContexts: 1,
      nonReactionLinesAfterCounterpartUtterance: 1,
    });
    assert.equal(gaku?.reactionLines, 1);
    assert.equal(gaku?.nonReactionLinesAfterCounterpartUtterance, 1);
    assert.ok((nagi?.lexicalDiversity ?? 0) > 0);
  });

  it("scores terminal narration narratives instead of an empty battle log", () => {
    const emptyLog = assessDialogueQuality([]);
    const fromNarration = assessNarrationDialogueQuality([{
      narrative: {
        turn: 1,
        narrator: ["間合いが動く。"],
        speeches: [{ speaker: "ナギ", text: "足音が変わったね。" }],
      },
    }, {
      narrative: null,
    }, {
      narrative: {
        turn: 3,
        narrator: ["余韻が残る。"],
        speeches: [{ speaker: "ガク", text: "まだ立つ。" }],
      },
    }]);
    assert.equal(emptyLog.totalLines, 0);
    assert.equal(fromNarration.totalLines, 2);
    assert.equal(fromNarration.uniqueLines, 2);
  });

  it("returns explicit empty-cohort values", () => {
    const metrics = assessDialogueQuality([]);

    assert.equal(metrics.exactUniqueRate, null);
    assert.equal(metrics.worstSpeakerExactUniqueRate, null);
    assert.equal(metrics.longestExactRepeatRun, 0);
    assert.deepEqual(metrics.speakerMetrics, []);
  });
});
