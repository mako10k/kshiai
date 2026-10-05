// R: Verify encounter creation uses the real SDK route under durable exact-quote admission.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { AwarenessInitialize, AwarenessObservedPolicy, ensureBattleCompatibilityState, type BattleEncounterProposal } from "@kshiai/shared";
import type { AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";
import type { LlmProvider } from "../llm/types.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";
const directory = mkdtempSync(join(tmpdir(), "kshiai-creation-sdk-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { OpenAiCompatibleProvider } = await import("../llm/openai-compatible.js");
const { createAwarenessProviderRoles } = await import("../llm/awareness-provider-factory.js");
const { requestDigest } = await import("./distributed-guard.js");
const { getDb } = await import("../db.js");
const { prepareAwarenessCreationEncounter } = await import("./awareness-creation-encounter.js");
const { adoptAwarenessCreationInTransaction } = await import("../repositories/battle-awareness-creation.js");
const { getAwarenessRuntime } = await import("../repositories/battle-awareness.js");
const { insertNewBattle } = await import("../repositories/battles.js");
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const proposal: BattleEncounterProposal = { participants: { a: { battleLabel: "A" }, b: { battleLabel: "B" } },
  social: { a: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null },
    b: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null } }, openingSummary: "対峙する" };
const encounter: Parameters<LlmProvider["prepareBattleEncounter"]>[0] = {
  sideA: { displayName: "A", nicknames: [], selfNames: [], epithets: [], traits: ["慎重"], narrativeBlurb: "" },
  sideB: { displayName: "B", nicknames: [], selfNames: [], epithets: [], traits: [], narrativeBlurb: "" },
  field: { displayName: "草原", scene: "静かな草原", conditions: [], narrativeSetup: "向き合う" }, priorMatchSummary: null,
};
function provider(billed = true) {
  const roles = createAwarenessProviderRoles({ openai: { apiKey: "test-only", baseUrl: "https://example.invalid/v1" },
    xai: { apiKey: "test-only", baseUrl: "https://example.invalid/v1", modelEngine: "grok-engine", modelFast: "grok-fast" } });
  assert.ok(roles);
  const quotes: Array<{ model: string; system: string; user: string; cap: number }> = [];
  const contract: AwarenessVerifiedBillingContract = { provider: "xai", model: "grok-engine", async quote(request) {
    quotes.push({ model: request.model, system: request.system, user: request.user, cap: request.options.maxCompletionTokens });
    return { provider: request.provider, model: request.model, requestDigest: requestDigest(request), fullMessageTokens: 100,
      outputTokenLimit: request.options.maxCompletionTokens, maximumChargeUsd: 0.001, verifiedFullPrompt: true, includesAllGeneratedTokens: true };
  } };
  const llm: LlmProvider = Object.assign(new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only",
    baseUrl: "https://example.invalid/v1", modelEngine: "grok-engine", modelFast: "grok-fast" }),
  { awareness: roles, awarenessBillingContracts: billed ? [contract] : [] });
  return { llm, quotes };
}
function input(battleId: string, llm: LlmProvider) {
  return { battleId, encounter, llm, identity: { userId: "u", characterGenerationIds: ["generation-a", "generation-b"] as const } };
}
describe("admitted creation encounter through actual compatible SDK", () => {
  it("preserves V5 world and perceptions without synthesizing legacy subjective agents", () => {
    const { state } = validAwarenessBattleFixture("no-legacy-migration");
    state.agentStateA = undefined;
    state.agentStateB = undefined;
    state.plannedActionA = { kind: "wait" };
    const normalized = ensureBattleCompatibilityState(state);
    assert.equal(normalized.agentStateA, undefined);
    assert.equal(normalized.agentStateB, undefined);
    assert.deepEqual(normalized.plannedActionA, { kind: "wait" });
    assert.deepEqual(normalized.worldState, state.worldState);
    assert.deepEqual(normalized.perceptionFrameA, state.perceptionFrameA);
    assert.deepEqual(normalized.perceptionFrameB, state.perceptionFrameB);
  });
  it("quotes the full prose engine request capped at 1500 and reuses the durable ready result", async (t) => {
    let sends = 0;
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      sends++;
      const body = z.object({ model: z.string(), max_completion_tokens: z.number(), messages: z.array(z.object({ content: z.string() })) }).parse(JSON.parse(String(init.body)));
      assert.equal(body.model, "grok-engine");
      assert.equal(body.max_completion_tokens, 1500);
      assert.match(body.messages[1]?.content ?? "", /A/);
      return Response.json({ choices: [{ message: { content: JSON.stringify(proposal) } }], usage: { total_tokens: 20 } });
    });
    const { llm, quotes } = provider();
    const first = await prepareAwarenessCreationEncounter(input("sdk-ready", llm));
    assert.equal(sends, 1);
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0]?.cap, 1500);
    assert.match(quotes[0]?.user ?? "", /草原/);
    assert.equal((quotes[0]?.user ?? "").trim().startsWith("{"), false);
    const retry = await prepareAwarenessCreationEncounter(input("sdk-ready", llm));
    assert.deepEqual(retry.proposal, first.proposal);
    assert.equal(sends, 1);
    assert.equal(quotes.length, 1);
  });
  it("makes zero HTTP calls without verified billing proof and creates no canonical battle", async (t) => {
    let sends = 0;
    t.mock.method(globalThis, "fetch", async () => { sends++; throw new Error("forbidden"); });
    await assert.rejects(prepareAwarenessCreationEncounter(input("sdk-noquote", provider(false).llm)), /VERIFIED_ADMISSION_REQUIRED/);
    assert.equal(sends, 0);
    assert.equal(getDb().prepare("SELECT 1 FROM battles WHERE id=?").get("sdk-noquote"), undefined);
  });
  it("persists an invalid provider proposal as failure and never retries transmission", async (t) => {
    let sends = 0;
    t.mock.method(globalThis, "fetch", async () => { sends++; return Response.json({ choices: [{ message: { content: '{"invalid":true}' } }] }); });
    const { llm } = provider();
    await assert.rejects(prepareAwarenessCreationEncounter(input("sdk-invalid", llm)));
    await assert.rejects(prepareAwarenessCreationEncounter(input("sdk-invalid", llm)), /CREATION_FAILED/);
    assert.equal(sends, 1);
    assert.equal(await getAwarenessRuntime("sdk-invalid"), null);
  });
  it("adopts the reserved encounter runtime atomically in actual canonical insertNewBattle", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: JSON.stringify(proposal) } }] }));
    const prepared = await prepareAwarenessCreationEncounter(input("sdk-adopt", provider().llm));
    const { state } = validAwarenessBattleFixture("sdk-adopt");
    const created = await insertNewBattle(state, { sideAUserId: "u", sideACharacterId: state.sideA.characterId, sideBCharacterId: state.sideB.characterId },
      (connection) => adoptAwarenessCreationInTransaction(connection, { battleId: state.id, requestDigest: prepared.creation.requestDigest,
        runtime: AwarenessInitialize({ startedAt: Date.now(), promptRevision: "test", outputRevision: "test" }), now: Date.now() }).then(() => undefined));
    assert.equal(created, "created");
    const runtime = await getAwarenessRuntime(state.id);
    assert.equal(runtime?.runtime.startedAt, prepared.creation.startedAt);
    assert.equal(runtime?.runtime.budget.physicalAttempts, 1);
    assert.equal(runtime?.runtime.budget.reservedUsd, 0.001);
    assert.equal(runtime?.runtime.budget.physicalOutstanding, 0);
  });
});

it("observed creation sends one scoped SDK call without a pricing contract", async (t) => {
  const { currentLlmUsageScope } = await import("../llm/llm-usage-context.js");
  let sends=0;
  t.mock.method(globalThis,"fetch",async()=>{
    sends++;assert.equal(currentLlmUsageScope()?.battleId,"sdk-observed");assert.equal(currentLlmUsageScope()?.role,"creation");
    return Response.json({choices:[{message:{content:JSON.stringify(proposal)}}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});
  });
  const {llm,quotes}=provider(false);
  const result=await prepareAwarenessCreationEncounter({...input("sdk-observed",llm),policy:AwarenessObservedPolicy});
  assert.equal(sends,1);assert.equal(quotes.length,0);assert.equal(result.creation.policy.accountingMode,"observed");
  assert.equal(result.creation.proof?.mode,"observed");assert.equal(result.creation.proof?.inputTokens,null);
  assert.equal(result.creation.reservation?.maximumUsd,null);assert.equal(result.creation.reservation?.actualUsd,null);
});
