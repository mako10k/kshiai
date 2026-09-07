import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleCharacterAssetBindingV2Schema,
  upgradeLegacyBattleCharacterBindingV1,
} from "./battle.js";
import {
  CharacterSheetSchema,
  defaultBasicAttack,
  defaultParameters,
  requireCombatReadyCharacterSheet,
} from "./character.js";

function legacySheet() {
  return CharacterSheetSchema.parse({
    id: "legacy-character",
    ownerUserId: "owner",
    displayName: "旧式",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    appearance: { summary: "旧式", visualPrompt: "旧式" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "旧形式のキャラクター。",
  });
}

describe("battle character asset bindings", () => {
  it("rejects missing basicAttack at the current battle boundary", () => {
    assert.throws(
      () => requireCombatReadyCharacterSheet(legacySheet()),
      /basicAttack/,
    );
  });

  it("labels a version-one compatibility default with its source generation", () => {
    const upgraded = upgradeLegacyBattleCharacterBindingV1({
      assetId: "legacy-character",
      generationId: "legacy-generation",
      contentDigest: "0".repeat(64),
      snapshot: legacySheet(),
    });
    assert.equal(upgraded.snapshot.basicAttack.name, "基本アクション");
    assert.deepEqual(upgraded.basicAttackSource, {
      kind: "legacy_default",
      generationId: "legacy-generation",
      sourceManifestVersion: 1,
    });
  });

  it("requires the basic-action receipt to match the bound generation", () => {
    const snapshot = requireCombatReadyCharacterSheet({
      ...legacySheet(),
      basicAttack: defaultBasicAttack(),
    });
    assert.throws(
      () => BattleCharacterAssetBindingV2Schema.parse({
        assetId: snapshot.id,
        generationId: "generation-a",
        contentDigest: "0".repeat(64),
        snapshot,
        basicAttackSource: {
          kind: "character_generation_v2",
          generationId: "generation-b",
          definitionPath: "capabilities.basicAction",
        },
      }),
      /must match the bound character generation/,
    );
  });
});
