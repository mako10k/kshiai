// R: Construct a validated V3 character envelope for local integration fixtures.
import { CharacterGenerationEnvelopeV3Schema, type CharacterSheet } from "@kshiai/shared";
import { buildImportedCharacterEnvelopeV2 } from "../services/character-authoring-service.js";

export function buildV3CharacterEnvelopeFixture(sheet: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: `v3-battle-${sheet.id}`,
  });
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } =
    source.definition;
  return CharacterGenerationEnvelopeV3Schema.parse({
    ...source,
    definitionSchema: { family: "character", version: 3 },
    definition: {
      ...stable,
      schemaVersion: 3,
      actionNorms: [],
      consciousGuidance: [],
      mechanicalConflictFallbacks: [],
    },
    compilerCompatibility: [
      { consumer: "character-profile", version: 2 },
      { consumer: "battle-mechanics", version: 3 },
      { consumer: "psyche-trait-profile", version: 1 },
      { consumer: "character-conscious-self", version: 3 },
      { consumer: "character-action-norms", version: 3 },
      { consumer: "character-mechanical-conflict-fallback", version: 1 },
      { consumer: "character-relationship", version: 2 },
    ],
    deferredValues: { contractVersion: 1, values: [] },
  });
}

