import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import SqliteDatabase from "better-sqlite3";
import { readSourceSnapshot } from "./sqlite-to-postgres.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kshiai-pg-source-"));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, "source.db");
  const database = new SqliteDatabase(databasePath);
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
      sheet_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE battles (
      id TEXT PRIMARY KEY, state_json TEXT NOT NULL,
      side_a_user_id TEXT NOT NULL, side_b_character_id TEXT NOT NULL,
      side_a_character_id TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE battlefields (
      id TEXT PRIMARY KEY, owner_user_id TEXT, is_system INTEGER NOT NULL,
      sheet_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE image_gen_events (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, character_id TEXT NOT NULL,
      created_at TEXT NOT NULL, ok INTEGER NOT NULL
    );
    CREATE TABLE narration_styles (
      id TEXT PRIMARY KEY, owner_user_id TEXT, is_system INTEGER NOT NULL,
      sheet_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE balance_events (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL,
      battle_id TEXT, character_id TEXT, payload_json TEXT NOT NULL
    );
  `);
  const timestamp = "2026-08-03T00:00:00.000Z";
  database
    .prepare(`INSERT INTO users VALUES (?, ?, ?, ?)`)
    .run("usr_1", "alice", "hash", timestamp);
  database
    .prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?)`)
    .run("chr_1", "usr_1", JSON.stringify({ id: "chr_1" }), timestamp, timestamp);
  database
    .prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?)`)
    .run("ses_1", "usr_1", timestamp, "2026-08-17T00:00:00.000Z");
  database
    .prepare(`INSERT INTO battles VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(
      "btl_1",
      JSON.stringify({ id: "btl_1" }),
      "usr_1",
      "chr_1",
      "chr_1",
      timestamp,
      timestamp,
    );
  database
    .prepare(`INSERT INTO battlefields VALUES (?, ?, ?, ?, ?, ?)`)
    .run("bfp_1", null, 1, JSON.stringify({ id: "bfp_1" }), timestamp, timestamp);
  database
    .prepare(`INSERT INTO narration_styles VALUES (?, ?, ?, ?, ?, ?)`)
    .run("nst_1", "usr_1", 0, JSON.stringify({ id: "nst_1" }), timestamp, timestamp);
  database
    .prepare(`INSERT INTO image_gen_events VALUES (?, ?, ?, ?, ?)`)
    .run(1, "usr_deleted", "chr_deleted", timestamp, 1);
  database
    .prepare(`INSERT INTO balance_events VALUES (?, ?, ?, ?, ?, ?)`)
    .run(1, "battle_finished", timestamp, "btl_1", "chr_1", JSON.stringify({ ok: true }));
  database.close();
  return databasePath;
}

describe("SQLite to PostgreSQL source inspection", () => {
  it("normalizes JSON and booleans while retaining historical audit IDs", () => {
    const sourcePath = createFixture();
    const snapshot = readSourceSnapshot(sourcePath);

    assert.deepEqual(snapshot.inspection.errors, []);
    assert.equal(snapshot.inspection.counts.users, 1);
    assert.equal(snapshot.inspection.counts.image_gen_events, 1);
    assert.equal(snapshot.inspection.warnings.length, 2);
    assert.deepEqual(snapshot.tables.get("battlefields")?.[0]?.sheet_json, {
      id: "bfp_1",
    });
    assert.equal(snapshot.tables.get("battlefields")?.[0]?.is_system, true);
    assert.equal(snapshot.tables.get("narration_styles")?.[0]?.is_system, false);
  });

  it("fails closed on invalid JSON", () => {
    const sourcePath = createFixture();
    const database = new SqliteDatabase(sourcePath);
    database.prepare(`UPDATE characters SET sheet_json = ?`).run("not-json");
    database.close();

    const snapshot = readSourceSnapshot(sourcePath);
    assert.ok(
      snapshot.inspection.errors.some((error) =>
        error.includes("characters[1].sheet_json is not valid JSON"),
      ),
    );
  });
});
