import {
  applyElo,
  ensureRecord,
  ensureRecordOverall,
  isProvisional,
  type CharacterRecord,
  type CharacterSheet,
  type BattleState,
  type RankedOutcome,
} from "@kshiai/shared";
import * as charRepo from "../repositories/characters.js";

function outcomeForSide(
  winnerSide: BattleState["winnerSide"],
  side: "a" | "b",
): RankedOutcome {
  if (winnerSide === "draw" || winnerSide == null) return "draw";
  if (winnerSide === side) return "win";
  return "loss";
}

type Track = "public" | "overall";

function getTrack(sheet: CharacterSheet, track: Track): CharacterRecord {
  return track === "public" ? ensureRecord(sheet) : ensureRecordOverall(sheet);
}

function setTrack(
  sheet: CharacterSheet,
  track: Track,
  rec: CharacterRecord,
): CharacterSheet {
  if (track === "public") {
    return { ...sheet, record: rec, updatedAt: new Date().toISOString() };
  }
  return { ...sheet, recordOverall: rec, updatedAt: new Date().toISOString() };
}

function bumpTrack(
  sheet: CharacterSheet,
  track: Track,
  outcome: RankedOutcome,
  nextRating: number,
): CharacterSheet {
  const rec = getTrack(sheet, track);
  const wins = rec.wins + (outcome === "win" ? 1 : 0);
  const losses = rec.losses + (outcome === "loss" ? 1 : 0);
  const draws = rec.draws + (outcome === "draw" ? 1 : 0);
  const gamesPlayed = rec.gamesPlayed + 1;
  return setTrack(sheet, track, {
    wins,
    losses,
    draws,
    gamesPlayed,
    rating: nextRating,
    provisional: isProvisional(gamesPlayed),
  });
}

type SideSnap = {
  characterId: string;
  before: number;
  after: number;
  delta: number;
  provisionalBefore: boolean;
  provisionalAfter: boolean;
  gamesPlayedBefore: number;
};

function applyEloTrack(
  sheet: CharacterSheet,
  foe: CharacterSheet,
  outcome: RankedOutcome,
  track: Track,
): { sheet: CharacterSheet; snap: SideSnap } {
  const rec = getTrack(sheet, track);
  const foeRec = getTrack(foe, track);
  const r = applyElo({
    rating: rec.rating,
    gamesPlayed: rec.gamesPlayed,
    foeRating: foeRec.rating,
    foeProvisional: foeRec.provisional || isProvisional(foeRec.gamesPlayed),
    outcome,
  });
  return {
    sheet: bumpTrack(sheet, track, outcome, r.nextRating),
    snap: {
      characterId: sheet.id,
      before: rec.rating,
      after: r.nextRating,
      delta: r.delta,
      provisionalBefore: isProvisional(rec.gamesPlayed),
      provisionalAfter: isProvisional(rec.gamesPlayed + 1),
      gamesPlayedBefore: rec.gamesPlayed,
    },
  };
}

/**
 * Dual-track rating after a finished battle:
 * - overall: every finished match (incl. same-account sparring)
 * - public: cross-account only (shown to everyone)
 */
export async function settleBattleRating(state: BattleState): Promise<BattleState> {
  if (state.status !== "finished") return state;
  if (state.ratingSettlement?.applied && !state.ratingSettlement.voided) {
    return state;
  }

  const idA = state.sideA.characterId;
  const idB = state.sideB.characterId;
  const sheetA = await charRepo.getSheet(idA);
  const sheetB = await charRepo.getSheet(idB);
  if (!sheetA || !sheetB) return state;
  if (sheetA.deletedAt || sheetB.deletedAt) return state;

  const sameOwner = sheetA.ownerUserId === sheetB.ownerUserId;
  const outcomeA = outcomeForSide(state.winnerSide, "a");
  const outcomeB = outcomeForSide(state.winnerSide, "b");

  // Overall track: always (same-owner at full K for private ladder)
  const overallA = applyEloTrack(sheetA, sheetB, outcomeA, "overall");
  const overallB = applyEloTrack(sheetB, sheetA, outcomeB, "overall");

  let nextA = overallA.sheet;
  let nextB = overallB.sheet;
  let publicA: SideSnap | null = null;
  let publicB: SideSnap | null = null;

  // Public ranked track: only when different owners
  if (!sameOwner) {
    const pA = applyEloTrack(nextA, nextB, outcomeA, "public");
    const pB = applyEloTrack(nextB, nextA, outcomeB, "public");
    nextA = pA.sheet;
    nextB = pB.sheet;
    publicA = pA.snap;
    publicB = pB.snap;
  }

  await charRepo.saveSheet(nextA);
  await charRepo.saveSheet(nextB);

  const settlement = {
    applied: true,
    voided: false,
    /** Public track was updated (cross-account). */
    ranked: !sameOwner,
    sameOwner,
    sideA: overallA.snap,
    sideB: overallB.snap,
    public: publicA && publicB ? { sideA: publicA, sideB: publicB } : null,
    overall: { sideA: overallA.snap, sideB: overallB.snap },
  };

  return {
    ...state,
    ratingSettlement: settlement,
    updatedAt: new Date().toISOString(),
  };
}
