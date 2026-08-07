import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFallbackLlmProvider,
  isProviderUnavailableError,
} from "./fallback.js";
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
  it("recognizes only DNS and billing as provider unavailable", () => {
    assert.equal(
      isProviderUnavailableError(Object.assign(new Error("rate limit"), { status: 429 })),
      false,
    );
    assert.equal(
      isProviderUnavailableError(Object.assign(new Error("monthly spending limit"), { status: 403 })),
      true,
    );
    assert.equal(
      isProviderUnavailableError(Object.assign(new Error("unavailable"), { status: 503 })),
      false,
    );
    assert.equal(
      isProviderUnavailableError(Object.assign(new Error("getaddrinfo ENOTFOUND"), {
        code: "ENOTFOUND",
      })),
      true,
    );
  });

  it("skips a billing-unavailable provider until the cooldown expires", async () => {
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

  it("cools down DNS failures before using the next provider", async () => {
    let primaryCalls = 0;
    const primary = fakeProvider("primary", async () => {
      primaryCalls += 1;
      throw Object.assign(new Error("getaddrinfo ENOTFOUND api.example"), {
        code: "ENOTFOUND",
      });
    });
    const secondary = fakeProvider("secondary", async () => ({ displayName: "ok" }));
    const router = createFallbackLlmProvider([primary, secondary], 3_600_000);

    await router.generateNarrationStyle!("a");
    await router.generateNarrationStyle!("b");
    assert.equal(primaryCalls, 1);
  });

  it("does not provider-fallback on timeout 429 503 or operation errors", async () => {
    const failures = [
      new Error("Request was aborted."),
      Object.assign(new Error("rate limit"), { status: 429 }),
      Object.assign(new Error("unavailable"), { status: 503 }),
      new SyntaxError("invalid JSON"),
    ];
    for (const failure of failures) {
      let secondaryCalls = 0;
      const primary = fakeProvider("primary", async () => {
        throw failure;
      });
      const secondary = fakeProvider("secondary", async () => {
        secondaryCalls += 1;
        return { displayName: "unexpected" };
      });
      const router = createFallbackLlmProvider([primary, secondary], 3_600_000);

      await assert.rejects(
        router.generateNarrationStyle!("a"),
        (error) => error === failure,
      );
      assert.equal(secondaryCalls, 0);
    }
  });
});
