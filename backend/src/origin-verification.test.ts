import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyOriginSecret } from "./origin-verification.js";

describe("cloud origin verification", () => {
  it("allows local operation when no origin secret is configured", () => {
    assert.equal(verifyOriginSecret("", undefined), true);
  });

  it("accepts only the exact configured secret", () => {
    assert.equal(verifyOriginSecret("expected-secret", "expected-secret"), true);
    assert.equal(verifyOriginSecret("expected-secret", "wrong-secret"), false);
    assert.equal(verifyOriginSecret("expected-secret", undefined), false);
  });
});
