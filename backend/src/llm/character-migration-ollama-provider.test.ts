import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { CharacterMigrationJsonSchema } from "@kshiai/shared";
import type { CharacterMigrationProviderCall } from "../services/character-migration-requests.js";
import { characterMigrationChangeSetResponseSchema } from
  "./character-migration-response-schema.js";
import {
  createOllamaMigrationCheckProvider, ollamaMigrationCheckBody, ollamaMigrationResponseSchema,
  OLLAMA_MIGRATION_CHECK_CONTRACT, type OllamaMigrationCheckEvent,
} from "./character-migration-ollama-provider.js";

const call: CharacterMigrationProviderCall = {
  providerRequestId: "ollama-check-request",
  providerRoute: OLLAMA_MIGRATION_CHECK_CONTRACT.endpoint,
  modelIdentity: OLLAMA_MIGRATION_CHECK_CONTRACT.model,
  kind: "initial_generation",
  system: "Return the requested JSON.",
  input: { synthetic: true },
  responseSchema: CharacterMigrationJsonSchema.parse(characterMigrationChangeSetResponseSchema()),
};

function completion(content = '{"value":1}', extra: object = {}) {
  return {
    model: OLLAMA_MIGRATION_CHECK_CONTRACT.model,
    created_at: "2026-09-11T00:00:00Z",
    message: { role: "assistant", content },
    done: true,
    done_reason: "stop",
    total_duration: 1_000_000,
    prompt_eval_count: 10,
    eval_count: 5,
    ...extra,
  };
}

function provider(reply: () => Response) {
  const events: OllamaMigrationCheckEvent[] = [];
  let sent = 0;
  let requestHeaders: Headers | null = null;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, OLLAMA_MIGRATION_CHECK_CONTRACT.endpoint);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    requestHeaders = new Headers(init?.headers);
    sent += 1;
    return reply();
  };
  return {
    adapter: createOllamaMigrationCheckProvider({
      fetcher,
      persist: async (event) => { events.push(event); },
    }),
    events,
    sent: () => sent,
    headers: () => requestHeaders,
  };
}

describe("local Ollama semantic migration check adapter", () => {
  it("translates the common call into the native Ollama schema contract", () => {
    const body = ollamaMigrationCheckBody(call);
    assert.notDeepEqual(body.format, call.responseSchema);
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.keep_alive, "0");
    assert.equal(body.options.temperature, 0);
    assert.equal(body.options.num_ctx, 4_096);
    assert.equal(body.options.num_predict, 512);
    assert.equal(Object.hasOwn(body, "response_format"), false);
  });

  it("restores recursive generic JSON at only the Ollama adapter boundary", () => {
    const schema = z.object({ definitions: z.record(z.unknown()) }).passthrough().parse(
      ollamaMigrationResponseSchema(call.responseSchema),
    );
    const valueKey =
      "character_semantic_migration_change_set_v1_properties_operations_items_properties_value";
    const value = z.object({ anyOf: z.array(z.unknown()) }).passthrough().parse(
      schema.definitions[valueKey],
    );
    assert.equal(value.anyOf.length, 6);
    assert.match(JSON.stringify(value), new RegExp(`#/definitions/${valueKey}`));
    assert.throws(() => ollamaMigrationResponseSchema({ type: "object" }),
      /OLLAMA_MIGRATION_CHECK_SCHEMA_DRIFT/);
  });

  it("maps native content and token counts to one existing provider receipt", async () => {
    const checked = provider(() => Response.json(completion()));
    const receipt = await checked.adapter(call);
    assert.equal(receipt.outcome, "succeeded");
    assert.deepEqual(receipt.response, { value: 1 });
    assert.deepEqual(receipt.accounting, {
      inputTokens: 10, outputTokens: 5, totalTokens: 15,
      estimatedCostUsd: null, elapsedMs: receipt.accounting.elapsedMs,
    });
    assert.deepEqual(checked.events.map((event) => event.phase), ["before", "response", "receipt"]);
    assert.equal(checked.headers()?.has("Authorization"), false);
  });

  it("fails a known invalid JSON completion and never sends a second call", async () => {
    const checked = provider(() => Response.json(completion("{")));
    const receipt = await checked.adapter(call);
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.failureCode, "OLLAMA_MIGRATION_CHECK_INVALID_JSON");
    await assert.rejects(checked.adapter(call), /STOPPED/);
    assert.equal(checked.sent(), 1);
  });

  it("rejects model or route drift before local transport", async () => {
    const checked = provider(() => Response.json(completion()));
    await assert.rejects(checked.adapter({ ...call, modelIdentity: "another" }), /ROUTE_DRIFT/);
    await assert.rejects(checked.adapter({ ...call, providerRoute: "http://localhost:11434/api/chat" }),
      /ROUTE_DRIFT/);
    assert.equal(checked.sent(), 0);
  });
});
