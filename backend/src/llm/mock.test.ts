import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockLlmProvider } from "./mock.js";

describe("mock LLM natural-language handling", () => {
  it("does not change structured combat fields from keyword matches", async () => {
    const provider = new MockLlmProvider();
    const generated = await provider.generateCharacter({ prompt: "テストキャラ" });
    const now = "2026-08-02T00:00:00.000Z";
    const current = {
      ...generated.sheet,
      id: "char-test",
      ownerUserId: "user-test",
      createdAt: now,
      updatedAt: now,
    };
    const adjusted = await provider.adjustCharacter(
      current,
      "防御を最強にして夜と雨にも強くする",
    );
    assert.equal(adjusted.sheetPatch.parameters, undefined);
    assert.equal(adjusted.sheetPatch.traits, undefined);
    assert.equal(adjusted.sheetPatch.displayName, undefined);
  });
});
