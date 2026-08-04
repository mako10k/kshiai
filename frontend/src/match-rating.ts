import {
  actualWinRate,
  expectedScore,
  type CharacterPublic,
} from "@kshiai/shared";

export type MatchupCharacter = Pick<
  CharacterPublic,
  "ownerUserId" | "record" | "recordOverall"
>;

export type MatchupStats = {
  record: CharacterPublic["record"];
  recordScope: "公開" | "全体";
  actualWinRate: number | null;
  predictedWinRate: number;
};

function recordForMatchup(
  character: MatchupCharacter,
  opponent: MatchupCharacter,
): { record: CharacterPublic["record"]; recordScope: "公開" | "全体" } {
  const sameOwner = character.ownerUserId === opponent.ownerUserId;
  return sameOwner
    ? {
        record: character.recordOverall ?? character.record,
        recordScope: "全体",
      }
    : { record: character.record, recordScope: "公開" };
}

export function matchupStats(
  character: MatchupCharacter,
  opponent: MatchupCharacter,
): MatchupStats {
  const mine = recordForMatchup(character, opponent);
  const foe = recordForMatchup(opponent, character);
  return {
    ...mine,
    actualWinRate: actualWinRate(mine.record),
    predictedWinRate: expectedScore(mine.record.rating, foe.record.rating),
  };
}

export function formatWinRate(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

export function formatMatchRecord(record: CharacterPublic["record"]): string {
  const draws = record.draws ? `${record.draws}分` : "";
  return `${record.wins}勝${record.losses}敗${draws}（${record.gamesPlayed}試合）`;
}
