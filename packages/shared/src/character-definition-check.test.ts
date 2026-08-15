import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCharacterDefinitionGapFillV2,
  checkCharacterDefinitionV2,
  listCharacterDefinitionGapsV2,
  normalizeCharacterDefinitionV2,
  restoreAuthoritativeCharacterDefinitionV2,
} from "./character-definition-check.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import {
  CharacterDefinitionV2Schema,
  legacyCharacterSheetToDefinitionV2,
} from "./structured-character.js";

function legacySheet(): CharacterSheet {
  return {
    id: "character-a",
    ownerUserId: "owner-a",
    displayName: "灯",
    identity: {
      realName: "灯",
      nicknames: [],
      selfNames: ["私"],
      epithets: [],
      gender: "女性",
      age: "成人",
    },
    tags: ["慎重"],
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    appearance: { summary: "赤い外套をまとう", visualPrompt: "red cloak" },
    traits: ["危機では仲間を優先する"],
    parameters: defaultParameters({ atk: 12 }),
    skills: [{
      id: "skill-flare",
      name: "火花",
      description: "目の前へ火花を走らせる",
      costMp: 4,
      costStamina: 0,
      power: 1,
      kind: "magic",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "火を守る旅人。",
  };
}

describe("character definition upgrade checks", () => {
  it("lists empty structured sections on a legacy conversion", () => {
    const definition = legacyCharacterSheetToDefinitionV2(legacySheet());
    assert.deepEqual(listCharacterDefinitionGapsV2(definition), [
      "profileBackground",
      "appearanceDetails",
      "psycheCoreNeeds",
      "speechPolicy",
      "relationshipSeeds",
      "actionNorms",
    ]);
  });

  it("fills only upgrade gaps and drops exact character targets", () => {
    const base = legacyCharacterSheetToDefinitionV2(legacySheet());
    const filled = applyCharacterDefinitionGapFillV2(base, {
      profileBackground: [{
        id: "background-origin",
        kind: "origin",
        summary: "火を守る旅",
        description: {
          text: "火を守る旅人として各地を歩く。",
          consumerTags: ["profile-generator"],
          sourceSupportRefs: [],
        },
        selfAwareness: "aware",
      }],
      speechPolicy: {
        register: "落ち着いた丁寧語",
        cadence: "短く区切る",
      },
      relationshipSeeds: [{
        id: "rel-invented",
        target: { kind: "character", characterAssetId: "chr_someone" },
        relationKinds: ["rival"],
        historySummary: null,
        defaultAddress: null,
        selfAwareness: "aware",
        dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 200 },
        priority: 10,
      }, {
        id: "rel-role",
        target: { kind: "role", role: "rival" },
        relationKinds: ["rival"],
        historySummary: null,
        defaultAddress: null,
        selfAwareness: "aware",
        dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 200 },
        priority: 10,
      }],
    }, "upgrade_description");

    assert.equal(filled.profileBackground[0]?.id, "background-origin");
    assert.equal(filled.speechPolicy.register, "落ち着いた丁寧語");
    assert.deepEqual(
      filled.relationshipSeeds.map((seed) => seed.id),
      ["rel-role"],
    );
    assert.equal(filled.combat.parameters.atk, 12);
  });

  it("restores combat and identity when an upgrade candidate drifts", () => {
    const base = legacyCharacterSheetToDefinitionV2(legacySheet());
    const drifted = CharacterDefinitionV2Schema.parse({
      ...base,
      identity: { ...base.identity, displayName: "別人" },
      combat: {
        ...base.combat,
        parameters: { ...base.combat.parameters, atk: 99 },
      },
    });
    const restored = restoreAuthoritativeCharacterDefinitionV2(
      base,
      drifted,
      "upgrade_description",
    );
    assert.equal(restored.identity.displayName, "灯");
    assert.equal(restored.combat.parameters.atk, 12);
    assert.deepEqual(
      checkCharacterDefinitionV2(restored, {
        base,
        sourceKind: "upgrade_description",
      }),
      [],
    );
  });

  it("normalizes a review fill without changing preserved mechanics", () => {
    const base = legacyCharacterSheetToDefinitionV2(legacySheet());
    const result = normalizeCharacterDefinitionV2({
      base,
      candidate: base,
      sourceKind: "upgrade_description",
      fill: {
        appearanceDetails: [{
          id: "detail-cloak",
          region: "clothing",
          description: {
            text: "赤い外套",
            consumerTags: ["character-image"],
            sourceSupportRefs: [],
          },
        }],
      },
    });
    assert.equal(result.findings.length, 0);
    assert.equal(result.definition.appearance.details[0]?.id, "detail-cloak");
    assert.equal(result.definition.combat.parameters.atk, 12);
    assert.equal(result.definition.capabilities.skills[0]?.name, "火花");
  });
});
