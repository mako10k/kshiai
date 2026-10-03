/** R: Resolve a character's immutable battle-bound snapshot without current-asset fallback. */
import { CombatReadyCharacterSheetSchema, type BattleCharacterAssetBinding, type CombatReadyCharacterSheet } from "@kshiai/shared";
import { z } from "zod";

const historicalBindingSchema = z.object({
  assetId: z.string().min(1),
  generationId: z.string().min(1),
  snapshot: CombatReadyCharacterSheetSchema,
});
const historicalBattleSchema = z.object({
  sideA: z.object({ characterId: z.string().min(1) }),
  sideB: z.object({ characterId: z.string().min(1) }),
  assetManifest: z.object({
    characters: z.object({ a: historicalBindingSchema, b: historicalBindingSchema }),
  }),
});

/** Display validates frozen profiles independently of executable compiler inputs. */
export function resolveHistoricalCharacterViewFromJson(
  raw: unknown,
  characterId: string,
): HistoricalCharacterView | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  const parsed = historicalBattleSchema.safeParse(value);
  return parsed.success ? resolveHistoricalCharacterView(parsed.data, characterId) : null;
}

type HistoricalBinding = Pick<BattleCharacterAssetBinding, "assetId" | "generationId" | "snapshot">;
export interface HistoricalCharacterBattle {
  sideA: { characterId: string };
  sideB: { characterId: string };
  assetManifest?: { characters: { a: HistoricalBinding; b: HistoricalBinding } };
}
export interface HistoricalCharacterView {
  generationId: string;
  sheet: CombatReadyCharacterSheet;
}

export function resolveHistoricalCharacterView(
  battle: HistoricalCharacterBattle,
  characterId: string,
): HistoricalCharacterView | null {
  const side = battle.sideA.characterId === characterId ? "a"
    : battle.sideB.characterId === characterId ? "b" : null;
  if (!side) return null;
  const binding = battle.assetManifest?.characters[side];
  if (!binding || !binding.snapshot || binding.assetId !== characterId || binding.snapshot.id !== characterId
    || !binding.generationId) return null;
  return { generationId: binding.generationId, sheet: binding.snapshot };
}
