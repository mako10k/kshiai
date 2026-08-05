import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceCharacterSpeech,
  coerceSpeakerDisplayLabel,
  formatNarrativeBlock,
  formatSpeech,
  isStageReaction,
} from "./narrative.js";

describe("character speech reactions", () => {
  it("accepts free narrator display labels and rejects only invalid formatting", () => {
    assert.equal(
      coerceSpeakerDisplayLabel("  白狼の姿をした声の主  ", "明良"),
      "白狼の姿をした声の主",
    );
    assert.equal(coerceSpeakerDisplayLabel("\n\t", "明良"), "明良");
    assert.equal(coerceSpeakerDisplayLabel("声".repeat(121), "明良"), "明良");
  });

  it("never returns empty speech; falls back to watching or ellipsis", () => {
    assert.equal(coerceCharacterSpeech(null, { foeName: "楓" }), "（楓を見ている）");
    assert.equal(coerceCharacterSpeech("  ", { foeName: "楓" }), "（楓を見ている）");
    assert.equal(coerceCharacterSpeech(null), "…");
    assert.equal(coerceCharacterSpeech("ふん"), "ふん");
  });

  it("detects stage reactions", () => {
    assert.equal(isStageReaction("…"), true);
    assert.equal(isStageReaction("（ただ佇んでいる）"), true);
    assert.equal(isStageReaction("（ジーっと相手を見ている）"), true);
    assert.equal(isStageReaction("まだ動ける"), false);
  });

  it("formats dialogue with quotes and reactions without", () => {
    assert.equal(
      formatSpeech({ speaker: "まこと", text: "ふふ" }),
      "【まこと】「ふふ」",
    );
    assert.equal(
      formatSpeech({ speaker: "楓", text: "…" }),
      "【楓】…",
    );
    assert.equal(
      formatSpeech({ speaker: "楓", text: "（ただ佇んでいる）" }),
      "【楓】（ただ佇んでいる）",
    );
  });

  it("interleaves character-authored speech at narrator-selected boundaries", () => {
    assert.deepEqual(
      formatNarrativeBlock({
        turn: 1,
        narrator: ["距離が縮まる。", "刃が交わる。", "静寂が戻る。"],
        speeches: [
          {
            sourceSide: "a",
            speaker: "まこと",
            text: "ここだ。",
            afterNarratorLine: 0,
          },
          {
            sourceSide: "b",
            speaker: "楓",
            text: "見えている。",
            afterNarratorLine: 1,
          },
        ],
      }),
      [
        "距離が縮まる。",
        "【まこと】「ここだ。」",
        "刃が交わる。",
        "【楓】「見えている。」",
        "静寂が戻る。",
      ],
    );
  });
});
