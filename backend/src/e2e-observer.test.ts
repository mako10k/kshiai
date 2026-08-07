import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-e2e-observer-test-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");
const { E2E_FIXTURE_IDS, ensurePersistentE2eFixtures } = await import(
  "./e2e-observer.js"
);
const characterRepo = await import("./repositories/characters.js");
const { getDb } = await import("./db.js");

after(() => rmSync(tempDir, { recursive: true, force: true }));

describe("persistent E2E fixtures", () => {
  it("creates fixtures once and reuses their accumulated state", async () => {
    const db = getDb();
    const insertUser = db.prepare(
      `INSERT INTO users
        (id, username, password_hash, email, account_kind, created_at)
       VALUES (?, ?, 'x', ?, ?, '2026-08-07T00:00:00.000Z')`,
    );
    insertUser.run("observer", "observer", "observer@example.test", "e2e");
    insertUser.run("opponent", "opponent", "opponent@example.test", "test");

    assert.deepEqual(
      await ensurePersistentE2eFixtures({
        observerUserId: "observer",
        opponentUserId: "opponent",
      }),
      {
        observerCharacter: "created",
        opponentCharacter: "created",
        battlefield: "created",
        narrationStyle: "created",
      },
    );

    const observer = await characterRepo.getSheet(E2E_FIXTURE_IDS.observerCharacter);
    assert.ok(observer);
    observer.record = {
      ...observer.record!,
      wins: 1,
      gamesPlayed: 1,
      rating: 1512,
    };
    observer.updatedAt = "2026-08-07T00:01:00.000Z";
    await characterRepo.saveSheet(observer);

    assert.deepEqual(
      await ensurePersistentE2eFixtures({
        observerUserId: "observer",
        opponentUserId: "opponent",
      }),
      {
        observerCharacter: "reused",
        opponentCharacter: "reused",
        battlefield: "reused",
        narrationStyle: "reused",
      },
    );
    assert.equal(
      (await characterRepo.getSheet(E2E_FIXTURE_IDS.observerCharacter))?.record?.rating,
      1512,
    );
  });
});
