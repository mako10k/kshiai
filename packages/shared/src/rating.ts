/**
 * Elo-like rating with provisional period.
 * Provisional until a character has enough completed ranked games;
 * deletion of an opponent voids rating applied from those matches.
 */

export const DEFAULT_RATING = 1500;
/** Games before rating is considered settled (not provisional). */
export const PROVISIONAL_GAMES = 5;
export const K_PROVISIONAL = 40;
export const K_SETTLED = 20;
/** Smaller K when facing a still-provisional opponent. */
export const K_VS_PROVISIONAL = 16;

export type RankedOutcome = "win" | "loss" | "draw";

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_GAMES;
}

export function kFactor(selfGames: number, foeProvisional: boolean): number {
  if (foeProvisional && selfGames >= PROVISIONAL_GAMES) {
    return K_VS_PROVISIONAL;
  }
  return isProvisional(selfGames) ? K_PROVISIONAL : K_SETTLED;
}

/** Expected score for A against B (0–1). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function scoreFromOutcome(outcome: RankedOutcome): number {
  if (outcome === "win") return 1;
  if (outcome === "draw") return 0.5;
  return 0;
}

export function applyElo(input: {
  rating: number;
  gamesPlayed: number;
  foeRating: number;
  foeProvisional: boolean;
  outcome: RankedOutcome;
  /** 1 = full K; 0.5 = sparring / same-owner reduced movement */
  kScale?: number;
}): { nextRating: number; delta: number } {
  const k = kFactor(input.gamesPlayed, input.foeProvisional);
  const scale = Math.min(1, Math.max(0.25, input.kScale ?? 1));
  const exp = expectedScore(input.rating, input.foeRating);
  const score = scoreFromOutcome(input.outcome);
  const delta = Math.round(k * scale * (score - exp));
  return {
    nextRating: Math.max(100, input.rating + delta),
    delta,
  };
}

export type CharacterRecord = {
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  rating: number;
  /** True until gamesPlayed reaches PROVISIONAL_GAMES. */
  provisional: boolean;
};

export function defaultRecord(): CharacterRecord {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    gamesPlayed: 0,
    rating: DEFAULT_RATING,
    provisional: true,
  };
}

export function normalizeRecord(
  partial?: Partial<CharacterRecord> | null,
): CharacterRecord {
  const base = defaultRecord();
  if (!partial) return base;
  const gamesPlayed = Math.max(
    0,
    partial.gamesPlayed ??
      (partial.wins ?? 0) + (partial.losses ?? 0) + (partial.draws ?? 0),
  );
  const rating = partial.rating ?? DEFAULT_RATING;
  return {
    wins: Math.max(0, partial.wins ?? 0),
    losses: Math.max(0, partial.losses ?? 0),
    draws: Math.max(0, partial.draws ?? 0),
    gamesPlayed,
    rating: Math.max(100, rating),
    provisional:
      partial.provisional !== undefined
        ? partial.provisional
        : isProvisional(gamesPlayed),
  };
}

export function formatRecord(r: CharacterRecord): string {
  return `${r.wins}勝 ${r.losses}敗${r.draws ? ` ${r.draws}分` : ""}`;
}

export type BattleRatingSide = {
  characterId: string;
  before: number;
  after: number;
  delta: number;
  provisionalBefore: boolean;
  provisionalAfter: boolean;
  gamesPlayedBefore: number;
};

export type BattleRatingSettlement = {
  /** Currently counting toward ratings. */
  applied: boolean;
  /** Voided (e.g. character deleted) — deltas reversed. */
  voided: boolean;
  ranked: boolean;
  sideA: BattleRatingSide;
  sideB: BattleRatingSide;
};
