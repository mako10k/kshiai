import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeLegacyBattleState,
  rewriteLegacyValue,
} from "./migrate-legacy-account.js";

describe("legacy account value rewriting", () => {
  it("rewrites owner IDs and local media URLs recursively", () => {
    const rewritten = rewriteLegacyValue(
      {
        ownerUserId: "old-user",
        appearance: { imageUrl: "/api/media/characters/char-1.jpg?v=1" },
        history: ["unchanged", "old-user"],
      },
      "old-user",
      "new-user",
      new Map([
        ["/api/media/characters/char-1.jpg", "https://media.example/legacy/characters/char-1.jpg"],
      ]),
    );
    assert.deepEqual(rewritten, {
      ownerUserId: "new-user",
      appearance: { imageUrl: "https://media.example/legacy/characters/char-1.jpg" },
      history: ["unchanged", "new-user"],
    });
  });

  it("normalizes the legacy Japanese custom battlefield category", () => {
    assert.deepEqual(
      normalizeLegacyBattleState({
        battlefield: { id: "field-1", category: "カスタム" },
        scene: "カスタム",
      }),
      {
        battlefield: { id: "field-1", category: "custom" },
        scene: "カスタム",
      },
    );
  });
});
