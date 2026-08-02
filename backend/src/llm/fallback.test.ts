import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFallbackLlmProvider, isQuotaLimitError } from "./fallback.js";
import type { LlmProvider } from "./types.js";

function fakeProvider(
  name: string,
  generate: () => Promise<unknown>,
): LlmProvider {
  return {
    name,
    generateNarrationStyle: generate,
  } as unknown as LlmProvider;
}

describe("LLM provider fallback", () => {
  it("recognizes quota and spending-limit errors", () => {
    assert.equal(isQuotaLimitError(Object.assign(new Error("rate limit"), { status: 429 })), true);
    assert.equal(isQuotaLimitError(Object.assign(new Error("monthly spending limit"), { status: 403 })), true);
    assert.equal(isQuotaLimitError(Object.assign(new Error("forbidden"), { status: 403 })), false);
  });

  it("skips a quota-limited provider until the cooldown expires", async () => {
    let time = 1_000;
    let primaryCalls = 0;
    const primary = fakeProvider("primary", async () => {
      primaryCalls += 1;
      throw Object.assign(new Error("credits exhausted"), { status: 403 });
    });
    const secondary = fakeProvider("secondary", async () => ({ displayName: "ok" }));
    const router = createFallbackLlmProvider(
      [primary, secondary],
      3_600_000,
      () => time,
    );

    await router.generateNarrationStyle!("a");
    await router.generateNarrationStyle!("b");
    assert.equal(primaryCalls, 1);

    time += 3_600_001;
    await router.generateNarrationStyle!("c");
    assert.equal(primaryCalls, 2);
  });

  it("falls through transient errors without applying the quota cooldown", async () => {
    let primaryCalls = 0;
    const primary = fakeProvider("primary", async () => {
      primaryCalls += 1;
      throw new Error("invalid JSON");
    });
    const secondary = fakeProvider("secondary", async () => ({ displayName: "ok" }));
    const router = createFallbackLlmProvider([primary, secondary], 3_600_000);

    await router.generateNarrationStyle!("a");
    await router.generateNarrationStyle!("b");
    assert.equal(primaryCalls, 2);
  });
});
