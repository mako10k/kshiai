import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acceptConsciousDecisionV4, decodeConsciousOutputV4, initialConsciousAgencyV2 } from "./conscious-dynamic.js";
import { decodeConsciousOutputV3 } from "./conscious-agency.js";
import { ConsciousAgencyV1Schema, ConsciousAgencyV2Schema } from "./battle.js";
const facts = [{ ref: "value", kind: "value" as const, sourcePath: "/character" }];
const goal = { statement: "相手を守りつつ技を試す", basisRefs: ["value"] };
const intent = { aim: "安全な距離で誘う", basisRefs: ["value"] };
const accept = (raw: unknown, previous = initialConsciousAgencyV2(), phase: "turn" | "later" | "aftermath" = "turn") => acceptConsciousDecisionV4({
  previous, output: decodeConsciousOutputV4(raw, phase), facts, turn: 1, validateAction: (a) => a.kind === "wait" ? a : null,
});
describe("ADR-0047 versioned mechanical completion", () => {
  it("initializes only from real supplied goal, never from omission or null", () => {
    assert.equal(accept({ intent, nextAction: { kind: "wait" } }).failure, "goal_invalid");
    assert.equal(accept({ initialGoal: null }).state.upperGoal, null);
    const state = accept({ initialGoal: goal }).state;
    assert.deepEqual(state.upperGoal, goal);
    assert.equal(state.latestDecision, null);
  });
  it("keeps goal and old decision without creating new intent for omissions", () => {
    const previous = accept({ initialGoal: goal, intent, nextAction: { kind: "wait" } }).state;
    const result = accept({}, previous);
    assert.equal(result.acceptedDecision, false);
    assert.deepEqual(result.state, previous);
    assert.equal(accept({ initialGoal: goal }, previous).failure, "goal_replacement");
    assert.equal(accept({ nextAction: { kind: "wait" } }, previous).failure, "intent_invalid");
  });
  it("allows optional omission/null but retains their origin and rejects non-null invalid", () => {
    const omitted = decodeConsciousOutputV4({}, "turn");
    const explicit = decodeConsciousOutputV4({ nextUtterance: null }, "turn");
    assert.deepEqual(omitted.nextUtterance, explicit.nextUtterance);
    assert.equal(omitted.origins.nextUtterance, "omitted");
    assert.equal(explicit.origins.nextUtterance, "explicit_null");
    assert.equal(decodeConsciousOutputV4({ nextUtterance: 9 }, "turn").nextUtterance.valid, false);
  });
  it("requires current refs and concrete later action, without borrowing old intent", () => {
    const previous = accept({ initialGoal: goal, intent, nextAction: { kind: "wait" } }).state;
    assert.equal(accept({ intent, nextAction: null }, previous, "later").failure, "action_required");
    assert.equal(accept({ nextAction: { kind: "wait" } }, previous, "later").failure, "intent_invalid");
    assert.equal(accept({ intent: { ...intent, basisRefs: ["old-ref"] }, nextAction: { kind: "wait" } }, previous).failure, "intent_invalid");
    assert.equal(accept({ intent, nextAction: { kind: "rest" } }, previous).failure, "action_invalid");
  });
  it("pins the new state separately; old rationale and decoding remain strict", () => {
    const state = accept({ initialGoal: goal, intent, nextAction: { kind: "wait" } }).state;
    assert.equal(ConsciousAgencyV2Schema.safeParse(state).success, true);
    assert.equal(ConsciousAgencyV1Schema.safeParse({ ...state, schemaVersion: 1 }).success, false);
    const legacy = decodeConsciousOutputV3({ intent, nextAction: { kind: "wait" } }, "turn");
    assert.ok(legacy.envelopeValid && legacy.phase === "turn");
    assert.deepEqual(legacy.initialGoal, { valid: false, reason: "missing" });
    assert.equal(legacy.intent.valid, false);
  });
});
