import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMockProviderAllowed } from "../config.js";

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
