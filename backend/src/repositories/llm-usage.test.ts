// R: Verify durable nullable usage survives parsing failures, provider failures, retries, and restart.
import { LlmPhysicalCompletionError, withLlmPhysicalCompletion } from "../llm/llm-physical-completion.js";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import type { ChatOpts } from "../llm/openai-compatible.js";
const directory = mkdtempSync(join(tmpdir(), "kshiai-observed-usage-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { closeDatabase } = await import("../db.js");
const ledger = await import("./llm-usage.js");
const { observeLlmPhysicalAttempt } = await import("./llm-usage-observation.js");
const { OpenAiCompatibleProvider } = await import("../llm/openai-compatible.js");
after(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
class Probe extends OpenAiCompatibleProvider {
  request(options: ChatOpts = {}) { return this.chatJson("secret prompt must never persist", "secret body", { retry: "none", ...options }); }
  tools(mode: "character" | "history") { const tools = { search: async () => [], get: async () => { throw new Error("no tool lookup"); } };
    return mode === "character" ? this.chatJsonWithCharacterTools("secret", "secret", tools) : this.chatJsonWithBattleHistoryTools("secret", "secret", tools); }
}
function provider() { return new Probe({ name: "xai", apiKey: "test-secret-key", baseUrl: "https://usage.invalid/v1", modelEngine: "grok-engine", modelFast: "grok-fast", fallbackOnError: false }); }
const observed = { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130,
  prompt_tokens_details: { cached_tokens: 40 }, completion_tokens_details: { reasoning_tokens: 20 }, provider_count: 7 };
function response(content: string, usage: unknown = observed) { return Response.json({ model: "grok-response", choices: [{ message: { content } }], ...(usage === undefined ? {} : { usage }) }, { headers: { "x-request-id": "request-test" } }); }
describe("physical SDK usage ledger", () => {
  it("retains empty-content diagnostics before parsing rejection and reads old snapshots", async (t) => {
    const battleId = "empty-response-diagnostics";
    t.mock.method(globalThis, "fetch", async () => Response.json({
      model: "grok-response", choices: [{ finish_reason: "length", message: { content: "" } }],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
    }));
    await assert.rejects(withLlmUsageScope({ battleId }, () => provider().request()));
    const row = (await ledger.listLlmUsageAttempts({ battleId }))[0];
    assert.ok(row);
    assert.equal(row.status, "completed");
    assert.equal(row.completionTokens, 0);
    assert.deepEqual(row.responseDiagnostics, { finishReason: "length", contentLength: 0, contentEmpty: true });
    const { responseDiagnostics, ...historical } = row;
    assert.equal(ledger.LlmUsageAttemptSchema.parse(historical).responseDiagnostics, undefined);
    assert.equal(JSON.stringify(row).includes("secret prompt must never persist"), false);
    assert.equal(ledger.LlmUsageAttemptSchema.safeParse({ ...row, responseDiagnostics: { ...responseDiagnostics, rawContent: "private" } }).success, false);
  });
  it("stores raw categories and correlation before invalid JSON is rejected and survives reload", async (t) => {
    t.mock.method(globalThis, "fetch", async () => response("invalid JSON"));
    const scope = { battleId: "before-battle-exists", role: "creation", side: "a" as const, tick: 0, receiptIds: ["receipt1"] };
    await assert.rejects(withLlmPhysicalCompletion(() => withLlmUsageScope(scope, () => provider().request())), LlmPhysicalCompletionError);
    await closeDatabase();
    const rows = await ledger.listLlmUsageAttempts({ battleId: scope.battleId });
    assert.equal(rows.length, 1);
    const row = rows[0]; assert.ok(row);
    assert.equal(row.status, "completed");
    assert.equal(row.promptTokens, 100); assert.equal(row.completionTokens, 30); assert.equal(row.totalTokens, 130);
    assert.equal(row.cachedTokens, 40); assert.equal(row.reasoningTokens, 20);
    assert.equal(row.requestId, "request-test"); assert.equal(row.responseModel, "grok-response");
    assert.deepEqual(row.rawUsage, observed); assert.deepEqual(row.receiptIds, ["receipt1"]);
    assert.equal(row.role, "creation"); assert.equal(row.tick, 0); assert.equal(row.side, "a");
    assert.equal(JSON.stringify(row).includes("secret"), false);
  });
  it("records missing usage and HTTP failure as unknown categories rather than zero", async (t) => {
    t.mock.method(globalThis, "fetch", async () => response('{"ok":true}', null));
    await withLlmUsageScope({ battleId: "missing-usage" }, () => provider().request());
    const row = (await ledger.listLlmUsageAttempts({ battleId: "missing-usage" }))[0]; assert.ok(row);
    assert.equal(row.promptTokens, null); assert.equal(row.cachedTokens, null); assert.equal(row.rawUsage, null);
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: { message: "secret failure text", type: "invalid_request_error" } }, { status: 400, headers: { "x-request-id": "failed-request" } }));
    await assert.rejects(withLlmUsageScope({ battleId: "http-failure" }, () => provider().request()));
    const failure = (await ledger.listLlmUsageAttempts({ battleId: "http-failure" }))[0]; assert.ok(failure);
    assert.equal(failure.requestId, "failed-request");
    assert.equal(failure.status, "failed"); assert.equal(failure.totalTokens, null);
    assert.equal(JSON.stringify(failure).includes("secret"), false);
  });
  it("records timeout termination with unknown usage and preserves missing versus invalid token categories", async (t) => {
    t.mock.method(globalThis, "fetch", async () => { throw new DOMException("test timeout", "AbortError"); });
    await assert.rejects(withLlmPhysicalCompletion(() => withLlmUsageScope({ battleId: "timeout-usage" }, () => provider().request())), (error: unknown) => !(error instanceof LlmPhysicalCompletionError));
    const row = (await ledger.listLlmUsageAttempts({ battleId: "timeout-usage" }))[0]; assert.ok(row);
    assert.equal(row.status, "timeout"); assert.equal(row.completionTokens, null);
    const parsed = ledger.observedLlmUsage({ prompt_tokens: -1, completion_tokens: "10", total_tokens: 12, prompt_tokens_details: {} });
    assert.equal(parsed.promptTokens, null); assert.equal(parsed.completionTokens, null); assert.equal(parsed.totalTokens, 12); assert.equal(parsed.cachedTokens, null);
  });
  it("confirms a received invalid response even when its token usage is absent", async (t) => {
    t.mock.method(globalThis, "fetch", async () => response("invalid JSON", null));
    await assert.rejects(withLlmPhysicalCompletion(() => withLlmUsageScope({ battleId: "invalid-without-usage" }, () => provider().request())), LlmPhysicalCompletionError);
    const row = (await ledger.listLlmUsageAttempts({ battleId: "invalid-without-usage" }))[0]; assert.ok(row);
    assert.equal(row.status, "completed"); assert.equal(row.totalTokens, null);
  });
  it("records each physical retry with the same call ID and a distinct ordinal", async (t) => {
    let sends = 0;
    t.mock.method(globalThis, "fetch", async () => ++sends === 1 ? Response.json({ error: { message: "temporary" } }, { status: 429, headers: { "retry-after": "0" } }) : response('{"ok":true}'));
    await withLlmUsageScope({ battleId: "retry-usage" }, () => provider().request({ retry: undefined }));
    const rows = await ledger.listLlmUsageAttempts({ battleId: "retry-usage" });
    assert.equal(rows.length, 2); assert.equal(rows[0]?.callId, rows[1]?.callId);
    assert.deepEqual(rows.map((row) => row.attemptOrdinal), [1, 2]);
    assert.deepEqual(rows.map((row) => row.status), ["failed", "completed"]);
  });
  it("records streamed usage-only chunks and both tool dispatch paths", async (t) => {
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (!body.stream) return response('{"ok":true}');
      const chunks = [{ model: "grok-stream", choices: [{ delta: { content: '{"ok":true}' } }] }, { model: "grok-stream", choices: [], usage: observed }];
      return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream", "x-request-id": "stream-request" } });
    });
    await withLlmUsageScope({ battleId: "all-paths" }, async () => {
      await provider().request({ onText() {} }); await provider().tools("character"); await provider().tools("history");
    });
    const rows = await ledger.listLlmUsageAttempts({ battleId: "all-paths" });
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.promptTokens === 100 && row.status === "completed"));
    assert.equal(rows[0]?.responseModel, "grok-stream"); assert.equal(rows[0]?.requestId, "stream-request");
  });
  it("retains observed stream usage and request identity when the stream fails afterwards", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(
      `data: ${JSON.stringify({ model: "grok-stream", choices: [], usage: observed })}\n\ndata: ${JSON.stringify({ error: { message: "stream stopped" } })}\n\n`,
      { headers: { "content-type": "text/event-stream", "x-request-id": "stream-failed-request" } }));
    await assert.rejects(withLlmUsageScope({ battleId: "stream-partial" }, () => provider().request({ onText() {} })));
    const rows = await ledger.listLlmUsageAttempts({ battleId: "stream-partial" });
    assert.ok(rows.length >= 1);
    assert.equal(rows[0]?.status, "failed"); assert.equal(rows[0]?.totalTokens, 130); assert.equal(rows[0]?.requestId, "stream-failed-request");
  });
  it("prints a usage-only report from the executable read path without a price file", async () => {
    const script = fileURLToPath(new URL("../scripts/llm-usage-cost-report.ts", import.meta.url));
    const output = execFileSync(process.execPath, ["--import", "tsx", script, "--battle", "missing-usage"], { encoding: "utf8", env: process.env });
    const report = z.object({ priceRevision: z.literal("unpriced"), attemptCount: z.number(), complete: z.boolean(), tokens: z.object({ promptTokens: z.object({ knownSubtotal: z.number(), unknownCount: z.number() }) }) }).parse(JSON.parse(output));
    assert.equal(report.attemptCount, 1); assert.equal(report.complete, false); assert.equal(report.tokens.promptTokens.unknownCount, 1);
  });
  it("preserves provider usage when wall time moves backwards while elapsed time remains monotonic", async (t) => {
    let wallTime = 100000;
    t.mock.method(Date, "now", () => wallTime);
    await withLlmUsageScope({ battleId: "backward-wall-clock" }, () => observeLlmPhysicalAttempt({
      callId: "backward-call", attemptOrdinal: 1, provider: "xai", requestedModel: "grok", role: "adjudication",
    }, async () => { wallTime = 90000; await new Promise<void>((resolve) => setImmediate(resolve)); return { usage: observed }; }, (result) => result));
    const row = (await ledger.listLlmUsageAttempts({ battleId: "backward-wall-clock" }))[0]; assert.ok(row);
    assert.equal(row.startedAt, 100000); assert.equal(row.finishedAt, 90000);
    assert.ok(row.elapsedMs !== null && row.elapsedMs >= 0);
    assert.equal(row.status, "completed"); assert.equal(row.totalTokens, 130); assert.deepEqual(row.rawUsage, observed);
    await ledger.startLlmUsageAttempt({ callId: "manual-backward", attemptOrdinal: 1, provider: "xai", requestedModel: "grok", startedAt: 100000 });
    await assert.rejects(ledger.finishLlmUsageAttempt({ id: "manual-backward:1", status: "completed", finishedAt: 90000, usage: observed }), /TIME_INVALID/);
    await assert.rejects(ledger.finishLlmUsageAttempt({ id: "manual-backward:1", status: "completed", finishedAt: 90000, elapsedMs: -1, usage: observed }), /DURATION_INVALID/);
    await assert.rejects(ledger.finishLlmUsageAttempt({ id: "manual-backward:1", status: "completed", finishedAt: 90000, elapsedMs: Number.NaN, usage: observed }), /DURATION_INVALID/);
  });
  it("records a late physical result after its caller stops waiting", async (t) => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    t.mock.method(globalThis, "fetch", async () => { await waiting; return response('{"ok":true}'); });
    const pending = withLlmUsageScope({ battleId: "late-usage" }, () => provider().request());
    await new Promise<void>((resolve) => setImmediate(resolve));
    const before = await ledger.listLlmUsageAttempts({ battleId: "late-usage" });
    assert.equal(before[0]?.status, "started");
    assert.ok(release); release(); await pending;
    const after = await ledger.listLlmUsageAttempts({ battleId: "late-usage" });
    assert.equal(after[0]?.status, "completed"); assert.equal(after[0]?.totalTokens, 130);
  });
});
