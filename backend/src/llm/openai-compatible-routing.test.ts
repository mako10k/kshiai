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
  it("requests xAI grok-4.3 directly with reasoning effort none", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4.5",
      modelFast: "grok-4.3",
    }) as unknown as PrivateProvider;
    const bodies: Array<Record<string, unknown>> = [];
    provider.client = {
      chat: {
        completions: {
          create: async (value) => {
            bodies.push(value as Record<string, unknown>);
            return completion('{"ok":true}');
          },
        },
      },
    };

    await provider.chatJson("system", "user", { tier: "fast" });
    assert.equal(bodies[0]?.model, "grok-4.3");
    assert.equal(bodies[0]?.reasoning_effort, "none");
  });

  it("does not send xAI-only reasoning effort to another provider", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "openai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "gpt-4.1",
      modelFast: "gpt-4.1-mini",
    }) as unknown as PrivateProvider;
    const bodies: Array<Record<string, unknown>> = [];
    provider.client = {
      chat: {
        completions: {
          create: async (value) => {
            bodies.push(value as Record<string, unknown>);
            return completion('{"ok":true}');
          },
        },
      },
    };

    await provider.chatJson("system", "user", { tier: "fast" });
    assert.equal(bodies[0]?.model, "gpt-4.1-mini");
    assert.equal("reasoning_effort" in (bodies[0] ?? {}), false);
  });

  it("routes turn-limit referee rationale through the fast tier", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "primary",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "engine-model",
      modelFast: "fast-model",
    });
    let observedTier: "fast" | "engine" | undefined;
    const privateProvider = provider as unknown as {
      chatJson(
        system: string,
        user: string,
        opts?: { tier?: "fast" | "engine"; label?: string },
      ): Promise<unknown>;
    };
    privateProvider.chatJson = async (_system, _user, opts) => {
      observedTier = opts?.tier;
      return {
        winnerSide: "b",
        reason: "確定済みの事実を要約した。",
        reasonFacts: [],
      };
    };

    const result = await provider.referee({
      sideAName: "A",
      sideBName: "B",
      engineWinnerSide: "a",
      turnFacts: [],
      finalState: {
        a: {
          condition: "steady",
          reserves: { hp: "ample", mp: "available", stamina: "available" },
        },
        b: {
          condition: "strained",
          reserves: { hp: "low", mp: "available", stamina: "available" },
        },
      },
    });

    assert.equal(observedTier, "fast");
    assert.equal(result.winnerSide, "b");
  });

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
