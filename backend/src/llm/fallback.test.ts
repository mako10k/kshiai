import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFallbackLlmProvider,
  isProviderUnavailableError,
  withLlmProviderRouteReceiptCapture,
} from "./fallback.js";
import type { LlmProvider } from "./types.js";
import { MockLlmProvider } from "./mock.js";
import type { LlmProviderRouteReceipt } from "@kshiai/shared";

function fakeProvider(
  name: string,
  generate: NonNullable<LlmProvider["generateNarrationStyle"]>,
): LlmProvider {
  const provider = new MockLlmProvider();
  Object.defineProperty(provider, "name", { value: name });
  provider.generateNarrationStyle = generate;
  return provider;
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
    const secondaryBase = new MockLlmProvider();
    const secondary = fakeProvider(
      "secondary",
      (input) => secondaryBase.generateNarrationStyle(input),
    );
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
    const secondaryBase = new MockLlmProvider();
    const secondary = fakeProvider(
      "secondary",
      (input) => secondaryBase.generateNarrationStyle(input),
    );
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
      const secondaryBase = new MockLlmProvider();
      const secondary = fakeProvider("secondary", async (input) => {
        secondaryCalls += 1;
        return secondaryBase.generateNarrationStyle(input);
      });
      const router = createFallbackLlmProvider([primary, secondary], 3_600_000);

      await assert.rejects(
        router.generateNarrationStyle!("a"),
        (error) => error === failure,
      );
      assert.equal(secondaryCalls, 0);
    }
  });

  it("captures failed and cooldown-active routing with the selected provider", async () => {
    let time = 1_000;
    const primary = fakeProvider("primary", async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND api.example"), {
        code: "ENOTFOUND",
      });
    });
    const secondaryBase = new MockLlmProvider();
    const secondary = fakeProvider(
      "secondary",
      (input) => secondaryBase.generateNarrationStyle(input),
    );
    const router = createFallbackLlmProvider(
      [primary, secondary],
      3_600_000,
      () => time,
    );
    const receipts: LlmProviderRouteReceipt[] = [];

    await withLlmProviderRouteReceiptCapture(receipts, () =>
      router.generateNarrationStyle!("first")
    );
    time += 10;
    await withLlmProviderRouteReceiptCapture(receipts, () =>
      router.generateNarrationStyle!("second")
    );

    assert.deepEqual(receipts, [
      {
        operation: "generateNarrationStyle",
        failures: [{
          provider: "primary",
          reason: "dns",
          disposition: "failed",
          cooldownMs: 3_600_000,
        }],
        selectedProvider: "secondary",
      },
      {
        operation: "generateNarrationStyle",
        failures: [{
          provider: "primary",
          reason: "dns",
          disposition: "cooldown_active",
          cooldownMs: 3_599_990,
        }],
        selectedProvider: "secondary",
      },
    ]);
  });

  it("captures exhausted routing with no selected provider", async () => {
    const primary = fakeProvider("primary", async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND primary"), {
        code: "ENOTFOUND",
      });
    });
    const secondary = fakeProvider("secondary", async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND secondary"), {
        code: "ENOTFOUND",
      });
    });
    const router = createFallbackLlmProvider([primary, secondary], 60_000);
    const receipts: LlmProviderRouteReceipt[] = [];

    await assert.rejects(
      withLlmProviderRouteReceiptCapture(receipts, () =>
        router.generateNarrationStyle!("exhausted")
      ),
      /ENOTFOUND/,
    );

    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.selectedProvider, null);
    assert.deepEqual(
      receipts[0]?.failures.map(({ provider, reason }) => ({ provider, reason })),
      [
        { provider: "primary", reason: "dns" },
        { provider: "secondary", reason: "dns" },
      ],
    );
  });
});
