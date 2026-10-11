// R: Lock priority insertion, Unicode limits and atomic failure for consciousness memory v1.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyConsciousnessMemory, applyConsciousnessMemorySnapshot, ConsciousnessMemoryOperationsSchema, ConsciousnessMemorySchema } from "./consciousness-memory.js";
import { UnifiedConsciousnessDecisionSchema, UnifiedConsciousnessDecisionV2Schema, initializeUnifiedConsciousness, shouldRunUnifiedConsciousness } from "./unified-consciousness.js";
import { UnifiedConsciousnessPolicyV1 } from "./unified-consciousness-policy.js";

describe("consciousness memory v1", () => {
  it("inserts at rank, displaces subsequent entries and drops overflow", () => {
    const original = [1, 2, 3, 4, 5].map((value) => ({ id: String(value), text: String(value) }));
    const result = applyConsciousnessMemory(original, [{ kind: "insert", priority: 2, text: "注意" }], "decision");
    assert.deepEqual(result.map((entry) => entry.id), ["1", "decision:m0", "2", "3", "4"]);
    assert.equal(original.length, 5);
    assert.equal(original[4]?.id, "5");
  });
  it("appends below current length and applies ordered removals", () => {
    assert.deepEqual(applyConsciousnessMemory([], [{ kind: "insert", priority: 5, text: "意図" }, { kind: "remove", id: "d:m0" }], "d"), []);
  });
  it("rejects unknown, repeated and evicted removals without modifying memory", () => {
    const original = [1, 2, 3, 4, 5].map((value) => ({ id: String(value), text: "記憶" }));
    const frozen = structuredClone(original);
    assert.throws(() => applyConsciousnessMemory(original, [{ kind: "insert", priority: 1, text: "新規" }, { kind: "remove", id: "5" }], "d"), /ID_UNKNOWN/);
    assert.throws(() => applyConsciousnessMemory(original, [{ kind: "remove", id: "1" }, { kind: "remove", id: "1" }], "d"), /ID_UNKNOWN/);
    assert.deepEqual(original, frozen);
  });
  it("counts Unicode code points and enforces five slots, ten operations and ranks", () => {
    assert.ok(ConsciousnessMemorySchema.safeParse([{ id: "a", text: "😀".repeat(400) }]).success);
    assert.equal(ConsciousnessMemorySchema.safeParse([{ id: "a", text: "😀".repeat(401) }]).success, false);
    assert.equal(ConsciousnessMemoryOperationsSchema.safeParse([{ kind: "insert", priority: 0, text: "x" }]).success, false);
    assert.equal(ConsciousnessMemoryOperationsSchema.safeParse(Array.from({ length: 11 }, () => ({ kind: "insert", priority: 1, text: "x" }))).success, false);
    assert.equal(ConsciousnessMemorySchema.safeParse(Array.from({ length: 6 }, (_, i) => ({ id: String(i), text: "x" }))).success, false);
  });
  it("accepts silence and optional updates but rejects separated semantic state", () => {
    assert.deepEqual(UnifiedConsciousnessDecisionSchema.parse({}), {});
    assert.ok(UnifiedConsciousnessDecisionSchema.safeParse({ action: null, speech: null }).success);
    assert.equal(UnifiedConsciousnessDecisionSchema.safeParse({ goal: "勝利" }).success, false);
  });
  it("runs initially, on events or after three committed ticks", () => {
    const runtime = initializeUnifiedConsciousness(UnifiedConsciousnessPolicyV1, 0);
    assert.equal(shouldRunUnifiedConsciousness(runtime.sides.a, 0, runtime.policy), true);
    const side = { ...runtime.sides.a, lastDecisionTick: 0 };
    assert.equal(shouldRunUnifiedConsciousness(side, 1, runtime.policy), false);
    assert.equal(shouldRunUnifiedConsciousness(side, 2, runtime.policy), false);
    assert.equal(shouldRunUnifiedConsciousness(side, 3, runtime.policy), true);
    assert.equal(shouldRunUnifiedConsciousness({ ...side, pendingEvents: [{ id: "e", text: "出来事" }] }, 1, runtime.policy), true);
  });
});

describe("consciousness memory output v2", () => {
  const previous = ["意図", "注意", "気づき"].map((text, index) => ({ id: `old${index + 1}`, text }));
  it("resolves swaps against old ranks and combines retention with new text and deletion", () => {
    const before = structuredClone(previous);
    const result = applyConsciousnessMemorySnapshot(previous, ["3", "次は攻撃へ切り替える", "1"], "next");
    assert.deepEqual(result, [previous[2], { id: "next:m1", text: "次は攻撃へ切り替える" }, previous[0]]);
    assert.deepEqual(applyConsciousnessMemorySnapshot(previous, ["2", "1"], "swap"), [previous[1], previous[0]]);
    assert.deepEqual(applyConsciousnessMemorySnapshot(previous, ["1", "2", "3"], "keep"), previous);
    assert.deepEqual(applyConsciousnessMemorySnapshot(previous, [], "clear"), []);
    assert.deepEqual(previous, before);
  });
  it("rejects missing/duplicate old ranks and invalid limits atomically", () => {
    const before = structuredClone(previous);
    assert.throws(() => applyConsciousnessMemorySnapshot(previous, ["新規", "5"], "d"), /RANK_UNKNOWN/);
    assert.throws(() => applyConsciousnessMemorySnapshot(previous, ["2", "2"], "d"), /RANK_DUPLICATE/);
    assert.throws(() => applyConsciousnessMemorySnapshot([], ["1"], "d"), /RANK_UNKNOWN/);
    assert.throws(() => applyConsciousnessMemorySnapshot(previous, Array(6).fill("新規"), "d"));
    assert.throws(() => applyConsciousnessMemorySnapshot(previous, [""], "d"));
    assert.throws(() => applyConsciousnessMemorySnapshot(previous, ["😀".repeat(401)], "d"));
    assert.equal(applyConsciousnessMemorySnapshot([], ["😀".repeat(400)], "d")[0]?.text.length, 800);
    assert.throws(() => applyConsciousnessMemorySnapshot([{ id: "d:m0", text: "前回" }], ["新規"], "d"), /ALREADY_APPLIED/);
    assert.deepEqual(previous, before);
  });
  it("requires the v2 memory field while preserving the historical empty decision", () => {
    assert.equal(UnifiedConsciousnessDecisionV2Schema.safeParse({}).success, false);
    assert.equal(UnifiedConsciousnessDecisionV2Schema.safeParse({ memoryOperations: [] }).success, false);
    assert.equal(UnifiedConsciousnessDecisionV2Schema.safeParse({ memory: null }).success, false);
    assert.equal(UnifiedConsciousnessDecisionV2Schema.safeParse({ memory: [1] }).success, false);
    assert.equal(UnifiedConsciousnessDecisionV2Schema.safeParse({ memory: [], memoryOperations: [] }).success, false);
    assert.deepEqual(UnifiedConsciousnessDecisionV2Schema.parse({ memory: [] }), { memory: [] });
    assert.deepEqual(UnifiedConsciousnessDecisionSchema.parse({}), {});
  });
});
