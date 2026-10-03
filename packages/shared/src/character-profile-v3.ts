import {
  CharacterDefinitionV3Schema,
  type CharacterDefinitionV3,
} from "./character-definition-v3.js";
import {
  projectCharacterProfileSourceV2,
  type CharacterDefinitionV2,
} from "./structured-character.js";
import type { AssetDisclosurePolicyV1 } from "./structured-assets.js";

/** Profile-only adaptation; never used as an authoritative character definition. */
export function characterV3ProfileDefinitionV2(definition: CharacterDefinitionV3): CharacterDefinitionV2 {
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
      const response = {
        statement: norm.description?.text ?? `action norm ${norm.id}`,
        fallbackActionRef: null,
      };
      if (norm.force === "constraint") {
        return { ...norm, response: { ...norm.response, ...response }, selfAwareness: "aware" };
      }
      return { ...norm, response: { ...norm.response, ...response }, selfAwareness: "aware" };
    }),
  };
}

export function projectCharacterProfileSourceV3(
  definition: CharacterDefinitionV3,
  policy: AssetDisclosurePolicyV1,
) {
  const parsed = CharacterDefinitionV3Schema.parse(definition);
  const projection = projectCharacterProfileSourceV2(characterV3ProfileDefinitionV2(parsed), policy);
  const allowed = new Set(policy.rules.filter((rule) =>
    rule.channel === "profile" && rule.target.kind === "public" && rule.prerequisites.length === 0,
  ).map((rule) => rule.valuePath));
  for (const guidance of parsed.consciousGuidance) {
    const valuePath = `consciousGuidance.${guidance.id}.statement`;
    if (allowed.has(valuePath) || allowed.has("consciousGuidance.*.statement")) {
      projection.facts.push({ supportRef: valuePath, valuePath, text: guidance.statement });
    }
  }
  return projection;
}
