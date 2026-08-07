import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retryLlmProviderCall } from "./provider-retry.js";

describe("same-provider LLM retry", () => {
  it("retries 429 twice within the same provider", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await retryLlmProviderCall(async () => {
      calls += 1;
      if (calls < 3) {
        throw Object.assign(new Error("rate limit"), { status: 429 });
      }
      return "ok";
    }, {
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    assert.equal(result, "ok");
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1_000, 2_000]);
  });

  it("retries 503 once and returns the second failure", async () => {
    let calls = 0;
    const failure = Object.assign(new Error("unavailable"), { status: 503 });
    await assert.rejects(
      retryLlmProviderCall(async () => {
        calls += 1;
        throw failure;
      }, { sleep: async () => undefined }),
      (error) => error === failure,
    );
    assert.equal(calls, 2);
  });

  it("does not retry timeout billing DNS or parsing failures", async () => {
    const failures = [
      new Error("Request was aborted."),
      Object.assign(new Error("payment required"), { status: 402 }),
      Object.assign(new Error("getaddrinfo ENOTFOUND api.example"), {
        code: "ENOTFOUND",
      }),
      new SyntaxError("invalid JSON"),
    ];
    for (const failure of failures) {
      let calls = 0;
      await assert.rejects(
        retryLlmProviderCall(async () => {
          calls += 1;
          throw failure;
        }, { sleep: async () => undefined }),
        (error) => error === failure,
      );
      assert.equal(calls, 1);
    }
  });

  it("does not retry after a streaming response has started", async () => {
    let calls = 0;
    await assert.rejects(
      retryLlmProviderCall(async () => {
        calls += 1;
        throw Object.assign(new Error("unavailable"), { status: 503 });
      }, {
        canRetry: () => false,
        sleep: async () => undefined,
      }),
    );
    assert.equal(calls, 1);
  });
});
