import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterDefinitionV2Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  defaultCharacterDisclosurePolicyV2,
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterConsciousSelfV2,
  projectCharacterCounterpartRelationV2,
  projectCharacterDeepPsycheV2,
  projectCharacterImageBriefV2,
  projectCharacterNarratorViewsV2,
  projectCharacterProfileSourceV2,
  validateCharacterProfileClaimAssessmentV2,
  type CharacterDefinitionV2,
  type CharacterSheet,
} from "./index.js";

function legacySheet(): CharacterSheet {
  return {
    id: "character-a",
    ownerUserId: "owner-a",
    displayName: "灯",
    identity: {
      realName: "灯",
      nicknames: ["火守"],
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
    parameters: defaultParameters(),
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

function richDefinition(): CharacterDefinitionV2 {
  const definition = legacyCharacterSheetToDefinitionV2(legacySheet());
  return CharacterDefinitionV2Schema.parse({
    ...definition,
    profileBackground: [{
      id: "background-rescue",
      kind: "formative_event",
      summary: "救助された経験",
      description: {
        text: "かつて危機から救われた経験が、仲間を見捨てない姿勢の背景にある。",
        consumerTags: ["profile-generator", "deep-psyche", "conscious-action"],
        sourceSupportRefs: ["source-1"],
      },
      selfAwareness: "aware",
    }],
    psycheDisposition: {
      ...definition.psycheDisposition,
      dynamics: {
        ...definition.psycheDisposition.dynamics,
        adverseSensitivity: 723,
      },
      tendencies: [{
        id: "tendency-freeze",
        label: "賞賛への戸惑い",
        backgroundRefs: ["background-rescue"],
        triggerKinds: ["recognition"],
        selfAwareness: "unaware",
        tendencyDescription: {
          text: "褒められると一拍だけ反応が遅れる。",
          consumerTags: ["profile-generator", "deep-psyche"],
          sourceSupportRefs: ["source-2"],
        },
        manifestationDescription: {
          text: "褒め言葉の直後に視線がわずかに泳ぐ。",
          consumerTags: ["profile-generator", "deep-psyche", "narrator-external"],
          sourceSupportRefs: ["source-2"],
        },
      }],
    },
    relationshipSeeds: [{
      id: "relation-x",
      target: { kind: "character", characterAssetId: "character-x" },
      relationKinds: ["rival"],
      historySummary: {
        text: "一度だけ共闘した競争相手。",
        consumerTags: ["deep-psyche", "conscious-action"],
        sourceSupportRefs: ["source-3"],
      },
      defaultAddress: "先輩",
      selfAwareness: "aware",
      dynamics: { trust: 100, affiliation: 50, fear: 0, competition: 700 },
      priority: 80,
    }],
  });
}

describe("CharacterDefinitionV2 projections", () => {
  it("keeps restricted dynamics out of public and private descriptive projections", () => {
    const definition = richDefinition();
    const policy = defaultCharacterDisclosurePolicyV2(definition);
    policy.rules.push({
      valuePath: "profileBackground.*.description",
      channel: "profile",
      target: { kind: "public" },
      prerequisites: [],
    });
    const profile = projectCharacterProfileSourceV2(definition, policy);
    const deep = projectCharacterDeepPsycheV2(definition);
    assert.ok(profile.facts.some((fact) => fact.text.includes("救われた")));
    assert.ok(profile.facts.some((fact) => fact.text.includes("褒められる")));
    assert.equal(JSON.stringify(profile).includes("723"), false);
    assert.equal(JSON.stringify(deep).includes("723"), false);
    assert.equal(JSON.stringify(profile).includes("triggerKinds"), false);
  });

  it("applies self-awareness independently from profile publication", () => {
    const self = projectCharacterConsciousSelfV2(richDefinition());
    assert.ok(self.background.some((text) => text.includes("救われた")));
    assert.equal(self.tendencies.some((text) => text.includes("褒められる")), false);
  });

  it("compiles distinct external, self-inner, and omniscient narrator views", () => {
    const source = richDefinition();
    const definition = CharacterDefinitionV2Schema.parse({
      ...source,
      profileBackground: source.profileBackground.map((entry) => ({
        ...entry,
        description: {
          ...entry.description,
          consumerTags: [
            ...entry.description.consumerTags,
            "narrator-self-inner",
            "narrator-omniscient",
          ],
        },
      })),
      psycheDisposition: {
        ...source.psycheDisposition,
        tendencies: source.psycheDisposition.tendencies.map((tendency) => ({
          ...tendency,
          tendencyDescription: {
            ...tendency.tendencyDescription,
            consumerTags: [
              ...tendency.tendencyDescription.consumerTags,
              "narrator-self-inner",
              "narrator-omniscient",
            ],
          },
          manifestationDescription: {
            ...tendency.manifestationDescription,
            consumerTags: [
              ...tendency.manifestationDescription.consumerTags,
              "narrator-self-inner",
              "narrator-omniscient",
            ],
          },
        })),
      },
    });
    const projected = projectCharacterNarratorViewsV2(
      definition,
      defaultCharacterDisclosurePolicyV2(definition),
    );
    assert.deepEqual(projected.external.appearance, ["赤い外套をまとう"]);
    assert.deepEqual(projected.external.innerBackground, []);
    assert.deepEqual(projected.external.innerDisposition, []);
    assert.ok(projected.selfInner.innerBackground.some((text) =>
      text.includes("救われた")
    ));
    assert.equal(projected.selfInner.innerDisposition.some((text) =>
      text.includes("褒められる")
    ), false);
    assert.ok(projected.omniscient.innerDisposition.some((text) =>
      text.includes("褒められる")
    ));
    assert.equal(JSON.stringify(projected).includes("723"), false);
    assert.equal(JSON.stringify(projected).includes("triggerKinds"), false);
  });

  it("builds an appearance-only image brief", () => {
    const source = richDefinition();
    const definition = CharacterDefinitionV2Schema.parse({
      ...source,
      appearance: {
        ...source.appearance,
        details: [{
          id: "appearance-eyes",
          region: "face",
          description: {
            text: "琥珀色の瞳",
            consumerTags: ["character-image"],
            sourceSupportRefs: ["source-image"],
          },
        }],
      },
    });
    const brief = projectCharacterImageBriefV2(definition);
    assert.equal(brief.publicSummary, "赤い外套をまとう");
    assert.deepEqual(brief.details, ["琥珀色の瞳"]);
    assert.equal(brief.visualPrompt, "red cloak");
    const serialized = JSON.stringify(brief);
    assert.equal(serialized.includes("救われた"), false);
    assert.equal(serialized.includes("火花"), false);
    assert.equal(serialized.includes("relation-x"), false);
    assert.equal(serialized.includes("723"), false);
  });

  it("reveals an exact relationship only to its authorized learned target", () => {
    const definition = richDefinition();
    const policy = defaultCharacterDisclosurePolicyV2(definition);
    policy.rules.push({
      valuePath: "relationshipSeeds.relation-x",
      channel: "counterpart",
      target: { kind: "character", characterAssetId: "character-x" },
      prerequisites: ["learned"],
    });
    const x = projectCharacterCounterpartRelationV2({
      definition,
      policy,
      counterpartCharacterId: "character-x",
      evidence: ["learned"],
    });
    const y = projectCharacterCounterpartRelationV2({
      definition,
      policy,
      counterpartCharacterId: "character-y",
      evidence: ["learned"],
    });
    assert.equal(x.relationships[0]?.defaultAddress, "先輩");
    assert.deepEqual(y.relationships, []);
  });

  it("rejects dangling references and duplicate stable IDs", () => {
    const definition = richDefinition();
    assert.equal(CharacterDefinitionV2Schema.safeParse({
      ...definition,
      initialLoadout: [{ itemId: "missing", quantity: 1, placement: "held" }],
    }).success, false);
    assert.equal(CharacterDefinitionV2Schema.safeParse({
      ...definition,
      identity: {
        ...definition.identity,
        names: [definition.identity.names[0], definition.identity.names[0]],
      },
    }).success, false);
  });

  it("fails closed when the independent validator rejects a material claim", () => {
    const definition = richDefinition();
    const projection = projectCharacterProfileSourceV2(
      definition,
      defaultCharacterDisclosurePolicyV2(definition),
    );
    const projectionDigest = "a".repeat(64);
    const presentation = {
      description: "灯は王都を救った英雄だ。",
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest: "b".repeat(64),
      segments: [{
        id: "invented-history",
        text: "灯は王都を救った英雄だ。",
        kind: "fact" as const,
        supportRefs: ["identity.displayName"],
      }],
    };
    assert.throws(
      () => validateCharacterProfileClaimAssessmentV2(
        projection,
        presentation,
        {
          contractVersion: 1,
          validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
          projectionDigest,
          segments: [{
            segmentId: "invented-history",
            verdict: "unsupported",
            supportRefs: [],
            riskCodes: ["history_event"],
          }],
        },
      ),
      /PROFILE_UNSUPPORTED_CLAIM:invented-history/,
    );
  });

  it("stores a complete claim receipt only for allowed support references", () => {
    const definition = richDefinition();
    const projection = projectCharacterProfileSourceV2(
      definition,
      defaultCharacterDisclosurePolicyV2(definition),
    );
    const projectionDigest = "c".repeat(64);
    const presentation = {
      description: "灯。赤い外套をまとう。",
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest: "d".repeat(64),
      segments: [{
        id: "supported-appearance",
        text: "灯。赤い外套をまとう。",
        kind: "fact" as const,
        supportRefs: ["identity.displayName", "appearance.publicSummary"],
      }],
    };
    const validated = validateCharacterProfileClaimAssessmentV2(
      projection,
      presentation,
      {
        contractVersion: 1,
        validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
        projectionDigest,
        segments: [{
          segmentId: "supported-appearance",
          verdict: "supported",
          supportRefs: ["identity.displayName", "appearance.publicSummary"],
          riskCodes: [],
        }],
      },
    );
    assert.equal(
      validated.claimValidation?.segments[0]?.verdict,
      "supported",
    );
    assert.throws(
      () => validateCharacterProfileClaimAssessmentV2(
        projection,
        presentation,
        {
          contractVersion: 1,
          validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
          projectionDigest,
          segments: [{
            segmentId: "supported-appearance",
            verdict: "supported",
            supportRefs: ["psycheDisposition.dynamics.adverseSensitivity"],
            riskCodes: [],
          }],
        },
      ),
      /PROFILE_CLAIM_UNKNOWN_SUPPORT/,
    );
    assert.throws(
      () => validateCharacterProfileClaimAssessmentV2(
        projection,
        {
          ...presentation,
          description: `${presentation.description}\n未分節の追加情報`,
        },
        validated.claimValidation!,
      ),
      /PROFILE_DESCRIPTION_SEGMENT_MISMATCH/,
    );
  });
});
