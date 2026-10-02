/** R: Resolve a character's immutable battle-bound snapshot without current-asset fallback. */
import type { BattleCharacterAssetBinding, CombatReadyCharacterSheet } from "@kshiai/shared";

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
