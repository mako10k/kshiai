import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { defaultParameters, type BattleState } from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-distributed-test-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "distributed.db");

const guard = await import("./distributed-guard.js");
const { closeDatabase, getDb, query } = await import("../db.js");
const battleRepo = await import("../repositories/battles.js");

function checkpointState(): BattleState {
  return {
    id: "battle-distributed",
    status: "active",
    turn: 0,
    turnLimit: 20,
    sideA: {
      characterId: "char-a",
      displayName: "A",
      parameters: defaultParameters(),
      defending: false,
      canFight: true,
      irreversibleIncapacitated: false,
    },
    sideB: {
      characterId: "char-b",
      displayName: "B",
      parameters: defaultParameters(),
      defending: false,
      canFight: true,
      irreversibleIncapacitated: false,
    },
    policiesA: [],
    selectedPolicyIdsA: [],
    policiesB: [],
    selectedPolicyIdsB: [],
    situation: { scene: "test", notes: "", coefficients: {}, tags: [] },
    prologuePending: true,
    aftermathPending: false,
    turnRecords: [],
    log: [],
    winnerSide: null,
    finishReason: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    battleRevision: 0,
  };
}

before(() => {
  const database = getDb();
  const now = "2026-08-03T00:00:00.000Z";
  database.prepare(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run("user-distributed", "distributed", "hash", now);
  database.prepare(
    `INSERT INTO characters
      (id, owner_user_id, sheet_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("char-a", "user-distributed", "{}", now, now);
  database.prepare(
    `INSERT INTO characters
      (id, owner_user_id, sheet_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("char-b", "user-distributed", "{}", now, now);
  database.prepare(
    `INSERT INTO battles
      (id, state_json, side_a_user_id, side_a_character_id,
       side_b_character_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "battle-distributed",
    "{}",
    "user-distributed",
    "char-a",
    "char-b",
    now,
    now,
  );
});

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("multi-instance battle leases", () => {
  it("allows one owner at a time and permits takeover after expiry", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const [first, second] = await Promise.all([
      guard.acquireBattleLease("battle-distributed", "instance-a", now, 1_000),
      guard.acquireBattleLease("battle-distributed", "instance-b", now, 1_000),
    ]);
    assert.equal(Number(first) + Number(second), 1);

    const winner = first ? "instance-a" : "instance-b";
    const loser = first ? "instance-b" : "instance-a";
    assert.equal(
      await guard.acquireBattleLease("battle-distributed", loser, now, 1_000),
      false,
    );
    assert.equal(
      await guard.acquireBattleLease(
        "battle-distributed",
        loser,
        new Date(now.getTime() + 1_001),
        1_000,
      ),
      true,
    );
    await guard.releaseBattleLease("battle-distributed", winner);
    await guard.releaseBattleLease("battle-distributed", loser);
  });

  it("rejects a checkpoint write after the lease fencing token changes", async () => {
    await assert.rejects(
      guard.withBattleLease("battle-distributed", async () => {
        await query(
          `UPDATE battle_leases
              SET owner_id = 'replacement', fencing_token = fencing_token + 1,
                  expires_at = $2
            WHERE battle_id = $1`,
          ["battle-distributed", "2026-08-13T00:00:00.000Z"],
        );
        await battleRepo.saveBattle(checkpointState(), {
          sideAUserId: "user-distributed",
          sideACharacterId: "char-a",
          sideBCharacterId: "char-b",
        });
      }),
      /BATTLE_REVISION_CONFLICT/,
    );
    await query("DELETE FROM battle_leases WHERE battle_id = $1", [
      "battle-distributed",
    ]);
  });
});

describe("shared idempotency records", () => {
  it("replays a completed response and rejects key reuse with another request", async () => {
    const base = {
      userId: "user-distributed",
      scope: "battle-advance:battle-distributed",
      key: "request-key-0001",
      requestHash: guard.requestDigest({ battleId: "battle-distributed" }),
      now: new Date("2026-08-03T00:00:00.000Z"),
    };
    const started = await guard.beginIdempotentRequest(base);
    assert.equal(started.kind, "started");
    if (started.kind !== "started") return;

    assert.equal((await guard.beginIdempotentRequest(base)).kind, "processing");
    await guard.completeIdempotentRequest({
      userId: base.userId,
      scope: base.scope,
      key: base.key,
      ownerId: started.ownerId,
      response: { battle: { id: "battle-distributed", turn: 1 } },
      now: base.now,
    });

    const replay = await guard.beginIdempotentRequest(base);
    assert.equal(replay.kind, "replay");
    if (replay.kind === "replay") {
      assert.deepEqual(replay.response, {
        battle: { id: "battle-distributed", turn: 1 },
      });
    }
    assert.equal(
      (await guard.beginIdempotentRequest({
        ...base,
        requestHash: guard.requestDigest({ battleId: "another-battle" }),
      })).kind,
      "conflict",
    );
  });
});
