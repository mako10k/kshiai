import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBattleTurnRecord,
  buildCharacterAgentStateChange,
  buildFinisherWindow,
  createBattleState,
  decisivePressure,
  ensureBattleCompatibilityState,
  ensureBattlePerceptionState,
  ensureBattleWorldState,
  prepareBattleTurnInitiative,
  resolveTurn,
} from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import { BattleStateSchema, type BattleState } from "./battle.js";
import { quantizeCommittedMechanicalEvidence } from "./perception-quantization.js";
import { applyBattleWorldTransition } from "./battle-world.js";

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
  it("resolves reflect as a full-turn pause that preserves analysis fields", () => {
    const a = sheet("a", "観察者");
    const b = sheet("b", "挑戦者");
    const state = createBattleState({
      id: "reflect-turn",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.plannedActionA = {
      kind: "reflect",
      reflectionAnalysis: "相手の間合いが読めない",
      reflectionGuideline: "次は様子を見てから踏み込む",
    };
    state.plannedActionB = { kind: "wait" };
    const resolved = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    const reflectAction = resolved.actions.find((action) => action.actorSide === "a");
    assert.equal(reflectAction?.kind, "reflect");
    assert.equal(reflectAction?.executed, true);
    assert.equal(reflectAction?.reflectionAnalysis, "相手の間合いが読めない");
    assert.equal(reflectAction?.reflectionGuideline, "次は様子を見てから踏み込む");
    assert.ok(
      resolved.events.some(
        (event) =>
          event.type === "reflect" &&
          event.summary.includes("考え込んでいる"),
      ),
    );
    assert.equal(
      resolved.events.some((event) => event.type === "damage" && event.actorSide === "a"),
      false,
    );
    const hpBefore = state.sideB.parameters.hp ?? 0;
    const hpAfter = resolved.state.sideB.parameters.hp ?? 0;
    // Reflect itself deals no damage; B only waited.
    assert.equal(hpAfter, hpBefore);
  });

  it("unlocks special skills on turn 10 and scales finish pressure to turn 20", () => {
    const a = sheet("a", "A", 200);
    const b = sheet("b", "B", 200);
    a.skills = [
      {
        id: "regular",
        name: "通常技",
        description: "通常の技。",
        costMp: 0,
        costStamina: 0,
        power: 1,
        kind: "attack",
      },
      {
        id: "ultimate",
        name: "必殺技",
        description: "決着を狙う技。",
        costMp: 0,
        costStamina: 0,
        power: 1.2,
        kind: "special",
      },
    ];
    const policy = {
      id: "attack",
      perspectiveId: "tempo",
      perspectiveTitle: "流れ",
      title: "攻める",
      when: "常に",
      then: "攻める",
      bias: "attack" as const,
      priority: 10,
      triggers: { always: true },
      defaultSelected: true,
    };
    const beforeUnlock = createBattleState({
      id: "special-before",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
      policiesA: [policy],
      selectedPolicyIdsA: [policy.id],
    });
    beforeUnlock.turn = 8;
    // Wait until unlock so regular is not put on cooldown before the finisher turn.
    const turnNine = resolveTurn({
      state: beforeUnlock,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(turnNine.actions[0]?.kind, "wait");

    turnNine.state.plannedActionA = {
      kind: "skill",
      skillId: "ultimate",
      useFinisher: true,
    };
    const turnTen = resolveTurn({
      state: turnNine.state,
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(turnTen.actions[0]?.skillId, "ultimate");
    assert.equal(turnTen.actions[0]?.useFinisher, true);
    assert.deepEqual(turnTen.state.finisherA, {
      skillId: "ultimate",
      skillName: "必殺技",
      source: "explicit",
      used: true,
      usedTurn: 10,
    });
    // Ultimate is on cooldown after use; policy falls back to regular.
    const turnEleven = resolveTurn({
      state: turnTen.state,
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(turnEleven.actions[0]?.skillId, "regular");
    assert.deepEqual(
      decisivePressure({ battleId: "x", turn: 10, turnLimit: 20, actorSide: "a" }),
      { progress: 0, criticalChance: 0, specialMultiplier: 1 },
    );
    assert.deepEqual(
      decisivePressure({ battleId: "x", turn: 20, turnLimit: 20, actorSide: "a" }),
      { progress: 1, criticalChance: 0.4, specialMultiplier: 2 },
    );
    assert.deepEqual(
      buildFinisherWindow({
        finisher: beforeUnlock.finisherA,
        turn: 10,
        turnLimit: 20,
      }),
      {
        skillId: "ultimate",
        skillName: "必殺技",
        source: "explicit",
        unlocked: true,
        turnsUntilUnlock: 0,
        remainingUses: 1,
        currentMultiplier: 1,
        maxMultiplier: 2,
        criticalChance: 0,
        turnsUntilMax: 10,
      },
    );
  });

  it("lets a character spend one derived finisher and rejects repeat activation", () => {
    const a = sheet("a", "A", 200);
    const b = sheet("b", "B", 200);
    const state = createBattleState({
      id: "derived-finisher",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.turn = 8;
    // Do not spend slash before unlock — cooldown would block the finisher turn.
    const beforeUnlock = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.notEqual(beforeUnlock.actions[0]?.useFinisher, true);
    assert.equal(beforeUnlock.state.finisherA?.used, false);

    beforeUnlock.state.plannedActionA = {
      kind: "skill",
      skillId: "slash",
      useFinisher: true,
    };
    const first = resolveTurn({
      state: beforeUnlock.state,
      sideASkills: a.skills,
      sideBSkills: [],
    });
    assert.equal(first.actions[0]?.useFinisher, true);
    assert.equal(first.state.finisherA?.used, true);
    assert.equal(first.state.finisherA?.usedTurn, 10);
    assert.ok(first.events.some((event) => event.summary.includes("蓄えたすべて")));

    first.state.plannedActionA = {
      kind: "skill",
      skillId: "slash",
      useFinisher: true,
    };
    const repeated = resolveTurn({
      state: first.state,
      sideASkills: a.skills,
      sideBSkills: [],
    });
    // Finisher already spent; slash is also on cooldown so the request is substituted.
    assert.notEqual(repeated.actions[0]?.useFinisher, true);
    assert.equal(repeated.state.finisherA?.usedTurn, 10);
    assert.equal(
      repeated.events.some((event) => event.summary.includes("蓄えたすべて")),
      false,
    );
  });
  it("creates private agent continuity and perspective-aware turn records", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    a.identity = {
      realName: null,
      nicknames: [],
      selfNames: ["わたくし"],
      epithets: [],
      gender: null,
      age: null,
    };
    const state = createBattleState({
      id: "agent-state",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    assert.equal(state.agentStateA?.selfReference, "わたくし");
    assert.deepEqual(state.agentStateA?.interior?.speechAppraisal, {
      anticipatedImpact: "",
      observedImpact: "",
      anticipatedSocialCost: "",
      observedSocialCost: "",
      nextApproach: "",
      continuityPosture: "opening",
      continuityDecision: "advance",
    });
    assert.equal(state.agentStateA?.interior?.speechMode, "weave");
    assert.deepEqual(state.turnRecords, []);
    assert.equal(state.semanticState?.revision, 0);
    assert.equal(state.semanticState?.entities["character.a"]?.label, "A");

    const resolved = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "slash" },
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    const record = buildBattleTurnRecord({
      before: state,
      after: resolved.state,
      events: resolved.events,
      actions: resolved.actions,
    });
    assert.equal(record.turn, 1);
    assert.ok((record.sideBChange.parameterChanges.hp ?? 0) < 0);
    assert.deepEqual(
      record.cognitionA.observedEvents,
      record.cognitionB.observedEvents,
    );
    assert.equal(record.cognitionA.foeCondition, record.cognitionB.ownCondition);
    assert.deepEqual(record.actions.map((action) => action.id), [
      "turn-1-action-a",
      "turn-1-action-b",
    ]);
    assert.ok(resolved.events.every((event) => Boolean(event.id)));
    const transitioned = {
      ...resolved.state,
      latestSemanticTransition: {
        turn: resolved.state.turn,
        status: "skipped" as const,
        fromRevision: resolved.state.semanticState?.revision ?? 0,
        toRevision: resolved.state.semanticState?.revision ?? 0,
        patch: null,
      },
      latestWorldTransition: {
        turn: resolved.state.turn,
        status: "skipped" as const,
        fromRevision: resolved.state.worldState?.revision ?? 0,
        toRevision: resolved.state.worldState?.revision ?? 0,
        transition: null,
      },
    };
    const canonicalRecord = buildBattleTurnRecord({
      before: state,
      after: transitioned,
      events: resolved.events,
      actions: resolved.actions,
    });
    assert.equal(canonicalRecord.canonicalTransition?.semantic?.status, "skipped");
    assert.equal(canonicalRecord.canonicalTransition?.world?.status, "skipped");
    assert.equal(
      BattleStateSchema.parse({
        ...transitioned,
        turnRecords: [canonicalRecord],
      }).turnRecords[0]?.canonicalTransition?.semantic?.turn,
      1,
    );
    assert.equal(state.observationStateA?.snapshot.revision, 0);
    assert.equal(
      state.observationStateA?.snapshot.entities["character.a"]?.label,
      "A",
    );
    assert.equal(
      state.observationStateB?.snapshot.entities["character.b"]?.label,
      "B",
    );
    assert.equal("semanticObservation" in record.cognitionA, false);
    const legacyRecord = {
      ...record,
      semanticPatch: { baseRevision: 0, turn: 1, operations: [] },
      cognitionA: {
        ...record.cognitionA,
        semanticObservation: state.semanticState,
      },
      agentStateChangeA: { privateMemory: "duplicated history" },
    };
    const reparsed = BattleStateSchema.parse({
      ...resolved.state,
      turnRecords: [legacyRecord],
    });
    const reparsedRecord = reparsed.turnRecords[0] as unknown as Record<string, unknown>;
    assert.equal("semanticPatch" in reparsedRecord, false);
    assert.equal("agentStateChangeA" in reparsedRecord, false);
    assert.equal(
      "semanticObservation" in reparsed.turnRecords[0]!.cognitionA,
      false,
    );
    const agentChange = buildCharacterAgentStateChange(
      state.agentStateA!,
      {
        ...state.agentStateA!,
        currentGoal: "相手の構えを崩す",
        emotion: "警戒",
        observations: ["相手は消耗している"],
      },
    );
    assert.equal(agentChange.goalAfter, "相手の構えを崩す");
    assert.equal(agentChange.emotionAfter, "警戒");
    assert.deepEqual(agentChange.observationsAdded, ["相手は消耗している"]);
  });

  it("applies damage without exposing raw numbers in events", () => {
    const state = createBattleState({
      id: "b1",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      prologuePending: false,
    });
    const { state: next, events, actions, mechanicalEvidence } = resolveTurn({
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
    const hpEvidence = mechanicalEvidence.find((item) =>
      item.sourceActionId === actions[0]?.id &&
      item.target.side === "b" &&
      item.parameterKey === "hp"
    );
    assert.ok(hpEvidence);
    assert.equal(hpEvidence.target.entityId, "character.b");
    assert.equal(
      hpEvidence.delta,
      (next.sideB.parameters.hp ?? 0) - (state.sideB.parameters.hp ?? 0),
    );
    assert.ok(
      hpEvidence.basisEventIds.every((eventId) =>
        events.some((event) => event.id === eventId)
      ),
    );
  });

  it("grounds environment mechanics in targeted committed events", () => {
    const state = createBattleState({
      id: "environment-evidence",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      prologuePending: false,
    });
    const resolved = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: [],
      sideBSkills: [],
      envHits: [{ target: "both", kind: "damage", intensity: "minor" }],
    });
    const environmentDamage = resolved.mechanicalEvidence.filter((item) =>
      item.sourceActionId === null && item.parameterKey === "hp"
    );
    assert.deepEqual(
      environmentDamage.map((item) => item.target.side).sort(),
      ["a", "b"],
    );
    assert.ok(
      quantizeCommittedMechanicalEvidence(environmentDamage)
        .every((item) => item.change.outcome === "effective"),
    );
    for (const item of environmentDamage) {
      assert.equal(item.basisEventIds.length, 1);
      const event = resolved.events.find(
        (candidate) => candidate.id === item.basisEventIds[0],
      );
      assert.deepEqual(event?.targetSides, [item.target.side]);
    }
  });

  it("puts used skills on power-based cooldown so they cannot be spammed next turn", () => {
    const a = sheet("a", "A");
    a.skills = [{
      id: "heavy",
      name: "大技",
      description: "強い技",
      costMp: 0,
      costStamina: 0,
      power: 2,
      kind: "attack",
    }];
    const state = createBattleState({
      id: "skill-cd",
      sideA: a,
      sideB: sheet("b", "B"),
      turnLimit: 20,
      prologuePending: false,
    });
    const first = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "heavy" },
      sideASkills: a.skills,
      sideBSkills: sheet("b", "B").skills,
    });
    assert.equal(first.state.sideA.skillLastUsedTurn?.heavy, 1);
    assert.equal(first.actions[0]?.skillId, "heavy");
    assert.equal(first.actions[0]?.resolution?.outcome, "accepted");
    assert.ok(
      first.events.some((event) =>
        event.type === "damage" || event.skillName === "大技"
      ),
    );
    const second = resolveTurn({
      state: first.state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "heavy" },
      sideASkills: a.skills,
      sideBSkills: sheet("b", "B").skills,
    });
    // Feasibility layer substitutes before execution; reason is skill_on_cooldown.
    assert.equal(second.actions[0]?.resolution?.reason, "skill_on_cooldown");
    assert.notEqual(second.actions[0]?.skillId, "heavy");
    // Battle start has empty last-used map (no pre-battle cooldown wait).
    assert.equal(
      createBattleState({
        id: "cd-start",
        sideA: a,
        sideB: sheet("b", "B"),
        turnLimit: 20,
        prologuePending: false,
      }).sideA.skillLastUsedTurn,
      undefined,
    );
  });

  it("penalizes consecutive basic attacks with fatigue and readable reduced effect", () => {
    const a = sheet("repeat-a", "A", 300);
    const b = sheet("repeat-b", "B", 1_000);
    const initial = createBattleState({
      id: "repeat-penalty",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    const first = resolveTurn({
      state: initial,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    first.state.dramaState = {
      lastActionSignatureA: "basic_attack:-:1",
      lastActionSignatureB: null,
      repeatedActionA: 1,
      repeatedActionB: 0,
      turnsSinceLocationChange: 1,
      turnsSinceEnvironmentBeat: 1,
      phase: "opening",
      recentBeatFingerprints: [],
      lastPublicSpeechA: null,
      lastPublicSpeechB: null,
    };
    const second = resolveTurn({
      state: first.state,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    second.state.dramaState = {
      ...first.state.dramaState,
      repeatedActionA: 2,
    };
    const third = resolveTurn({
      state: second.state,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: a.skills,
      sideBSkills: [],
    });

    assert.ok(second.events.some((event) => event.summary.includes("同じ手を重ね")));
    assert.ok(third.events.some((event) => event.summary.includes("動きは読まれ")));
    assert.ok(
      (second.state.sideA.parameters.stamina ?? 0) <
        (first.state.sideA.parameters.stamina ?? 0),
    );
    assert.ok(
      (third.state.sideA.parameters.stamina ?? 0) <
        (second.state.sideA.parameters.stamina ?? 0),
    );
    const secondDamage = second.mechanicalEvidence.find((item) =>
      item.sourceActionId === "turn-2-action-a" && item.parameterKey === "hp"
    );
    const thirdDamage = third.mechanicalEvidence.find((item) =>
      item.sourceActionId === "turn-3-action-a" && item.parameterKey === "hp"
    );
    assert.ok(secondDamage);
    assert.ok(thirdDamage);
    assert.ok(Math.abs(thirdDamage.attemptedDelta) < Math.abs(secondDamage.attemptedDelta));
  });

  it("emphasizes finishing blows instead of a bare hit line", () => {
    const target = sheet("b", "B");
    const state = createBattleState({
      id: "finish-blow",
      sideA: sheet("a", "A"),
      sideB: target,
      turnLimit: 20,
      prologuePending: false,
    });
    state.sideB.parameters.hp = 1;
    const { events, mechanicalEvidence } = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "slash" },
      sideASkills: sheet("a", "A").skills,
      sideBSkills: target.skills,
    });
    const damage = events.find((e) => e.type === "damage");
    assert.ok(damage, "expected a damage event");
    assert.match(damage!.summary, /とどめ|決め手/);
    assert.equal(/\d{2,}/.test(damage!.summary), false);
    const hpEvidence = mechanicalEvidence.find((item) =>
      item.target.side === "b" && item.parameterKey === "hp"
    );
    assert.ok(hpEvidence);
    assert.ok(Math.abs(hpEvidence.attemptedDelta) > Math.abs(hpEvidence.delta));
    assert.equal(
      quantizeCommittedMechanicalEvidence([hpEvidence])[0]!.change.outcome,
      "overkill",
    );
  });

  it("defers finish for aftermath after HP reaches zero", () => {
    const state = createBattleState({
      id: "b2",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B", 1),
      turnLimit: 20,
      prologuePending: false,
    });
    const { state: next, events, actions } = resolveTurn({
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
    assert.equal(actions[0]?.executed, true);
    // Equal initiative reads the same bucket-start snapshot, so B's already
    // committed intent is preserved even though A's hit is terminal.
    assert.equal(actions[1]?.executed, true);
    assert.equal(actions[1]?.skippedReason, null);
    assert.ok(
      events.some(
        (e) => e.summary.includes("余波") || e.summary.includes("続けられ"),
      ),
    );
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
          perspectiveId: "pressure",
          perspectiveTitle: "働きかけ方",
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
          perspectiveId: "recovery",
          perspectiveTitle: "立て直し方",
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
      perspectiveId: "initiative",
      perspectiveTitle: "働きかけ方",
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

    assert.equal(events.filter((e) => e.skillName === "基本アクション").length, 2);
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
      perspectiveId: "initiative",
      perspectiveTitle: "働きかけ方",
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
      recentHappenings: [],
    };

    const { events } = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });

    assert.ok(events.some((e) => e.summary.includes("膠着打破")));
    assert.equal(events.filter((e) => e.skillName === "基本アクション").length, 2);
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

  it("records an ineffective offensive attempt without inventing a change", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const state = createBattleState({
      id: "no-effect",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.sideB.parameters.stamina = 0;
    const resolved = resolveTurn({
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
    const attempt = resolved.mechanicalEvidence.find((item) =>
      item.sourceActionId === "turn-1-action-a" &&
      item.target.side === "b" &&
      item.parameterKey === "stamina"
    );
    assert.ok(attempt);
    assert.ok(attempt.attemptedDelta < 0);
    assert.equal(attempt.delta, 0);
    assert.equal(
      quantizeCommittedMechanicalEvidence([attempt])[0]!.change.outcome,
      "immune",
    );
  });

  it("records capped recovery as no effect for each resource", () => {
    const a = sheet("a", "A");
    const b = sheet("b", "B");
    const state = createBattleState({
      id: "capped-recovery",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    const resolved = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "rest" },
      sideASkills: a.skills,
      sideBSkills: [],
    });
    const recovery = resolved.mechanicalEvidence.filter((item) =>
      item.sourceActionId === "turn-1-action-a" &&
      item.target.side === "a" &&
      (item.parameterKey === "mp" || item.parameterKey === "stamina")
    );
    assert.equal(recovery.length, 2);
    assert.ok(recovery.every((item) => item.attemptedDelta > 0));
    assert.ok(recovery.every((item) => item.delta === 0));
    assert.ok(
      quantizeCommittedMechanicalEvidence(recovery)
        .every((item) => item.change.outcome === "none"),
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
    const actionEvidence = applied.mechanicalEvidence.filter((item) =>
      item.sourceActionId === "turn-1-action-a"
    );
    assert.ok(actionEvidence.some((item) => item.target.side === "a"));
    assert.ok(actionEvidence.some((item) => item.target.side === "b"));
    assert.ok(
      actionEvidence.every((item) =>
        item.basisEventIds.every((eventId) =>
          applied.events.some((event) => event.id === eventId)
        )
      ),
    );

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

  it("initializes selected new battles with identified counterpart identity", () => {
    const state = createBattleState({
      id: "new-perception",
      sideA: sheet("a", "アオ"),
      sideB: sheet("b", "クロ"),
      turnLimit: 20,
      prologuePending: false,
    });
    assert.equal(state.perceptionFrameA?.counterpart.identityKnowledge, "identified");
    assert.equal(state.perceptionFrameB?.counterpart.identityKnowledge, "identified");
    assert.deepEqual(state.perceptionRegistryA?.contacts, []);
    assert.equal(state.worldState?.pairRelations[0]?.distance, "near");
    assert.equal(state.worldState?.pairRelations[0]?.sight, "clear");
    assert.equal(
      ensureBattlePerceptionState(state).perceptionFrameA,
      state.perceptionFrameA,
    );
  });

  it("seeds active legacy battles with identified counterpart knowledge", () => {
    const base = createBattleState({
      id: "legacy-perception",
      sideA: sheet("a", "アオ"),
      sideB: sheet("b", "クロ"),
      turnLimit: 20,
      prologuePending: false,
    });
    const legacy = {
      ...base,
      perceptionFrameA: undefined,
      perceptionFrameB: undefined,
      perceptionRegistryA: undefined,
      perceptionRegistryB: undefined,
    };
    const seeded = ensureBattlePerceptionState(legacy);
    assert.equal(seeded.perceptionFrameA?.counterpart.identityKnowledge, "identified");
    assert.equal(seeded.perceptionFrameB?.counterpart.identityKnowledge, "identified");
    assert.equal(seeded.perceptionFrameA?.counterpart.currentAccess, "clear");
    assert.equal(seeded.perceptionFrameA?.self.currentAccess, "clear");
    assert.equal(seeded.perceptionFrameA?.observer.self, "self");
    assert.deepEqual(seeded.perceptionRegistryA?.contacts, []);
    assert.equal(
      seeded.perceptionFrameA?.revision,
      seeded.semanticState?.revision,
    );
  });

  it("deterministically supplies a coarse world to legacy battles", () => {
    const base = createBattleState({
      id: "legacy-world",
      sideA: sheet("a", "アオ"),
      sideB: sheet("b", "クロ"),
      turnLimit: 20,
      prologuePending: false,
    });
    const legacy = { ...base, worldState: undefined };
    const seeded = ensureBattleWorldState(legacy);

    assert.equal(seeded.worldState?.revision, 0);
    assert.equal(seeded.worldState?.pairRelations[0]?.distance, "near");
    assert.equal(
      ensureBattleWorldState(seeded).worldState,
      seeded.worldState,
    );
  });

  it("migrates legacy authority without turning public prose into cognition", () => {
    const base = createBattleState({
      id: "legacy-authority",
      sideA: sheet("a", "アオ"),
      sideB: sheet("b", "クロ"),
      turnLimit: 20,
      prologuePending: false,
    });
    const record = buildBattleTurnRecord({
      before: base,
      after: base,
      events: [],
      actions: [],
    });
    const legacy: BattleState = {
      ...base,
      pipelineAuthorityVersion: undefined,
      worldState: undefined,
      perceptionFrameA: undefined,
      perceptionFrameB: undefined,
      perceptionRegistryA: undefined,
      perceptionRegistryB: undefined,
      agentStateA: { ...base.agentStateA!, lastSpeech: "ナレータ由来か不明の台詞" },
      agentStateB: { ...base.agentStateB!, lastSpeech: "公開表示から戻った可能性" },
      plannedActionA: { kind: "basic_attack" },
      plannedActionB: { kind: "wait" },
      turnRecords: Array.from({ length: 55 }, () => structuredClone(record)),
      log: [{
        turn: 0,
        narrator: ["歴史的な公開表示はそのまま残す。"],
        speeches: [{ speaker: "アオ", text: "古い表示台詞" }],
      }],
    };
    const migrated = ensureBattleCompatibilityState(legacy);

    assert.equal(migrated.pipelineAuthorityVersion, 1);
    assert.equal(migrated.agentStateA?.lastSpeech, null);
    assert.equal(migrated.agentStateB?.lastSpeech, null);
    assert.equal(migrated.plannedActionA, undefined);
    assert.equal(migrated.plannedActionB, undefined);
    assert.equal(migrated.turnRecords.length, 50);
    assert.deepEqual(migrated.log, legacy.log);
    assert.equal(migrated.worldState?.pairRelations[0]?.distance, "near");
    assert.equal(migrated.perceptionFrameA?.counterpart.identityKnowledge, "identified");
    assert.equal(migrated.perceptionFrameA?.counterpart.currentAccess, "clear");
    assert.deepEqual(migrated.agentStateA?.dialogueThread, {
      topic: "",
      unresolvedMove: "",
      anchoredExchange: null,
    });
    assert.deepEqual(migrated.agentStateB?.dialogueThread, {
      topic: "",
      unresolvedMove: "",
      anchoredExchange: null,
    });
    assert.equal(ensureBattleCompatibilityState(migrated), migrated);
  });

  it("records canonical revalidation and an observer-safe substitute", () => {
    const a = sheet("a", "アオ");
    const b = sheet("b", "クロ");
    a.basicAttack = {
      name: "近接の働きかけ",
      description: "近い相手だけに届く。",
      targetParameter: "hp",
      scalingParameter: "atk",
      resistanceParameter: "def",
      power: 0.75,
      constraints: {
        reach: "near",
        requiresSight: false,
        mobility: "limited",
        requiresSpeech: false,
        requiresUsableHeldObject: false,
      },
    };
    const state = createBattleState({
      id: "action-revalidation",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.worldState!.pairRelations[0]!.distance = "far";
    state.plannedActionA = { kind: "basic_attack" };
    state.plannedActionB = { kind: "wait" };

    const resolved = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
      sideABasicAttack: a.basicAttack,
      sideBBasicAttack: b.basicAttack,
    });
    assert.equal(resolved.actions[0]?.kind, "defend");
    assert.equal(resolved.actions[0]?.executed, true);
    assert.deepEqual(resolved.actions[0]?.resolution, {
      requested: { kind: "basic_attack" },
      outcome: "substituted",
      reason: "out_of_range",
    });
    assert.equal(resolved.actions[0]?.skippedReason, null);
  });

  it("prepares initiative from a cloned post-restoration snapshot", () => {
    const a = sheet("a", "先行候補");
    const b = sheet("b", "後攻候補");
    const state = createBattleState({
      id: "prepared-initiative",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.turn = 1;
    state.sideA.parameters.spd = 1;
    state.sideA.baseParameters!.spd = 30;
    state.sideB.parameters.spd = 5;
    state.sideB.baseParameters!.spd = 5;

    const prepared = prepareBattleTurnInitiative({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });

    assert.ok(prepared);
    assert.equal(state.sideA.parameters.spd, 1);
    assert.equal(prepared.sideA.parameters.spd, 7);
    assert.deepEqual(
      prepared.temporalResolution.buckets.map((bucket) => bucket.actorSides),
      [["a"], ["b"]],
    );
  });

  it("atomically preserves equal-speed mutual incapacitation", () => {
    const a = sheet("a", "アオ");
    const b = sheet("b", "クロ");
    const state = createBattleState({
      id: "simultaneous-mutual-ko",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.sideA.parameters.hp = 1;
    state.sideB.parameters.hp = 1;
    state.sideA.parameters.spd = 12;
    state.sideB.parameters.spd = 12;
    state.plannedActionA = { kind: "basic_attack" };
    state.plannedActionB = { kind: "basic_attack" };

    const resolved = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    assert.deepEqual(resolved.state.latestTemporalResolution?.buckets[0]?.actorSides, [
      "a",
      "b",
    ]);
    assert.equal(resolved.state.latestTemporalResolution?.buckets[0]?.commitMode, "atomic");
    assert.deepEqual(resolved.actions.map((action) => action.executed), [true, true]);
    assert.equal(resolved.state.sideA.parameters.hp, 0);
    assert.equal(resolved.state.sideB.parameters.hp, 0);
    assert.equal(resolved.state.winnerSide, "draw");
    assert.equal(resolved.state.aftermathPending, true);

    const record = buildBattleTurnRecord({
      before: state,
      after: resolved.state,
      events: resolved.events,
      actions: resolved.actions,
    });
    assert.equal(record.temporalResolution?.rulesetId, "initiative-window-v1");
  });

  it("lets the faster side interrupt and revalidates the slower bucket", () => {
    const a = sheet("a", "遅い側");
    const b = sheet("b", "速い側");
    const state = createBattleState({
      id: "speed-interruption",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.sideA.parameters.hp = 1;
    state.sideA.parameters.spd = 5;
    state.sideB.parameters.spd = 20;
    state.plannedActionA = { kind: "basic_attack" };
    state.plannedActionB = { kind: "basic_attack" };

    const resolved = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    assert.deepEqual(
      resolved.state.latestTemporalResolution?.buckets.map((bucket) => bucket.actorSides),
      [["b"], ["a"]],
    );
    assert.equal(resolved.actions[1]?.executed, true);
    assert.equal(resolved.actions[0]?.executed, false);
    assert.equal(resolved.actions[0]?.skippedReason, "incapacitated_before_action");
    assert.equal(resolved.state.winnerSide, "b");
  });

  it("applies same-bucket defense before either attack is evaluated", () => {
    const run = (defend: boolean) => {
      const a = sheet("a", "攻撃側");
      const b = sheet("b", "防御側");
      const state = createBattleState({
        id: defend ? "same-bucket-defense" : "same-bucket-wait",
        sideA: a,
        sideB: b,
        turnLimit: 20,
        prologuePending: false,
      });
      state.sideA.parameters.spd = 10;
      state.sideB.parameters.spd = 11;
      state.plannedActionA = { kind: "basic_attack" };
      state.plannedActionB = { kind: defend ? "defend" : "wait" };
      return resolveTurn({
        state,
        sideASkills: a.skills,
        sideBSkills: b.skills,
      });
    };
    const defended = run(true);
    const undefended = run(false);
    const defendedDamage = 100 - (defended.state.sideB.parameters.hp ?? 0);
    const undefendedDamage = 100 - (undefended.state.sideB.parameters.hp ?? 0);
    assert.ok(defendedDamage < undefendedDamage);
    assert.equal(defended.state.sideB.defending, true);
  });

  it("keeps mechanics invariant when simultaneous side labels are swapped", () => {
    const run = (swapped: boolean) => {
      const first = sheet(swapped ? "b" : "a", "第一");
      const second = sheet(swapped ? "a" : "b", "第二");
      const state = createBattleState({
        id: "side-swap-simultaneous",
        sideA: swapped ? second : first,
        sideB: swapped ? first : second,
        turnLimit: 20,
        prologuePending: false,
      });
      state.sideA.parameters.spd = 10;
      state.sideB.parameters.spd = 10;
      state.plannedActionA = { kind: "basic_attack" };
      state.plannedActionB = { kind: "basic_attack" };
      const before = {
        first: swapped ? state.sideB.parameters.hp! : state.sideA.parameters.hp!,
        second: swapped ? state.sideA.parameters.hp! : state.sideB.parameters.hp!,
      };
      const result = resolveTurn({
        state,
        sideASkills: state.sideA.characterId === first.id ? first.skills : second.skills,
        sideBSkills: state.sideB.characterId === second.id ? second.skills : first.skills,
      });
      return {
        firstDamage: before.first - (swapped
          ? result.state.sideB.parameters.hp!
          : result.state.sideA.parameters.hp!),
        secondDamage: before.second - (swapped
          ? result.state.sideA.parameters.hp!
          : result.state.sideB.parameters.hp!),
      };
    };
    assert.deepEqual(run(false), run(true));
  });

  it("keeps faster-side interruption invariant when side labels are swapped", () => {
    const run = (fastSide: "a" | "b") => {
      const a = sheet("fighter-a", "A");
      const b = sheet("fighter-b", "B");
      const state = createBattleState({
        id: `unequal-swap-${fastSide}`,
        sideA: a,
        sideB: b,
        turnLimit: 20,
        prologuePending: false,
      });
      state.sideA.parameters.hp = fastSide === "a" ? 100 : 1;
      state.sideB.parameters.hp = fastSide === "b" ? 100 : 1;
      state.sideA.parameters.spd = fastSide === "a" ? 20 : 5;
      state.sideB.parameters.spd = fastSide === "b" ? 20 : 5;
      state.plannedActionA = { kind: "basic_attack" };
      state.plannedActionB = { kind: "basic_attack" };
      const result = resolveTurn({
        state,
        sideASkills: a.skills,
        sideBSkills: b.skills,
      });
      return {
        winnerIsFast: result.state.winnerSide === fastSide,
        fastExecuted: result.actions[fastSide === "a" ? 0 : 1]?.executed,
        slowSkipped: result.actions[fastSide === "a" ? 1 : 0]?.skippedReason,
      };
    };
    assert.deepEqual(run("a"), run("b"));
  });

  it("merges same-snapshot healing, damage, and mutual effects additively", () => {
    const a = sheet("a", "回復側");
    const b = sheet("b", "攻撃側");
    a.skills = [{
      id: "recover",
      name: "回復",
      description: "自分を回復する。",
      costMp: 0,
      costStamina: 0,
      power: 1,
      kind: "support",
    }];
    b.skills = [{
      id: "interfere",
      name: "相互干渉",
      description: "互いの速度に影響する。",
      costMp: 0,
      costStamina: 0,
      power: 1,
      kind: "status",
      effects: [{ target: "foe", parameter: "spd", delta: -4 }],
    }];
    const state = createBattleState({
      id: "atomic-heal-damage",
      sideA: a,
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    state.sideA.parameters.hp = 50;
    state.sideA.parameters.spd = 10;
    state.sideB.parameters.spd = 10;
    state.plannedActionA = { kind: "skill", skillId: "recover" };
    state.plannedActionB = { kind: "basic_attack" };
    const result = resolveTurn({
      state,
      sideASkills: a.skills,
      sideBSkills: b.skills,
    });
    const committedHpDelta = result.mechanicalEvidence
      .filter((item) => item.target.side === "a" && item.parameterKey === "hp")
      .reduce((sum, item) => sum + item.delta, 0);
    assert.equal(
      result.state.sideA.parameters.hp! - state.sideA.parameters.hp!,
      committedHpDelta,
    );

    const mutual = createBattleState({
      id: "atomic-mutual-effects",
      sideA: { ...a, skills: b.skills },
      sideB: b,
      turnLimit: 20,
      prologuePending: false,
    });
    mutual.sideA.parameters.spd = 10;
    mutual.sideB.parameters.spd = 10;
    mutual.plannedActionA = { kind: "skill", skillId: "interfere" };
    mutual.plannedActionB = { kind: "skill", skillId: "interfere" };
    const mutualResult = resolveTurn({
      state: mutual,
      sideASkills: b.skills,
      sideBSkills: b.skills,
    });
    assert.equal(mutualResult.state.sideA.parameters.spd, 6);
    assert.equal(mutualResult.state.sideB.parameters.spd, 6);
    assert.deepEqual(mutualResult.actions.map((action) => action.executed), [true, true]);
  });

  it("does not feed narration style into temporal or mechanical resolution", () => {
    const run = (instruction: string) => {
      const a = sheet("a", "A");
      const b = sheet("b", "B");
      const state = createBattleState({
        id: "narration-independent-timing",
        sideA: a,
        sideB: b,
        turnLimit: 20,
        prologuePending: false,
      });
      state.narrationStyle = {
        id: instruction,
        displayName: instruction,
        instruction,
        perspective: "external",
      };
      state.plannedActionA = { kind: "basic_attack" };
      state.plannedActionB = { kind: "basic_attack" };
      const result = resolveTurn({
        state,
        sideASkills: a.skills,
        sideBSkills: b.skills,
      });
      return {
        a: result.state.sideA.parameters,
        b: result.state.sideB.parameters,
        actions: result.actions,
        temporal: result.state.latestTemporalResolution,
      };
    };
    assert.deepEqual(run("静かに語る"), run("激しく語る"));
  });

  it("applies bounded held-object benefits to later attacks and defenses", () => {
    const makeState = (id: string, instrumentRef?: string) => {
      const a = sheet("a", "A", 300);
      const b = sheet("b", "B", 300);
      a.parameters.atk = 100;
      b.parameters.def = 10;
      const state = createBattleState({
        id,
        sideA: a,
        sideB: b,
        turnLimit: 20,
        prologuePending: false,
      });
      const added = applyBattleWorldTransition({
        state: state.worldState!,
        turn: 0,
        transition: {
          baseRevision: state.worldState!.revision,
          turn: 0,
          operations: [{
            op: "add_entity",
            entityId: "object.free.a.tool",
            entity: {
              kind: "object",
              active: true,
              presence: "present",
              placement: { type: "held", holderId: "character.a" },
              exposure: "exposed",
              actorState: null,
              objectState: {
                portable: true,
                usable: true,
                exclusiveUse: true,
                usableBy: [],
                cover: "none",
                blocksMovement: false,
                visionEffect: "none",
                hearingEffect: "none",
                mobilityEffect: "none",
                causalEnvelope: { damage: "moderate", defense: "moderate" },
              },
              objectProfile: {
                canonicalLabel: "ボール",
                description: "手に持てる硬めのボール。",
                sourceRef: "battlefield:ball",
                candidateKey: "ball",
                provenance: "battlefield",
                knownOpenAspects: [],
                observerRefs: { a: "percept.a.ball" },
                observerLabels: { a: "石のような物" },
                concretizations: [],
              },
            },
          }],
        },
      });
      assert.equal(added.ok, true);
      if (added.ok) state.worldState = added.state;
      state.plannedActionA = {
        kind: "basic_attack",
        ...(instrumentRef ? { instrumentRef } : {}),
      };
      state.plannedActionB = { kind: "wait" };
      return { state, a, b };
    };

    const baselineInput = makeState("instrument-attack", undefined);
    const equippedInput = makeState("instrument-attack", "percept.a.ball");
    const baseline = resolveTurn({
      state: baselineInput.state,
      sideASkills: baselineInput.a.skills,
      sideBSkills: baselineInput.b.skills,
    });
    const equipped = resolveTurn({
      state: equippedInput.state,
      sideASkills: equippedInput.a.skills,
      sideBSkills: equippedInput.b.skills,
    });
    assert.ok(
      equipped.state.sideB.parameters.hp! < baseline.state.sideB.parameters.hp!,
      "a moderate damage instrument should improve the same deterministic attack",
    );

    const defendRun = (instrumentRef?: string) => {
      const input = makeState("instrument-defense", undefined);
      input.state.plannedActionA = { kind: "basic_attack" };
      input.state.plannedActionB = {
        kind: "defend",
        ...(instrumentRef ? { instrumentRef } : {}),
      };
      if (instrumentRef) {
        const entity = input.state.worldState!.entities["object.free.a.tool"]!;
        entity.placement = { type: "held", holderId: "character.b" };
        entity.objectProfile!.observerRefs = { b: instrumentRef };
      }
      return resolveTurn({
        state: input.state,
        sideASkills: input.a.skills,
        sideBSkills: input.b.skills,
      });
    };
    const unassistedDefense = defendRun();
    const assistedDefense = defendRun("percept.b.ball");
    assert.ok(
      assistedDefense.state.sideB.parameters.hp! >
        unassistedDefense.state.sideB.parameters.hp!,
      "a moderate defense instrument should reduce the same deterministic hit",
    );
  });
});
