import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMockProviderAllowed,
  parseBattleCausalNarrationMode,
} from "../config.js";

describe("mock provider boundary", () => {
  it("allows explicitly selected mock outside production", () => {
    assert.equal(isMockProviderAllowed({
      nodeEnv: "development",
      primaryProvider: "mock",
      allowMockFallback: false,
    }), true);
  });

  it("does not allow mock in production", () => {
    assert.equal(isMockProviderAllowed({
      nodeEnv: "production",
      primaryProvider: "mock",
      allowMockFallback: true,
    }), false);
  });

  it("requires explicit opt-in behind real providers", () => {
    assert.equal(isMockProviderAllowed({
      nodeEnv: "development",
      primaryProvider: "xai",
      allowMockFallback: false,
    }), false);
    assert.equal(isMockProviderAllowed({
      nodeEnv: "development",
      primaryProvider: "xai",
      allowMockFallback: true,
    }), true);
  });
});

describe("battle causal narration mode", () => {
  it("defaults to off and accepts only the reversible guarded mode", () => {
    assert.equal(parseBattleCausalNarrationMode(undefined), "off");
    assert.equal(parseBattleCausalNarrationMode(" off "), "off");
    assert.equal(
      parseBattleCausalNarrationMode("NARRATION_GUARDED"),
      "narration_guarded",
    );
    assert.throws(
      () => parseBattleCausalNarrationMode("enabled"),
      /must be off or narration_guarded/,
    );
  });
});
