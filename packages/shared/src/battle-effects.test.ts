import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBattleTurnRecord,
  createBattleState,
  resolveTurn,
} from "./battle-engine.js";
import {
  resolvePendingEffectSchedule,
  schedulePendingEffect,
} from "./battle-effects.js";
import { defaultParameters, type CharacterSheet } from "./character.js";

function sheet(id: string, name: string): CharacterSheet {
  const now = "2026-08-12T00:00:00.000Z";
  return {
    id,
    ownerUserId: "owner",
    displayName: name,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: name, visualPrompt: name },
    traits: [],
    parameters: defaultParameters({ hp: 100, maxHp: 100 }),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: name,
  };
}

function dueEffect() {
  return {
    schemaVersion: 1 as const,
    effectId: "effect.delayed-hit.1",
    createdTurn: 0,
    source: { kind: "system_rules" as const, ruleId: "fixture" },
    sourceSide: "a" as const,
    targetSide: "b" as const,
    payload: { kind: "parameter_delta" as const, parameterKey: "mp" as const, delta: -12 },
    trigger: { kind: "due_turn" as const, dueTurn: 1 },
    expiresTurn: 2,
    cancelIfSourceIncapacitated: false,
    visibility: "public_on_resolution" as const,
  };
}

describe("bounded pending effect schedule", () => {
  it("resolves a due effect once and produces scheduled-effect provenance", () => {
    const state = createBattleState({
      id: "effect-engine",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      prologuePending: false,
    });
    const scheduled = schedulePendingEffect(state, dueEffect());
    const resolved = resolveTurn({
      state: scheduled,
      sideASkills: [],
      sideBSkills: [],
    });
    assert.equal((resolved.state.pendingEffects ?? []).length, 0);
    assert.equal(resolved.events.filter((event) =>
      event.sourceEffectId === "effect.delayed-hit.1"
    ).length, 1);
    const record = buildBattleTurnRecord({
      before: scheduled,
      after: resolved.state,
      events: resolved.events,
      actions: resolved.actions,
      mechanicalEvidence: resolved.mechanicalEvidence,
    });
    assert.equal(record.consequenceReceipts?.some((receipt) =>
      receipt.source.kind === "scheduled_effect" &&
      receipt.source.effectId === "effect.delayed-hit.1" &&
      receipt.parameterChanges.b.mp === -12
    ), true);
    const replay = resolvePendingEffectSchedule({
      turn: 1,
      effects: resolved.state.pendingEffects ?? [],
      sideA: resolved.state.sideA,
      sideB: resolved.state.sideB,
    });
    assert.deepEqual(replay.resolutions, []);
    assert.throws(() => schedulePendingEffect(scheduled, dueEffect()),
      /DUPLICATE_PENDING_EFFECT_ID/);
  });

  it("holds a condition until true and bounds cancellation and expiry", () => {
    const state = createBattleState({
      id: "effect-condition",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      prologuePending: false,
    });
    const conditional = {
      ...dueEffect(),
      effectId: "effect.condition.1",
      trigger: { kind: "target_hp_at_most_percent" as const, percent: 50 },
      expiresTurn: 3,
    };
    const pending = resolvePendingEffectSchedule({
      turn: 1,
      effects: [conditional],
      sideA: state.sideA,
      sideB: state.sideB,
    });
    assert.equal(pending.resolutions[0]?.status, "pending");
    const lowTarget = structuredClone(state.sideB);
    lowTarget.parameters.hp = 50;
    const applied = resolvePendingEffectSchedule({
      turn: 2,
      effects: pending.pendingEffects,
      sideA: state.sideA,
      sideB: lowTarget,
    });
    assert.equal(applied.resolutions[0]?.reason, "predicate_met");

    const cancelledSource = structuredClone(state.sideA);
    cancelledSource.canFight = false;
    const cancelled = resolvePendingEffectSchedule({
      turn: 1,
      effects: [{ ...conditional, cancelIfSourceIncapacitated: true }],
      sideA: cancelledSource,
      sideB: state.sideB,
    });
    assert.equal(cancelled.resolutions[0]?.status, "cancelled");
    const expired = resolvePendingEffectSchedule({
      turn: 4,
      effects: [conditional],
      sideA: state.sideA,
      sideB: state.sideB,
    });
    assert.equal(expired.resolutions[0]?.status, "expired");
  });
});
