import { CharacterDefinitionV3Schema, type CharacterDefinitionV3 } from "./character-definition-v3.js";
import { CharacterImageBriefV2Schema } from "./structured-character.js";

/** The image consumer uses only the explicitly image-tagged appearance fields. */
export function projectCharacterImageBriefV3(definition: CharacterDefinitionV3) {
  const parsed = CharacterDefinitionV3Schema.parse(definition);
  return CharacterImageBriefV2Schema.parse({
    contractVersion: 2,
    publicSummary: parsed.appearance.publicSummary,
    details: parsed.appearance.details.filter((detail) => detail.description.consumerTags.includes("character-image"))
      .map((detail) => detail.description.text).slice(0, 12),
    visualPrompt: parsed.appearance.visualPrompt,
  });
}
