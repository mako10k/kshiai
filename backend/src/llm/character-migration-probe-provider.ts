import { z } from "zod";
import {
  CharacterSemanticMigrationProviderReceiptV1Schema,
  type CharacterSemanticMigrationProviderReceiptV1,
} from "@kshiai/shared";
import { assetContentDigest } from "../repositories/asset-generations.js";
import { assertXaiResponseSchema } from "./provider-response-schema.js";
import type {
  CharacterMigrationProvider, CharacterMigrationProviderCall,
} from "../services/character-migration-requests.js";

export const MIGRATION_PROBE_CONTRACT = {
  runId: "semantic-migration-grok-2026-09-10-v1",
  endpoint: "https://api.x.ai/v1/chat/completions",
  model: "grok-4.3", reasoningEffort: "none", temperature: 0,
  maxRequests: 6, maxRequestBytes: 180_000, framingTokens: 2_048,
  maxOutputTokens: 4_096, maxReservedTokens: 1_120_000,
  maxReservedCostUsd: 1.50, timeoutMs: 90_000,
  inputUsdPerMillion: 1.25, outputUsdPerMillion: 2.50,
  priceSource: "https://docs.x.ai/developers/models/grok-4.3",
  priceCheckedAt: "2026-09-10", retries: 0,
};

export function migrationProbeBody(call: CharacterMigrationProviderCall) {
  if (call.modelIdentity !== MIGRATION_PROBE_CONTRACT.model ||
      call.providerRoute !== MIGRATION_PROBE_CONTRACT.endpoint) {
    throw new Error("MIGRATION_PROBE_ROUTE_DRIFT");
  }
  assertXaiResponseSchema(call.responseSchema);
  return {
    model: MIGRATION_PROBE_CONTRACT.model,
    reasoning_effort: MIGRATION_PROBE_CONTRACT.reasoningEffort,
    temperature: MIGRATION_PROBE_CONTRACT.temperature,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: JSON.stringify(call.input) },
    ],
    response_format: { type: "json_schema", json_schema: {
      name: call.kind.includes("review") ? "character_semantic_consistency_review_v1" :
        "character_semantic_migration_change_set_v1",
      strict: true, schema: z.record(z.unknown()).parse(call.responseSchema),
    } },
    max_tokens: MIGRATION_PROBE_CONTRACT.maxOutputTokens,
    stream: false,
  };
}

export function migrationProbeReservation(call: CharacterMigrationProviderCall) {
  const body = migrationProbeBody(call);
  const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (bytes > MIGRATION_PROBE_CONTRACT.maxRequestBytes) {
    throw new Error("MIGRATION_PROBE_INPUT_CEILING");
  }
  const input = bytes + MIGRATION_PROBE_CONTRACT.framingTokens;
  const output = MIGRATION_PROBE_CONTRACT.maxOutputTokens;
  return { body, bytes, input, output, tokens: input + output,
    costUsd: input * MIGRATION_PROBE_CONTRACT.inputUsdPerMillion / 1_000_000 +
      output * MIGRATION_PROBE_CONTRACT.outputUsdPerMillion / 1_000_000 };
}

const CompletionSchema = z.object({
  id: z.string().min(1), model: z.literal("grok-4.3"),
  choices: z.array(z.object({
    finish_reason: z.string(), message: z.object({
      content: z.string().nullable(), refusal: z.string().nullable().optional(),
    }),
  })).length(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});

function migrationProbeReceipt(raw: unknown, elapsedMs: number) {
  const completion = CompletionSchema.parse(raw);
  const usage = completion.usage;
  const choice = completion.choices[0];
  const accounting = {
    inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens, elapsedMs,
    estimatedCostUsd: usage.prompt_tokens * MIGRATION_PROBE_CONTRACT.inputUsdPerMillion / 1_000_000 +
      usage.completion_tokens * MIGRATION_PROBE_CONTRACT.outputUsdPerMillion / 1_000_000,
  };
  const finishedAt = new Date().toISOString();
  const failure = (code: string) => CharacterSemanticMigrationProviderReceiptV1Schema.parse({
    outcome: "failed", failureCode: code, failureDetail: null, accounting, finishedAt,
  });
  if (!choice || choice.finish_reason !== "stop" || choice.message.refusal ||
      choice.message.content === null) return failure("MIGRATION_PROBE_INCOMPLETE_RESPONSE");
  let response: unknown;
  try {
    response = JSON.parse(choice.message.content);
  } catch {
    return failure("MIGRATION_PROBE_INVALID_JSON");
  }
  return CharacterSemanticMigrationProviderReceiptV1Schema.parse({
    outcome: "succeeded", response, responseDigest: assetContentDigest(response),
    accounting, finishedAt,
  });
}

export type MigrationProbeEvent =
  | { phase: "before"; ordinal: number; call: CharacterMigrationProviderCall;
      reservation: ReturnType<typeof migrationProbeReservation> }
  | { phase: "response"; ordinal: number; httpStatus: number; body: string }
  | { phase: "receipt"; ordinal: number; receipt: CharacterSemanticMigrationProviderReceiptV1 };

// The caller persists before-network evidence. No SDK retries, fallback, redirects or tools.
// Failure without valid usage throws: B4 keeps the request pending, never zero-cost.
export function createMigrationProbeProvider(input: {
  apiKey: string;
  persist: (event: MigrationProbeEvent) => Promise<void>;
  fetcher?: typeof fetch;
}): CharacterMigrationProvider {
  if (!input.apiKey.trim()) throw new Error("MIGRATION_PROBE_KEY_REQUIRED");
  const fetcher = input.fetcher ?? fetch;
  let calls = 0;
  let tokens = 0;
  let costUsd = 0;
  let stopped = false;
  let busy = false;
  return async (call) => {
    if (stopped || busy) throw new Error("MIGRATION_PROBE_STOPPED");
    const reserved = migrationProbeReservation(call);
    if (calls >= MIGRATION_PROBE_CONTRACT.maxRequests ||
        tokens + reserved.tokens > MIGRATION_PROBE_CONTRACT.maxReservedTokens ||
        costUsd + reserved.costUsd > MIGRATION_PROBE_CONTRACT.maxReservedCostUsd) {
      stopped = true;
      throw new Error("MIGRATION_PROBE_BUDGET");
    }
    busy = true;
    const ordinal = ++calls;
    tokens += reserved.tokens;
    costUsd += reserved.costUsd;
    const start = Date.now();
    try {
      await input.persist({ phase: "before", ordinal, call, reservation: reserved });
      const response = await fetcher(MIGRATION_PROBE_CONTRACT.endpoint, {
        method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json" },
        body: JSON.stringify(reserved.body), redirect: "error",
        signal: AbortSignal.timeout(MIGRATION_PROBE_CONTRACT.timeoutMs),
      });
      const body = await response.text();
      await input.persist({ phase: "response", ordinal, httpStatus: response.status, body });
      if (!response.ok) throw new Error("MIGRATION_PROBE_HTTP_FAILURE");
      const raw: unknown = JSON.parse(body);
      const receipt = migrationProbeReceipt(raw, Date.now() - start);
      await input.persist({ phase: "receipt", ordinal, receipt });
      if (receipt.accounting.inputTokens > reserved.input ||
          receipt.accounting.outputTokens > reserved.output) {
        throw new Error("MIGRATION_PROBE_RESERVATION_EXCEEDED");
      }
      if (receipt.outcome === "failed") stopped = true;
      return receipt;
    } catch {
      stopped = true;
      throw new Error("MIGRATION_PROBE_STOPPED_RECONCILIATION_REQUIRED");
    } finally {
      busy = false;
    }
  };
}
