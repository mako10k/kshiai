import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "kshiai-versioned-auth-smoke-"));
process.env.NODE_ENV = "test";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "smoke.db");
process.env.DATABASE_URL = "";

const { closeDatabase, query } = await import("../db.js");
const {
  insertRetainedCompatibilityFixture,
  smokeVersionedCharacterReads,
} = await import("./supabase-auth-smoke.js");
const { getCurrentAssetGeneration } = await import(
  "../repositories/asset-generations.js"
);

const ownerUserId = "versioned-smoke-owner";
const characterId = "versioned-smoke-character";
const fixtureAttemptId = "versioned-smoke-authoring-attempt";

before(async () => {
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3)`,
    [ownerUserId, ownerUserId, "2026-09-14T00:00:00.000Z"],
  );
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("Supabase smoke versioned character proof", () => {
  it("reads V2 and V3 and resumes migration without moving the temporary pointer", async () => {
    const inserted = await insertRetainedCompatibilityFixture({
      marker: "versioned-smoke",
      ownerUserId,
      characterId,
      attemptId: fixtureAttemptId,
    });
    assert.equal(inserted.sheet.id, characterId);
    const result = await smokeVersionedCharacterReads({
      marker: "versioned-smoke",
      ownerUserId,
      fixture: inserted,
    });
    assert.match(result.v3GenerationId, /^character:/);
    assert.equal(
      (await getCurrentAssetGeneration("character", characterId))?.schemaVersion,
      2,
    );
    const work = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM character_semantic_migration_attempts
        WHERE migration_attempt_id = $1`,
      [result.migrationAttemptId],
    );
    assert.equal(Number(work.rows[0]?.count), 1);
    const requests = await query<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM character_semantic_migration_provider_requests
        WHERE migration_attempt_id = $1`,
      [result.migrationAttemptId],
    );
    assert.equal(Number(requests.rows[0]?.count), 0);
  });
});
