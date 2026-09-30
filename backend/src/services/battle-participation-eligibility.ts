// R: Resolve the immutable V3 generation admitted by every battle participant selector.
import type { CharacterSheet, CharacterCompilerCapabilitySetV1 } from "@kshiai/shared";
import { getCurrentAssetGeneration, type AssetGeneration } from "../repositories/asset-generations.js";
import { readCharacterGeneration, type CharacterGenerationRead } from "../repositories/character-generation-reader.js";

const requiredCapabilities: CharacterCompilerCapabilitySetV1 = {
  contractVersion: 1,
  required: [{ consumer: "battle-mechanics", version: 3 }],
};

export type BattleParticipantEligibility =
  | { status: "ready"; participant: Extract<CharacterGenerationRead, { schemaVersion: 3 }> }
  | { status: "blocked"; reason: "generation_missing" | "v3_required" | "capability_blocked" | "invalid_generation" | "character_deleted" };

export function evaluateBattleParticipantEligibility(
  sheet: CharacterSheet,
  generation: AssetGeneration | null,
): BattleParticipantEligibility {
  if (sheet.deletedAt) return { status: "blocked", reason: "character_deleted" };
  if (!generation) return { status: "blocked", reason: "generation_missing" };
  if (generation.schemaVersion !== 3) return { status: "blocked", reason: "v3_required" };
  try {
    const participant = readCharacterGeneration({
      generation, currentSheet: sheet, requiredV3Capabilities: requiredCapabilities,
    });
    if (participant.schemaVersion !== 3) return { status: "blocked", reason: "v3_required" };
    return participant.compatibility.status === "ready"
      ? { status: "ready", participant }
      : { status: "blocked", reason: "capability_blocked" };
  } catch {
    return { status: "blocked", reason: "invalid_generation" };
  }
}

export async function resolveBattleParticipantEligibility(
  sheet: CharacterSheet,
): Promise<BattleParticipantEligibility> {
  return evaluateBattleParticipantEligibility(
    sheet, await getCurrentAssetGeneration("character", sheet.id),
  );
}

export async function filterEligibleBattleParticipants(
  sheets: CharacterSheet[],
): Promise<CharacterSheet[]> {
  const eligibility = await Promise.all(sheets.map(resolveBattleParticipantEligibility));
  return sheets.flatMap((sheet, index) => {
    const result = eligibility[index];
    return result?.status === "ready" ? [result.participant.sheet] : [];
  });
}
