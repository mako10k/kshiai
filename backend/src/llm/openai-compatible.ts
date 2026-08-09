import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  BasicAttackProfileSchema,
  BattlefieldSemanticSeedSchema,
  PerceptionEvidenceSetSchema,
  NarratorRecognitionUpdateSchema,
  TurnSemanticPatchSchema,
  CharacterAgentStateSchema,
  CharacterActionIntentSchema,
  CharacterIdentitySchema,
  DecisionProfileSchema,
  FreeActionAdjudicationBatchSchema,
  EquipmentSchema,
  SkillSchema,
  balanceCharacterCombatFields,
  clampCoefficientMap,
  coalesceNonEmptyList,
  defaultParameters,
  coerceCharacterSpeech,
  coerceSpeakerDisplayLabel,
  canonicalSelfReference,
  extractStreamingNarrator,
  focusInstruction,
  isStageReaction,
  parseNarrationFocus,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type BattleSemanticState,
  type SemanticObservationState,
  type BattlePolicyOption,
  type CharacterSheet,
  type CharacterIdentity,
  type InnerDigest,
  type NarrationFocus,
  type NarrationPerspective,
  type NarratorRecognitionUpdate,
} from "@kshiai/shared";
import type {
  AdjustBattlefieldResult,
  AdjustCharacterResult,
  AftermathNarrationResult,
  AnalyzeCharacterImprovementInput,
  AnalyzeCharacterImprovementResult,
  BattleHistoryTools,
  GenerateBattlefieldResult,
  GenerateCharacterResult,
  GenerateCharacterInput,
  GenerateImprovementPromptInput,
  GenerateImprovementPromptResult,
  JudgmentNarrationResult,
  CharacterReferenceTools,
  CharacterSpeechSource,
  RefereeTurnFact,
  LlmProvider,
  NarrationResult,
  NarrationStreamProgress,
  RefereeResult,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";
import { MockLlmProvider } from "./mock.js";
import {
  COMBINED_PERCEPTION_RESPONSE_FORMAT,
  COMBINED_PERCEPTION_SYSTEM_PROMPT,
  WORLD_PERCEPTION_RESPONSE_FORMAT,
  WORLD_RECONCILIATION_SYSTEM_PROMPT,
  type PerceptionPromptResponseFormat,
} from "./perception-prompt-strategy.js";
import { reviewedPerceptionTopology } from "./perception-topology.js";

const NARRATION_IDENTIFIER_RULES = `Identifier containment is mandatory. Values used as IDs, controlId, perceptId, contact IDs, entity keys, action IDs, event IDs, or JSON paths are non-linguistic control metadata.
NEVER copy, quote, speak, parenthesize, or use any such identifier as a name in narrator lines, speaker fields, or speech text. Use the matching renderLabel or supplied human display name only.
If a subjective view marks a subject unknown, suspected, unperceived, or unidentifiable, preserve that uncertainty and never infer the hidden identity from another input field.`;

const NARRATION_PROFILE_RULES = `profileAnchors are presentation-only canonical wording constraints, not observations, actions, events, or permission to reveal private profile facts.
Never contradict a non-null gender, age, self-name, display name, or appearance in an available anchor. currentStateOverrides, when present, override only the conflicting present-tense appearance/equipment detail in that same anchor; the immutable base profile remains historical/identity context. Do not announce or explain any fact merely because it appears in an anchor.
sceneStateFacts are engine-derived current object placements, not background flavor or permission to invent an action. Preserve them when describing those objects, and never restore an object to its original place merely because a base profile or battlefield description says otherwise.
When an anchor is absent, or gender/age/selfNames is null or empty, use the supplied participant label or neutral Japanese wording. Never infer gender, age, anatomy, species, pronouns, or a legal identity from names, style, role, traits, speech, or appearance.
Never write profileAnchors or sceneStateFacts into a character's cognition, memory, world state, effects, or result.`;

const NARRATION_CONTINUITY_RULES = `Narrator continuity is bounded presentation memory, not new world evidence and never character cognition. Current view/perception remains authoritative for present access and attribution. Reader-known labels must not become character knowledge, and remembered identity must not make a currently uncertain voice certain.
When an existing recognition has continuity same_entity, keep recognizing that subject as recognizedAs even if current access becomes weak or absent. Do not reset it to an unknown person or voice merely because a turn changed, the viewpoint changed, or only the voice is currently available. possibly_same_entity may lower attribution wording while retaining the remembered identity; unlinked means the currently perceived form is not established as that remembered subject.
When focus permits innerDigests and a non-empty interior conclusion is supplied, weave at least one concise inner beat into the prose without exposing chain-of-thought. External focus must remain observable-only.`;

const NARRATOR_RECOGNITION_RULES = `recognitionUpdates are narrator-only cognition returned in this same narration response; they never change character cognition, canonical events, world state, or battle mechanics.
Each subjectRef must exactly match one recognitionSubjects subjectRef supplied to this call. Never place subjectRef in prose or a speaker label. Emit an update only when the current view supports recognizing, questioning, or unlinking that subject. Omission preserves the prior recognition. same_entity preserves an already identified recognizedAs; temporary occlusion, weak audio, turn changes, and viewpoint switches alone are not identity changes.`;

function normalizedSpeechFacts(value: string): string {
  return value.normalize("NFKC").replace(/[\s「」『』（）()、。！？!?…・]/g, "");
}

/** Canonical speaker names stay server-side; narration receives only view-safe rendering data. */
function narratorVisibleCharacterSpeeches(
  sources: readonly CharacterSpeechSource[],
) {
  return sources.map((source) => ({
    sourceSide: source.side,
    text: source.text,
    displayLabel: source.displayLabel ?? "発話者",
    displayContext: source.displayContext ?? null,
  }));
}

function normalizeNarratorRecognitionUpdates(
  raw: unknown,
): NarratorRecognitionUpdate[] {
  if (!Array.isArray(raw)) return [];
  const updates = new Map<string, NarratorRecognitionUpdate>();
  for (const candidate of raw.slice(0, 16)) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as Record<string, unknown>;
    const subjectRef = typeof row.subjectRef === "string"
      ? row.subjectRef.trim().slice(0, 160)
      : "";
    const recognizedAs = coerceSpeakerDisplayLabel(row.recognizedAs, "");
    const parsed = NarratorRecognitionUpdateSchema.safeParse({
      subjectRef,
      recognizedAs,
      identityKnowledge: row.identityKnowledge,
      continuity: row.continuity,
    });
    if (parsed.success) updates.set(parsed.data.subjectRef, parsed.data);
  }
  return [...updates.values()];
}

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
  responseFormat?: PerceptionPromptResponseFormat;
  /** Invoked with the cumulative assistant text while tokens stream in. */
  onText?: (fullText: string) => void;
};

/**
 * OpenAI-compatible chat provider (xAI, Venice, etc.).
 * Optional mock fallback exists only for explicitly constructed development
 * providers. The application factory disables it for real provider chains.
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
    this.fallbackOnError = cfg.fallbackOnError ?? false;
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
    if (opts?.onText) {
      return this.chatJsonStream(system, user, opts);
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
          response_format: opts?.responseFormat ?? { type: "json_object" },
        },
        { signal: controller.signal, timeout: timeoutMs },
      );
      const text = resp.choices[0]?.message?.content ?? "{}";
      opts?.onText?.(text);
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

  async prepareBattleEncounter(
    input: Parameters<LlmProvider["prepareBattleEncounter"]>[0],
  ): ReturnType<LlmProvider["prepareBattleEncounter"]> {
    if (!this.client) return this.fallback.prepareBattleEncounter(input);
    try {
      const data = await this.chatJson(
        `Prepare immutable presentation and relationship terms for one fictional confrontation.
Return JSON only:
{
  "participants": {
    "a": { "battleLabel": string },
    "b": { "battleLabel": string }
  },
  "social": {
    "a": { "relationshipLabel": string, "counterpartAddress": string, "selfReference": string|null },
    "b": { "relationshipLabel": string, "counterpartAddress": string, "selfReference": string|null }
  },
  "openingSummary": string
}
Rules:
- battleLabel is a short unique name used only in this battle; prefer an established nickname or display name.
- relationship and address are asymmetric and may reflect supplied profile or prior-match facts, but must not invent kinship, romance, history, gender, or identity.
- selfReference must be exactly one supplied selfNames value or null.
- openingSummary is factual, short Japanese prose grounded only in supplied characters, field, and prior match.
- Do not decide mechanics, perception access, disguise, transformation, winner, actions, or speech.`,
        JSON.stringify(input),
        { tier: "fast", label: "prepareBattleEncounter", temperature: 0.35 },
      );
      return data as Awaited<ReturnType<LlmProvider["prepareBattleEncounter"]>>;
    } catch (error) {
      return this.fallbackOrThrow(
        error,
        () => this.fallback.prepareBattleEncounter(input),
      );
    }
  }

  async adjudicateFreeActions(
    input: Parameters<LlmProvider["adjudicateFreeActions"]>[0],
  ): ReturnType<LlmProvider["adjudicateFreeActions"]> {
    if (!this.client) return this.fallback.adjudicateFreeActions(input);
    try {
      const data = await this.chatJson(
        `Interpret up to two fictional free-action attempts against server-only canonical roots.
Return JSON only:
{
  "proposals": [{
    "actorSide": "a"|"b",
    "outcome": "possible"|"impossible"|"contested",
    "interpretation": string,
    "subject"?: {
      "rootRef": string,
      "candidateKey": string,
      "canonicalLabel": string|null,
      "description": string,
      "portable": boolean,
      "usable": boolean,
      "knownOpenAspects": string[],
      "causalEnvelope": {
        "damage"?: "none"|"minor"|"moderate",
        "defense"?: "none"|"minor"|"moderate",
        "reach"?: "none"|"minor"|"moderate",
        "control"?: "none"|"minor"|"moderate",
        "mobility"?: "none"|"minor"|"moderate",
        "vision"?: "none"|"minor"|"moderate",
        "hearing"?: "none"|"minor"|"moderate",
        "cover"?: "none"|"minor"|"moderate"
      }
    },
    "changes": [{
      "target": "subject"|"actor"|"counterpart",
      "path": string,
      "value": any
    }],
    "successSummary": string,
    "failureSummary": string
  }]
}
Rules:
- Character intent is observer belief and may be mistaken. Canonical roots are the only world facts.
- actors.capabilityEvidence is the only special-capability authority. Ordinary bodily actions remain possible, but reject superhuman reach, force, speed, transformation, or equipment use that it does not support.
- Bind by physical target continuity, not by trusting the noun in intent.description.
- If the perceived stone is canonically a ball, bind to that root and preserve its canonicalLabel.
- If no canonical root supports the subject, return impossible with no subject and no changes. Never create an object from the claim alone.
- rootKind=character anchors an existing person, never an object promotion. For a plausible grab, use /actorState/restraint with partially_restrained; do not put a character in held/worn placement.
- canonicalAccessByActor is server-only distance. Contact manipulation may use contact or near when one ordinary step is plausible; far, separate_area, and out_of_scene attempts are impossible unless capabilityEvidence explicitly supports that reach.
- canonicalLabel must exactly copy a non-null root canonicalLabel. For a null profile-appearance root, infer only an ordinary item directly supported by its description; otherwise keep null.
- Allowed generic paths are /placement, /actorState/restraint, /actorState/posture, /exposure, and /objectState/cover. Use existing world enum-shaped values.
- Use /placement held by character.<side> for a successful pickup. A failed reach has no success change.
- Free actions never change HP, MP, parameters, canFight, identity, consciousness, agency, history, or winner.
- causalEnvelope is qualitative planning input, not damage authority; improvised objects may be at most moderate.
- Return exactly one proposal for each supplied intent and do not expose canonical facts in successSummary when the actor would not perceive them.`,
        JSON.stringify(input),
        {
          tier: "fast",
          label: "adjudicateFreeActions",
          timeoutMs: 14_000,
          temperature: 0.25,
        },
      );
      const parsed = FreeActionAdjudicationBatchSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error("Free-action adjudicator returned an invalid batch");
      }
      return parsed.data;
    } catch (error) {
      return this.fallbackOrThrow(
        error,
        () => this.fallback.adjudicateFreeActions(input),
      );
    }
  }

  /** Stream a JSON object completion; `onText` receives cumulative content. */
  private async chatJsonStream(
    system: string,
    user: string,
    opts: ChatOpts,
  ): Promise<unknown> {
    if (!this.client) {
      throw new Error("LLM client not configured");
    }
    const tier: LlmTier = opts.tier ?? "engine";
    const model = this.modelFor(tier);
    const timeoutMs = Math.round(
      (opts.timeoutMs ?? (tier === "fast" ? 12_000 : 24_000)) *
        this.timeoutMultiplier,
    );
    const temperature =
      opts.temperature ?? (tier === "fast" ? 0.85 : 0.45);
    const label = opts.label ?? tier;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          ...(this.supportsTemperature ? { temperature } : {}),
          response_format: { type: "json_object" },
          stream: true,
        },
        { signal: controller.signal, timeout: timeoutMs },
      );
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        full += delta;
        opts.onText?.(full);
      }
      if (!full.trim()) {
        throw new Error("empty stream completion");
      }
      console.info(
        `[llm] ${this.name}/${label} model=${model} ok stream ${Date.now() - started}ms`,
      );
      return JSON.parse(full) as unknown;
    } catch (e) {
      const msg = e in…19138 tokens truncated…ame?: string | null;
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
        `You design COARSE high-level approaches for a fictional confrontation (Japanese UI cards).
It may be physical, ranged, technological, psychic, social, comedic, cute, or abstract. Preserve the supplied genre and never assume sword combat. These are rough player intentions, NOT detailed tactics or step-by-step plans.

Return JSON:
{
  "rationale": string,  // one short sentence
  "options": [{
    "perspectiveId": string,    // stable ASCII id shared by exactly two options
    "perspectiveTitle": string, // short Japanese viewpoint name
    "title": string,   // short choice label, max ~10 Japanese chars
    "when": string,    // abstract situation only, max ~18 chars
    "then": string,    // rough approach only, max ~20 chars
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
- Generate exactly 3 distinct perspectives and exactly 2 contrasting choices for each perspective (6 options total).
- Good perspectives are genre-neutral questions such as initiative, risk, tempo, openness, or resource use. Adapt them to the supplied character without assuming violence.
- The UI adds a third "お任せ" choice itself, so do not generate an unspecified option.
- trigger HP fields are fractions 0..1 only (0.35 = 35% HP). Never use 35 or 40 as percent integers.
- Prefer broad intentions over combat jargon: 自分から動く / 相手を観察 / 大胆 / 慎重 / 集中 / 温存 など.
- Do NOT write concrete micro-plans (specific skills, named obstacles, exact terrain tricks, HP%, turn numbers, or action sequences).
- Field/character may lightly color the wording, but stay high-level.
- Mark exactly one option in each perspective defaultSelected for autonomous opponents; the user may still choose お任せ.
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
        { tier: "fast", label: "generateBattlePolicies", temperature: 0.55 },
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
          perspectiveId: clamp(
            String(o.perspectiveId ?? `view-${Math.floor(i / 2) + 1}`),
            24,
            `view-${Math.floor(i / 2) + 1}`,
          ),
          perspectiveTitle: clamp(
            String(o.perspectiveTitle ?? `観点${Math.floor(i / 2) + 1}`),
            12,
            `観点${Math.floor(i / 2) + 1}`,
          ),
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

      const grouped = new Map<string, BattlePolicyOption[]>();
      for (const option of options) {
        const group = grouped.get(option.perspectiveId) ?? [];
        if (group.length < 2) group.push(option);
        grouped.set(option.perspectiveId, group);
      }
      const normalized = [...grouped.values()]
        .filter((group) => group.length === 2)
        .slice(0, 3)
        .flat();

      if (normalized.length !== 6) {
        if (!this.fallbackOnError) {
          throw new Error("Policy generation must return three two-choice perspectives");
        }
        return this.fallback.generateBattlePolicies(input);
      }

      // Autonomous opponents get exactly one suggested choice per perspective.
      for (const group of grouped.values()) {
        const selected = group.find((option) => option.defaultSelected) ?? group[0];
        group.forEach((option) => {
          option.defaultSelected = option === selected;
        });
      }

      return {
        options: normalized,
        rationale: String(
          data.rationale ??
            "キャラと戦場に合わせてケース別の方針案を生成しました。",
        ),
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.generateBattlePolicies(input));
    }
  }

  async narrateJudgment(
    input: Parameters<LlmProvider["narrateJudgment"]>[0],
  ): Promise<JudgmentNarrationResult> {
    if (!this.client) return this.fallback.narrateJudgment(input);
    try {
      const styleBlock = input.styleInstruction?.trim()
        ? `Narration style「${input.styleName ?? "custom"}」: ${input.styleInstruction.trim()}`
        : "Narration style: 落ち着いた標準の物語調。";
      const data = (await this.chatJson(
        `Frame an already-decided turn-limit judgment for the user in Japanese.
${styleBlock}
The adjudicator has exclusive authority over winnerSide and adjudicationReason. Recent public narration is context for tone and continuity only. Do not reconsider, contradict, paraphrase, or restate the winner, loser, draw, reason, actions, or outcomes. Do not add character speech. Return only optional atmospheric framing that can surround an immutable server-rendered verdict line.
JSON: { "before": string[], "after": string[] }. Each array has at most 2 short lines.`,
        JSON.stringify({
          turn: input.turn,
          scene: input.scene,
          participants: {
            a: input.sideAName,
            b: input.sideBName,
          },
          judgment: {
            winnerSide: input.winnerSide,
            winnerName: input.winnerName,
            reason: input.adjudicationReason,
          },
          recentPublicNarration: input.recentPublicNarration.slice(-8),
        }),
        {
          tier: "fast",
          label: "narrateJudgment",
          temperature: 0.7,
          timeoutMs: 10_000,
        },
      )) as { before?: unknown; after?: unknown };
      const lines = (value: unknown) => Array.isArray(value)
        ? value.map(String).map((line) => line.trim()).filter(Boolean).slice(0, 2)
        : [];
      return {
        before: lines(data.before),
        after: lines(data.after),
      };
    } catch (error) {
      return this.fallbackOrThrow(
        error,
        () => this.fallback.narrateJudgment(input),
      );
    }
  }

  async referee(input: {
    sideAName: string;
    sideBName: string;
    engineWinnerSide: "a" | "b" | "draw" | null;
    turnFacts: RefereeTurnFact[];
    finalState: import("./types.js").RefereeFinalState;
  }): Promise<RefereeResult> {
    if (!this.client) return this.fallback.referee(input);
    try {
      const data = (await this.chatJson(
        `As a turn-limit adjudicator for a broad fictional confrontation, return raw JSON { "winnerSide": "a"|"b"|"draw", "reason": string, "reasonFacts": [{ "factor": "committed_actions"|"mechanical_effects"|"remaining_capacity"|"world_impact"|"overall_effectiveness", "favoredSide": "a"|"b"|"draw", "statement": string }] } in Japanese. Match the established genre and judge effectiveness without assuming physical violence.
turnFacts and finalState contain bounded committed engine structure. No narrator prose, event summary, or public rendered speech is present. Use only those canonical facts and prefer engineWinnerSide unless the facts clearly require another result. reason and reasonFacts are concise fact-based rationales, not public narration.`,
        JSON.stringify(input),
        { tier: "engine", label: "referee", temperature: 0.3, timeoutMs: 12_000 },
      )) as { winnerSide?: unknown; reason?: unknown; reasonFacts?: unknown };
      const winnerSide = data.winnerSide === "a" ||
          data.winnerSide === "b" || data.winnerSide === "draw"
        ? data.winnerSide
        : input.engineWinnerSide ?? "draw";
      const reason = String(data.reason ?? "").trim() ||
        "確定した行動と影響を総合して判定した。";
      const factors = new Set([
        "committed_actions",
        "mechanical_effects",
        "remaining_capacity",
        "world_impact",
        "overall_effectiveness",
      ]);
      const reasonFacts = Array.isArray(data.reasonFacts)
        ? data.reasonFacts.flatMap((value) => {
            if (!value || typeof value !== "object") return [];
            const item = value as Record<string, unknown>;
            const factor = String(item.factor ?? "");
            const favoredSide = item.favoredSide;
            const statement = String(item.statement ?? "").trim();
            if (
              !factors.has(factor) ||
              (favoredSide !== "a" && favoredSide !== "b" && favoredSide !== "draw") ||
              !statement
            ) return [];
            return [{
              factor: factor as NonNullable<RefereeResult["reasonFacts"]>[number]["factor"],
              favoredSide: favoredSide as "a" | "b" | "draw",
              statement: statement.slice(0, 240),
            }];
          }).slice(0, 6)
        : [];
      return { winnerSide, reason, reasonFacts };
    } catch (error) {
      return this.fallbackOrThrow(error, () => this.fallback.referee(input));
    }
  }

  async analyzeCharacterImprovement(
    input: AnalyzeCharacterImprovementInput,
  ): Promise<AnalyzeCharacterImprovementResult> {
    if (!this.client) {
      return this.fallback.analyzeCharacterImprovement(input);
    }
    try {
      const data = (await this.chatJsonWithBattleHistoryTools(
        `You are a coaching analyst for a fictional character in a turn-based game.
Use search_character_battles and get_character_battle to inspect recent results before concluding.
Return JSON:
{
  "strengths": string[],       // 3–6 concrete good points observed in battles
  "improvements": string[],    // 3–6 safe improvement targets
  "summary": string,           // 2–4 sentence overall read
  "assistantMessage": string   // short owner-facing confirmation
}
LANGUAGE (mandatory):
- Write strengths, improvements, summary, and assistantMessage in the same language as the character's player-facing prose (displayName / narrativeBlurb / skill names). If those are Japanese, output Japanese; if English, output English. Do not force English notes onto a Japanese character.
HARD RULES:
- Preserve the character's concept, personality, appearance, genre, and identity. Never recommend rewriting who they are.
- Strengths: things to KEEP and amplify (playstyle, skill usage, timing, presence).
- Improvements: only practical fight habits that do NOT change core traits or concept (pacing, resource timing, opening caution, closing out wins, field adaptation).
- Do NOT invent absolute power buffs, new identities, personality flips, or genre changes.
- Do NOT mention raw numeric stats (HP/ATK/etc.) or ask the user to edit JSON.
- Prefer evidence from tool results (wins/losses, skills used, event highlights, narration).
- If previous memo exists, update it with newer evidence rather than ignoring it.`,
        JSON.stringify({
          character: input.character,
          previousMemo: input.previousMemo,
          finishedBattles: input.finishedBattles,
        }),
        input.battleTools,
        {
          tier: "engine",
          label: "analyzeCharacterImprovement",
          temperature: 0.35,
          timeoutMs: 40_000,
        },
      )) as Record<string, unknown>;

      const list = (value: unknown) =>
        Array.isArray(value)
          ? value
              .map(String)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 12)
          : [];

      const strengths = list(data.strengths);
      const improvements = list(data.improvements);
      if (strengths.length === 0 && improvements.length === 0) {
        throw new Error("Improvement analysis returned empty notes");
      }
      return {
        strengths:
          strengths.length > 0
            ? strengths
            : ["キャラらしさが戦績に表れている"],
        improvements:
          improvements.length > 0
            ? improvements
            : ["戦い方のタイミングを少し整える余地がある"],
        summary: String(data.summary ?? "直近の戦績を踏まえた分析です。").slice(
          0,
          800,
        ),
        assistantMessage: String(
          data.assistantMessage ?? "良い点と改善点をメモに登録しました。",
        ),
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () =>
        this.fallback.analyzeCharacterImprovement(input),
      );
    }
  }

  async generateImprovementPrompt(
    input: GenerateImprovementPromptInput,
  ): Promise<GenerateImprovementPromptResult> {
    if (!this.client) {
      return this.fallback.generateImprovementPrompt(input);
    }
    try {
      const data = (await this.chatJson(
        `You write a user message for the character adjustment chat.
The message will be sent as-is to an adjustCharacter LLM. Return JSON:
{ "prompt": string, "assistantMessage": string }

LANGUAGE (mandatory):
- Write "prompt" and "assistantMessage" in the same language as the character's player-facing prose and memo notes (Japanese character → Japanese prompt; English character → English prompt).
- Never switch a Japanese profile into an English revision request unless the memo itself is English.

HARD RULES for "prompt":
- Write as the player's instruction in natural prose, 3–8 sentences.
- Explicitly say: do NOT change concept, personality core, appearance, names, or genre.
- Amplify listed strengths; only fix improvements that do not break character identity.
- Prefer tactical/habitual tweaks (timing, skill usage feel, resource pacing, conditional play) over power creep.
- Do not request raw numbers, JSON, or absolute invincibility.
- Keep flavor consistent with the character snapshot.
- Remind the adjuster to keep player-facing text in that same language.
assistantMessage is a short UI confirmation for the owner.`,
        JSON.stringify({
          character: input.character,
          memo: {
            strengths: input.memo.strengths,
            improvements: input.memo.improvements,
            summary: input.memo.summary,
          },
        }),
        {
          tier: "fast",
          label: "generateImprovementPrompt",
          temperature: 0.4,
          timeoutMs: 16_000,
        },
      )) as Record<string, unknown>;

      const prompt = String(data.prompt ?? "").trim();
      if (!prompt) throw new Error("Empty improvement prompt");
      return {
        prompt: prompt.slice(0, 4000),
        assistantMessage: String(
          data.assistantMessage ??
            "会話での修正欄に改善プロンプトを入れました。",
        ),
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () =>
        this.fallback.generateImprovementPrompt(input),
      );
    }
  }

  async generateNarrationStyle(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
    perspective?: NarrationPerspective;
  }> {
    if (!this.client) {
      return this.fallback.generateNarrationStyle?.(prompt) ?? {
        displayName: "カスタム",
        description: prompt.slice(0, 80),
        instruction: `次の雰囲気で語る: ${prompt}`,
        tags: ["custom"],
        perspective: "external",
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
  "tags": string[],        // 1–4 short tags
  "perspective": "self"|"foe"|"external"|"omniscient"|"fluid"
}
instruction is tone/density only. perspective is information rights:
self=player inner only, foe=opponent inner only, external=no inners, omniscient=both, fluid=choose per turn.
Default perspective external unless the user clearly wants subjective/omniscient/shifting camera.`,
        prompt,
        { tier: "fast", label: "generateNarrationStyle", timeoutMs: 12_000 },
      )) as Record<string, unknown>;
      const pRaw = String(data.perspective ?? "external");
      const perspective = (
        ["self", "foe", "external", "omniscient", "fluid"] as const
      ).includes(pRaw as NarrationPerspective)
        ? (pRaw as NarrationPerspective)
        : "external";
      return {
        displayName: String(data.displayName ?? "カスタム").slice(0, 24),
        description: String(data.description ?? prompt).slice(0, 200),
        instruction: String(
          data.instruction ?? `次の雰囲気で語る: ${prompt}`,
        ).slice(0, 2000),
        tags: Array.isArray(data.tags)
          ? data.tags.map(String).slice(0, 6)
          : [],
        perspective,
      };
    } catch (error) {
      return this.fallbackOrThrow(error, () => ({
        displayName: "カスタム",
        description: prompt.slice(0, 80),
        instruction: `次の雰囲気で語る: ${prompt}`,
        tags: ["custom"],
        perspective: "external" as const,
      }));
    }
  }
}
