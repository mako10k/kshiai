import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sheet_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      side_a_user_id TEXT NOT NULL,
      side_b_character_id TEXT NOT NULL,
      side_a_character_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battlefields (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sheet_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Face / portrait generation attempts (rate limit per character)
    CREATE TABLE IF NOT EXISTS image_gen_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_image_gen_char_time
      ON image_gen_events (character_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_image_gen_user_time
      ON image_gen_events (user_id, created_at);

    -- Narration voice styles (system presets + user custom)
    CREATE TABLE IF NOT EXISTS narration_styles (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sheet_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_narration_styles_owner
      ON narration_styles (owner_user_id);
  `);
  return db;
}
