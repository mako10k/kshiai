import { defaultParameters, type CharacterSheet } from "@kshiai/shared";
import type {
  AdjustCharacterResult,
  GenerateCharacterResult,
  LlmProvider,
  NarrationResult,
  RefereeResult,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";

function extractName(prompt: string): string {
  const m =
    prompt.match(/名前は\s*([^\s、。]+)/) ??
    prompt.match(/(?:名前|name)\s*[：:]\s*([^\s、。]+)/i);
  if (m?.[1]) return m[1]!.slice(0, 24);
  const first = prompt.trim().split(/[\s、。]/)[0];
  return (first && first.length >= 2 ? first : "無名の挑戦者").slice(0, 24);
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
        visualPrompt: `anime character portrait, ${prompt.slice(0, 200)}`,
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

  async proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
  }): Promise<SituationProposal> {
    const rain = input.turn % 5 === 0;
    return {
      scene: input.scene,
      notes: rain
        ? "にわか雨が戦場を濡らし、足場が危うい。"
        : "風が刃を運び、空気が張りつめている。",
      coefficients: rain ? { damage: 0.9, wind: 1.2 } : { damage: 1.0 },
    };
  }

  async narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string; actorName?: string; skillName?: string; intensity?: string }[];
  }): Promise<NarrationResult> {
    const narrator = [
      `第${input.turn}ターン — ${input.scene}。`,
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
        text: "その程度か…ならばこちらからだ！",
      },
    ];
    return { turn: input.turn, narrator, speeches };
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
