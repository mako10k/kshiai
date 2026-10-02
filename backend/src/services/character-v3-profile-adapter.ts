/** R: Adapt V3 character definitions to the existing profile-v2 projection contract. */
import { type CharacterDefinitionV2, type CharacterDefinitionV3 } from "@kshiai/shared";

export function v3ToProfileDefinitionV2(definition: CharacterDefinitionV3): CharacterDefinitionV2 {
  const {
    schemaVersion: _schemaVersion,
    actionNorms,
    consciousGuidance: _consciousGuidance,
    mechanicalConflictFallbacks: _mechanicalConflictFallbacks,
    ...stable
  } = definition;
  return {
    ...stable,
    schemaVersion: 2,
    actionNorms: actionNorms.map((norm): CharacterDefinitionV2["actionNorms"][number] => {
      const sharedResponse = {
        statement: norm.description?.text ?? `action norm ${norm.id}`,
        fallbackActionRef: null,
      };
      if (norm.force === "constraint") {
        return { ...norm, response: { ...norm.response, ...sharedResponse }, selfAwareness: "aware" };
      }
      return { ...norm, response: { ...norm.response, ...sharedResponse }, selfAwareness: "aware" };
    }),
  };
}
