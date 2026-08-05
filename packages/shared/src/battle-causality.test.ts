import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBattleCausalCoefficients,
  deriveBattleActorCausality,
} from "./battle-causality.js";
import { createBattleState, resolveTurn } from "./battle-engine.js";
import type { BattleWorldState, WorldObjectState } from "./battle-world.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import { quantizeCommittedMechanicalEvidence } from "./perception-quantization.js";
import { projectObserverPerception } from "./perception-projection.js";

function sheet(id: string, displayName: string): CharacterSheet {
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName,
    tags: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    appearance: { summary: `${displayName}の姿`, visualPrompt: displayName },
    traits: [],
    parameters: defaultParameters({ hp: 200, maxHp: 200 }),
    skills: [{
      id: "strike",
      name: "打撃",
      description: "相手へ打撃を加える。",
      costMp: 0,
      costStamina: 0,
      power: 1,
      kind: "attack",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: displayName,
  };
}

function objectState(
  changes: Partial<WorldObjectState> = {},
): WorldObjectState {
  return {
    portable: false,
    usable: false,
    exclusiveUse: false,
    usableBy: [],
    cover: "none",
    blocksMovement: false,
    visionEffect: "none",
    hearingEffect: "none",
    mobilityEffect: "none",
    ...changes,
  };
}

function addAttachedEffect(
  world: BattleWorldState,
  input: {
    id: string;
    targetSide: "a" | "b";
    state: Partial<WorldObjectState>;
  },
): void {
  world.entities[input.id] = {
    kind: "effect",
    active: true,
    presence: "present",
    placement: {
      type: "attached",
      anchorId: `character.${input.targetSide}`,
    },
    exposure: "hidden",
    actorState: null,
    objectState: objectState(input.state),
    createdTurn: 0,
    updatedTurn: 0,
  };
}

function setup(id: string) {
  const sideA = sheet("a", "アルファ");
  const sideB = sheet("b", "ベータ");
  const state = createBattleState({
    id,
    sideA,
    sideB,
    turnLimit: 20,
    prologuePending: false,
  });
  assert.ok(state.worldState);
  assert.ok(state.semanticState);
  return { sideA, sideB, state };
}

describe("structured battle causality", () => {
  it("combines character, area, and attached effects into one effective state", () => {
    const { state } = setup("causal-state");
    const world = structuredClone(state.worldState!);
    const areaId = world.entities["character.b"]!.placement.type === "scene"
      ? world.entities["character.b"]!.placement.areaId
      : "";
    world.areas[areaId]!.movement = "restricted";
    world.areas[areaId]!.noise = "loud";
    addAttachedEffect(world, {
      id: "effect.unseen-bind",
      targetSide: "b",
      state: {
        cover: "full",
        visionEffect: "block",
        mobilityEffect: "immobilize",
      },
    });

    const causal = deriveBattleActorCausality({
      worldState: world,
      actorSide: "b",
    });

    assert.equal(causal.effectiveActorState?.vision, "blocked");
    assert.equal(causal.effectiveActorState?.hearing, "impaired");
    assert.equal(causal.effectiveActorState?.mobility, "immobilized");
    assert.equal(causal.cover, "full");
    assert.equal(causal.damageReceivedMultiplier, 0.5);
    assert.ok(causal.damageDealtMultiplier < 1);
    assert.deepEqual(
      causal.sources.map(({ sourceId }) => sourceId),
      [areaId, "effect.unseen-bind"],
    );

    const perceived = projectObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState!,
      worldState: world,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      sensoryEvidence: [],
      previousFrame: state.perceptionFrameB,
      previousRegistry: state.perceptionRegistryB,
    });
    assert.equal(perceived.frame.counterpart.currentAccess, "none");
    assert.doesNotMatch(JSON.stringify(perceived.frame), /effect\.unseen-bind/);
  });

  it("applies the same cover coefficient after swapping A and B", () => {
    const { state } = setup("causal-symmetry");
    const situation = {
      scene: "対決の場",
      notes: "",
      coefficients: { damage: 1 },
      tags: [],
    };
    const coverB = structuredClone(state.worldState!);
    addAttachedEffect(coverB, {
      id: "effect.cover",
      targetSide: "b",
      state: { cover: "full" },
    });
    const aIntoB = applyBattleCausalCoefficients({
      situation,
      worldState: coverB,
      actorSide: "a",
      targetSide: "b",
    });

    const coverA = structuredClone(state.worldState!);
    addAttachedEffect(coverA, {
      id: "effect.cover",
      targetSide: "a",
      state: { cover: "full" },
    });
    const bIntoA = applyBattleCausalCoefficients({
      situation,
      worldState: coverA,
      actorSide: "b",
      targetSide: "a",
    });

    assert.equal(aIntoB.coefficients.damage, 0.5);
    assert.equal(bIntoA.coefficients.damage, 0.5);
  });

  it("changes canonical damage without leaking an unperceived cause", () => {
    const baseline = setup("causal-baseline");
    baseline.state.plannedActionB = { kind: "wait" };
    const baselineResolved = resolveTurn({
      state: baseline.state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "strike" },
      sideASkills: baseline.sideA.skills,
      sideBSkills: baseline.sideB.skills,
    });
    const baselineDamage = (baseline.state.sideB.parameters.hp ?? 0) -
      (baselineResolved.state.sideB.parameters.hp ?? 0);

    const influenced = setup("causal-influenced");
    influenced.state.plannedActionB = { kind: "wait" };
    influenced.state.semanticState!.entities["effect.unseen-cover"] = {
      kind: "effect",
      label: "認知されていない防護",
      location: { type: "attached", entityId: "character.b" },
      active: true,
      createdTurn: 0,
      updatedTurn: 0,
      facts: {},
      visibleTo: ["b"],
    };
    addAttachedEffect(influenced.state.worldState!, {
      id: "effect.unseen-cover",
      targetSide: "b",
      state: { cover: "full" },
    });
    const influencedResolved = resolveTurn({
      state: influenced.state,
      playerAction: { actorSide: "a", kind: "skill", skillId: "strike" },
      sideASkills: influenced.sideA.skills,
      sideBSkills: influenced.sideB.skills,
    });
    const influencedDamage = (influenced.state.sideB.parameters.hp ?? 0) -
      (influencedResolved.state.sideB.parameters.hp ?? 0);

    assert.ok(influencedDamage < baselineDamage);
    assert.doesNotMatch(
      JSON.stringify(influencedResolved.events),
      /effect\.unseen-cover|認知されていない防護/,
    );

    const projected = projectObserverPerception({
      observerSide: "a",
      turn: influencedResolved.state.turn,
      semanticState: influenced.state.semanticState!,
      worldState: influenced.state.worldState,
      events: influencedResolved.events,
      quantizedMechanicalEvidence: quantizeCommittedMechanicalEvidence(
        influencedResolved.mechanicalEvidence,
      ),
      reserveEvidence: [],
      sensoryEvidence: [],
      previousFrame: influenced.state.perceptionFrameA,
      previousRegistry: influenced.state.perceptionRegistryA,
    });
    assert.ok(projected.frame.qualitativeChanges.length > 0);
    assert.doesNotMatch(
      JSON.stringify(projected.frame),
      /effect\.unseen-cover|認知されていない防護/,
    );
  });
});
