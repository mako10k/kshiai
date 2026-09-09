import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConsciousAgencyV1Schema, ConsciousGoalV1Schema, ConsciousIntentV1Schema,
  CharacterAgentStateSchema,
} from "./battle.js";
import {
  acceptConsciousDecisionV3, decodeConsciousOutputV3, initialConsciousAgencyV1,
  AgencyFactsV1Schema, type AgencyFactV1,
} from "./conscious-agency.js";

const facts: AgencyFactV1[] = [
  { ref: "personality", kind: "value", sourcePath: "/structuredSelf/tendencies/0" },
  { ref: "relationship", kind: "relationship", sourcePath: "/structuredSelf/relationship" },
  { ref: "action", kind: "candidate", sourcePath: "/decision/availableActions/0" },
];
const goal = { statement: "相手を傷つけず技を試す", basisRefs: ["personality", "relationship"] };
const intent = { aim: "安全な距離で誘う", rationale: "相手との関係を守りながら機会を作る", basisRefs: ["action"] };
function response() {
  return { initialGoal: goal, intent, nextAction: { kind: "wait" }, nextUtterance: "来てみて。", realizedManifestation: null };
}
function accept(raw: unknown, previous = initialConsciousAgencyV1(), phase: "prologue" | "turn" | "later" | "aftermath" = "turn") {
  return acceptConsciousDecisionV3({
    previous, output: decodeConsciousOutputV3(raw, phase), facts, turn: 1,
    validateAction: (action) => action.kind === "wait" ? action : null,
  });
}

describe("ADR-0028 closed conscious state and partial acceptance", () => {
  it("preserves legacy absence without injecting a new goal", () => {
    assert.equal(Object.hasOwn(CharacterAgentStateSchema.parse({}), "consciousAgencyV1"), false);
  });
  it("initializes and returns typed goal/decision without mutating previous state", () => {
    const previous = initialConsciousAgencyV1();
    const result = accept(response(), previous);
    assert.equal(result.acceptedDecision, true);
    assert.deepEqual(result.state.upperGoal, goal);
    assert.equal(result.state.latestDecision?.action?.kind, "wait");
    assert.equal(previous.upperGoal, null);
    assert.deepEqual(CharacterAgentStateSchema.parse({ consciousAgencyV1: result.state }).consciousAgencyV1, result.state);
  });
  it("trims strings and rejects blank, overlong and duplicated refs", () => {
    assert.equal(ConsciousGoalV1Schema.parse({ ...goal, statement: " 勝つ " }).statement, "勝つ");
    assert.equal(ConsciousGoalV1Schema.safeParse({ ...goal, statement: " " }).success, false);
    assert.equal(ConsciousGoalV1Schema.safeParse({ ...goal, statement: "a".repeat(241) }).success, false);
    assert.equal(ConsciousGoalV1Schema.safeParse({ ...goal, basisRefs: ["a", " a "] }).success, false);
    assert.equal(ConsciousIntentV1Schema.safeParse({ ...intent, aim: "a".repeat(161) }).success, false);
    assert.equal(ConsciousIntentV1Schema.safeParse({ ...intent, rationale: "a".repeat(241) }).success, false);
  });
  it("rejects decisions without a goal and extra state keys", () => {
    const state = accept(response()).state;
    assert.equal(ConsciousAgencyV1Schema.safeParse({ ...state, upperGoal: null }).success, false);
    assert.equal(ConsciousAgencyV1Schema.safeParse({ ...state, authorConfirmed: true }).success, false);
  });
  it("rejects extra envelope keys and phase-forbidden writes before all fields", () => {
    assert.equal(accept({ ...response(), authorConfirmed: true }).failure, "envelope_invalid");
    assert.equal(accept(response(), initialConsciousAgencyV1(), "aftermath").failure, "envelope_invalid");
    assert.equal(accept(response(), initialConsciousAgencyV1(), "later").failure, "envelope_invalid");
    assert.equal(accept([]).failure, "envelope_invalid");
    assert.equal(accept(null).failure, "envelope_invalid");
  });
  for (const initialGoal of [null, undefined, { ...goal, basisRefs: ["missing"] }, { ...goal, basisRefs: ["action"] }]) {
    it("keeps an invalid initial goal uninitialized while decoding independent speech", () => {
      const raw = { ...response(), initialGoal };
      assert.equal(accept(raw).failure, "goal_invalid");
      assert.equal(accept(raw).state.upperGoal, null);
      const decoded = decodeConsciousOutputV3(raw, "turn");
      assert.ok(decoded.envelopeValid && decoded.phase === "turn");
      assert.deepEqual(decoded.nextUtterance, { valid: true, value: "来てみて。" });
    });
  }
  it("retains a valid new goal when intent is invalid", () => {
    const result = accept({ ...response(), intent: { ...intent, basisRefs: ["missing"] } });
    assert.equal(result.failure, "intent_invalid");
    assert.deepEqual(result.state.upperGoal, goal);
    assert.equal(result.state.latestDecision, null);
  });
  it("rejects unavailable or malformed action and its intent, without losing the initial goal", () => {
    for (const nextAction of [{ kind: "rest" }, { kind: "nonexistent" }, undefined]) {
      const result = accept({ ...response(), nextAction });
      assert.equal(result.failure, "action_invalid");
      assert.deepEqual(result.state.upperGoal, goal);
      assert.equal(result.state.latestDecision, null);
    }
  });
  it("accepts null action and null speech as a proposal, not a realized utterance", () => {
    const result = accept({ ...response(), nextAction: null, nextUtterance: null });
    assert.equal(result.acceptedDecision, true);
    assert.equal(result.state.latestDecision?.action, null);
  });
  it("preserves the initial goal across a second judgment and old refs across fact sets", () => {
    const first = accept(response()).state;
    const second = acceptConsciousDecisionV3({
      previous: first, output: decodeConsciousOutputV3({ ...response(), initialGoal: null }, "turn"),
      facts: [facts[2]!], turn: 2, validateAction: (action) => action,
    });
    assert.equal(second.acceptedDecision, true);
    assert.deepEqual(second.state.upperGoal, goal);
    assert.equal(second.state.latestDecision?.turn, 2);
  });
  it("rejects initial goal replacement even when its text is identical", () => {
    const previous = accept(response()).state;
    assert.equal(accept(response(), previous).failure, "goal_replacement");
    assert.deepEqual(accept(response(), previous).state, previous);
  });
  it("does not carry old accepted intent into later fallback", () => {
    const previous = accept(response()).state;
    for (const nextAction of [null, undefined, { kind: "rest" }]) {
      const result = accept({ intent, nextAction }, previous, "later");
      assert.equal(result.acceptedDecision, false);
      assert.equal(result.failure, "action_invalid");
      assert.deepEqual(result.state, previous);
    }
  });
  it("later updates only accepted intent/action and preserves the goal", () => {
    const previous = accept(response()).state;
    const result = accept({ intent, nextAction: { kind: "wait" } }, previous, "later");
    assert.equal(result.acceptedDecision, true);
    assert.deepEqual(result.state.upperGoal, previous.upperGoal);
    assert.equal(result.state.latestDecision?.phase, "later");
  });
  it("aftermath cannot update agency state", () => {
    const previous = accept(response()).state;
    assert.deepEqual(accept({ nextUtterance: null, realizedManifestation: null }, previous, "aftermath").state, previous);
  });
  it("rejects malformed speech independently from valid action/intent", () => {
    const raw = { ...response(), nextUtterance: 123 };
    assert.equal(accept(raw).acceptedDecision, true);
    const decoded = decodeConsciousOutputV3(raw, "turn");
    assert.ok(decoded.envelopeValid && decoded.phase === "turn");
    assert.deepEqual(decoded.nextUtterance, { valid: false, reason: "schema_invalid" });
  });
  it("preserves same-text speech occurrences without a reuse classifier", () => {
    const raw = response();
    assert.deepEqual(decodeConsciousOutputV3(raw, "turn"), decodeConsciousOutputV3(raw, "turn"));
  });
  it("bounds server facts and rejects duplicate refs", () => {
    assert.equal(AgencyFactsV1Schema.safeParse([...facts, facts[0]]).success, false);
    assert.equal(AgencyFactsV1Schema.safeParse(Array.from({ length: 129 }, (_, i) => ({ ...facts[0], ref: String(i) }))).success, false);
  });
});
