// R: Verify category-aware estimated costs preserve incomplete totals and support repricing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateLlmUsageCostReport, type LlmUsagePriceTable } from "./llm-usage-cost-report.js";
import type { LlmUsageAttempt } from "../repositories/llm-usage.js";
const attempt: LlmUsageAttempt = { id: "call:1", callId: "call", attemptOrdinal: 1, provider: "xai", requestedModel: "grok", responseModel: null, requestId: null,
  battleId: "b", role: "conscious", side: "a", tick: 1, receiptIds: [], startedAt: 1, finishedAt: 2, elapsedMs: 1, status: "completed", errorClass: null,
  promptTokens: 1000000, cachedTokens: 400000, completionTokens: 300000, reasoningTokens: 200000, totalTokens: 1300000, rawUsage: null };
// Explicit test-only rates; these are not provider prices.
const prices: LlmUsagePriceTable = { revision: "test-rate-v1", entries: [{ provider: "xai", model: "grok", inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 10 }] };
describe("estimated usage cost report", () => {
  it("splits cached input and does not add reasoning twice", () => {
    const report = calculateLlmUsageCostReport([attempt], prices);
    assert.equal(report.knownSubtotalUsd, 4.4); assert.equal(report.complete, true);
    assert.equal(report.unknownAttemptCount, 0); assert.equal(report.label, "estimated usage cost");
  });
  it("retains known output subtotal while identifying unknown usage and missing prices", () => {
    const report = calculateLlmUsageCostReport([{ ...attempt, cachedTokens: null }, { ...attempt, id: "call:2", responseModel: "unknown-model" }], prices);
    assert.equal(report.knownSubtotalUsd, 3); assert.equal(report.complete, false);
    assert.equal(report.unknownAttemptCount, 2); assert.equal(report.missingUsageCount, 1); assert.equal(report.missingPriceCount, 1);
  });
  it("reports known token subtotals and unknown counts without requiring a price file", () => {
    const report = calculateLlmUsageCostReport([attempt, { ...attempt, id: "call:2", role: "narration", promptTokens: null, cachedTokens: null, reasoningTokens: null }]);
    assert.equal(report.priceRevision, "unpriced"); assert.equal(report.complete, false);
    assert.equal(report.tokens.promptTokens.knownSubtotal, 1000000); assert.equal(report.tokens.promptTokens.unknownCount, 1);
    assert.equal(report.tokens.completionTokens.knownSubtotal, 600000); assert.equal(report.tokens.completionTokens.unknownCount, 0);
    assert.equal(report.tokens.reasoningTokens.unknownCount, 1); assert.equal(report.groups.length, 2);
    assert.equal(report.groups.find((group) => group.role === "conscious")?.tokens.cachedTokens.knownSubtotal, 400000);
    assert.equal(report.missingPriceCount, 2); assert.equal(report.attempts[0]?.knownCostUsd, null);
  });
  it("rejects impossible overlapping categories and reprices without mutating observations", () => {
    const original = structuredClone(attempt);
    const invalid = calculateLlmUsageCostReport([{ ...attempt, cachedTokens: 1000001 }], prices);
    assert.equal(invalid.calculationImpossibleCount, 1); assert.equal(invalid.attempts[0]?.knownCostUsd, null);
    const changed = calculateLlmUsageCostReport([attempt], { revision: "test-rate-v2", entries: prices.entries.map((entry) => ({ ...entry, outputUsdPerMillion: 20 })) });
    assert.equal(changed.knownSubtotalUsd, 7.4); assert.deepEqual(attempt, original);
    assert.throws(() => calculateLlmUsageCostReport([attempt], { ...prices, entries: [...prices.entries, ...prices.entries] }), /Duplicate/);
  });
});
