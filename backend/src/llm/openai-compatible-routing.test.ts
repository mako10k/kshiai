import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

type PrivateProvider = {
  client: {
    chat: {
      completions: {
        create(
          body: unknown,
          options: { timeout?: number },
        ): Promise<unknown>;
      };
    };
  };
  chatJson(
    system: string,
    user: string,
    opts?: { tier?: "fast" | "engine"; label?: string },
  ): Promise<unknown>;
};

function privateProvider(): PrivateProvider {
  return new OpenAiCompatibleProvider({
    name: "primary",
    apiKey: "test-only",
    baseUrl: "https://example.invalid/v1",
    modelEngine: "engine-model",
    modelFast: "fast-model",
  }) as unknown as PrivateProvider;
}

function completion(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

describe("OpenAI-compatible provider routing policy", () => {
  it("uses the extended fast timeout and retries 429 in the same client", async () => {
    const provider = privateProvider();
    const timeouts: Array<number | undefined> = [];
    let calls = 0;
    provider.client = {
      chat: {
        completions: {
          create: async (_body, options) => {
            calls += 1;
            timeouts.push(options.timeout);
            if (calls < 3) {
              throw Object.assign(new Error("rate limit"), {
                status: 429,
                headers: { "retry-after-ms": "0" },
              });
            }
            return completion('{"ok":true}');
          },
        },
      },
    };

    assert.deepEqual(
      await provider.chatJson("system", "user", {
        tier: "fast",
        label: "test429",
      }),
      { ok: true },
    );
    assert.equal(calls, 3);
    assert.deepEqual(timeouts, [30_000, 30_000, 30_000]);
  });

  it("limits 503 to one same-provider retry", async () => {
    const provider = privateProvider();
    let calls = 0;
    const failure = Object.assign(new Error("unavailable"), {
      status: 503,
      headers: { "retry-after-ms": "0" },
    });
    provider.client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            throw failure;
          },
        },
      },
    };

    await assert.rejects(
      provider.chatJson("system", "user", { tier: "fast", label: "test503" }),
      (error) => error === failure,
    );
    assert.equal(calls, 2);
  });

  it("does not retry an aborted timeout", async () => {
    const provider = privateProvider();
    let calls = 0;
    const failure = new Error("Request was aborted.");
    provider.client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            throw failure;
          },
        },
      },
    };

    await assert.rejects(
      provider.chatJson("system", "user", { tier: "fast", label: "timeout" }),
      (error) => error === failure,
    );
    assert.equal(calls, 1);
  });
});
