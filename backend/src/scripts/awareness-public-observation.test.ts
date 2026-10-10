// R: Lock public acceptance against unresolved or cross-battle usage and preserve unknown token facts.
import assert from "node:assert/strict";
import { it } from "node:test";
import { AwarenessInitialize, AwarenessNormalPolicy, UnifiedConsciousnessPolicyV2, initializeUnifiedConsciousness, defaultCharacterIdentity, type UnifiedConsciousnessInput } from "@kshiai/shared";
import { LlmUsageAttemptSchema } from "../repositories/llm-usage.js";
import { budgetSnapshot } from "../repositories/awareness-reservation-budget.js";
import type { UnifiedRuntimeSnapshot } from "../repositories/unified-consciousness.js";
import type { AwarenessRuntimeSnapshot } from "../repositories/battle-awareness.js";
import { verifyAwarenessPublicObservation, verifyUnifiedPublicObservation } from "./awareness-public-observation.js";

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

function unifiedSample() {
  const policy = UnifiedConsciousnessPolicyV2;
  const bound = { schemaVersion: 6 as const, awarenessPolicy: AwarenessNormalPolicy, consciousnessPolicy: policy,
    consciousnessPromptRevision: "unified-consciousness-prompt-v2" as const };
  const initial = initializeUnifiedConsciousness(policy, 1);
  const input = (side: "a" | "b"): UnifiedConsciousnessInput => ({
    side, tick: 0, character: { schemaVersion: 1, displayName: side, identity: defaultCharacterIdentity(), tags: [], appearanceSummary: "", traits: [], narrativeBlurb: "",
      basicAction: { name: "待つ", description: "静止" }, skills: [], equipment: { weapon: null, armor: null } },
    characteristics: [], memory: [], events: [], availableActions: [], facts: [], ongoingAction: null,
    perception: { schemaVersion: 1, observer: { side, self: "self" }, turn: 0, revision: 0,
      self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "本人", percepts: [] },
      counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "不明", percepts: [] },
      others: [], qualitativeChanges: [], reserveCues: [], latestDiff: { fromRevision: 0, toRevision: 0, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] } },
  });
  const saved: UnifiedRuntimeSnapshot = { battleId: "battle", revision: 1, fencingToken: 1, updatedAt: "2026-10-10T00:00:00Z", runtime: {
    ...initial, tick: 0, status: "terminal", terminalAt: 2,
    sides: { a: { ...initial.sides.a, calls: 1 }, b: { ...initial.sides.b, calls: 1 } },
    decisions: (["a", "b"] as const).map((side) => ({ id: side, side, tick: 0, worldRevision: 0, memoryRevision: 0,
      inputDigest: side, input: input(side), status: "applied", output: {}, physicalOutstanding: false, failure: null, deadlineAt: 100 })),
    budget: budgetSnapshot((["adjudication", "narration"] as const).map((role) => ({ id: role, role,
      maximumUsd: null, actualUsd: null, status: "unknown", physicalOutstanding: false }))),
  } };
  const { attempts } = sample();
  const consciousness = attempts[1]!;
  const a = { ...consciousness, role: "consciousness", id: "a", callId: "a", side: "a" as const };
  const b = { ...a, id: "b", callId: "b", side: "b" as const };
  return { bound, saved, attempts: [attempts[0]!, a, b, attempts[2]!] };
}
it("verifies unified v1 completion using both sides plus operational reservations without private content", () => {
  const { bound, saved, attempts } = unifiedSample();
  const report = verifyUnifiedPublicObservation("battle", bound, saved, attempts);
  assert.equal(report.engine, "unified-consciousness-v1");
  assert.equal(report.policyRevision, "unified-consciousness-policy-v2");
  assert.equal(report.effectivePromptRevision, "unified-consciousness-prompt-v2");
  assert.equal(report.physicalAttempts, 4);
  assert.equal(report.physicalOutstanding, 0);
  assert.equal(report.reportedTokens.total, 48);
  assert.equal(report.monetaryCost, "unknown_without_verified_prices");
  assert.doesNotMatch(JSON.stringify(report), /inputDigest|memoryOperations|rawUsage|decisions/);
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts.slice(1)), /USAGE_ATTEMPTS/);
  attempts[1]!.side = "b";
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts), /SIDE_MISSING/);
});
it("rejects unified unresolved execution, tuple drift, uncommitted decisions and missing roles", () => {
  const { bound, saved, attempts } = unifiedSample();
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, null, attempts), /RUNTIME_NOT_FINISHED/);
  assert.throws(() => verifyUnifiedPublicObservation("other", bound, saved, attempts), /RUNTIME_NOT_FINISHED/);
  saved.runtime.status = "active";
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts), /RUNTIME_NOT_FINISHED/);
  saved.runtime.status = "terminal";
  saved.runtime.decisions[0]!.status = "prepared";
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts), /RUNTIME_NOT_FINISHED/);
  saved.runtime.decisions[0]!.status = "applied";
  saved.runtime.budget.reservations[0]!.physicalOutstanding = true;
  saved.runtime.budget.physicalOutstanding = 1;
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts), /PHYSICAL_BUDGET/);
  saved.runtime.budget.reservations[0]!.physicalOutstanding = false;
  saved.runtime.budget.physicalOutstanding = 0;
  saved.runtime.policy = { ...saved.runtime.policy, revision: "unified-consciousness-policy-v1", retries: 0 };
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts), /RUNTIME_NOT_FINISHED/);
  saved.runtime.policy = bound.consciousnessPolicy;
  attempts[1]!.role = "subconscious"; attempts[2]!.role = "subconscious";
  assert.throws(() => verifyUnifiedPublicObservation("battle", bound, saved, attempts), /ROLE_MISSING:consciousness/);
});
