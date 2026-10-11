import assert from "node:assert/strict";
import { zodToJsonSchema } from "openai/_vendor/zod-to-json-schema/index";
import { describe, it } from "node:test";
import { createBattleWorldState, createBattleSemanticState, initializeReservedTurns, ReservedTurnRuntimeSchema,
  ReservedTurnTraceSchema, ReservedTurnPolicySchema, orderReservedActions, type ReservedTurnRuntime, type ReservedTurnWorld } from "@kshiai/shared";
import { executeReservedTurn, type ReservedExecutionPort } from "./reserved-turn-execution.js";
import { compactReservedAdjudicationSchema, reservedAdjudicationSystem, reservedAdjudicationUser } from "../llm/reserved-turns.js";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
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
    const policy = f.runtime().policy;
    if (policy.revision !== "reserved-turn-policy-v3") throw new Error("expected policy v3");
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
    assert.equal(current.revision, "reserved-turn-policy-v3");
    if (current.revision !== "reserved-turn-policy-v3") throw new Error("expected policy v3");
    const { softDurationMs: _duration, softDeadlineMs: _role, softAdjudicationDeadlineMs: _judge, ...hard } = current;
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
    if (policy.revision !== "reserved-turn-policy-v3") throw new Error("expected policy v3");
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
  if (policy.revision !== "reserved-turn-policy-v3") throw new Error("expected policy v3");
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
  if (policy.revision !== "reserved-turn-policy-v3") throw new Error("expected policy v3");
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
