import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// R: Verify SDK wire requests preserve model compatibility across JSON, stream, and tool paths.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { z } from "zod";
import type { ChatOpts } from "./openai-compatible.js";

const usageTestDirectory = mkdtempSync(join(tmpdir(), "kshiai-sdk-usage-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(usageTestDirectory, "usage.db");
process.env.AUTH_PROVIDER = "legacy";
const { OpenAiCompatibleProvider } = await import("./openai-compatible.js");
const { closeDatabase } = await import("../db.js");
after(async () => { await closeDatabase(); rmSync(usageTestDirectory, { recursive: true, force: true }); });

class RequestProbeProvider extends OpenAiCompatibleProvider {
  request(mode: string, options: ChatOpts) {
    const tools = {
      search: async () => [],
      get: async () => { throw new Error("Unexpected tool lookup"); },
    };
    if (mode === "character-tools") {
      return this.chatJsonWithCharacterTools("Return JSON.", "今の感じ：まぶしい。", tools, options);
    }
    if (mode === "history-tools") {
      return this.chatJsonWithBattleHistoryTools("Return JSON.", "今の感じ：まぶしい。", tools, options);
    }
    return this.chatJson("Return JSON.", "今の感じ：まぶしい。", options);
  }
}

const wireBody = z.object({
  model: z.string(),
  reasoning_effort: z.string().optional(),
  temperature: z.number().optional(),
  max_completion_tokens: z.number().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  response_format: z.object({ type: z.string(), json_schema: z.unknown().optional() }),
  stream: z.boolean().optional(),
});

describe("OpenAI-compatible model wire requests", () => {
  for (const mode of ["JSON", "stream", "character-tools", "history-tools"]) {
    it(`sends Luna none and explicit generation cap (${mode})`, async () => {
      const streaming = mode === "stream";
      const usesTools = mode.endsWith("-tools");
      const originalFetch = globalThis.fetch;
      const requests: Array<z.infer<typeof wireBody>> = [];
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), "https://provider-test.invalid/v1/chat/completions");
        assert.equal(typeof init?.body, "string");
        requests.push(wireBody.parse(JSON.parse(String(init?.body))));
        if (streaming) {
          const chunk = {
            id: "test", object: "chat.completion.chunk", created: 1, model: "gpt-6-luna",
            choices: [{ index: 0, delta: { content: '{"ok":true}' }, finish_reason: null }],
          };
          return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
            headers: { "content-type": "text/event-stream" },
          });
        }
        return new Response(JSON.stringify({
          id: "test", object: "chat.completion", created: 1, model: "gpt-6-luna",
          choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
        }), { headers: { "content-type": "application/json" } });
      };
      try {
        const provider = new RequestProbeProvider({
          name: "openai", apiKey: "test-only", baseUrl: "https://provider-test.invalid/v1",
          modelEngine: "gpt-4.1", modelFast: "gpt-6-luna",
        });
        const streamed: string[] = [];
        assert.deepEqual(await provider.request(mode, {
          tier: "fast", maxCompletionTokens: 600,
          responseFormat: {
            type: "json_schema",
            json_schema: { name: "probe", strict: true, schema: {
              type: "object", properties: { ok: { type: "boolean" } },
              required: ["ok"], additionalProperties: false,
            } },
          },
          ...(streaming ? { onText: (text: string) => streamed.push(text) } : {}),
        }), { ok: true });
        assert.equal(requests.length, 1);
        const body = requests[0];
        assert.ok(body);
        assert.equal(body.model, "gpt-6-luna");
        assert.equal(body.reasoning_effort, "none");
        assert.equal(body.max_completion_tokens, 600);
        assert.equal(body.temperature, undefined);
        assert.equal(body.response_format.type, usesTools ? "json_object" : "json_schema");
        if (!usesTools) assert.deepEqual(body.response_format.json_schema, {
          name: "probe", strict: true, schema: {
            type: "object", properties: { ok: { type: "boolean" } },
            required: ["ok"], additionalProperties: false,
          },
        });
        assert.equal(body.messages[1]?.content, "今の感じ：まぶしい。");
        if (streaming) assert.deepEqual(streamed, ['{"ok":true}']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});
