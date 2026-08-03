import {
  CATEGORY_LABELS,
  SYSTEM_PRESET_SEEDS,
  clampCoefficientMap,
  defaultParameters,
  defaultRecord,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type BattlePolicyOption,
  type CharacterSheet,
  type CharacterIdentity,
} from "@kshiai/shared";
import type {
  AdjustBattlefieldResult,
  AdjustCharacterResult,
  GenerateBattlefieldResult,
  GenerateCharacterResult,
  GenerateCharacterInput,
  LlmProvider,
  NarrationResult,
  RefereeResult,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async generateCharacter(input: GenerateCharacterInput): Promise<GenerateCharacterResult> {
    const prompt = input.prompt;
    const displayName = prompt.trim().slice(0, 24) || "無名の挑戦者";
    const sheet: GenerateCharacterResult["sheet"] = {
      displayName,
      identity: {
        realName: displayName === "無名の挑戦者" ? null : displayName,
        nicknames: [],
        selfNames: [],
        epithets: [],
        gender: null,
        age: null,
      },
      tags: ["mock", "generated"],
      appearance: {
        summary: `${displayName}らしさが伝わる、依頼内容に沿った外見。`,
        visualPrompt: `anime character portrait bust, detailed face, ${displayName}, ${prompt.slice(0, 180)}, expressive eyes, soft lighting, single character, no text`,
        imageUrl: null,
      },
      traits: ["不屈", "機知"],
      parameters: defaultParameters(),
      basicAttack: {
        name: "自分らしい働きかけ",
        description: "得意なやり方で相手の集中と持久力を揺さぶる。",
        targetParameter: "stamina",
        scalingParameter: "atk",
        resistanceParameter: "def",
        power: 0.75,
        element: "personal",
      },
      skills: [
        {
          id: newId("sk"),
          name: "先手のひらめき",
          description: "自分らしい発想で場の流れを引き寄せる",
          costMp: 0,
          costStamina: 8,
          power: 1.3,
          kind: "attack",
          element: "personal",
        },
        {
          id: newId("sk"),
          name: "ペース調整",
          description: "無理をせず、自分の調子を整える",
          costMp: 5,
          costStamina: 0,
          power: 1,
          kind: "defend",
          effects: [
            { target: "self", parameter: "def", delta: 4 },
            { target: "self", parameter: "spd", delta: -2 },
          ],
        },
        {
          id: newId("sk"),
          name: "気分転換",
          description: "気持ちを切り替えて状態を持ち直す",
          costMp: 10,
          costStamina: 0,
          power: 1.1,
          kind: "support",
        },
      ],
      weapon: null,
      armor: {
        name: "いつもの装い",
        description: "そのキャラクターが落ち着ける装い",
        atkBonus: 0,
        defBonus: 2,
        magBonus: 0,
        effects: [{ parameter: "spd", delta: -1 }],
      },
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: `${prompt.slice(0, 160)}という依頼をもとに作られた、${displayName}という挑戦者。`,
      record: defaultRecord(),
      deletedAt: null,
    };

    return {
      sheet,
      assistantMessage: `了解しました。${displayName} として整えました。対決の方法は元の依頼のジャンルに合わせています。さらに変えたい点があれば自然文でどうぞ。`,
    };
  }

  async inferCharacterIdentity(current: CharacterSheet): Promise<CharacterIdentity> {
    return {
      realName: null,
      nicknames: [current.displayName],
      selfNames: [],
      epithets: [],
      gender: null,
      age: null,
    };
  }

  async adjustCharacter(
    current: CharacterSheet,
    userMessage: string,
  ): Promise<AdjustCharacterResult> {
    return {
      sheetPatch: {
        narrativeBlurb: `${current.narrativeBlurb}\n（調整: ${userMessage.slice(0, 80)}）`,
      },
      assistantMessage: `モック環境のため、依頼文をプロフィール注記へ反映しました。`,
    };
  }

  async generateBattlefieldPreset(input: {
    prompt: string;
    category?: BattlefieldPreset["category"];
  }): Promise<GenerateBattlefieldResult> {
    const cat = input.category ?? "custom";
    const label = CATEGORY_LABELS[cat] ?? "戦場";
    const displayName = input.prompt.trim().slice(0, 24) || `${label}の一角`;
    return {
      preset: {
        displayName,
        category: cat,
        tags: ["generated", label],
        appearance: {
          summary: `${displayName} — ${input.prompt.slice(0, 100)}`,
          visualPrompt: `battlefield landscape, ${label}, ${input.prompt.slice(0, 160)}, anime`,
          imageUrl: null,
        },
        terrainHints: ["起伏", "足場", "見通し"],
        obstacleHints: ["瓦礫", "遮蔽物"],
        conditionHints: ["風", "光の差し込み"],
        baseCoefficients: clampCoefficientMap({ damage: 1, focus: 1 }),
        narrativeBlurb: `${displayName}。${input.prompt.slice(0, 140)}`,
      },
      assistantMessage: `${displayName} として戦場プリセットを整えました。地形や障害を自然文で調整できます。`,
    };
  }

  async adjustBattlefieldPreset(
    current: BattlefieldPreset,
    userMessage: string,
  ): Promise<AdjustBattlefieldResult> {
    return {
      presetPatch: {
        narrativeBlurb: `${current.narrativeBlurb}\n（調整: ${userMessage.slice(0, 80)}）`,
      },
      assistantMessage: `「${userMessage.slice(0, 40)}」を戦場に反映しました。`,
    };
  }

  async concretizeBattlefield(input: {
    preset: BattlefieldPreset | null;
    random: boolean;
  }): Promise<BattlefieldInstance> {
    let preset = input.preset;
    if (!preset || input.random) {
      const seed =
        SYSTEM_PRESET_SEEDS[Math.floor(Math.random() * SYSTEM_PRESET_SEEDS.length)]!;
      preset = {
        ...seed,
        id: "ephemeral",
        ownerUserId: null,
        isSystem: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const detailTerrain =
      preset.terrainHints[Math.floor(Math.random() * Math.max(1, preset.terrainHints.length))] ??
      "平坦な地面";
    const obstacles = preset.obstacleHints.slice(0, 3);
    const conditions = [
      ...preset.conditionHints.slice(0, 2),
      ...(Math.random() > 0.5 ? ["風向きが不安定"] : []),
    ];
    const scene = `${preset.displayName}・${detailTerrain}`;
    return {
      sourcePresetId: input.preset && !input.random ? input.preset.id : null,
      displayName: preset.displayName,
      category: preset.category,
      scene,
      terrain: detailTerrain,
      obstacles,
      conditions,
      coefficients: clampCoefficientMap({
        ...preset.baseCoefficients,
      }),
      narrativeSetup: `${preset.narrativeBlurb} いまは「${detailTerrain}」が主戦場で、${obstacles.join("・") || "目立った障害はなく"}、${conditions.join("・") || "静かな空気"}が支配している。`,
      appearance: { ...preset.appearance },
    };
  }

  async proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
    battlefield?: BattlefieldInstance | null;
  }): Promise<SituationProposal> {
    const rain = input.turn % 5 === 0;
    const notes = rain
      ? "にわか雨が戦場を濡らし、足場が危うい。"
      : input.battlefield
        ? `${input.battlefield.terrain}の気配が攻防を揺さぶる。`
        : "場の空気が揺れ、互いの集中に変化をもたらす。";
    return {
      scene: input.scene,
      notes,
      coefficients: rain
        ? { damage: 0.9, wind: 1.2, fire: 0.8 }
        : { damage: 1.0 },
      tags: input.battlefield
        ? [...input.battlefield.obstacles, ...input.battlefield.conditions]
        : [],
    };
  }

  async proposeHappening(input: {
    scene: string;
    turn: number;
    sideAName: string;
    sideBName: string;
    stagnationHint: string;
    battlefield?: BattlefieldInstance | null;
  }): Promise<{
    title: string;
    summary: string;
    notes: string;
    coefficients?: Record<string, number>;
    tags?: string[];
    envHits?: Array<{
      target: "a" | "b" | "both";
      kind: "damage" | "heal" | "disrupt";
      intensity: "minor" | "moderate";
    }>;
  }> {
    const { pickTemplateHappening } = await import("@kshiai/shared");
    const plan = pickTemplateHappening({
      battlefield: input.battlefield,
      turn: input.turn,
    });
    return {
      title: plan.title,
      summary: plan.summary,
      notes: plan.notes,
      coefficients: plan.coefficients,
      tags: plan.tags,
      envHits: plan.envHits,
    };
  }

  async advanceCharacterAgent(input: Parameters<LlmProvider["advanceCharacterAgent"]>[0]) {
    const selfReference =
      input.previous.selfReference ?? input.character.identity.selfNames[0] ?? "私";
    const event = input.cognition.observedEvents.at(-1)?.summary ??
      `${input.cognition.scene}で相手の出方を見ている。`;
    const speech = input.cognition.turn === 0
      ? `${selfReference}は、${input.foeName}と向き合おう。`
      : `${selfReference}は、まだ続けられる。`;
    return {
      state: {
        ...input.previous,
        privateMemory: event.slice(0, 1200),
        currentGoal: `${input.foeName}との対決を自分らしく続ける`,
        emotion: input.cognition.ownCondition === "critical" ? "緊張" : "集中",
        observations: [
          ...input.previous.observations.slice(-6),
          event.slice(0, 240),
        ],
        speechStyle: input.previous.speechStyle || "簡潔に話す",
        selfReference,
        lastSpeech: speech,
      },
      speech,
    };
  }

  async narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string; actorName?: string; skillName?: string; intensity?: string }[];
    agentSpeeches?: Array<{ speaker: string; text: string }>;
    battlefield?: BattlefieldInstance | null;
    styleInstruction?: string;
    styleName?: string;
  }): Promise<NarrationResult> {
    const place = input.battlefield?.displayName
      ? `${input.scene}（${input.battlefield.displayName}）`
      : input.scene;
    const styleNote = input.styleName
      ? `（語り: ${input.styleName}）`
      : "";
    const narrator = [
      `第${input.turn}ターン — ${place}${styleNote}。`,
      ...input.events.map((e) => e.summary),
    ];
    return { turn: input.turn, narrator, speeches: input.agentSpeeches ?? [] };
  }

  async narratePrologue(input: {
    scene: string;
    sideAName: string;
    sideBName: string;
    sideABlurb?: string;
    sideBBlurb?: string;
    sideATraits?: string[];
    sideBTraits?: string[];
    policySummary?: string;
    priorMatchSummary?: string;
    battlefield?: BattlefieldInstance | null;
    styleInstruction?: string;
    styleName?: string;
  }): Promise<NarrationResult> {
    const place = input.battlefield?.displayName ?? input.scene;
    const styleNote = input.styleName ? `（${input.styleName}）` : "";
    return {
      turn: 0,
      narrator: [
        `——開幕——${styleNote}`,
        `${place}に、${input.sideAName} と ${input.sideBName} が向かい合う。`,
        input.battlefield?.narrativeSetup ||
          "場の空気が、二人の存在に応じてゆっくり変わっていく。",
        input.sideABlurb
          ? `${input.sideAName} — ${input.sideABlurb.slice(0, 80)}`
          : `${input.sideAName} の気配が場を支配する。`,
        input.sideBBlurb
          ? `${input.sideBName} — ${input.sideBBlurb.slice(0, 80)}`
          : `${input.sideBName} が相手の出方を静かに見つめる。`,
        input.priorMatchSummary
          ? `因縁 — ${input.priorMatchSummary}`
          : "今、二人の初めての対決が始まる。",
        input.policySummary
          ? `${input.sideAName} の心中に方針が灯る: ${input.policySummary}`
          : "",
      ].filter(Boolean),
      speeches: [],
    };
  }

  async narrateAftermath(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    winnerSide: "a" | "b" | "draw" | null;
    winnerName: string | null;
    fallenNames: string[];
    battlefield?: BattlefieldInstance | null;
    recentNarration?: string[];
    styleInstruction?: string;
    styleName?: string;
  }): Promise<NarrationResult> {
    const place = input.battlefield?.displayName ?? input.scene;
    const fallen = input.fallenNames.join("と") || "続行できなくなった者";
    const fieldBit = input.battlefield?.conditions?.[0] || input.battlefield?.terrain;
    const styleNote = input.styleName ? `（${input.styleName}）` : "";
    const narrator = [
      `——決着の余波——${styleNote}`,
      `${place}に、対決の余韻が静かにほどけていく。`,
      fieldBit
        ? `${fieldBit}の気配の中で、${fallen} はもう対決を続けられない。`
        : `${fallen} は力を使い果たし、その場で動きを止める。`,
      input.winnerName
        ? `${input.winnerName} は自分のやり方で対決を締めくくり、勝者としてその場に残る。`
        : "両者とも力を使い果たし、結果は引き分けとなった。",
      "幕は、そこで静かに下りた。",
    ];
    return { turn: input.turn, narrator, speeches: [] };
  }

  async generateNarrationStyle(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
  }> {
    return {
      displayName: prompt.slice(0, 12) || "カスタム",
      description: `「${prompt.slice(0, 40)}」風の語り`,
      instruction: `次の雰囲気・口調で語る: ${prompt}。数値は出さない。`,
      tags: ["custom", "mock"],
    };
  }

  async generateBattlePolicies(input: {
    self: {
      displayName: string;
      traits: string[];
      skillNames: string[];
      narrativeBlurb: string;
      weaponName?: string | null;
    };
    foe?: {
      displayName: string;
      traits: string[];
      narrativeBlurb: string;
    } | null;
    field: {
      displayName: string;
      category: string;
      terrain?: string;
      obstacles?: string[];
      conditions?: string[];
      narrativeBlurb?: string;
    };
  }): Promise<{ options: BattlePolicyOption[]; rationale: string }> {
    const traits = input.self.traits.join("・") || "柔軟";

    // Three genre-neutral perspectives, each with two exclusive choices.
    const options: BattlePolicyOption[] = [
      {
        id: newId("pol"),
        perspectiveId: "initiative",
        perspectiveTitle: "働きかけ方",
        title: "自分から動く",
        when: "流れが定まる前",
        then: "先に展開を作る",
        bias: "attack",
        priority: 55,
        triggers: { earlyTurn: true },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        perspectiveId: "initiative",
        perspectiveTitle: "働きかけ方",
        title: "相手を観察",
        when: "流れが定まる前",
        then: "反応を見てから動く",
        bias: "wait",
        priority: 50,
        triggers: { earlyTurn: true },
        defaultSelected: false,
      },
      {
        id: newId("pol"),
        perspectiveId: "risk",
        perspectiveTitle: "リスクの取り方",
        title: "大胆に変える",
        when: "流れが停滞したとき",
        then: "変化を大きくする",
        bias: "attack",
        priority: 65,
        triggers: { lateTurn: true },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        perspectiveId: "risk",
        perspectiveTitle: "リスクの取り方",
        title: "慎重に保つ",
        when: "流れが停滞したとき",
        then: "崩さず機会を待つ",
        bias: "defend",
        priority: 60,
        triggers: { lateTurn: true },
        defaultSelected: false,
      },
      {
        id: newId("pol"),
        perspectiveId: "resources",
        perspectiveTitle: "力の配分",
        title: "早めに使う",
        when: "余力があるとき",
        then: "得意な力を活かす",
        bias: "support",
        priority: 45,
        triggers: { myHpAbove: 0.55 },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        perspectiveId: "resources",
        perspectiveTitle: "力の配分",
        title: "後半へ温存",
        when: "余力があるとき",
        then: "消耗を抑えて進める",
        bias: "mixed",
        priority: 40,
        triggers: { myHpAbove: 0.55 },
        defaultSelected: false,
      },
    ];

    return {
      options,
      rationale: `${input.self.displayName}向けのざっくり方針です（${traits}）。細部は試合中に任せます。`,
    };
  }

  async referee(input: {
    sideAName: string;
    sideBName: string;
    engineWinnerSide: "a" | "b" | "draw" | null;
    logSummaries: string[];
  }): Promise<RefereeResult> {
    const winnerSide = input.engineWinnerSide ?? "draw";
    const name =
      winnerSide === "a"
        ? input.sideAName
        : winnerSide === "b"
          ? input.sideBName
          : null;
    return {
      winnerSide,
      summary: name
        ? `審判は ${name} の勝利を宣告した。攻防の積み重ねがわずかに上回った。`
        : "審判は引き分けと宣告した。互いの働きかけが拮抗した末の結果である。",
    };
  }
}
