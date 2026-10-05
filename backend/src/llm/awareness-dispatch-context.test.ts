import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// R: Verify guarded adjudication SDK requests preserve exact admission material and refuse bypasses.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import { AwarenessDefaultPolicy } from "@kshiai/shared";
import type { ChatOpts } from "./openai-compatible.js";
import { withAwarenessDispatchContext, currentAwarenessDispatchContext, type AwarenessDispatchContext } from "./awareness-dispatch-context.js";
import type { AwarenessPricedRequest } from "./awareness-dispatch-admission.js";

const usageTestDirectory = mkdtempSync(join(tmpdir(), "kshiai-sdk-usage-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(usageTestDirectory, "usage.db");
process.env.AUTH_PROVIDER = "legacy";
const { OpenAiCompatibleProvider } = await import("./openai-compatible.js");
const { closeDatabase } = await import("../db.js");
after(async () => { await closeDatabase(); rmSync(usageTestDirectory, { recursive: true, force: true }); });

class Probe extends OpenAiCompatibleProvider {
  request(options: ChatOpts = {}) { return this.chatJson("JSONのみ", '{"fact":"腕を引いた"}', { tier: "fast", ...options }); }
  toolRequest() { return this.chatJsonWithBattleHistoryTools("指示", "資料", { search: async () => [], get: async () => { throw new Error("unexpected lookup"); } }); }
}
function provider() { return new Probe({ name: "xai", apiKey: "test-only", baseUrl: "https://guard-test.invalid/v1", modelEngine: "grok-4.5", modelFast: "grok-4.3", fallbackOnError: false, timeoutMultiplier: 3 }); }
function guard(requests: AwarenessPricedRequest[] = []): AwarenessDispatchContext {
  return { provider: "xai", model: "grok-4.5", limits: AwarenessDefaultPolicy.roles.adjudication,
    async run(request, send) { requests.push(request); const response = await send(); assert.equal(response.usage?.totalTokens, 15); return response.result; },
  };
}
const WireSchema = z.object({ model: z.string(), max_completion_tokens: z.number(), messages: z.array(z.object({ role: z.string(), content: z.string() })), response_format: z.unknown() });

describe("awareness adjudication dispatch context", () => {
  it("quotes the exact prose, schema overhead and engine cap passed to the physical SDK request", async () => {
    const previousFetch = globalThis.fetch;
    const wire: Array<z.infer<typeof WireSchema>> = [];
    globalThis.fetch = async (_url, init) => {
      wire.push(WireSchema.parse(JSON.parse(String(init?.body))));
      return new Response(JSON.stringify({ id: "test", object: "chat.completion", created: 1, model: "grok-4.5", choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { "content-type": "application/json" } });
    };
    try {
      const requests: AwarenessPricedRequest[] = [];
      const schema = { type: "json_schema", json_schema: { name: "test", strict: true, schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } } satisfies NonNullable<ChatOpts["responseFormat"]>;
      const result = await withAwarenessDispatchContext(guard(requests), () => provider().request({ responseFormat: schema }));
      assert.deepEqual(result, { ok: true });
      assert.equal(wire.length, 1);
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.options.timeoutMs, 10000);
      assert.equal(requests[0]?.options.retry, "none");
      assert.equal(wire[0]?.model, "grok-4.5");
      assert.equal(wire[0]?.max_completion_tokens, 1500);
      assert.equal(wire[0]?.messages[0]?.content, requests[0]?.system);
      assert.equal(wire[0]?.messages[1]?.content, requests[0]?.user);
      assert.match(requests[0]!.user, /## 裁定に使える確定資料/);
      assert.deepEqual(wire[0]?.response_format, requests[0]?.options.responseFormat);
      assert.equal(currentAwarenessDispatchContext(), undefined);
    } finally { globalThis.fetch = previousFetch; }
  });
  it("clips the quoted physical timeout to the absolute battle time remaining", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "test", object: "chat.completion", created: 1, model: "grok-4.5",
      choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { "content-type": "application/json" } });
    try {
      const requests: AwarenessPricedRequest[] = [];
      await withAwarenessDispatchContext({ ...guard(requests), deadlineAt: Date.now() + 1000 }, () => provider().request());
      const timeout = requests[0]?.options.timeoutMs;
      assert.ok(timeout !== undefined && timeout > 0 && timeout <= 1000);
      await assert.rejects(withAwarenessDispatchContext({ ...guard(requests), deadlineAt: Date.now() - 1 }, () => provider().request()), /ADJUDICATION_DEADLINE/);
      assert.equal(requests.length, 1);
    } finally { globalThis.fetch = previousFetch; }
  });
  it("prepares the bound adjudication deadline without dispatching or weakening token caps", async () => {
    const requests: AwarenessPricedRequest[] = [];
    const long: AwarenessDispatchContext = { ...guard(), limits: { ...AwarenessDefaultPolicy.roles.adjudication, deadlineMs: 60000 },
      async run(request) { requests.push(request); throw new Error("test pre-dispatch stop"); } };
    await assert.rejects(withAwarenessDispatchContext(long, () => provider().request()), /test pre-dispatch stop/);
    assert.equal(requests[0]?.options.timeoutMs, 60000);
    assert.equal(requests[0]?.options.maxCompletionTokens, 1500);
    await assert.rejects(withAwarenessDispatchContext({ ...long, limits: { ...long.limits, outputTokens: 2000 } }, () => provider().request()), /LIMITS_MISMATCH/);
    assert.equal(requests.length, 1);
  });
  it("refuses streaming, tools, and mismatched model identities before dispatch", async () => {
    const requests: AwarenessPricedRequest[] = [];
    const instance = provider();
    await assert.rejects(withAwarenessDispatchContext(guard(requests), () => instance.request({ onText() {} })), /STREAM_NOT_SUPPORTED/);
    await assert.rejects(withAwarenessDispatchContext(guard(requests), () => instance.toolRequest()), /TOOLS_NOT_SUPPORTED/);
    await assert.rejects(withAwarenessDispatchContext({ ...guard(requests), model: "grok-other" }, () => instance.request()), /ROUTE_MISMATCH/);
    assert.equal(requests.length, 0);
  });
  it("never dispatches or retries when admission rejects the physical request", async () => {
    let sends = 0;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => { sends++; throw new Error("unexpected send"); };
    try {
      const denied: AwarenessDispatchContext = { ...guard(), async run() { throw new Error("verified maximum charge unavailable"); } };
      await assert.rejects(withAwarenessDispatchContext(denied, () => provider().request()), /verified maximum charge unavailable/);
      assert.equal(sends, 0);
    } finally { globalThis.fetch = previousFetch; }
  });
});
