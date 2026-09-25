import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1,
  REVISION_SCOPE_SYSTEM_PROMPT_JA_V1,
  REVISION_SCOPE_SYSTEM_PROMPT_JA_FEW_SHOT_V1,
  callRevisionScopeOllamaV1,
  revisionScopeOllamaBodyV1,
} from "./revision-scope-ollama.js";

describe("local character revision scope replay adapter", () => {
  it("freezes a local strict-output request without credentials", () => {
    const body = revisionScopeOllamaBodyV1("外套を青に変更");
    assert.equal(body.model, "qwen2.5:3b");
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.keep_alive, "0");
    assert.equal(body.options.temperature, 0);
    assert.equal(body.options.num_ctx, 4_096);
    assert.equal(body.options.num_predict, 512);
    assert.equal(typeof body.format, "object");
    assert.match(body.messages[1]!.content, /外套を青に変更/);
    assert.equal(Object.hasOwn(body, "apiKey"), false);
  });

  it("changes only the selected system contract for the Japanese replay", () => {
    const baseline = revisionScopeOllamaBodyV1("外套を青に変更");
    const japanese = revisionScopeOllamaBodyV1(
      "外套を青に変更",
      REVISION_SCOPE_SYSTEM_PROMPT_JA_V1,
    );
    assert.deepEqual({ ...japanese, messages: baseline.messages }, baseline);
    assert.equal(japanese.messages[0]!.content, REVISION_SCOPE_SYSTEM_PROMPT_JA_V1);
  });

  it("changes only the selected system contract for the disjoint few-shot replay", () => {
    const japanese = revisionScopeOllamaBodyV1(
      "外套を青に変更",
      REVISION_SCOPE_SYSTEM_PROMPT_JA_V1,
    );
    const fewShot = revisionScopeOllamaBodyV1(
      "外套を青に変更",
      REVISION_SCOPE_SYSTEM_PROMPT_JA_FEW_SHOT_V1,
    );
    assert.deepEqual({ ...fewShot, messages: japanese.messages }, japanese);
    assert.equal(fewShot.messages[0]!.content, REVISION_SCOPE_SYSTEM_PROMPT_JA_FEW_SHOT_V1);
    assert.doesNotMatch(fewShot.messages[0]!.content, /外套を青に変更/);
  });

  it("performs exactly one request and decodes the strict result", async () => {
    let calls = 0;
    let authorizationPresent: boolean | null = null;
    const receipt = await callRevisionScopeOllamaV1({
      request: "外套を青に変更",
      fetcher: async (url, init) => {
        calls += 1;
        authorizationPresent = new Headers(init?.headers).has("Authorization");
        assert.equal(url, REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1.endpoint);
        assert.equal(init?.method, "POST");
        assert.equal(init?.redirect, "error");
        return Response.json({
          model: REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1.model,
          created_at: "2026-09-16T00:00:00Z",
          message: {
            role: "assistant",
            content: JSON.stringify({
              result: {
                kind: "resolved",
                clusters: ["appearance"],
                evidence: [{ sourceQuote: "外套を青に変更", clusters: ["appearance"] }],
              },
            }),
          },
          done: true,
          done_reason: "stop",
          total_duration: 1_000_000,
          prompt_eval_count: 20,
          eval_count: 10,
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(authorizationPresent, false);
    assert.ok(receipt.candidate);
    assert.equal(receipt.candidate.kind, "resolved");
    assert.deepEqual(receipt.validationIssues, []);
    assert.equal(receipt.inputTokens, 20);
    assert.equal(receipt.outputTokens, 10);
  });

  it("retains raw content and validation issues for an invalid structured result", async () => {
    const rawContent = JSON.stringify({
      result: {
        kind: "ambiguous",
        sourceQuote: "外套を青に変更",
        unsafeReason: "invalid controlled fixture",
        alternatives: [
          { id: "one", clusters: ["appearance"], effect: "first" },
          { id: "two", clusters: ["appearance"], effect: "duplicate scope" },
        ],
      },
    });
    const receipt = await callRevisionScopeOllamaV1({
      request: "外套を青に変更",
      fetcher: async () => Response.json({
        model: REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1.model,
        created_at: "2026-09-16T00:00:00Z",
        message: { role: "assistant", content: rawContent },
        done: true,
        done_reason: "stop",
        total_duration: 1_000_000,
        prompt_eval_count: 20,
        eval_count: 10,
      }),
    });

    assert.equal(receipt.candidate, null);
    assert.equal(receipt.rawContent, rawContent);
    assert.ok(receipt.validationIssues.some((issue) =>
      issue.message === "alternatives must have materially different scopes"));
  });
});
