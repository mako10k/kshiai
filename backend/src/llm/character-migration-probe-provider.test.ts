import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { CharacterMigrationJsonSchema } from "@kshiai/shared";
import type { CharacterMigrationProviderCall } from "../services/character-migration-requests.js";
import {
  createMigrationProbeProvider, migrationProbeBody, migrationProbeReservation, MIGRATION_PROBE_CONTRACT,
  type MigrationProbeEvent,
} from "./character-migration-probe-provider.js";

const call: CharacterMigrationProviderCall = {
  providerRequestId: "probe-request", providerRoute: MIGRATION_PROBE_CONTRACT.endpoint,
  modelIdentity: "grok-4.3", kind: "initial_generation",
  system: "Synthetic JSON output only.", input: { synthetic: true },
  responseSchema: { type: "object", properties: {}, additionalProperties: false },
};

function completion(content = "{}", extra: object = {}) {
  return {
    id: "probe-response", model: "grok-4.3",
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, ...extra,
  };
}

function probe(reply: () => Response, persistFailure = false) {
  const events: MigrationProbeEvent[] = [];
  let sent = 0;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(events.at(-1)?.phase, "before");
    assert.equal(url, MIGRATION_PROBE_CONTRACT.endpoint);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.method, "POST");
    assert.ok(init?.signal);
    sent++;
    return reply();
  };
  const provider = createMigrationProbeProvider({
    apiKey: "synthetic-test-key",
    fetcher,
    persist: async (event) => {
      if (persistFailure) throw new Error("disk unavailable");
      events.push(event);
    },
  });
  return { provider, events, sent: () => sent };
}

describe("semantic migration xAI probe transport", () => {
  it("rejects the exact consumed-run grammar before fetch or before-network evidence", async () => {
    const failed = z.object({ call: z.object({ responseSchema: CharacterMigrationJsonSchema }) }).parse(
      JSON.parse(readFileSync(new URL(
        "../../../docs/evidence/semantic-migration-grok-2026-09-10-v1/call-1-before.json",
        import.meta.url), "utf8")),
    );
    const p = probe(() => Response.json(completion()));
    await assert.rejects(p.provider({ ...call, responseSchema: failed.call.responseSchema }), /circular reference/);
    assert.equal(p.sent(), 0);
    assert.equal(p.events.length, 0);
  });
  it("sends the supplied schema without type casts or schema weakening", () => {
    const body = migrationProbeBody(call);
    assert.deepEqual(body.response_format.json_schema.schema, call.responseSchema);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.stream, false);
    assert.ok(migrationProbeReservation(call).bytes > Buffer.byteLength(call.system));
  });
  it("records before sending, preserves response and maps actual accounting", async () => {
    const p = probe(() => Response.json(completion('{"value":1}')));
    const receipt = await p.provider(call);
    assert.equal(receipt.outcome, "succeeded");
    assert.equal(receipt.accounting.totalTokens, 15);
    assert.equal(receipt.accounting.estimatedCostUsd, 0.000025);
    assert.deepEqual(p.events.map((event) => event.phase), ["before", "response", "receipt"]);
    assert.equal(JSON.stringify(p.events).includes("synthetic-test-key"), false);
  });
  it("returns invalid JSON with known accounting as failed and stops", async () => {
    const p = probe(() => Response.json(completion("{")));
    const receipt = await p.provider(call);
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.accounting.totalTokens, 15);
    await assert.rejects(p.provider(call));
    assert.equal(p.sent(), 1);
  });
  it("never fabricates usage for HTTP, model or usage failures and never resends", async () => {
    for (const response of [
      new Response("failure", { status: 503 }),
      Response.json(completion("{}", { model: "other" })),
      Response.json(completion("{}", { usage: null })),
    ]) {
      const p = probe(() => response);
      await assert.rejects(p.provider(call));
      await assert.rejects(p.provider(call));
      assert.equal(p.sent(), 1);
      assert.equal(p.events.some((event) => event.phase === "receipt"), false);
    }
  });
  it("does not call the network when before-send evidence cannot be saved", async () => {
    const p = probe(() => Response.json(completion()), true);
    await assert.rejects(p.provider(call));
    assert.equal(p.sent(), 0);
  });
  it("rejects route drift and excessive input before any network request", async () => {
    const p = probe(() => Response.json(completion()));
    await assert.rejects(p.provider({ ...call, providerRoute: "https://example.invalid" }));
    await assert.rejects(p.provider({ ...call, system: "a".repeat(180_001) }));
    assert.equal(p.sent(), 0);
  });
  it("limits the physical requests to six", async () => {
    const p = probe(() => Response.json(completion()));
    for (let n = 0; n < 6; n++) await p.provider({ ...call, providerRequestId: String(n) });
    await assert.rejects(p.provider(call));
    assert.equal(p.sent(), 6);
  });
  it("preserves known accounting but stops if actual usage exceeds its reservation", async () => {
    const p = probe(() => Response.json(completion("{}", {
      usage: { prompt_tokens: 199_000, completion_tokens: 5, total_tokens: 199_005 },
    })));
    await assert.rejects(p.provider(call));
    assert.equal(p.events.at(-1)?.phase, "receipt");
    await assert.rejects(p.provider(call));
    assert.equal(p.sent(), 1);
  });
});
