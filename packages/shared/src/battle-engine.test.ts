import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBattleState, resolveTurn } from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";

function sheet(id: string, name: string, hp = 100): CharacterSheet {
  const t = new Date().toISOString();
  return {
    id,
    ownerUserId: "u1",
    displayName: name,
    tags: [],
    createdAt: t,
    updatedAt: t,
    appearance: { summary: "test", visualPrompt: "test" },
    traits: ["勇敢"],
    parameters: defaultParameters({ hp, maxHp: hp }),
    skills: [
      {
        id: "slash",
        name: "斬撃",
        description: "基本攻撃",
        costMp: 0,
        costStamina: 5,
        power: 1.2,
        kind: "attack",
      },
    ],
    weapon: { name: "剣", description: "鉄の剣", atkBonus: 0, defBonus: 0, magBonus: 0 },
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "テスト用",
  };
}

describe("battle engine", () => {
  it("applies damage without exposing raw numbers in events", () => {
    const state = createBattleState({
      id: "b1",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
    });
    const { state: next, events } = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "slash" },
      sideASkills: state.sideA ? sheet("a", "A").skills : [],
      sideBSkills: sheet("b", "B").skills,
    });
    assert.equal(next.turn, 1);
    assert.ok(events.some((e) => e.type === "damage"));
    for (const e of events) {
      assert.equal(/\d{2,}/.test(e.summary), false, `event should not leak numbers: ${e.summary}`);
    }
    assert.ok((next.sideB.parameters.hp ?? 100) < 100);
  });

  it("ends when HP reaches zero", () => {
    const state = createBattleState({
      id: "b2",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B", 1),
      turnLimit: 20,
    });
    const { state: next } = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "slash" },
      sideASkills: sheet("a", "A").skills,
      sideBSkills: sheet("b", "B", 1).skills,
    });
    assert.equal(next.status, "finished");
    assert.equal(next.winnerSide, "a");
    assert.equal(next.finishReason, "incapacitated");
  });

  it("clamps wild coefficients", () => {
    const state = createBattleState({
      id: "b3",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
    });
    const { state: next } = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "defend" },
      sideASkills: sheet("a", "A").skills,
      sideBSkills: sheet("b", "B").skills,
      situationUpdate: { coefficients: { damage: 999 } },
    });
    assert.equal(next.situation.coefficients.damage, 2.5);
  });
});
