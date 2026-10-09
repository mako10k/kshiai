// R: Verify adjudication admission and conservative physical-attempt settlement against persisted SQLite state.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AwarenessInitialize, AwarenessObservedPolicy } from "@kshiai/shared";
import type { AwarenessPricedRequest, AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-awareness-adjudication-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { requestDigest } = await import("./distributed-guard.js");
const { getDb } = await import("../db.js");
const battles = await import("../repositories/battles.js");
const awareness = await import("../repositories/battle-awareness.js");
const { createAwarenessAdjudicationGuard } = await import("./awareness-adjudication-guard.js");
const { battleAwarenessSchemaSql } = await import("../repositories/battle-awareness-schema.js");
getDb().exec(battleAwarenessSchemaSql);
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const request: AwarenessPricedRequest = { provider: "xai", model: "grok-4.5", system: "裁定する", user: "現在の観測",
  options: { tier: "engine", timeoutMs: 10000, maxCompletionTokens: 1500, label: "test-adjudication", responseFormat: { type: "json_object" } } };
const contract: AwarenessVerifiedBillingContract = { provider: request.provider, model: request.model,
  async quote(actual) { return { provider: actual.provider, model: actual.model, requestDigest: requestDigest(actual),
    fullMessageTokens: 100, outputTokenLimit: 1500, maximumChargeUsd: 0.01,
    verifiedFullPrompt: true, includesAllGeneratedTokens: true }; } };
async function fixture(id: string, contracts: readonly AwarenessVerifiedBillingContract[] = [contract], clock?: () => number, observed=false) {
  const now = clock?.() ?? Date.now();
  const { state } = validAwarenessBattleFixture(id);
  assert.equal(await battles.insertNewBattle(state, { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b" }), "created");
  getDb().prepare(`INSERT INTO battle_leases (battle_id, owner_id, fencing_token, acquired_at, expires_at)
    VALUES (?, 'test-owner', 1, ?, ?)`).run(id, new Date(now).toISOString(), new Date(now + 180000).toISOString());
  const fence = { battleId: id, ownerId: "test-owner", fencingToken: 1 };
  await awareness.initializeAwarenessRuntime({ battleId: id, fence, now: new Date(now).toISOString(),
    runtime: AwarenessInitialize({ startedAt: now, promptRevision: "test", outputRevision: "test", ...(observed ? {policy:AwarenessObservedPolicy} : {}) }) });
  return { guard: await createAwarenessAdjudicationGuard({ battleId: id, fence, provider: request.provider, model: request.model, contracts, now: clock }), fence };
}
async function budget(id: string) {
  const saved = await awareness.getAwarenessRuntime(id);
  assert.ok(saved);
  return saved.runtime.budget;
}
describe("persisted adjudication dispatch guard", () => {
  it("quotes the exact request and persists its reservation before the physical send", async () => {
    let quoted: AwarenessPricedRequest | undefined;
    const exactContract: AwarenessVerifiedBillingContract = { ...contract, async quote(actual) { quoted = actual; return contract.quote(actual); } };
    const { guard } = await fixture("adj-exact", [exactContract]);
    const output = await guard.run(request, async () => {
      assert.deepEqual(quoted, request);
      const current = await budget("adj-exact");
      assert.equal(current.physicalAttempts, 1);
      assert.equal(current.physicalOutstanding, 1);
      assert.equal(current.reservedUsd, 0.01);
      return { result: "real-response", usage: null };
    });
    assert.equal(output, "real-response");
  });
  it("dispatches nothing without a verified proof and creates no reservation", async () => {
    const { guard } = await fixture("adj-no-proof", []);
    let sends = 0;
    await assert.rejects(guard.run(request, async () => { sends += 1; return { result: "unreachable", usage: null }; }), /VERIFIED_ADMISSION_REQUIRED/);
    assert.equal(sends, 0);
    assert.equal((await budget("adj-no-proof")).physicalAttempts, 0);
    assert.throws(() => guard.assertUsable(), /VERIFIED_ADMISSION_REQUIRED/);
  });
  it("retains the maximum reservation and physical slot when dispatch completion is unknown", async () => {
    const { guard, fence } = await fixture("adj-network-unknown");
    await assert.rejects(guard.run(request, async () => { throw new Error("connection lost after send"); }), /connection lost/);
    const current = await budget("adj-network-unknown");
    assert.equal(current.reservedUsd, 0.01);
    assert.equal(current.physicalOutstanding, 1);
    assert.equal(current.reservations[0]?.status, "unknown");
    const restarted = await createAwarenessAdjudicationGuard({ battleId: "adj-network-unknown", fence, provider: request.provider, model: request.model, contracts: [contract] });
    assert.throws(() => restarted.assertUsable(), /ADJUDICATION_OUTSTANDING/);
  });
  it("releases the physical slot after completion while retaining unknown dollar cost", async () => {
    const { guard } = await fixture("adj-completed-unknown");
    await guard.run(request, async () => ({ result: { accepted: true }, usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } }));
    const current = await budget("adj-completed-unknown");
    assert.equal(current.physicalOutstanding, 0);
    assert.equal(current.reservedUsd, 0.01);
    assert.equal(current.settledUsd, 0);
    assert.equal(current.reservations[0]?.actualUsd, null);
    assert.equal(current.reservations[0]?.status, "unknown");
    guard.assertUsable();
  });
  it("refuses a proof that returns after the global deadline without sending or reserving", async () => {
    const start = Date.now();
    let time = start + 179000;
    const delayed: AwarenessVerifiedBillingContract = { ...contract, async quote(actual) { time = start + 181000; return contract.quote(actual); } };
    time = start;
    const { guard } = await fixture("adj-quote-deadline", [delayed], () => time);
    time = start + 179000;
    let sends = 0;
    await assert.rejects(guard.run(request, async () => { sends += 1; return { result: "late", usage: null }; }), /ADJUDICATION_DEADLINE/);
    assert.equal(sends, 0);
    assert.equal((await budget("adj-quote-deadline")).physicalAttempts, 0);
  });
  it("rejects a late completed judgment while retaining its maximum cost and releasing its physical slot", async () => {
    const start = Date.now();
    let time = start;
    const { guard } = await fixture("adj-result-deadline", [contract], () => time);
    assert.equal(guard.deadlineAt, start + 180000);
    time = start + 179000;
    await assert.rejects(guard.run(request, async () => { time = start + 181000; return { result: "late winner", usage: null }; }), /ADJUDICATION_DEADLINE/);
    const saved = await budget("adj-result-deadline");
    assert.equal(saved.physicalAttempts, 1);
    assert.equal(saved.physicalOutstanding, 0);
    assert.equal(saved.reservedUsd, 0.01);
    assert.equal(saved.reservations[0]?.actualUsd, null);
    assert.throws(() => guard.assertUsable(), /ADJUDICATION_DEADLINE/);
  });
  it("keeps failure sticky even if a caller catches it and tries another dispatch", async () => {
    const { guard } = await fixture("adj-sticky");
    let sends = 0;
    await assert.rejects(guard.run(request, async () => { sends += 1; throw new Error("provider failed"); }), /provider failed/);
    await assert.rejects(guard.run(request, async () => { sends += 1; return { result: "fallback", usage: null }; }), /provider failed/);
    assert.throws(() => guard.assertUsable(), /provider failed/);
    assert.equal(sends, 1);
    assert.equal((await budget("adj-sticky")).physicalAttempts, 1);
  });
});

it("observed adjudication retains an unpriced reservation and scoped role without a quote",async()=>{
  const {currentLlmUsageScope}=await import("../llm/llm-usage-context.js");
  const {guard}=await fixture("adj-observed",[],undefined,true);
  assert.equal(await guard.run(request,async()=>{
    assert.equal(currentLlmUsageScope()?.battleId,"adj-observed");assert.equal(currentLlmUsageScope()?.role,"adjudication");
    assert.equal((await budget("adj-observed")).reservations[0]?.maximumUsd,null);
    return {result:"accepted",usage:null};
  }),"accepted");
  const saved=await budget("adj-observed");assert.equal(saved.physicalOutstanding,0);assert.equal(saved.reservations[0]?.actualUsd,null);
});

it("preserves executed action correlation through physical adjudication dispatch", async () => {
  const { currentLlmUsageScope, withLlmUsageScope } = await import("../llm/llm-usage-context.js");
  const { guard } = await fixture("adj-action-correlation", [], undefined, true);
  await withLlmUsageScope({ battleId: "wrong-parent", receiptIds: ["turn-2-action-b"] }, () =>
    guard.run(request, async () => {
      assert.equal(currentLlmUsageScope()?.battleId, "adj-action-correlation");
      assert.deepEqual(currentLlmUsageScope()?.receiptIds, ["turn-2-action-b"]);
      return { result: "accepted", usage: null };
    }));
});
