import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyElo,
  isProvisional,
  PROVISIONAL_GAMES,
  expectedScore,
} from "./rating.js";

describe("rating", () => {
  it("marks provisional until threshold", () => {
    assert.equal(isProvisional(0), true);
    assert.equal(isProvisional(PROVISIONAL_GAMES - 1), true);
    assert.equal(isProvisional(PROVISIONAL_GAMES), false);
  });

  it("gives underdog more points on upset", () => {
    const underdogWin = applyElo({
      rating: 1400,
      gamesPlayed: 10,
      foeRating: 1600,
      foeProvisional: false,
      outcome: "win",
    });
    const favoriteWin = applyElo({
      rating: 1600,
      gamesPlayed: 10,
      foeRating: 1400,
      foeProvisional: false,
      outcome: "win",
    });
    assert.ok(underdogWin.delta > favoriteWin.delta);
  });

  it("expected score is 0.5 for equal ratings", () => {
    assert.ok(Math.abs(expectedScore(1500, 1500) - 0.5) < 1e-9);
  });
});
