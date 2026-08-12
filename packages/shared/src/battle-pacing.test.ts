import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_TWELVE_TURN_PACING_CANDIDATE,
  BattlePacingPolicySchema,
  currentBattlePacingPolicy,
} from "./battle-pacing.js";
import { measureBattlePacing } from "./battle-pacing-observe.js";
import { createBattleState, resolveTurn } from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";

function restorationSheet(id: string): CharacterSheet {
  const timestamp = "2026-08-12T00:00:00.000Z";
  return {
    id,
    ownerUserId: "pacing-test",
    displayName: id,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    appearance: { summary: "test", visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters({ atk: 30 }),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "test",
  };
}

describe("battle pacing policy", () => {
  it("keeps all pacing thresholds in one validated snapshot", () => {
    assert.equal(BattlePacingPolicySchema.safeParse(currentBattlePacingPolicy(20)).success, true);
    assert.equal(BattlePacingPolicySchema.safeParse(LOCAL_TWELVE_TURN_PACING_CANDIDATE).success, true);
    assert.equal(LOCAL_TWELVE_TURN_PACING_CANDIDATE.turnLimit, 12);
    assert.equal(
      LOCAL_TWELVE_TURN_PACING_CANDIDATE.automaticRestoration,
      "explicit_effects_only",
    );
  });

  it("produces reproducible local measurements without speech generation", () => {
    const input = {
      policy: LOCAL_TWELVE_TURN_PACING_CANDIDATE,
      sampleSize: 12,
      seed: 98,
    };
    const first = measureBattlePacing(input);
    const second = measureBattlePacing(input);
    assert.deepEqual(first, second);
    assert.equal(first.repeatedSpeech.status, "not_measured");
    assert.equal(first.delayedEffectResolutionRate, 1);
  });

  it("does not erase parameter changes under the explicit-effects policy", () => {
    const a = restorationSheet("a");
    const b = restorationSheet("b");
    const state = createBattleState({
      id: "explicit-restoration",
      sideA: a,
      sideB: b,
      turnLimit: 12,
      prologuePending: false,
    });
    state.turn = 1;
    state.pacingPolicy = LOCAL_TWELVE_TURN_PACING_CANDIDATE;
    state.sideA.parameters.atk = 10;
    state.plannedActionA = { kind: "wait" };
    state.plannedActionB = { kind: "wait" };
    const resolved = resolveTurn({
      state,
      sideASkills: [],
      sideBSkills: [],
    });
    assert.equal(resolved.state.sideA.parameters.atk, 10);
    assert.equal(
      resolved.events.some((event) => event.summary.includes("本来の調子")),
      false,
    );
  });
});
