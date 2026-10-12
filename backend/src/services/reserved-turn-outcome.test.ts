import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reservedTurnOutcome } from "./reserved-turn-outcome.js";
const healthy = { canFight: true, parameters: { hp: 10, mp: 4, stamina: 6, atk: 8, def: 12 } };
describe("reserved turn lifecycle v2", () => {
  it("keeps turn11 active and finishes at12 using established residual capacity", () => {
    assert.equal(reservedTurnOutcome(healthy, healthy, 11, 12, true).status, "active");
    assert.deepEqual(reservedTurnOutcome(healthy, { ...healthy, parameters: { ...healthy.parameters, mp: 3 } }, 12, 12, true), { status: "finished", winnerSide: "a", finishReason: "turn_limit" });
  });
  it("draws only on an actual equal score and can select either side", () => {
    assert.equal(reservedTurnOutcome(healthy, healthy, 12, 12, true).winnerSide, "draw");
    assert.equal(reservedTurnOutcome({ ...healthy, parameters: { ...healthy.parameters, stamina: 0 } }, healthy, 12, 12, true).winnerSide, "b");
  });
  it("gives incapacitation precedence over the last-turn score, including mutual defeat", () => {
    assert.deepEqual(reservedTurnOutcome({ ...healthy, canFight: false }, healthy, 12, 12, true), { status: "finished", winnerSide: "b", finishReason: "incapacitated" });
    assert.equal(reservedTurnOutcome({ ...healthy, canFight: false }, { ...healthy, canFight: false }, 12, 12, true).winnerSide, "draw");
  });
  it("preserves the historical engine boundary rather than silently applying the new limit", () => {
    assert.equal(reservedTurnOutcome(healthy, healthy, 36, 36, false).status, "active");
    assert.equal(reservedTurnOutcome(healthy, { ...healthy, canFight: false }, 2, 36, false).winnerSide, "a");
  });
});
