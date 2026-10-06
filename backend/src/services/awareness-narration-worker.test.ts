// R: Verify V5 narration admission, atomic batch publication and immutable world preservation with SQLite.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { AwarenessInitialize, AwarenessDefaultPolicy, AwarenessObservedPolicy, AwarenessLongMeasurementPolicy, BattleStateSchema, AwarenessFrozenNarrationSchema, type AwarenessPolicyV1 } from "@kshiai/shared";
import type { AwarenessNarrationProvider } from "../llm/awareness-narration.js";
import type { VerifiedNarrationDispatchAdmission } from "./awareness-narration-worker.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "awareness-narration-")), "test.db");
const { query } = await import("../db.js");
const { insertNewBattle } = await import("../repositories/battles.js");
const { initializeAwarenessRuntime, getAwarenessRuntime } = await import("../repositories/battle-awareness.js");
const { acquireBattleLeaseFence, releaseBattleLease, requestDigest } = await import("./distributed-guard.js");
const { enqueueNarration, processNextNarration } = await import("./narration-worker.js");
const { observeLlmPhysicalAttempt } = await import("../repositories/llm-usage-observation.js");
const base = Date.parse("2026-10-05T06:00:00Z");
const clock = { now: () => base + 7000, withDeadline: async <T>(promise: Promise<T>) => promise };
const admission: VerifiedNarrationDispatchAdmission = { pricingRevision: "verified-test-revision", billingContract: {
  provider: "xai", model: "grok-test", quote: async (request) => ({ provider: request.provider, model: request.model,
    requestDigest: requestDigest(request), fullMessageTokens: 100, outputTokenLimit: request.options.maxCompletionTokens,
    maximumChargeUsd: 0.001, verifiedFullPrompt: true, includesAllGeneratedTokens: true }),
} };
async function fixture(id: string, count = 3, cognition = false, targets?: readonly ("reader" | "a" | "b")[], observed = false, policy?: AwarenessPolicyV1) {
  const { state } = validAwarenessBattleFixture(id);
  if (state.narratorContinuity) {
    state.narratorContinuity.a.lastInteriorBeat = "PRIVATE_A_NEVER_EXTERNAL";
    state.narratorContinuity.b.lastInteriorBeat = "PRIVATE_B_NEVER_EXTERNAL";
  }
  const materials = Array.from({ length: count }, (_, index) => AwarenessFrozenNarrationSchema.parse({
    kind: "awareness-v5", phase: "combat", battleId: id, turnReceiptId: `${id}:phase:${index + 1}`, turn: index + 1,
    system: "確定出来事を実況する", user: "両者が身構えた", urgent: false, sourceSpeeches: [],
    recognitionRefs: cognition ? ["environment.cue"] : [], judgmentVerdict: null,
    ...(cognition ? { initialNarratorContinuity: state.narratorContinuity, recognitionTarget: targets?.[index] ?? "reader" } : {}),
  }));
  if (observed && state.assetManifest?.schemaVersion === 5) state.assetManifest.awarenessPolicy = AwarenessObservedPolicy;
  if (policy && state.assetManifest?.schemaVersion === 5) state.assetManifest.awarenessPolicy = policy;
  const complete = BattleStateSchema.parse({ ...state, battleRevision: count, phaseReceiptSequence: count,
    phaseReceipts: materials.map((material, index) => ({ schemaVersion: 1, id: material.turnReceiptId, sequence: index + 1,
      operationId: `op-${index}`, phase: "combat", combatTurn: index + 1, fromRevision: index, toRevision: index + 1,
      committedAt: new Date(base).toISOString(), narrationInput: material, narrationInputDigest: requestDigest(material) })) });
  await insertNewBattle(complete, { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b" });
  const fence = await acquireBattleLeaseFence(id, "fixture", new Date(base));
  assert.ok(fence);
  await initializeAwarenessRuntime({ battleId: id, fence, now: new Date(base).toISOString(),
    runtime: AwarenessInitialize({ startedAt: base, promptRevision: "awareness-prompt-v1", outputRevision: "awareness-output-v1",
      policy: policy ?? (observed ? AwarenessObservedPolicy : AwarenessDefaultPolicy) }) });
  await releaseBattleLease(id, "fixture");
  for (const material of materials) await enqueueNarration({ battleId: id, receiptId: material.turnReceiptId,
    sequence: material.turn, phase: "combat", combatTurn: material.turn, frozenInput: material,
    inputDigest: requestDigest(material), now: new Date(base).toISOString() });
  return (await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]!.state_json;
}
function provider(counter: { calls: number }): AwarenessNarrationProvider {
  return { identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" },
    narrateBatch: async () => [], narrateFrozenBatch: async (materials) => {
      counter.calls++;
      return materials.map((material) => ({ phase: "combat", battleId: material.battleId, turnReceiptId: material.turnReceiptId,
        narration: { turn: material.turn, narrator: ["両者が身構えた。", "間合いが動いた。"], speeches: [] } }));
    } };
}
it("uses a bound 60-second narration request and publishes beyond the old 36-second window", async () => {
  const id = "awareness-long-measurement";
  const original = await fixture(id, 3, false, undefined, true, AwarenessLongMeasurementPolicy);
  let now = base + 40000;
  let calls = 0;
  const longProvider: AwarenessNarrationProvider = { identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" },
    narrateBatch: async () => [], narrateFrozenBatch: async (materials: Parameters<AwarenessNarrationProvider["narrateFrozenBatch"]>[0],
      timeoutMs?: number, _context?: Parameters<AwarenessNarrationProvider["narrateFrozenBatch"]>[2], policy?: AwarenessPolicyV1) => {
      calls++;
      assert.equal(timeoutMs, 60000);
      assert.equal(policy?.revision, "awareness-v5-measurement-v1");
      now = base + 80000;
      return materials.map((material) => ({ phase: "combat", battleId: material.battleId, turnReceiptId: material.turnReceiptId,
        narration: { turn: material.turn, narrator: ["両者が身構えた。", "間合いが動いた。"], speeches: [] } }));
    } };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: longProvider, clock: { now: () => now, withDeadline: async <T>(pending: Promise<T>) => pending } } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(now), generator }), "completed");
  assert.equal(calls, 1);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 3);
  assert.equal((await query<{state_json:string}>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]?.state_json, original);
});
it("missing verified proof sends zero calls and never fabricates a presentation or changes world", async () => {
  const id = "awareness-missing-proof"; const original = await fixture(id); const counter = { calls: 0 };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: provider(counter), clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(clock.now()), generator }), "failed");
  assert.equal(counter.calls, 0);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 0);
  assert.equal((await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]!.state_json, original);
});
it("requeues budget-lease-busy narration with a fresh delivery generation and no provider call", async () => {
  const id = "awareness-budget-lease-busy-generation";
  await fixture(id);
  const blocker = await acquireBattleLeaseFence(id, "advance-owner", new Date(clock.now()));
  assert.ok(blocker);
  const counter = { calls: 0 };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: provider(counter), admission, clock } });
  try {
    assert.equal(await processNextNarration({ battleId: id, ownerId: "narration-worker", now: new Date(clock.now()), generator }), "deferred");
  } finally {
    await releaseBattleLease(id, "advance-owner");
  }
  assert.equal(counter.calls, 0);
  const rows = await query<{ status: string; delivery_generation: number }>(
    "SELECT status, delivery_generation FROM battle_narration_outbox WHERE battle_id=$1 ORDER BY receipt_id",
    [id],
  );
  assert.equal(rows.rows.length, 3);
  assert.equal(rows.rows.every((row) => row.status === "pending" && Number(row.delivery_generation) === 1), true);
});
it("requeues a dispatched input outbox when budget-busy claim selects another receipt", async () => {
  const id = "awareness-budget-lease-busy-unselected-input";
  await fixture(id, 3, true, ["reader", "a", "b"]);
  const input = (await query<{ outbox_id: string; delivery_generation: number }>(
    "SELECT outbox_id, delivery_generation FROM battle_narration_outbox WHERE battle_id=$1 AND receipt_id=$2",
    [id, `${id}:phase:2`],
  )).rows[0]!;
  await query("UPDATE battle_narration_outbox SET status='dispatched',dispatched_at=$2 WHERE outbox_id=$1", [input.outbox_id, new Date(base).toISOString()]);
  const blocker = await acquireBattleLeaseFence(id, "advance-owner", new Date(clock.now()));
  assert.ok(blocker);
  const counter = { calls: 0 };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: provider(counter), admission, clock } });
  try {
    assert.equal(await processNextNarration({ battleId: id, ownerId: "narration-worker", receiptId: `${id}:phase:2`, outboxId: input.outbox_id,
      deliveryGeneration: Number(input.delivery_generation), now: new Date(clock.now()), generator }), "deferred");
  } finally {
    await releaseBattleLease(id, "advance-owner");
  }
  assert.equal(counter.calls, 0);
  const rows = await query<{ receipt_id: string; status: string; delivery_generation: number }>(
    "SELECT receipt_id, status, delivery_generation FROM battle_narration_outbox WHERE battle_id=$1 ORDER BY receipt_id", [id]);
  assert.deepEqual(rows.rows.map((row) => [row.status, Number(row.delivery_generation)]), [["pending", 1], ["pending", 1], ["pending", 0]]);
});
it("requeues a preclaim flush wait and accepts only the fresh delivery generation", async () => {
  const id = "awareness-preclaim-flush-generation";
  await fixture(id, 1);
  const input = (await query<{ outbox_id: string; delivery_generation: number }>(
    "SELECT outbox_id, delivery_generation FROM battle_narration_outbox WHERE battle_id=$1", [id])).rows[0]!;
  await query("UPDATE battle_narration_outbox SET status='dispatched',dispatched_at=$2 WHERE outbox_id=$1", [input.outbox_id, new Date(base).toISOString()]);
  let calls = 0;
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: { ...provider({ calls: 0 }), narrateFrozenBatch: async (materials) => {
      calls++;
      return materials.map((material) => ({ phase: "combat" as const, battleId: material.battleId, turnReceiptId: material.turnReceiptId,
        narration: { turn: material.turn, narrator: ["待機が解けた。"], speeches: [] } }));
    } }, admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", receiptId: `${id}:phase:1`, outboxId: input.outbox_id,
    deliveryGeneration: Number(input.delivery_generation), now: new Date(base + 1000), generator }), "deferred");
  const bumped = (await query<{ status: string; delivery_generation: number }>("SELECT status,delivery_generation FROM battle_narration_outbox WHERE outbox_id=$1", [input.outbox_id])).rows[0]!;
  assert.deepEqual([bumped.status, Number(bumped.delivery_generation)], ["pending", 1]);
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", receiptId: `${id}:phase:1`, outboxId: input.outbox_id,
    deliveryGeneration: 0, now: new Date(base + 7000), generator }), "acknowledged");
  assert.equal(calls, 0);
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", receiptId: `${id}:phase:1`, outboxId: input.outbox_id,
    deliveryGeneration: 1, now: new Date(base + 7000), generator }), "completed");
  assert.equal(calls, 1);
});
it("requeues an outstanding batch input without a second provider call", async () => {
  const id = "awareness-outstanding-generation";
  await fixture(id, 1);
  const attemptId = `${id}:attempt`;
  const input = (await query<{ outbox_id: string; delivery_generation: number }>(
    "SELECT outbox_id, delivery_generation FROM battle_narration_outbox WHERE battle_id=$1", [id])).rows[0]!;
  await query("UPDATE battle_narration_outbox SET status='dispatched',dispatched_at=$2 WHERE outbox_id=$1", [input.outbox_id, new Date(base).toISOString()]);
  await query("INSERT INTO battle_narration_attempts (attempt_id,battle_id,receipt_id,fencing_token,status,provider,route,started_at) VALUES ($1,$2,$3,1,'generating','xai','fast',$4)",
    [attemptId, id, `${id}:phase:1`, new Date(base).toISOString()]);
  await query("INSERT INTO battle_awareness_narration_batches (attempt_id,battle_id,fencing_token,receipt_ids_json,deadline_at,status,created_at,updated_at) VALUES ($1,$2,1,$3,$4,'claimed',$5,$5)",
    [attemptId, id, JSON.stringify([`${id}:phase:1`]), new Date(base + 30000).toISOString(), new Date(base).toISOString()]);
  await query("UPDATE battle_narration_entries SET status='generating',active_attempt_id=$2 WHERE battle_id=$1", [id, attemptId]);
  let calls = 0;
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: { ...provider({ calls: 0 }), narrateFrozenBatch: async () => { calls++; return []; } }, admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", receiptId: `${id}:phase:1`, outboxId: input.outbox_id,
    deliveryGeneration: Number(input.delivery_generation), now: new Date(base + 7000), generator }), "deferred");
  const bumped = (await query<{ status: string; delivery_generation: number }>("SELECT status,delivery_generation FROM battle_narration_outbox WHERE outbox_id=$1", [input.outbox_id])).rows[0]!;
  assert.deepEqual([bumped.status, Number(bumped.delivery_generation)], ["pending", 1]);
  assert.equal(calls, 0);
});
it("requeues an unselected input after successful publication without touching its successor", async () => {
  const id = "awareness-success-unselected-generation";
  await fixture(id, 3, true, ["reader", "a", "b"]);
  const input = (await query<{ outbox_id: string; delivery_generation: number }>(
    "SELECT outbox_id, delivery_generation FROM battle_narration_outbox WHERE battle_id=$1 AND receipt_id=$2",
    [id, `${id}:phase:2`])).rows[0]!;
  await query("UPDATE battle_narration_outbox SET status='dispatched',dispatched_at=$2 WHERE outbox_id=$1", [input.outbox_id, new Date(base).toISOString()]);
  let calls = 0;
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: { ...provider({ calls: 0 }), narrateFrozenBatch: async (materials) => {
      calls++;
      return materials.map((material) => ({ phase: "combat" as const, battleId: material.battleId, turnReceiptId: material.turnReceiptId,
        narration: { turn: material.turn, narrator: ["公開された。"], speeches: [] } }));
    } }, admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", receiptId: `${id}:phase:2`, outboxId: input.outbox_id,
    deliveryGeneration: Number(input.delivery_generation), now: new Date(base + 7000), generator }), "completed");
  const rows = await query<{ receipt_id: string; status: string; delivery_generation: number }>(
    "SELECT receipt_id,status,delivery_generation FROM battle_narration_outbox WHERE battle_id=$1 ORDER BY receipt_id", [id]);
  assert.deepEqual(rows.rows.map((row) => [row.status, Number(row.delivery_generation)]), [["completed", 0], ["pending", 1], ["pending", 0]]);
  assert.equal(calls, 1);
});
it("publishes three frozen receipts atomically with one call and one retained fee reservation", async () => {
  const id = "awareness-batch-three"; const original = await fixture(id); const counter = { calls: 0 };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: provider(counter), admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(clock.now()), generator }), "completed");
  assert.equal(counter.calls, 1);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 3);
  assert.equal((await query("SELECT 1 FROM battle_narration_attempts WHERE battle_id=$1", [id])).rowCount, 1);
  assert.equal((await query("SELECT 1 FROM battle_awareness_narration_batches WHERE battle_id=$1", [id])).rowCount, 1);
  const runtime = await getAwarenessRuntime(id); assert.ok(runtime);
  assert.equal(runtime.runtime.budget.reservations.length, 1);
  assert.equal(runtime.runtime.budget.reservations[0]!.status, "unknown");
  assert.equal(runtime.runtime.budget.reservations[0]!.physicalOutstanding, false);
  assert.equal(runtime.runtime.budget.reservedUsd, 0.001);
  assert.equal((await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]!.state_json, original);
});
it("tampered frozen input is rejected before dispatch", async () => {
  const id = "awareness-tamper"; await fixture(id); const counter = { calls: 0 };
  await query("UPDATE battle_narration_entries SET input_json=$2 WHERE battle_id=$1", [id, JSON.stringify({ kind: "awareness-v5" })]);
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: provider(counter), admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(clock.now()), generator }), "failed");
  assert.equal(counter.calls, 0);
});
it("rejects partial batch coverage without publishing any receipt", async () => {
  const id = "awareness-partial"; await fixture(id); const counter = { calls: 0 };
  const ordinary = provider(counter);
  const partial: AwarenessNarrationProvider = { ...ordinary,
    narrateFrozenBatch: async (materials, timeoutMs) => (await ordinary.narrateFrozenBatch(materials, timeoutMs)).slice(0, 1) };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: partial, admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(clock.now()), generator }), "failed");
  assert.equal(counter.calls, 1);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 0);
  assert.equal((await query("SELECT 1 FROM battle_narration_entries WHERE battle_id=$1 AND status='failed'", [id])).rowCount, 3);
});
it("expired publication window sends zero calls", async () => {
  const id = "awareness-expired"; await fixture(id); const counter = { calls: 0 };
  const expired = { ...clock, now: () => base + 36000 };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: provider(counter), admission, clock: expired } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(expired.now()), generator }), "failed");
  assert.equal(counter.calls, 0);
});
it("initial prologue uses its frozen typed phase and publishes through the V5 worker", async () => {
  const id = "awareness-prologue";
  const { freezeAwarenessNarration } = await import("../llm/awareness-narration-phase.js");
  const material = freezeAwarenessNarration({ phase: "prologue", input: {
    scene: "広場", sideAName: "a", sideBName: "b", profileAnchors: {},
  } }, { battleId: id, turnReceiptId: `${id}:phase:1` });
  const { state } = validAwarenessBattleFixture(id);
  const complete = BattleStateSchema.parse({ ...state, battleRevision: 1, phaseReceiptSequence: 1, phaseReceipts: [{
    schemaVersion: 1, id: material.turnReceiptId, sequence: 1, operationId: "prologue-op", phase: "prologue",
    combatTurn: null, fromRevision: 0, toRevision: 1, committedAt: new Date(base).toISOString(),
    narrationInput: material, narrationInputDigest: requestDigest(material),
  }] });
  await insertNewBattle(complete, { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b" });
  const fence = await acquireBattleLeaseFence(id, "fixture", new Date(base)); assert.ok(fence);
  await initializeAwarenessRuntime({ battleId: id, fence, now: new Date(base).toISOString(),
    runtime: AwarenessInitialize({ startedAt: base, promptRevision: "awareness-prompt-v1", outputRevision: "awareness-output-v1" }) });
  await releaseBattleLease(id, "fixture");
  await enqueueNarration({ battleId: id, receiptId: material.turnReceiptId, sequence: 1, phase: "prologue", combatTurn: null,
    frozenInput: material, inputDigest: requestDigest(material), now: new Date(base).toISOString() });
  let calls = 0;
  const narrator: AwarenessNarrationProvider = { identity: provider({ calls: 0 }).identity, narrateBatch: async () => [],
    narrateFrozenBatch: async (materials) => { calls++; return materials.map((item) => ({ phase: "prologue",
      battleId: item.battleId, turnReceiptId: item.turnReceiptId, narration: { turn: item.turn,
        narrator: ["広場に立つ。", "aが構える。", "bが構える。", "戦いが始まる。"], speeches: [] } })); } };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: narrator, admission, clock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(clock.now()), generator }), "completed");
  assert.equal(calls, 1);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1 AND phase='prologue'", [id])).rowCount, 1);
});
it("logical timeout retains physical occupancy and late completion only closes accounting", async () => {
  const id = "awareness-late"; await fixture(id);
  const ordinary = provider({ calls: 0 });
  let resolveRequest: ((value: Awaited<ReturnType<AwarenessNarrationProvider["narrateFrozenBatch"]>>) => void) | undefined;
  const delayed: AwarenessNarrationProvider = { ...ordinary, narrateFrozenBatch: (materials) => new Promise((resolve) => {
    resolveRequest = resolve;
    void ordinary.narrateFrozenBatch(materials).then((value) => { delayedResult = value; });
  }) };
  let delayedResult: Awaited<ReturnType<AwarenessNarrationProvider["narrateFrozenBatch"]>> = [];
  let now = base + 7000;
  const timeoutClock = { now: () => now, withDeadline: async <T>(_promise: Promise<T>, deadline: number): Promise<T> => {
    now = deadline; throw new Error("logical timeout");
  } };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: delayed, admission, clock: timeoutClock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(now), generator }), "failed");
  assert.equal((await getAwarenessRuntime(id))!.runtime.budget.physicalOutstanding, 1);
  assert.ok(resolveRequest); resolveRequest(delayedResult);
  for (let step = 0; step < 20; step++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if ((await getAwarenessRuntime(id))!.runtime.budget.physicalOutstanding === 0) break;
  }
  const budget = (await getAwarenessRuntime(id))!.runtime.budget;
  assert.equal(budget.physicalOutstanding, 0);
  assert.equal(budget.reservedUsd, 0.001);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 0);
});
it("closes a completed physical response rejected during validation while retaining unknown transport failures", async () => {
  for (const completed of [true, false]) {
    const id = `awareness-rejected-response-${completed}`;
    const original = await fixture(id);
    let calls = 0;
    const rejected: AwarenessNarrationProvider = { ...provider({ calls: 0 }), narrateFrozenBatch: async () => {
      calls++;
      await observeLlmPhysicalAttempt({ callId: `${id}:physical`, attemptOrdinal: 1, provider: "xai", requestedModel: "grok-test", role: "narration" },
        async () => { if (!completed) throw new Error("unknown transport failure"); return { usage: null }; }, (receipt) => receipt);
      throw new Error("postresponse narration shape rejected");
    } };
    const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
      { awareness: { provider: rejected, admission, clock } });
    assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(clock.now()), generator }), "failed");
    const budget = (await getAwarenessRuntime(id))!.runtime.budget;
    assert.equal(calls, 1);
    assert.equal(budget.physicalOutstanding, completed ? 0 : 1);
    assert.equal(budget.reservations[0]?.actualUsd, null);
    assert.equal(budget.reservedUsd, 0.001);
    assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 0);
    assert.equal((await query<{state_json:string}>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]?.state_json, original);
  }
});
it("closes late observed response rejection after logical timeout without publishing its rejected result", async () => {
  const id = "awareness-late-rejected-response";
  const original = await fixture(id);
  let release: (() => void) | undefined;
  const response = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const rejected: AwarenessNarrationProvider = { ...provider({ calls: 0 }), narrateFrozenBatch: async () => {
    calls++;
    await observeLlmPhysicalAttempt({ callId: `${id}:physical`, attemptOrdinal: 1, provider: "xai", requestedModel: "grok-test", role: "narration" },
      async () => { await response; return { usage: null }; }, (receipt) => receipt);
    throw new Error("late postresponse narration shape rejected");
  } };
  let now = base + 7000;
  const timeoutClock = { now: () => now, withDeadline: async <T>(_pending: Promise<T>, deadline: number): Promise<T> => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    now = deadline;
    throw new Error("logical timeout");
  } };
  const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); },
    { awareness: { provider: rejected, admission, clock: timeoutClock } });
  assert.equal(await processNextNarration({ battleId: id, ownerId: "worker", now: new Date(now), generator }), "failed");
  assert.equal((await getAwarenessRuntime(id))?.runtime.budget.physicalOutstanding, 1);
  assert.ok(release); release();
  for (let step = 0; step < 20; step++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if ((await getAwarenessRuntime(id))?.runtime.budget.physicalOutstanding === 0) break;
  }
  const budget = (await getAwarenessRuntime(id))!.runtime.budget;
  assert.equal(calls, 1);
  assert.equal(budget.physicalOutstanding, 0);
  assert.equal(budget.reservations[0]?.actualUsd, null);
  assert.equal(budget.reservedUsd, 0.001);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1", [id])).rowCount, 0);
  assert.equal((await query<{state_json:string}>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]?.state_json, original);
});
it("persists recognition only with publication and quotes the next batch's actual public predecessor history", async () => {
  const id = "awareness-reader-history"; const original = await fixture(id, 6, true);
  const quoted: string[] = [];
  const billing: VerifiedNarrationDispatchAdmission = { ...admission, billingContract: { ...admission.billingContract,
    quote: async (request) => {
      quoted.push(request.user);
      assert.equal(request.user.includes("PRIVATE_A_NEVER_EXTERNAL"), false);
      assert.equal(request.user.includes("PRIVATE_B_NEVER_EXTERNAL"), false);
      return admission.billingContract.quote(request);
    } } };
  let calls = 0;
  const narrator: AwarenessNarrationProvider = { identity: provider({ calls: 0 }).identity, narrateBatch: async () => [],
    narrateFrozenBatch: async (materials, timeoutMs, context) => {
      calls++;
      assert.ok(context);
      assert.equal(context.continuity?.perspectives.length, 0);
      const { prepareAwarenessFrozenNarrationRequest } = await import("../llm/awareness-frozen-narration.js");
      assert.equal(prepareAwarenessFrozenNarrationRequest(materials, timeoutMs, context).user, quoted.at(-1));
      if (calls === 2) {
        assert.deepEqual(context.published.map((item) => item.sequence), [1, 2, 3]);
        assert.equal(context.continuity?.reader.recognitions.some((item) => item.subjectRef === "environment.cue" && item.recognizedAs === "柱影"), true);
        assert.equal(context.published[0]?.narrative.narrator[0], "public-history-1");
      }
      return materials.map((material) => ({ phase: "combat", battleId: material.battleId, turnReceiptId: material.turnReceiptId,
        narration: { turn: material.turn, narrator: [`public-history-${material.turn}`, "間合いが動いた。"], speeches: [],
          recognitionUpdates: [{ subjectRef: "environment.cue", recognizedAs: "柱影", identityKnowledge: "unknown", continuity: "same_entity" }] } }));
    } };
  const generator = Object.assign(async () => { throw new Error("legacy must not run"); },
    { awareness: { provider: narrator, admission: billing, clock } });
  for (const owner of ["first", "second"]) assert.equal(await processNextNarration({ battleId: id, ownerId: owner,
    now: new Date(clock.now()), generator }), "completed");
  assert.equal(calls, 2);
  assert.equal(quoted[1]?.includes("public-history-1"), true);
  const rows = await query<{ context_json: string; context_digest: string }>("SELECT context_json,context_digest FROM battle_awareness_narration_batches WHERE battle_id=$1", [id]);
  for (const row of rows.rows) assert.equal(requestDigest(JSON.parse(row.context_json)), row.context_digest);
  const state = await query<{ last_published_sequence: number }>("SELECT last_published_sequence FROM battle_awareness_narrator_state WHERE battle_id=$1", [id]);
  assert.equal(state.rows[0]?.last_published_sequence, 6);
  assert.equal((await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [id])).rows[0]!.state_json, original);
});
it("history-inclusive token admission rejects a second call without advancing narrator cognition", async () => {
  const id = "awareness-history-cap"; await fixture(id, 6, true); const counter = { calls: 0 }; let quotes = 0;
  const billing: VerifiedNarrationDispatchAdmission = { ...admission, billingContract: { ...admission.billingContract,
    quote: async (request) => {
      const quote = await admission.billingContract.quote(request); assert.ok(quote);
      quotes++;
      return { ...quote, fullMessageTokens: quotes === 1 ? 100 : 100000 };
    } } };
  const generator = Object.assign(async () => { throw new Error("legacy must not run"); },
    { awareness: { provider: provider(counter), admission: billing, clock } });
  assert.equal(await processNextNarration({ battleId:id,ownerId:"first",now:new Date(clock.now()),generator }),"completed");
  assert.equal(await processNextNarration({ battleId:id,ownerId:"second",now:new Date(clock.now()),generator }),"failed");
  assert.equal(counter.calls,1);
  assert.equal((await query<{ last_published_sequence:number }>("SELECT last_published_sequence FROM battle_awareness_narrator_state WHERE battle_id=$1",[id])).rows[0]?.last_published_sequence,3);
  assert.equal((await getAwarenessRuntime(id))!.runtime.budget.reservations.length,1);
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id=$1",[id])).rowCount,3);
});

it("splits mixed recognition targets so one subjective context never enters the other side's receipt", async () => {
  const id = "awareness-target-split"; await fixture(id, 3, true, ["a", "b", "b"]);
  const batches: number[] = [];
  const narrator: AwarenessNarrationProvider = { identity: provider({ calls: 0 }).identity,narrateBatch:async()=>[],
    narrateFrozenBatch:async(materials,timeoutMs,context)=>{
      assert.ok(context); batches.push(materials.length);
      assert.equal(materials.every((material)=>material.recognitionTarget===context.target),true);
      const { prepareAwarenessFrozenNarrationRequest } = await import("../llm/awareness-frozen-narration.js");
      const text = prepareAwarenessFrozenNarrationRequest(materials,timeoutMs,context).user;
      assert.equal(text.includes(context.target === "a" ? "PRIVATE_B_NEVER_EXTERNAL" : "PRIVATE_A_NEVER_EXTERNAL"),false);
      return materials.map((material)=>({phase:"combat",battleId:material.battleId,turnReceiptId:material.turnReceiptId,
        narration:{turn:material.turn,narrator:["構えた。","間合いを測った。"],speeches:[]}}));
    }};
  const generator=Object.assign(async()=>{throw new Error("legacy must not run");},{awareness:{provider:narrator,admission,clock}});
  for(const owner of ["first","second"]) assert.equal(await processNextNarration({battleId:id,ownerId:owner,now:new Date(clock.now()),generator}),"completed");
  assert.deepEqual(batches,[1,2]);
});

it("immutable observed policy dispatches without a price quote while retaining unknown cost", async () => {
  const id="awareness-observed-unpriced";await fixture(id,3,false,undefined,true);const counter={calls:0};
  const generator=Object.assign(async()=>{throw new Error("legacy must not run");},{awareness:{provider:provider(counter),clock}});
  assert.equal(await processNextNarration({battleId:id,ownerId:"observed",now:new Date(clock.now()),generator}),"completed");
  assert.equal(counter.calls,1);
  const reservation=(await getAwarenessRuntime(id))!.runtime.budget.reservations[0];assert.ok(reservation);
  assert.equal(reservation.maximumUsd,null);assert.equal(reservation.actualUsd,null);assert.equal(reservation.physicalOutstanding,false);
  const batch=(await query<{pricing_revision:string;maximum_usd:number|null}>("SELECT pricing_revision,maximum_usd FROM battle_awareness_narration_batches WHERE battle_id=$1",[id])).rows[0];
  assert.equal(batch?.pricing_revision,"unpriced");assert.equal(batch?.maximum_usd,null);
});
