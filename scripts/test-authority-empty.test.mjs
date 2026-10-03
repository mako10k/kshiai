// R: Verify that the governed test command cannot pass without executing tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requireActiveTests } from "./test-authority.mjs";

describe("test authority execution gate", () => {
  it("rejects a zero-test success", () => {
    assert.throws(() => requireActiveTests("unit", []), /No active unit tests/);
  });

  it("allows an eligible test set to execute", () => {
    assert.doesNotThrow(() => requireActiveTests("unit", [{ path: "example.test.ts" }]));
  });
});
