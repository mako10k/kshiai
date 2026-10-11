import assert from "node:assert/strict";
import { it } from "node:test";
import { reservedTurnPublicFailure } from "./reserved-turn-failure.js";
it("retains a stable failure code without leaking private target or provider error text", () => {
  assert.equal(reservedTurnPublicFailure(new Error("RESERVED_UNKNOWN_REFERENCE:private-secret-target")), "RESERVED_UNKNOWN_REFERENCE");
  assert.equal(reservedTurnPublicFailure(new Error("provider failure with private prompt")), "RESERVED_TURN_FAILED");
  assert.equal(reservedTurnPublicFailure({ message: "private prompt" }), "RESERVED_TURN_FAILED");
  assert.equal(reservedTurnPublicFailure(new Error("RESERVED_TRACE_REVISION_CONFLICT")), "RESERVED_TRACE_REVISION_CONFLICT");
});
