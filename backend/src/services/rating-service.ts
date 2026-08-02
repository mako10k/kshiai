import {
  applyElo,
  ensureRecord,
  isProvisional,
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

function bumpRecord(
  sheet: CharacterSheet,
  outcome: RankedOutcome,
  nextRating: number,
): CharacterSheet {
  const rec = ensureRecord(sheet);
  const wins = rec.wins + (outcome === "win" ? 1 : 0);
  const losses = rec.losses + (outcome === "loss" ? 1 : 0);
  const draws = rec.draws + (outcome === "draw" ? 1 : 0);
  const gamesPlayed = rec.gamesPlayed + 1;
  return {
    ...sheet,
    record: {
      wins,
      losses,
      draws,
      gamesPlayed,
      rating: nextRating,
      provisional: isProvisional(gamesPlayed),
    },
    updatedAt: new Date().toISOString(),
  };
}

function unbumpRecord(
  sheet: CharacterSheet,
  outcome: RankedOutcome,
  ratingBefore: number,
  gamesPlayedBefore: number,
): CharacterSheet {
  const rec = ensureRecord(sheet);
  return {
    ...sheet,
    record: {
      wins: Math.max(0, rec.wins - (outcome === "win" ? 1 : 0)),
      losses: Math.max(0, rec.losses - (outcome === "loss" ? 1 : 0)),
      draws: Math.max(0, rec.draws - (outcome === "draw" ? 1 : 0)),
      gamesPlayed: Math.max(0, gamesPlayedBefore),
      rating: ratingBefore,
      provisional: isProvisional(gamesPlayedBefore),
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply ranking after a finished battle.
 * Same-owner matches are not ranked (prevents alt farming on one account).
 */
export function settleBattleRating(state: BattleState): BattleState {
  if (state.status !== "finished") return state;
  if (state.ratingSettlement?.applied && !state.ratingSettlement.voided) {
    return state;
  }

  const idA = state.sideA.characterId;
  const idB = state.sideB.characterId;
  const sheetA = charRepo.getSheet(idA);
  const sheetB = charRepo.getSheet(idB);
  if (!sheetA || !sheetB) return state;
  if (sheetA.deletedAt || sheetB.deletedAt) return state;

  // Same owner: track W-L for fun? User asked for rating integrity —
  // still count record but skip Elo inflation between alts.
  const sameOwner = sheetA.ownerUserId === sheetB.ownerUserId;
  const ranked = !sameOwner;

  const recA = ensureRecord(sheetA);
  const recB = ensureRecord(sheetB);
  const outcomeA = outcomeForSide(state.winnerSide, "a");
  const outcomeB = outcomeForSide(state.winnerSide, "b");

  let nextA = sheetA;
  let nextB = sheetB;
  let deltaA = 0;
  let deltaB = 0;
  let afterA = recA.rating;
  let afterB = recB.rating;

  if (ranked) {
    const rA = applyElo({
      rating: recA.rating,
      gamesPlayed: recA.gamesPlayed,
      foeRating: recB.rating,
      foeProvisional: recB.provisional || isProvisional(recB.gamesPlayed),
      outcome: outcomeA,
    });
    const rB = applyElo({
      rating: recB.rating,
      gamesPlayed: recB.gamesPlayed,
      foeRating: recA.rating,
      foeProvisional: recA.provisional || isProvisional(recA.gamesPlayed),
      outcome: outcomeB,
    });
    deltaA = rA.delta;
    deltaB = rB.delta;
    afterA = rA.nextRating;
    afterB = rB.nextRating;
    nextA = bumpRecord(sheetA, outcomeA, afterA);
    nextB = bumpRecord(sheetB, outcomeB, afterB);
  } else {
    // Unranked sparring: still count W/L, rating unchanged
    nextA = bumpRecord(sheetA, outcomeA, recA.rating);
    nextB = bumpRecord(sheetB, outcomeB, recB.rating);
    afterA = recA.rating;
    afterB = recB.rating;
  }

  charRepo.saveSheet(nextA);
  charRepo.saveSheet(nextB);

  const settlement = {
    applied: true,
    voided: false,
    ranked,
    sideA: {
      characterId: idA,
      before: recA.rating,
      after: afterA,
      delta: deltaA,
      provisionalBefore: isProvisional(recA.gamesPlayed),
      provisionalAfter: isProvisional(recA.gamesPlayed + 1),
      gamesPlayedBefore: recA.gamesPlayed,
    },
    sideB: {
      characterId: idB,
      before: recB.rating,
      after: afterB,
      delta: deltaB,
      provisionalBefore: isProvisional(recB.gamesPlayed),
      provisionalAfter: isProvisional(recB.gamesPlayed + 1),
      gamesPlayedBefore: recB.gamesPlayed,
    },
  };

  return {
    ...state,
    ratingSettlement: settlement,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * When a character is soft-deleted, void rating from their ranked matches
 * so survivors don't keep free Elo from disposable alts.
 */
export function voidRatingsInvolvingCharacter(characterId: string): number {
  const battles = battleRepo.listBattlesInvolvingCharacter(characterId);
  let voided = 0;

  for (const { state, meta } of battles) {
    const s = state.ratingSettlement;
    if (!s || !s.applied || s.voided || !s.ranked) continue;
    if (
      s.sideA.characterId !== characterId &&
      s.sideB.characterId !== characterId
    ) {
      continue;
    }

    const outcomeA = outcomeForSide(state.winnerSide, "a");
    const outcomeB = outcomeForSide(state.winnerSide, "b");

    const sheetA = charRepo.getSheetIncludingDeleted(s.sideA.characterId);
    const sheetB = charRepo.getSheetIncludingDeleted(s.sideB.characterId);

    // Reverse survivor first (the non-deleted side)
    if (sheetA && s.sideA.characterId !== characterId) {
      charRepo.saveSheet(
        unbumpRecord(
          sheetA,
          outcomeA,
          s.sideA.before,
          s.sideA.gamesPlayedBefore,
        ),
      );
    }
    if (sheetB && s.sideB.characterId !== characterId) {
      charRepo.saveSheet(
        unbumpRecord(
          sheetB,
          outcomeB,
          s.sideB.before,
          s.sideB.gamesPlayedBefore,
        ),
      );
    }
    // Deleted character: reset their stored record to pre-match if still present
    if (sheetA && s.sideA.characterId === characterId) {
      charRepo.saveSheet(
        unbumpRecord(
          sheetA,
          outcomeA,
          s.sideA.before,
          s.sideA.gamesPlayedBefore,
        ),
      );
    }
    if (sheetB && s.sideB.characterId === characterId) {
      charRepo.saveSheet(
        unbumpRecord(
          sheetB,
          outcomeB,
          s.sideB.before,
          s.sideB.gamesPlayedBefore,
        ),
      );
    }

    const nextState: BattleState = {
      ...state,
      ratingSettlement: { ...s, applied: false, voided: true },
      updatedAt: new Date().toISOString(),
    };
    battleRepo.saveBattle(nextState, {
      sideAUserId: meta.side_a_user_id,
      sideACharacterId: meta.side_a_character_id,
      sideBCharacterId: meta.side_b_character_id,
    });
    voided += 1;
  }

  return voided;
}
