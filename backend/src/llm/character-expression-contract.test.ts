import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeCharacterExpressionCompactResultV2 } from "./openai-compatible.js";

describe("Compact expression V2 result contract", () => {
  it("decodes nextUtterance through a closed result schema", () => {
    assert.deepEqual(
      decodeCharacterExpressionCompactResultV2({
        nextUtterance: "ここは譲らない。",
        nextAction: { kind: "wait" },
        realizedManifestation: null,
      }),
      {
        nextUtterance: "ここは譲らない。",
        nextAction: { kind: "wait" },
        nextActionStatus: "valid",
        realizedManifestation: null,
      },
    );
    assert.throws(
      () => decodeCharacterExpressionCompactResultV2({
        speech: "旧フィールド",
        realizedManifestation: null,
      }),
      /unrecognized_keys:speech/,
    );
    assert.throws(
      () => decodeCharacterExpressionCompactResultV2({
        nextUtterance: "ここは譲らない。",
        realizedManifestation: null,
        unexpected: true,
      }),
      /unrecognized_keys/,
    );
  });

  it("contains an invalid action without rejecting the valid utterance", () => {
    assert.deepEqual(
      decodeCharacterExpressionCompactResultV2({
        nextUtterance: "ここは譲らない。",
        nextAction: { kind: "skill", skillId: "slash", unexpected: true },
        realizedManifestation: null,
      }),
      {
        nextUtterance: "ここは譲らない。",
        nextAction: null,
        nextActionStatus: "invalid",
        realizedManifestation: null,
      },
    );
  });
});
