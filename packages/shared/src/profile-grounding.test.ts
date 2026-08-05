import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParameters, type CharacterSheet } from "./character.js";
import {
  buildCharacterSelfProfileAnchor,
  buildNarratorRenderingProfileAnchor,
  canonicalSelfReference,
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
});
