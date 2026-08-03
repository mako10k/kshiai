import {
  ensureImprovementMemo,
  getImprovementAnalysisEligibility,
  type CharacterImprovementMemo,
  type CharacterImprovementPublic,
  type CharacterSheet,
} from "@kshiai/shared";
import type { LlmProvider } from "../llm/types.js";
import type {
  CharacterBattleDetail,
  CharacterBattleSearchHit,
} from "../repositories/battles.js";
import * as battleRepo from "../repositories/battles.js";
import * as charRepo from "../repositories/characters.js";

export type BattleHistoryTools = {
  search(
    query: string,
    limit?: number,
  ): Promise<CharacterBattleSearchHit[]>;
  get(battleId: string): Promise<CharacterBattleDetail | null>;
};

export function buildBattleHistoryTools(
  characterId: string,
): BattleHistoryTools {
  return {
    search: async (query, limit) =>
      battleRepo.searchCharacterBattleHistory({
        characterId,
        query,
        limit,
        finishedOnly: true,
      }),
    get: async (battleId) =>
      battleRepo.getCharacterBattleDetail(characterId, battleId),
  };
}

export async function getCharacterImprovementPublic(
  sheet: CharacterSheet,
): Promise<CharacterImprovementPublic> {
  const memo = ensureImprovementMemo(sheet.improvementMemo);
  const finishedBattles = await battleRepo.countFinishedBattlesForCharacter(sheet.id);
  return {
    memo,
    eligibility: getImprovementAnalysisEligibility(finishedBattles, memo),
  };
}

export async function analyzeCharacterImprovement(input: {
  sheet: CharacterSheet;
  llm: LlmProvider;
}): Promise<{
  sheet: CharacterSheet;
  public: CharacterImprovementPublic;
  assistantMessage: string;
}> {
  const { sheet, llm } = input;
  const finishedBattles = await battleRepo.countFinishedBattlesForCharacter(sheet.id);
  const currentMemo = ensureImprovementMemo(sheet.improvementMemo);
  const eligibility = getImprovementAnalysisEligibility(
    finishedBattles,
    currentMemo,
  );
  if (!eligibility.canAnalyze) {
    const err = new Error(eligibility.reason ?? "analysis_not_allowed");
    (err as Error & { code?: string }).code = "analysis_not_allowed";
    throw err;
  }

  if (finishedBattles === 0) {
    const err = new Error("終了した試合がありません。");
    (err as Error & { code?: string }).code = "no_battles";
    throw err;
  }

  const tools = buildBattleHistoryTools(sheet.id);
  const analysis = await llm.analyzeCharacterImprovement({
    character: {
      displayName: sheet.displayName,
      traits: sheet.traits,
      narrativeBlurb: sheet.narrativeBlurb,
      skillNames: sheet.skills.map((s) => s.name),
      basicAttackName: sheet.basicAttack?.name ?? "基本アクション",
      weaponName: sheet.weapon?.name ?? null,
      armorName: sheet.armor?.name ?? null,
    },
    previousMemo: currentMemo,
    finishedBattles,
    battleTools: tools,
  });

  const nextMemo: CharacterImprovementMemo = {
    strengths: analysis.strengths.slice(0, 12),
    improvements: analysis.improvements.slice(0, 12),
    summary: analysis.summary.slice(0, 800),
    lastAnalyzedAt: new Date().toISOString(),
    lastAnalyzedBattleCount: finishedBattles,
    analysisCount: currentMemo.analysisCount + 1,
  };

  const nextSheet: CharacterSheet = {
    ...sheet,
    improvementMemo: nextMemo,
    updatedAt: new Date().toISOString(),
  };
  await charRepo.saveSheet(nextSheet);

  return {
    sheet: nextSheet,
    public: await getCharacterImprovementPublic(nextSheet),
    assistantMessage: analysis.assistantMessage,
  };
}

export async function generateCharacterImprovementPrompt(input: {
  sheet: CharacterSheet;
  llm: LlmProvider;
}): Promise<{ prompt: string; assistantMessage: string }> {
  const { sheet, llm } = input;
  const memo = ensureImprovementMemo(sheet.improvementMemo);
  if (memo.strengths.length === 0 && memo.improvements.length === 0) {
    const err = new Error(
      "メモが空です。先に戦績分析で良い点・改善点を登録してください。",
    );
    (err as Error & { code?: string }).code = "memo_empty";
    throw err;
  }

  return llm.generateImprovementPrompt({
    character: {
      displayName: sheet.displayName,
      traits: sheet.traits,
      narrativeBlurb: sheet.narrativeBlurb,
      skillNames: sheet.skills.map((s) => s.name),
      basicAttackName: sheet.basicAttack?.name ?? "基本アクション",
      weaponName: sheet.weapon?.name ?? null,
      armorName: sheet.armor?.name ?? null,
    },
    memo,
  });
}
