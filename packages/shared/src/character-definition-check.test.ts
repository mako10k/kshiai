import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterDefinitionGapFillV2Schema,
  applyCharacterDefinitionGapFillV2,
  checkCharacterDefinitionV2,
  listCharacterDefinitionGapsV2,
  normalizeCharacterDefinitionV2,
  parseCharacterDefinitionGapFillV2,
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

  it("accepts a natural string-description fill the JSON schema can emit", () => {
    const base = legacyCharacterSheetToDefinitionV2(legacySheet());
    const rejected = CharacterDefinitionGapFillV2Schema.safeParse({
      appearanceDetails: [{
        id: "detail-cloak",
        region: "clothing",
        description: "赤い外套",
      }],
      speech: { register: "丁寧語", cadence: "短く区切る" },
      actionNorms: [{
        id: "ask-first",
        statement: "まず相手の動きを見る",
        force: "preference",
        selfAwareness: "aware",
      }],
    });
    assert.equal(rejected.success, false);

    const fill = parseCharacterDefinitionGapFillV2({
      profileBackground: [{
        id: "background-origin",
        kind: "origin",
        summary: "火を守る旅",
        description: "火を守る旅人として各地を歩く。",
        selfAwareness: "aware",
      }],
      appearanceDetails: [{
        id: "detail-cloak",
        region: "clothing",
        description: "赤い外套",
      }],
      psycheCoreNeeds: [{
        id: "need-protect",
        description: "仲間を守りたい",
        selfAwareness: "partial",
      }],
      speech: { register: "落ち着いた丁寧語", cadence: "短く区切る" },
      relationshipSeeds: [{
        id: "rel-rival",
        role: "rival",
        relationKinds: ["rival"],
        historySummary: "",
        defaultAddress: "",
        selfAwareness: "aware",
        priority: 10,
      }],
      actionNorms: [{
        id: "ask-first",
        statement: "まず相手の動きを見る",
        force: "preference",
        selfAwareness: "aware",
      }],
      expressionNotes: null,
    });
    const filled = applyCharacterDefinitionGapFillV2(
      base,
      fill,
      "upgrade_description",
    );
    assert.equal(filled.appearance.details[0]?.description.text, "赤い外套");
    assert.equal(filled.speechPolicy.register, "落ち着いた丁寧語");
    assert.equal(filled.actionNorms[0]?.response.statement, "まず相手の動きを見る");
    assert.equal(filled.actionNorms[0]?.response.disposition, "prefer");
    assert.equal(filled.relationshipSeeds[0]?.target.kind, "role");
    assert.equal(filled.profileBackground[0]?.description.consumerTags.length > 0, true);
    assert.deepEqual(
      checkCharacterDefinitionV2(filled, {
        base,
        sourceKind: "upgrade_description",
      }),
      [],
    );
  });

  it("coerces mixed or incomplete fill objects instead of demanding internals", () => {
    const fill = parseCharacterDefinitionGapFillV2({
      appearanceDetails: [{
        id: "detail-cloak",
        region: "clothing",
        description: "赤い外套",
      }],
      speechPolicy: { register: "丁寧語" },
      actionNorms: [{
        id: "duplicate",
        statement: "待つ",
        force: "constraint",
        selfAwareness: "aware",
      }, {
        id: "duplicate",
        response: { statement: "聞いてから動く" },
        force: "preference",
      }],
    });
    const base = legacyCharacterSheetToDefinitionV2(legacySheet());
    const filled = applyCharacterDefinitionGapFillV2(
      base,
      fill,
      "upgrade_description",
    );
    assert.equal(filled.appearance.details[0]?.description.text, "赤い外套");
    assert.equal(filled.speechPolicy.register, "丁寧語");
    assert.equal(filled.speechPolicy.cadence, "丁寧語");
    assert.equal(filled.actionNorms.length, 2);
    assert.notEqual(filled.actionNorms[0]?.id, filled.actionNorms[1]?.id);
    assert.equal(filled.actionNorms[0]?.response.disposition, "allow_only");
    assert.equal(filled.actionNorms[1]?.response.statement, "聞いてから動く");
  });
});
