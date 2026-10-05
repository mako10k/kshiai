// R: Verify absent awareness intents advance time without fabricated character actions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BattleTurnEngineContinuationSchema } from "./battle.js";
import { createBattleState, resolveTurn, prepareBattleTurnExecution, resolveBattleTurnBucket, finalizeBattleTurnExecution } from "./battle-engine.js";
import { defaultBasicAttack, defaultParameters, requireCombatReadyCharacterSheet } from "./character.js";

function character(id: string) {
  const timestamp = "2026-10-05T06:00:00.000Z";
  return requireCombatReadyCharacterSheet({ id, ownerUserId: "owner", displayName: id, tags: [],
    createdAt: timestamp, updatedAt: timestamp, appearance: { summary: "試験", visualPrompt: "test" },
    traits: [], parameters: defaultParameters(), skills: [], basicAttack: defaultBasicAttack(), weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false }, narrativeBlurb: "試験用" });
}

function input() {
  const a = character("a"); const b = character("b");
  return { state: createBattleState({ id: "absence", sideA: a, sideB: b, turnLimit: 12, prologuePending: false }),
    sideASkills: [], sideBSkills: [], sideABasicAttack: a.basicAttack, sideBBasicAttack: b.basicAttack };
}

describe("awareness absence in deterministic engine", () => {
  it("advances a full temporal turn with no chosen actions, damage, recovery, or stance event", () => {
    const initial = input();
    initial.state.plannedActionA = { kind: "defend" };
    initial.state.plannedActionB = { kind: "basic_attack" };
    assert.ok(initial.state.supervisor);
    initial.state.supervisor.passiveTurns = 3;
    let normCalls = 0;
    const result = resolveTurn({ ...initial, absentIntentSides: ["a", "b"],
      resolveNormConstraint() { normCalls += 1; return undefined; } });
    assert.equal(result.state.turn, initial.state.turn + 1);
    assert.deepEqual(result.actions, []);
    assert.equal(result.state.sideA.parameters.hp, initial.state.sideA.parameters.hp);
    assert.equal(result.state.sideB.parameters.hp, initial.state.sideB.parameters.hp);
    assert.deepEqual(result.mechanicalEvidence, []);
    assert.equal(result.events.some((event) => ("sourceActionId" in event && event.sourceActionId) || event.actorSide), false);
    assert.equal(normCalls, 0);
    assert.ok(result.bucketCommits?.length);
    assert.equal(result.bucketCommits?.every((commit) => commit.actions.length === 0), true);
  });

  it("lets the other actor attack without selecting any substitute for an absent actor", () => {
    const initial = input();
    initial.state.plannedActionB = { kind: "basic_attack" };
    const result = resolveTurn({ ...initial, absentIntentSides: ["a"] });
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0]?.actorSide, "b");
    assert.equal(result.actions[0]?.executed, true);
    const actualHp = result.state.sideA.parameters.hp;
    const originalHp = initial.state.sideA.parameters.hp;
    assert.equal(typeof actualHp, "number");
    assert.equal(typeof originalHp, "number");
    assert.ok(actualHp !== undefined && originalHp !== undefined && actualHp < originalHp);
    assert.equal(result.state.sideB.parameters.hp, initial.state.sideB.parameters.hp);
    assert.equal(result.events.some((event) => event.actorSide === "a" && "sourceActionId" in event && event.sourceActionId), false);
  });

  it("keeps legacy undefined-planned actions on their established selection route", () => {
    const initial = input();
    const result = resolveTurn(initial);
    assert.equal(result.actions.length, 2);
    assert.equal(result.actions.every((action) => action.selection?.plannedActionDisposition === "absent"), true);
    assert.equal(result.actions.some((action) => action.executed), true);
  });

  it("persists actual absence through every restart bucket without requiring the caller's original option", () => {
    const initial = input();
    const prepared = prepareBattleTurnExecution({ ...initial, absentIntentSides: ["a", "b"] });
    assert.ok(prepared);
    let continuation = BattleTurnEngineContinuationSchema.parse(JSON.parse(JSON.stringify(prepared)));
    assert.deepEqual(continuation.actions, []);
    assert.deepEqual(continuation.absentIntentSides, ["a", "b"]);
    while (continuation.nextBucketIndex < continuation.temporalResolution.buckets.length) {
      const next = resolveBattleTurnBucket({ ...initial, engineContinuation: continuation });
      assert.deepEqual(next.commit.actions, []);
      assert.equal(next.commit.events.some((event) => "sourceActionId" in event && event.sourceActionId), false);
      continuation = BattleTurnEngineContinuationSchema.parse(JSON.parse(JSON.stringify(next.continuation)));
    }
    const final = finalizeBattleTurnExecution({ ...initial, engineContinuation: continuation });
    assert.deepEqual(final.actions, []);
    assert.equal(final.state.sideA.parameters.hp, initial.state.sideA.parameters.hp);
    assert.equal(final.state.sideB.parameters.hp, initial.state.sideB.parameters.hp);
    assert.equal(final.state.turn, initial.state.turn + 1);
  });

  it("rejects a missing action that was not explicitly declared absent", () => {
    const prepared = prepareBattleTurnExecution(input());
    assert.ok(prepared);
    assert.equal(BattleTurnEngineContinuationSchema.safeParse({ ...prepared, actions: [] }).success, false);
    assert.equal(BattleTurnEngineContinuationSchema.safeParse({ ...prepared, absentIntentSides: ["a", "a"] }).success, false);
  });

  it("can remove a future admitted intent without erasing the already committed predecessor", () => {
    const initial = input();
    initial.state.sideA.parameters.spd = 20;
    initial.state.sideB.parameters.spd = 5;
    initial.state.plannedActionA = { kind: "basic_attack" };
    initial.state.plannedActionB = { kind: "basic_attack" };
    const prepared = prepareBattleTurnExecution(initial);
    assert.ok(prepared);
    const first = resolveBattleTurnBucket({ ...initial, engineContinuation: prepared });
    const committed = first.continuation.actions.find((action) => action.actorSide === "a");
    assert.ok(committed?.executed);
    const second = resolveBattleTurnBucket({ ...initial, engineContinuation: first.continuation,
      absentIntentSides: ["a", "b"] });
    assert.deepEqual(second.commit.actions, []);
    assert.deepEqual(second.continuation.actions, [committed]);
    assert.deepEqual(second.continuation.absentIntentSides, ["b"]);
    const final = finalizeBattleTurnExecution({ ...initial, engineContinuation: second.continuation });
    assert.deepEqual(final.actions, [committed]);
    assert.equal(final.state.sideA.parameters.hp, initial.state.sideA.parameters.hp);
  });

  it("preserves an explicit wait despite passive pressure and an unrelated player override", () => {
    const initial = input();
    initial.state.plannedActionA = { kind: "wait" };
    assert.ok(initial.state.supervisor);
    initial.state.supervisor.passiveTurns = 3;
    const result = resolveTurn({ ...initial, strictCharacterIntents: true, absentIntentSides: ["b"],
      playerAction: { actorSide: "a", kind: "basic_attack" } });
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0]?.kind, "wait");
    assert.equal(result.actions[0]?.selection?.sourceLayer, "planned_action");
    assert.equal(result.state.sideB.parameters.hp, initial.state.sideB.parameters.hp);
    assert.equal(result.events.some((event) => event.summary.includes("膠着打破")), false);
  });

  it("preserves a repeated selected attack without selecting a variety policy", () => {
    const initial = input();
    initial.state.plannedActionA = { kind: "basic_attack" };
    assert.ok(initial.state.dramaState);
    initial.state.dramaState.lastActionSignatureA = "basic_attack";
    initial.state.dramaState.repeatedActionA = 3;
    const result = resolveTurn({ ...initial, strictCharacterIntents: true, absentIntentSides: ["b"] });
    assert.equal(result.actions[0]?.kind, "basic_attack");
    assert.equal(result.actions[0]?.selection?.plannedActionDisposition, "accepted");
    assert.equal(result.actions[0]?.selection?.sourceLayer, "planned_action");
  });

  it("omits a norm-rejected intent instead of executing the norm fallback", () => {
    const initial = input();
    initial.state.plannedActionA = { kind: "basic_attack" };
    const result = resolveTurn({ ...initial, strictCharacterIntents: true, absentIntentSides: ["b"],
      sideANormConstraint: { allowedActionKeys: ["defend"], fallback: { kind: "defend" } } });
    assert.deepEqual(result.actions, []);
    assert.deepEqual(result.mechanicalEvidence, []);
    assert.equal(result.events.some((event) => event.actorSide), false);
    assert.equal(result.state.sideB.parameters.hp, initial.state.sideB.parameters.hp);
  });

  it("omits a mechanically unavailable skill instead of choosing rest or defense", () => {
    const initial = input();
    initial.state.plannedActionA = { kind: "skill", skillId: "unavailable" };
    const result = resolveTurn({ ...initial, strictCharacterIntents: true, absentIntentSides: ["b"] });
    assert.deepEqual(result.actions, []);
    assert.deepEqual(result.mechanicalEvidence, []);
    assert.equal(result.events.some((event) => event.actorSide), false);
  });

  it("retains strict selection during a durable restart even if the caller omits the flag", () => {
    const initial = input();
    initial.state.plannedActionA = { kind: "wait" };
    assert.ok(initial.state.supervisor);
    initial.state.supervisor.passiveTurns = 3;
    const prepared = prepareBattleTurnExecution({ ...initial, strictCharacterIntents: true, absentIntentSides: ["b"] });
    assert.ok(prepared);
    const resumedState = { ...initial.state, plannedActionA: undefined };
    let continuation = BattleTurnEngineContinuationSchema.parse(JSON.parse(JSON.stringify(prepared)));
    while (continuation.nextBucketIndex < continuation.temporalResolution.buckets.length) {
      continuation = resolveBattleTurnBucket({ ...initial, state: resumedState, engineContinuation: continuation }).continuation;
    }
    const result = finalizeBattleTurnExecution({ ...initial, state: resumedState, engineContinuation: continuation });
    assert.equal(continuation.strictCharacterIntents, true);
    assert.equal(result.actions[0]?.kind, "wait");
    assert.equal(result.actions[0]?.selection?.sourceLayer, "planned_action");
  });

  it("preserves an already committed strict receipt when later intent and norm inputs change", () => {
    const initial = input();
    initial.state.sideA.parameters.spd = 20;
    initial.state.sideB.parameters.spd = 5;
    initial.state.plannedActionA = { kind: "basic_attack" };
    initial.state.plannedActionB = { kind: "basic_attack" };
    const prepared = prepareBattleTurnExecution({ ...initial, strictCharacterIntents: true });
    assert.ok(prepared);
    const first = resolveBattleTurnBucket({ ...initial, engineContinuation: prepared });
    const committed = first.continuation.actions.find((action) => action.actorSide === "a");
    assert.ok(committed?.executed);
    initial.state.plannedActionA = { kind: "skill", skillId: "unavailable" };
    const second = resolveBattleTurnBucket({ ...initial, engineContinuation: first.continuation,
      absentIntentSides: ["b"],
      sideANormConstraint: { allowedActionKeys: ["defend"], fallback: { kind: "defend" } } });
    assert.deepEqual(second.continuation.actions, [committed]);
    assert.deepEqual(second.continuation.absentIntentSides, ["b"]);
    const result = finalizeBattleTurnExecution({ ...initial, engineContinuation: second.continuation });
    assert.deepEqual(result.actions, [committed]);
  });
});
