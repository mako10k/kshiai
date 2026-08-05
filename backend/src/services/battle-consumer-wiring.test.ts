import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBattleWorldTransition,
  createBattleState,
  buildCharacterSelfProfileAnchor,
  defaultParameters,
  ensureBattlePerceptionState,
  type CharacterSheet,
} from "@kshiai/shared";
import {
  buildCharacterAgentConsumerInput,
  buildNarratorProfileAnchors,
  buildNarratorSceneStateFacts,
} from "./battle-service.js";

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
      assert.ok(input.decision);
      assert.equal(input.decision.availableActions.length > 0, true);
      for (const action of input.decision.availableActions) {
        assert.equal(action.target.kind === "self" || action.target.kind === "counterpart", true);
        if (action.target.kind === "counterpart") {
          assert.match(
            action.target.perceivedAs,
            input === inputA ? /クロ/ : /アオ/,
          );
        } else {
          assert.equal(action.target.perceivedAs, "自分");
        }
      }
    }
  });

  it("grounds each agent in a frozen complete own profile", () => {
    const sideA = sheet("a", "アオ");
    sideA.identity = {
      realName: null,
      nicknames: [],
      selfNames: ["わたし", "アオ"],
      epithets: [],
      gender: "女性",
      age: null,
    };
    sideA.tags = ["精霊"];
    sideA.appearance.summary = "人型ではない青い光";
    sideA.basicAttack = {
      name: "光波",
      description: "光を波として放つ。",
      targetParameter: "hp",
      scalingParameter: "mag",
      resistanceParameter: "res",
      power: 1,
    };
    const sideB = sheet("b", "クロ");
    sideB.identity = {
      realName: "秘密の名",
      nicknames: [],
      selfNames: ["俺"],
      epithets: [],
      gender: "男性",
      age: null,
    };
    const state = createBattleState({
      id: "profile-consumer",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const inputA = buildCharacterAgentConsumerInput({
      state,
      sheet: sideA,
      side: "a",
      previous: { ...previous, selfReference: "俺" },
    });

    assert.ok(inputA);
    assert.equal(inputA.character.identity.gender, "女性");
    assert.deepEqual(inputA.character.identity.selfNames, ["わたし", "アオ"]);
    assert.equal(inputA.character.appearanceSummary, "人型ではない青い光");
    assert.equal(inputA.character.basicAction.name, "光波");
    assert.equal(inputA.previous.selfReference, "わたし");
    assert.equal(Object.isFrozen(inputA.character), true);
    assert.equal(Object.isFrozen(inputA.character.identity), true);
    assert.equal("parameters" in inputA.character, false);
    assert.equal(JSON.stringify(inputA.character).includes("秘密の名"), false);
    assert.deepEqual(inputA.character, buildCharacterSelfProfileAnchor(sideA));
  });

  it("filters prologue and aftermath rendering anchors by narration focus", () => {
    const sideA = sheet("a", "アオ");
    sideA.identity = {
      realName: null,
      nicknames: [],
      selfNames: ["わたし", "アオ"],
      epithets: [],
      gender: "女性",
      age: null,
    };
    const sideB = sheet("b", "クロ");
    sideB.identity = {
      realName: null,
      nicknames: [],
      selfNames: [],
      epithets: [],
      gender: null,
      age: null,
    };

    const self = buildNarratorProfileAnchors({
      mine: sideA,
      opp: sideB,
      perspective: "self",
      focus: "self",
    });
    const foe = buildNarratorProfileAnchors({
      mine: sideA,
      opp: sideB,
      perspective: "fluid",
      focus: "foe",
    });
    const external = buildNarratorProfileAnchors({
      mine: sideA,
      opp: sideB,
      perspective: "external",
      focus: "external",
    });

    assert.deepEqual(Object.keys(self), ["a"]);
    assert.equal(self.a?.gender, "女性");
    assert.deepEqual(Object.keys(foe), ["b"]);
    assert.equal(foe.b?.gender, null);
    assert.deepEqual(Object.keys(external).sort(), ["a", "b"]);
    assert.equal(Object.isFrozen(external), true);
  });

  it("wires canonical profile and scene projections without mutating the sheet", () => {
    const sideA = sheet("a", "帽子屋");
    sideA.appearance.summary = "赤い帽子をかぶっている";
    const sideB = sheet("b", "観客");
    const state = createBattleState({
      id: "profile-state-overlay",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    assert.ok(state.worldState);
    const moved = applyBattleWorldTransition({
      state: state.worldState,
      turn: 1,
      transition: {
        baseRevision: state.worldState.revision,
        turn: 1,
        operations: [{
          op: "add_entity",
          entityId: "object.free.a.hat",
          entity: {
            kind: "object",
            active: true,
            presence: "present",
            placement: { type: "scene", areaId: "area.1" },
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
            },
            objectProfile: {
              canonicalLabel: "赤い帽子",
              description: "帽子屋の赤い帽子。",
              sourceRef: "profile:a:appearance",
              candidateKey: "red-hat",
              provenance: "profile_appearance",
              knownOpenAspects: [],
              observerRefs: { a: "profile:a:appearance" },
              observerLabels: { a: "赤い帽子" },
              concretizations: [],
            },
          },
        }],
      },
    });
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    const after = { ...state, worldState: moved.state };

    const characterInput = buildCharacterAgentConsumerInput({
      state: after,
      sheet: sideA,
      counterpartSheet: sideB,
      side: "a",
      previous,
    });
    const narratorAnchors = buildNarratorProfileAnchors({
      state: after,
      mine: sideA,
      opp: sideB,
      perspective: "external",
      focus: "external",
    });
    const externalScene = buildNarratorSceneStateFacts({
      state: after,
      mine: sideA,
      opp: sideB,
      perspective: "external",
      focus: "external",
    });
    const unawareScene = buildNarratorSceneStateFacts({
      state: after,
      mine: sideA,
      opp: sideB,
      perspective: "fluid",
      focus: "foe",
    });

    assert.ok(characterInput);
    assert.equal(characterInput.character.appearanceSummary, "赤い帽子をかぶっている");
    assert.match(
      characterInput.character.currentStateOverrides?.[0]?.statement ?? "",
      /身につけていない/,
    );
    assert.match(
      narratorAnchors.a?.currentStateOverrides?.[0]?.statement ?? "",
      /にある/,
    );
    assert.match(externalScene[0]?.statement ?? "", /赤い帽子.*にある/);
    assert.deepEqual(unawareScene, []);
    assert.equal(sideA.appearance.summary, "赤い帽子をかぶっている");
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
        percepts: [],
        apparentIdentity: undefined,
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

    const transformedState = structuredClone(state);
    transformedState.perceptionFrameA = {
      ...transformedState.perceptionFrameA!,
      counterpart: {
        ...transformedState.perceptionFrameA!.counterpart,
        identityKnowledge: "identified",
        currentAccess: "clear",
        perceivedAs: "白狼",
        apparentIdentity: {
          form: "白い狼の姿",
          identity: "白狼",
          confidence: "probable",
          continuity: "unlinked",
        },
      },
    };
    const transformed = buildCharacterAgentConsumerInput({
      state: transformedState,
      sheet: sideA,
      side: "a",
      previous,
    });
    assert.ok(transformed);
    assert.equal(transformed.counterpart, undefined);
    assert.equal(
      transformed.perception.counterpart.apparentIdentity?.identity,
      "白狼",
    );
    assert.equal(JSON.stringify(transformed).includes("クロ"), false);

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

  it("gives legacy-seeded consumers the visible setup counterpart", () => {
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
    assert.deepEqual(inputA.counterpart, {
      displayName: "クロ",
      condition: "steady",
    });
    assert.equal(inputA.perception.counterpart.identityKnowledge, "identified");
    assert.equal(inputA.perception.counterpart.currentAccess, "clear");
    assert.equal(Object.isFrozen(inputA.perception), true);
  });
});
