import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-battle-improve-"));
process.env.DATABASE_PATH = join(tempDir, "test.db");

const { saveBattle, searchCharacterBattleHistory, countFinishedBattlesForCharacter, getCharacterBattleDetail } =
  await import("./battles.js");
const { defaultParameters } = await import("@kshiai/shared");
import type { BattleState } from "@kshiai/shared";

function makeFinishedBattle(input: {
  id: string;
  characterId: string;
  opponentId: string;
  selfName: string;
  oppName: string;
  winnerSide: "a" | "b" | "draw";
  scene?: string;
}): BattleState {
  const t = new Date().toISOString();
  return {
    id: input.id,
    status: "finished",
    turn: 5,
    turnLimit: 20,
    sideA: {
      characterId: input.characterId,
      displayName: input.selfName,
      parameters: defaultParameters(),
      defending: false,
      canFight: true,
      irreversibleIncapacitated: false,
    },
    sideB: {
      characterId: input.opponentId,
      displayName: input.oppName,
      parameters: defaultParameters(),
      defending: false,
      canFight: true,
      irreversibleIncapacitated: false,
    },
    policiesA: [],
    selectedPolicyIdsA: [],
    policiesB: [],
    selectedPolicyIdsB: [],
    situation: {
      scene: input.scene ?? "練習場",
      notes: "",
      coefficients: {},
      tags: [],
    },
    prologuePending: false,
    aftermathPending: false,
    turnRecords: [
      {
        turn: 1,
        events: [
          {
            type: "damage",
            actorName: input.selfName,
            targetName: input.oppName,
            skillName: "先手のひらめき",
            intensity: "moderate",
            summary: `${input.selfName} が先手のひらめきを繰り出した`,
          },
        ],
        sideAChange: {
          parameterChanges: {},
          defendingBefore: false,
          defendingAfter: false,
          canFightBefore: true,
          canFightAfter: true,
        },
        sideBChange: {
          parameterChanges: {},
          defendingBefore: false,
          defendingAfter: false,
          canFightBefore: true,
          canFightAfter: true,
        },
        cognitionA: {
          turn: 1,
          scene: input.scene ?? "練習場",
          ownCondition: "steady",
          foeCondition: "steady",
          parameterChanges: {},
          observedEvents: [],
        },
        cognitionB: {
          turn: 1,
          scene: input.scene ?? "練習場",
          ownCondition: "steady",
          foeCondition: "steady",
          parameterChanges: {},
          observedEvents: [],
        },
        agentStateChangeA: null,
        agentStateChangeB: null,
      },
    ],
    log: [
      {
        turn: 1,
        narrator: ["戦いが始まった。"],
        speeches: [],
      },
    ],
    winnerSide: input.winnerSide,
    finishReason: "incapacitated",
    createdAt: t,
    updatedAt: t,
  };
}

describe("character battle history tools", () => {
  const characterId = "chr_self";
  const opponentId = "chr_opp";

  it("indexes finished battles and supports search/detail", () => {
    saveBattle(
      makeFinishedBattle({
        id: "bat_1",
        characterId,
        opponentId,
        selfName: "アオイ",
        oppName: "カゲ",
        winnerSide: "a",
        scene: "雨の路地",
      }),
      {
        sideAUserId: "usr_1",
        sideACharacterId: characterId,
        sideBCharacterId: opponentId,
      },
    );
    saveBattle(
      makeFinishedBattle({
        id: "bat_2",
        characterId,
        opponentId: "chr_opp2",
        selfName: "アオイ",
        oppName: "ヒカリ",
        winnerSide: "b",
        scene: "闘技場",
      }),
      {
        sideAUserId: "usr_1",
        sideACharacterId: characterId,
        sideBCharacterId: "chr_opp2",
      },
    );

    assert.equal(countFinishedBattlesForCharacter(characterId), 2);

    const all = searchCharacterBattleHistory({ characterId, query: "" });
    assert.equal(all.length, 2);
    assert.equal(all[0]?.result === "win" || all[0]?.result === "loss", true);

    const byOpp = searchCharacterBattleHistory({
      characterId,
      query: "ヒカリ",
    });
    assert.equal(byOpp.length, 1);
    assert.equal(byOpp[0]?.opponentName, "ヒカリ");
    assert.equal(byOpp[0]?.result, "loss");

    const detail = getCharacterBattleDetail(characterId, "bat_1");
    assert.ok(detail);
    assert.equal(detail!.result, "win");
    assert.ok(detail!.skillMentions.includes("先手のひらめき"));
    assert.ok(detail!.narrationExcerpts.length >= 1);
  });
});
