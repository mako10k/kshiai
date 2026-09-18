import { createHash } from "node:crypto";
import {
  CharacterDefinitionV3Schema,
  CharacterGenerationEnvelopeV3Schema,
  CharacterBattleCompilerInputsV4Schema,
  compileCharacterActionNormProgramV3,
  compileCharacterConsciousGuidanceV1,
  compileCharacterMechanicalConflictFallbacksV1,
  legacyCharacterSheetToDefinitionV2,
  type CharacterDefinitionV3,
  type CharacterGenerationEnvelopeV3,
} from "./index.js";
import { defaultBasicAttack, defaultParameters } from "./character.js";
import {
  projectCharacterConsciousSelfV2,
  projectCharacterProfileSourceV2,
  validateCharacterProfileClaimAssessmentV2,
  type CharacterDefinitionV2,
} from "./structured-character.js";

const description = (text: string, sourceSupportRefs: string[]) => ({
  text,
  consumerTags: ["profile-generator" as const, "battle-mechanics" as const],
  sourceSupportRefs,
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function v3ToProfileDefinitionV2(definition: CharacterDefinitionV3): CharacterDefinitionV2 {
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
    actionNorms: actionNorms.map((norm) => ({
      ...norm,
      response: {
        ...norm.response,
        statement: norm.description?.text ?? `action norm ${norm.id}`,
        fallbackActionRef: null,
      },
      selfAwareness: "aware" as const,
    })),
  };
}

/**
 * A new, local-only V3 candidate for a future Stage trial.
 *
 * This is deliberately not registered, activated, persisted, or sent to a
 * provider.  The export is a deterministic fixture for schema/compiler tests.
 */
export function createV3StageTrialCandidate(): CharacterGenerationEnvelopeV3 {
  const manualSource = {
    candidateId: "stage-trial-neva",
    displayName: "夜航の灯守・ネヴァ",
    tags: ["new-v3-candidate", "lantern-keeper", "observant"],
    traits: ["静かな観察者", "危機では大胆", "約束を守る"],
    narrativeBlurb: "夜道の灯を絶やさず、相手の焦りが見えるまで歩みを止めない。",
  };
  const source = legacyCharacterSheetToDefinitionV2({
    id: manualSource.candidateId,
    ownerUserId: "local-stage-trial-owner",
    displayName: manualSource.displayName,
    tags: manualSource.tags,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    appearance: {
      summary: "濃紺の外套と、風を含んだ小さな灯籠を携えた旅人。",
      visualPrompt: "a solitary lantern keeper in a navy travel cloak at night",
    },
    traits: manualSource.traits,
    parameters: defaultParameters({ hp: 108, maxHp: 108, mp: 36, maxMp: 36, atk: 11, def: 12, spd: 9, focus: 15 }),
    basicAttack: {
      ...defaultBasicAttack(),
      name: "灯杖の一閃",
      description: "灯杖を低く払って相手の間合いを測る一撃。",
      power: 0.8,
    },
    skills: [
      {
        id: "skill-lantern-feint",
        name: "灯影の誘い",
        description: "灯りを一瞬だけずらし、相手の視線を外してから打ち込む。",
        costMp: 8,
        costStamina: 4,
        power: 1.15,
        kind: "special",
      },
      {
        id: "skill-wick-guard",
        name: "芯火の守り",
        description: "芯火を安定させ、次の攻防に備える。",
        costMp: 5,
        costStamina: 0,
        power: 0.5,
        kind: "defend",
      },
    ],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: manualSource.narrativeBlurb,
  });
  const { schemaVersion: _schemaVersion, actionNorms: _legacyNorms, ...stable } = source;
  const basicActionId = stable.capabilities.basicAction.id;

  const definition = CharacterDefinitionV3Schema.parse({
    ...stable,
    schemaVersion: 3,
    identity: {
      ...stable.identity,
      names: [
        ...stable.identity.names,
        {
          id: "name-neva-keeper",
          kind: "epithet",
          value: "灯守",
          description: description("夜の航路を守る役目を自ら名乗る呼び名。", ["identity.names.0"]),
        },
      ],
    },
    psycheDisposition: {
      ...stable.psycheDisposition,
      dynamics: {
        adverseSensitivity: 620,
        uncertaintySensitivity: 760,
        recoverySpeed: 420,
        irritationPersistence: 280,
        anxietyPersistence: 460,
        approachTendency: 540,
        withdrawalTendency: 630,
        impulseInhibition: 780,
        expressionRestraint: 700,
      },
      coreNeeds: [
        {
          id: "need-keep-the-light",
          description: description("混乱の中でも、誰かが帰れる目印を残したい。", ["profileBackground.0"]),
          selfAwareness: "aware",
        },
      ],
      tendencies: [
        {
          id: "tendency-measure-first",
          label: "一度測ってから踏み込む",
          backgroundRefs: ["background-night-route"],
          triggerKinds: ["uncertainty", "threat"],
          selfAwareness: "aware",
          tendencyDescription: description("不確かな攻勢にはすぐ反応せず、相手の癖を測る。", ["psycheDisposition.coreNeeds.0"]),
          manifestationDescription: description("最初の一手では距離を保ち、相手の動きが読めた瞬間だけ踏み込む。", ["psycheDisposition.tendencies.0"]),
        },
      ],
      description: description("静けさを臆病さではなく、灯を守るための間として扱う。", ["psycheDisposition.tendencies.0"]),
    },
    profileBackground: [
      ...stable.profileBackground,
      {
        id: "background-night-route",
        kind: "role",
        summary: "夜航路の灯守として、迷う旅人に目印を残してきた。",
        description: description("嵐の夜ほど灯を高く掲げ、帰路を失う者を待つ役目。", ["identity.displayName"]),
        selfAwareness: "aware",
      },
    ],
    actionNorms: [
      {
        id: "norm-read-the-current",
        when: {
          match: "any",
          clauses: [
            { kind: "counterpart_condition", operator: "is", value: "strained" },
            { kind: "observed_event_kind", operator: "is", value: "damage" },
          ],
        },
        response: {
          disposition: "prefer",
          actionRefs: ["skill-lantern-feint"],
          actionKinds: [],
          tacticTags: ["measured-counter", "precision"],
        },
        priority: 76,
        force: "preference",
        exceptions: [],
        description: description("相手の流れが乱れたら、灯影の誘いで主導権を取り返す。", ["psycheDisposition.tendencies.0"]),
      },
      {
        id: "norm-protect-the-wick",
        when: {
          match: "all",
          clauses: [{ kind: "self_condition", operator: "is", value: "critical" }],
        },
        response: {
          disposition: "prefer",
          actionRefs: ["skill-wick-guard", basicActionId],
          actionKinds: [],
          tacticTags: ["preserve-light"],
        },
        priority: 92,
        force: "commitment",
        exceptions: [],
        description: description("灯を失いそうなときは、攻め急がず芯火の守りを優先する。", ["psycheDisposition.coreNeeds.0"]),
      },
    ],
    consciousGuidance: [
      {
        id: "guidance-leave-a-way-home",
        applicability: {
          match: "all",
          clauses: [{ kind: "battle_phase", operator: "is", value: "turn" }],
        },
        statement: "勝つために相手を追い詰めても、帰る余地まで消さない。",
        priority: 68,
        force: "commitment",
        selfAwareness: "aware",
        exceptions: [],
        description: description("灯守として、勝敗と退路を同時に考える。", ["psycheDisposition.coreNeeds.0"]),
      },
    ],
    mechanicalConflictFallbacks: [
      {
        id: "fallback-keep-the-wick",
        applicability: {
          match: "all",
          clauses: [{ kind: "self_condition", operator: "is", value: "critical" }],
        },
        orderedActionRefs: ["skill-wick-guard", basicActionId],
        priority: 96,
        receiptContract: "character-mechanical-conflict-receipt-v1",
      },
    ],
  });

  const disclosurePolicy = {
    version: 1 as const,
    rules: [
      { valuePath: "identity.displayName", channel: "profile" as const, target: { kind: "public" as const }, prerequisites: ["identified" as const] },
      { valuePath: "profileBackground.*.description", channel: "profile" as const, target: { kind: "public" as const }, prerequisites: ["identified" as const] },
      { valuePath: "psycheDisposition.tendencies.*.manifestationDescription", channel: "narrator" as const, target: { kind: "narrator" as const, perspective: "external" as const }, prerequisites: ["observed" as const] },
    ],
  };
  const profileProjection = projectCharacterProfileSourceV2(
    v3ToProfileDefinitionV2(definition),
    disclosurePolicy,
  );
  const projectionDigest = digest(profileProjection);
  const sourceDigest = digest(manualSource);
  const descriptionSegments = [
    { id: "identity", text: "夜航の灯守・ネヴァ", kind: "fact" as const, supportRefs: ["identity.displayName"] },
    { id: "role", text: "夜航路の灯守として、迷う旅人に目印を残してきた。", kind: "fact" as const, supportRefs: ["profileBackground.background-night-route"] },
  ];
  const publicDescription = descriptionSegments.map((segment) => segment.text).join("\n\n");
  const publicPresentation = {
    description: publicDescription,
    projectionContractVersion: 2,
    projectionDigest,
    descriptionInputDigest: digest({ sourceDigest, projectionDigest }),
    segments: descriptionSegments,
    claimValidation: {
      contractVersion: 1 as const,
      validatorContract: "character-profile-claim-validator-v1",
      projectionDigest,
      segments: descriptionSegments.map((segment) => ({
        segmentId: segment.id,
        verdict: "supported" as const,
        supportRefs: segment.supportRefs,
        riskCodes: [],
      })),
    },
  };
  validateCharacterProfileClaimAssessmentV2(
    profileProjection,
    publicPresentation,
    publicPresentation.claimValidation,
  );

  return CharacterGenerationEnvelopeV3Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "character", version: 3 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: "create_instruction",
      sourceDigest,
      attemptId: "local-stage-trial-neva-v3",
      structureGeneratorContract: "local-manual-v3-candidate-2026-09-18",
      descriptionGeneratorContract: "local-manual-public-presentation-2026-09-18",
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

export function compileV3StageTrialCandidate(candidate: CharacterDefinitionV3 =
  createV3StageTrialCandidate().definition) {
  const profileDefinition = v3ToProfileDefinitionV2(candidate);
  const actionNorms = compileCharacterActionNormProgramV3(candidate);
  const consciousGuidance = compileCharacterConsciousGuidanceV1(candidate);
  const mechanicalConflictFallbacks =
    compileCharacterMechanicalConflictFallbacksV1(candidate);
  return {
    actionNorms,
    consciousGuidance,
    mechanicalConflictFallbacks,
    compilerInputsV4: CharacterBattleCompilerInputsV4Schema.parse({
      psycheTraits: profileDefinition.psycheDisposition.dynamics,
      consciousSelf: projectCharacterConsciousSelfV2(profileDefinition),
      actionNorms,
      consciousGuidance,
      mechanicalConflictFallbacks,
    }),
  };
}
