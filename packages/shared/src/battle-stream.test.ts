import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractStreamingNarrator } from "./battle-stream.js";

describe("extractStreamingNarrator", () => {
  it("returns nothing before the narrator array starts", () => {
    assert.deepEqual(extractStreamingNarrator('{"turn":1,'), {
      lines: [],
      draft: null,
    });
  });

  it("extracts completed lines and an open draft", () => {
    const partial =
      '{"turn":3,"narrator":["第3ターン — 広場。","風が動いた","未完';
    const got = extractStreamingNarrator(partial);
    assert.deepEqual(got.lines, ["第3ターン — 広場。", "風が動いた"]);
    assert.equal(got.draft, "未完");
  });

  it("handles escaped quotes inside lines", () => {
    const partial =
      '{"narrator":["彼は \\"今だ\\" と呟いた","次"]}';
    const got = extractStreamingNarrator(partial);
    assert.equal(got.lines[0], '彼は "今だ" と呟いた');
    assert.equal(got.lines[1], "次");
    assert.equal(got.draft, null);
  });
});
