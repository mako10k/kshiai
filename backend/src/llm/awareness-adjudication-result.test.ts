import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// R: Verify successful physical responses cannot fabricate replacement adjudication facts.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { freeActionContractClarification, freeActionSchemaDiagnostics } from "./free-action-output-contract.js";
import { AwarenessDefaultPolicy, FreeActionAdjudicationBatchSchema } from "@kshiai/shared";
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

it("explains complete free-action envelopes and exact optional/penalty bounds without changing validation", () => {
  const prompt = freeActionContractClarification({ turn: 1, scene: "場所", actors: { a: { displayName: "A", capabilityEvidence: [] }, b: { displayName: "B", capabilityEvidence: [] } },
    intents: [{ actorSide: "a", intent: { kind: "free_action", description: "手を動かす", subjectRefs: ["self"] }, perceivedAffordances: [] }], canonicalRoots: [] });
  assert.match(prompt, /subject:null is invalid/);
  assert.match(prompt, /at most120 characters/);
  assert.match(prompt, /Do not add numeric stamina/);
  const exampleText = prompt.split("Complete response structure example: ")[1]?.split(". This illustrates shape only:")[0];
  assert.ok(exampleText);
  const example = FreeActionAdjudicationBatchSchema.parse(JSON.parse(exampleText));
  assert.deepEqual(example.proposals.map((proposal) => proposal.actorSide), ["a"]);
  assert.equal(example.proposals[0]?.penalty, null);
  assert.equal("subject" in example.proposals[0]!, false);
});
it("reports bounded schema codes and known paths without private values, messages or unknown keys", () => {
  const parsed = FreeActionAdjudicationBatchSchema.safeParse({ proposals: [{ actorSide: "a", outcome: "possible", interpretation: "内容",
    subject: null, changes: [], successSummary: "成功", failureSummary: "失敗", SECRET_PRIVATE_KEY: "SECRET_PRIVATE_VALUE" }] });
  assert.equal(parsed.success, false);
  if (parsed.success) throw new Error("Invalid fixture accepted");
  const diagnostics = freeActionSchemaDiagnostics(parsed.error);
  assert.ok(diagnostics.some((issue) => issue.path.join(".") === "proposals.0.subject"));
  assert.doesNotMatch(JSON.stringify(diagnostics), /SECRET_PRIVATE|内容|Expected|received/);
  assert.ok(diagnostics.length <= 12);
});
it("uses clarification only for unified policy-v2 guarded requests and never retries schema-invalid content", async (t) => {
  const prior = globalThis.fetch;
  let invalid = false; const systems: string[] = []; const logs: string[] = [];
  t.mock.method(console, "warn", (text: string) => { logs.push(text); });
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    systems.push(String(request.messages[0].content));
    const proposal = { actorSide: "a", outcome: "possible", interpretation: "動く", changes: [], penalty: null, successSummary: "動いた", failureSummary: "届かなかった" };
    return new Response(JSON.stringify({ id: "wire", object: "chat.completion", created: 1, model: "grok-4.5",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ proposals: [{ ...proposal, ...(invalid ? { subject: null } : {}) }] }) }, finish_reason: "stop" }] }),
      { headers: { "content-type": "application/json" } });
  };
  const input: Parameters<LlmProvider["adjudicateFreeActions"]>[0] = { turn: 1, scene: "場所", actors: { a: { displayName: "A", capabilityEvidence: [] }, b: { displayName: "B", capabilityEvidence: [] } },
    intents: [{ actorSide: "a", intent: { kind: "free_action", description: "動く", subjectRefs: ["self"] }, perceivedAffordances: [] }], canonicalRoots: [] };
  const guard: AwarenessDispatchContext = { provider: "xai", model: "grok-4.5", limits: AwarenessDefaultPolicy.roles.adjudication,
    async run(_request, send) { return (await send()).result; } };
  try {
    const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://strict-test.invalid/v1", modelEngine: "grok-4.5", modelFast: "grok-4.5", fallbackOnError: false });
    await withAwarenessDispatchContext(guard, () => provider.adjudicateFreeActions(input));
    assert.doesNotMatch(systems[0]!, /Strict wire contract:/);
    await withAwarenessDispatchContext({ ...guard, rateLimitRetryBattleId: "wire-contract-test" }, () => provider.adjudicateFreeActions(input));
    assert.match(systems[1]!, /Strict wire contract:/);
    invalid = true;
    await assert.rejects(withAwarenessDispatchContext({ ...guard, rateLimitRetryBattleId: "wire-contract-test" }, () => provider.adjudicateFreeActions(input)), /FREE_ACTION_BATCH_SCHEMA/);
    assert.equal(systems.length, 3);
    assert.ok(logs.some((line) => line.includes("free_action_schema_invalid") && line.includes("subject")));
  } finally { globalThis.fetch = prior; }
});
