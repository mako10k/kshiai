// R: Verify provider-specific request options and generation-limit validation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelRequestOptions } from "./model-request-options.js";

describe("model request compatibility", () => {
  it("uses native none for Luna and omits unverified temperature", () => {
    assert.deepEqual(modelRequestOptions({
      provider: "openai", model: "gpt-6-luna", supportsTemperature: true,
      temperature: 0.85, maxCompletionTokens: 600,
    }), { reasoning_effort: "none", max_completion_tokens: 600 });
  });
  it("preserves Grok none and unrelated models without matching their name alone", () => {
    assert.deepEqual(modelRequestOptions({
      provider: "xai", model: "grok-4.3", supportsTemperature: true, temperature: 0.4,
    }), { reasoning_effort: "none", temperature: 0.4 });
    for (const pair of [
      { provider: "openai", model: "gpt-4.1-mini" },
      { provider: "xai", model: "grok-4.5" },
      { provider: "venice", model: "gpt-6-luna" },
    ]) {
      assert.deepEqual(modelRequestOptions({
        ...pair, supportsTemperature: true, temperature: 0.4,
      }), { temperature: 0.4 });
    }
  });
  it("rejects invalid generation ceilings rather than silently clipping them", () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => modelRequestOptions({
        provider: "openai", model: "gpt-6-luna", supportsTemperature: false,
        temperature: 0.4, maxCompletionTokens: limit,
      }), /positive safe integer/);
    }
  });
});
