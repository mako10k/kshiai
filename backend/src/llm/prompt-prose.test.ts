// R: Verify prose formatting preserves values and rejects incomplete or unsafe serialization.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderPromptSections } from "./prompt-prose.js";

describe("prompt prose", () => {
  it("keeps order, null, false, zero, exact references and multiline text distinct", () => {
    const output = renderPromptSections([{ title: "知覚", value: {
      ref: "profile:a:weapon", text: "いやだ\n目を閉じたい。", values: [0, false, null, ""],
      omitted: undefined, empty: [], counterpart: null,
    } }]);
    assert.match(output, /参照ID（ref）：profile:a:weapon/);
    assert.match(output, /言葉（text）：いやだ\n\s+目を閉じたい。/);
    assert.match(output, /位置 0：0\n\s+- 位置 1：いいえ（false）\n\s+- 位置 2：値なし（null）\n\s+- 位置 3：空の文字列（0文字）/);
    assert.match(output, /"empty"：空の一覧（0件）/);
    assert.match(output, /知覚した相手（counterpart）：値なし（null）/);
    assert.doesNotMatch(output, /omitted/);
  });
  it("rejects cyclic, non-finite and non-data input instead of silently dropping facts", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    for (const value of [cyclic, Infinity, NaN, () => "hidden", new Date()]) {
      assert.throws(() => renderPromptSections([{ title: "入力", value }]), /PROMPT_DATA_/);
    }
  });
  it("permits shared noncyclic objects and omits an absent repair section", () => {
    const shared = { text: "同じ言葉" };
    const output = renderPromptSections([{ title: "現在", value: [shared, shared] }, { title: "修正", value: undefined }]);
    assert.equal(output.split("同じ言葉").length - 1, 2);
    assert.doesNotMatch(output, /## 修正/);
  });
});
