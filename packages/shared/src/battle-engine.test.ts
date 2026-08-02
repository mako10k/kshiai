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
      prologuePending: false,
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
      prologuePending: false,
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
      prologuePending: false,
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
      prologuePending: false,
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
      prologuePending: false,
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
      prologuePending: false,
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

  it("falls back to a basic attack when offensive skills are unaffordable", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    for (const fighter of [a, b]) {
      fighter.skills[0] = { ...fighter.skills[0]!, costMp: 99 };
      fighter.parameters.mp = 0;
      fighter.parameters.stamina = 3;
    }
    const attackPolicy = {
      id: "attack",
      title: "攻勢",
      when: "常に",
      then: "攻める",
      bias: "attack" as const,
      priority: 10,
      triggers: { always: true },
      defaultSelected: true,
    };
    const state = createBattleState({
      id: "basic",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
      policiesA: [attackPolicy],
      selectedPolicyIdsA: [attackPolicy.id],
      policiesB: [attackPolicy],
      selectedPolicyIdsB: [attackPolicy.id],
    });

    const { state: next, events } = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });

    assert.equal(events.filter((e) => e.skillName === "通常攻撃").length, 2);
    assert.equal(next.sideA.parameters.stamina, 0);
    assert.ok((next.sideA.parameters.hp ?? 100) < 100);
    assert.ok((next.sideB.parameters.hp ?? 100) < 100);
  });

  it("rests and restores resources when even a basic attack is exhausted", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    for (const fighter of [a, b]) {
      fighter.skills[0] = { ...fighter.skills[0]!, costMp: 99 };
      fighter.parameters.mp = 0;
      fighter.parameters.stamina = 0;
    }
    const state = createBattleState({
      id: "rest",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
      stanceA: "aggressive",
      stanceB: "aggressive",
    });

    const { state: next, events } = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });

    assert.equal(events.filter((e) => e.type === "rest").length, 2);
    assert.ok((next.sideA.parameters.mp ?? 0) > 0);
    assert.ok((next.sideA.parameters.stamina ?? 0) > 0);
  });

  it("forces both fighters into basic attacks after two passive turns", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const waitPolicy = {
      id: "wait",
      title: "待機",
      when: "常に",
      then: "待つ",
      bias: "wait" as const,
      priority: 100,
      triggers: { always: true },
      defaultSelected: true,
    };
    const state = createBattleState({
      id: "force",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
      policiesA: [waitPolicy],
      selectedPolicyIdsA: [waitPolicy.id],
      policiesB: [waitPolicy],
      selectedPolicyIdsB: [waitPolicy.id],
    });
    state.supervisor = {
      quietTurns: 2,
      passiveTurns: 2,
      turnsSinceHappening: 2,
      lastHpA: 100,
      lastHpB: 100,
      happenings: 0,
    };

    const { events } = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });

    assert.ok(events.some((e) => e.summary.includes("膠着打破")));
    assert.equal(events.filter((e) => e.skillName === "通常攻撃").length, 2);
  });

  it("announces the final turn and explains the turn-limit decision", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const state = createBattleState({
      id: "judgement",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.turn = 18;
    const penultimate = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "defend" },
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    assert.ok(penultimate.events.some((e) => e.summary.includes("判定予告")));

    const final = resolveTurn({
      state: penultimate.state,
      playerAction: { actorSide: "a", kind: "defend" },
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    assert.equal(final.state.status, "finished");
    assert.equal(final.state.finishReason, "turn_limit");
    assert.ok(final.events.some((e) => e.summary.includes("最終判定")));
  });

  it("allows a basic attack to damage stamina instead of HP", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const state = createBattleState({
      id: "typed-basic",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    const hpBefore = state.sideB.parameters.hp;
    const staminaBefore = state.sideB.parameters.stamina;
    const { state: next, events } = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: a.skills,
      sideBSkills: [],
      sideABasicAttack: {
        name: "疲労打ち",
        description: "持久力を削る。",
        targetParameter: "stamina",
        scalingParameter: "atk",
        resistanceParameter: "def",
        power: 0.75,
      },
    });
    assert.equal(next.sideB.parameters.hp, hpBefore);
    assert.ok((next.sideB.parameters.stamina ?? 0) < (staminaBefore ?? 0));
    assert.ok(
      events.some(
        (event) => event.type === "parameter" && event.skillName === "疲労打ち",
      ),
    );
  });

  it("applies status skill tradeoffs and reverts them toward base each turn", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const statusSkill = {
      id: "shift",
      name: "捨て身の威圧",
      description: "守りを高めながら敵の攻撃力を削る。",
      costMp: 0,
      costStamina: 5,
      power: 1,
      kind: "status" as const,
      effects: [
        { target: "self" as const, parameter: "def" as const, delta: 6 },
        { target: "self" as const, parameter: "stamina" as const, delta: -4 },
        { target: "foe" as const, parameter: "atk" as const, delta: -10 },
      ],
    };
    a.skills = [statusSkill];
    const state = createBattleState({
      id: "status",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    const applied = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: statusSkill.id },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(applied.state.sideA.parameters.def, 16);
    assert.equal(applied.state.sideA.parameters.stamina, 41);
    assert.equal(applied.state.sideB.parameters.atk, 2);

    const reverted = resolveTurn({
      state: applied.state,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(reverted.state.sideA.parameters.def, 14);
    assert.equal(reverted.state.sideA.parameters.stamina, 43);
    assert.equal(reverted.state.sideB.parameters.atk, 4);
    assert.ok(reverted.events.some((event) => event.summary.includes("本来の調子")));
  });

  it("restores maximum HP without restoring lost current HP", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const maxHpSkill = {
      id: "frailty",
      name: "生命枠侵食",
      description: "生命力の上限を一時的に削る。",
      costMp: 10,
      costStamina: 0,
      power: 1,
      kind: "status" as const,
      effects: [
        { target: "foe" as const, parameter: "maxHp" as const, delta: -25 },
      ],
    };
    a.skills = [maxHpSkill];
    const state = createBattleState({
      id: "max-hp",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    const applied = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: maxHpSkill.id },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(applied.state.sideB.parameters.maxHp, 75);
    assert.equal(applied.state.sideB.parameters.hp, 75);

    const reverted = resolveTurn({
      state: applied.state,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(reverted.state.sideB.parameters.maxHp, 80);
    assert.equal(reverted.state.sideB.parameters.hp, 75);
  });

  it("applies equipment changes at battle start and lets them decay", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    a.weapon = {
      name: "重い剣",
      description: "威力と引き換えに持久力を奪う。",
      atkBonus: 2,
      defBonus: 0,
      magBonus: 0,
      effects: [{ parameter: "stamina", delta: -5 }],
    };
    const state = createBattleState({
      id: "equipment",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    assert.equal(state.sideA.baseParameters?.atk, 12);
    assert.equal(state.sideA.parameters.atk, 14);
    assert.equal(state.sideA.parameters.stamina, 45);

    const first = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    const second = resolveTurn({
      state: first.state,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(second.state.sideA.parameters.atk, 13);
    assert.equal(second.state.sideA.parameters.stamina, 46);
  });
});
