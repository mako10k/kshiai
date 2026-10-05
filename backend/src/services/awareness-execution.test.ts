// R: Verify delayed subjective orchestration and failure boundaries without external models.
import { LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AwarenessInitialize, AwarenessObservedPolicy, defaultCharacterIdentity,
  type AwarenessConsciousInput, type AwarenessConsciousOutput, type AwarenessLatentInput,
} from "@kshiai/shared";
import { createAwarenessExecution, type AwarenessExecutionContext, type AwarenessExecutionModels,
  type AwarenessModelReceipt, type AwarenessDispatchProof, type AwarenessPrepareTickInput } from "./awareness-execution.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-awareness-execution-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { getDb } = await import("../db.js");
const repo = await import("../repositories/battle-awareness.js");
const { awarenessExecutionStorage } = await import("./awareness-execution-storage.js");
const { battleAwarenessSchemaSql } = await import("../repositories/battle-awareness-schema.js");
getDb().exec(battleAwarenessSchemaSql);
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const baseTime = Date.parse("2026-10-05T06:00:00.000Z");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function context(side: "a" | "b"): AwarenessExecutionContext {
  return {
    character: { schemaVersion: 1, displayName: side.toUpperCase(), identity: defaultCharacterIdentity(),
      tags: [], appearanceSummary: "", traits: [], narrativeBlurb: "", basicAction: { name: "防御", description: "構える" },
      skills: [], equipment: { weapon: null, armor: null } },
    characteristics: [], training: [], consciousCharacteristics: [], consciousTraining: [], availableActions: [], facts: [], stimuli: [],
    receivedSpeech: false, intentCompleted: false, intentInvalid: false,
    perception: { schemaVersion: 1, observer: { side, self: "self" }, turn: 0, revision: 0,
      self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
      counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "見えない", percepts: [] },
      others: [], qualitativeChanges: [], reserveCues: [], latestDiff: { fromRevision: 0, toRevision: 0, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] } },
  };
}

function thought(): AwarenessConsciousOutput {
  return { goal: "距離を取る", thought: "一息置く", desires: [], influences: [{ id: "calm", content: "息を整えたい" }] };
}

async function fixture(id: string, options: { failLatent?: boolean; noProof?: boolean; readyDuringLatent?: boolean; observed?: boolean } = {}) {
  let time = baseTime;
  const thoughts = { a: deferred<AwarenessModelReceipt<AwarenessConsciousOutput>>(), b: deferred<AwarenessModelReceipt<AwarenessConsciousOutput>>() };
  const thoughtInputs: AwarenessConsciousInput[] = [];
  const latentInputs: AwarenessLatentInput[] = [];
  const order: string[] = [];
  getDb().prepare(`INSERT INTO battles (id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at)
    VALUES (?, '{}', 'u', 'a','b',?,?)`).run(id, new Date(time).toISOString(), new Date(time).toISOString());
  getDb().prepare(`INSERT INTO battle_leases (battle_id,owner_id,fencing_token,acquired_at,expires_at)
    VALUES (?, 'test-owner', 1, ?, ?)`).run(id, new Date(time).toISOString(), new Date(time + 180000).toISOString());
  const fence = { battleId: id, ownerId: "test-owner", fencingToken: 1 };
  await repo.initializeAwarenessRuntime({ battleId: id, fence, now: new Date(time).toISOString(),
    runtime: AwarenessInitialize({ startedAt: time, promptRevision: "test-v1", outputRevision: "test-v1", ...(options.observed ? {policy:AwarenessObservedPolicy} : {}) }) });
  const models: AwarenessExecutionModels = {
    conscious(input) { order.push(`thought:${input.side}`); thoughtInputs.push(structuredClone(input)); return thoughts[input.side].promise; },
    async subconscious(input) {
      order.push(`latent:${input.side}`); latentInputs.push(structuredClone(input));
      if (options.readyDuringLatent) {
        thoughts[input.side].resolve({ output: thought(), actualUsd: 0.002, physicalClosed: true });
        await drainCompletion();
      }
      if (options.failLatent && input.side === "b") throw new Error("REQUIRED_LATENT_FAILURE");
      return { output: { state: { ...input.currentState, updatedTick: input.tick }, reflexDesires: [], affectiveDesires: [], reconsider: false, cancelThought: false }, actualUsd: 0.001, physicalClosed: true };
    },
  };
  const proof = (role: "conscious" | "subconscious"): AwarenessDispatchProof => options.observed ? ({mode:"observed",verifiedFullPrompt:false,inputTokens:null,maximumChargeUsd:null,requestDigest:`full-prompt:${role}`,outputTokenLimit:role==="conscious"?1500:600}) : ({
    requestDigest: `full-prompt:${role}`, verifiedFullPrompt: true, inputTokens: 100,
    outputTokenLimit: role === "conscious" ? 1500 : 600, maximumChargeUsd: 0.01,
  });
  const ports = { storage: awarenessExecutionStorage, models,
    admission: { async verify(request: { role: "conscious" | "subconscious" }) { return options.noProof ? null : proof(request.role); } },
    clock: { now: () => time, withDeadline: async <T>(promise: Promise<T>, _deadlineAt: number) => promise },
  };
  const execution = createAwarenessExecution(ports);
  const input = (tick: number): AwarenessPrepareTickInput => ({ battleId: id, phase: "turn", tick, now: time,
    battleLeaseFence: fence, sides: { a: context("a"), b: context("b") } });
  return { execution, ports, input, thoughtInputs, latentInputs, order, thoughts, setTime(value: number) { time = value; } };
}

async function drainCompletion() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("awareness execution", () => {
  it("launches frozen A jobs before latent work, advances three ticks, and merges only at a later boundary", async () => {
    const run = await fixture("execution-delay");
    const atA = await run.execution.prepareTick(run.input(0));
    assert.equal(atA.canCommitWorld, true);
    assert.deepEqual(run.order.slice(0, 2), ["thought:a", "thought:b"]);
    assert.deepEqual(run.thoughtInputs.map((input) => input.sourceTick), [0, 0]);
    for (const tick of [1, 2]) {
      run.setTime(baseTime + tick * 1000);
      assert.equal((await run.execution.prepareTick(run.input(tick))).canCommitWorld, true);
    }
    run.setTime(baseTime + 2500);
    run.thoughts.a.resolve({ output: thought(), actualUsd: 0.002, physicalClosed: true });
    run.thoughts.b.resolve({ output: thought(), actualUsd: 0.002, physicalClosed: true });
    await drainCompletion();
    assert.equal((await repo.getAwarenessRuntime("execution-delay"))?.runtime.sides.a.conscious.updatedTick, null);
    run.setTime(baseTime + 3000);
    const merged = await run.execution.prepareTick(run.input(3));
    assert.equal(merged.snapshot.runtime.sides.a.conscious.updatedTick, 3);
    assert.equal(merged.snapshot.runtime.sides.a.job?.input.sourceTick, 0);
    assert.equal(merged.snapshot.runtime.sides.a.mailbox[0]?.availableTick, 4);
    run.setTime(baseTime + 4000);
    const consumed = await run.execution.prepareTick(run.input(4));
    assert.equal(consumed.snapshot.runtime.sides.a.mailbox[0]?.appliedTick, 4);
    assert.equal(run.latentInputs.filter((input) => input.side === "a" && input.influences.length > 0).length, 1);
    run.setTime(baseTime + 5000);
    await run.execution.prepareTick(run.input(5));
    assert.equal(run.latentInputs.filter((input) => input.side === "a" && input.influences.length > 0).length, 1);
  });

  it("restarts without resending outstanding jobs and reuses an already accepted latent tick", async () => {
    const run = await fixture("execution-restart");
    await run.execution.prepareTick(run.input(0));
    const calls = { thoughts: run.thoughtInputs.length, latent: run.latentInputs.length };
    const restarted = createAwarenessExecution(run.ports);
    await restarted.prepareTick(run.input(0));
    run.setTime(baseTime + 1000);
    await restarted.prepareTick(run.input(1));
    assert.equal(run.thoughtInputs.length, calls.thoughts);
    assert.equal(run.latentInputs.length, calls.latent);
  });

  it("stops an incomplete tick after required failure without fabricating world results", async () => {
    const run = await fixture("execution-failure", { failLatent: true });
    const result = await run.execution.prepareTick(run.input(0));
    assert.equal(result.canCommitWorld, false);
    assert.equal(result.snapshot.runtime.status, "incomplete");
    assert.equal(result.snapshot.runtime.incompleteReason, "REQUIRED_LATENT_FAILURE");
    assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get("execution-failure"), { revision: 0 });
    assert.equal(result.snapshot.runtime.budget.unknownAttemptIds.length, 1);
  });

  it("requires verified full-input token and charge proof before any physical dispatch", async () => {
    const run = await fixture("execution-admission", { noProof: true });
    const result = await run.execution.prepareTick(run.input(0));
    assert.equal(result.canCommitWorld, false);
    assert.equal(result.snapshot.runtime.incompleteReason, "AWARENESS_VERIFIED_ADMISSION_REQUIRED");
    assert.equal(run.thoughtInputs.length, 0);
    assert.equal(run.latentInputs.length, 0);
    assert.equal(result.snapshot.runtime.budget.physicalAttempts, 0);
  });

  it("does not leak the counterpart's private felt projection into a frozen input", async () => {
    const run = await fixture("execution-privacy");
    const current = await repo.getAwarenessRuntime("execution-privacy");
    assert.ok(current);
    await repo.mutateAwarenessRuntime({ battleId: "execution-privacy", expectedRevision: current.revision,
      fence: run.input(0).battleLeaseFence, now: new Date(baseTime).toISOString() }, (state) => ({ ...state,
      sides: { ...state.sides, b: { ...state.sides.b, latent: { ...state.sides.b.latent, feltProjection: "Bの秘密の不安" } } } }));
    await run.execution.prepareTick(run.input(0));
    const a = run.thoughtInputs.find((input) => input.side === "a");
    assert.ok(a);
    assert.equal(JSON.stringify(a).includes("Bの秘密"), false);
    assert.equal(a.feltProjection, "");
  });

  it("keeps unaware tendencies and training on the latent side of the model boundary", async () => {
    const run = await fixture("execution-self-awareness");
    const input = run.input(0);
    input.sides.a.characteristics = ["無自覚の秘密の癖"];
    input.sides.a.training = ["無自覚の反射訓練"];
    input.sides.a.consciousCharacteristics = ["本人が知る姿勢"];
    input.sides.a.consciousTraining = [];
    await run.execution.prepareTick(input);
    const conscious = run.thoughtInputs.find((frame) => frame.side === "a");
    const latent = run.latentInputs.find((frame) => frame.side === "a");
    assert.ok(conscious); assert.ok(latent);
    assert.deepEqual(conscious.characteristics, ["本人が知る姿勢"]);
    assert.equal(JSON.stringify(conscious).includes("無自覚"), false);
    assert.deepEqual(latent.characteristics, ["無自覚の秘密の癖"]);
    assert.deepEqual(latent.training, ["無自覚の反射訓練"]);
  });

  it("ends when an initial physical thought remains unknown past its deadline", async () => {
    const run = await fixture("execution-thought-timeout");
    await run.execution.prepareTick(run.input(0));
    run.setTime(baseTime + 15000);
    const result = await createAwarenessExecution(run.ports).prepareTick(run.input(3));
    assert.equal(result.canCommitWorld, false);
    assert.equal(result.snapshot.runtime.incompleteReason, "AWARENESS_INITIAL_THOUGHT_DEADLINE");
    assert.equal(run.thoughtInputs.length, 2);
    assert.equal(result.snapshot.runtime.budget.physicalOutstanding, 2);
  });

  it("does not free unknown physical slots after logical results and bounds their grace window", async () => {
    const run = await fixture("execution-logical-physical");
    await run.execution.prepareTick(run.input(0));
    run.setTime(baseTime + 500);
    run.thoughts.a.resolve({ output: thought(), actualUsd: null, physicalClosed: false });
    run.thoughts.b.resolve({ output: thought(), actualUsd: null, physicalClosed: false });
    await drainCompletion();
    run.setTime(baseTime + 1000);
    const merged = await run.execution.prepareTick(run.input(1));
    assert.equal(merged.snapshot.runtime.sides.a.job?.status, "applied");
    assert.equal(merged.snapshot.runtime.sides.a.job?.physicalStatus, "outstanding");
    assert.equal(merged.snapshot.runtime.budget.physicalOutstanding, 2);
    run.setTime(baseTime + 16000);
    const grace = await run.execution.prepareTick(run.input(2));
    assert.equal(grace.canCommitWorld, true);
    run.setTime(baseTime + 19000);
    const stopped = await run.execution.prepareTick(run.input(5));
    assert.equal(stopped.canCommitWorld, false);
    assert.equal(stopped.snapshot.runtime.incompleteReason, "AWARENESS_PHYSICAL_SLOT_UNKNOWN");
    assert.equal(run.thoughtInputs.length, 2);
    assert.equal(stopped.snapshot.runtime.budget.physicalOutstanding, 2);
  });

  it("waits for a tick interval and retries the same target without duplicate model calls", async () => {
    const run = await fixture("execution-interval");
    const first = await run.execution.prepareTick(run.input(0));
    await repo.mutateAwarenessRuntime({ battleId: "execution-interval", expectedRevision: first.snapshot.revision,
      fence: run.input(0).battleLeaseFence, now: new Date(baseTime).toISOString() }, (state) => ({ ...state,
      preparedTick: null, lastCommittedAt: baseTime }));
    const callCount = run.order.length;
    run.setTime(baseTime + 500);
    const waiting = await run.execution.prepareTick(run.input(1));
    assert.equal(waiting.canCommitWorld, false);
    assert.equal(waiting.snapshot.runtime.status, "active");
    assert.equal(run.order.length, callCount);
    run.setTime(baseTime + 1000);
    const resumed = await run.execution.prepareTick(run.input(1));
    assert.equal(resumed.canCommitWorld, true);
    assert.equal(resumed.snapshot.runtime.preparedTick, 1);
    assert.equal(run.order.length, callCount);
  });

  it("merges results ready before the durable latent cutoff without a fixed tick delay", async () => {
    const run = await fixture("execution-cutoff-before", { readyDuringLatent: true });
    const result = await run.execution.prepareTick(run.input(0));
    assert.equal(result.canCommitWorld, true);
    assert.equal(result.snapshot.runtime.cutoffTick, 0);
    assert.equal(result.snapshot.runtime.sides.a.conscious.updatedTick, 0);
    assert.equal(result.snapshot.runtime.sides.a.mailbox[0]?.availableTick, 1);
    assert.equal(run.latentInputs.some((input) => input.influences.length > 0), false);
  });

  it("does not merge a post-cutoff result during a retry of the prepared tick", async () => {
    const run = await fixture("execution-cutoff-after");
    await run.execution.prepareTick(run.input(0));
    run.setTime(baseTime + 500);
    run.thoughts.a.resolve({ output: thought(), actualUsd: 0.002, physicalClosed: true });
    await drainCompletion();
    const repeated = await run.execution.prepareTick(run.input(0));
    assert.equal(repeated.snapshot.runtime.sides.a.job?.status, "ready");
    assert.equal(repeated.snapshot.runtime.sides.a.conscious.updatedTick, null);
    run.setTime(baseTime + 1000);
    const next = await run.execution.prepareTick(run.input(1));
    assert.equal(next.snapshot.runtime.sides.a.conscious.updatedTick, 1);
    assert.equal(next.snapshot.runtime.sides.a.job?.status, "applied");
  });

  it("admits combat tick 36 and rejects tick 37 without extra model dispatch", async () => {
    const run = await fixture("execution-max-combat-tick");
    await repo.mutateAwarenessRuntime({ battleId: "execution-max-combat-tick", expectedRevision: 0,
      fence: run.input(0).battleLeaseFence, now: new Date(baseTime).toISOString() }, (state) => ({ ...state, tick: 35 }));
    const last = await run.execution.prepareTick(run.input(36));
    assert.equal(last.canCommitWorld, true);
    assert.equal(last.snapshot.runtime.preparedTick, 36);
    const count = run.order.length;
    const rejected = await run.execution.prepareTick(run.input(37));
    assert.equal(rejected.canCommitWorld, false);
    assert.equal(rejected.snapshot.runtime.incompleteReason, "AWARENESS_TICK_OR_TIME_LIMIT");
    assert.equal(run.order.length, count);
  });
});

it("observed execution accepts explicit null-cost proofs and retains role/physical limits",async()=>{
  const run=await fixture("execution-observed",{observed:true});
  const result=await run.execution.prepareTick(run.input(0));
  assert.equal(result.canCommitWorld,true);
  assert.equal(result.snapshot.runtime.policy.accountingMode,"observed");
  assert.equal(result.snapshot.runtime.budget.physicalAttempts,4);
  assert.equal(result.snapshot.runtime.budget.reservations.every((item)=>item.maximumUsd===null),true);
  assert.equal(run.latentInputs.length,2);assert.equal(run.thoughtInputs.length,2);
});

it("keeps unknown thought failure slots reserved but closes observed late validation failures without applying them", async () => {
  const run = await fixture("execution-late-rejected", { failLatent: true, observed: true });
  const failed = await run.execution.prepareTick(run.input(0));
  assert.equal(failed.snapshot.runtime.status, "incomplete");
  run.thoughts.a.reject(new Error("UNCONFIRMED_TIMEOUT"));
  run.thoughts.b.reject(new LlmPhysicalCompletionError(new Error("INVALID_ACTION_AFTER_RESPONSE")));
  await drainCompletion();
  const current = await repo.getAwarenessRuntime("execution-late-rejected"); assert.ok(current);
  assert.equal(current.runtime.status, "incomplete");
  assert.equal(current.runtime.sides.a.job?.physicalStatus, "outstanding");
  assert.equal(current.runtime.sides.b.job?.physicalStatus, "finished");
  assert.equal(current.runtime.sides.b.job?.status, "cancelled");
  assert.equal(current.runtime.sides.b.conscious.updatedTick, null);
  assert.equal(current.runtime.budget.physicalOutstanding, 2); // unknown latent B + unknown thought A
  const b = current.runtime.budget.reservations.find((item) => item.id.includes("thought:b")); assert.ok(b);
  assert.equal(b.status, "unknown"); assert.equal(b.actualUsd, null); assert.equal(b.physicalOutstanding, false);
});
