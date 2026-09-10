import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertXaiResponseSchema, ProviderResponseSchemaError } from "./provider-response-schema.js";
import { OpenAiCompatibleProvider, type ChatOpts } from "./openai-compatible.js";
import { WORLD_PERCEPTION_RESPONSE_FORMAT, SENSORY_PERCEPTION_RESPONSE_FORMAT,
  COMBINED_PERCEPTION_RESPONSE_FORMAT } from "./perception-prompt-strategy.js";

class ExposedProvider extends OpenAiCompatibleProvider {
  request(schema: Record<string, unknown>) {
    const opts: ChatOpts = { responseFormat: {
      type: "json_schema", json_schema: { name: "test", strict: true, schema },
    } };
    return this.chatJson("test", "test", opts);
  }
}

describe("xAI outgoing response-schema graph", () => {
  it("accepts every existing strict perception format without modifying it", () => {
    for (const format of [WORLD_PERCEPTION_RESPONSE_FORMAT, SENSORY_PERCEPTION_RESPONSE_FORMAT,
      COMBINED_PERCEPTION_RESPONSE_FORMAT]) {
      const original = structuredClone(format);
      assertXaiResponseSchema(format.json_schema.schema);
      assert.deepEqual(format, original);
    }
  });
  it("rejects direct, transitive, root and escaped-pointer cycles", () => {
    for (const schema of [
      { definitions: { a: { $ref: "#/definitions/a" } } },
      { $defs: { a: { $ref: "#/$defs/b" }, b: { items: { $ref: "#/$defs/a" } } } },
      { type: "object", properties: { next: { $ref: "#" } } },
      { $defs: { "a/b~c": { $ref: "#/$defs/a~1b~0c" } } },
    ]) assert.throws(() => assertXaiResponseSchema(schema), /circular reference/);
  });
  it("allows shared acyclic definitions and treats literal refs as data", () => {
    assert.doesNotThrow(() => assertXaiResponseSchema({
      $defs: { scalar: { type: "string" }, list: { type: "array", items: { $ref: "#/$defs/scalar" } } },
      properties: { a: { $ref: "#/$defs/list" }, b: { $ref: "#/$defs/list" },
        literal: { const: { $ref: "#" }, default: { $ref: "#" }, examples: [{ $ref: "#" }] } },
    }));
  });
  it("resolves escaped and percent-encoded local pointers and array indices", () => {
    assert.doesNotThrow(() => assertXaiResponseSchema({
      $defs: { "a/b~ c": { type: "string" } },
      anyOf: [{ $ref: "#/$defs/a~1b~0%20c" }],
      properties: { a: { $ref: "#/anyOf/0" } },
    }));
    assert.throws(() => assertXaiResponseSchema({ $ref: "#/$defs/missing" }), /unresolved reference/);
  });
  it("rejects at the ordinary xAI boundary before fetch, even with fallback enabled", async (t) => {
    let sent = 0;
    t.mock.method(globalThis, "fetch", async () => {
      sent++;
      throw new Error("unexpected fetch");
    });
    const provider = new ExposedProvider({ name: "xai", apiKey: "synthetic-test-key",
      baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test", fallbackOnError: true });
    await assert.rejects(provider.request({ properties: { next: { $ref: "#" } } }),
      ProviderResponseSchemaError);
    assert.equal(sent, 0);
  });
  it("does not impose xAI recursion policy on another provider", async (t) => {
    let sent = 0;
    t.mock.method(globalThis, "fetch", async () => {
      sent++;
      return Response.json({ id: "test", choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    });
    const provider = new ExposedProvider({ name: "openai", apiKey: "synthetic-test-key",
      baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test" });
    assert.deepEqual(await provider.request({ properties: { next: { $ref: "#" } } }), {});
    assert.equal(sent, 1);
  });
});
