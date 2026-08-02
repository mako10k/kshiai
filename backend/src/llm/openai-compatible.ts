import OpenAI from "openai";
import {
  clampCoefficientMap,
  defaultParameters,
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
Parameters should be balanced around hp 80-120, atk/def 8-16.
appearance.visualPrompt must be a detailed English portrait prompt for image gen:
face, hair, eyes, outfit, age vibe, no combat stats numbers.`,
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

  async generateBattlefieldPreset(input: {
    prompt: string;
    category?: BattlefieldPreset["category"];
  }): Promise<GenerateBattlefieldResult> {
    if (!this.client) return this.fallback.generateBattlefieldPreset(input);
    try {
      const data = (await this.chatJson(
        `Create a battle-field preset as JSON (Japanese prose OK):
{ "displayName": string, "category": "forest"|"arena"|"sea"|"urban"|"school"|"mountain"|"ruins"|"custom",
  "tags": string[], "appearance": { "summary": string, "visualPrompt": string },
  "terrainHints": string[], "obstacleHints": string[], "conditionHints": string[],
  "baseCoefficients": { [key: string]: number }, "narrativeBlurb": string, "assistantMessage": string }
Coefficients between 0.25 and 2.5. Do not invent stats for characters.`,
        JSON.stringify(input),
      )) as Record<string, unknown>;
      const appearance = (data.appearance as Record<string, string>) ?? {};
      return {
        preset: {
          displayName: String(data.displayName ?? "無名の戦場"),
          category: (data.category as BattlefieldPreset["category"]) ?? input.category ?? "custom",
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          appearance: {
            summary: String(appearance.summary ?? input.prompt.slice(0, 100)),
            visualPrompt: String(appearance.visualPrompt ?? input.prompt),
            imageUrl: null,
          },
          terrainHints: Array.isArray(data.terrainHints)
            ? data.terrainHints.map(String)
            : [],
          obstacleHints: Array.isArray(data.obstacleHints)
            ? data.obstacleHints.map(String)
            : [],
          conditionHints: Array.isArray(data.conditionHints)
            ? data.conditionHints.map(String)
            : [],
          baseCoefficients: clampCoefficientMap(
            (data.baseCoefficients as Record<string, number>) ?? {},
          ),
          narrativeBlurb: String(data.narrativeBlurb ?? ""),
        },
        assistantMessage: String(
          data.assistantMessage ?? "戦場プリセットを生成しました。",
        ),
      };
    } catch {
      return this.fallback.generateBattlefieldPreset(input);
    }
  }

  async adjustBattlefieldPreset(
    current: BattlefieldPreset,
    userMessage: string,
  ): Promise<AdjustBattlefieldResult> {
    if (!this.client) return this.fallback.adjustBattlefieldPreset(current, userMessage);
    try {
      const data = (await this.chatJson(
        `Adjust a battlefield preset from user feedback. JSON:
{ "assistantMessage": string, "displayName"?: string, "narrativeBlurb"?: string,
  "terrainHints"?: string[], "obstacleHints"?: string[], "conditionHints"?: string[],
  "baseCoefficients"?: object, "category"?: string }
Do not show numeric coefficients to the user in assistantMessage.`,
        JSON.stringify({
          public: {
            displayName: current.displayName,
            category: current.category,
            terrainHints: current.terrainHints,
            obstacleHints: current.obstacleHints,
            conditionHints: current.conditionHints,
            narrativeBlurb: current.narrativeBlurb,
          },
          hiddenCoefficients: current.baseCoefficients,
          userMessage,
        }),
      )) as Record<string, unknown>;
      return {
        presetPatch: {
          displayName: data.displayName
            ? String(data.displayName)
            : current.displayName,
          narrativeBlurb: data.narrativeBlurb
            ? String(data.narrativeBlurb)
            : current.narrativeBlurb,
          terrainHints: Array.isArray(data.terrainHints)
            ? data.terrainHints.map(String)
            : current.terrainHints,
          obstacleHints: Array.isArray(data.obstacleHints)
            ? data.obstacleHints.map(String)
            : current.obstacleHints,
          conditionHints: Array.isArray(data.conditionHints)
            ? data.conditionHints.map(String)
            : current.conditionHints,
          baseCoefficients: data.baseCoefficients
            ? clampCoefficientMap({
                ...current.baseCoefficients,
                ...(data.baseCoefficients as Record<string, number>),
              })
            : current.baseCoefficients,
          category: (data.category as BattlefieldPreset["category"]) ?? current.category,
        },
        assistantMessage: String(data.assistantMessage ?? "調整しました。"),
      };
    } catch {
      return this.fallback.adjustBattlefieldPreset(current, userMessage);
    }
  }

  async concretizeBattlefield(input: {
    preset: BattlefieldPreset | null;
    random: boolean;
  }): Promise<BattlefieldInstance> {
    if (!this.client) return this.fallback.concretizeBattlefield(input);
    try {
      const data = (await this.chatJson(
        `Concretize a match battlefield in Japanese. JSON:
{ "displayName": string, "category": string, "scene": string, "terrain": string,
  "obstacles": string[], "conditions": string[], "coefficients": { [k: string]: number },
  "narrativeSetup": string, "appearance": { "summary": string, "visualPrompt": string } }
Coefficients 0.25-2.5. Make terrain/obstacles/conditions specific for THIS match, not just the template.`,
        JSON.stringify({
          random: input.random,
          preset: input.preset
            ? {
                id: input.preset.id,
                displayName: input.preset.displayName,
                category: input.preset.category,
                terrainHints: input.preset.terrainHints,
                obstacleHints: input.preset.obstacleHints,
                conditionHints: input.preset.conditionHints,
                baseCoefficients: input.preset.baseCoefficients,
                narrativeBlurb: input.preset.narrativeBlurb,
              }
            : null,
        }),
      )) as Record<string, unknown>;
      const appearance = (data.appearance as Record<string, string>) ?? {};
      return {
        sourcePresetId:
          input.preset && !input.random ? input.preset.id : null,
        displayName: String(data.displayName ?? input.preset?.displayName ?? "戦場"),
        category:
          (data.category as BattlefieldInstance["category"]) ??
          input.preset?.category ??
          "custom",
        scene: String(data.scene ?? "戦場"),
        terrain: String(data.terrain ?? ""),
        obstacles: Array.isArray(data.obstacles) ? data.obstacles.map(String) : [],
        conditions: Array.isArray(data.conditions)
          ? data.conditions.map(String)
          : [],
        coefficients: clampCoefficientMap({
          ...(input.preset?.baseCoefficients ?? {}),
          ...((data.coefficients as Record<string, number>) ?? {}),
        }),
        narrativeSetup: String(data.narrativeSetup ?? ""),
        appearance: {
          summary: String(appearance.summary ?? input.preset?.appearance.summary ?? ""),
          visualPrompt: String(
            appearance.visualPrompt ?? input.preset?.appearance.visualPrompt ?? "",
          ),
          imageUrl: input.preset?.appearance.imageUrl ?? null,
        },
      };
    } catch {
      return this.fallback.concretizeBattlefield(input);
    }
  }

  async proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
    battlefield?: BattlefieldInstance | null;
  }): Promise<SituationProposal> {
    if (!this.client) return this.fallback.proposeSituation(input);
    try {
      const data = (await this.chatJson(
        `Propose battle situation JSON: { "scene": string, "notes": string, "coefficients": { [key: string]: number }, "tags"?: string[] }.
Respect the battlefield terrain/obstacles/conditions. Coefficients between 0.25 and 2.5.`,
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
    battlefield?: BattlefieldInstance | null;
  }): Promise<NarrationResult> {
    if (!this.client) return this.fallback.narrateTurn(input);
    try {
      const data = (await this.chatJson(
        `Narrate a turn-based duel in Japanese. Use battlefield flavor (terrain/obstacles) when relevant. JSON:
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
    if (!this.client) return this.fallback.generateBattlePolicies(input);
    try {
      const data = (await this.chatJson(
        `You design COARSE high-level battle postures for a narrative duel (Japanese UI cards).
These are rough player intentions, NOT detailed tactics or step-by-step plans.

Return JSON:
{
  "rationale": string,  // one short sentence
  "options": [{
    "title": string,   // short label, max ~8 Japanese chars (e.g. 押し気味, 守り, 様子見)
    "when": string,    // abstract situation only, max ~18 chars (e.g. 劣勢のとき, 序盤)
    "then": string,    // rough approach only, max ~20 chars (e.g. 無理せず耐える, 機を見て攻める)
    "bias": "attack"|"defend"|"support"|"wait"|"mixed",
    "priority": number, // 0-100
    "defaultSelected": boolean,
    "triggers": {
      "earlyTurn"?: boolean,
      "lateTurn"?: boolean,
      "myHpBelow"?: number,
      "myHpAbove"?: number,
      "foeHpBelow"?: number,
      "foeHpAbove"?: number,
      "always"?: boolean
    }
  }]
}
Rules:
- Generate 5–6 DISTINCT coarse postures. Keep language plain and vague on purpose.
- Prefer vibes over tactics: 押し気味 / 守り / 様子見 / 均衡 / 勝負 / 立て直し など.
- Do NOT write concrete micro-plans (specific skills, named obstacles, exact terrain tricks, HP%, turn numbers, weapon moves).
- Field/character may lightly color the wording, but stay high-level.
- Multi-select kit: mark 3–4 defaultSelected true.
- Keep title/when/then SHORT so they fit a mobile card.`,
        JSON.stringify({
          self: {
            displayName: input.self.displayName,
            traits: input.self.traits,
            blurb: input.self.narrativeBlurb?.slice(0, 80),
          },
          foe: input.foe
            ? {
                displayName: input.foe.displayName,
                traits: input.foe.traits,
              }
            : null,
          field: {
            displayName: input.field.displayName,
            category: input.field.category,
          },
        }),
      )) as {
        rationale?: string;
        options?: Array<Record<string, unknown>>;
      };

      const clamp = (s: string, max: number, fallback: string) => {
        const t = s.replace(/\s+/g, " ").trim() || fallback;
        return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
      };

      const raw = Array.isArray(data.options) ? data.options : [];
      const options: BattlePolicyOption[] = raw.map((o, i) => {
        const triggers = (o.triggers as Record<string, unknown>) ?? {};
        return {
          id: newId("pol"),
          title: clamp(String(o.title ?? `方針${i + 1}`), 12, `方針${i + 1}`),
          when: clamp(String(o.when ?? "状況が動いたとき"), 28, "状況が動いたとき"),
          then: clamp(String(o.then ?? "柔軟に対応する"), 32, "柔軟に対応する"),
          bias: (o.bias as BattlePolicyOption["bias"]) ?? "mixed",
          priority: Number(o.priority ?? 50 - i),
          defaultSelected: Boolean(o.defaultSelected ?? i < 3),
          triggers: {
            earlyTurn: triggers.earlyTurn ? true : undefined,
            lateTurn: triggers.lateTurn ? true : undefined,
            myHpBelow:
              typeof triggers.myHpBelow === "number"
                ? triggers.myHpBelow
                : undefined,
            myHpAbove:
              typeof triggers.myHpAbove === "number"
                ? triggers.myHpAbove
                : undefined,
            foeHpBelow:
              typeof triggers.foeHpBelow === "number"
                ? triggers.foeHpBelow
                : undefined,
            foeHpAbove:
              typeof triggers.foeHpAbove === "number"
                ? triggers.foeHpAbove
                : undefined,
            always: triggers.always ? true : undefined,
          },
        };
      });

      if (options.length === 0) {
        return this.fallback.generateBattlePolicies(input);
      }

      // Ensure at least one default
      if (!options.some((o) => o.defaultSelected)) {
        options.slice(0, 3).forEach((o) => {
          o.defaultSelected = true;
        });
      }

      return {
        options,
        rationale: String(
          data.rationale ??
            "キャラと戦場に合わせてケース別の方針案を生成しました。",
        ),
      };
    } catch {
      return this.fallback.generateBattlePolicies(input);
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
