import fs from "node:fs";
import path from "node:path";
import SqliteDatabase from "better-sqlite3";
import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";
import { createPostgresConfig } from "./postgres-config.js";

export type DatabaseRow = Record<string, unknown>;

export type DatabaseResult<Row extends DatabaseRow> = {
  rows: Row[];
  rowCount: number;
};

export type DatabaseConnection = {
  query<Row extends DatabaseRow>(
    sql: string,
    parameters?: unknown[],
  ): Promise<DatabaseResult<Row>>;
};

let sqlite: SqliteDatabase.Database | null = null;
let postgres: Pool | null = null;
const configuredPostgresClients = new WeakSet<PoolClient>();
let sqliteTransactionQueue: Promise<void> = Promise.resolve();

export function databaseKind(): "postgres" | "sqlite" {
  return config.databaseUrl ? "postgres" : "sqlite";
}

export function getDb(): SqliteDatabase.Database {
  if (databaseKind() !== "sqlite") {
    throw new Error("Synchronous SQLite access is unavailable in PostgreSQL mode");
  }
  if (sqlite) return sqlite;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  sqlite = new SqliteDatabase(config.databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      auth_user_id TEXT UNIQUE,
      email TEXT,
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
    CREATE TABLE IF NOT EXISTS asset_generations (
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      generation_id TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (asset_type, asset_id, generation)
    );
    CREATE TABLE IF NOT EXISTS asset_current_generations (
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      generation_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (asset_type, asset_id)
    );
    CREATE INDEX IF NOT EXISTS idx_asset_generations_lookup
      ON asset_generations (asset_type, asset_id, generation DESC);
    CREATE TABLE IF NOT EXISTS character_drafts (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sheet_json TEXT NOT NULL,
      assistant_message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_character_drafts_owner_updated
      ON character_drafts (owner_user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      observation_run_id TEXT,
      side_a_user_id TEXT NOT NULL,
      side_b_character_id TEXT NOT NULL,
      side_a_character_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_operation_runs (
      run_id TEXT PRIMARY KEY,
      observer_user_id TEXT NOT NULL,
      battle_id TEXT UNIQUE,
      taxonomy_revision TEXT NOT NULL,
      projected_operations_json TEXT NOT NULL,
      approved_attempt_ceiling INTEGER NOT NULL CHECK (approved_attempt_ceiling > 0),
      reserved_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (reserved_attempts >= 0 AND reserved_attempts <= approved_attempt_ceiling),
      status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
      created_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS provider_operation_attempts (
      run_id TEXT NOT NULL REFERENCES provider_operation_runs(run_id) ON DELETE CASCADE,
      logical_call_id TEXT NOT NULL,
      attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal > 0),
      battle_id TEXT NOT NULL,
      layer TEXT NOT NULL,
      operation TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed')),
      token_count INTEGER,
      estimated_cost_usd REAL,
      elapsed_ms INTEGER,
      error_class TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      PRIMARY KEY (run_id, logical_call_id, attempt_ordinal)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_operation_attempts_run_layer
      ON provider_operation_attempts (run_id, layer, operation);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_battles_observation_run
      ON battles (observation_run_id) WHERE observation_run_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS battle_leases (
      battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL DEFAULT 1,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_battle_leases_expires
      ON battle_leases (expires_at);
    CREATE TABLE IF NOT EXISTS battle_presentations (
      battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
      receipt_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      phase TEXT NOT NULL,
      combat_turn INTEGER,
      input_digest TEXT NOT NULL,
      narrative_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (battle_id, receipt_id),
      UNIQUE (battle_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_battle_presentations_sequence
      ON battle_presentations (battle_id, sequence);
    CREATE TABLE IF NOT EXISTS battle_narration_entries (
      battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
      receipt_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      phase TEXT NOT NULL,
      combat_turn INTEGER,
      input_json TEXT NOT NULL,
      input_digest TEXT NOT NULL,
      status TEXT NOT NULL,
      active_attempt_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      terminal_narrative_json TEXT,
      fallback_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (battle_id, receipt_id),
      UNIQUE (battle_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS battle_narration_leases (
      battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battle_narration_attempts (
      attempt_id TEXT PRIMARY KEY,
      battle_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      route TEXT NOT NULL,
      http_attempts INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER,
      estimated_cost_usd REAL,
      elapsed_ms INTEGER,
      fallback_reason TEXT,
      error_class TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS battle_narration_events (
      battle_id TEXT NOT NULL,
      event_sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      narration_sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      public_payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (battle_id, event_sequence),
      UNIQUE (battle_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS battle_narration_outbox (
      outbox_id TEXT PRIMARY KEY,
      battle_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      status TEXT NOT NULL,
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      delivery_generation INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      dispatched_at TEXT
    );
    CREATE TABLE IF NOT EXISTS battle_narration_retention (
      battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
      pruned_through_sequence INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_battle_narration_entries_ready
      ON battle_narration_entries (status, battle_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_battle_narration_outbox_pending
      ON battle_narration_outbox (status, created_at);
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
      owner_id TEXT NOT NULL,
      response_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (user_id, scope, key)
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
      ON idempotency_keys (expires_at);
    CREATE TABLE IF NOT EXISTS battlefields (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sheet_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS dialogue_pipeline_settings (
      id TEXT PRIMARY KEY CHECK (id = 'global'),
      settings_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS balance_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      battle_id TEXT,
      character_id TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_balance_events_kind_time
      ON balance_events (kind, created_at);
    CREATE INDEX IF NOT EXISTS idx_balance_events_battle
      ON balance_events (battle_id);
    CREATE TABLE IF NOT EXISTS friendships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, friend_user_id),
      CHECK (user_id != friend_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_friend
      ON friendships (friend_user_id);
    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, target_user_id),
      CHECK (user_id != target_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_favorites_target
      ON user_favorites (target_user_id);
    CREATE TABLE IF NOT EXISTS friend_requests (
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (from_user_id, to_user_id),
      CHECK (from_user_id != to_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to
      ON friend_requests (to_user_id);
  `);
  const battleColumns = sqlite.pragma("table_info(battles)") as Array<{ name: string }>;
  if (!battleColumns.some((column) => column.name === "revision")) {
    sqlite.exec("ALTER TABLE battles ADD COLUMN revision INTEGER NOT NULL DEFAULT 0");
  }
  if (!battleColumns.some((column) => column.name === "observation_run_id")) {
    sqlite.exec("ALTER TABLE battles ADD COLUMN observation_run_id TEXT");
  }
  const battleLeaseColumns = sqlite.pragma("table_info(battle_leases)") as Array<{
    name: string;
  }>;
  if (!battleLeaseColumns.some((column) => column.name === "fencing_token")) {
    sqlite.exec(
      "ALTER TABLE battle_leases ADD COLUMN fencing_token INTEGER NOT NULL DEFAULT 1",
    );
  }
  const narrationOutboxColumns = sqlite.pragma(
    "table_info(battle_narration_outbox)",
  ) as Array<{ name: string }>;
  if (!narrationOutboxColumns.some((column) => column.name === "delivery_generation")) {
    sqlite.exec(
      "ALTER TABLE battle_narration_outbox ADD COLUMN delivery_generation INTEGER NOT NULL DEFAULT 0",
    );
  }
  const userColumns = sqlite.pragma("table_info(users)") as Array<{ name: string }>;
  const userColumnNames = new Set(userColumns.map((column) => column.name));
  if (!userColumnNames.has("auth_user_id")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN auth_user_id TEXT");
  }
  if (!userColumnNames.has("email")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!userColumnNames.has("account_kind")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'general'",
    );
  }
  if (!userColumnNames.has("display_name")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
  }
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id
      ON users (auth_user_id) WHERE auth_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_users_account_kind ON users (account_kind);
  `);
  return sqlite;
}

function getPostgresPool(): Pool {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
  if (!postgres) {
    postgres = new Pool({
      ...createPostgresConfig(config.databaseUrl),
      max: config.databasePoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return postgres;
}

async function configurePostgresClient(client: PoolClient): Promise<void> {
  if (configuredPostgresClients.has(client)) return;
  await client.query(`SET search_path TO "${config.databaseSchema}"`);
  configuredPostgresClients.add(client);
}

function sqliteStatement(
  sql: string,
  parameters: unknown[],
): { sql: string; parameters: unknown[] } {
  const ordered: unknown[] = [];
  const rewritten = sql.replace(/\$(\d+)/g, (_, rawIndex: string) => {
    const value = parameters[Number(rawIndex) - 1];
    ordered.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    return "?";
  });
  return { sql: rewritten, parameters: ordered };
}

function sqliteConnection(): DatabaseConnection {
  return {
    async query<Row extends DatabaseRow>(sql: string, parameters: unknown[] = []) {
      const statement = sqliteStatement(sql, parameters);
      const prepared = getDb().prepare(statement.sql);
      if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(statement.sql) ||
          /\bRETURNING\b/i.test(statement.sql)) {
        const rows = prepared.all(...statement.parameters) as Row[];
        return { rows, rowCount: rows.length };
      }
      const result = prepared.run(...statement.parameters);
      return { rows: [], rowCount: result.changes };
    },
  };
}

function postgresConnection(client?: PoolClient): DatabaseConnection {
  if (!client) {
    return {
      async query<Row extends DatabaseRow>(sql: string, parameters: unknown[] = []) {
        const acquired = await getPostgresPool().connect();
        try {
          await configurePostgresClient(acquired);
          const result = await acquired.query<Row>(sql, parameters);
          return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        } finally {
          acquired.release();
        }
      },
    };
  }
  return {
    async query<Row extends DatabaseRow>(sql: string, parameters: unknown[] = []) {
      const result = await client.query<Row>(sql, parameters);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

export async function query<Row extends DatabaseRow>(
  sql: string,
  parameters: unknown[] = [],
): Promise<DatabaseResult<Row>> {
  const connection = databaseKind() === "postgres"
    ? postgresConnection()
    : sqliteConnection();
  return connection.query<Row>(sql, parameters);
}

export async function withTransaction<T>(
  callback: (connection: DatabaseConnection) => Promise<T>,
): Promise<T> {
  if (databaseKind() === "sqlite") {
    const previous = sqliteTransactionQueue;
    let releaseTransaction!: () => void;
    sqliteTransactionQueue = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await previous;
    const database = getDb();
    try {
      database.exec("BEGIN IMMEDIATE");
      const result = await callback(sqliteConnection());
      database.exec("COMMIT");
      return result;
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    } finally {
      releaseTransaction();
    }
  }
  const client = await getPostgresPool().connect();
  try {
    await configurePostgresClient(client);
    await client.query("BEGIN");
    const result = await callback(postgresConnection(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeDatabase(): Promise<void> {
  if (databaseKind() === "sqlite") {
    getDb();
    return;
  }
  const result = await query<{ schema: string }>(
    `SELECT current_schema() AS schema`,
  );
  if (result.rows[0]?.schema !== config.databaseSchema) {
    throw new Error(
      `PostgreSQL search_path mismatch: expected ${config.databaseSchema}`,
    );
  }
}

export async function closeDatabase(): Promise<void> {
  if (postgres) {
    const pool = postgres;
    postgres = null;
    await pool.end();
  }
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
}
