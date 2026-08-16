import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SCENE_BEAT_K,
  hpSwingClosesSceneBeat,
  nextCombatTick,
  nextPublicCombatTurn,
  nextReservedAction,
  openSceneBeat,
  publicTurnBeatIndex,
  recordSceneBeatReceipt,
  sceneBeatK,
  sceneBeatsEnabled,
  shouldCloseSceneBeat,
  usesPublicTurnClock,
} from "./scene-beat.js";

describe("scene beats", () => {
  it("treats missing beat state as one-receipt legacy narration", () => {
    assert.equal(sceneBeatK({}), 1);
    assert.equal(sceneBeatsEnabled({}), false);
    assert.equal(sceneBeatsEnabled({ sceneBeat: openSceneBeat(3) }), true);
    assert.equal(DEFAULT_SCENE_BEAT_K, 3);
    assert.equal(usesPublicTurnClock({ sceneBeat: openSceneBeat(3) }), true);
    assert.equal(usesPublicTurnClock({
      sceneBeat: { ...openSceneBeat(3), clock: undefined },
    }), false);
  });

  it("holds the public turn across intra-turn beats and increments on a new turn", () => {
    const open = { turn: 1, combatTick: 1, sceneBeat: recordSceneBeatReceipt(openSceneBeat(3), "r1") };
    assert.equal(nextPublicCombatTurn(open), 1);
    assert.equal(publicTurnBeatIndex(open), 2);
    assert.equal(nextCombatTick(open), 2);
    assert.equal(nextPublicCombatTurn({
      turn: 1,
      sceneBeat: openSceneBeat(3),
    }), 2);
    assert.equal(nextPublicCombatTurn({
      turn: 4,
      sceneBeat: { ...openSceneBeat(3), clock: undefined },
    }), 5);
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
