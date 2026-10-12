import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBattleWorldState } from "./battle-world.js";
import { createBattleSemanticState } from "./semantic-state.js";
import { ReservedTurnPlanSchema, ReservedTurnRuntimeSchema, initializeReservedTurns, ReservedTurnPolicySchema, orderReservedActions, applyReservedTurnTrace, validateReservedPlan, type ReservedTurnWorld, type ReservedTurnPlan } from "./reserved-turns.js";
function world(): ReservedTurnWorld {
  const actor = { hp: 20, maxHp: 20, mp: 10, maxMp: 10, stamina: 10, maxStamina: 10, initiative: 10 };
  return { turn: 1, revision: 0, actors: { a: { ...actor }, b: { ...actor } }, world: createBattleWorldState({ semanticState: createBattleSemanticState({ scene: "路地", sideA: { displayName: "A" }, sideB: { displayName: "B" } }) }) };
}
function plan(count = 1): ReservedTurnPlan {
  return { memory: [], actions: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, intent: "相手へ働きかける", targets: ["opponent"] })) };
}
function result(reservationId: string, side: "a" | "b", baseRevision: number, delta = -3) {
  return { reservationId, side, baseRevision, outcome: "success", reason: "打撃が届いた", updates: [{ kind: "resource", side: side === "a" ? "b" : "a", resource: "hp", delta }], observations: { a: ["打撃が届いた"], b: ["打撃が届いた"], public: ["打撃が届いた"] } };
}
function effectWorld(value: ReservedTurnWorld["world"]): string {
  return JSON.stringify({ ...value, revision: 0 });
}
describe("reserved-turn pipeline v1", () => {
  it("allows information-only success and partial in output v2 while preserving output v1", () => {
    const start = world();
    const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(), b: plan(0) });
    for (const outcome of ["success", "partial"]) {
      const observation = { ...result("a:r0", "a", 0), outcome, updates: [], observations: { a: ["相手の踏み込みを見極めた"], b: [], public: [] } };
      const resolved = applyReservedTurnTrace(start, order, { results: [observation] }, "reserved-turn-output-v2");
      assert.deepEqual(resolved.state.actors, start.actors);
      assert.equal(effectWorld(resolved.state.world), effectWorld(start.world));
      assert.equal(resolved.state.revision, 1);
      assert.equal(resolved.state.turn, 2);
      assert.deepEqual(resolved.trace.results[0]?.observations.a, observation.observations.a);
      assert.throws(() => applyReservedTurnTrace(start, order, { results: [observation] }), /concrete consequences/);
      assert.throws(() => applyReservedTurnTrace(start, order, { results: [{ ...observation, observations: { a: [], b: [], public: [] } }] }, "reserved-turn-output-v2"), /consequences or observations/);
    }
  });
  it("keeps cancelled mutations, resource overflow and fake patches invalid in output v2", () => {
    const start = world(); const original = structuredClone(start);
    const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(), b: plan(0) });
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [{ ...result("a:r0", "a", 0), outcome: "cancelled" }] }, "reserved-turn-output-v2"), /cannot mutate/);
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [result("a:r0", "a", 0, -21)] }, "reserved-turn-output-v2"), /RESOURCE_RANGE/);
    const noOp = { ...result("a:r0", "a", 0), updates: [{ kind: "world", operation: { op: "set_actor_state", entityId: "character.a", changes: { consciousness: "alert" } } }] };
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [noOp] }, "reserved-turn-output-v2"), /EFFECT_EMPTY/);
    assert.deepEqual(start, original);
  });
  it("validates saved prepared and last traces against their frozen legacy policy", () => {
    const policy = ReservedTurnPolicySchema.parse({ revision: "reserved-turn-policy-v4", maxTurns: 36, maxReservations: 5, maxLogicalCallsPerTurn: 4, maxPhysicalAttempts: 200,
      durationMs: 1800000, deadlineMs: 120000, adjudicationDeadlineMs: 300000, softDurationMs: 600000, softDeadlineMs: 60000, softAdjudicationDeadlineMs: 180000,
      characterOutputTokens: 2000, adjudicationOutputTokens: 10000, inputCharacters: 128000, character: { provider: "test", model: "test" }, adjudication: { provider: "test", model: "test" }, narration: { provider: "test", model: "test" } });
    const runtime = initializeReservedTurns(policy, 0);
    const trace = { results: [{ ...result("a:r0", "a", 0), updates: [] }] };
    assert.ok(ReservedTurnRuntimeSchema.safeParse({ ...runtime, lastTrace: trace }).success);
    const legacy = { ...runtime, policy: { ...policy, revision: "reserved-turn-policy-v3" } };
    assert.equal(ReservedTurnRuntimeSchema.safeParse({ ...legacy, lastTrace: trace }).success, false);
    const request = { id: "r", turn: 1, role: "adjudication", side: null, inputDigest: "digest", system: "system", user: "user", status: "prepared", output: { role: "adjudication", trace }, rawResponse: "{}", physicalOutstanding: false, failure: null };
    assert.ok(ReservedTurnRuntimeSchema.safeParse({ ...runtime, requests: [request] }).success);
    assert.equal(ReservedTurnRuntimeSchema.safeParse({ ...legacy, requests: [request] }).success, false);
  });

  it("accepts zero or five reservations and rejects six or duplicate IDs", () => {
    assert.ok(ReservedTurnPlanSchema.safeParse(plan(0)).success);
    assert.ok(ReservedTurnPlanSchema.safeParse(plan(5)).success);
    assert.equal(ReservedTurnPlanSchema.safeParse(plan(6)).success, false);
    assert.equal(ReservedTurnPlanSchema.safeParse({ ...plan(), actions: [plan().actions[0], plan().actions[0]] }).success, false);
  });
  it("interleaves plans without starving the slower side and alternates exact ties", () => {
    const plans = { a: plan(2), b: plan(2) };
    assert.deepEqual(orderReservedActions(1, { a: 20, b: 10 }, plans).map((r) => r.reservationId), ["a:r0", "b:r0", "a:r1", "b:r1"]);
    assert.equal(orderReservedActions(2, { a: 10, b: 10 }, plans)[0]?.side, "b");
    assert.equal(orderReservedActions(3, { a: 10, b: 10 }, plans)[0]?.side, "a");
  });
  it("validates all frozen rank references and observer-visible targets before dispatch", () => {
    const memory = [{ id: "old", text: "前の考え" }];
    assert.deepEqual(validateReservedPlan({ ...plan(), memory: ["1"] }, memory, new Set(["opponent"]), "d").memory, ["1"]);
    assert.throws(() => validateReservedPlan({ ...plan(), memory: ["2"] }, memory, new Set(["opponent"]), "d"));
    assert.throws(() => validateReservedPlan(plan(), [], new Set(), "d"), /UNKNOWN_REFERENCE/);
  });
  it("applies both attacks to successive canonical states and advances one turn", () => {
    const start = world(); const original = structuredClone(start);
    const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(), b: plan() });
    const resolved = applyReservedTurnTrace(start, order, { results: [result("a:r0", "a", 0), result("b:r0", "b", 1)] });
    assert.equal(resolved.state.actors.a.hp, 17); assert.equal(resolved.state.actors.b.hp, 17);
    assert.equal(resolved.state.turn, 2); assert.equal(resolved.state.revision, 2); assert.deepEqual(start, original);
  });
  it("cancels later actions after defeat instead of executing stale intentions", () => {
    const start = world(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(), b: plan() });
    const cancelled = { ...result("b:r0", "b", 1), outcome: "cancelled", updates: [], reason: "先行打撃で戦闘不能" };
    assert.equal(applyReservedTurnTrace(start, order, { results: [result("a:r0", "a", 0, -20), cancelled] }).state.actors.b.hp, 0);
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [result("a:r0", "a", 0, -20), result("b:r0", "b", 1)] }), /INCAPACITATED/);
  });
  it("rejects missing, invented, reordered or stale receipts atomically", () => {
    const start = world(); const original = structuredClone(start);
    const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(), b: plan() });
    for (const results of [[result("a:r0", "a", 0)], [result("b:r0", "b", 0), result("a:r0", "a", 1)], [result("a:r0", "a", 0), result("b:r0", "b", 0)], [result("a:r0", "a", 0), result("b:invented", "b", 1)]]) {
      assert.throws(() => applyReservedTurnTrace(start, order, { results })); assert.deepEqual(start, original);
    }
  });
  it("permits failed attempts with costs but refuses empty success and out-of-range side effects", () => {
    const start = world(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(), b: plan(0) });
    const failed = { ...result("a:r0", "a", 0), outcome: "failure", updates: [{ kind: "resource", side: "a", resource: "stamina", delta: -2 }] };
    assert.equal(applyReservedTurnTrace(start, order, { results: [failed] }).state.actors.a.stamina, 8);
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [{ ...failed, outcome: "success", updates: [] }] }));
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [result("a:r0", "a", 0, -21)] }), /RESOURCE_RANGE/);
    const noOp = { ...result("a:r0", "a", 0), updates: [{ kind: "world", operation: { op: "set_actor_state", entityId: "character.a", changes: { consciousness: "alert" } } }] };
    assert.throws(() => applyReservedTurnTrace(start, order, { results: [noOp] }), /EFFECT_EMPTY/, "world revision alone is not a successful effect");
  });
});
