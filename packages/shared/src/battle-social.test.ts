import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBattleEncounterContext,
  buildLegacyBattleEncounterContext,
  createBattleState,
  defaultParameters,
  updateBattleNarratorContinuity,
  type CharacterSheet,
} from "./index.js";

function sheet(
  id: string,
  displayName: string,
  nicknames: string[],
  selfNames: string[],
): CharacterSheet {
  const now = new Date(0).toISOString();
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName,
    identity: {
      realName: displayName,
      nicknames,
      selfNames,
      epithets: [],
      gender: null,
      age: null,
    },
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: displayName, visualPrompt: displayName },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: displayName,
  };
}

describe("battle encounter and narrator continuity", () => {
  it("validates battle-label collisions and profile-backed self references", () => {
    const a = sheet("a", "明良", ["アキ"], ["僕", "俺"]);
    const b = sheet("b", "晶", ["アキ"], ["私"]);
    const context = buildBattleEncounterContext({
      sideA: a,
      sideB: b,
      proposal: {
        participants: {
          a: { battleLabel: "ＡＫＩ" },
          b: { battleLabel: "aki" },
        },
        social: {
          a: {
            relationshipLabel: "以前から競い合う相手",
            counterpartAddress: "晶さん",
            selfReference: "俺",
          },
          b: { selfReference: "拙者" },
        },
      },
    });
    assert.notEqual(
      context.participants.a.battleLabel,
      context.participants.b.battleLabel,
    );
    assert.equal(context.social.a.selfReference, "俺");
    assert.equal(context.social.b.selfReference, "私");
    assert.equal(context.social.a.initialIdentityKnowledge, "identified");
  });

  it("updates A and B narrator records together without merging them", () => {
    const a = sheet("a", "明良", [], ["僕"]);
    const b = sheet("b", "晶", [], ["私"]);
    const state = createBattleState({
      id: "parallel-continuity",
      sideA: a,
      sideB: b,
      turnLimit: 20,
    });
    const continuity = updateBattleNarratorContinuity({
      turn: 2,
      encounter: state.encounterContext!,
      frameA: state.perceptionFrameA!,
      frameB: state.perceptionFrameB!,
      agentStateA: {
        ...state.agentStateA!,
        beliefs: ["相手は間合いを測っている"],
      },
      agentStateB: {
        ...state.agentStateB!,
        beliefs: ["相手は先手を狙っている"],
      },
      previous: state.narratorContinuity,
    });
    assert.equal(continuity.a.turn, 2);
    assert.equal(continuity.b.turn, 2);
    assert.match(continuity.a.unresolvedThreads.join(" "), /間合い/);
    assert.doesNotMatch(continuity.b.unresolvedThreads.join(" "), /間合い/);
    assert.match(continuity.b.unresolvedThreads.join(" "), /先手/);
  });

  it("builds deterministic legacy context without public prose", () => {
    const context = buildLegacyBattleEncounterContext({
      sideAName: "同名",
      sideBName: "同名",
      selfReferenceA: "私",
    });
    assert.notEqual(
      context.participants.a.battleLabel,
      context.participants.b.battleLabel,
    );
    assert.equal(context.social.a.selfReference, "私");
    assert.equal(context.social.b.initialIdentityKnowledge, "identified");
  });
});
