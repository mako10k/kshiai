import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// R: Verify successful physical responses cannot fabricate replacement adjudication facts.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { AwarenessDefaultPolicy } from "@kshiai/shared";
import type { LlmProvider } from "./types.js";

import { withAwarenessDispatchContext, type AwarenessDispatchContext } from "./awareness-dispatch-context.js";
import { PERCEPTION_PROMPT_FIXTURES } from "./perception-prompt-strategy.js";
import { decodeAwarenessRefereeResult, decodeAwarenessSemanticResult } from "./awareness-adjudication-result.js";

const usageTestDirectory = mkdtempSync(join(tmpdir(), "kshiai-sdk-usage-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(usageTestDirectory, "usage.db");
process.env.AUTH_PROVIDER = "legacy";
const { OpenAiCompatibleProvider } = await import("./openai-compatible.js");
const { closeDatabase } = await import("../db.js");
after(async () => { await closeDatabase(); rmSync(usageTestDirectory, { recursive: true, force: true }); });

const fixture = PERCEPTION_PROMPT_FIXTURES[0];
assert.ok(fixture);
const input = { ...fixture.input, battlefield: undefined };
const valid = { patch: { operations: [] }, nextSituation: null, environmentDecision: null };
describe("strict awareness adjudication results", () => {
  it("rejects invalid winners and absent or fabricated referee rationales", () => {
    for (const raw of [{ winnerSide: "unknown", reason: "根拠", reasonFacts: [] }, { winnerSide: "a" },
      { winnerSide: "a", reason: "根拠", reasonFacts: [{ factor: "invented", favoredSide: "a", statement: "根拠" }] }]) {
      assert.throws(() => decodeAwarenessRefereeResult(raw));
    }
    assert.equal(decodeAwarenessRefereeResult({ winnerSide: "draw", reason: "差はない", reasonFacts: [
      { factor: "remaining_capacity", favoredSide: "draw", statement: "両者が継続できる" }] }).winnerSide, "draw");
  });
  it("rejects corrupt operations, coerced situation values and missing required sensory evidence", () => {
    assert.throws(() => decodeAwarenessSemanticResult({ ...valid, patch: { operations: [{ invalid: true }] } }, input, false));
    assert.throws(() => decodeAwarenessSemanticResult({ ...valid, nextSituation: { notes: 3, tags: [], coefficients: {} } }, input, false));
    assert.throws(() => decodeAwarenessSemanticResult(valid, input, true), /SENSORY_EVIDENCE_REQUIRED/);
    assert.throws(() => decodeAwarenessSemanticResult({ ...valid, sensoryEvidence: [{ invalid: true }] }, input, true));
  });
  it("preserves valid world operations with server-owned revision and event references", () => {
    const result = decodeAwarenessSemanticResult(valid, input, false);
    assert.equal(result.worldPatchStatus, "valid");
    assert.equal(result.patch?.baseRevision, input.before.revision);
    assert.equal(result.patch?.turn, input.turn);
    assert.deepEqual(result.patch?.sourceEventIds, input.events.flatMap((event) => event.id ? [event.id] : []));
  });
  it("rejects a schema-valid empty batch instead of synthesizing failed free actions", async () => {
    const prior = globalThis.fetch;
    let sends = 0;
    globalThis.fetch = async () => {
      sends += 1;
      return new Response(JSON.stringify({ id: "test", object: "chat.completion", created: 1, model: "grok-4.5",
        choices: [{ index: 0, message: { role: "assistant", content: '{"proposals":[]}' }, finish_reason: "stop" }] }),
        { headers: { "content-type": "application/json" } });
    };
    const guard: AwarenessDispatchContext = { provider: "xai", model: "grok-4.5", limits: AwarenessDefaultPolicy.roles.adjudication,
      async run(_request, send) { return (await send()).result; } };
    const freeInput: Parameters<LlmProvider["adjudicateFreeActions"]>[0] = { turn: 1, scene: "広場",
      actors: { a: { displayName: "a", capabilityEvidence: [] }, b: { displayName: "b", capabilityEvidence: [] } },
      intents: [{ actorSide: "a", intent: { kind: "free_action", description: "腕を伸ばす", subjectRefs: ["actor:a:counterpart"] }, perceivedAffordances: [] }], canonicalRoots: [] };
    try {
      const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://strict-test.invalid/v1",
        modelEngine: "grok-4.5", modelFast: "grok-4.3", fallbackOnError: false });
      await assert.rejects(withAwarenessDispatchContext(guard, () => provider.adjudicateFreeActions(freeInput)), /PROPOSAL_COVERAGE/);
      assert.equal(sends, 1);
    } finally { globalThis.fetch = prior; }
  });
  it("throws after a successful HTTP response instead of silently normalizing invalid semantic content", async () => {
    const prior = globalThis.fetch;
    let physical = 0;
    let completed = 0;
    globalThis.fetch = async () => {
      physical += 1;
      return new Response(JSON.stringify({ id: "test", object: "chat.completion", created: 1, model: "grok-4.5",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ ...valid, patch: { operations: [{ invalid: true }] } }) }, finish_reason: "stop" }] }),
        { headers: { "content-type": "application/json" } });
    };
    const guard: AwarenessDispatchContext = { provider: "xai", model: "grok-4.5", limits: AwarenessDefaultPolicy.roles.adjudication,
      async run(_request, send) { const receipt = await send(); completed += 1; return receipt.result; } };
    try {
      const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://strict-test.invalid/v1",
        modelEngine: "grok-4.5", modelFast: "grok-4.3", fallbackOnError: false });
      await assert.rejects(withAwarenessDispatchContext(guard, () => provider.reconcileTurnSemanticState(input)));
      assert.equal(physical, 1);
      assert.equal(completed, 1);
    } finally { globalThis.fetch = prior; }
  });
});
