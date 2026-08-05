import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dramaProgressionHint,
  parseActionSignature,
} from "./drama.js";

describe("drama progression", () => {
  it("parses action signatures for variety avoidance", () => {
    assert.deepEqual(parseActionSignature("skill:slash:1"), {
      kind: "skill",
      skillId: "slash",
    });
    assert.deepEqual(parseActionSignature("wait:-:1"), {
      kind: "wait",
      skillId: null,
    });
  });

  it("flags stuck loops only, not ordinary turns", () => {
    assert.equal(
      dramaProgressionHint({
        phase: "rising",
        turn: 6,
        turnLimit: 20,
        repeatedActionA: 3,
        repeatedActionB: 3,
        lastActionSignatureA: "skill:a:1",
        lastActionSignatureB: "skill:b:1",
        recentBeatFingerprints: [
          "skill:a:1|skill:b:1|still",
          "skill:a:1|skill:b:1|still",
          "skill:a:1|skill:b:1|still",
        ],
        turnsSinceLocationChange: 2,
      }),
      "break_stalemate",
    );
    assert.equal(
      dramaProgressionHint({
        phase: "rising",
        turn: 5,
        turnLimit: 20,
        repeatedActionA: 1,
        repeatedActionB: 4,
        lastActionSignatureA: "skill:a:1",
        lastActionSignatureB: "wait:-:1",
        recentBeatFingerprints: ["skill:a:1|wait:-:1|still"],
        turnsSinceLocationChange: 1,
      }),
      "one_sided_pressure",
    );
    assert.equal(
      dramaProgressionHint({
        phase: "rising",
        turn: 4,
        turnLimit: 20,
        repeatedActionA: 1,
        repeatedActionB: 1,
        lastActionSignatureA: "skill:a:1",
        lastActionSignatureB: "skill:b:1",
        recentBeatFingerprints: ["skill:a:1|skill:b:1|still"],
        turnsSinceLocationChange: 1,
      }),
      null,
    );
  });
});
