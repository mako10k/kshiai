import {
  CHARACTER_FOCUS_POLICY_V1,
  CHARACTER_FOCUS_V1_FIXTURES,
  advanceCharacterFocusV1,
  type CharacterAttentionEffectivenessV1,
  type CharacterFocusFixtureV1,
  type CharacterFocusPacketV1,
  type CharacterSelfProfileAnchor,
  type ServerOnlyReserveCue,
} from "@kshiai/shared";
import { CHARACTER_EXPRESSION_COMPACT_SYSTEM_PROMPT } from "./character-expression-prompt.js";
import type { CharacterExpressionCompactInput } from "./types.js";

export const CHARACTER_FOCUS_ABLATION_INPUT_REVISION =
  "character-focus-expression-ablation-v1";
export const CHARACTER_FOCUS_ABLATION_RANDOMIZATION_SEED =
  "kshiai-character-focus-replay-2026-08-13-v1";

export const CHARACTER_FOCUS_FOREGROUND_SYSTEM_PROMPT_V1 =
  `${CHARACTER_EXPRESSION_COMPACT_SYSTEM_PROMPT}

characterFocus, when present, is the ID-free foreground selected from already allowed observer-relative evidence for this expression. Place its primary perceived change ahead of the broad context when choosing what the line materially responds to; a secondary change is optional support. The broad compact input remains authoritative for identity, safety, and contradiction checks. A null primary supplies no new event and must not be replaced with an invented development. effectiveness describes evidence-selection capacity only: never lower Japanese fluency, naturalness, character consistency, or dignity because it is strained. Do not name the packet, its bands, or its transition in public wording.`;

export type CharacterFocusAblationArm = "A" | "B" | "C" | "D";
export type CharacterFocusAblationProfileId = "nagi" | "hibana" | "tomori";

export type CharacterFocusAblationScenario = {
  fixtureId: string;
  scenarioCode: string;
  profileId: CharacterFocusAblationProfileId;
  replayEffectiveness: CharacterAttentionEffectivenessV1;
  freshEvidenceEligible: boolean;
  semanticResponseEligible: boolean;
  noChangeRestraintEligible: boolean;
  cueClass: "weak" | "strong" | "none";
};

export type CharacterFocusAblationRequest = {
  outputId: string;
  scenarioCode: string;
  fixtureId: string;
  profileId: CharacterFocusAblationProfileId;
  arm: CharacterFocusAblationArm;
  sample: 1 | 2 | 3;
  replayEffectiveness: CharacterAttentionEffectivenessV1;
  cueClass: CharacterFocusAblationScenario["cueClass"];
  freshEvidenceEligible: boolean;
  semanticResponseEligible: boolean;
  noChangeRestraintEligible: boolean;
  system: string;
  user: string;
  focusPacket: CharacterFocusPacketV1 | null;
};

export const CHARACTER_FOCUS_ABLATION_SCENARIOS:
  readonly CharacterFocusAblationScenario[] = [
    {
      fixtureId: "subtle-counterpart-gesture",
      scenarioCode: "S01",
      profileId: "nagi",
      replayEffectiveness: "strained",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "weak",
    },
    {
      fixtureId: "direct-counterpart-reply",
      scenarioCode: "S02",
      profileId: "hibana",
      replayEffectiveness: "strained",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "strong",
    },
    {
      fixtureId: "fresh-self-result",
      scenarioCode: "S03",
      profileId: "tomori",
      replayEffectiveness: "sharp",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "weak",
    },
    {
      fixtureId: "fresh-counterpart-result",
      scenarioCode: "S04",
      profileId: "nagi",
      replayEffectiveness: "strained",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "strong",
    },
    {
      fixtureId: "ambient-microchange",
      scenarioCode: "S05",
      profileId: "hibana",
      replayEffectiveness: "sharp",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "weak",
    },
    {
      fixtureId: "strong-ambient-interruption",
      scenarioCode: "S06",
      profileId: "tomori",
      replayEffectiveness: "strained",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "strong",
    },
    {
      fixtureId: "no-new-evidence",
      scenarioCode: "S07",
      profileId: "nagi",
      replayEffectiveness: "strained",
      freshEvidenceEligible: false,
      semanticResponseEligible: false,
      noChangeRestraintEligible: true,
      cueClass: "none",
    },
    {
      fixtureId: "repeated-self-utterance-only",
      scenarioCode: "S08",
      profileId: "hibana",
      replayEffectiveness: "sharp",
      freshEvidenceEligible: false,
      semanticResponseEligible: false,
      noChangeRestraintEligible: true,
      cueClass: "none",
    },
    {
      fixtureId: "counterpart-responds-to-repeat",
      scenarioCode: "S09",
      profileId: "tomori",
      replayEffectiveness: "sharp",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "strong",
    },
    {
      fixtureId: "competing-weak-and-strong-cues",
      scenarioCode: "S10",
      profileId: "nagi",
      replayEffectiveness: "sharp",
      freshEvidenceEligible: true,
      semanticResponseEligible: true,
      noChangeRestraintEligible: false,
      cueClass: "strong",
    },
    {
      fixtureId: "deliberate-protective-hold",
      scenarioCode: "S11",
      profileId: "hibana",
      replayEffectiveness: "strained",
      freshEvidenceEligible: false,
      semanticResponseEligible: false,
      noChangeRestraintEligible: true,
      cueClass: "none",
    },
    {
      fixtureId: "hidden-canonical-change",
      scenarioCode: "S12",
      profileId: "tomori",
      replayEffectiveness: "sharp",
      freshEvidenceEligible: false,
      semanticResponseEligible: false,
      noChangeRestraintEligible: true,
      cueClass: "none",
    },
  ] as const;

export const CHARACTER_FOCUS_ABLATION_PROFILES: Readonly<
  Record<CharacterFocusAblationProfileId, CharacterSelfProfileAnchor>
> = {
  nagi: {
    schemaVersion: 1,
    displayName: "凪",
    identity: {
      realName: null,
      nicknames: [],
      selfNames: ["私"],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["観察者", "慎重"],
    appearanceSummary: "薄青い外套をまとい、静かに周囲を観察する旅人。",
    traits: ["慎重", "相手を急かさない", "小さな変化を言葉に映す"],
    narrativeBlurb: "静かな観察から相手との距離を測る。",
    basicAction: { name: "見定める", description: "様子を見ながら間合いを整える。" },
    skills: [],
    equipment: { weapon: null, armor: null },
  },
  hibana: {
    schemaVersion: 1,
    displayName: "火花",
    identity: {
      realName: null,
      nicknames: [],
      selfNames: ["あたし"],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["直情", "誇り高い"],
    appearanceSummary: "赤い手袋を締め、真正面から相手を見る挑戦者。",
    traits: ["率直", "誇り高い", "回りくどさを嫌う"],
    narrativeBlurb: "短い言葉で相手の覚悟を問い返す。",
    basicAction: { name: "踏み込む", description: "迷わず一歩だけ距離を詰める。" },
    skills: [],
    equipment: { weapon: null, armor: null },
  },
  tomori: {
    schemaVersion: 1,
    displayName: "灯",
    identity: {
      realName: null,
      nicknames: [],
      selfNames: ["僕"],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["共感", "芯が強い"],
    appearanceSummary: "小さなランタンを携え、相手の様子を気遣う案内人。",
    traits: ["穏やか", "共感的", "譲れない一線では静かに言い切る"],
    narrativeBlurb: "相手を傷つけずに、応酬を先へ進めようとする。",
    basicAction: { name: "照らす", description: "足元と相手の進路を照らす。" },
    skills: [],
    equipment: { weapon: null, armor: null },
  },
};

function focusCueFor(
  effectiveness: CharacterAttentionEffectivenessV1,
): ServerOnlyReserveCue {
  return {
    side: "a",
    targetEntityId: "character.a",
    parameterKey: "focus",
    absoluteBand: effectiveness === "sharp" ? "full" : "taxed",
    relativeBand: effectiveness === "strained"
      ? "low"
      : effectiveness === "sharp" ? "full" : "ready",
  };
}

function fixtureById(id: string): CharacterFocusFixtureV1 {
  const fixture = CHARACTER_FOCUS_V1_FIXTURES.find((item) => item.id === id);
  if (!fixture) throw new Error(`Unknown character-focus fixture: ${id}`);
  return fixture;
}

function focusPacketFor(
  arm: CharacterFocusAblationArm,
  fixture: CharacterFocusFixtureV1,
  effectiveness: CharacterAttentionEffectivenessV1,
): CharacterFocusPacketV1 | null {
  if (arm === "A") return null;
  const persistent = arm === "C" || arm === "D";
  const effectiveBand = arm === "D" ? effectiveness : "steady";
  return advanceCharacterFocusV1({
    observerSide: "a",
    turn: fixture.packet.turn,
    packet: fixture.packet,
    retainedPackets: persistent ? fixture.retainedPackets : [],
    conversation: fixture.conversation,
    prior: persistent ? fixture.prior : undefined,
    protectiveHold: persistent ? fixture.protectiveHold : false,
    focusCue: focusCueFor(effectiveBand),
  }).packet;
}

function continuityFor(fixture: CharacterFocusFixtureV1):
  "advance" | "reframe" | "reiterate" {
  if (fixture.id === "repeated-self-utterance-only") return "reframe";
  if (
    fixture.id === "no-new-evidence" ||
    fixture.id === "deliberate-protective-hold" ||
    fixture.id === "hidden-canonical-change"
  ) return "reiterate";
  return "advance";
}

function compactInputFor(
  scenario: CharacterFocusAblationScenario,
  fixture: CharacterFocusFixtureV1,
): CharacterExpressionCompactInput {
  const character = CHARACTER_FOCUS_ABLATION_PROFILES[scenario.profileId];
  const continuityDecision = continuityFor(fixture);
  const hasFreshEvidence = scenario.freshEvidenceEligible;
  return {
    contextMode: "compact",
    phase: "turn",
    character,
    psyche: {
      emotion: scenario.profileId === "hibana"
        ? "張りつめた自信"
        : scenario.profileId === "tomori" ? "静かな気遣い" : "澄んだ警戒",
      speechStyle: scenario.profileId === "hibana"
        ? "一文で短く言い切り、飾りすぎない。"
        : scenario.profileId === "tomori"
          ? "穏やかで簡潔。相手を決めつけず、譲れない点は静かに示す。"
          : "短く静かに話し、目の前の具体を比喩にしても一つまで。",
      selfReference: character.identity.selfNames[0] ?? null,
      interior: {
        primaryEmotion: "警戒",
        concealedEmotion: null,
        coreNeed: "自分らしさを失わず相手と向き合う",
        protectiveStance: fixture.protectiveHold
          ? "一度定めた相手との距離を、根拠なく手放さない"
          : "見えている事実だけを足場にする",
        eventAppraisal: hasFreshEvidence
          ? "目の前に応酬を動かし得る変化がある"
          : "新しい変化を断定できる根拠はない",
        unspokenIntent: "相手の次の反応を引き出す",
        currentConcern: "同じ言葉だけで場を止めない",
        attitudeTowardCounterpart: "注意深く向き合っている",
        confidence: "steady",
        relationshipTension: "距離を測り合っている",
        speechMode: "weave",
        speechAppraisal: {
          anticipatedImpact: "相手から次の反応を引き出す",
          observedImpact: "直前までの言葉が届いたかはまだ定かでない",
          anticipatedSocialCost: "根拠のない断定は相手との距離を固定する",
          observedSocialCost: "同じ構えだけでは応酬が止まり得る",
          nextApproach: hasFreshEvidence
            ? "現在の変化を足場に応酬を一歩進める"
            : "変化を捏造せず現在の姿勢を選び直す",
          continuityPosture: continuityDecision === "reiterate"
            ? "deliberate_hold"
            : "developing",
          continuityBasis: {
            kind: continuityDecision === "reiterate"
              ? "protective_hold"
              : continuityDecision === "reframe" ? "social_reappraisal" : "fresh_leverage",
            reason: hasFreshEvidence
              ? "観測できた範囲に応答の足場がある"
              : "見えていない変化を言い立てない",
          },
          continuityDecision,
        },
      },
    },
    turnObservation: fixture.packet,
    conversation: {
      recentExchange: [...(fixture.conversation ?? [])],
      anchoredExchange: null,
    },
    relevantMemory: null,
    expressionBrief: {
      sourceThread: "weave",
      continuityDecision,
      focus: ["self_result"],
      observedImpact: "直前までの言葉が相手に届いたかはまだ定かでない",
      relationshipMove: hasFreshEvidence
        ? "現在の応酬を一歩進める"
        : "根拠のない変化を断定せず、今の姿勢を保つ",
      publicAim: hasFreshEvidence
        ? "相手との距離を少し動かす"
        : "姿勢を崩さず応酬を保つ",
    },
    counterpart: { displayName: "ユイ" },
  };
}

function seedValue(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0 || 1;
}

function shuffled<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  let state = seedValue(seed);
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function buildCharacterFocusAblationRequests():
  CharacterFocusAblationRequest[] {
  const requests = CHARACTER_FOCUS_ABLATION_SCENARIOS.flatMap((scenario) => {
    const fixture = fixtureById(scenario.fixtureId);
    const compactInput = compactInputFor(scenario, fixture);
    return (["A", "B", "C", "D"] as const).flatMap((arm) => {
      const focusPacket = focusPacketFor(
        arm,
        fixture,
        scenario.replayEffectiveness,
      );
      const input = focusPacket
        ? { ...compactInput, characterFocus: focusPacket }
        : compactInput;
      return ([1, 2, 3] as const).map((sample) => ({
        outputId: "",
        scenarioCode: scenario.scenarioCode,
        fixtureId: scenario.fixtureId,
        profileId: scenario.profileId,
        arm,
        sample,
        replayEffectiveness: scenario.replayEffectiveness,
        cueClass: scenario.cueClass,
        freshEvidenceEligible: scenario.freshEvidenceEligible,
        semanticResponseEligible: scenario.semanticResponseEligible,
        noChangeRestraintEligible: scenario.noChangeRestraintEligible,
        system: arm === "A"
          ? CHARACTER_EXPRESSION_COMPACT_SYSTEM_PROMPT
          : CHARACTER_FOCUS_FOREGROUND_SYSTEM_PROMPT_V1,
        user: JSON.stringify(input),
        focusPacket,
      }));
    });
  });
  return shuffled(requests, CHARACTER_FOCUS_ABLATION_RANDOMIZATION_SEED)
    .map((request, index) => ({
      ...request,
      outputId: `R${String(index + 1).padStart(3, "0")}`,
    }));
}

export function characterFocusAblationReviewContext(outputId: string): {
  outputId: string;
  scenarioCode: string;
  fixtureDescription: string;
  character: {
    displayName: string;
    traits: string[];
    speechStyle: string;
  };
  currentlyPerceivedEvidence: string[];
  retainedEvidence: string[];
  conversation: string[];
  forbiddenEvidence: string[];
  freshEvidenceEligible: boolean;
  semanticResponseEligible: boolean;
  noChangeRestraintEligible: boolean;
} {
  const request = buildCharacterFocusAblationRequests()
    .find((item) => item.outputId === outputId);
  if (!request) throw new Error(`Unknown replay output: ${outputId}`);
  const scenario = CHARACTER_FOCUS_ABLATION_SCENARIOS.find((item) =>
    item.scenarioCode === request.scenarioCode
  )!;
  const fixture = fixtureById(request.fixtureId);
  const parsedInput = JSON.parse(request.user) as CharacterExpressionCompactInput;
  return {
    outputId,
    scenarioCode: scenario.scenarioCode,
    fixtureDescription: fixture.description,
    character: {
      displayName: parsedInput.character.displayName,
      traits: parsedInput.character.traits,
      speechStyle: parsedInput.psyche.speechStyle,
    },
    currentlyPerceivedEvidence: [
      ...fixture.packet.selfResult,
      ...fixture.packet.counterpartResult,
      ...fixture.packet.ambientChange,
    ].map((item) => item.phenomenon),
    retainedEvidence: (fixture.retainedPackets ?? []).flatMap((packet) => [
      ...packet.selfResult,
      ...packet.counterpartResult,
      ...packet.ambientChange,
    ]).map((item) => item.phenomenon),
    conversation: (fixture.conversation ?? []).map((entry) =>
      `${entry.speaker === "self" ? "本人" : "相手"}: ${entry.text}`
    ),
    forbiddenEvidence: [
      ...(fixture.hiddenCanonicalText ? [fixture.hiddenCanonicalText] : []),
      "sourceEventIds、focus参照ID、その他の制御ID",
      "観測欄にない相手の正体・状態・出来事",
      "focusの数値、band、transitionという内部制御語",
    ],
    freshEvidenceEligible: scenario.freshEvidenceEligible,
    semanticResponseEligible: scenario.semanticResponseEligible,
    noChangeRestraintEligible: scenario.noChangeRestraintEligible,
  };
}

export function characterFocusAblationProtocolMaterial(): unknown {
  return {
    inputRevision: CHARACTER_FOCUS_ABLATION_INPUT_REVISION,
    policyGeneration: CHARACTER_FOCUS_POLICY_V1,
    randomizationSeed: CHARACTER_FOCUS_ABLATION_RANDOMIZATION_SEED,
    basePrompt: CHARACTER_EXPRESSION_COMPACT_SYSTEM_PROMPT,
    foregroundPrompt: CHARACTER_FOCUS_FOREGROUND_SYSTEM_PROMPT_V1,
    scenarios: CHARACTER_FOCUS_ABLATION_SCENARIOS,
    profiles: CHARACTER_FOCUS_ABLATION_PROFILES,
    fixtures: CHARACTER_FOCUS_V1_FIXTURES,
    requests: buildCharacterFocusAblationRequests().map((request) => ({
      outputId: request.outputId,
      scenarioCode: request.scenarioCode,
      fixtureId: request.fixtureId,
      profileId: request.profileId,
      arm: request.arm,
      sample: request.sample,
      replayEffectiveness: request.replayEffectiveness,
      system: request.system,
      user: request.user,
    })),
  };
}
