import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParameters, type CharacterSheet } from "./character.js";
import {
  applyBattleWorldTransition,
  createBattleWorldState,
  deriveBattleSceneStateFacts,
} from "./battle-world.js";
import { createBattleSemanticState } from "./semantic-state.js";
import {
  buildCharacterSelfProfileAnchor,
  buildNarratorRenderingProfileAnchor,
  canonicalSelfReference,
  deriveBattleProfileStateOverrides,
  selectNarratorRenderingProfileAnchors,
} from "./profile-grounding.js";

function sheet(input: {
  id: string;
  displayName: string;
  gender: string | null;
  selfNames: string[];
  appearance: string;
}): CharacterSheet {
  return {
    id: input.id,
    ownerUserId: "owner",
    displayName: input.displayName,
    identity: {
      realName: null,
      nicknames: [],
      selfNames: input.selfNames,
      epithets: [],
      gender: input.gender,
      age: null,
    },
    tags: ["非人間"],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    appearance: { summary: input.appearance, visualPrompt: "test" },
    traits: ["慎重"],
    parameters: defaultParameters(),
    basicAttack: {
      name: "共鳴",
      description: "周囲へ低い音を響かせる。",
      targetParameter: "hp",
      scalingParameter: "mag",
      resistanceParameter: "res",
      power: 0.8,
    },
    skills: [{
      id: "echo",
      name: "反響",
      description: "空間そのものを震わせる。",
      costMp: 4,
      costStamina: 0,
      power: 1.2,
      kind: "magic",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "人型を取らない音の精霊。",
  };
}

describe("profile grounding", () => {
  it("freezes a complete mechanics-free own-profile anchor", () => {
    const profile = buildCharacterSelfProfileAnchor(sheet({
      id: "a",
      displayName: "鈴鳴り",
      gender: "女性",
      selfNames: ["わたし", "鈴鳴り"],
      appearance: "光の輪だけが浮かぶ非人型の精霊",
    }));

    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.identity.selfNames), true);
    assert.equal(profile.identity.gender, "女性");
    assert.deepEqual(profile.identity.selfNames, ["わたし", "鈴鳴り"]);
    assert.equal(profile.appearanceSummary, "光の輪だけが浮かぶ非人型の精霊");
    assert.equal(profile.basicAction.name, "共鳴");
    assert.equal(profile.skills[0]?.description, "空間そのものを震わせる。");
    assert.equal("parameters" in profile, false);
    assert.equal("power" in profile.skills[0]!, false);
    assert.equal(canonicalSelfReference(profile), "わたし");
  });

  it("keeps null identity facts unknown instead of inventing them", () => {
    const profile = buildCharacterSelfProfileAnchor(sheet({
      id: "a",
      displayName: "無名の光",
      gender: null,
      selfNames: [],
      appearance: "輪郭を固定しない光",
    }));
    const rendering = buildNarratorRenderingProfileAnchor({
      sheet: sheet({
        id: "a",
        displayName: "無名の光",
        gender: null,
        selfNames: [],
        appearance: "輪郭を固定しない光",
      }),
      side: "a",
    });

    assert.equal(canonicalSelfReference(profile), null);
    assert.equal(rendering.gender, null);
    assert.deepEqual(rendering.selfNames, []);
  });

  it("does not expose the counterpart anchor to character-limited narration", () => {
    const sideA = buildNarratorRenderingProfileAnchor({
      sheet: sheet({
        id: "a",
        displayName: "アオ",
        gender: "女性",
        selfNames: ["私"],
        appearance: "青い影",
      }),
      side: "a",
    });
    const sideB = buildNarratorRenderingProfileAnchor({
      sheet: sheet({
        id: "b",
        displayName: "クロ",
        gender: "男性",
        selfNames: ["僕"],
        appearance: "黒い影",
      }),
      side: "b",
    });

    const self = selectNarratorRenderingProfileAnchors({
      mode: "self",
      sideA,
      sideB,
    });
    const foe = selectNarratorRenderingProfileAnchors({
      mode: "opponent",
      sideA,
      sideB,
    });
    const external = selectNarratorRenderingProfileAnchors({
      mode: "external",
      sideA,
      sideB,
    });

    assert.deepEqual(Object.keys(self), ["a"]);
    assert.deepEqual(Object.keys(foe), ["b"]);
    assert.deepEqual(Object.keys(external).sort(), ["a", "b"]);
    assert.equal(Object.isFrozen(self), true);
  });

  it("projects a removed profile item into both current profile and scene state", () => {
    const character = sheet({
      id: "a",
      displayName: "帽子屋",
      gender: null,
      selfNames: ["私"],
      appearance: "赤い帽子をかぶった帽子屋",
    });
    const base = createBattleWorldState({
      semanticState: createBattleSemanticState({
        scene: "石造りの訓練場",
        sideA: { displayName: "帽子屋" },
        sideB: { displayName: "観客" },
      }),
    });
    const moved = applyBattleWorldTransition({
      state: base,
      turn: 1,
      transition: {
        baseRevision: 0,
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
              description: "帽子屋がかぶっていた赤い帽子。",
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

    const overrides = deriveBattleProfileStateOverrides({
      worldState: moved.state,
      side: "a",
    });
    const ownAnchor = buildCharacterSelfProfileAnchor(character, overrides);
    const narratorAnchor = buildNarratorRenderingProfileAnchor({
      sheet: character,
      side: "a",
      currentStateOverrides: overrides,
    });
    const externalFacts = deriveBattleSceneStateFacts({
      worldState: moved.state,
      participantLabels: { a: "帽子屋", b: "観客" },
    });
    const ownFacts = deriveBattleSceneStateFacts({
      worldState: moved.state,
      observerSide: "a",
    });
    const unawareCounterpartFacts = deriveBattleSceneStateFacts({
      worldState: moved.state,
      observerSide: "b",
    });

    assert.equal(character.appearance.summary, "赤い帽子をかぶった帽子屋");
    assert.equal(ownAnchor.appearanceSummary, "赤い帽子をかぶった帽子屋");
    assert.deepEqual(ownAnchor.currentStateOverrides, overrides);
    assert.deepEqual(narratorAnchor.currentStateOverrides, overrides);
    assert.equal(overrides[0]?.profileField, "appearance");
    assert.match(overrides[0]?.statement ?? "", /訓練場にある/);
    assert.match(overrides[0]?.statement ?? "", /身につけていない/);
    assert.match(externalFacts[0]?.statement ?? "", /赤い帽子.*訓練場にある/);
    assert.match(ownFacts[0]?.statement ?? "", /赤い帽子.*訓練場にある/);
    assert.deepEqual(unawareCounterpartFacts, []);

    const restored = applyBattleWorldTransition({
      state: moved.state,
      turn: 2,
      transition: {
        baseRevision: moved.state.revision,
        turn: 2,
        operations: [{
          op: "set_placement",
          entityId: "object.free.a.hat",
          placement: {
            type: "worn",
            wearerId: "character.a",
            slot: "head",
          },
        }],
      },
    });
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.deepEqual(deriveBattleProfileStateOverrides({
      worldState: restored.state,
      side: "a",
    }), []);
    assert.match(
      deriveBattleSceneStateFacts({
        worldState: restored.state,
        observerSide: "a",
      })[0]?.statement ?? "",
      /自分が身につけている/,
    );
  });
});
