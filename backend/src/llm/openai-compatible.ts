import OpenAI from "openai";
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
import { MockLlmProvider } from "./mock.js";

type ProviderConfig = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * OpenAI-compatible chat provider (xAI, Venice, etc.).
 * Falls back to mock behavior if the key is missing or the call fails hard.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  private client: OpenAI | null;
  private model: string;
  private fallback = new MockLlmProvider();

  constructor(cfg: ProviderConfig) {
    this.name = cfg.name;
    this.model = cfg.model;
    this.client = cfg.apiKey
      ? new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })
      : null;
  }

  private async chatJson(system: string, user: string): Promise<unknown> {
    if (!this.client) {
      throw new Error("LLM client not configured");
    }
    const resp = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const text = resp.choices[0]?.message?.content ?? "{}";
    return JSON.parse(text) as unknown;
  }

  async generateCharacter(prompt: string): Promise<GenerateCharacterResult> {
    if (!this.client) return this.fallback.generateCharacter(prompt);
    try {
      const data = (await this.chatJson(
        `You create RPG character sheets as JSON. Never include advice to show raw numbers to players.
Return JSON: {
  "displayName": string,
  "tags": string[],
  "appearance": { "summary": string, "visualPrompt": string },
  "traits": string[],
  "parameters": { "hp": number, "maxHp": number, "mp": number, "maxMp": number,
    "stamina": number, "maxStamina": number, "atk": number, "def": number,
    "spd": number, "mag": number, "res": number, "focus": number, "luck": number },
  "skills": [{ "name": string, "description": string, "costMp": number, "costStamina": number,
    "power": number, "kind": "attack"|"magic"|"defend"|"support"|"special", "element"?: string }],
  "weapon": { "name": string, "description": string } | null,
  "armor": { "name": string, "description": string } | null,
  "narrativeBlurb": string,
  "assistantMessage": string
}
Parameters should be balanced around hp 80-120, atk/def 8-16.`,
        prompt,
      )) as Record<string, unknown>;

      const skillsRaw = Array.isArray(data.skills) ? data.skills : [];
      const skills = skillsRaw.map((s) => {
        const o = s as Record<string, unknown>;
        return {
          id: newId("sk"),
          name: String(o.name ?? "無名の技"),
          description: String(o.description ?? ""),
          costMp: Number(o.costMp ?? 0),
          costStamina: Number(o.costStamina ?? 0),
          power: Number(o.power ?? 1),
          kind: (o.kind as "attack") ?? "attack",
          element: o.element ? String(o.element) : undefined,
        };
      });

      const weapon = data.weapon as Record<string, unknown> | null;
      const armor = data.armor as Record<string, unknown> | null;

      return {
        sheet: {
          displayName: String(data.displayName ?? "挑戦者"),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          appearance: {
            summary: String((data.appearance as { summary?: string })?.summary ?? prompt.slice(0, 100)),
            visualPrompt: String(
              (data.appearance as { visualPrompt?: string })?.visualPrompt ?? prompt,
            ),
            imageUrl: null,
          },
          traits: Array.isArray(data.traits) ? data.traits.map(String) : [],
          parameters: defaultParameters(
            (data.parameters as Record<string, number>) ?? {},
          ),
          skills: skills.length
            ? skills
            : (await this.fallback.generateCharacter(prompt)).sheet.skills,
          weapon: weapon
            ? {
                name: String(weapon.name ?? "武器"),
                description: String(weapon.description ?? ""),
                atkBonus: 0,
                defBonus: 0,
                magBonus: 0,
              }
            : null,
          armor: armor
            ? {
                name: String(armor.name ?? "防具"),
                description: String(armor.description ?? ""),
                atkBonus: 0,
                defBonus: 0,
                magBonus: 0,
              }
            : null,
          combatFlags: { canFight: true, irreversibleIncapacitated: false },
          narrativeBlurb: String(data.narrativeBlurb ?? ""),
        },
        assistantMessage: String(
          data.assistantMessage ?? "キャラクターを生成しました。",
        ),
      };
    } catch {
      return this.fallback.generateCharacter(prompt);
    }
  }

  async adjustCharacter(
    current: CharacterSheet,
    userMessage: string,
  ): Promise<AdjustCharacterResult> {
    if (!this.client) return this.fallback.adjustCharacter(current, userMessage);
    try {
      const data = (await this.chatJson(
        `Adjust a hidden RPG character sheet from user feedback. Reply JSON:
{ "assistantMessage": string, "displayName"?: string, "narrativeBlurb"?: string,
  "traits"?: string[], "parameters"?: object }
Do not tell the user exact numbers.`,
        JSON.stringify({
          currentPublic: {
            displayName: current.displayName,
            traits: current.traits,
            narrativeBlurb: current.narrativeBlurb,
            skillNames: current.skills.map((s) => s.name),
          },
          // Server-only context for the model:
          hiddenParameters: current.parameters,
          userMessage,
        }),
      )) as Record<string, unknown>;

      return {
        sheetPatch: {
          displayName: data.displayName
            ? String(data.displayName)
            : current.displayName,
          narrativeBlurb: data.narrativeBlurb
            ? String(data.narrativeBlurb)
            : current.narrativeBlurb,
          traits: Array.isArray(data.traits)
            ? data.traits.map(String)
            : current.traits,
          parameters: data.parameters
            ? { ...current.parameters, ...(data.parameters as object) }
            : current.parameters,
        },
        assistantMessage: String(data.assistantMessage ?? "調整しました。"),
      };
    } catch {
      return this.fallback.adjustCharacter(current, userMessage);
    }
  }

  async proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
  }): Promise<SituationProposal> {
    if (!this.client) return this.fallback.proposeSituation(input);
    try {
      const data = (await this.chatJson(
        `Propose battle situation JSON: { "scene": string, "notes": string, "coefficients": { [key: string]: number } }.
Coefficients must be between 0.25 and 2.5.`,
        JSON.stringify(input),
      )) as SituationProposal;
      return data;
    } catch {
      return this.fallback.proposeSituation(input);
    }
  }

  async narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string }[];
  }): Promise<NarrationResult> {
    if (!this.client) return this.fallback.narrateTurn(input);
    try {
      const data = (await this.chatJson(
        `Narrate a turn-based duel in Japanese. JSON:
{ "turn": number, "narrator": string[], "speeches": [{ "speaker": string, "text": string }] }
Do not mention numeric HP/MP/ATK values. Character lines should be short spoken Japanese without brackets.`,
        JSON.stringify(input),
      )) as NarrationResult;
      return {
        turn: input.turn,
        narrator: data.narrator ?? [],
        speeches: data.speeches ?? [],
      };
    } catch {
      return this.fallback.narrateTurn(input);
    }
  }

  async referee(input: {
    sideAName: string;
    sideBName: string;
    engineWinnerSide: "a" | "b" | "draw" | null;
    logSummaries: string[];
  }): Promise<RefereeResult> {
    if (!this.client) return this.fallback.referee(input);
    try {
      const data = (await this.chatJson(
        `As a duel referee, return JSON { "winnerSide": "a"|"b"|"draw", "summary": string } in Japanese.
Prefer the engineWinnerSide unless the narrative strongly suggests otherwise.`,
        JSON.stringify(input),
      )) as RefereeResult;
      return data;
    } catch {
      return this.fallback.referee(input);
    }
  }
}
