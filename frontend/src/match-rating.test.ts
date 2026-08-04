import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMatchRecord,
  formatWinRate,
  matchupStats,
  type MatchupCharacter,
} from "./match-rating.js";

function character(input: {
  ownerUserId: string;
  publicRating: number;
  publicWins?: number;
  publicGames?: number;
  overallRating?: number;
  overallWins?: number;
  overallGames?: number;
}): MatchupCharacter {
  const record = {
    wins: input.publicWins ?? 0,
    losses: Math.max(0, (input.publicGames ?? 0) - (input.publicWins ?? 0)),
    draws: 0,
    gamesPlayed: input.publicGames ?? 0,
    rating: input.publicRating,
    provisional: false,
  };
  return {
    ownerUserId: input.ownerUserId,
    record,
    recordOverall:
      input.overallRating == null
        ? undefined
        : {
            ...record,
            wins: input.overallWins ?? 0,
            losses: Math.max(
              0,
              (input.overallGames ?? 0) - (input.overallWins ?? 0),
            ),
            gamesPlayed: input.overallGames ?? 0,
            rating: input.overallRating,
          },
  };
}

describe("match rating display", () => {
  it("uses public results and ratings across accounts", () => {
    const candidate = character({
      ownerUserId: "other",
      publicRating: 1600,
      publicWins: 6,
      publicGames: 10,
    });
    const mine = character({ ownerUserId: "mine", publicRating: 1400 });
    const stats = matchupStats(candidate, mine);
    assert.equal(stats.recordScope, "公開");
    assert.equal(stats.actualWinRate, 0.6);
    assert.ok(stats.predictedWinRate > 0.75);
  });

  it("uses overall results and ratings for same-owner sparring", () => {
    const candidate = character({
      ownerUserId: "mine",
      publicRating: 1200,
      overallRating: 1550,
      overallWins: 3,
      overallGames: 6,
    });
    const mine = character({
      ownerUserId: "mine",
      publicRating: 1800,
      overallRating: 1500,
    });
    const stats = matchupStats(candidate, mine);
    assert.equal(stats.recordScope, "全体");
    assert.equal(stats.record.rating, 1550);
    assert.equal(formatWinRate(stats.actualWinRate), "50%");
  });

  it("formats records and unrated actual results", () => {
    const stats = matchupStats(
      character({ ownerUserId: "other", publicRating: 1500 }),
      character({ ownerUserId: "mine", publicRating: 1500 }),
    );
    assert.equal(formatMatchRecord(stats.record), "0勝0敗（0試合）");
    assert.equal(formatWinRate(stats.actualWinRate), "—");
    assert.equal(formatWinRate(stats.predictedWinRate), "50%");
  });

  it("counts a draw as half a win in the actual rate", () => {
    const candidate = character({
      ownerUserId: "other",
      publicRating: 1500,
      publicWins: 2,
      publicGames: 6,
    });
    candidate.record.losses = 2;
    candidate.record.draws = 2;
    const stats = matchupStats(
      candidate,
      character({ ownerUserId: "mine", publicRating: 1500 }),
    );
    assert.equal(formatWinRate(stats.actualWinRate), "50%");
  });
});
