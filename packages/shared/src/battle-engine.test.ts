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

  it("defers finish for aftermath after HP reaches zero", () => {
    const state = createBattleState({
      id: "b2",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B", 1),
      turnLimit: 20,
    });
    const { state: next, events } = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "slash" },
      sideASkills: sheet("a", "A").skills,
      sideBSkills: sheet("b", "B", 1).skills,
    });
    // Combat does not hard-finish; one extra aftermath beat is pending.
    assert.equal(next.status, "active");
    assert.equal(next.aftermathPending, true);
    assert.equal(next.winnerSide, "a");
    assert.equal(next.finishReason, "incapacitated");
    assert.ok(events.some((e) => e.type === "status"));
    assert.ok(events.some((e) => e.summary.includes("余波") || e.summary.includes("倒れた")));
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

  it("applies battlefield base coefficients at creation", () => {
    const state = createBattleState({
      id: "b4",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      battlefield: {
        sourcePresetId: null,
        displayName: "テスト森",
        category: "forest",
        scene: "霧の森",
        terrain: "ぬかるみ",
        obstacles: ["倒木"],
        conditions: ["霧"],
        coefficients: { damage: 0.9, wind: 1.2 },
        narrativeSetup: "霧が立ちこめる。",
      },
    });
    assert.equal(state.situation.coefficients.damage, 0.9);
    assert.equal(state.battlefield?.displayName, "テスト森");
  });

  it("auto-resolves a turn from stance without player action", () => {
    const state = createBattleState({
      id: "b5",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      stanceA: "aggressive",
      stanceB: "defensive",
    });
    const { state: next, events } = resolveTurn({
      state,
      sideASkills: sheet("a", "A").skills,
      sideBSkills: sheet("b", "B").skills,
    });
    assert.equal(next.turn, 1);
    assert.ok(events.length > 0);
    assert.equal(next.stanceA, "aggressive");
  });

  it("auto-resolves from multi-selected case policies", () => {
    const state = createBattleState({
      id: "b6",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B", 30),
      turnLimit: 20,
      policiesA: [
        {
          id: "p1",
          title: "追い打ち",
          when: "相手が揺らいだとき",
          then: "攻める",
          bias: "attack",
          priority: 80,
          triggers: { foeHpBelow: 0.5 },
          defaultSelected: true,
        },
        {
          id: "p2",
          title: "守り",
          when: "こちらが危ないとき",
          then: "守る",
          bias: "defend",
          priority: 90,
          triggers: { myHpBelow: 0.3 },
          defaultSelected: true,
        },
      ],
      selectedPolicyIdsA: ["p1", "p2"],
      policiesB: [],
      selectedPolicyIdsB: [],
    });
    const { state: next } = resolveTurn({
      state,
      sideASkills: sheet("a", "A").skills,
      sideBSkills: sheet("b", "B", 30).skills,
    });
    assert.equal(next.turn, 1);
    assert.ok((next.sideB.parameters.hp ?? 100) < 30 || next.sideB.defending === false);
  });
});
