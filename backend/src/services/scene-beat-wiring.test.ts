import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBattleState,
  defaultParameters,
  openSceneBeat,
  type CharacterSheet,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-scene-beat-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "scene-beat.db");

const { closeDatabase, query } = await import("../db.js");
const { advanceTurn, completeAdvancePhases, startBattle } = await import("./battle-service.js");
const { saveBattleWithNarrationOutbox } = await import("../repositories/battles.js");
const characterRepo = await import("../repositories/characters.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { ensureSystemNarrationStyles } = await import(
  "../repositories/narration-styles.js"
);

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function sheet(
  id: string,
  ownerUserId: string,
  displayName: string,
  hp = 100,
): CharacterSheet {
  const now = "2026-08-16T00:00:00.000Z";
  return {
    id,
    ownerUserId,
    displayName,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: displayName, visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters({ hp, maxHp: hp }),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "test",
  };
}

describe("scene beat narration deferral", () => {
  it("does not enqueue a combat narration job while the beat is open", async () => {
    const now = new Date().toISOString();
    const state = {
      ...createBattleState({
        id: "btl_scene_beat",
        sideA: sheet("chr_a", "user-a", "甲"),
        sideB: sheet("chr_b", "user-b", "乙"),
        turnLimit: 12,
        prologuePending: false,
      }),
      sceneBeat: openSceneBeat(3),
      battleRevision: 0,
      advanceOperation: {
        schemaVersion: 1 as const,
        operationId: "op-open",
        expectedRevision: 0,
        status: "active" as const,
        phase: "combat" as const,
        startedAt: now,
        completedAt: null,
        receiptIds: [],
      },
    };
    const deferred = completeAdvancePhases({
      state,
      operationId: "op-open",
      phases: ["combat"],
      deferCombatNarration: true,
    });
    const receipt = deferred.phaseReceipts?.at(-1);
    assert.equal(receipt?.narrationDeferred, true);
    assert.equal(receipt?.narrationInput, undefined);
    await saveBattleWithNarrationOutbox(deferred, {
      sideAUserId: "user-a",
      sideACharacterId: "chr_a",
      sideBCharacterId: "chr_b",
    });
    const queued = await query<{ count: string | number }>(
      `SELECT count(*) AS count FROM battle_narration_outbox WHERE battle_id = $1`,
      ["btl_scene_beat"],
    );
    assert.equal(Number(queued.rows[0]?.count ?? 1), 0);
  });

  it("freezes a 3-micro-turn beat on new battles", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-owner", "beat-owner", "hash", now],
    );
    const sideA = sheet("beat-a", "beat-owner", "甲");
    const sideB = sheet("beat-b", "beat-owner", "乙");
    for (const character of [sideA, sideB]) {
      await characterRepo.saveSheet(character);
    }
    await ensureSystemNarrationStyles();
    const created = await startBattle({
      userId: "beat-owner",
      battleId: "btl_scene_beat_create",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm: new MockLlmProvider(),
    });
    const stored = await query<{ state_json: string }>(
      `SELECT state_json FROM battles WHERE id = $1`,
      [created.id],
    );
    const state = JSON.parse(stored.rows[0]?.state_json ?? "{}") as {
      sceneBeat?: { k?: number };
    };
    assert.equal(state.sceneBeat?.k, 3);
  });

  it("advances past turn 5 on a new scene-beat battle", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-adv-owner", "beat-adv-owner", "hash", now],
    );
    const sideA = sheet("beat-adv-a", "beat-adv-owner", "甲");
    const sideB = sheet("beat-adv-b", "beat-adv-owner", "乙");
    for (const character of [sideA, sideB]) {
      await characterRepo.saveSheet(character);
    }
    await ensureSystemNarrationStyles();
    const llm = new MockLlmProvider();
    const created = await startBattle({
      userId: "beat-adv-owner",
      battleId: "btl_scene_beat_advance",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm,
    });
    let battle = created;
    for (let step = 1; step <= 7; step += 1) {
      battle = await advanceTurn({
        userId: "beat-adv-owner",
        battleId: created.id,
        operationId: `op-beat-${step}`,
        llm,
      });
    }
    assert.ok(
      battle.turn >= 5 || battle.status === "finished",
      `turn=${battle.turn} status=${battle.status}`,
    );
  });

  it("saves the first skip turn after a beat-close semantic patch", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-patch-owner", "beat-patch-owner", "hash", now],
    );
    const sideA = sheet("beat-patch-a", "beat-patch-owner", "甲", 10_000);
    const sideB = sheet("beat-patch-b", "beat-patch-owner", "乙", 10_000);
    for (const character of [sideA, sideB]) {
      await characterRepo.saveSheet(character);
    }
    await ensureSystemNarrationStyles();
    const llm = new MockLlmProvider();
    llm.reconcileTurnSemanticState = async (input) => ({
      patch: {
        baseRevision: input.before.revision,
        turn: input.turn,
        sourceEventIds: input.events.flatMap((event) => event.id ? [event.id] : []),
        operations: [{
          op: "replace",
          path: "/scene/summary",
          value: `閉じた場面 ${input.turn}`,
        }],
      },
      worldPatchStatus: "valid",
      sensoryEvidence: [],
      sensoryEvidenceStatus: "valid",
    });
    const created = await startBattle({
      userId: "beat-patch-owner",
      battleId: "btl_scene_beat_patch_skip",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm,
    });
    let battle = created;
    for (let step = 1; step <= 5; step += 1) {
      battle = await advanceTurn({
        userId: "beat-patch-owner",
        battleId: created.id,
        operationId: `op-patch-${step}`,
        llm,
      });
    }
    assert.ok(
      battle.turn >= 4 || battle.status === "finished",
      `turn=${battle.turn} status=${battle.status}`,
    );
    const stored = await query<{ state_json: string }>(
      `SELECT state_json FROM battles WHERE id = $1`,
      [created.id],
    );
    const state = JSON.parse(stored.rows[0]?.state_json ?? "{}") as {
      turnRecords?: Array<{
        turn: number;
        canonicalTransition?: { semantic?: { status?: string } };
      }>;
    };
    const records = state.turnRecords ?? [];
    assert.ok(
      records.some((record) =>
        record.canonicalTransition?.semantic?.status === "applied"
      ),
    );
    assert.ok(
      records.some((record) =>
        record.turn >= 4 &&
        record.canonicalTransition?.semantic?.status === "skipped"
      ),
    );
  });
});
