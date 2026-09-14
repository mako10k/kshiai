import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  CharacterMigrationJsonSchema, CharacterSemanticMigrationChangeSetV1Schema,
  CharacterSemanticMigrationProviderReceiptV1Schema,
  type CharacterSemanticMigrationProviderReceiptV1,
} from "@kshiai/shared";
import { assetContentDigest } from "../repositories/asset-generations.js";
import { characterMigrationChangeSetResponseSchema } from
  "./character-migration-response-schema.js";
import type {
  CharacterMigrationProvider, CharacterMigrationProviderCall,
} from "../services/character-migration-requests.js";

export const OLLAMA_MIGRATION_CHECK_CONTRACT = Object.freeze({
  endpoint: "http://127.0.0.1:11434/api/chat",
  model: "qwen2.5:3b",
  temperature: 0,
  contextTokens: 4_096,
  maxOutputTokens: 512,
  maxRequests: 1,
  timeoutMs: 180_000,
});

const OllamaChatResponseSchema = z.object({
  model: z.literal(OLLAMA_MIGRATION_CHECK_CONTRACT.model),
  created_at: z.string().min(1),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string(),
    thinking: z.string().optional(),
  }).passthrough(),
  done: z.literal(true),
  done_reason: z.string().optional(),
  total_duration: z.number().int().nonnegative(),
  prompt_eval_count: z.number().int().nonnegative(),
  eval_count: z.number().int().nonnegative(),
}).passthrough();

const FORMAT_NAME = "character_semantic_migration_change_set_v1";

export function ollamaMigrationResponseSchema(responseSchema: unknown) {
  const supplied = CharacterMigrationJsonSchema.parse(responseSchema);
  const xaiProjection = characterMigrationChangeSetResponseSchema();
  if (!isDeepStrictEqual(supplied, xaiProjection)) {
    throw new Error("OLLAMA_MIGRATION_CHECK_SCHEMA_DRIFT");
  }
  // xAI rejects this contract's circular generic-JSON definition, while the
  // Ollama 0.21.1 grammar converter rejects xAI's typeless replacement. Restore
  // the authoritative recursive representation only at the adapter boundary.
  return CharacterMigrationJsonSchema.parse(
    zodResponseFormat(CharacterSemanticMigrationChangeSetV1Schema, FORMAT_NAME)
      .json_schema.schema,
  );
}

export function ollamaMigrationCheckBody(call: CharacterMigrationProviderCall) {
  if (call.providerRoute !== OLLAMA_MIGRATION_CHECK_CONTRACT.endpoint ||
      call.modelIdentity !== OLLAMA_MIGRATION_CHECK_CONTRACT.model) {
    throw new Error("OLLAMA_MIGRATION_CHECK_ROUTE_DRIFT");
  }
  return {
    model: OLLAMA_MIGRATION_CHECK_CONTRACT.model,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: JSON.stringify(call.input) },
    ],
    format: ollamaMigrationResponseSchema(call.responseSchema),
    stream: false,
    think: false,
    keep_alive: "0",
    options: {
      temperature: OLLAMA_MIGRATION_CHECK_CONTRACT.temperature,
      num_ctx: OLLAMA_MIGRATION_CHECK_CONTRACT.contextTokens,
      num_predict: OLLAMA_MIGRATION_CHECK_CONTRACT.maxOutputTokens,
    },
  };
}

function ollamaMigrationReceipt(raw: unknown, elapsedMs: number) {
  const completion = OllamaChatResponseSchema.parse(raw);
  const accounting = {
    inputTokens: completion.prompt_eval_count,
    outputTokens: completion.eval_count,
    totalTokens: completion.prompt_eval_count + completion.eval_count,
    estimatedCostUsd: null,
    elapsedMs,
  };
  const failure = (failureCode: string) =>
    CharacterSemanticMigrationProviderReceiptV1Schema.parse({
      outcome: "failed", failureCode, failureDetail: null,
      accounting, finishedAt: new Date().toISOString(),
    });
  if (completion.done_reason !== undefined && completion.done_reason !== "stop") {
    return failure("OLLAMA_MIGRATION_CHECK_INCOMPLETE_RESPONSE");
  }
  let response: unknown;
  try {
    response = JSON.parse(completion.message.content);
  } catch {
    return failure("OLLAMA_MIGRATION_CHECK_INVALID_JSON");
  }
  return CharacterSemanticMigrationProviderReceiptV1Schema.parse({
    outcome: "succeeded", response, responseDigest: assetContentDigest(response),
    accounting, finishedAt: new Date().toISOString(),
  });
}

export type OllamaMigrationCheckEvent =
  | { phase: "before"; call: CharacterMigrationProviderCall;
      body: ReturnType<typeof ollamaMigrationCheckBody> }
  | { phase: "response"; httpStatus: number; body: string }
  | { phase: "receipt"; receipt: CharacterSemanticMigrationProviderReceiptV1 };

export function createOllamaMigrationCheckProvider(input: {
  persist: (event: OllamaMigrationCheckEvent) => Promise<void>;
  fetcher?: typeof fetch;
}): CharacterMigrationProvider {
  const fetcher = input.fetcher ?? fetch;
  let calls = 0;
  let busy = false;
  let stopped = false;
  return async (call) => {
    if (busy || stopped || calls >= OLLAMA_MIGRATION_CHECK_CONTRACT.maxRequests) {
      throw new Error("OLLAMA_MIGRATION_CHECK_STOPPED");
    }
    const body = ollamaMigrationCheckBody(call);
    calls += 1;
    busy = true;
    const startedAt = Date.now();
    try {
      await input.persist({ phase: "before", call, body });
      const response = await fetcher(OLLAMA_MIGRATION_CHECK_CONTRACT.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(OLLAMA_MIGRATION_CHECK_CONTRACT.timeoutMs),
      });
      const responseBody = await response.text();
      await input.persist({ phase: "response", httpStatus: response.status, body: responseBody });
      if (!response.ok) throw new Error("OLLAMA_MIGRATION_CHECK_HTTP_FAILURE");
      const raw: unknown = JSON.parse(responseBody);
      const receipt = ollamaMigrationReceipt(raw, Date.now() - startedAt);
      await input.persist({ phase: "receipt", receipt });
      stopped = true;
      return receipt;
    } catch {
      stopped = true;
      throw new Error("OLLAMA_MIGRATION_CHECK_RECONCILIATION_REQUIRED");
    } finally {
      busy = false;
    }
  };
}
