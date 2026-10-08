import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { Completions } from "openai/resources/chat/completions";
import { OpenAiCompatibleProvider, type ChatOpts } from "./openai-compatible.js";

// R: Exercise routing/retry contracts through typed SDK and protected provider seams.
class RoutingProvider extends OpenAiCompatibleProvider {
  override chatJson(system: string, user: string, opts?: ChatOpts): Promise<unknown> {
    return super.chatJson(system, user, opts);
  }
}

function routingProvider(): RoutingProvider {
  return new RoutingProvider({
    name: "primary", apiKey: "test-only", baseUrl: "https://example.invalid/v1",
    modelEngine: "engine-model", modelFast: "fast-model",
  });
}

const originalCreate = Completions.prototype.create;
type CreateArgs = Parameters<typeof originalCreate>;
function observeCreate(t: TestContext, observe: (...args: CreateArgs) => void) {
  t.mock.method(Completions.prototype, "create", function (
    this: Completions, ...args: CreateArgs
  ): ReturnType<typeof originalCreate> {
    observe(...args);
    return originalCreate.apply(this, args);
  });
}

function mockCompletion(t: TestContext) {
  t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify(completion('{"ok":true}')),
    { headers: { "content-type": "application/json" } },
  ));
}

function completion(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

describe("OpenAI-compatible provider routing policy", () => {
  it("requests xAI grok-4.3 directly with reasoning effort none", async (t) => {
    mockCompletion(t);
    const provider = new RoutingProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4.5",
      modelFast: "grok-4.3",
    });
    const bodies: Array<CreateArgs[0]> = [];
    observeCreate(t, (value) => { bodies.push(value); });

    await provider.chatJson("system", "user", { tier: "fast" });
    assert.equal(bodies[0]?.model, "grok-4.3");
    assert.equal(bodies[0]?.reasoning_effort, "none");
  });

  it("does not send xAI-only reasoning effort to another provider", async (t) => {
    mockCompletion(t);
    const provider = new RoutingProvider({
      name: "openai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "gpt-4.1",
      modelFast: "gpt-4.1-mini",
    });
    const bodies: Array<CreateArgs[0]> = [];
    observeCreate(t, (value) => { bodies.push(value); });

    await provider.chatJson("system", "user", { tier: "fast" });
    assert.equal(bodies[0]?.model, "gpt-4.1-mini");
    assert.equal("reasoning_effort" in (bodies[0] ?? {}), false);
  });

  it("routes turn-limit referee rationale through the fast tier", async (t) => {
    const provider = new RoutingProvider({
      name: "primary",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "engine-model",
      modelFast: "fast-model",
    });
    let observedTier: "fast" | "engine" | undefined;
    t.mock.method(provider, "chatJson", async (_system: string, _user: string, opts?: ChatOpts) => {
      observedTier = opts?.tier;
      return {
        winnerSide: "b",
        reason: "確定済みの事実を要約した。",
        reasonFacts: [],
      };
    });

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

  it("uses the extended fast timeout and retries 429 in the same client", async (t) => {
    mockCompletion(t);
    const provider = routingProvider();
    const timeouts: Array<number | undefined> = [];
    let calls = 0;
    observeCreate(t, (_body, options) => {
      calls += 1;
      timeouts.push(options?.timeout);
      if (calls < 3) throw Object.assign(new Error("rate limit"), {
        status: 429, headers: { "retry-after-ms": "0" },
      });
    });

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

  it("limits 503 to one same-provider retry", async (t) => {
    const provider = routingProvider();
    let calls = 0;
    const failure = Object.assign(new Error("unavailable"), {
      status: 503,
      headers: { "retry-after-ms": "0" },
    });
    observeCreate(t, () => {
      calls += 1;
      throw failure;
    });

    await assert.rejects(
      provider.chatJson("system", "user", { tier: "fast", label: "test503" }),
      (error) => error === failure,
    );
    assert.equal(calls, 2);
  });

  it("does not retry an aborted timeout", async (t) => {
    const provider = routingProvider();
    let calls = 0;
    const failure = new Error("Request was aborted.");
    observeCreate(t, () => {
      calls += 1;
      throw failure;
    });

    await assert.rejects(
      provider.chatJson("system", "user", { tier: "fast", label: "timeout" }),
      (error) => error === failure,
    );
    assert.equal(calls, 1);
  });
});
