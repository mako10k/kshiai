import { z } from "zod";

/** First analysis unlocks after this many finished battles. */
export const IMPROVEMENT_ANALYSIS_FIRST_AT = 5;
/** Subsequent analyses require this many additional finished battles. */
export const IMPROVEMENT_ANALYSIS_INTERVAL = 10;

/** Owner-only coaching notes derived from recent match history. */
export const CharacterImprovementMemoSchema = z.object({
  /** Observed strengths to keep / amplify. */
  strengths: z.array(z.string().min(1).max(240)).max(12).default([]),
  /** Safe improvement targets that do not rewrite the core concept. */
  improvements: z.array(z.string().min(1).max(240)).max(12).default([]),
  /** Short overall read of recent form. */
  summary: z.string().max(800).default(""),
  lastAnalyzedAt: z.string().nullable().default(null),
  /**
   * Finished battle count snapshot when analysis last ran.
   * Used with analysisCount to gate re-analysis.
   */
  lastAnalyzedBattleCount: z.number().int().nonnegative().default(0),
  analysisCount: z.number().int().nonnegative().default(0),
});
export type CharacterImprovementMemo = z.infer<
  typeof CharacterImprovementMemoSchema
>;

export function defaultImprovementMemo(): CharacterImprovementMemo {
  return CharacterImprovementMemoSchema.parse({});
}

export function ensureImprovementMemo(
  value: unknown,
): CharacterImprovementMemo {
  const parsed = CharacterImprovementMemoSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : defaultImprovementMemo();
}

/** Owner-private notes for one recurring opponent matchup. */
export const OpponentBattleMemorySchema = z.object({
  preBattlePlan: z.string().max(1200).default(""),
  postBattleReflection: z.string().max(1200).default(""),
  battleCount: z.number().int().nonnegative().default(0),
  lastBattleAt: z.string().nullable().default(null),
});
export type OpponentBattleMemory = z.infer<typeof OpponentBattleMemorySchema>;

export type ImprovementAnalysisEligibility = {
  finishedBattles: number;
  canAnalyze: boolean;
  /** Battles still needed before the next analysis (0 when allowed). */
  battlesUntilNext: number;
  /** Human-readable Japanese reason when blocked. */
  reason: string | null;
  lastAnalyzedAt: string | null;
  lastAnalyzedBattleCount: number;
  analysisCount: number;
  nextAnalyzeAtBattleCount: number | null;
};

/**
 * Rate limit: first analysis after 5 finished battles, then every 10 battles.
 */
export function getImprovementAnalysisEligibility(
  finishedBattles: number,
  memo: CharacterImprovementMemo | null | undefined,
): ImprovementAnalysisEligibility {
  const safeCount = Math.max(0, Math.floor(finishedBattles));
  const m = ensureImprovementMemo(memo);
  const hasAnalyzed = m.analysisCount > 0;

  if (!hasAnalyzed) {
    if (safeCount < IMPROVEMENT_ANALYSIS_FIRST_AT) {
      const need = IMPROVEMENT_ANALYSIS_FIRST_AT - safeCount;
      return {
        finishedBattles: safeCount,
        canAnalyze: false,
        battlesUntilNext: need,
        reason: `初回の分析は ${IMPROVEMENT_ANALYSIS_FIRST_AT} 戦終了後に利用できます（あと ${need} 戦）。`,
        lastAnalyzedAt: m.lastAnalyzedAt,
        lastAnalyzedBattleCount: m.lastAnalyzedBattleCount,
        analysisCount: m.analysisCount,
        nextAnalyzeAtBattleCount: IMPROVEMENT_ANALYSIS_FIRST_AT,
      };
    }
    return {
      finishedBattles: safeCount,
      canAnalyze: true,
      battlesUntilNext: 0,
      reason: null,
      lastAnalyzedAt: m.lastAnalyzedAt,
      lastAnalyzedBattleCount: m.lastAnalyzedBattleCount,
      analysisCount: m.analysisCount,
      nextAnalyzeAtBattleCount: null,
    };
  }

  const nextAt = m.lastAnalyzedBattleCount + IMPROVEMENT_ANALYSIS_INTERVAL;
  if (safeCount < nextAt) {
    const need = nextAt - safeCount;
    return {
      finishedBattles: safeCount,
      canAnalyze: false,
      battlesUntilNext: need,
      reason: `再分析は前回から ${IMPROVEMENT_ANALYSIS_INTERVAL} 戦ごとに行えます（あと ${need} 戦）。`,
      lastAnalyzedAt: m.lastAnalyzedAt,
      lastAnalyzedBattleCount: m.lastAnalyzedBattleCount,
      analysisCount: m.analysisCount,
      nextAnalyzeAtBattleCount: nextAt,
    };
  }

  return {
    finishedBattles: safeCount,
    canAnalyze: true,
    battlesUntilNext: 0,
    reason: null,
    lastAnalyzedAt: m.lastAnalyzedAt,
    lastAnalyzedBattleCount: m.lastAnalyzedBattleCount,
    analysisCount: m.analysisCount,
    nextAnalyzeAtBattleCount: null,
  };
}

export const CharacterImprovementPublicSchema = z.object({
  memo: CharacterImprovementMemoSchema,
  eligibility: z.object({
    finishedBattles: z.number().int().nonnegative(),
    canAnalyze: z.boolean(),
    battlesUntilNext: z.number().int().nonnegative(),
    reason: z.string().nullable(),
    lastAnalyzedAt: z.string().nullable(),
    lastAnalyzedBattleCount: z.number().int().nonnegative(),
    analysisCount: z.number().int().nonnegative(),
    nextAnalyzeAtBattleCount: z.number().int().nullable(),
  }),
});
export type CharacterImprovementPublic = z.infer<
  typeof CharacterImprovementPublicSchema
>;
