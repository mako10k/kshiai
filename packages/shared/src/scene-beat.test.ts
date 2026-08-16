import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SCENE_BEAT_K,
  hpSwingClosesSceneBeat,
  nextReservedAction,
  openSceneBeat,
  recordSceneBeatReceipt,
  sceneBeatK,
  sceneBeatsEnabled,
  shouldCloseSceneBeat,
} from "./scene-beat.js";

describe("scene beats", () => {
  it("treats missing beat state as one-receipt legacy narration", () => {
    assert.equal(sceneBeatK({}), 1);
    assert.equal(sceneBeatsEnabled({}), false);
    assert.equal(sceneBeatsEnabled({ sceneBeat: openSceneBeat(3) }), true);
    assert.equal(DEFAULT_SCENE_BEAT_K, 3);
  });

  it("closes on K receipts, terminal, scene delta, or infeasible reservation", () => {
    const beat = openSceneBeat(3);
    assert.equal(shouldCloseSceneBeat({ beat, nextReceiptCount: 2, terminal: false }), false);
    assert.equal(shouldCloseSceneBeat({ beat, nextReceiptCount: 3, terminal: false }), true);
    assert.equal(shouldCloseSceneBeat({ beat, nextReceiptCount: 1, terminal: true }), true);
    assert.equal(
      shouldCloseSceneBeat({ beat, nextReceiptCount: 1, terminal: false, sceneDelta: true }),
      true,
    );
    assert.equal(
      shouldCloseSceneBeat({
        beat,
        nextReceiptCount: 1,
        terminal: false,
        reservationInfeasible: true,
      }),
      true,
    );
  });

  it("closes when a side loses at least 15 percent HP", () => {
    assert.equal(
      hpSwingClosesSceneBeat({
        hpBeforeA: 100,
        hpAfterA: 86,
        hpBeforeB: 100,
        hpAfterB: 100,
        maxHpA: 100,
        maxHpB: 100,
      }),
      false,
    );
    assert.equal(
      hpSwingClosesSceneBeat({
        hpBeforeA: 100,
        hpAfterA: 80,
        hpBeforeB: 100,
        hpAfterB: 100,
        maxHpA: 100,
        maxHpB: 100,
      }),
      true,
    );
  });

  it("consumes reserved actions in order", () => {
    const first = nextReservedAction([
      { kind: "basic_attack" },
      { kind: "defend" },
    ]);
    assert.equal(first.next?.kind, "basic_attack");
    assert.deepEqual(first.remaining, [{ kind: "defend" }]);
    assert.equal(nextReservedAction([]).next, undefined);
    const recorded = recordSceneBeatReceipt(openSceneBeat(3), "r1");
    assert.deepEqual(recorded.receiptIds, ["r1"]);
  });
});
