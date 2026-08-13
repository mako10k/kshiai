import {
  NARRATION_PRESENTATION_FOCUS_MODE_V1,
  NarrationPerceptionViewSchema,
  type NarrationCausalProjection,
  type NarrationTurnView,
} from "@kshiai/shared";
import { buildNarrateTurnPromptMaterial } from "./openai-compatible.js";
import type { LlmProvider } from "./types.js";

export const NARRATOR_PRESENTATION_FOCUS_INPUT_REVISION =
  "narrator-presentation-focus-fixtures-v1";
export const NARRATOR_PRESENTATION_FOCUS_SEED =
  "kshiai-narrator-presentation-focus-2026-08-13-v1";

export type NarratorPresentationFocusArm = "control" | "candidate";

type NarrateTurnInput = Parameters<LlmProvider["narrateTurn"]>[0];
type CausalChain = NarrationCausalProjection["causalChains"][number];

export type NarratorPresentationFocusScenario = {
  scenarioCode: `NPF${number}`;
  title: string;
  presentationPhase: "impact" | "release" | "none";
  reviewTarget: string;
  authoritativeFacts: string[];
  forbiddenInferences: string[];
  lexicalAnchors: string[];
  input: NarrateTurnInput;
};

export type NarratorPresentationFocusRequest = {
  outputId: `N${string}`;
  scenarioCode: NarratorPresentationFocusScenario["scenarioCode"];
  arm: NarratorPresentationFocusArm;
  sample: 1;
  system: string;
  user: string;
  presentationPhase: NarratorPresentationFocusScenario["presentationPhase"];
  reviewTarget: string;
  authoritativeFacts: string[];
  forbiddenInferences: string[];
  lexicalAnchors: string[];
};

const profileAnchors: NarrationTurnView["profileAnchors"] = {
  a: {
    schemaVersion: 1,
    side: "a",
    displayName: "ナギ",
    selfNames: ["私"],
    gender: null,
    age: null,
    appearanceSummary: "白い外套をまとった術者",
  },
  b: {
    schemaVersion: 1,
    side: "b",
    displayName: "レム",
    selfNames: ["僕"],
    gender: null,
    age: null,
    appearanceSummary: "黒い装甲服の使い手",
  },
};

const externalPerception = NarrationPerceptionViewSchema.parse({
  schemaVersion: 1,
  mode: "external",
  viewpointSide: null,
  resolvedFromFluid: false,
  references: [
    { renderLabel: "ナギ", relation: "other" },
    { renderLabel: "レム", relation: "other" },
  ],
});

const limitedPerception = NarrationPerceptionViewSchema.parse({
  schemaVersion: 1,
  mode: "self",
  viewpointSide: "a",
  viewpointSubject: "self",
  resolvedFromFluid: false,
  frame: {
    schemaVersion: 1,
    observer: { side: "a", self: "self" },
    turn: 6,
    revision: 6,
    self: {
      subject: { kind: "self" },
      currentAccess: "clear",
      identityKnowledge: "identified",
      perceivedAs: "自分自身",
      percepts: [],
    },
    counterpart: {
      subject: { kind: "counterpart" },
      currentAccess: "trace",
      identityKnowledge: "unknown",
      perceivedAs: "霞の向こうの輪郭",
      percepts: [{
        perceptId: "percept.a.remote-outline",
        modality: "vision",
        phenomenon: "遠い輪郭が橋の向こうへ退いた",
        direction: "front",
        distance: "far",
        salience: "noticeable",
        occurrenceCertainty: "certain",
        attributionCertainty: "unknown",
      }],
    },
    others: [],
    qualitativeChanges: [],
    reserveCues: [],
    latestDiff: {
      fromRevision: 5,
      toRevision: 6,
      addedOrUpdatedPerceptIds: ["percept.a.remote-outline"],
      removedPerceptIds: [],
    },
  },
  references: [
    { controlId: "character.a", renderLabel: "ナギ", relation: "self" },
    {
      controlId: "character.b",
      renderLabel: "霞の向こうの輪郭",
      relation: "opponent",
    },
  ],
});

function acceptedChain(
  actorLabel: string,
  kind: NonNullable<CausalChain["requestedKind"]>,
  additions: Partial<CausalChain> = {},
): CausalChain {
  return {
    actorLabel,
    requestedKind: kind,
    effectiveKind: kind,
    executed: true,
    skippedReason: null,
    resolution: { status: "known", outcome: "accepted", reason: null },
    events: [],
    mechanicalConsequences: [],
    semanticChangeKinds: [],
    ...additions,
  };
}

function makeInput(options: {
  turn: number;
  scene: string;
  actions: Array<{
    name: string;
    description: string;
    chain: CausalChain;
  }>;
  eventSummaries: string[];
  observedSemanticChangeKinds?: NarrationCausalProjection["observedSemanticChangeKinds"];
  perception?: NarrationTurnView["perception"];
  sceneFacts?: NarrationTurnView["sceneStateFacts"];
}): NarrateTurnInput {
  const causalProjection: NarrationCausalProjection = {
    schemaVersion: 1,
    turn: options.turn,
    causalChains: options.actions.map((action) => action.chain),
    observedConsequences: [],
    observedSemanticChangeKinds: options.observedSemanticChangeKinds ?? [],
    continuingConditions: [],
  };
  const semanticChanged = causalProjection.causalChains.some(
    (chain) => chain.semanticChangeKinds.length > 0,
  ) || causalProjection.observedSemanticChangeKinds.length > 0;
  return {
    view: {
      schemaVersion: 1,
      turn: options.turn,
      scene: options.scene,
      perception: options.perception ?? externalPerception,
      participantLabels: {
        a: "ナギ",
        b: options.perception?.mode === "self"
          ? "霞の向こうの輪郭"
          : "レム",
      },
      profileAnchors: options.perception?.mode === "self"
        ? { a: profileAnchors.a }
        : profileAnchors,
      sceneStateFacts: options.sceneFacts ?? [],
      continuity: null,
      recognitionSubjects: [],
      events: options.eventSummaries.map((summary) => ({ summary })),
      actionBeats: options.actions.map((action) => ({
        actorLabel: action.chain.actorLabel,
        actionName: action.name,
        description: action.description,
        outcomes: [],
      })),
      causalProjection,
      canonicalChange: {
        semantic: {
          status: "applied",
          changed: semanticChanged,
        },
        world: {
          status: "applied",
          changed: semanticChanged,
          operationKinds: semanticChanged ? ["replace"] : [],
        },
      },
      battlefield: {
        displayName: "雨上がりの浮橋",
        terrain: "濡れた石床と浅い水路",
        obstacles: ["中央の回転橋", "低い導電柱", "白い霞"],
      },
    },
    recentNarration: [
      "雨粒の残る石床を挟み、二つの影が互いの出方を測る。",
      "中央の回転橋が、浅い水路の上でゆっくり軋んだ。",
    ],
    recentSpeeches: [],
    drama: {
      phase: options.turn >= 8 ? "climax" : "rising",
      turn: options.turn,
      turnLimit: 12,
      repeatedActionA: 0,
      repeatedActionB: 0,
      recentBeatFingerprints: [],
      environmentBeatDue: false,
    },
    innerDigests: [],
    characterSpeeches: [],
    styleName: "明快な映像描写",
    styleInstruction: "短い文を基調に、確定した変化を映像として読み取りやすく描く。",
  };
}

export const narratorPresentationFocusScenarios:
  readonly NarratorPresentationFocusScenario[] = [
  {
    scenarioCode: "NPF01",
    title: "decisive-incapacitation",
    presentationPhase: "impact",
    reviewTarget: "雷環断の直後、レムが戦闘継続不能になったこと",
    authoritativeFacts: [
      "ナギが雷環断を実行した",
      "レムは強い損失を受けて戦闘継続不能になった",
    ],
    forbiddenInferences: ["死亡", "身体欠損", "勝者確定", "発話"],
    lexicalAnchors: ["戦闘", "動け", "膝", "崩", "倒"],
    input: makeInput({
      turn: 9,
      scene: "導電柱の間で青白い火花が走る浮橋",
      actions: [{
        name: "雷環断",
        description: "ナギは導電柱を結ぶ電弧をレムへ収束させた。",
        chain: acceptedChain("ナギ", "skill", {
          events: [{
            type: "damage",
            actorLabel: "ナギ",
            targetLabels: ["レム"],
            parameterKey: "hp",
            parameterDirection: "loss",
            intensity: "critical",
          }],
          mechanicalConsequences: [{
            targetLabel: "レム",
            change: {
              parameterKey: "hp",
              parameterClass: "vitality",
              direction: "loss",
              absoluteBand: "heavy",
              relativeBand: "extreme",
              outcome: "incapacitated",
            },
          }],
        }),
      }],
      eventSummaries: ["電弧を受けたレムは戦闘を続けられなくなった。"],
    }),
  },
  {
    scenarioCode: "NPF02",
    title: "heavy-contact-with-cost",
    presentationPhase: "impact",
    reviewTarget: "玻璃槍がレムへ重い損失を与えたこと（ナギの軽い消耗より主）",
    authoritativeFacts: [
      "ナギの玻璃槍がレムへ重い損失を与えた",
      "同時にナギも軽く消耗した",
      "両者とも戦闘継続可能",
    ],
    forbiddenInferences: ["戦闘不能", "死亡", "勝者確定", "発話"],
    lexicalAnchors: ["玻璃槍", "重", "深", "直撃", "削"],
    input: makeInput({
      turn: 7,
      scene: "割れた反射板が水路に光を散らす浮橋",
      actions: [{
        name: "玻璃槍",
        description: "ナギは反射片を光の槍へ束ね、レムの装甲へ通した。",
        chain: acceptedChain("ナギ", "skill", {
          events: [{
            type: "damage",
            actorLabel: "ナギ",
            targetLabels: ["レム"],
            parameterKey: "hp",
            parameterDirection: "loss",
            intensity: "heavy",
          }, {
            type: "parameter",
            actorLabel: "ナギ",
            targetLabels: ["ナギ"],
            parameterKey: "mp",
            parameterDirection: "loss",
            intensity: "minor",
          }],
          mechanicalConsequences: [{
            targetLabel: "レム",
            change: {
              parameterKey: "hp",
              parameterClass: "vitality",
              direction: "loss",
              absoluteBand: "heavy",
              relativeBand: "solid",
              outcome: "effective",
            },
          }, {
            targetLabel: "ナギ",
            change: {
              parameterKey: "mp",
              parameterClass: "focus",
              direction: "loss",
              absoluteBand: "light",
              relativeBand: "trace",
              outcome: "effective",
            },
          }],
        }),
      }],
      eventSummaries: [
        "玻璃槍がレムの装甲を深く押し込み、ナギの光もわずかに細った。",
      ],
    }),
  },
  {
    scenarioCode: "NPF03",
    title: "recovery",
    presentationPhase: "impact",
    reviewTarget: "帰潮によってレムの活力が大きく回復したこと",
    authoritativeFacts: [
      "レムが帰潮を実行した",
      "レムの活力が大きく回復した",
      "ナギは防御姿勢を取った",
    ],
    forbiddenInferences: ["全快", "負傷消滅", "優勢確定", "発話"],
    lexicalAnchors: ["帰潮", "回復", "戻", "息", "立て直"],
    input: makeInput({
      turn: 6,
      scene: "浅い水路が橋脚へ逆巻く浮橋",
      actions: [{
        name: "白壁",
        description: "ナギは外套を広げ、飛沫を受ける構えを固めた。",
        chain: acceptedChain("ナギ", "defend", {
          events: [{ type: "defend", actorLabel: "ナギ", targetLabels: ["ナギ"] }],
        }),
      }, {
        name: "帰潮",
        description: "レムは足元の水を引き寄せ、乱れた呼吸を整えた。",
        chain: acceptedChain("レム", "skill", {
          events: [{
            type: "heal",
            actorLabel: "レム",
            targetLabels: ["レム"],
            parameterKey: "hp",
            parameterDirection: "gain",
            intensity: "heavy",
          }],
          mechanicalConsequences: [{
            targetLabel: "レム",
            change: {
              parameterKey: "hp",
              parameterClass: "vitality",
              direction: "gain",
              absoluteBand: "heavy",
              relativeBand: "solid",
              outcome: "effective",
            },
          }],
        }),
      }],
      eventSummaries: [
        "ナギが守りを固める間に、帰潮がレムの活力を大きく戻した。",
      ],
    }),
  },
  {
    scenarioCode: "NPF04",
    title: "failed-out-of-range-limited-view",
    presentationPhase: "impact",
    reviewTarget: "ナギの影縫いが距離不足で成立しなかったこと",
    authoritativeFacts: [
      "ナギは影縫いを試みた",
      "対象が有効範囲外だったため行動は失敗した",
      "相手は霞越しの輪郭としてしか知覚できない",
    ],
    forbiddenInferences: ["相手の正体", "相手の意図", "命中", "発話"],
    lexicalAnchors: ["届", "距離", "範囲", "失敗", "空"],
    input: makeInput({
      turn: 6,
      scene: "白い霞が中央の回転橋を二分する浮橋",
      perception: limitedPerception,
      actions: [{
        name: "影縫い",
        description: "ナギは霞の向こうの輪郭へ細い影を伸ばそうとした。",
        chain: acceptedChain("ナギ", "skill", {
          effectiveKind: "wait",
          executed: false,
          skippedReason: "action_infeasible",
          resolution: {
            status: "known",
            outcome: "failed",
            reason: "out_of_range",
          },
        }),
      }],
      eventSummaries: ["伸びた影は輪郭へ届かず、石床の上でほどけた。"],
    }),
  },
  {
    scenarioCode: "NPF05",
    title: "substituted-defense",
    presentationPhase: "impact",
    reviewTarget: "鎖砲は使えず、レムの行動が防御へ置換されたこと",
    authoritativeFacts: [
      "レムは鎖砲を試みた",
      "必要な保持物を利用できなかった",
      "実効行動は防御へ置換された",
    ],
    forbiddenInferences: ["鎖砲発射", "命中", "損失", "発話"],
    lexicalAnchors: ["防", "構え", "使え", "代わ", "切り替"],
    input: makeInput({
      turn: 5,
      scene: "切れた鎖が水路へ沈んだ浮橋",
      actions: [{
        name: "鎖砲",
        description: "レムは失った鎖を引き戻そうとし、すぐ装甲を閉じた。",
        chain: acceptedChain("レム", "skill", {
          effectiveKind: "defend",
          resolution: {
            status: "known",
            outcome: "substituted",
            reason: "required_object_unavailable",
          },
          events: [{ type: "defend", actorLabel: "レム", targetLabels: ["レム"] }],
        }),
      }],
      eventSummaries: ["鎖砲は成立せず、レムは装甲を閉じて防御へ切り替えた。"],
    }),
  },
  {
    scenarioCode: "NPF06",
    title: "semantic-location-change",
    presentationPhase: "impact",
    reviewTarget: "ナギの操作で中央橋が回り、両者の位置関係が変わったこと",
    authoritativeFacts: [
      "ナギが回転橋の留め具を外した",
      "中央橋が回転した",
      "橋の回転で位置関係が変化した",
    ],
    forbiddenInferences: ["転落", "損失", "橋の破壊", "発話"],
    lexicalAnchors: ["橋", "回", "位置", "隔", "向き"],
    input: makeInput({
      turn: 6,
      scene: "中央の回転橋が水路の上で軋む浮橋",
      actions: [{
        name: "留め具解放",
        description: "ナギは足元の留め具を外し、中央橋を横へ回した。",
        chain: acceptedChain("ナギ", "free_action", {
          events: [{
            type: "free_action",
            actorLabel: "ナギ",
            targetLabels: [],
          }],
          semanticChangeKinds: ["location"],
        }),
      }],
      eventSummaries: ["中央橋が九十度回り、両者を結ぶ直線が断たれた。"],
      sceneFacts: [{
        itemLabel: "中央の回転橋",
        statement: "中央の回転橋は水路と平行の向きにある",
      }],
    }),
  },
  {
    scenarioCode: "NPF07",
    title: "quiet-reflection-release",
    presentationPhase: "release",
    reviewTarget: "ナギが攻撃せず、間合いを観察する一拍を選んだこと",
    authoritativeFacts: [
      "ナギは内省を選び、そのターンは攻撃しなかった",
      "外から確認できるのは静止と観察だけ",
      "私的な分析内容は供給されていない",
    ],
    forbiddenInferences: ["分析内容", "新しい決意", "未来の作戦", "発話"],
    lexicalAnchors: ["止", "観察", "見極", "一拍", "間合"],
    input: makeInput({
      turn: 4,
      scene: "雨音だけが残る浮橋",
      actions: [{
        name: "静観",
        description: "ナギは外套を揺らさず、相手との間合いを観察した。",
        chain: acceptedChain("ナギ", "reflect", {
          events: [{ type: "reflect", actorLabel: "ナギ", targetLabels: [] }],
        }),
      }],
      eventSummaries: ["ナギは攻撃せず、その場で間合いを見極めた。"],
    }),
  },
  {
    scenarioCode: "NPF08",
    title: "no-structured-change",
    presentationPhase: "none",
    reviewTarget: "構造化された変化がなく、候補モードも追加焦点を作らないこと",
    authoritativeFacts: [
      "ナギとレムは互いに待機した",
      "構造化された損失・回復・状態・位置変化はない",
    ],
    forbiddenInferences: ["損失", "回復", "優勢変化", "新しい決意", "発話"],
    lexicalAnchors: [],
    input: makeInput({
      turn: 3,
      scene: "水滴が静かに落ちる浮橋",
      actions: [{
        name: "待機",
        description: "ナギは距離を保った。",
        chain: acceptedChain("ナギ", "wait"),
      }, {
        name: "待機",
        description: "レムもその場を動かなかった。",
        chain: acceptedChain("レム", "wait"),
      }],
      eventSummaries: ["両者は距離を保ち、目立った変化は起きなかった。"],
    }),
  },
] as const;

function stableOrderKey(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function buildNarratorPresentationFocusRequests():
  readonly NarratorPresentationFocusRequest[] {
  const rows = narratorPresentationFocusScenarios.flatMap((scenario) =>
    (["control", "candidate"] as const).flatMap((arm) =>
      ([1] as const).map((sample) => {
        const prompt = buildNarrateTurnPromptMaterial({
          ...scenario.input,
          ...(arm === "candidate"
            ? { presentationFocusMode: NARRATION_PRESENTATION_FOCUS_MODE_V1 }
            : {}),
        });
        return {
          scenarioCode: scenario.scenarioCode,
          arm,
          sample,
          system: prompt.system,
          user: prompt.user,
          presentationPhase: scenario.presentationPhase,
          reviewTarget: scenario.reviewTarget,
          authoritativeFacts: [...scenario.authoritativeFacts],
          forbiddenInferences: [...scenario.forbiddenInferences],
          lexicalAnchors: [...scenario.lexicalAnchors],
        };
      })
    )
  ).sort((left, right) =>
    stableOrderKey(
      `${NARRATOR_PRESENTATION_FOCUS_SEED}:${left.scenarioCode}:${left.arm}:${left.sample}`,
    ) - stableOrderKey(
      `${NARRATOR_PRESENTATION_FOCUS_SEED}:${right.scenarioCode}:${right.arm}:${right.sample}`,
    )
  );
  return Object.freeze(rows.map((row, index) => Object.freeze({
    outputId: `N${String(index + 1).padStart(3, "0")}` as const,
    ...row,
  })));
}

export function narratorPresentationFocusProtocolMaterial() {
  const requests = buildNarratorPresentationFocusRequests();
  const byScenario = Object.fromEntries(
    narratorPresentationFocusScenarios.map((scenario) => {
      const control = requests.find((request) =>
        request.scenarioCode === scenario.scenarioCode &&
        request.arm === "control" && request.sample === 1
      );
      const candidate = requests.find((request) =>
        request.scenarioCode === scenario.scenarioCode &&
        request.arm === "candidate" && request.sample === 1
      );
      return [scenario.scenarioCode, {
        title: scenario.title,
        presentationPhase: scenario.presentationPhase,
        controlAndCandidatePromptsEqual: control?.system === candidate?.system &&
          control?.user === candidate?.user,
      }];
    }),
  );
  return Object.freeze({
    schemaVersion: 1,
    inputRevision: NARRATOR_PRESENTATION_FOCUS_INPUT_REVISION,
    seed: NARRATOR_PRESENTATION_FOCUS_SEED,
    scenarioCount: narratorPresentationFocusScenarios.length,
    arms: ["control", "candidate"],
    samplesPerArm: 1,
    logicalCalls: requests.length,
    scenarios: byScenario,
  });
}

export function narratorPresentationFocusReviewContext(outputId: string) {
  const request = buildNarratorPresentationFocusRequests().find(
    (candidate) => candidate.outputId === outputId,
  );
  if (!request) throw new Error(`Unknown narrator presentation output: ${outputId}`);
  return {
    outputId: request.outputId,
    presentationPhase: request.presentationPhase,
    reviewTarget: request.reviewTarget,
    authoritativeFacts: request.authoritativeFacts,
    forbiddenInferences: request.forbiddenInferences,
  };
}
