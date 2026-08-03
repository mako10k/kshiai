import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceCharacterSpeech,
  formatSpeech,
  isStageReaction,
} from "./narrative.js";

describe("character speech reactions", () => {
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
});
