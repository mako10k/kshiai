// R: Lock public acceptance against unresolved or cross-battle usage and preserve unknown token facts.
import assert from "node:assert/strict";
import { it } from "node:test";
import { AwarenessInitialize, AwarenessNormalPolicy } from "@kshiai/shared";
import { LlmUsageAttemptSchema } from "../repositories/llm-usage.js";
import type { AwarenessRuntimeSnapshot } from "../repositories/battle-awareness.js";
import { verifyAwarenessPublicObservation } from "./awareness-public-observation.js";

const manifest = { schemaVersion: 5 as const, awarenessPolicy: AwarenessNormalPolicy, promptRevision: "awareness-prompt-v3" as const };
function sample() {
  const initial = AwarenessInitialize({ startedAt: 1, promptRevision: manifest.promptRevision, outputRevision: "awareness-output-v1", policy: AwarenessNormalPolicy });
  const saved: AwarenessRuntimeSnapshot = { battleId: "battle", revision: 1, fencingToken: 1, updatedAt: "2026-10-05T00:00:00Z",
    runtime: { ...initial, status: "terminal", terminalAt: 2, budget: { ...initial.budget, physicalAttempts: 3 } } };
  const attempts = ["creation", "subconscious", "narration"].map((role) => LlmUsageAttemptSchema.parse({
    id: role, callId: role, attemptOrdinal: 1, provider: "xai", requestedModel: "test", responseModel: "test", requestId: null,
    battleId: "battle", role, side: null, tick: null, receiptIds: [], startedAt: 1, finishedAt: 2, elapsedMs: 1,
    status: "completed", errorClass: null, promptTokens: 10, completionTokens: 2, totalTokens: 12,
    cachedTokens: null, reasoningTokens: null, rawUsage: null,
  }));
  return { saved, attempts };
}
it("reports one physical batch attempt and actual tokens without inventing prices or private content", () => {
  const { saved, attempts } = sample();
  attempts[2]!.receiptIds = ["r1", "r2", "r3"];
  const report = verifyAwarenessPublicObservation("battle", manifest, saved, attempts);
  assert.equal(report.narrationPhysicalAttempts, 1);
  assert.deepEqual(report.reportedTokens, { prompt: 30, completion: 6, total: 36, unknownAttempts: 0 });
  assert.equal(report.monetaryCost, "unknown_without_verified_prices");
  assert.equal(JSON.stringify(report).includes("rawUsage"), false);
  attempts[0]!.promptTokens = null;
  assert.equal(verifyAwarenessPublicObservation("battle", manifest, saved, attempts).reportedTokens.unknownAttempts, 1);
});
it("rejects missing runtime, outstanding execution, cross-battle rows and ledger mismatches", () => {
  const { saved, attempts } = sample();
  assert.throws(() => verifyAwarenessPublicObservation("battle", manifest, null, attempts), /RUNTIME_NOT_FINISHED/);
  saved.runtime.budget.physicalOutstanding = 1;
  assert.throws(() => verifyAwarenessPublicObservation("battle", manifest, saved, attempts), /PHYSICAL_BUDGET/);
  saved.runtime.budget.physicalOutstanding = 0;
  attempts[0]!.status = "started";
  assert.throws(() => verifyAwarenessPublicObservation("battle", manifest, saved, attempts), /USAGE_ATTEMPTS/);
  attempts[0]!.status = "completed";
  attempts[0]!.battleId = "other";
  assert.throws(() => verifyAwarenessPublicObservation("battle", manifest, saved, attempts), /USAGE_ATTEMPTS/);
  attempts[0]!.battleId = "battle";
  assert.throws(() => verifyAwarenessPublicObservation("battle", manifest, saved, attempts.slice(1)), /USAGE_ATTEMPTS/);
});
