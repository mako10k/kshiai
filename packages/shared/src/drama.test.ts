import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceDramaState,
  dramaPhaseForTurn,
  normalizeDramaState,
} from "./drama.js";

describe("bounded drama continuity", () => {
  it("tracks repeated structured actions without retaining prose history", () => {
    const first = advanceDramaState({
      previous: normalizeDramaState(null),
      turn: 4,
      turnLimit: 20,
      actions: [
        { id: "a1", actorSide: "a", kind: "skill", skillId: "fire", executed: true, skippedReason: null },
        { id: "b1", actorSide: "b", kind: "defend", executed: true, skippedReason: null },
      ],
      narrative: {
        turn: 4,
        narrator: ["動いた。"],
        speeches: [{ speaker: "A", text: "行く。" }],
      },
      sideAName: "A",
      sideBName: "B",
      locationChanged: false,
      environmentBeatOccurred: false,
    });
    const second = advanceDramaState({
      previous: first,
      turn: 5,
      turnLimit: 20,
      actions: [
        { id: "a2", actorSide: "a", kind: "skill", skillId: "fire", executed: true, skippedReason: null },
        { id: "b2", actorSide: "b", kind: "defend", executed: true, skippedReason: null },
      ],
      narrative: { turn: 5, narrator: ["再び動いた。"], speeches: [] },
      sideAName: "A",
      sideBName: "B",
      locationChanged: true,
      environmentBeatOccurred: true,
    });
    assert.equal(second.repeatedActionA, 2);
    assert.equal(second.turnsSinceLocationChange, 0);
    assert.equal(second.turnsSinceEnvironmentBeat, 0);
    assert.equal(second.lastPublicSpeechA, "行く。");
    assert.ok(second.recentBeatFingerprints.length <= 3);
  });

  it("moves from opening through rising to climax", () => {
    assert.equal(dramaPhaseForTurn(1, 20), "opening");
    assert.equal(dramaPhaseForTurn(3, 20), "rising");
    assert.equal(dramaPhaseForTurn(10, 20), "climax");
  });
});
