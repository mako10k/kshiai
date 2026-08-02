import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  BasicAttackProfileSchema,
  CharacterIdentitySchema,
  EquipmentSchema,
  SkillSchema,
  balanceCharacterCombatFields,
  clampCoefficientMap,
  defaultParameters,
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
  CharacterReferenceTools,
  LlmProvider,
  NarrationResult,
  RefereeResult,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";
import { MockLlmProvider } from "./mock.js";

function parseGeneratedSkill(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const parsed = SkillSchema.safeParse({
    ...(raw as Record<string, unknown>),
    id: newId("sk"),
  });
  return parsed.success ? parsed.data : null;
}

function parseGeneratedEquipment(raw: unknown) {
  if (raw === null) return null;
  const parsed = EquipmentSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function parseGeneratedBasicAttack(raw: unknown) {
  const parsed = BasicAttackProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function parseGeneratedIdentity(raw: unknown): CharacterIdentity {
  const source = raw && typeof raw === "object"
    ? raw as Record<string, unknown>
    : {};
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const nullableString = (value: unknown) =>
    value === null || value === undefined || String(value).trim() === ""
      ? null
      : String(value).trim();
  const parsed = CharacterIdentitySchema.safeParse({
    realName: nullableString(source.realName),
    nicknames: strings(source.nicknames),
    selfNames: strings(source.selfNames),
    epithets: strings(source.epithets),
    gender: nullableString(source.gender),
    age: nullableString(source.age),
  });
  return parsed.success ? parsed.data : CharacterIdentitySchema.parse({});
}

/** engine = accuracy-first; fast = latency-first (narration / color). */
export type LlmTier = "engine" | "fast";

type ProviderConfig = {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelEngine: string;
  modelFast: string;
  /** Some reasoning models accept only their default temperature. */
  supportsTemperature?: boolean;
  /** Disable when an outer provider router owns fallback behavior. */
  fallbackOnError?: boolean;
  /** Slower compatible providers can extend per-operation deadlines. */
  timeoutMultiplier?: number;
};

type ChatOpts = {
  tier?: LlmTier;
  timeoutMs?: number;
  temperature?: number;
  label?: string;
};

/**
 * OpenAI-compatible chat provider (xAI, Venice, etc.).
 * Falls back to mock behavior if the key is missing or the call fails hard.
 *
 * Two model tiers:
 * - engine: structured generation (chars, policies, referee) — slower/stronger
 * - fast: turn narration / situation color — low latency, non-reasoning preferred
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly models: { engine: string; fast: string };
  private client: OpenAI | null;
  private modelEngine: string;
  private modelFast: string;
  private fallback = new MockLlmProvider();
  private supportsTemperature: boolean;
  private fallbackOnError: boolean;
  private timeoutMultiplier: number;

  constructor(cfg: ProviderConfig) {
    this.name = cfg.name;
    this.modelEngine = cfg.modelEngine;
    this.modelFast = cfg.modelFast || cfg.modelEngine;
    this.models = { engine: this.modelEngine, fast: this.modelFast };
    this.supportsTemperature = cfg.supportsTemperature ?? true;
    this.fallbackOnError = cfg.fallbackOnError ?? true;
    this.timeoutMultiplier = Math.max(0.5, cfg.timeoutMultiplier ?? 1);
    this.client = cfg.apiKey
      ? new OpenAI({
          apiKey: cfg.apiKey,
          baseURL: cfg.baseUrl,
          // Default SDK timeout; per-call overrides apply for fast tier
          timeout: 28_000,
          maxRetries: 0,
        })
      : null;
    console.info(
      `[llm] ${this.name} ready engine=${this.modelEngine} fast=${this.modelFast}`,
    );
  }

  private modelFor(tier: LlmTier): string {
    return tier === "fast" ? this.modelFast : this.modelEngine;
  }

  private fallbackOrThrow<T>(error: unknown, fallback: () => T): T {
    if (!this.fallbackOnError) throw error;
    return fallback();
  }

  private async chatJson(
    system: string,
    user: string,
    opts?: ChatOpts,
  ): Promise<unknown> {
    if (!this.client) {
      throw new Error("LLM client not configured");
    }
    const tier: LlmTier = opts?.tier ?? "engine";
    const model = this.modelFor(tier);
    const timeoutMs = Math.round(
      (opts?.timeoutMs ?? (tier === "fast" ? 12_000 : 24_000)) *
        this.timeoutMultiplier,
    );
    const temperature =
      opts?.temperature ?? (tier === "fast" ? 0.85 : 0.45);
    const label = opts?.label ?? tier;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await this.client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          ...(this.supportsTemperature ? { temperature } : {}),
          response_format: { type: "json_object" },
        },
        { signal: controller.signal, timeout: timeoutMs },
      );
      const text = resp.choices[0]?.message?.content ?? "{}";
      console.info(
        `[llm] ${this.name}/${label} model=${model} ok ${Date.now() - started}ms`,
      );
      return JSON.parse(text) as unknown;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[llm] ${this.name}/${label} model=${model} fail ${Date.now() - started}ms: ${msg.slice(0, 160)}`,
      );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  private async chatJsonWithCharacterTools(
    system: string,
    user: string,
    referenceTools: CharacterReferenceTools | undefined,
    opts?: ChatOpts,
  ): Promise<unknown> {
    if (!referenceTools) return this.chatJson(system, user, opts);
    if (!this.client) throw new Error("LLM client not configured");

    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "search_own_characters",
          description: "Search characters owned by the current user. Use this before creating a relative, partner, rival, or lookalike.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Name, alias, trait, or relationship clue. Empty lists all owned characters." },
              limit: { type: "integer", minimum: 1, maximum: 8 },
            },
            required: ["query"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_own_character",
          description: "Get an owned character's private profile after finding its id. Other users' characters are inaccessible.",
          parameters: {
            type: "object",
            properties: { characterId: { type: "string" } },
            required: ["characterId"],
            additionalProperties: false,
          },
        },
      },
    ];
    const ownedCharacterIndex = (await referenceTools.search("", 8)).map(
      (reference) => ({
        id: reference.id,
        displayName: reference.displayName,
        realName: reference.identity.realName,
        nicknames: reference.identity.nicknames,
        epithets: reference.identity.epithets,
        traits: reference.traits.slice(0, 4),
      }),
    );
    const userWithReferences = ownedCharacterIndex.length > 0
      ? `${user}\n\nOwner-scoped character index (use tools if relevant):\n${JSON.stringify(ownedCharacterIndex)}`
      : user;
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: userWithReferences },
    ];
    const timeoutMs = Math.round(
      (opts?.timeoutMs ?? 28_000) * this.timeoutMultiplier,
    );
    for (let round = 0; round < 4; round += 1) {
      const response = await this.client.chat.completions.create({
        model: this.modelFor(opts?.tier ?? "engine"),
        messages,
        tools,
        tool_choice: "auto",
        ...(this.supportsTemperature
          ? { temperature: opts?.temperature ?? 0.45 }
          : {}),
        response_format: { type: "json_object" },
      }, { timeout: timeoutMs });
      const message = response.choices[0]?.message;
      if (!message) throw new Error("LLM returned no message");
      const calls = (message.tool_calls ?? []).filter((call) => call.type === "function");
      if (calls.length === 0) return JSON.parse(message.content ?? "{}");
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: calls,
      });
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        } catch {
          // Invalid arguments produce an empty result, never a broader query.
        }
        const result = call.function.name === "search_own_characters"
          ? await referenceTools.search(String(args.query ?? ""), Number(args.limit ?? 8))
          : call.function.name === "get_own_character"
            ? await referenceTools.get(String(args.characterId ?? ""))
            : null;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    throw new Error("Character reference tool round limit exceeded");
  }

  async generateCharacter(input: GenerateCharacterInput): Promise<GenerateCharacterResult> {
    const { prompt, referenceTools } = input;
    if (!this.client) return this.fallback.generateCharacter(input);
    try {
      const data = (await this.chatJsonWithCharacterTools(
        `You create RPG character sheets as JSON. Never include advice to show raw numbers to players.
Return JSON: {
  "displayName": string,
  "identity": { "realName": string|null, "nicknames": string[], "selfNames": string[],
    "epithets": string[], "gender": string|null, "age": string|null },
  "tags": string[],
  "appearance": { "summary": string, "visualPrompt": string },
  "traits": string[],
  "parameters": { "hp": number, "maxHp": number, "mp": number, "maxMp": number,
    "stamina": number, "maxStamina": number, "atk": number, "def": number,
    "spd": number, "mag": number, "res": number, "focus": number, "luck": number },
  "basicAttack": { "name": string, "description": string,
    "targetParameter": "hp"|"mp"|"stamina"|"maxHp"|"maxMp"|"maxStamina"|"atk"|"def"|"spd"|"mag"|"res"|"focus"|"luck",
    "scalingParameter": same parameter enum, "resistanceParameter": same parameter enum,
    "power": number, "element"?: string },
  "skills": [{ "name": string, "description": string, "costMp": number, "costStamina": number,
    "power": number, "kind": "attack"|"magic"|"defend"|"support"|"special"|"status", "element"?: string,
    "effects"?: [{ "target": "self"|"foe", "parameter": parameter enum, "delta": number }] }],
  "weapon": { "name": string, "description": string, "atkBonus"?: number, "defBonus"?: number,
    "magBonus"?: number, "effects"?: [{ "parameter": parameter enum, "delta": number }] } | null,
  "armor": same equipment shape | null,
  "narrativeBlurb": string,
  "assistantMessage": string
}
Parameters should be balanced around hp 80-120, atk/def 8-16. Never create unbeatable gods.
When the request refers to the user's other character, a relative, partner, rival, or someone similar, use search_own_characters and then get_own_character before generating. Preserve the requested relationship while creating meaningful differences.
BALANCE (mandatory):
- Every absolute strength (最強武器, 無敵の防御, 必中, 無限魔力, 超幸運…) MUST have an implicit weakness in traits and narrativeBlurb (隙・脆さ・代償・条件付き).
- skill power typically 0.8–1.5 (never above 1.8). Strong skills need higher MP/stamina cost.
- Basic attacks may primarily reduce HP, MP, stamina, a maximum, or a combat stat. Match the character concept.
- Status changes are temporary: every parameter drifts back toward its original sheet value each turn.
- Every beneficial status effect needs a cost: MP/stamina, a negative self effect, or spending the action turn.
- Equipment with a positive effect MUST include a negative parameter tradeoff.
- weapon/armor bonuses modest; no item that boosts everything.
- Prefer interesting counters over raw dominance so matches stay two-sided.
appearance.visualPrompt must be a detailed English portrait prompt for image gen:
face, hair, eyes, outfit colors, no combat stats numbers.
CRITICAL for visualPrompt/summary: adult character (20s+), fully clothed modest outfit,
NO child/teen/schoolgirl, NO torn/slipping clothes, NO exposure, NO sexualization.
Safe-for-work anime portrait only.`,
        prompt,
        referenceTools,
        { tier: "engine", label: "generateCharacter" },
      )) as Record<string, unknown>;

      const skillsRaw = Array.isArray(data.skills) ? data.skills : [];
      const skills = skillsRaw
        .map(parseGeneratedSkill)
        .filter((skill): skill is NonNullable<typeof skill> => skill != null);
      if (skills.length === 0 && !this.fallbackOnError) {
        throw new Error("Character generation returned no valid skills");
      }

      const weapon = parseGeneratedEquipment(data.weapon) ?? null;
      const armor = parseGeneratedEquipment(data.armor) ?? null;

      const rawSheet = {
          displayName: String(data.displayName ?? "挑戦者"),
          identity: parseGeneratedIdentity(data.identity),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          appearance: {
            summary: String((data.appearance as { summary?: string })?.summary ?? prompt.slice(0, 100)),
            visualPrompt: String(
              (data.appearance as { visualPrompt?: string })?.visualPrompt ?? prompt,
            ),
            imageUrl: null as string | null,
          },
          traits: Array.isArray(data.traits) ? data.traits.map(String) : [],
          parameters: defaultParameters(
            (data.parameters as Record<string, number>) ?? {},
          ),
          basicAttack: parseGeneratedBasicAttack(data.basicAttack),
          skills: skills.length
            ? skills
            : (await this.fallback.generateCharacter(input)).sheet.skills,
          weapon: weapon
            ? weapon
            : null,
          armor: armor
            ? armor
            : null,
          combatFlags: { canFight: true, irreversibleIncapacitated: false },
          narrativeBlurb: String(data.narrativeBlurb ?? ""),
      };
      return {
        sheet: balanceCharacterCombatFields(rawSheet),
        assistantMessage: String(
          data.assistantMessage ?? "キャラクターを生成しました。",
        ),
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.generateCharacter(input));
    }
  }

  async inferCharacterIdentity(current: CharacterSheet): Promise<CharacterIdentity> {
    if (!this.client) return this.fallback.inferCharacterIdentity(current);
    try {
      const data = await this.chatJson(
        `Infer private identity metadata for an existing fictional character. Return JSON only:
{ "realName": string|null, "nicknames": string[], "selfNames": string[], "epithets": string[],
  "gender": string|null, "age": string|null }
Use null or [] when the profile does not establish a value. Do not treat a title or display label as a legal name. Do not invent precision unsupported by the text.`,
        JSON.stringify({
          displayName: current.displayName,
          appearance: current.appearance.summary,
          traits: current.traits,
          narrativeBlurb: current.narrativeBlurb,
        }),
        { tier: "engine", label: "inferCharacterIdentity", temperature: 0.2 },
      );
      return parseGeneratedIdentity(data);
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.inferCharacterIdentity(current));
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
{ "assistantMessage": string, "displayName"?: string, "identity"?: { "realName": string|null,
  "nicknames": string[], "selfNames": string[], "epithets": string[], "gender": string|null, "age": string|null }, "narrativeBlurb"?: string,
  "traits"?: string[], "parameters"?: object, "basicAttack"?: object,
  "skills"?: array, "weapon"?: object|null, "armor"?: object|null }
Do not tell the user exact numbers.
Use the same basicAttack, skill effects, and equipment effects shapes as character generation.
Status changes are temporary and drift toward original values every turn. Beneficial effects need MP/stamina, a negative self effect, or the consumed action; positive equipment needs a negative tradeoff.
If the user asks for absolute power, grant flavor but keep an implicit weakness (隙・脆さ・条件付き). Never remove all counters.`,
        JSON.stringify({
          currentPublic: {
            displayName: current.displayName,
            traits: current.traits,
            narrativeBlurb: current.narrativeBlurb,
            skillNames: current.skills.map((s) => s.name),
          },
          privateIdentity: current.identity,
          // Server-only context for the model:
          hiddenParameters: current.parameters,
          hiddenCombatOptions: {
            basicAttack: current.basicAttack,
            skills: current.skills,
            weapon: current.weapon,
            armor: current.armor,
          },
          userMessage,
        }),
        { tier: "engine", label: "adjustCharacter", temperature: 0.5 },
      )) as Record<string, unknown>;

      return {
        sheetPatch: {
          displayName: data.displayName
            ? String(data.displayName)
            : current.displayName,
          identity: data.identity
            ? parseGeneratedIdentity(data.identity)
            : current.identity,
          narrativeBlurb: data.narrativeBlurb
            ? String(data.narrativeBlurb)
            : current.narrativeBlurb,
          traits: Array.isArray(data.traits)
            ? data.traits.map(String)
            : current.traits,
          parameters: data.parameters
            ? { ...current.parameters, ...(data.parameters as object) }
            : current.parameters,
          basicAttack: data.basicAttack
            ? (parseGeneratedBasicAttack(data.basicAttack) ?? current.basicAttack)
            : current.basicAttack,
          skills: Array.isArray(data.skills)
            ? data.skills
                .map(parseGeneratedSkill)
                .filter((skill): skill is NonNullable<typeof skill> => skill != null)
            : current.skills,
          weapon:
            data.weapon === undefined
              ? current.weapon
              : data.weapon === null
                ? null
                : (parseGeneratedEquipment(data.weapon) ?? current.weapon),
          armor:
            data.armor === undefined
              ? current.armor
              : data.armor === null
                ? null
                : (parseGeneratedEquipment(data.armor) ?? current.armor),
        },
        assistantMessage: String(data.assistantMessage ?? "調整しました。"),
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.adjustCharacter(current, userMessage));
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
        { tier: "engine", label: "generateBattlefield" },
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
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.generateBattlefieldPreset(input));
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
        { tier: "engine", label: "adjustBattlefield", temperature: 0.5 },
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
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.adjustBattlefieldPreset(current, userMessage));
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
        { tier: "engine", label: "concretizeBattlefield" },
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
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.concretizeBattlefield(input));
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
        { tier: "fast", label: "proposeSituation", timeoutMs: 8_000 },
      )) as SituationProposal;
      return data;
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.proposeSituation(input));
    }
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
    if (!this.client) return this.fallback.proposeHappening(input);
    try {
      const data = (await this.chatJson(
        `You are a battle SUPERVISOR for a narrative duel. The fight is getting stagnant.
Inject ONE environmental happening from the battlefield (not a character skill).
Japanese only. Keep it COARSE and short — no step-by-step tactics, no HP numbers.

Return JSON:
{
  "title": string,        // ~6 chars, e.g. 落石, 濃霧, 崩落
  "summary": string,      // one sentence what happens on the field
  "notes": string,        // ongoing battlefield mood after this
  "coefficients": { [key: string]: number }, // 0.25-2.5 keys like damage,spd,wind,water,fire,mag,focus
  "tags": string[],
  "envHits": [{ "target": "a"|"b"|"both", "kind": "damage"|"heal"|"disrupt", "intensity": "minor"|"moderate" }]
}
Rules:
- Must feel like the FIELD acting, not a character move.
- Prefer 0-2 envHits; often "both" with minor disrupt/damage is enough.
- Do not invent firearms/modern UI; match the scene tone.`,
        JSON.stringify({
          scene: input.scene,
          turn: input.turn,
          fighters: [input.sideAName, input.sideBName],
          why: input.stagnationHint,
          field: input.battlefield
            ? {
                name: input.battlefield.displayName,
                category: input.battlefield.category,
                terrain: input.battlefield.terrain,
                obstacles: input.battlefield.obstacles?.slice(0, 4),
                conditions: input.battlefield.conditions?.slice(0, 4),
              }
            : null,
        }),
        { tier: "fast", label: "proposeHappening", timeoutMs: 10_000 },
      )) as {
        title?: string;
        summary?: string;
        notes?: string;
        coefficients?: Record<string, number>;
        tags?: string[];
        envHits?: Array<Record<string, unknown>>;
      };

      const title = String(data.title ?? "").trim() || "異変";
      const summary =
        String(data.summary ?? "").trim() ||
        "戦場の空気がざわつき、膠着が崩れる。";
      const notes =
        String(data.notes ?? "").trim() || "環境の変化が攻防を急かしている。";
      const envHits = Array.isArray(data.envHits)
        ? data.envHits
            .map((h) => {
              const target = h.target;
              const kind = h.kind;
              const intensity = h.intensity;
              if (target !== "a" && target !== "b" && target !== "both") {
                return null;
              }
              if (kind !== "damage" && kind !== "heal" && kind !== "disrupt") {
                return null;
              }
              if (intensity !== "minor" && intensity !== "moderate") {
                return null;
              }
              return { target, kind, intensity } as const;
            })
            .filter((x): x is NonNullable<typeof x> => x != null)
            .slice(0, 3)
        : undefined;

      return {
        title: title.slice(0, 16),
        summary: summary.slice(0, 80),
        notes: notes.slice(0, 80),
        coefficients: data.coefficients,
        tags: Array.isArray(data.tags)
          ? data.tags.map(String).slice(0, 6)
          : undefined,
        envHits,
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.proposeHappening(input));
    }
  }

  async narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string }[];
    battlefield?: BattlefieldInstance | null;
    styleInstruction?: string;
    styleName?: string;
  }): Promise<NarrationResult> {
    if (!this.client) return this.fallback.narrateTurn(input);
    try {
      const styleBlock = input.styleInstruction?.trim()
        ? `Narration style「${input.styleName ?? "custom"}」: ${input.styleInstruction.trim()}`
        : "Narration style: 落ち着いた標準の物語調。";
      const data = (await this.chatJson(
        `Narrate a turn-based duel in Japanese.
${styleBlock}
Use battlefield flavor (terrain/obstacles) when relevant.
If events include 【ハプニング】, feature that environmental beat clearly in the narrator lines first.
JSON:
{ "turn": number, "narrator": string[], "speeches": [{ "speaker": string, "text": string }] }
Do not mention numeric HP/MP/ATK values. Character lines should be short spoken Japanese without brackets.`,
        JSON.stringify({
          turn: input.turn,
          scene: input.scene,
          sideAName: input.sideAName,
          sideBName: input.sideBName,
          events: input.events,
          battlefield: input.battlefield
            ? {
                displayName: input.battlefield.displayName,
                terrain: input.battlefield.terrain,
                obstacles: input.battlefield.obstacles?.slice(0, 4),
              }
            : null,
        }),
        { tier: "fast", label: "narrateTurn", timeoutMs: 14_000, temperature: 0.9 },
      )) as NarrationResult;
      return {
        turn: input.turn,
        narrator: data.narrator ?? [],
        speeches: data.speeches ?? [],
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.narrateTurn(input));
    }
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
    if (!this.client) return this.fallback.narratePrologue(input);
    try {
      const styleBlock = input.styleInstruction?.trim()
        ? `Narration style「${input.styleName ?? "custom"}」: ${input.styleInstruction.trim()}`
        : "Narration style: 落ち着いた標準の物語調。";
      const rivalryRule = input.priorMatchSummary?.trim()
        ? `因縁 MUST weave in this prior matchup summary (paraphrase, do not invent a conflicting past): ${input.priorMatchSummary.trim()}`
        : "因縁: no prior match on record — invent a light plausible fate/rivalry from character blurbs only.";
      const data = (await this.chatJson(
        `You write the PROLOGUE of a duel (Japanese), before any combat.
${styleBlock}
Include: atmosphere of the field, each fighter's opening presence / monologue vibe, and rivalry or fate (因縁).
${rivalryRule}
No combat resolution yet. No numeric stats.
4–8 narrator lines + 1–3 short spoken lines.
JSON:
{ "turn": 0, "narrator": string[], "speeches": [{ "speaker": string, "text": string }] }`,
        JSON.stringify({
          scene: input.scene,
          sideA: {
            name: input.sideAName,
            blurb: input.sideABlurb,
            traits: input.sideATraits,
          },
          sideB: {
            name: input.sideBName,
            blurb: input.sideBBlurb,
            traits: input.sideBTraits,
          },
          policyHint: input.policySummary,
          priorMatch: input.priorMatchSummary ?? null,
          field: input.battlefield
            ? {
                name: input.battlefield.displayName,
                terrain: input.battlefield.terrain,
                setup: input.battlefield.narrativeSetup,
                obstacles: input.battlefield.obstacles?.slice(0, 4),
                conditions: input.battlefield.conditions?.slice(0, 3),
              }
            : null,
        }),
        {
          tier: "fast",
          label: "narratePrologue",
          timeoutMs: 14_000,
          temperature: 0.9,
        },
      )) as NarrationResult;
      const narrator = data.narrator?.length
        ? data.narrator
        : ["——開幕——", "両者の視線が交わる。"];
      if (!narrator[0]?.includes("開幕") && !narrator[0]?.includes("プロローグ")) {
        narrator.unshift("——開幕——");
      }
      return {
        turn: 0,
        narrator,
        speeches: data.speeches ?? [],
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.narratePrologue(input));
    }
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
    if (!this.client) return this.fallback.narrateAftermath(input);
    try {
      const styleBlock = input.styleInstruction?.trim()
        ? `Narration style「${input.styleName ?? "custom"}」: ${input.styleInstruction.trim()}`
        : "Narration style: 落ち着いた標準の物語調。";
      const data = (await this.chatJson(
        `You write the AFTERMATH of a duel (Japanese), not a new combat turn.
${styleBlock}
Someone is already incapacitated. Show what becomes of the fallen and how the winner (if any) closes the scene.
Use battlefield flavor. Keep it emotional / cinematic but short (3–6 narrator lines).
Optional 0–2 short spoken lines.
Do NOT invent a new fight, healing that reverses the win, or numeric stats.
JSON:
{ "turn": number, "narrator": string[], "speeches": [{ "speaker": string, "text": string }] }`,
        JSON.stringify({
          turn: input.turn,
          scene: input.scene,
          fighters: [input.sideAName, input.sideBName],
          winnerSide: input.winnerSide,
          winnerName: input.winnerName,
          fallen: input.fallenNames,
          field: input.battlefield
            ? {
                name: input.battlefield.displayName,
                terrain: input.battlefield.terrain,
                conditions: input.battlefield.conditions?.slice(0, 3),
              }
            : null,
          recent: input.recentNarration?.slice(-6),
        }),
        {
          tier: "fast",
          label: "narrateAftermath",
          timeoutMs: 14_000,
          temperature: 0.9,
        },
      )) as NarrationResult;
      return {
        turn: input.turn,
        narrator: data.narrator?.length
          ? data.narrator
          : ["——決着の余波——", "戦場に余韻だけが残った。"],
        speeches: data.speeches ?? [],
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.narrateAftermath(input));
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
      "myHpBelow"?: number,   // MUST be 0..1 ratio (e.g. 0.4), NEVER 0-100 percent
      "myHpAbove"?: number,
      "foeHpBelow"?: number,
      "foeHpAbove"?: number,
      "always"?: boolean
    }
  }]
}
Rules:
- Generate 5–6 DISTINCT coarse postures. Keep language plain and vague on purpose.
- trigger HP fields are fractions 0..1 only (0.35 = 35% HP). Never use 35 or 40 as percent integers.
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
        { tier: "engine", label: "generateBattlePolicies", temperature: 0.55 },
      )) as {
        rationale?: string;
        options?: Array<Record<string, unknown>>;
      };

      const clamp = (s: string, max: number, fallback: string) => {
        const t = s.replace(/\s+/g, " ").trim() || fallback;
        return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
      };

      const clampRatio = (v: unknown): number | undefined => {
        if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
        if (v > 1 && v <= 100) return Math.min(1, Math.max(0, v / 100));
        if (v > 100) return 1;
        if (v < 0) return 0;
        return v;
      };
      const validBias = new Set([
        "attack",
        "defend",
        "support",
        "wait",
        "mixed",
      ]);

      const raw = Array.isArray(data.options) ? data.options : [];
      const options: BattlePolicyOption[] = raw.map((o, i) => {
        const triggers = (o.triggers as Record<string, unknown>) ?? {};
        const biasRaw = String(o.bias ?? "mixed").toLowerCase();
        const bias = (
          validBias.has(biasRaw) ? biasRaw : "mixed"
        ) as BattlePolicyOption["bias"];
        return {
          id: newId("pol"),
          title: clamp(String(o.title ?? `方針${i + 1}`), 12, `方針${i + 1}`),
          when: clamp(String(o.when ?? "状況が動いたとき"), 28, "状況が動いたとき"),
          then: clamp(String(o.then ?? "柔軟に対応する"), 32, "柔軟に対応する"),
          bias,
          priority: Math.round(Number(o.priority ?? 50 - i) || 0),
          defaultSelected: Boolean(o.defaultSelected ?? i < 3),
          triggers: {
            earlyTurn: triggers.earlyTurn ? true : undefined,
            lateTurn: triggers.lateTurn ? true : undefined,
            myHpBelow: clampRatio(triggers.myHpBelow),
            myHpAbove: clampRatio(triggers.myHpAbove),
            foeHpBelow: clampRatio(triggers.foeHpBelow),
            foeHpAbove: clampRatio(triggers.foeHpAbove),
            always: triggers.always ? true : undefined,
          },
        };
      });

      if (options.length === 0) {
        if (!this.fallbackOnError) {
          throw new Error("Policy generation returned no valid options");
        }
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
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.generateBattlePolicies(input));
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
        { tier: "engine", label: "referee", temperature: 0.3, timeoutMs: 12_000 },
      )) as RefereeResult;
      return data;
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.referee(input));
    }
  }

  async generateNarrationStyle(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
  }> {
    if (!this.client) {
      return this.fallback.generateNarrationStyle?.(prompt) ?? {
        displayName: "カスタム",
        description: prompt.slice(0, 80),
        instruction: `次の雰囲気で語る: ${prompt}`,
        tags: ["custom"],
      };
    }
    try {
      const data = (await this.chatJson(
        `Create a battle NARRATION STYLE (Japanese) from the user's free-text request.
Return JSON:
{
  "displayName": string,   // short name ≤12 chars
  "description": string,   // one-line picker blurb
  "instruction": string,   // LLM instruction for how to narrate turns (Japanese, 1–4 sentences)
  "tags": string[]         // 1–4 short tags
}
instruction must be style-only (tone, density, POV). No combat rules, no HP numbers.`,
        prompt,
        { tier: "fast", label: "generateNarrationStyle", timeoutMs: 12_000 },
      )) as Record<string, unknown>;
      return {
        displayName: String(data.displayName ?? "カスタム").slice(0, 24),
        description: String(data.description ?? prompt).slice(0, 200),
        instruction: String(
          data.instruction ?? `次の雰囲気で語る: ${prompt}`,
        ).slice(0, 2000),
        tags: Array.isArray(data.tags)
          ? data.tags.map(String).slice(0, 6)
          : [],
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => ({
        displayName: "カスタム",
        description: prompt.slice(0, 80),
        instruction: `次の雰囲気で語る: ${prompt}`,
        tags: ["custom"],
      }));
    }
  }
}
