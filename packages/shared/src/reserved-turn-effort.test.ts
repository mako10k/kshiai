import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CurrentActionEffortPolicyV1 } from "./action-effort-policy.js";
import { createBattleWorldState } from "./battle-world.js";
import { createBattleSemanticState } from "./semantic-state.js";
import { ReservedTurnPlanSchema, ReservedTurnPlanV2Schema, orderReservedActions, type ReservedTurnWorld } from "./reserved-turns.js";
import { applyReservedEffortTrace, type ReservedEffortContext } from "./reserved-turn-effort.js";
function fixture() {
  const actor = { hp: 30, maxHp: 30, mp: 10, maxMp: 10, stamina: 30, maxStamina: 30, initiative: 10 };
  const start: ReservedTurnWorld = { turn: 1, revision: 0, actors: { a: { ...actor }, b: { ...actor } }, world: createBattleWorldState({ semanticState: createBattleSemanticState({ scene: "路地", sideA: { displayName: "A" }, sideB: { displayName: "B" } }) }) };
  const context: ReservedEffortContext = { state: { a: { key: "", count: 0, exposure: null }, b: { key: "", count: 0, exposure: null } }, actors: {
    a: { policy: CurrentActionEffortPolicyV1, skills: [{ id: "costly", name: "技", description: "技", costMp: 6, costStamina: 5, power: 1, kind: "attack" }], defense: 10 },
    b: { policy: CurrentActionEffortPolicyV1, skills: [], defense: 10 },
  } };
  return { start, context };
}
function plan(count: number, kind: "basic_attack" | "free_action" | "skill" = "basic_attack") {
  return ReservedTurnPlanV2Schema.parse({ memory: [], actions: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, intent: "相手へ手を伸ばす", targets: ["opponent"], mechanics: kind === "skill" ? { kind, skillId: "costly" } : { kind } })) });
}
function receipts(order: ReturnType<typeof orderReservedActions>) {
  return { results: order.map((item, index) => ({ reservationId: item.reservationId, side: item.side, baseRevision: index,
    outcome: "success", attempted: true, penalty: null, reason: "届いた", updates: [{ kind: "resource", side: item.side === "a" ? "b" : "a", resource: "hp", delta: -1 }],
    observations: { a: ["動きを感じた"], b: ["動きを感じた"], public: ["攻防が続いた"] } })) };
}
describe("reserved action effort contract v1", () => {
  it("applies normal and2/4 repetition costs once and replays the effective trace exactly", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(5), b: plan(0) });
    const result = applyReservedEffortTrace(start, order, receipts(order), context);
    assert.equal(result.state.actors.a.stamina, 3);
    assert.equal(result.state.actors.b.hp, 25);
    assert.deepEqual(result.trace.results.map((item) => item.effortApplied?.paidStamina), [3, 5, 5, 7, 7]);
    assert.deepEqual(applyReservedEffortTrace(start, order, result.trace, context), result);
  });
  it("rejects a later unaffordable skill without negative resources or charging the failed slot", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(2, "skill"), b: plan(0) });
    const result = applyReservedEffortTrace(start, order, receipts(order), context);
    assert.equal(result.state.actors.a.mp, 4);
    assert.equal(result.state.actors.a.stamina, 25);
    assert.equal(result.state.actors.b.hp, 29);
    assert.equal(result.trace.results[1]?.outcome, "failure");
    assert.equal(result.trace.results[1]?.attempted, false);
  });
  it("does not add repetition costs to repeated free-action prose", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(5, "free_action"), b: plan(0) });
    const result = applyReservedEffortTrace(start, order, receipts(order), context);
    assert.equal(result.state.actors.a.stamina, 30);
  });
  it("binds extra fatigue to the actual quote/world and does not double-charge replay", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(1, "free_action"), b: plan(0) });
    const raw = receipts(order); const first = raw.results[0]; assert.ok(first);
    const penalty = { kind: "extra_stamina", baseWorldRevision: start.world.revision, level: "substantial", reason: "無理な伸び", actionQuote: "手を伸ばす" };
    const result = applyReservedEffortTrace(start, order, { results: [{ ...first, penalty }] }, context);
    assert.equal(result.state.actors.a.stamina, 26);
    assert.deepEqual(applyReservedEffortTrace(start, order, result.trace, context), result);
    assert.throws(() => applyReservedEffortTrace(start, order, { results: [{ ...first, penalty: { ...penalty, actionQuote: "別の行動" } }] }, context), /PENALTY_BINDING/);
  });
  it("consumes existing defense exposure on only the next incoming attack", () => {
    const { start, context } = fixture(); context.state.b.exposure = { actionId: "earlier", reduction: 0.2, reason: "体勢の隙" };
    const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(2), b: plan(0) });
    const result = applyReservedEffortTrace(start, order, receipts(order), context);
    assert.deepEqual(result.trace.results.map((item) => item.effortApplied?.consumedExposure), [true, false]);
    assert.equal(result.effortState.b.exposure, null);
  });
  it("does not charge unattempted/cancelled reservations or reset counts on an unattempted slot", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(1), b: plan(0) });
    const first = receipts(order).results[0]; assert.ok(first);
    const result = applyReservedEffortTrace(start, order, { results: [{ ...first, attempted: false, outcome: "failure", updates: [] }] }, context);
    assert.equal(result.state.actors.a.stamina, 30); assert.equal(result.effortState.a.count, 0);
  });
  it("enforces partial and unexecuted penalties against original update indexes", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(1, "free_action"), b: plan(0) });
    const first = receipts(order).results[0]; assert.ok(first);
    const penalty = { kind: "execution_limit", baseWorldRevision: start.world.revision, level: "light", reason: "届く範囲のみ", actionQuote: "手を伸ばす", execution: "partial", executedDescription: "手を伸ばす", appliedChangeIndexes: [1] };
    const raw = { results: [{ ...first, updates: [{ kind: "resource", side: "a", resource: "stamina", delta: -1 }, ...first.updates], penalty }] };
    const partial = applyReservedEffortTrace(start, order, raw, context);
    assert.equal(partial.trace.results[0]?.outcome, "partial");
    assert.equal(partial.state.actors.b.hp, 29);
    assert.equal(partial.state.actors.a.stamina, 30);
    assert.deepEqual(applyReservedEffortTrace(start, order, partial.trace, context), partial);
    const failed = applyReservedEffortTrace(start, order, { results: [{ ...first, penalty: { ...penalty, execution: "not_executed", appliedChangeIndexes: [] } }] }, context);
    assert.equal(failed.trace.results[0]?.outcome, "failure"); assert.equal(failed.state.actors.b.hp, 30);
  });
  it("repairs server-owned ordering/side/revision metadata without inventing missing reservations", () => {
    const { start, context } = fixture(); const order = orderReservedActions(1, { a: 10, b: 10 }, { a: plan(2), b: plan(0) });
    const raw = receipts(order);
    const expected = applyReservedEffortTrace(start, order, raw, context);
    assert.deepEqual(applyReservedEffortTrace(start, order, { results: raw.results.reverse().map((result) => ({ ...result, side: "b", baseRevision: 999 })) }, context), expected);
    assert.throws(() => applyReservedEffortTrace(start, order, { results: [raw.results[0], raw.results[0]] }, context), /IDENTITY_MISMATCH/);
  });
  it("keeps old plans strict and requires typed mechanics only on the new plan", () => {
    const typed = plan(1);
    assert.equal(ReservedTurnPlanSchema.safeParse(typed).success, false);
    assert.equal(ReservedTurnPlanV2Schema.safeParse({ memory: [], actions: [{ id: "r", intent: "動く", targets: ["self"] }] }).success, false);
  });
});
