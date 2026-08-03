import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findCharacterNameConflict,
  makeUniqueCharacterName,
  normalizeCharacterName,
} from "./character-name-uniqueness.js";

describe("character name uniqueness", () => {
  it("normalizes width, case, spacing, and decorative punctuation", () => {
    assert.equal(normalizeCharacterName(" Ａｌｉｃｅ・零 "), "alice零");
    assert.equal(normalizeCharacterName("【アリス】"), "アリス");
  });

  it("detects display-name and real-name collisions", () => {
    assert.deepEqual(findCharacterNameConflict(["アリス ・ 零"], ["アリス・零"]), {
      candidate: "アリス ・ 零",
      reservedName: "アリス・零",
    });
    assert.equal(findCharacterNameConflict(["アリス・蒼"], ["アリス・零"]), null);
  });

  it("allocates a deterministic unique name for the mock provider", () => {
    assert.equal(makeUniqueCharacterName("アリス", ["アリス", "アリス 2"]), "アリス 3");
  });
});
