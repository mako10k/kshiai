import { createHash } from "node:crypto";
import {
  CharacterBattleCompilerInputsV4Schema,
  CharacterDefinitionV3Schema,
  CharacterGenerationEnvelopeV3Schema,
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

/** A second original, local-only V3 fixture for a future V3-vs-V3 Stage trial. */
export function createV3StageTrialSecondCandidate(): CharacterGenerationEnvelopeV3 {
  const manualSource = {
    candidateId: "stage-trial-rio",
    displayName: "潮騒の記録士・リオ",
    tags: ["new-v3-candidate", "tide-scribe", "adaptive"],
    traits: ["変化を記録する", "機を待つ", "仲間の動きを読む"],
    narrativeBlurb: "潮の変化を読み、戦場の流れを短い記録に変えて次の一手を選ぶ。",
  };
  const source = legacyCharacterSheetToDefinitionV2({
    id: manualSource.candidateId,
    ownerUserId: "local-stage-trial-owner",
    displayName: manualSource.displayName,
    tags: manualSource.tags,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    appearance: {
      summary: "青灰の記録衣と、潮の音を刻む金属板を身につけた若い旅人。",
      visualPrompt: "an adaptive tide scribe in blue-gray travel clothes with a resonant metal tablet",
    },
    traits: manualSource.traits,
    parameters: defaultParameters({ hp: 96, maxHp: 96, mp: 44, maxMp: 44, atk: 12, def: 9, spd: 13, focus: 16 }),
    basicAttack: {
      ...defaultBasicAttack(),
      name: "潮刻の打ち込み",
      description: "金属板の反響で相手の歩幅を測り、短く打ち込む。",
      power: 0.9,
    },
    skills: [
      {
        id: "skill-tide-reversal",
        name: "返し波",
        description: "受けた勢いを読み替え、相手の隙へ返す。",
        costMp: 9,
        costStamina: 3,
        power: 1.25,
        kind: "special",
      },
      {
        id: "skill-current-note",
        name: "流れの記譜",
        description: "戦場の流れを記録し、次の判断を整える。",
        costMp: 6,
        costStamina: 0,
        power: 0.45,
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
          id: "name-rio-scribe",
          kind: "epithet",
          value: "記録士",
          description: description("潮の変化を記録し、次の機を探す役目を示す呼び名。", ["identity.names.0"]),
        },
      ],
    },
    psycheDisposition: {
      ...stable.psycheDisposition,
      dynamics: {
        adverseSensitivity: 540,
        uncertaintySensitivity: 690,
        recoverySpeed: 660,
        irritationPersistence: 220,
        anxietyPersistence: 350,
        approachTendency: 680,
        withdrawalTendency: 390,
        impulseInhibition: 610,
        expressionRestraint: 460,
      },
      coreNeeds: [
        {
          id: "need-record-the-turn",
          description: description("変化を見落とさず、次の一手に活かしたい。", ["profileBackground.0"]),
          selfAwareness: "aware",
        },
      ],
      tendencies: [
        {
          id: "tendency-follow-the-current",
          label: "流れの変化に合わせる",
          backgroundRefs: ["background-tide-notes"],
          triggerKinds: ["uncertainty", "environmental_change"],
          selfAwareness: "aware",
          tendencyDescription: description("状況が変わるほど、直前の記録を捨てずに読み替える。", ["psycheDisposition.coreNeeds.0"]),
          manifestationDescription: description("相手の同じ動きが続かなければ、待つより返し波の好機を探す。", ["psycheDisposition.tendencies.0"]),
        },
      ],
      description: description("記録を過去の固定ではなく、変化に追いつくための道具として扱う。", ["psycheDisposition.tendencies.0"]),
    },
    profileBackground: [
      ...stable.profileBackground,
      {
        id: "background-tide-notes",
        kind: "role",
        summary: "潮の観測所で、短い記録から船の進路を組み立ててきた。",
        description: description("波の高さと音を刻み、変わり目を見つけて仲間へ知らせる役目。", ["identity.displayName"]),
        selfAwareness: "aware",
      },
    ],
    actionNorms: [
      {
        id: "norm-return-the-surge",
        when: {
          match: "all",
          clauses: [
            { kind: "observed_event_kind", operator: "is", value: "situation" },
            { kind: "self_condition", operator: "is", value: "steady" },
          ],
        },
        response: {
          disposition: "prefer",
          actionRefs: ["skill-tide-reversal"],
          actionKinds: [],
          tacticTags: ["adaptive-counter", "tempo-shift"],
        },
        priority: 84,
        force: "preference",
        exceptions: [],
        description: description("戦況が動いた瞬間、落ち着きを保ったまま返し波で主導権を取りに行く。", ["psycheDisposition.tendencies.0"]),
      },
      {
        id: "norm-rewrite-the-note",
        when: {
          match: "all",
          clauses: [{ kind: "self_condition", operator: "is", value: "critical" }],
        },
        response: {
          disposition: "prefer",
          actionRefs: ["skill-current-note", basicActionId],
          actionKinds: [],
          tacticTags: ["reassess", "preserve-tempo"],
        },
        priority: 88,
        force: "commitment",
        exceptions: [],
        description: description("危機では記録を更新し、流れの記譜から立て直しを始める。", ["psycheDisposition.coreNeeds.0"]),
      },
    ],
    consciousGuidance: [
      {
        id: "guidance-learn-before-closing",
        applicability: {
          match: "all",
          clauses: [{ kind: "battle_phase", operator: "is", value: "turn" }],
        },
        statement: "決着を急ぐ前に、いま変わった流れを一つだけ読み取る。",
        priority: 72,
        force: "commitment",
        selfAwareness: "aware",
        exceptions: [],
        description: description("記録士として、勝負を終える一手にも観測の余地を残す。", ["psycheDisposition.coreNeeds.0"]),
      },
    ],
    mechanicalConflictFallbacks: [
      {
        id: "fallback-rewrite-the-note",
        applicability: {
          match: "all",
          clauses: [{ kind: "self_condition", operator: "is", value: "critical" }],
        },
        orderedActionRefs: ["skill-current-note", basicActionId],
        priority: 94,
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
  const profileProjection = projectCharacterProfileSourceV2(v3ToProfileDefinitionV2(definition), disclosurePolicy);
  const projectionDigest = digest(profileProjection);
  const sourceDigest = digest(manualSource);
  const descriptionSegments = [
    { id: "identity", text: "潮騒の記録士・リオ", kind: "fact" as const, supportRefs: ["identity.displayName"] },
    { id: "role", text: "潮の観測所で、短い記録から船の進路を組み立ててきた。", kind: "fact" as const, supportRefs: ["profileBackground.background-tide-notes"] },
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
  validateCharacterProfileClaimAssessmentV2(profileProjection, publicPresentation, publicPresentation.claimValidation);

  return CharacterGenerationEnvelopeV3Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "character", version: 3 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: "create_instruction",
      sourceDigest,
      attemptId: "local-stage-trial-rio-v3",
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

export function compileV3StageTrialSecondCandidate(candidate: CharacterDefinitionV3 = createV3StageTrialSecondCandidate().definition) {
  const profileDefinition = v3ToProfileDefinitionV2(candidate);
  const actionNorms = compileCharacterActionNormProgramV3(candidate);
  const consciousGuidance = compileCharacterConsciousGuidanceV1(candidate);
  const mechanicalConflictFallbacks = compileCharacterMechanicalConflictFallbacksV1(candidate);
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
