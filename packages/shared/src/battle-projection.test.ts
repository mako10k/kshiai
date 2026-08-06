import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdjudicationSliceSchema,
  BattleStateProjectionAdapter,
  ConsistencySliceSchema,
  ObservationSliceSchema,
  createCanonicalReadResultSchema,
  expandAdjudicationFacts,
  expandConsistencyCausalLinks,
  expandConsistencyFacts,
} from "./battle-projection.js";
import {
  buildBattleTurnRecord,
  createBattleState,
  resolveTurn,
} from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import type { BattleWorldEntity } from "./battle-world.js";

function sheet(id: string, displayName: string): CharacterSheet {
  const timestamp = "2026-08-06T00:00:00.000Z";
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    appearance: {
      summary: `${displayName}の姿`,
      visualPrompt: `${displayName} standing`,
    },
    traits: [],
    parameters: defaultParameters({
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      stamina: 30,
      maxStamina: 30,
    }),
    basicAttack: {
      name: `${displayName}の攻撃`,
      description: "近くの相手へ働きかける。",
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
    },
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: {
      canFight: true,
      irreversibleIncapacitated: false,
    },
    narrativeBlurb: `${displayName}のテスト用設定`,
  };
}

function state() {
  return createBattleState({
    id: "battle-projection-poc",
    sideA: sheet("a", "アルファ"),
    sideB: sheet("b", "ベータ"),
    turnLimit: 20,
    prologuePending: false,
  });
}

function objectEntity(input: {
  placement: BattleWorldEntity["placement"];
  cover?: "none" | "partial" | "full";
  blocksMovement?: boolean;
}): BattleWorldEntity {
  return {
    kind: "object",
    active: true,
    presence: "present",
    placement: input.placement,
    exposure: "exposed",
    actorState: null,
    objectState: {
      portable: input.placement.type === "held" || input.placement.type === "worn",
      usable: true,
      exclusiveUse: false,
      usableBy: [],
      cover: input.cover ?? "none",
      blocksMovement: input.blocksMovement ?? false,
      visionEffect: "none",
      hearingEffect: "none",
      mobilityEffect: "none",
    },
    createdTurn: 0,
    updatedTurn: 0,
  };
}

function effectEntity(areaId: string): BattleWorldEntity {
  return {
    kind: "effect",
    active: true,
    presence: "present",
    placement: { type: "scene", areaId },
    exposure: "exposed",
    actorState: null,
    objectState: null,
    createdTurn: 0,
    updatedTurn: 0,
  };
}

describe("BattleState Projection PoC", () => {
  it("emits strict observer-local slices without canonical subject IDs", () => {
    const battle = state();
    assert.ok(battle.perceptionFrameA);
    battle.perceptionFrameA = structuredClone(battle.perceptionFrameA);
    battle.perceptionFrameA.others.push({
      subject: {
        kind: "identified",
        perceptionRef: "object.hidden-canonical-ref",
      },
      currentAccess: "clear",
      identityKnowledge: "identified",
      perceivedAs: "視界内の刃物",
      percepts: [{
        perceptId: "percept.a.local-blade",
        modality: "vision",
        phenomenon: "刃が光を反射した",
        direction: "front",
        distance: "near",
        salience: "noticeable",
        occurrenceCertainty: "certain",
        attributionCertainty: "probable",
      }],
    });

    const adapter = new BattleStateProjectionAdapter(battle);
    const result = adapter.buildObservationSlice({
      observerRef: "character.a",
      purpose: "character_decision",
    });

    createCanonicalReadResultSchema(ObservationSliceSchema).parse(result);
    assert.equal(result.consistency.level, "unchecked");
    assert.equal(result.value.subjects[2]?.localRef, "subject.1");
    assert.equal(result.value.subjects[2]?.perceivedAs, "視界内の刃物");
    const serialized = JSON.stringify(result.value);
    assert.doesNotMatch(serialized, /character\.[ab]/u);
    assert.doesNotMatch(serialized, /object\.hidden-canonical-ref/u);
    assert.doesNotMatch(serialized, /perceptionRef/u);

    const sideB = adapter.buildObservationSlice({
      observerRef: "character.b",
      purpose: "character_reaction",
    });
    createCanonicalReadResultSchema(ObservationSliceSchema).parse(sideB);
    assert.equal(sideB.value.observer.side, "b");
    assert.doesNotMatch(JSON.stringify(sideB.value), /character\.[ab]/u);
  });

  it("traverses physical remote causal support communication identity and process links", () => {
    const initial = state();
    const turn = resolveTurn({
      state: initial,
      playerAction: { actorSide: "a", kind: "wait" },
      sideASkills: [],
      sideBSkills: [],
    });
    const utterance = {
      id: "turn-1-utterance-a",
      type: "utterance" as const,
      actorName: "アルファ",
      actorSide: "a" as const,
      targetName: "ベータ",
      targetSides: ["b" as const],
      utterance: {
        text: "そこを動くな",
        delivery: "spoken" as const,
        volume: "normal" as const,
        articulation: "clear" as const,
        language: "ja",
      },
      summary: "アルファがベータへ呼びかけた。",
    };
    turn.state.turnRecords = [buildBattleTurnRecord({
      before: initial,
      after: turn.state,
      events: [...turn.events, utterance],
      actions: turn.actions,
    })];
    assert.ok(turn.state.worldState);
    const world = turn.state.worldState;
    world.pairRelations[0] = {
      ...world.pairRelations[0]!,
      distance: "far",
      sight: "clear",
      sound: "clear",
    };
    world.entities["object.tool"] = objectEntity({
      placement: { type: "held", holderId: "character.a" },
      cover: "partial",
    });
    world.entities["terrain.support"] = objectEntity({
      placement: { type: "attached", anchorId: "object.tool" },
    });
    const areaId = world.entities["character.a"]!.placement.type === "scene"
      ? world.entities["character.a"]!.placement.areaId
      : "area.1";
    world.entities["effect.smoke"] = effectEntity(areaId);
    world.pairRelations.push({
      firstEntityId: "character.a",
      secondEntityId: "object.tool",
      distance: "contact",
      sight: "clear",
      sound: "clear",
      firstOrientation: "facing",
      secondOrientation: "indeterminate",
      updatedTurn: 1,
    });

    const result = new BattleStateProjectionAdapter(turn.state)
      .buildAdjudicationSlice({
        proposalRefs: ["proposal.a", "proposal.b"],
        temporalWindow: {
          fromTurn: 1,
          toTurn: 1,
          phase: "proposal",
        },
      });

    AdjudicationSliceSchema.parse(result.value);
    const kinds = new Set(result.value.scope.traversedKinds);
    for (const kind of [
      "physical_contact",
      "remote_targeting",
      "causal_dependency",
      "support",
      "communication",
      "identity_dependency",
      "process_propagation",
    ] as const) {
      assert.equal(kinds.has(kind), true, `missing ${kind}`);
    }
    assert.ok(result.value.scope.processRefs.includes("effect.smoke"));
    assert.equal(result.value.schemaVersion, 2);
    assert.equal("factRefs" in result.value.scope, false);
    assert.equal("ruleRefs" in result.value.scope, false);
    assert.ok(expandAdjudicationFacts(result.value).some((fact) =>
      fact.subjectRef === "object.tool" && fact.predicate === "held_by"
    ));
  });

  it("enforces configurable entity fact rule byte and history limits", () => {
    const battle = state();
    assert.ok(battle.worldState);
    for (let index = 1; index <= 12; index += 1) {
      battle.worldState.entities[`object.bound-${index}`] = objectEntity({
        placement: { type: "attached", anchorId: "character.a" },
        blocksMovement: index % 2 === 0,
      });
    }

    const result = new BattleStateProjectionAdapter(battle)
      .buildAdjudicationSlice({
        proposalRefs: ["proposal.a"],
        temporalWindow: { fromTurn: 0, toTurn: 1 },
        limits: {
          maxEntities: 3,
          maxFacts: 4,
          maxRules: 1,
          maxBytes: 4096,
          maxHistoryTurns: 0,
        },
      });

    assert.ok(result.value.scope.entityRefs.length <= 3);
    assert.ok(expandAdjudicationFacts(result.value).length <= 4);
    assert.ok(result.value.applicableRuleRefs.length <= 1);
    assert.ok(Buffer.byteLength(JSON.stringify(result.value), "utf8") <= 4096);
    assert.equal(result.value.scope.truncated, true);
    assert.ok(result.value.scope.omitted.entities > 0);
    assert.equal(result.value.scope.omitted.historyTurns, 0);
  });

  it("builds server-only consistency context with bounded causal history", () => {
    const initial = state();
    const turn = resolveTurn({
      state: initial,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    turn.state.turnRecords = [buildBattleTurnRecord({
      before: initial,
      after: turn.state,
      events: turn.events,
      actions: turn.actions,
    })];
    const result = new BattleStateProjectionAdapter(turn.state)
      .buildConsistencySlice({
        anchorRefs: ["character.a", "character.b"],
        purpose: "adjudication",
        temporalWindow: { fromTurn: 1, toTurn: 1, phase: "post_commit" },
      });

    createCanonicalReadResultSchema(ConsistencySliceSchema).parse(result);
    assert.equal(result.consistency.level, "unchecked");
    assert.deepEqual(result.value.issues, []);
    const facts = expandConsistencyFacts(result.value);
    const factRefs = new Set(facts.map((fact) => fact.id));
    assert.ok(facts.some((fact) => fact.source === "event"));
    assert.ok(expandConsistencyCausalLinks(result.value).every((link) =>
      factRefs.has(link.targetFactRef)
    ));
  });

  it("is read-only and does not alter deterministic battle outcomes", () => {
    const battle = state();
    const untouched = structuredClone(battle);
    const adapter = new BattleStateProjectionAdapter(battle);
    adapter.buildObservationSlice({
      observerRef: "character.a",
      purpose: "character_decision",
    });
    adapter.buildAdjudicationSlice({
      proposalRefs: ["proposal.a", "proposal.b"],
      temporalWindow: { fromTurn: 0, toTurn: 1 },
    });
    adapter.buildConsistencySlice({
      anchorRefs: ["character.a"],
      purpose: "world_process",
    });
    assert.deepEqual(battle, untouched);

    const withoutProjection = resolveTurn({
      state: structuredClone(battle),
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    const withProjection = resolveTurn({
      state: structuredClone(battle),
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    assert.deepEqual(withProjection.actions, withoutProjection.actions);
    assert.deepEqual(withProjection.events, withoutProjection.events);
    assert.deepEqual(
      withProjection.state.sideA.parameters,
      withoutProjection.state.sideA.parameters,
    );
    assert.deepEqual(
      withProjection.state.sideB.parameters,
      withoutProjection.state.sideB.parameters,
    );
    assert.equal(withProjection.state.status, withoutProjection.state.status);
    assert.equal(
      withProjection.state.winnerSide,
      withoutProjection.state.winnerSide,
    );
  });
});
