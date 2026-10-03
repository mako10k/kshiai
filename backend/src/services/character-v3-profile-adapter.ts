/** R: Adapt V3 character definitions to the existing profile-v2 projection contract. */
import { characterV3ProfileDefinitionV2, type CharacterDefinitionV2, type CharacterDefinitionV3 } from "@kshiai/shared";

export function v3ToProfileDefinitionV2(definition: CharacterDefinitionV3): CharacterDefinitionV2 {
  return characterV3ProfileDefinitionV2(definition);
}
