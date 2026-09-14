import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { CharacterDefinitionV2Schema } from "@kshiai/shared";
import { config } from "../config.js";
import { classifyLlmProviderError } from "../llm/provider-errors.js";
import {
  CHARACTER_AUTHORING_A2_MAX_CALLS,
  CHARACTER_AUTHORING_A2_MODEL,
  CHARACTER_AUTHORING_A2_TIMEOUT_MS,
  freezeCharacterAuthoringA2,
  type CharacterAuthoringA2Freeze,
} from "./character-authoring-a2-freeze.js";

export type CharacterAuthoringA2Class =
  | "schema_rejected"
  | "valid_character_definition_v2"
  | "invalid_payload"
  | "transport_error"
  | "unknown_consumption";

export type CharacterAuthoringA2Result = Readonly<{
  runId: string;
  executedAt: string;
  calls: 1;
  classification: CharacterAuthoringA2Class;
  httpStatus: number | null;
  errorName: string | null;
  errorDetail: string | null;
  providerFailureReason: ReturnType<typeof classifyLlmProviderError> | null;
  usage: Readonly<{
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    estimatedCostUsd: number | null;
  }>;
  reservation: Readonly<{
    reservedInputTokens: number;
    reservedOutputTokens: number;
    reservedCostUsd: number;
    overrun: boolean;
  }>;
  freeze: Pick<
    CharacterAuthoringA2Freeze,
    "schemaDigestSha256" | "requestDigestSha256" | "model" | "label"
  >;
  productionEffects: CharacterAuthoringA2Freeze["productionEffects"];
}>;

function bounded(text: string, max = 400): string {
  const redacted = text.replace(/xai-[A-Za-z0-9]+/g, "xai-[redacted]");
  return redacted.length <= max ? redacted : `${redacted.slice(0, max)}…`;
}

function numericStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function estimatedCostUsd(
  promptTokens: number | null,
  completionTokens: number | null,
  freeze: CharacterAuthoringA2Freeze,
): number | null {
  if (promptTokens === null || completionTokens === null) return null;
  return Number((
    (promptTokens / 1_000_000) * freeze.rates.inputUsdPerMillion +
    (completionTokens / 1_000_000) * freeze.rates.outputUsdPerMillion
  ).toFixed(4));
}

export async function executeCharacterAuthoringA2(
  freezePath: string,
): Promise<CharacterAuthoringA2Result> {
  const approved = JSON.parse(await readFile(freezePath, "utf8")) as CharacterAuthoringA2Freeze;
  const { freeze, captured } = await freezeCharacterAuthoringA2();
  if (
    freeze.schemaDigestSha256 !== approved.schemaDigestSha256 ||
    freeze.requestDigestSha256 !== approved.requestDigestSha256 ||
    freeze.model !== approved.model ||
    freeze.maxCalls !== CHARACTER_AUTHORING_A2_MAX_CALLS
  ) {
    throw new Error("A2 live request does not match the approved freeze");
  }
  if (!config.xai.apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }
  if (config.xai.modelEngine !== CHARACTER_AUTHORING_A2_MODEL) {
    throw new Error(
      `A2 requires modelEngine ${CHARACTER_AUTHORING_A2_MODEL}; configured ${config.xai.modelEngine}`,
    );
  }
  const format = captured.opts.responseFormat;
  if (!format) throw new Error("A2 captured request has no response format");

  const client = new OpenAI({
    apiKey: config.xai.apiKey,
    baseURL: "https://api.x.ai/v1",
    timeout: CHARACTER_AUTHORING_A2_TIMEOUT_MS,
    maxRetries: 0,
  });
  const started = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHARACTER_AUTHORING_A2_TIMEOUT_MS);
  try {
    const response = await client.chat.completions.create(
      {
        model: CHARACTER_AUTHORING_A2_MODEL,
        temperature: freeze.temperature,
        messages: [
          { role: "system", content: captured.system },
          { role: "user", content: captured.user },
        ],
        response_format: format,
      },
      { signal: controller.signal, timeout: CHARACTER_AUTHORING_A2_TIMEOUT_MS },
    );
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens ?? null;
    const completionTokens = usage?.completion_tokens ?? null;
    const totalTokens = usage?.total_tokens ?? null;
    const cost = estimatedCostUsd(promptTokens, completionTokens, freeze);
    const reservation = {
      reservedInputTokens: freeze.reservedInputTokens,
      reservedOutputTokens: freeze.reservedOutputTokens,
      reservedCostUsd: freeze.reservedCostUsd,
      overrun:
        (promptTokens !== null && promptTokens > freeze.reservedInputTokens) ||
        (completionTokens !== null && completionTokens > freeze.reservedOutputTokens) ||
        (cost !== null && cost > freeze.maxReservedUsd),
    };
    const text = response.choices[0]?.message?.content ?? "";
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return {
        runId: freeze.runId,
        executedAt: started,
        calls: 1,
        classification: "invalid_payload",
        httpStatus: 200,
        errorName: "invalid_json",
        errorDetail: bounded("Provider returned non-JSON content"),
        providerFailureReason: null,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostUsd: cost,
        },
        reservation,
        freeze: {
          schemaDigestSha256: freeze.schemaDigestSha256,
          requestDigestSha256: freeze.requestDigestSha256,
          model: freeze.model,
          label: freeze.label,
        },
        productionEffects: freeze.productionEffects,
      };
    }
    const envelope = parsedJson && typeof parsedJson === "object"
      ? Reflect.get(parsedJson, "definition")
      : undefined;
    const parsed = CharacterDefinitionV2Schema.safeParse(envelope);
    const usageMissing = promptTokens === null || completionTokens === null;
    return {
      runId: freeze.runId,
      executedAt: started,
      calls: 1,
      classification: !parsed.success
        ? "invalid_payload"
        : usageMissing
        ? "unknown_consumption"
        : "valid_character_definition_v2",
      httpStatus: 200,
      errorName: parsed.success ? null : "schema_mismatch",
      errorDetail: parsed.success
        ? null
        : bounded(parsed.error.issues.slice(0, 8).map((issue) =>
          `${issue.path.join(".") || "(root)"}:${issue.message}`
        ).join("; ")),
      providerFailureReason: null,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: cost,
      },
      reservation,
      freeze: {
        schemaDigestSha256: freeze.schemaDigestSha256,
        requestDigestSha256: freeze.requestDigestSha256,
        model: freeze.model,
        label: freeze.label,
      },
      productionEffects: freeze.productionEffects,
    };
  } catch (error) {
    const status = numericStatus(error);
    const message = error instanceof Error ? error.message : String(error);
    const schemaRejected = status === 400 &&
      /unsupported response format|self[- ]referenc/i.test(message);
    const classification: CharacterAuthoringA2Class = schemaRejected
      ? "schema_rejected"
      : "transport_error";
    return {
      runId: freeze.runId,
      executedAt: started,
      calls: 1,
      classification,
      httpStatus: status,
      errorName: error instanceof Error ? error.name : "Error",
      errorDetail: bounded(message),
      providerFailureReason: classifyLlmProviderError(error),
      usage: {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        estimatedCostUsd: null,
      },
      reservation: {
        reservedInputTokens: freeze.reservedInputTokens,
        reservedOutputTokens: freeze.reservedOutputTokens,
        reservedCostUsd: freeze.reservedCostUsd,
        overrun: false,
      },
      freeze: {
        schemaDigestSha256: freeze.schemaDigestSha256,
        requestDigestSha256: freeze.requestDigestSha256,
        model: freeze.model,
        label: freeze.label,
      },
      productionEffects: freeze.productionEffects,
    };
  } finally {
    clearTimeout(timer);
  }
}

