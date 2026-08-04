/** Elo-like rating. Provisional status is a display label only. */

export const DEFAULT_RATING = 1500;
/** Games before rating is considered settled (not provisional). */
export const PROVISIONAL_GAMES = 5;
export const RATING_K = 20;
/** @deprecated K is always RATING_K, regardless of provisional status. */
export const K_PROVISIONAL = RATING_K;
/** @deprecated Use RATING_K. */
export const K_SETTLED = RATING_K;
/** @deprecated K is always RATING_K, regardless of the opponent's status. */
export const K_VS_PROVISIONAL = RATING_K;

export type RankedOutcome = "win" | "loss" | "draw";

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_GAMES;
}

export function kFactor(
  _selfGames: number,
  _foeProvisional: boolean,
): number {
  return RATING_K;
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
}): { nextRating: number; delta: number } {
  const k = kFactor(input.gamesPlayed, input.foeProvisional);
  const exp = expectedScore(input.rating, input.foeRating);
  const score = scoreFromOutcome(input.outcome);
  const delta = Math.round(k * (score - exp));
  return {
    nextRating: input.rating + delta,
    delta,
  };
}

export type RatingPopulation = {
  ratingTotal: number;
  characterCount: number;
};

export type RatingDisplayContext = {
  public: RatingPopulation;
  overall: RatingPopulation;
};

export function summarizeRatingPopulation(
  ratings: readonly number[],
): RatingPopulation {
  return {
    ratingTotal: ratings.reduce((total, rating) => total + rating, 0),
    characterCount: ratings.length,
  };
}

/** Shift the active population mean to DEFAULT_RATING for display only. */
export function ratingForDisplay(
  rating: number,
  population?: RatingPopulation,
): number {
  if (!population || population.characterCount <= 0) return rating;
  const average = population.ratingTotal / population.characterCount;
  return DEFAULT_RATING + (rating - average);
}

/** Round visible ratings and conceal exact values below 100. */
export function formatRatingForDisplay(rating: number): string {
  return rating < 100 ? "100未満" : String(Math.round(rating));
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

/** Actual score rate, using the same win=1/draw=0.5/loss=0 scale as Elo. */
export function actualWinRate(
  record: Pick<CharacterRecord, "wins" | "draws" | "gamesPlayed">,
): number | null {
  if (record.gamesPlayed <= 0) return null;
  return (record.wins + record.draws * 0.5) / record.gamesPlayed;
}

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
    rating,
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
  /** Legacy settlement state; character deletion no longer voids ratings. */
  voided: boolean;
  ranked: boolean;
  sideA: BattleRatingSide;
  sideB: BattleRatingSide;
};
