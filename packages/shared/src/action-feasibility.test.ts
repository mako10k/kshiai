import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildObserverSafeAvailableActions,
  revalidateCharacterAction,
} from "./action-feasibility.js";
import { createBattleState } from "./battle-engine.js";
import type { CharacterSheet } from "./character.js";

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
    parameters: {
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      stamina: 30,
      maxStamina: 30,
      atk: 10,
      def: 10,
      spd: 10,
      mag: 10,
      res: 10,
      focus: 10,
      luck: 10,
    },
    basicAttack: {
      name: `${displayName}の働きかけ`,
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
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: displayName,
  };
}

function setup() {
  const sideA = sheet("a", "アルファ");
  const sideB = sheet("b", "ベータ");
  const state = createBattleState({
    id: "action-feasibility",
    sideA,
    sideB,
    turnLimit: 20,
    prologuePending: false,
  });
  assert.ok(state.worldState);
  assert.ok(state.perceptionFrameA);
  assert.ok(state.perceptionFrameB);
  return { sideA, sideB, state };
}

describe("observer-safe action feasibility", () => {
  it("uses perceived labels and removes an out-of-range counterpart action", () => {
    const { sideA, state } = setup();
    const near = buildObserverSafeAvailableActions({
      actorSide: "a",
      actor: state.sideA,
      sheet: sideA,
      turn: 1,
      worldState: state.worldState,
      perception: state.perceptionFrameA!,
    });
    const basic = near.find((action) => action.kind === "basic_attack");
    assert.ok(basic);
    assert.equal(basic.target.perceivedAs, state.perceptionFrameA!.counterpart.perceivedAs);
    assert.doesNotMatch(JSON.stringify(near), /ベータ/);

    const farWorld = structuredClone(state.worldState!);
    farWorld.pairRelations[0]!.distance = "far";
    const far = buildObserverSafeAvailableActions({
      actorSide: "a",
      actor: state.sideA,
      sheet: sideA,
      turn: 1,
      worldState: farWorld,
      perception: state.perceptionFrameA!,
    });
    assert.equal(far.some((action) => action.kind === "basic_attack"), false);
    assert.deepEqual(
      far.map((action) => action.kind).sort(),
      ["defend", "rest", "wait"],
    );
  });

  it("reflects restraint and held-object usability without exposing object IDs", () => {
    const { sideA, state } = setup();
    sideA.skills = [{
      id: "tool-skill",
      name: "道具の技",
      description: "保持中の道具を使う。",
      costMp: 0,
      costStamina: 0,
      power: 1,
      kind: "support",
      constraints: {
        reach: "same_area",
        requiresSight: false,
        mobility: "none",
        requiresSpeech: false,
        requiresUsableHeldObject: true,
      },
    }];
    const world = structuredClone(state.worldState!);
    world.entities["object.private-tool"] = {
      kind: "object",
      active: true,
      presence: "present",
      placement: { type: "held", holderId: "character.a" },
      exposure: "exposed",
      actorState: null,
      objectState: {
        portable: true,
        usable: false,
        exclusiveUse: true,
        usableBy: ["character.a"],
        cover: "none",
        blocksMovement: false,
        visionEffect: "none",
        hearingEffect: "none",
        mobilityEffect: "none",
      },
      createdTurn: 0,
      updatedTurn: 0,
    };
    const before = buildObserverSafeAvailableActions({
      actorSide: "a",
      actor: state.sideA,
      sheet: sideA,
      turn: 1,
      worldState: world,
      perception: state.perceptionFrameA!,
    });
    assert.equal(before.some((action) => action.skillId === "tool-skill"), false);
    world.entities["object.private-tool"]!.objectState!.usable = true;
    const after = buildObserverSafeAvailableActions({
      actorSide: "a",
      actor: state.sideA,
      sheet: sideA,
      turn: 1,
      worldState: world,
      perception: state.perceptionFrameA!,
    });
    assert.equal(after.some((action) => action.skillId === "tool-skill"), true);
    assert.doesNotMatch(JSON.stringify(after), /object\.private-tool|character\.a/);
  });

  it("substitutes, partially downgrades, or fails with canonical reasons", () => {
    const { sideA, state } = setup();
    const costly = {
      id: "costly",
      name: "大技",
      description: "力を使う。",
      costMp: 20,
      costStamina: 0,
      power: 1,
      kind: "attack" as const,
    };
    const actorWithoutMp = {
      ...state.sideA,
      parameters: { ...state.sideA.parameters, mp: 0 },
    };
    const substituted = revalidateCharacterAction({
      actorSide: "a",
      requested: { kind: "skill", skillId: "costly" },
      actor: actorWithoutMp,
      skills: [costly],
      basicAttack: sideA.basicAttack!,
      turn: 10,
      worldState: state.worldState,
      perception: state.perceptionFrameA,
    });
    assert.equal(substituted.action?.kind, "rest");
    assert.deepEqual(substituted.resolution, {
      requested: { kind: "skill", skillId: "costly" },
      outcome: "substituted",
      reason: "insufficient_resource",
    });

    const partial = revalidateCharacterAction({
      actorSide: "a",
      requested: { kind: "skill", skillId: "costly", useFinisher: true },
      actor: state.sideA,
      skills: [costly],
      basicAttack: sideA.basicAttack!,
      finisher: { skillId: "costly", skillName: "大技", source: "derived", used: true, usedTurn: 9 },
      turn: 10,
      worldState: state.worldState,
      perception: state.perceptionFrameA,
    });
    assert.equal(partial.action?.kind, "skill");
    assert.equal(partial.action?.useFinisher, undefined);
    assert.equal(partial.resolution.outcome, "partial");
    assert.equal(partial.resolution.reason, "finisher_unavailable");

    const unconsciousWorld = structuredClone(state.worldState!);
    unconsciousWorld.entities["character.a"]!.actorState!.consciousness = "unconscious";
    const failed = revalidateCharacterAction({
      actorSide: "a",
      requested: { kind: "defend" },
      actor: state.sideA,
      skills: [],
      basicAttack: sideA.basicAttack!,
      turn: 1,
      worldState: unconsciousWorld,
      perception: state.perceptionFrameA,
    });
    assert.equal(failed.action, null);
    assert.equal(failed.resolution.outcome, "failed");
    assert.equal(failed.resolution.reason, "actor_unavailable");
  });

  it("produces the same candidate kinds when A and B are swapped", () => {
    const { sideA, sideB, state } = setup();
    const actionsA = buildObserverSafeAvailableActions({
      actorSide: "a",
      actor: state.sideA,
      sheet: sideA,
      turn: 1,
      worldState: state.worldState,
      perception: state.perceptionFrameA!,
    });
    const actionsB = buildObserverSafeAvailableActions({
      actorSide: "b",
      actor: state.sideB,
      sheet: sideB,
      turn: 1,
      worldState: state.worldState,
      perception: state.perceptionFrameB!,
    });
    assert.deepEqual(
      actionsA.map((action) => action.kind).sort(),
      actionsB.map((action) => action.kind).sort(),
    );
  });
});
