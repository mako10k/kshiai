import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyLlmProviderError,
  providerRetryAfterMs,
} from "./provider-errors.js";

describe("LLM provider errors", () => {
  it("separates retryable responses from provider-unavailable failures", () => {
    assert.equal(
      classifyLlmProviderError(Object.assign(new Error("rate limit"), { status: 429 })),
      "rate_limit",
    );
    assert.equal(
      classifyLlmProviderError(Object.assign(new Error("unavailable"), { status: 503 })),
      "service_unavailable",
    );
    assert.equal(
      classifyLlmProviderError(new Error("Request was aborted.")),
      "timeout",
    );
    assert.equal(
      classifyLlmProviderError(Object.assign(new Error("credits exhausted"), { status: 403 })),
      "billing",
    );
    assert.equal(
      classifyLlmProviderError(Object.assign(new Error("payment required"), { status: 402 })),
      "billing",
    );
    assert.equal(
      classifyLlmProviderError(Object.assign(new Error("connection error"), {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.example"), {
          code: "ENOTFOUND",
        }),
      })),
      "dns",
    );
    assert.equal(classifyLlmProviderError(new SyntaxError("invalid JSON")), "other");
  });

  it("does not mistake a 403 rate limit for exhausted billing", () => {
    assert.equal(
      classifyLlmProviderError(Object.assign(new Error("rate limit reached"), { status: 403 })),
      "rate_limit",
    );
  });

  it("bounds provider requested retry delays", () => {
    assert.equal(providerRetryAfterMs({ headers: { "retry-after": "2" } }), 2_000);
    assert.equal(
      providerRetryAfterMs({ headers: { "retry-after-ms": "25000" } }),
      10_000,
    );
    assert.equal(providerRetryAfterMs({ headers: {} }), null);
  });
});
