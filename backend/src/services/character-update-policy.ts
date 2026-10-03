/** R: Admit ordinary character updates only against immutable V3 generations. */
import { CharacterGenerationEnvelopeV3Schema } from "@kshiai/shared";
import { getCurrentAssetGeneration, type AssetGeneration } from "../repositories/asset-generations.js";

export function assertCharacterV3UpdateGeneration(generation: AssetGeneration | null): void {
  if (!generation || generation.schemaVersion !== 3 || generation.assetType !== "character"
    || !CharacterGenerationEnvelopeV3Schema.safeParse(generation.content).success) {
    throw new Error("CHARACTER_V3_UPDATE_REQUIRED");
  }
}

export async function assertCharacterV3UpdateTarget(characterId: string): Promise<void> {
  assertCharacterV3UpdateGeneration(await getCurrentAssetGeneration("character", characterId));
}

export function assertCharacterV3WriteCandidate(candidate: unknown): void {
  if (!CharacterGenerationEnvelopeV3Schema.safeParse(candidate).success) {
    throw new Error("CHARACTER_V3_CANDIDATE_REQUIRED");
  }
}
