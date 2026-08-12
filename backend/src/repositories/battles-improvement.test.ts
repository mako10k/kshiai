import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-battle-improve-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");

const { saveBattle, getBattle, listBattlesForUser, searchCharacterBattleHistory, countFinishedBattlesForCharacter, getCharacterBattleDetail } =
  await import("./battles.js");
const { query } = await import("../db.js");
const { saveBattlePresentation } = await import("./battle-presentations.js");
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
        actions: [],
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

  it("indexes finished battles and supports search/detail", async () => {
    await saveBattle(
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
    await saveBattlePresentation({
      battleId: "bat_1",
      receiptId: "bat_1:phase:1",
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      inputDigest: "c".repeat(64),
      narrative: { turn: 1, narrator: ["read-model narration"], speeches: [] },
      createdAt: new Date().toISOString(),
    });
    await saveBattle(
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

    assert.equal(await countFinishedBattlesForCharacter(characterId), 2);

    const all = await searchCharacterBattleHistory({ characterId, query: "" });
    assert.equal(all.length, 2);
    assert.equal(all[0]?.result === "win" || all[0]?.result === "loss", true);

    const byOpp = await searchCharacterBattleHistory({
      characterId,
      query: "ヒカリ",
    });
    assert.equal(byOpp.length, 1);
    assert.equal(byOpp[0]?.opponentName, "ヒカリ");
    assert.equal(byOpp[0]?.result, "loss");

    const detail = await getCharacterBattleDetail(characterId, "bat_1");
    assert.ok(detail);
    assert.equal(detail!.result, "win");
    assert.ok(detail!.skillMentions.includes("先手のひらめき"));
    assert.ok(detail!.narrationExcerpts.length >= 1);
    assert.equal(detail!.narrationExcerpts.includes("read-model narration"), true);
    const legacyLoaded = await getBattle("bat_1");
    assert.equal(legacyLoaded?.pipelineAuthorityVersion, 1);
    assert.equal(legacyLoaded?.semanticState?.revision, 0);
    assert.equal(legacyLoaded?.worldState?.revision, 0);
    assert.equal(legacyLoaded?.worldState?.pairRelations[0]?.distance, "near");
    assert.equal(
      legacyLoaded?.semanticState?.entities["character.a"]?.label,
      "アオイ",
    );
  });

  it("rejects a stale battle revision after a committed advance", async () => {
    const meta = {
      sideAUserId: "usr_revision",
      sideACharacterId: characterId,
      sideBCharacterId: opponentId,
    };
    const base = {
      ...makeFinishedBattle({
        id: "bat_revision_cas",
        characterId,
        opponentId,
        selfName: "アオイ",
        oppName: "カゲ",
        winnerSide: "a",
      }),
      battleRevision: 0,
    } satisfies BattleState;
    await saveBattle(base, meta);

    const startedAt = new Date().toISOString();
    const stale = {
      ...base,
      advanceOperation: {
        schemaVersion: 1 as const,
        operationId: "op_stale",
        expectedRevision: 0,
        status: "active" as const,
        phase: "combat" as const,
        startedAt,
        completedAt: null,
        receiptIds: [],
      },
    };
    const committed = {
      ...base,
      battleRevision: 1,
      advanceOperation: {
        ...stale.advanceOperation,
        operationId: "op_committed",
        status: "completed" as const,
        completedAt: startedAt,
        receiptIds: ["bat_revision_cas:phase:1"],
      },
    };
    await saveBattle(committed, { ...meta, expectedRevision: 0 });

    await assert.rejects(
      saveBattle(stale, meta),
      /BATTLE_REVISION_CONFLICT/,
    );
    assert.equal((await getBattle(base.id))?.battleRevision, 1);
  });

  it("keeps an invalid legacy battle visible as a degraded history row", async () => {
    const state = makeFinishedBattle({
      id: "bat_degraded_history",
      characterId,
      opponentId,
      selfName: "アオイ",
      oppName: "カゲ",
      winnerSide: "a",
    }) as unknown as Record<string, unknown>;
    state.agentStateA = { currentGoal: "長".repeat(400) };
    await query(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id, side_b_character_id,
         created_at, updated_at, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [state.id, JSON.stringify(state), "usr_degraded", characterId, opponentId,
        state.createdAt, state.updatedAt],
    );

    const listed = await listBattlesForUser({ userId: "usr_degraded" });
    assert.equal(listed.total, 1);
    assert.equal(listed.battles[0]?.id, "bat_degraded_history");
    assert.equal(listed.battles[0]?.integrityStatus, "degraded");
    assert.equal(listed.battles[0]?.canResume, false);
  });

  it("rejects a schema-invalid state before persistence", async () => {
    const invalid = makeFinishedBattle({
      id: "bat_invalid_write",
      characterId,
      opponentId,
      selfName: "アオイ",
      oppName: "カゲ",
      winnerSide: "a",
    }) as BattleState & { turn: unknown };
    invalid.turn = Number.NaN;

    await assert.rejects(
      saveBattle(invalid as BattleState, {
        sideAUserId: "usr_invalid",
        sideACharacterId: characterId,
        sideBCharacterId: opponentId,
      }),
    );
    assert.equal(await getBattle("bat_invalid_write"), null);
  });
});
