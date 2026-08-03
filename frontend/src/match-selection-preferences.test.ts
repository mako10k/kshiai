import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesSelectionSearch,
  recordMatchSelectionUsage,
  sortByRecentUsage,
} from "./match-selection-preferences";

describe("match selection preferences", () => {
  it("orders used choices most-recently-first and keeps unused choices stable", () => {
    const choices = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const usage = recordMatchSelectionUsage(
      recordMatchSelectionUsage({}, { mine: "b" }, 100),
      { mine: "d" },
      200,
    );

    assert.deepEqual(
      sortByRecentUsage(choices, "mine", usage).map(({ id }) => id),
      ["d", "b", "a", "c"],
    );
  });

  it("keeps usage histories independent for each selector", () => {
    const choices = [{ id: "a" }, { id: "b" }];
    const usage = recordMatchSelectionUsage(
      {},
      { mine: "a", opponent: "b" },
      100,
    );

    assert.deepEqual(
      sortByRecentUsage(choices, "mine", usage).map(({ id }) => id),
      ["a", "b"],
    );
    assert.deepEqual(
      sortByRecentUsage(choices, "opponent", usage).map(({ id }) => id),
      ["b", "a"],
    );
  });

  it("matches case and width-normalized text across searchable fields", () => {
    assert.equal(matchesSelectionSearch("ＳＦ", ["sf", "魔法"]), true);
    assert.equal(matchesSelectionSearch("ねこ", ["ネコ", "ゆるかわ"]), true);
    assert.equal(matchesSelectionSearch("ゆる", ["ネコ", "ゆるかわ"]), true);
  });
});
