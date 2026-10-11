import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBattleWorldState, createBattleSemanticState, initializeReservedTurns, ReservedTurnRuntimeSchema,
  type ReservedTurnRuntime, type ReservedTurnWorld } from "@kshiai/shared";
import { executeReservedTurn, type ReservedExecutionPort } from "./reserved-turn-execution.js";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { bindReservedTurnPolicy } from "./reserved-turn-policy.js";
import { AwarenessLatentOutputSchema, AwarenessConsciousOutputSchema } from "@kshiai/shared";
function transport(send: AwarenessJsonTransport["requestJson"]): AwarenessJsonTransport {
  return { identity: { provider: "openai", engineModel: "judge", fastModel: "character" }, requestJson: send };
}
function fixture() {
  const stub = transport(async () => ({}));
  const policy = bindReservedTurnPolicy({ consciousness: stub, adjudication: stub,
    narration: { identity: stub.identity, narrateBatch: async () => [], narrateFrozenBatch: async () => [] },
    models: { subconscious: async (input) => AwarenessLatentOutputSchema.parse({ state: input.currentState, reflexDesires: [], affectiveDesires: [], reconsider: false, cancelThought: false }),
      conscious: async () => AwarenessConsciousOutputSchema.parse({ goal: null, thought: "", desires: [], influences: [] }) } });
  let runtime = initializeReservedTurns(policy, Date.now());
  const port: ReservedExecutionPort = { read: async () => structuredClone(runtime),
    update: async (reduce) => { runtime = ReservedTurnRuntimeSchema.parse(reduce(runtime)); },
    account: async (reduce) => { runtime = ReservedTurnRuntimeSchema.parse(reduce(runtime)); } };
  const actor = { hp: 20, maxHp: 20, mp: 10, maxMp: 10, stamina: 10, maxStamina: 10, initiative: 10 };
  const start: ReservedTurnWorld = { turn: 1, revision: 0, actors: { a: { ...actor }, b: { ...actor } }, world: createBattleWorldState({ semanticState: createBattleSemanticState({ scene: "路地", sideA: { displayName: "A" }, sideB: { displayName: "B" } }) }) };
  const frames = { a: { context: { privateIdentity: "A_ONLY" }, references: [{ id: "opponent", text: "相手" }] }, b: { context: { privateIdentity: "B_ONLY" }, references: [{ id: "opponent", text: "相手" }] } };
  return { port, start, frames, runtime: () => runtime, set: (next: ReservedTurnRuntime) => { runtime = next; } };
}
describe("reserved-turn execution", () => {
  it("dispatches A/B together, calls one judge for ten reservations and only public narration", async () => {
    const f = fixture(); const calls: string[] = []; const characterInputs: string[] = []; let unblock: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => { unblock = resolve; });
    const t = transport(async (_system, user, options) => {
      calls.push(options.label);
      const input = JSON.parse(user);
      if (options.label.endsWith("character")) {
        characterInputs.push(user);
        if (characterInputs.length === 2) unblock?.();
        await barrier;
        return { actions: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, intent: "相手を攻める", targets: ["opponent"] })), memory: [`${input.side}の考え`] };
      }
      if (options.label.endsWith("adjudication")) {
        assert.deepEqual(input.assets.observedReferences, { a: f.frames.a.references, b: f.frames.b.references });
        return { results: input.order.map((r: { reservationId: string; side: "a" | "b" }, i: number) => ({ reservationId: r.reservationId, side: r.side, baseRevision: i, outcome: "failure", reason: "届かなかった", updates: [], observations: { a: ["A向け結果"], b: ["B向け結果"], public: ["距離が離れている"] } })) };
      }
      assert.equal(user.includes("A_ONLY"), false); assert.equal(user.includes("B_ONLY"), false);
      assert.equal(user.includes("A向け結果"), false); assert.equal(user.includes("B向け結果"), false);
      return { lines: ["両者の攻撃は届かない。"] };
    });
    const input = { battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
    const resolved = await executeReservedTurn(input);
    assert.equal(calls.length, 4); assert.equal(resolved.trace.results.length, 10);
    assert.equal(characterInputs[0]?.includes("B_ONLY"), false); assert.equal(characterInputs[1]?.includes("A_ONLY"), false);
    assert.equal(f.runtime().turn, 0); assert.deepEqual(f.runtime().memories, { a: [], b: [] });
    await executeReservedTurn(input); assert.equal(calls.length, 4, "prepared responses replay without provider calls");
    f.set({ ...f.runtime(), turn: 1, memories: resolved.memories, feedback: resolved.feedback });
    assert.equal(f.runtime().memories.a[0]?.text, "aの考え");
  });
  it("does not dispatch adjudication when one plan is malformed or references hidden objects", async () => {
    const f = fixture(); let calls = 0;
    const t = transport(async (_system, user) => { calls += 1; return JSON.parse(user).side === "a" ? { actions: [], memory: [] } : { actions: [{ id: "r", intent: "秘密の物へ触る", targets: ["secret"] }], memory: [] }; });
    await assert.rejects(executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t }), /UNKNOWN_REFERENCE/);
    assert.equal(calls, 2); assert.equal(f.runtime().turn, 0); assert.ok(f.runtime().requests.every((r) => !r.physicalOutstanding));
    assert.match(f.runtime().requests.find((request) => request.side === "b")?.rawResponse ?? "", /secret/, "invalid paid response remains private evidence");
  });
  it("refuses to resend a reserved request with unknown physical completion", async () => {
    const f = fixture(); let calls = 0;
    const t = transport(async () => { calls += 1; throw new Error("unknown network termination"); });
    const input = { battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
    await assert.rejects(executeReservedTurn(input)); assert.equal(calls, 2);
    await assert.rejects(executeReservedTurn(input), /NOT_REPLAYABLE/); assert.equal(calls, 2);
    assert.ok(f.runtime().requests.every((r) => r.physicalOutstanding));
  });
  it("retries only known rate-limit responses within the physical cap", async () => {
    const f = fixture(); let calls = 0;
    const t = transport(async (_system, _user, options) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("rate limit"), { status: 429, headers: { "retry-after-ms": "0" } });
      if (options.label.endsWith("character")) return { actions: [], memory: [] };
      if (options.label.endsWith("adjudication")) return { results: [] };
      return { lines: ["間合いを保つ。"] };
    });
    await executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t });
    assert.equal(calls, 5);
    assert.equal(f.runtime().requests.filter((request) => request.failure === "RATE_LIMIT").length, 1);
    assert.ok(f.runtime().requests.every((request) => !request.physicalOutstanding));
  });
  it("keeps a timed-out request unknown until late physical completion without preparing its output", async () => {
    const f = fixture();
    f.set({ ...f.runtime(), policy: { ...f.runtime().policy, deadlineMs: 10 } });
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const t = transport(async () => { await barrier; return { actions: [], memory: [] }; });
    await assert.rejects(executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t }), /DEADLINE/);
    assert.ok(f.runtime().requests.every((request) => request.physicalOutstanding));
    release?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.ok(f.runtime().requests.every((request) => !request.physicalOutstanding && request.status === "failed" && request.output === null));
  });

});
