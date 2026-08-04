import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actualWinRate,
  applyElo,
  formatRatingForDisplay,
  isProvisional,
  kFactor,
  PROVISIONAL_GAMES,
  ratingForDisplay,
  RATING_K,
  summarizeRatingPopulation,
  expectedScore,
  normalizeRecord,
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

  it("uses K=20 regardless of provisional labels", () => {
    assert.equal(kFactor(0, true), RATING_K);
    assert.equal(kFactor(0, false), RATING_K);
    assert.equal(kFactor(PROVISIONAL_GAMES, true), RATING_K);
    assert.equal(kFactor(PROVISIONAL_GAMES, false), RATING_K);
  });

  it("does not clip ratings below 100", () => {
    const result = applyElo({
      rating: 50,
      gamesPlayed: 0,
      foeRating: 50,
      foeProvisional: true,
      outcome: "loss",
    });
    assert.equal(result.delta, -10);
    assert.equal(result.nextRating, 40);
    assert.equal(normalizeRecord({ rating: 40 }).rating, 40);
  });

  it("shifts the population mean to 1500 for display", () => {
    const population = summarizeRatingPopulation([1300, 1400, 1600]);
    assert.deepEqual(population, {
      ratingTotal: 4300,
      characterCount: 3,
    });
    const average = population.ratingTotal / population.characterCount;
    assert.equal(ratingForDisplay(average, population), 1500);
    assert.equal(
      formatRatingForDisplay(ratingForDisplay(1300, population)),
      "1367",
    );
  });

  it("rounds displayed ratings and labels values below 100", () => {
    assert.equal(formatRatingForDisplay(1499.5), "1500");
    assert.equal(formatRatingForDisplay(99.9), "100未満");
  });

  it("calculates actual win rate with draws worth 0.5", () => {
    assert.equal(actualWinRate({ wins: 2, draws: 2, gamesPlayed: 6 }), 0.5);
    assert.equal(actualWinRate({ wins: 0, draws: 0, gamesPlayed: 0 }), null);
  });

  it("expected score is 0.5 for equal ratings", () => {
    assert.ok(Math.abs(expectedScore(1500, 1500) - 0.5) < 1e-9);
  });
});
