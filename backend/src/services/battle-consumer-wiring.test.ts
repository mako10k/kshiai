import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBattleState,
  defaultParameters,
  ensureBattlePerceptionState,
  type CharacterSheet,
} from "@kshiai/shared";
import { buildCharacterAgentConsumerInput } from "./battle-service.js";

function sheet(id: string, displayName: string): CharacterSheet {
  const now = "2026-08-04T00:00:00.000Z";
  return {
    id,
    ownerUserId: "owner",
    displayName,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: `${displayName}の外見`, visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: `${displayName}の物語。`,
  };
}

const previous = {
  privateMemory: "前ターンまでの記憶",
  currentGoal: "状況を確かめる",
  emotion: "警戒",
  beliefs: [],
  observations: [],
  speechStyle: "短く話す",
  selfReference: "私",
  lastSpeech: null,
};

describe("battle perception consumer wiring", () => {
  it("wires A and B only to their own frozen perception frame", () => {
    const sideA = sheet("a", "アオ");
    const sideB = sheet("b", "クロ");
    const state = createBattleState({
      id: "consumer-wiring",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const inputA = buildCharacterAgentConsumerInput({
      state,
      sheet: sideA,
      side: "a",
      previous,
    });
    const inputB = buildCharacterAgentConsumerInput({
      state,
      sheet: sideB,
      side: "b",
      previous,
    });

    assert.ok(inputA);
    assert.ok(inputB);
    assert.equal(inputA.perception.observer.side, "a");
    assert.equal(inputB.perception.observer.side, "b");
    assert.equal(inputA.perception.observer.self, "self");
    assert.equal(inputB.perception.observer.self, "self");
    assert.equal(Object.isFrozen(inputA.perception), true);
    assert.equal(Object.isFrozen(inputB.perception), true);
    assert.notEqual(inputA.perception, state.perceptionFrameA);
    assert.notEqual(inputB.perception, state.perceptionFrameB);
    for (const input of [inputA, inputB]) {
      assert.equal("foeName" in input, false);
      assert.equal("cognition" in input, false);
      assert.equal("observation" in input, false);
      assert.equal(input.decision.availableActions.length > 0, true);
    }
  });

  it("reveals counterpart name and condition only at the frame's knowledge level", () => {
    const sideA = sheet("a", "アオ");
    const sideB = sheet("b", "クロ");
    const state = createBattleState({
      id: "consumer-knowledge",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const unknownState = structuredClone(state);
    unknownState.perceptionFrameA = {
      ...unknownState.perceptionFrameA!,
      counterpart: {
        ...unknownState.perceptionFrameA!.counterpart,
        identityKnowledge: "unknown",
        currentAccess: "none",
        perceivedAs: "判別できない気配",
      },
    };
    const unknown = buildCharacterAgentConsumerInput({
      state: unknownState,
      sheet: sideA,
      side: "a",
      previous,
    });
    assert.ok(unknown);
    assert.equal(unknown.counterpart, undefined);
    assert.equal(JSON.stringify(unknown).includes("クロ"), false);

    const knownState = structuredClone(state);
    knownState.perceptionFrameA = {
      ...knownState.perceptionFrameA!,
      counterpart: {
        ...knownState.perceptionFrameA!.counterpart,
        identityKnowledge: "identified",
        currentAccess: "none",
        perceivedAs: "クロだと知っているが、現在は知覚できない",
      },
    };
    const knownButLost = buildCharacterAgentConsumerInput({
      state: knownState,
      sheet: sideA,
      side: "a",
      previous,
    });
    assert.deepEqual(knownButLost?.counterpart, { displayName: "クロ" });

    const accessibleState = structuredClone(knownState);
    accessibleState.sideB.parameters.hp = 1;
    accessibleState.perceptionFrameA = {
      ...accessibleState.perceptionFrameA!,
      counterpart: {
        ...accessibleState.perceptionFrameA!.counterpart,
        currentAccess: "coarse",
      },
    };
    const accessible = buildCharacterAgentConsumerInput({
      state: accessibleState,
      sheet: sideA,
      side: "a",
      previous,
    });
    assert.deepEqual(accessible?.counterpart, {
      displayName: "クロ",
      condition: "critical",
    });
  });

  it("gives legacy-seeded consumers the setup counterpart name without condition", () => {
    const sideA = sheet("a", "アオ");
    const sideB = sheet("b", "クロ");
    const base = createBattleState({
      id: "legacy-consumer",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const legacy = ensureBattlePerceptionState({
      ...base,
      perceptionFrameA: undefined,
      perceptionFrameB: undefined,
      perceptionRegistryA: undefined,
      perceptionRegistryB: undefined,
    });
    const inputA = buildCharacterAgentConsumerInput({
      state: legacy,
      sheet: sideA,
      side: "a",
      previous,
    });
    assert.ok(inputA);
    assert.deepEqual(inputA.counterpart, { displayName: "クロ" });
    assert.equal(inputA.perception.counterpart.identityKnowledge, "identified");
    assert.equal(inputA.perception.counterpart.currentAccess, "none");
    assert.equal(Object.isFrozen(inputA.perception), true);
  });
});
