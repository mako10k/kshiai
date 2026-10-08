// R: Verify evaluated guidance receipt validity without widening persistent battle contracts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessConsciousGuidanceSchema, evaluatedAwarenessConsciousGuidance, appendAwarenessConsciousGuidance } from "./awareness-guidance.js";

describe("evaluated awareness guidance", () => {
  it("distinguishes none from missing or empty applicable guidance", () => {
    assert.deepEqual(evaluatedAwarenessConsciousGuidance([]), { kind: "none" });
    for (const value of [undefined, null, {}, { kind: "applicable", actionPrinciples: [] }]) {
      assert.equal(AwarenessConsciousGuidanceSchema.safeParse(value).success, false);
    }
    assert.deepEqual(appendAwarenessConsciousGuidance(["既存の傾向"], evaluatedAwarenessConsciousGuidance(["適用指針"])), ["既存の傾向", "適用指針"]);
  });
});
