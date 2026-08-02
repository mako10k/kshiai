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
} from "@kshiai/shared";
import type {
  AdjustBattlefieldResult,
  AdjustCharacterResult,
  GenerateBattlefieldResult,
  GenerateCharacterResult,
  LlmProvider,
  NarrationResult,
  RefereeResult,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";

/** Pull a display name from free text; avoid leftovers like 「はアキ」 from 「名前はアキ」. */
function extractName(prompt: string): string {
  const m =
    prompt.match(/名前は\s*([^\s、。・]+)/) ??
    prompt.match(/(?:名前|name)\s*[：:=]\s*([^\s、。・]+)/i);
  let name = (m?.[1] ?? "").trim();
  if (!name) {
    const first = prompt.trim().split(/[\s、。]/)[0] ?? "";
    // Avoid treating the whole "名前は…" clause as the name
    name = first.replace(/^名前は?/, "").trim();
  }
  // Drop leading Japanese particles / junk if a bad capture slipped through
  name = name.replace(/^[はがをにへとでのもや]+/u, "").trim();
  if (name.length < 1 || name === "名前") name = "無名の挑戦者";
  return name.slice(0, 24);
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async generateCharacter(prompt: string): Promise<GenerateCharacterResult> {
    const displayName = extractName(prompt);
    const sheet: GenerateCharacterResult["sheet"] = {
      displayName,
      tags: ["mock", "generated"],
      appearance: {
        summary: `${displayName} — ${prompt.slice(0, 120)}`,
        visualPrompt: `anime character portrait bust, detailed face, ${displayName}, ${prompt.slice(0, 180)}, expressive eyes, soft lighting, single character, no text`,
        imageUrl: null,
      },
      traits: ["不屈", "機知"],
      parameters: defaultParameters(),
      skills: [
        {
          id: newId("sk"),
          name: "疾風の一撃",
          description: "素早い斬撃で間合いを詰める",
          costMp: 0,
          costStamina: 8,
          power: 1.3,
          kind: "attack",
          element: "wind",
        },
        {
          id: newId("sk"),
          name: "守護の構え",
          description: "守りを固めて反撃の隙を窺う",
          costMp: 5,
          costStamina: 0,
          power: 1,
          kind: "defend",
        },
        {
          id: newId("sk"),
          name: "回復の灯",
          description: "微かな光で傷を癒やす",
          costMp: 10,
          costStamina: 0,
          power: 1.1,
          kind: "support",
        },
      ],
      weapon: {
        name: "旅人の刃",
        description: "使い込まれた片手剣",
        atkBonus: 2,
        defBonus: 0,
        magBonus: 0,
      },
      armor: {
        name: "皮の胴衣",
        description: "軽い防護",
        atkBonus: 0,
        defBonus: 2,
        magBonus: 0,
      },
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: `${displayName}。${prompt.slice(0, 160)}という印象を周囲に与える挑戦者。`,
      record: defaultRecord(),
      deletedAt: null,
    };

    return {
      sheet,
      assistantMessage: `了解しました。${displayName} として整えました。数値の詳細はお見せしませんが、素早さと一撃の切れ味に振っています。さらに変えたい点があれば自然文でどうぞ。`,
    };
  }

  async adjustCharacter(
    current: CharacterSheet,
    userMessage: string,
  ): Promise<AdjustCharacterResult> {
    const moreDef =
      /防御|守り|タフ|硬い/.test(userMessage);
    const moreAtk = /攻撃|攻め|火力|強く/.test(userMessage);
    const rename = userMessage.match(/(?:名前を|改名)[「『]?([^」』\s]+)[」』]?/);

    const parameters = { ...current.parameters };
    if (moreDef) {
      parameters.def = (parameters.def ?? 10) + 3;
      parameters.maxHp = (parameters.maxHp ?? 100) + 15;
      parameters.hp = parameters.maxHp;
    }
    if (moreAtk) {
      parameters.atk = (parameters.atk ?? 12) + 3;
    }

    return {
      sheetPatch: {
        displayName: rename?.[1] ?? current.displayName,
        parameters,
        narrativeBlurb: `${current.narrativeBlurb}\n（調整: ${userMessage.slice(0, 80)}）`,
        traits: moreDef
          ? [...new Set([...current.traits, "堅牢"])]
          : moreAtk
            ? [...new Set([...current.traits, "猛攻"])]
            : current.traits,
      },
      assistantMessage: moreDef
        ? "守り寄りに調整しました。厚みのある戦い方になりそうです。"
        : moreAtk
          ? "攻め寄りに調整しました。手数と切れ味が増しています。"
          : `「${userMessage.slice(0, 40)}」を反映しました。ほかに気になる点はありますか？`,
    };
  }

  async generateBattlefieldPreset(input: {
    prompt: string;
    category?: BattlefieldPreset["category"];
  }): Promise<GenerateBattlefieldResult> {
    const cat = input.category ?? "custom";
    const label = CATEGORY_LABELS[cat] ?? "戦場";
    const nameMatch = input.prompt.match(/(?:名前は|名[：:])\s*([^\s、。]+)/);
    const displayName = nameMatch?.[1] ?? `${label}の一角`;
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
    const wet = /雨|霧|濡|水/.test(userMessage);
    const night = /夜|闇|暗い/.test(userMessage);
    const baseCoefficients = { ...current.baseCoefficients };
    if (wet) baseCoefficients.water = 1.2;
    if (night) baseCoefficients.focus = 0.9;
    return {
      presetPatch: {
        conditionHints: [
          ...new Set([
            ...current.conditionHints,
            ...(wet ? ["雨"] : []),
            ...(night ? ["夜"] : []),
          ]),
        ],
        baseCoefficients,
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
        ...(conditions.some((c) => /雨|霧|濡/.test(c))
          ? { fire: 0.75, water: 1.15 }
          : {}),
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
    const rain =
      input.turn % 5 === 0 ||
      (input.battlefield?.conditions ?? []).some((c) => /雨|霧/.test(c));
    const notes = rain
      ? "にわか雨が戦場を濡らし、足場が危うい。"
      : input.battlefield
        ? `${input.battlefield.terrain}の気配が攻防を揺さぶる。`
        : "風が刃を運び、空気が張りつめている。";
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

  async narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string; actorName?: string; skillName?: string; intensity?: string }[];
    battlefield?: BattlefieldInstance | null;
  }): Promise<NarrationResult> {
    const place = input.battlefield?.displayName
      ? `${input.scene}（${input.battlefield.displayName}）`
      : input.scene;
    const narrator = [
      `第${input.turn}ターン — ${place}。`,
      ...input.events.map((e) => e.summary),
    ];
    const speeches = [
      {
        speaker: input.sideAName,
        text: input.events[0]?.skillName
          ? `${input.events[0].skillName}、くらえ！`
          : "まだ終わらん…！",
      },
      {
        speaker: input.sideBName,
        text: input.battlefield?.obstacles[0]
          ? `${input.battlefield.obstacles[0]}を盾に…こちらからだ！`
          : "その程度か…ならばこちらからだ！",
      },
    ];
    return { turn: input.turn, narrator, speeches };
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

    // Coarse postures only — short enough to fit mobile policy cards.
    const options: BattlePolicyOption[] = [
      {
        id: newId("pol"),
        title: "様子見",
        when: "試合の出だし",
        then: "無理せず流れを読む",
        bias: "wait",
        priority: 40,
        triggers: { earlyTurn: true },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        title: "押し気味",
        when: "相手が揺らいだとき",
        then: "機を見て攻める",
        bias: "attack",
        priority: 80,
        triggers: { foeHpBelow: 0.55 },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        title: "守り",
        when: "こちらが苦しいとき",
        then: "耐えて立て直す",
        bias: "defend",
        priority: 90,
        triggers: { myHpBelow: 0.4 },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        title: "均衡",
        when: "膠着したとき",
        then: "攻守を混ぜる",
        bias: "mixed",
        priority: 20,
        triggers: { always: true },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        title: "勝負",
        when: "決着を急ぐ局面",
        then: "攻勢に振る",
        bias: "attack",
        priority: 50,
        triggers: { lateTurn: true },
        defaultSelected: false,
      },
      {
        id: newId("pol"),
        title: "立て直し",
        when: "一息つけるとき",
        then: "守り寄りに振る",
        bias: "support",
        priority: 60,
        triggers: { myHpBelow: 0.6, myHpAbove: 0.2 },
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
        : "審判は引き分けと宣告した。互角の攻防が続いた末の決着である。",
    };
  }
}
