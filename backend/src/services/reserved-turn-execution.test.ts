import assert from "node:assert/strict";
import { zodToJsonSchema } from "openai/_vendor/zod-to-json-schema/index";
import { describe, it } from "node:test";
import { createBattleWorldState, createBattleSemanticState, initializeReservedTurns, ReservedTurnRuntimeSchema,
  isClosedRecoverableReservedRequest, ReservedTurnTraceSchema, ReservedTurnPolicySchema, orderReservedActions, type ReservedTurnRuntime, type ReservedTurnWorld } from "@kshiai/shared";
import { executeReservedTurn, type ReservedExecutionPort } from "./reserved-turn-execution.js";
import { reservedPlanSystem, reservedPlanSystemFor, compactReservedAdjudicationSchema, reservedAdjudicationSystem, reservedAdjudicationUser } from "../llm/reserved-turns.js";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { ProviderJsonSyntaxError } from "../llm/provider-json.js";
import { LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
import { bindReservedTurnPolicy } from "./reserved-turn-policy.js";
import { AwarenessLatentOutputSchema, AwarenessConsciousOutputSchema } from "@kshiai/shared";
function transport(send: AwarenessJsonTransport["requestJson"]): AwarenessJsonTransport {
  return { identity: { provider: "openai", engineModel: "judge", fastModel: "character" }, requestJson: send };
}
function fixture(version: "v5" | "v6" | "v7" = "v5") {
  const stub = transport(async () => ({}));
  const boundPolicy = bindReservedTurnPolicy({ consciousness: stub, adjudication: stub,
    narration: { identity: stub.identity, narrateBatch: async () => [], narrateFrozenBatch: async () => [] },
    models: { subconscious: async (input) => AwarenessLatentOutputSchema.parse({ state: input.currentState, reflexDesires: [], affectiveDesires: [], reconsider: false, cancelThought: false }),
      conscious: async () => AwarenessConsciousOutputSchema.parse({ goal: null, thought: "", desires: [], influences: [] }) } });
  if (boundPolicy.revision !== "reserved-turn-policy-v8") throw new Error("expected creation policy v8");
  const { canonicalNarration: _independent, ...previous } = boundPolicy;
  const v7 = ReservedTurnPolicySchema.parse({ ...previous, revision: "reserved-turn-policy-v7", maxTurns: 36 });
  if (v7.revision !== "reserved-turn-policy-v7") throw new Error("expected frozen policy v7");
  const { narrationFallback: _narrationFallback, ...v6 } = v7;
  const { maxCharacterCorrections: _characterCorrections, ...historical } = v6;
  const policy = version === "v7" ? v7 : version === "v6" ? ReservedTurnPolicySchema.parse({ ...v6, revision: "reserved-turn-policy-v6" }) : ReservedTurnPolicySchema.parse({ ...historical, revision: "reserved-turn-policy-v5" });
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
  it("prepares observation-only success, carries observer feedback and memory with four calls", async () => {
    const f = fixture(); let calls = 0;
    const t = transport(async (system, user, options) => {
      calls += 1;
      if (options.label.endsWith("character")) return { actions: [{ id: "observe", intent: "相手を観察する", targets: ["opponent"] }], memory: ["次も足運びを見る"] };
      if (options.label.endsWith("adjudication")) {
        assert.match(system, /予約ターン出力 v2/);
        const input: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[] } = JSON.parse(user);
        return { results: input.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "success", reason: "足運びを見極めた", updates: [], observations: { a: ["Aだけの観測"], b: ["Bだけの観測"], public: [] } })) };
      }
      assert.equal(user.includes("Aだけの観測"), false);
      assert.equal(user.includes("Bだけの観測"), false);
      return { lines: ["両者が相手の足運びを見定める。"] };
    });
    const resolved = await executeReservedTurn({ battleId: "btl_observe", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t });
    assert.equal(calls, 4);
    assert.deepEqual(resolved.state.actors, f.start.actors);
    assert.deepEqual(resolved.feedback, { a: ["Aだけの観測", "Aだけの観測"], b: ["Bだけの観測", "Bだけの観測"] });
    assert.equal(resolved.memories.a[0]?.text, "次も足運びを見る");
    assert.equal(f.runtime().requests.filter((r) => r.status === "prepared").length, 4);
    assert.equal(f.runtime().turn, 0, "whole-turn commit still belongs to the fenced battle service");
  });
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
  it("rejects information-only success under frozen policy v3 without repair calls", async () => {
    const f = fixture(); const current = f.runtime().policy;
    if (current.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
    const { maxAdjudicationCorrections: _corrections, ...legacy } = current;
    f.set({ ...f.runtime(), policy: { ...legacy, revision: "reserved-turn-policy-v3" } });
    let calls = 0;
    const t = transport(async (_system, user, options) => {
      calls += 1;
      if (options.label.endsWith("character")) return { actions: [{ id: "observe", intent: "観察する", targets: ["opponent"] }], memory: [] };
      const input: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[] } = JSON.parse(user);
      return { results: input.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "success", reason: "観察した", updates: [], observations: { a: ["足運びが見える"], b: [], public: [] } })) };
    });
    await assert.rejects(executeReservedTurn({ battleId: "btl_legacy", ...f, promptRevision: "reserved-turn-prompt-v3", assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t }), /concrete consequences/);
    assert.equal(calls, 3);
    assert.equal(f.runtime().turn, 0);
    assert.equal(f.runtime().requests.find((r) => r.role === "adjudication")?.physicalOutstanding, false);
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
    const policy = f.runtime().policy;
    if (policy.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
    f.set({ ...f.runtime(), policy: { ...policy, deadlineMs: 10, softDeadlineMs: 5 } });
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

// Frozen prompt revisions remain executable without changing old request digests.
it("pins every adjudication base revision before dispatch and preserves prompt v1", () => {
  const f = fixture();
  const start = { ...f.start, revision: 7 };
  const plan = { actions: [{ id: "first", intent: "試みる", targets: ["opponent"] }], memory: [] };
  const order = orderReservedActions(1, { a: 1, b: 1 }, { a: plan, b: plan });
  const current = JSON.parse(reservedAdjudicationUser(start, order, {}, "reserved-turn-prompt-v2"));
  assert.deepEqual(current.order.map((item: { baseRevision: number }) => item.baseRevision), [7, 8]);
  const historical = JSON.parse(reservedAdjudicationUser(start, order, {}, "reserved-turn-prompt-v1"));
  assert.deepEqual(historical.order, order);
  assert.equal(reservedAdjudicationSystem("reserved-turn-prompt-v1").includes("予約ターン裁定プロンプト v2"), false);
  assert.equal(reservedAdjudicationSystem("reserved-turn-prompt-v2").includes("先に1を足さない"), true);
});

it("binds role deadlines in policy v2, preserves policy v1 and clips both to the battle deadline", async () => {
  for (const version of ["v1", "v2", "clipped"] as const) {
    const f = fixture(); const current = f.runtime().policy;
    assert.equal(current.revision, "reserved-turn-policy-v5");
    if (current.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
    const { maxAdjudicationCorrections: _corrections, softDurationMs: _duration, softDeadlineMs: _role, softAdjudicationDeadlineMs: _judge, ...hard } = current;
    const v2 = { ...hard, revision: "reserved-turn-policy-v2", durationMs: 600000, deadlineMs: 60000, adjudicationDeadlineMs: 180000 };
    const { adjudicationDeadlineMs: _deadline, ...historical } = v2;
    const policy = ReservedTurnPolicySchema.parse(version === "v1" ? { ...historical, revision: "reserved-turn-policy-v1" } : v2);
    assert.equal(ReservedTurnPolicySchema.safeParse({ ...historical, revision: "reserved-turn-policy-v1", adjudicationDeadlineMs: 180000 }).success, false);
    const clock = f.runtime().startedAt;
    f.set({ ...f.runtime(), policy: { ...policy, durationMs: version === "clipped" ? 30000 : 600000 }, deadlineAt: clock + (version === "clipped" ? 30000 : 600000) });
    const t = transport(async (_system, _user, options) => {
      const expected = version === "clipped" ? 30000 : version === "v2" && options.label.endsWith("adjudication") ? 180000 : 60000;
      assert.equal(options.timeoutMs, expected);
      if (options.label.endsWith("character")) return { actions: [], memory: [] };
      if (options.label.endsWith("adjudication")) return { results: [] };
      return { lines: ["間合いを保つ。"] };
    });
    await executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t, now: () => clock });
    assert.equal(f.runtime().requests.length, 4);
  }
});

it("closes late received rejection accounting without preparing output or resending unknown failures", async () => {
  for (const received of [true, false]) {
    const f = fixture(); const policy = f.runtime().policy;
    if (policy.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
    f.set({ ...f.runtime(), policy: { ...policy, deadlineMs: 10, softDeadlineMs: 5 } });
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => { release = resolve; }); let calls = 0;
    const t = transport(async () => { calls += 1; await barrier; throw received ? new LlmPhysicalCompletionError(new Error("invalid JSON")) : new Error("unknown network termination"); });
    const input = { battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
    await assert.rejects(executeReservedTurn(input), /DEADLINE/);
    release?.(); await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.ok(f.runtime().requests.every((r) => r.physicalOutstanding === !received && r.status === "failed" && r.output === null));
    await assert.rejects(executeReservedTurn(input), /NOT_REPLAYABLE/); assert.equal(calls, 2);
    assert.equal(f.runtime().turn, 0);
  }
});

it("warns at soft time limits without stopping requests or committing private state", async (test) => {
  const warnings: unknown[][] = [];
  test.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  const f = fixture(); const start = Date.now();
  const policy = f.runtime().policy;
  if (policy.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
  f.set({ ...f.runtime(), startedAt: start, deadlineAt: start + 2000,
    policy: { ...policy, durationMs: 2000, softDurationMs: 5, deadlineMs: 1000, softDeadlineMs: 5, adjudicationDeadlineMs: 1000, softAdjudicationDeadlineMs: 5 } });
  const t = transport(async (_system, _user, options) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    if (options.label.endsWith("character")) return { actions: [], memory: [] };
    if (options.label.endsWith("adjudication")) return { results: [] };
    return { lines: ["間合いを保つ。"] };
  });
  await executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t });
  assert.equal(f.runtime().requests.length, 4); assert.equal(f.runtime().status, "active");
  assert.ok(f.runtime().requests.every((r) => r.status === "prepared" && !r.physicalOutstanding));
  for (const scope of ["battle", "character", "adjudication", "narration"]) assert.ok(warnings.some(([, metadata]) => typeof metadata === "object" && metadata !== null && "scope" in metadata && metadata.scope === scope));
  assert.equal(JSON.stringify(warnings).includes("A_ONLY"), false);
  assert.equal(f.runtime().turn, 0); assert.deepEqual(f.runtime().memories, { a: [], b: [] });
});

it("continues beyond the battle soft limit and applies the looser policy v3 hard deadlines", async (test) => {
  test.mock.method(console, "warn", () => undefined);
  const f = fixture(); const clock = f.runtime().startedAt + 600001;
  const t = transport(async (_system, _user, options) => {
    assert.equal(options.timeoutMs, options.label.endsWith("adjudication") ? 300000 : 120000);
    if (options.label.endsWith("character")) return { actions: [], memory: [] };
    if (options.label.endsWith("adjudication")) return { results: [] };
    return { lines: ["間合いを保つ。"] };
  });
  await executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t, now: () => clock });
  assert.equal(f.runtime().requests.length, 4);
  assert.equal(ReservedTurnPolicySchema.safeParse({ ...f.runtime().policy, softDurationMs: 1800001 }).success, false);
});

it("losslessly factors the complete adjudication schema and preserves every user input field", () => {
  const schema = compactReservedAdjudicationSchema();
  function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
  if (!object(schema) || !object(schema.$defs)) throw new Error("expected schema definitions");
  const { $defs: definitions, ...body } = schema;
  function checkPropertyMaps(value: unknown): void {
    if (Array.isArray(value)) { value.forEach((item: unknown) => checkPropertyMaps(item)); return; }
    if (!object(value)) return;
    if (object(value.properties)) assert.equal(Object.hasOwn(value.properties, "$ref"), false, "property maps must remain maps, not schema references");
    Object.values(value).forEach(checkPropertyMaps);
  }
  checkPropertyMaps(schema);
  function expand(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item: unknown) => expand(item));
    if (!object(value)) return value;
    if (typeof value.$ref === "string") {
      assert.ok(value.$ref.startsWith("#/$defs/"));
      const key = value.$ref.slice("#/$defs/".length);
      assert.ok(Object.hasOwn(definitions, key));
      return expand(definitions[key]);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
  }
  const original = zodToJsonSchema(ReservedTurnTraceSchema, { $refStrategy: "none", openaiStrictMode: false });
  assert.deepEqual(expand(body), original);
  assert.ok(reservedAdjudicationSystem("reserved-turn-prompt-v3").length < reservedAdjudicationSystem("reserved-turn-prompt-v2").length * 0.7);
  const f = fixture(); const plan = { actions: [{ id: "r", intent: "試みる", targets: ["opponent"] }], memory: [] };
  const order = orderReservedActions(1, { a: 1, b: 1 }, { a: plan, b: plan });
  assert.equal(reservedAdjudicationUser(f.start, order, { immutable: "資料" }, "reserved-turn-prompt-v3"), reservedAdjudicationUser(f.start, order, { immutable: "資料" }, "reserved-turn-prompt-v2"));
});

it("keeps known rate-limit retries inside the original policy v3 role hard deadline", async () => {
  const f = fixture(); const policy = f.runtime().policy;
  if (policy.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
  f.set({ ...f.runtime(), policy: { ...policy, deadlineMs: 1200, softDeadlineMs: 1000 } });
  let clock = f.runtime().startedAt; let aCalls = 0;
  const t = transport(async (_system, user, options) => {
    if (options.label.endsWith("character")) {
      if (JSON.parse(user).side === "a") {
        aCalls += 1;
        if (aCalls === 1) { clock += 1100; throw Object.assign(new Error("rate limit"), { status: 429, headers: { "retry-after-ms": "0" } }); }
        assert.equal(options.timeoutMs, 100, "retry does not reset the role deadline");
      }
      return { actions: [], memory: [] };
    }
    if (options.label.endsWith("adjudication")) return { results: [] };
    return { lines: ["間合いを保つ。"] };
  });
  await executeReservedTurn({ battleId: "btl_test", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t, now: () => clock });
  assert.equal(aCalls, 2); assert.equal(f.runtime().requests.length, 5);
});

it("retries a received ambiguous adjudication with explicit errors and replays all five receipts without sending again", async () => {
  const f = fixture(); let calls = 0; let judges = 0;
  const t = transport(async (_system, user, options) => {
    calls += 1;
    if (options.label.endsWith("character")) return { actions: [{ id: "r", intent: "働きかける", targets: ["opponent"] }], memory: [] };
    if (options.label.endsWith("adjudication")) {
      judges += 1;
      const input: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[]; validationErrors?: string[] } = JSON.parse(user);
      if (judges === 1) return { results: [] };
      assert.match(input.validationErrors?.join() ?? "", /IDENTITY_MISMATCH/);
      return { results: input.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "failure", reason: "届かなかった", updates: [], observations: { a: [], b: [], public: [] } })) };
    }
    return { lines: ["両者は距離を保つ。"] };
  });
  const input = { battleId: "btl_correction", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
  await executeReservedTurn(input);
  assert.equal(calls, 5); assert.equal(judges, 2);
  assert.equal(f.runtime().requests.filter((r) => r.failure === "ADJUDICATION_INVALID").length, 1);
  assert.equal(f.runtime().requests.filter((r) => r.status === "prepared").length, 4);
  const original = f.runtime().requests.find((r) => r.role === "adjudication" && r.failure === "ADJUDICATION_INVALID");
  assert.equal(original?.rawResponse, '{"results":[]}');
  const corrected = f.runtime().requests.find((r) => r.id.includes(":correction:1:"));
  assert.equal(corrected?.logicalStartedAt, original?.logicalStartedAt);
  await executeReservedTurn(input);
  assert.equal(calls, 5);
});

it("continues with explicit failure receipts after one invalid correction and preserves both raw responses", async () => {
  const f = fixture(); let calls = 0;
  const t = transport(async (_system, _user, options) => {
    calls += 1;
    if (options.label.endsWith("character")) return { actions: [{ id: "r", intent: "働きかける", targets: ["opponent"] }], memory: [] };
    if (options.label.endsWith("adjudication")) return { results: [] };
    return { lines: ["両者は距離を保つ。"] };
  });
  const input = { battleId: "btl_fallback", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
  const resolved = await executeReservedTurn(input);
  assert.equal(calls, 5); assert.deepEqual(resolved.state.actors, f.start.actors);
  assert.ok(resolved.trace.results.every((r) => r.outcome === "failure" && r.updates.length === 0 && r.observations.public.length === 0));
  assert.match(resolved.feedback.a.join(), /ADJUDICATION_INVALID/);
  assert.equal(f.runtime().requests.filter((r) => r.role === "adjudication" && r.rawResponse === '{"results":[]}').length, 2);
  assert.equal(f.runtime().requests.filter((r) => r.failure === "ADJUDICATION_FALLBACK").length, 1);
  await executeReservedTurn(input); assert.equal(calls, 5);
});

it("repairs unaffordable actions in four calls, discards unverified observations and retains original raw output", async () => {
  const f = fixture(); f.start.actors.a.mp = 1; let calls = 0;
  const t = transport(async (_system, user, options) => {
    calls += 1;
    if (options.label.endsWith("character")) return { actions: [{ id: "r", intent: "働きかける", targets: ["opponent"] }], memory: [] };
    if (options.label.endsWith("adjudication")) {
      const input: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[] } = JSON.parse(user);
      return { results: input.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "success", reason: "未成立の効果", updates: [{ kind: "resource", side: "a", resource: "mp", delta: -4 }], observations: { a: ["未成立の効果"], b: ["未成立の効果"], public: ["未成立の効果"] } })) };
    }
    assert.equal(user.includes("未成立の効果"), false);
    assert.equal(user.includes("RESOURCE_RANGE"), false, "private diagnostics do not enter public narration");
    return { lines: ["両者は距離を保つ。"] };
  });
  const resolved = await executeReservedTurn({ battleId: "btl_range", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t });
  assert.equal(calls, 4); assert.equal(resolved.state.actors.a.mp, 1);
  assert.ok(resolved.trace.results.every((r) => r.outcome === "failure"));
  assert.match(resolved.feedback.a.join(), /残量不足/);
  assert.match(f.runtime().requests.find((r) => r.role === "adjudication")?.rawResponse ?? "", /未成立の効果/);
});


it("corrects received invalid JSON inside the original judge deadline", async () => {
  const f = fixture(); let clock = f.runtime().startedAt; let judges = 0;
  const policy = f.runtime().policy;
  if (policy.revision !== "reserved-turn-policy-v5") throw new Error("expected policy v5");
  f.set({ ...f.runtime(), policy: { ...policy, adjudicationDeadlineMs: 1200, softAdjudicationDeadlineMs: 1000 } });
  const t = transport(async (_system, user, options) => {
    if (options.label.endsWith("character")) return { actions: [], memory: [] };
    if (options.label.endsWith("adjudication")) {
      judges += 1;
      if (judges === 1) {
        assert.equal(options.timeoutMs, 1200);
        clock += 1100;
        throw new LlmPhysicalCompletionError(new ProviderJsonSyntaxError("{broken"));
      }
      assert.equal(options.timeoutMs, 100);
      assert.deepEqual(JSON.parse(user).validationErrors, ["INVALID_JSON"]);
      return { results: [] };
    }
    return { lines: ["間合いを保つ。"] };
  });
  await executeReservedTurn({ battleId: "btl_json", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t, now: () => clock });
  assert.equal(judges, 2);
  assert.equal(f.runtime().requests.find((r) => r.failure === "ADJUDICATION_INVALID")?.rawResponse, "{broken");
});

it("does not correct or resend a judge whose network completion is unknown", async () => {
  const f = fixture(); let judges = 0;
  const t = transport(async (_system, _user, options) => {
    if (options.label.endsWith("character")) return { actions: [], memory: [] };
    judges += 1;
    throw new Error("unknown network termination");
  });
  const input = { battleId: "btl_unknown_judge", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
  await assert.rejects(executeReservedTurn(input));
  await assert.rejects(executeReservedTurn(input));
  assert.equal(judges, 1);
  assert.equal(f.runtime().requests.some((r) => r.id.includes(":correction:")), false);
});


it("pins historical planning prompts and exposes failed-slot opportunity cost only in prompt v5", () => {
  for (const revision of ["reserved-turn-prompt-v1", "reserved-turn-prompt-v2", "reserved-turn-prompt-v3", "reserved-turn-prompt-v4"] as const) {
    assert.equal(reservedPlanSystemFor(revision), reservedPlanSystem);
  }
  const prompt = reservedPlanSystemFor("reserved-turn-prompt-v5");
  assert.match(prompt, /枠を消費し、破棄/);
  assert.match(prompt, /追加や差し替えはできない/);
  assert.match(prompt, /慎重.*投機的.*計画的/);
  assert.match(prompt, /本人の再計画ではない/);
});

it("corrects missing memory on just one side, keeps its original deadline and replays without new calls", async () => {
  const f = fixture("v6"); let clock = f.runtime().startedAt; let calls = 0; let aCalls = 0; let bCalls = 0;
  const policy = f.runtime().policy;
  if (policy.revision !== "reserved-turn-policy-v6") throw new Error("expected policy v6");
  const previous = [{ id: "retained", text: "A_PRIVATE_MEMORY" }];
  f.set({ ...f.runtime(), memories: { a: previous, b: [] }, policy: { ...policy, deadlineMs: 1200, softDeadlineMs: 1000 } });
  const t = transport(async (_system, user, options) => {
    calls += 1;
    if (options.label.endsWith("character")) {
      const input: { side: "a" | "b"; validationErrors?: string[] } = JSON.parse(user);
      const actions = [{ id: "r", intent: "働きかける", targets: ["opponent"] }];
      if (input.side === "a") {
        aCalls += 1;
        if (aCalls === 1) { clock += 1100; return { actions }; }
        assert.match(input.validationErrors?.join() ?? "", /memory/);
        assert.equal(options.timeoutMs, 100);
        return { actions, memory: ["1"] };
      }
      bCalls += 1; return { actions, memory: [] };
    }
    if (options.label.endsWith("adjudication")) {
      const input: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[] } = JSON.parse(user);
      return { results: input.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "failure", reason: "届かない", updates: [], observations: { a: [], b: [], public: [] } })) };
    }
    assert.equal(user.includes("A_PRIVATE_MEMORY"), false);
    return { lines: ["距離を保つ。"] };
  });
  const input = { battleId: "btl_plan_correction", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t, now: () => clock };
  const result = await executeReservedTurn(input);
  assert.equal(calls, 5); assert.equal(aCalls, 2); assert.equal(bCalls, 1);
  assert.deepEqual(result.memories.a, previous);
  const invalid = f.runtime().requests.find((r) => r.failure === "PLAN_INVALID");
  const corrected = f.runtime().requests.find((r) => r.role === "character" && r.id.includes(":correction:1:"));
  assert.equal(invalid?.physicalOutstanding, false);
  assert.equal(corrected?.logicalStartedAt, invalid?.logicalStartedAt);
  assert.equal(f.runtime().requests.filter((r) => r.status === "prepared").length, 4);
  await executeReservedTurn(input); assert.equal(calls, 5);
});

it("rejects a twice-invalid side plan, preserves its memory and lets the counterpart act with private feedback", async () => {
  const f = fixture("v6"); const previous = [{ id: "old1", text: "A_SECRET_ONE" }, { id: "old2", text: "A_SECRET_TWO" }];
  f.set({ ...f.runtime(), memories: { a: previous, b: [] } }); let calls = 0;
  const t = transport(async (_system, user, options) => {
    calls += 1;
    if (options.label.endsWith("character")) {
      const input: { side: "a" | "b" } = JSON.parse(user);
      const actions = [{ id: "r", intent: "相手を攻める", targets: ["opponent"] }];
      return input.side === "a" ? { actions } : { actions, memory: [] };
    }
    if (options.label.endsWith("adjudication")) {
      const input: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[] } = JSON.parse(user);
      assert.equal(input.order.length, 1); assert.equal(input.order[0]?.side, "b");
      return { results: input.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "success", reason: "打撃", updates: [{ kind: "resource", side: "a", resource: "hp", delta: -1 }], observations: { a: [], b: [], public: ["打撃が届く。"] } })) };
    }
    assert.equal(user.includes("A_SECRET"), false); assert.equal(user.includes("PLAN_INVALID"), false);
    return { lines: ["打撃が届く。"] };
  });
  const input = { battleId: "btl_plan_rejected", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
  const result = await executeReservedTurn(input);
  assert.equal(calls, 5); assert.equal(result.plans.a.actions.length, 0);
  assert.equal(result.state.actors.a.hp, 19); assert.equal(result.state.actors.b.hp, 20);
  assert.deepEqual(result.memories.a, previous); assert.match(result.feedback.a.join(), /PLAN_INVALID/);
  assert.equal(result.feedback.b.join().includes("PLAN_INVALID"), false);
  assert.equal(f.runtime().requests.filter((r) => r.failure === "PLAN_FALLBACK").length, 1);
  assert.equal(f.runtime().requests.filter((r) => r.role === "character" && r.side === "a" && r.rawResponse?.includes('"memory"') === false).length, 2);
  const invalid = f.runtime().requests.find((r) => r.failure === "PLAN_INVALID");
  assert.ok(invalid);
  assert.equal(isClosedRecoverableReservedRequest(invalid, f.runtime().policy), true);
  assert.equal(isClosedRecoverableReservedRequest(invalid, fixture().runtime().policy), false);
  assert.equal(isClosedRecoverableReservedRequest({ ...invalid, status: "reserved" }, f.runtime().policy), false);
  assert.equal(isClosedRecoverableReservedRequest({ ...invalid, rawResponse: null }, f.runtime().policy), false);
  assert.equal(isClosedRecoverableReservedRequest({ ...invalid, physicalOutstanding: true }, f.runtime().policy), false);
  assert.equal(isClosedRecoverableReservedRequest({ ...invalid, role: "adjudication", side: null }, f.runtime().policy), false);
  const replayed = await executeReservedTurn(input);
  assert.equal(calls, 5); assert.deepEqual(replayed.feedback, result.feedback);
});

it("corrects received character JSON and invalid ranks/references, while refusing unknown sends under policy v6", async () => {
  for (const defect of ["json", "rank", "reference", "unknown"] as const) {
    const f = fixture("v6"); let aCalls = 0;
    const t = transport(async (_system, user, options) => {
      if (options.label.endsWith("character")) {
        const input: { side: "a" | "b"; validationErrors?: string[] } = JSON.parse(user);
        if (input.side === "a") {
          aCalls += 1;
          if (aCalls === 1) {
            if (defect === "json") throw new LlmPhysicalCompletionError(new ProviderJsonSyntaxError("{broken"));
            if (defect === "unknown") throw new Error("unknown network termination");
            if (defect === "rank") return { actions: [], memory: ["1"] };
            return { actions: [{ id: "r", intent: "働きかける", targets: ["not_observed"] }], memory: [] };
          }
          assert.ok(input.validationErrors?.length);
        }
        return { actions: [], memory: [] };
      }
      if (options.label.endsWith("adjudication")) return { results: [] };
      return { lines: ["距離を保つ。"] };
    });
    const input = { battleId: `btl_plan_${defect}`, ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
    if (defect === "unknown") {
      await assert.rejects(executeReservedTurn(input)); await assert.rejects(executeReservedTurn(input)); assert.equal(aCalls, 1);
      assert.equal(f.runtime().requests.some((r) => r.id.includes(":correction:")), false);
    } else {
      await executeReservedTurn(input); assert.equal(aCalls, 2);
      assert.equal(f.runtime().requests.find((r) => r.failure === "PLAN_INVALID")?.physicalOutstanding, false);
    }
  }
});

it("keeps policy v5 strict on missing memory and preserves prompt v5 while prompt v6 requires memory first", async () => {
  const f = fixture(); let aCalls = 0;
  const t = transport(async (_system, user) => {
    if (JSON.parse(user).side === "a") { aCalls += 1; return { actions: [] }; }
    return { actions: [], memory: [] };
  });
  await assert.rejects(executeReservedTurn({ battleId: "btl_old_plan", ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t }));
  assert.equal(aCalls, 1); assert.equal(f.runtime().requests.length, 2);
  assert.equal(reservedPlanSystemFor("reserved-turn-prompt-v5").includes("先頭に必ずmemory"), false);
  assert.match(reservedPlanSystemFor("reserved-turn-prompt-v6"), /先頭に必ずmemory/);
  assert.equal(reservedAdjudicationSystem("reserved-turn-prompt-v6"), reservedAdjudicationSystem("reserved-turn-prompt-v5"));
});

it("repairs received narration from public facts without extra calls and preserves raw/replay", async () => {
  for (const mode of ["empty", "schema", "json", "bounds", "valid"] as const) {
    const f = fixture("v7"); let calls = 0;
    const t = transport(async (_system, user, options) => {
      calls += 1;
      if (options.label.endsWith("character")) return { actions: Array.from({ length: mode === "bounds" ? 2 : 1 }, (_, i) => ({ id: `observe${i}`, intent: "観察", targets: ["opponent"] })), memory: ["秘密の記憶"] };
      assert.equal(user.includes("PRIVATE"), false);
      assert.equal(user.includes("秘密"), false);
      if (mode === "json") throw new LlmPhysicalCompletionError(new ProviderJsonSyntaxError("{broken"));
      if (mode === "schema") return { invalid: true };
      return { lines: mode === "valid" ? ["有効な実況"] : [] };
    });
    // Frozen public observations obey the trace's bounded observation contract.
    const judge = transport(async (_system, user) => {
      const parsed: { order: { reservationId: string; side: "a" | "b"; baseRevision: number }[] } = JSON.parse(user);
      calls += 1;
      return { results: parsed.order.map((r) => ({ reservationId: r.reservationId, side: r.side, baseRevision: r.baseRevision, outcome: "success", reason: "観察", updates: [], observations: { a: ["A_PRIVATE"], b: ["B_PRIVATE"], public: mode === "empty" ? [] : mode === "bounds" ? Array.from({ length: 8 }, () => "公".repeat(600)) : ["公開された事実"] } })) };
    });
    const args = { battleId: `btl_narration_${mode}`, ...f, assets: {}, publicScene: "路地", character: t, adjudication: judge, narration: t };
    const result = await executeReservedTurn(args);
    assert.equal(calls, 4);
    assert.deepEqual(result.narration.lines, mode === "valid" ? ["有効な実況"] : mode === "empty" ? ["このターンに公開された行動結果はありません。"] : mode === "bounds" ? Array.from({ length: 16 }, () => "公".repeat(300)) : ["公開された事実", "公開された事実"]);
    assert.equal(JSON.stringify(result.narration).includes("PRIVATE"), false);
    const receipt = f.runtime().requests.find((r) => r.role === "narration");
    assert.equal(receipt?.failure, mode === "valid" ? null : "NARRATION_FALLBACK");
    assert.equal(receipt?.physicalOutstanding, false);
    assert.equal(receipt?.rawResponse, mode === "json" ? "{broken" : JSON.stringify(mode === "schema" ? { invalid: true } : { lines: mode === "valid" ? ["有効な実況"] : [] }));
    assert.deepEqual((await executeReservedTurn(args)).narration, result.narration);
    assert.equal(calls, 4, "replay uses the effective narration receipt");
  }
});
it("keeps old narration strict and never converts unknown narration sends into fallback", async () => {
  for (const version of ["v6", "v7"] as const) {
    const f = fixture(version); let calls = 0;
    const t = transport(async (_system, _user, options) => {
      calls += 1;
      if (options.label.endsWith("character")) return { actions: [], memory: [] };
      if (options.label.endsWith("adjudication")) return { results: [] };
      if (version === "v7") throw new Error("unknown narration network termination");
      return { lines: [] };
    });
    const args = { battleId: `btl_narration_strict_${version}`, ...f, assets: {}, publicScene: "路地", character: t, adjudication: t, narration: t };
    await assert.rejects(executeReservedTurn(args));
    assert.equal(calls, 4);
    assert.equal(f.runtime().requests.filter((r) => r.failure === "NARRATION_FALLBACK").length, 0);
    if (version === "v7") {
      assert.equal(f.runtime().requests.find((r) => r.role === "narration")?.physicalOutstanding, true);
      await assert.rejects(executeReservedTurn(args), /RESERVED_SEND_NOT_REPLAYABLE/);
      assert.equal(calls, 4);
    }
  }
});
