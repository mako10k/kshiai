import {
  CATEGORY_LABELS,
  SYSTEM_PRESET_SEEDS,
  BattlefieldSemanticSeedSchema,
  clampCoefficientMap,
  defaultParameters,
  defaultRecord,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type BattleSemanticState,
  type SemanticObservationState,
  type BattlePolicyOption,
  type CharacterSheet,
  type CharacterIdentity,
} from "@kshiai/shared";
import type {
  AdjustBattlefieldResult,
  AdjustCharacterResult,
  AnalyzeCharacterImprovementInput,
  AnalyzeCharacterImprovementResult,
  GenerateBattlefieldResult,
  GenerateCharacterResult,
  GenerateCharacterInput,
  GenerateImprovementPromptInput,
  GenerateImprovementPromptResult,
  LlmProvider,
  NarrationResult,
  RefereeResult,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";
import { makeUniqueCharacterName } from "../character-name-uniqueness.js";

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly models = { engine: "mock-v1", fast: "mock-v1" };

  async generateCharacter(input: GenerateCharacterInput): Promise<GenerateCharacterResult> {
    const prompt = input.prompt;
    const displayName = makeUniqueCharacterName(
      prompt.trim().slice(0, 24) || "無名の挑戦者",
      [...(input.reservedNames ?? []), ...(input.rejectedNames ?? [])],
    );
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
    const semanticSeed = BattlefieldSemanticSeedSchema.parse({
      sceneFacts: {
        terrain: detailTerrain,
        conditions,
      },
      entities: Object.fromEntries(obstacles.map((label, index) => [
        `obstacle.${index + 1}`,
        {
          kind: "object",
          label,
          location: { type: "scene", area: scene },
          active: true,
          facts: { source: "battlefield_obstacle" },
        },
      ])),
    });
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
      semanticSeed,
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

  async reconcileTurnSemanticState(
    input: Parameters<LlmProvider["reconcileTurnSemanticState"]>[0],
  ): ReturnType<LlmProvider["reconcileTurnSemanticState"]> {
    const areaA = input.battlefield?.obstacles?.[0] ?? input.battlefield?.terrain ?? "戦場の一角";
    const areaB = input.battlefield?.obstacles?.[1] ?? input.battlefield?.terrain ?? "対面する一角";
    return Promise.resolve({
      patch: {
        baseRevision: input.before.revision,
        turn: input.turn,
        sourceEventIds: input.events.flatMap((event) => event.id ? [event.id] : []),
        operations: input.environmentBeatDue
          ? [
              {
                op: "replace" as const,
                path: "/entities/character.a/location",
                value: { type: "scene", area: areaA },
              },
              {
                op: "replace" as const,
                path: "/entities/character.b/location",
                value: { type: "scene", area: areaB },
              },
            ]
          : [],
      },
      worldPatchStatus: "valid",
      sensoryEvidence: [],
      sensoryEvidenceStatus: "valid",
    });
  }

  async proposeHappening(input: {
    scene: string;
    turn: number;
    sideAName: string;
    sideBName: string;
    stagnationHint: string;
    previousHappenings: Array<{ title: string; summary: string }>;
    battlefield?: BattlefieldInstance | null;
  }): Promise<{
    title: string;
    summary: string;
    notes: string;
    coefficients?: Record<string, number>;
    tags?: string[];
    envHits?: Array<{
      target: "both";
      kind: "damage" | "heal" | "disrupt";
      intensity: "minor" | "moderate";
    }>;
  }> {
    const fieldDetails = [
      input.battlefield?.terrain,
      ...(input.battlefield?.obstacles ?? []),
      ...(input.battlefield?.conditions ?? []),
    ].filter((value): value is string => Boolean(value));
    const detail = fieldDetails[
      (input.turn + input.previousHappenings.length) %
        Math.max(1, fieldDetails.length)
    ] ?? input.battlefield?.displayName ?? input.scene;
    return {
      title: `${detail.slice(0, 12)}の変化`,
      summary: `${detail}の様子が変わり、両者が新しい流れへ対応する。`,
      notes: `${detail}の変化は、どちらにも同じ条件と機会を与えている。`,
      coefficients: { damage: 1.05, focus: 0.9 },
      tags: [detail.slice(0, 16)],
      envHits: [{ target: "both", kind: "disrupt", intensity: "minor" }],
    };
  }

  async advanceCharacterAgent(input: Parameters<LlmProvider["advanceCharacterAgent"]>[0]) {
    const selfReference =
      input.previous.selfReference ?? input.character.identity.selfNames[0] ?? "私";
    const event = input.cognition.observedEvents.at(-1)?.summary ??
      `${input.cognition.scene}で相手の出方を見ている。`;
    // Quiet traits get stage reactions; others speak briefly (speech never null).
    const quiet = input.character.traits.some((t) =>
      /無口|寡黙|無言|冷静|クール/.test(t),
    );
    const speech = quiet
      ? input.cognition.turn === 0
        ? `（${input.foeName}を見据えている）`
        : "…"
      : input.cognition.turn === 0
        ? `${selfReference}は、${input.foeName}と向き合おう。`
        : `${selfReference}は、まだ続けられる。`;
    const shouldUseFinisher = Boolean(
      input.decision.finisher?.unlocked &&
      input.decision.finisher.remainingUses === 1 &&
      (input.decision.foeCondition === "critical" ||
        input.decision.ownCondition === "critical" ||
        input.decision.finisher.turnsUntilMax === 0 ||
        input.decision.turnsRemaining <= 2),
    );
    const finisherAction = shouldUseFinisher
      ? input.decision.availableActions.find((action) =>
          action.kind === "skill" && action.finisherCandidate
        )
      : undefined;
    const preferred = finisherAction ??
      input.decision.availableActions.find((action) =>
        action.kind === "skill" && !action.finisherCandidate
      ) ??
      input.decision.availableActions.find((action) => action.kind === "basic_attack") ??
      input.decision.availableActions[0]!;
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
      nextAction: {
        kind: preferred.kind,
        ...(preferred.skillId ? { skillId: preferred.skillId } : {}),
        ...(finisherAction ? { useFinisher: true } : {}),
      },
    };
  }

  private async emitNarratorProgress(
    lines: string[],
    onProgress?: (progress: { lines: string[]; draft?: string | null }) => void,
  ): Promise<void> {
    if (!onProgress) return;
    const acc: string[] = [];
    for (const line of lines) {
      acc.push(line);
      onProgress({ lines: [...acc], draft: null });
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  async chooseNarrationFocus(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string }[];
    summaryA: { emotion?: string; condition?: string };
    summaryB: { emotion?: string; condition?: string };
  }): Promise<{ focus: "self" | "foe" | "external" | "both" }> {
    if (input.summaryA.condition === "critical") return { focus: "self" };
    if (input.summaryB.condition === "critical") return { focus: "foe" };
    if (input.turn % 3 === 0) return { focus: "both" };
    return { focus: input.turn % 2 === 0 ? "self" : "foe" };
  }

  async narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string; actorName?: string; skillName?: string; intensity?: string }[];
    actionBeats?: Array<{
      actorName: string;
      actionName: string;
      description: string;
      outcomes: string[];
    }>;
    recentNarration?: string[];
    recentSpeeches?: Array<{ speaker: string; text: string }>;
    drama?: { environmentBeatDue: boolean; phase: string };
    innerDigests?: Array<{ displayName: string; emotion?: string }>;
    focus?: string;
    perspective?: string;
    battlefield?: BattlefieldInstance | null;
    semanticObservation?: SemanticObservationState | null;
    styleInstruction?: string;
    styleName?: string;
    onProgress?: (progress: { lines: string[]; draft?: string | null }) => void;
  }): Promise<NarrationResult> {
    const place = input.battlefield?.displayName
      ? `${input.scene}（${input.battlefield.displayName}）`
      : input.scene;
    const styleNote = input.styleName
      ? `（語り: ${input.styleName}）`
      : "";
    const focusNote = input.focus ? `［焦点: ${input.focus}］` : "";
    const digestNote = (input.innerDigests ?? [])
      .map((d) => `${d.displayName}の気配（${d.emotion ?? "不明"}）`)
      .filter(Boolean);
    const narrator = [
      `第${input.turn}ターン — ${place}${styleNote}${focusNote}。`,
      ...digestNote,
      ...(input.actionBeats ?? []).flatMap((beat) => [
        `${beat.actorName} は ${beat.actionName} を起こす。${beat.description}`,
        ...beat.outcomes,
      ]),
      ...((input.actionBeats?.length ?? 0) > 0
        ? []
        : input.events.map((e) => e.summary)),
      ...(input.drama?.environmentBeatDue
        ? ["両者の動きに押され、戦場の位置関係も新しく組み替わる。"]
        : []),
    ];
    await this.emitNarratorProgress(narrator, input.onProgress);
    const speeches = [
      {
        speaker: input.sideAName,
        text: input.turn % 2 === 0 ? "ここから変える。" : "次は逃さない。",
      },
      {
        speaker: input.sideBName,
        text: input.turn % 3 === 0 ? "その流れは読んだ。" : "まだ終わらない。",
      },
    ];
    return { turn: input.turn, narrator, speeches };
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
    onProgress?: (progress: { lines: string[]; draft?: string | null }) => void;
  }): Promise<NarrationResult> {
    const place = input.battlefield?.displayName ?? input.scene;
    const styleNote = input.styleName ? `（${input.styleName}）` : "";
    const narrator = [
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
    ].filter(Boolean);
    await this.emitNarratorProgress(narrator, input.onProgress);
    return {
      turn: 0,
      narrator,
      speeches: [
        { speaker: input.sideAName, text: "……始めよう。" },
        { speaker: input.sideBName, text: "…" },
      ],
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
    onProgress?: (progress: { lines: string[]; draft?: string | null }) => void;
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
    await this.emitNarratorProgress(narrator, input.onProgress);
    return {
      turn: input.turn,
      narrator,
      speeches: input.winnerName
        ? [{ speaker: input.winnerName, text: "……終わりだ。" }]
        : [
            { speaker: input.sideAName, text: "…" },
            { speaker: input.sideBName, text: "…" },
          ],
    };
  }

  async generateNarrationStyle(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
    perspective?: "self" | "foe" | "external" | "omniscient" | "fluid";
  }> {
    return {
      displayName: prompt.slice(0, 12) || "カスタム",
      description: `「${prompt.slice(0, 40)}」風の語り`,
      instruction: `次の雰囲気・口調で語る: ${prompt}。数値は出さない。`,
      tags: ["custom", "mock"],
      perspective: /全知|群像/.test(prompt)
        ? "omniscient"
        : /主観|一人称/.test(prompt)
          ? "self"
          : /可変|カメラ/.test(prompt)
            ? "fluid"
            : "external",
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

  async analyzeCharacterImprovement(
    input: AnalyzeCharacterImprovementInput,
  ): Promise<AnalyzeCharacterImprovementResult> {
    const recent = await input.battleTools.search("", 8);
    const wins = recent.filter((b) => b.result === "win").length;
    const losses = recent.filter((b) => b.result === "loss").length;
    const skills = [
      ...new Set(recent.flatMap((b) => b.skillMentions)),
    ].slice(0, 3);
    const strengths = [
      skills.length
        ? `${skills[0]} を軸にした展開が目立つ`
        : `${input.character.displayName} らしい戦い方が保たれている`,
      wins >= losses
        ? "直近は優位な試合が多い"
        : "不利な状況でも最後まで立ち回れている",
    ];
    const improvements = [
      losses > wins
        ? "終盤のペース配分をもう少し意識する"
        : "序盤の観察を少し厚くして無駄打ちを減らす",
      "得意な働きかけのタイミングを明確にする",
    ];
    return {
      strengths,
      improvements,
      summary: `直近 ${recent.length} 戦（勝${wins}/負${losses}）を踏まえたモック分析です。特徴は維持したまま微調整向けのメモです。`,
      assistantMessage: "戦績から良い点と改善点をメモに登録しました。",
    };
  }

  async generateImprovementPrompt(
    input: GenerateImprovementPromptInput,
  ): Promise<GenerateImprovementPromptResult> {
    const strengths = input.memo.strengths.slice(0, 4).join("、") || "現状の持ち味";
    const improvements =
      input.memo.improvements.slice(0, 4).join("、") || "細かな立ち回りの精度";
    const prompt = [
      `${input.character.displayName} のコンセプト・性格・見た目・世界観は変えず、特徴を壊さない範囲で微調整してください。`,
      `伸ばしたい良い点: ${strengths}。`,
      `キャラらしさに影響しない範囲で改善したい点: ${improvements}。`,
      "能力の大幅強化やジャンルの書き換えは不要です。戦い方の癖や技の使いどころ、消耗の仕方など実務的な部分だけ整えてください。",
    ].join("");
    return {
      prompt,
      assistantMessage: "会話での修正欄に使える改善プロンプトを用意しました。",
    };
  }
}
