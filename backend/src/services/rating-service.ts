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
import * as battleRepo from "../repositories/battles.js";
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

function unbumpTrack(
  sheet: CharacterSheet,
  track: Track,
  outcome: RankedOutcome,
  ratingBefore: number,
  gamesPlayedBefore: number,
): CharacterSheet {
  const rec = getTrack(sheet, track);
  return setTrack(sheet, track, {
    wins: Math.max(0, rec.wins - (outcome === "win" ? 1 : 0)),
    losses: Math.max(0, rec.losses - (outcome === "loss" ? 1 : 0)),
    draws: Math.max(0, rec.draws - (outcome === "draw" ? 1 : 0)),
    gamesPlayed: Math.max(0, gamesPlayedBefore),
    rating: ratingBefore,
    provisional: isProvisional(gamesPlayedBefore),
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
  kScale: number,
): { sheet: CharacterSheet; snap: SideSnap } {
  const rec = getTrack(sheet, track);
  const foeRec = getTrack(foe, track);
  const r = applyElo({
    rating: rec.rating,
    gamesPlayed: rec.gamesPlayed,
    foeRating: foeRec.rating,
    foeProvisional: foeRec.provisional || isProvisional(foeRec.gamesPlayed),
    outcome,
    kScale,
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
  const overallA = applyEloTrack(sheetA, sheetB, outcomeA, "overall", 1);
  const overallB = applyEloTrack(sheetB, sheetA, outcomeB, "overall", 1);

  let nextA = overallA.sheet;
  let nextB = overallB.sheet;
  let publicA: SideSnap | null = null;
  let publicB: SideSnap | null = null;

  // Public ranked track: only when different owners
  if (!sameOwner) {
    const pA = applyEloTrack(nextA, nextB, outcomeA, "public", 1);
    const pB = applyEloTrack(nextB, nextA, outcomeB, "public", 1);
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

/**
 * When a character is soft-deleted, void rating from their matches
 * so survivors don't keep free Elo from disposable alts.
 */
export async function voidRatingsInvolvingCharacter(characterId: string): Promise<number> {
  const battles = await battleRepo.listBattlesInvolvingCharacter(characterId);
  let voided = 0;

  for (const { state, meta } of battles) {
    const s = state.ratingSettlement as
      | (NonNullable<BattleState["ratingSettlement"]> & {
          overall?: { sideA: SideSnap; sideB: SideSnap };
          public?: { sideA: SideSnap; sideB: SideSnap } | null;
        })
      | undefined;
    if (!s || !s.applied || s.voided) continue;
    if (
      s.sideA.characterId !== characterId &&
      s.sideB.characterId !== characterId
    ) {
      continue;
    }

    const outcomeA = outcomeForSide(state.winnerSide, "a");
    const outcomeB = outcomeForSide(state.winnerSide, "b");

    // Prefer dual-track settlement; fall back to legacy single sideA/sideB as overall
    const overall = s.overall ?? { sideA: s.sideA, sideB: s.sideB };
    const pub = s.public ?? (s.ranked && !s.sameOwner ? overall : null);

    const reverseSide = async (
      snap: SideSnap,
      outcome: RankedOutcome,
      track: Track,
    ) => {
      const sheet = await charRepo.getSheetIncludingDeleted(snap.characterId);
      if (!sheet) return;
      await charRepo.saveSheet(
        unbumpTrack(
          sheet,
          track,
          outcome,
          snap.before,
          snap.gamesPlayedBefore,
        ),
      );
    };

    await reverseSide(overall.sideA, outcomeA, "overall");
    await reverseSide(overall.sideB, outcomeB, "overall");
    if (pub) {
      await reverseSide(pub.sideA, outcomeA, "public");
      await reverseSide(pub.sideB, outcomeB, "public");
    }

    const nextState: BattleState = {
      ...state,
      ratingSettlement: { ...s, applied: false, voided: true },
      updatedAt: new Date().toISOString(),
    };
    await battleRepo.saveBattle(nextState, {
      sideAUserId: meta.side_a_user_id,
      sideACharacterId: meta.side_a_character_id,
      sideBCharacterId: meta.side_b_character_id,
    });
    voided += 1;
  }

  return voided;
}
