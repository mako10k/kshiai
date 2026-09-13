import { createHash } from "node:crypto";
import {
  defaultParameters,
  prepareLegacyCharacterDefinitionGenerationV2,
  type CharacterDefinitionV2,
} from "@kshiai/shared";
import { OpenAiCompatibleProvider, type ChatOpts } from "../llm/openai-compatible.js";
import { assertXaiResponseSchema } from "../llm/provider-response-schema.js";
import type { GenerateCharacterDefinitionV2Input } from "../llm/types.js";

export const CHARACTER_AUTHORING_A2_RUN_ID = "character-authoring-a2-2026-09-13";
export const CHARACTER_AUTHORING_A2_MODEL = "grok-4.5";
export const CHARACTER_AUTHORING_A2_PROVIDER = "xai";
export const CHARACTER_AUTHORING_A2_ENDPOINT = "https://api.x.ai/v1/chat/completions";
export const CHARACTER_AUTHORING_A2_MAX_CALLS = 1;
export const CHARACTER_AUTHORING_A2_TIMEOUT_MS = 90_000;
export const CHARACTER_AUTHORING_A2_TEMPERATURE = 0.35;
export const CHARACTER_AUTHORING_A2_MAX_OUTPUT_TOKENS = 4_096;
export const CHARACTER_AUTHORING_A2_FRAMING_TOKENS = 2_048;
export const CHARACTER_AUTHORING_A2_INPUT_USD_PER_MILLION = 2;
export const CHARACTER_AUTHORING_A2_OUTPUT_USD_PER_MILLION = 6;
export const CHARACTER_AUTHORING_A2_MAX_RESERVED_USD = 0.75;
export const CHARACTER_AUTHORING_A2_LABEL = "generateCharacterDefinitionV2";
export const CHARACTER_AUTHORING_A2_SCHEMA_NAME = "character_definition_v2";

const CAPTURE_ONLY = "A2_CAPTURE_ONLY";

export type CharacterAuthoringA2Freeze = Readonly<{
  runId: string;
  provider: typeof CHARACTER_AUTHORING_A2_PROVIDER;
  endpoint: typeof CHARACTER_AUTHORING_A2_ENDPOINT;
  model: typeof CHARACTER_AUTHORING_A2_MODEL;
  label: typeof CHARACTER_AUTHORING_A2_LABEL;
  sourceKind: "create_instruction";
  maxCalls: typeof CHARACTER_AUTHORING_A2_MAX_CALLS;
  retry: Readonly<{
    sdkMaxRetries: 0;
    rateLimitRetries: 0;
    serviceUnavailableRetries: 0;
    definitionRepairFollowUp: false;
    fallbackOnError: false;
  }>;
  timeoutMs: typeof CHARACTER_AUTHORING_A2_TIMEOUT_MS;
  temperature: typeof CHARACTER_AUTHORING_A2_TEMPERATURE;
  schemaName: string;
  schemaDigestSha256: string;
  requestDigestSha256: string;
  serializedRequestBytes: number;
  reservedInputTokens: number;
  reservedOutputTokens: number;
  reservedCostUsd: number;
  maxReservedUsd: typeof CHARACTER_AUTHORING_A2_MAX_RESERVED_USD;
  rates: Readonly<{
    inputUsdPerMillion: typeof CHARACTER_AUTHORING_A2_INPUT_USD_PER_MILLION;
    outputUsdPerMillion: typeof CHARACTER_AUTHORING_A2_OUTPUT_USD_PER_MILLION;
    source: "xAI grok-4.5 list rate as of 2026-09-12; reservation is not an invoice";
  }>;
  productionEffects: Readonly<{
    deployment: false;
    productionDatabase: false;
    authoringRoute: false;
    schema3Activation: false;
  }>;
}>;

class CaptureProvider extends OpenAiCompatibleProvider {
  captured: { system: string; user: string; opts: ChatOpts } | null = null;

  protected override async chatJson(
    system: string,
    user: string,
    opts?: ChatOpts,
  ): Promise<unknown> {
    this.captured = { system, user, opts: opts ?? {} };
    throw new Error(CAPTURE_ONLY);
  }
}

export function characterAuthoringA2Input(): GenerateCharacterDefinitionV2Input {
  const prepared = prepareLegacyCharacterDefinitionGenerationV2({
    id: "a2-synthetic-observer",
    ownerUserId: "a2-synthetic-owner",
    displayName: "観測士ナギ",
    identity: {
      realName: null,
      nicknames: ["ナギ"],
      selfNames: ["私"],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["observer"],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
    appearance: {
      summary: "藍色の外套と記録端末を携えた観測者",
      visualPrompt: "observer in an indigo coat",
      imageUrl: null,
    },
    traits: ["相手の言葉を受けてから問いかける"],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "動作の理由を読み、相手の言葉には質問で返す観測者。",
  });
  return {
    sourceKind: "create_instruction",
    sourceText: "動作の理由を読み、相手の言葉には質問で返す観測者。質問は短く、先に相手を見る。",
    baseDefinition: prepared.baseDefinition,
    unstructuredActionNormSources: [],
  };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 4) + CHARACTER_AUTHORING_A2_FRAMING_TOKENS;
}

function reservedCostUsd(inputTokens: number, outputTokens: number): number {
  return Number((
    (inputTokens / 1_000_000) * CHARACTER_AUTHORING_A2_INPUT_USD_PER_MILLION +
    (outputTokens / 1_000_000) * CHARACTER_AUTHORING_A2_OUTPUT_USD_PER_MILLION
  ).toFixed(4));
}

export async function freezeCharacterAuthoringA2(): Promise<{
  freeze: CharacterAuthoringA2Freeze;
  schema: unknown;
  captured: { system: string; user: string; opts: ChatOpts };
  baseDefinition: CharacterDefinitionV2;
}> {
  const input = characterAuthoringA2Input();
  const provider = new CaptureProvider({
    name: CHARACTER_AUTHORING_A2_PROVIDER,
    apiKey: "a2-capture-only",
    baseUrl: "https://api.x.ai/v1",
    modelEngine: CHARACTER_AUTHORING_A2_MODEL,
    modelFast: "grok-4-fast-non-reasoning",
    fallbackOnError: false,
  });
  try {
    await provider.generateCharacterDefinitionV2(input);
    throw new Error("A2 capture did not intercept chatJson");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== CAPTURE_ONLY) throw error;
  }
  const captured = provider.captured;
  if (!captured) throw new Error("A2 capture stored no request");
  const format = captured.opts.responseFormat;
  if (!format || format.type !== "json_schema") {
    throw new Error("A2 capture missing json_schema response format");
  }
  const schema = format.json_schema.schema;
  assertXaiResponseSchema(schema);
  const serializedRequest = JSON.stringify({
    model: CHARACTER_AUTHORING_A2_MODEL,
    temperature: captured.opts.temperature,
    messages: [
      { role: "system", content: captured.system },
      { role: "user", content: captured.user },
    ],
    response_format: format,
  });
  const serializedRequestBytes = Buffer.byteLength(serializedRequest, "utf8");
  const reservedInputTokens = estimateTokens(serializedRequestBytes);
  if (reservedInputTokens >= 200_000) {
    throw new Error("A2 reservation would enter grok-4.5 long-context rates");
  }
  const reservedOutputTokens = CHARACTER_AUTHORING_A2_MAX_OUTPUT_TOKENS;
  const cost = reservedCostUsd(reservedInputTokens, reservedOutputTokens);
  if (cost > CHARACTER_AUTHORING_A2_MAX_RESERVED_USD) {
    throw new Error(`A2 reserved cost ${cost} exceeds ${CHARACTER_AUTHORING_A2_MAX_RESERVED_USD}`);
  }
  return {
    freeze: {
      runId: CHARACTER_AUTHORING_A2_RUN_ID,
      provider: CHARACTER_AUTHORING_A2_PROVIDER,
      endpoint: CHARACTER_AUTHORING_A2_ENDPOINT,
      model: CHARACTER_AUTHORING_A2_MODEL,
      label: CHARACTER_AUTHORING_A2_LABEL,
      sourceKind: "create_instruction",
      maxCalls: CHARACTER_AUTHORING_A2_MAX_CALLS,
      retry: {
        sdkMaxRetries: 0,
        rateLimitRetries: 0,
        serviceUnavailableRetries: 0,
        definitionRepairFollowUp: false,
        fallbackOnError: false,
      },
      timeoutMs: CHARACTER_AUTHORING_A2_TIMEOUT_MS,
      temperature: CHARACTER_AUTHORING_A2_TEMPERATURE,
      schemaName: String(format.json_schema.name),
      schemaDigestSha256: digest(schema),
      requestDigestSha256: digest(JSON.parse(serializedRequest)),
      serializedRequestBytes,
      reservedInputTokens,
      reservedOutputTokens,
      reservedCostUsd: cost,
      maxReservedUsd: CHARACTER_AUTHORING_A2_MAX_RESERVED_USD,
      rates: {
        inputUsdPerMillion: CHARACTER_AUTHORING_A2_INPUT_USD_PER_MILLION,
        outputUsdPerMillion: CHARACTER_AUTHORING_A2_OUTPUT_USD_PER_MILLION,
        source: "xAI grok-4.5 list rate as of 2026-09-12; reservation is not an invoice",
      },
      productionEffects: {
        deployment: false,
        productionDatabase: false,
        authoringRoute: false,
        schema3Activation: false,
      },
    },
    schema,
    captured,
    baseDefinition: input.baseDefinition,
  };
}
