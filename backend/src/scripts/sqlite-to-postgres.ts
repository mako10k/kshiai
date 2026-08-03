import path from "node:path";
import { fileURLToPath } from "node:url";
import SqliteDatabase from "better-sqlite3";
import type { Client } from "pg";
import { createPostgresClient } from "./postgres-migrations.js";

type SourceRow = Record<string, unknown>;

type TableSpec = {
  name: string;
  columns: string[];
  primaryKey: string;
  jsonColumns?: string[];
  booleanColumns?: string[];
  timestampColumns: string[];
};

export type SourceInspection = {
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
};

export type SourceSnapshot = {
  tables: Map<string, SourceRow[]>;
  inspection: SourceInspection;
};

const tableSpecs: TableSpec[] = [
  {
    name: "users",
    columns: ["id", "username", "password_hash", "created_at"],
    primaryKey: "id",
    timestampColumns: ["created_at"],
  },
  {
    name: "characters",
    columns: [
      "id",
      "owner_user_id",
      "sheet_json",
      "created_at",
      "updated_at",
    ],
    primaryKey: "id",
    jsonColumns: ["sheet_json"],
    timestampColumns: ["created_at", "updated_at"],
  },
  {
    name: "sessions",
    columns: ["token", "user_id", "created_at", "expires_at"],
    primaryKey: "token",
    timestampColumns: ["created_at", "expires_at"],
  },
  {
    name: "battles",
    columns: [
      "id",
      "state_json",
      "side_a_user_id",
      "side_a_character_id",
      "side_b_character_id",
      "created_at",
      "updated_at",
    ],
    primaryKey: "id",
    jsonColumns: ["state_json"],
    timestampColumns: ["created_at", "updated_at"],
  },
  {
    name: "battlefields",
    columns: [
      "id",
      "owner_user_id",
      "is_system",
      "sheet_json",
      "created_at",
      "updated_at",
    ],
    primaryKey: "id",
    jsonColumns: ["sheet_json"],
    booleanColumns: ["is_system"],
    timestampColumns: ["created_at", "updated_at"],
  },
  {
    name: "narration_styles",
    columns: [
      "id",
      "owner_user_id",
      "is_system",
      "sheet_json",
      "created_at",
      "updated_at",
    ],
    primaryKey: "id",
    jsonColumns: ["sheet_json"],
    booleanColumns: ["is_system"],
    timestampColumns: ["created_at", "updated_at"],
  },
  {
    name: "image_gen_events",
    columns: ["id", "user_id", "character_id", "created_at", "ok"],
    primaryKey: "id",
    booleanColumns: ["ok"],
    timestampColumns: ["created_at"],
  },
  {
    name: "balance_events",
    columns: [
      "id",
      "kind",
      "created_at",
      "battle_id",
      "character_id",
      "payload_json",
    ],
    primaryKey: "id",
    jsonColumns: ["payload_json"],
    timestampColumns: ["created_at"],
  },
];

function normalizeRow(
  spec: TableSpec,
  row: SourceRow,
  rowNumber: number,
  errors: string[],
): SourceRow {
  const normalized = { ...row };
  for (const column of spec.jsonColumns ?? []) {
    try {
      normalized[column] = JSON.parse(String(row[column]));
    } catch {
      errors.push(`${spec.name}[${rowNumber}].${column} is not valid JSON`);
      normalized[column] = null;
    }
  }
  for (const column of spec.booleanColumns ?? []) {
    if (row[column] !== 0 && row[column] !== 1) {
      errors.push(`${spec.name}[${rowNumber}].${column} is not 0 or 1`);
    }
    normalized[column] = row[column] === 1;
  }
  for (const column of spec.timestampColumns) {
    const value = String(row[column]);
    if (!Number.isFinite(Date.parse(value))) {
      errors.push(`${spec.name}[${rowNumber}].${column} is not a timestamp`);
    }
    normalized[column] = value;
  }
  return normalized;
}

function countMissing(
  rows: SourceRow[],
  column: string,
  allowed: Set<unknown>,
  nullable = false,
): number {
  return rows.filter((row) => {
    const value = row[column];
    if (nullable && value == null) return false;
    return !allowed.has(value);
  }).length;
}

function inspectReferences(
  tables: Map<string, SourceRow[]>,
  errors: string[],
  warnings: string[],
): void {
  const users = new Set((tables.get("users") ?? []).map((row) => row.id));
  const characters = new Set(
    (tables.get("characters") ?? []).map((row) => row.id),
  );
  const battles = new Set((tables.get("battles") ?? []).map((row) => row.id));
  const required: Array<{
    table: string;
    column: string;
    allowed: Set<unknown>;
    nullable?: boolean;
  }> = [
    { table: "sessions", column: "user_id", allowed: users },
    { table: "characters", column: "owner_user_id", allowed: users },
    { table: "battles", column: "side_a_user_id", allowed: users },
    { table: "battles", column: "side_a_character_id", allowed: characters },
    { table: "battles", column: "side_b_character_id", allowed: characters },
    {
      table: "battlefields",
      column: "owner_user_id",
      allowed: users,
      nullable: true,
    },
    {
      table: "narration_styles",
      column: "owner_user_id",
      allowed: users,
      nullable: true,
    },
  ];
  for (const relation of required) {
    const missing = countMissing(
      tables.get(relation.table) ?? [],
      relation.column,
      relation.allowed,
      relation.nullable,
    );
    if (missing > 0) {
      errors.push(
        `${relation.table}.${relation.column} has ${missing} missing references`,
      );
    }
  }

  const historical: Array<{
    table: string;
    column: string;
    allowed: Set<unknown>;
  }> = [
    { table: "image_gen_events", column: "user_id", allowed: users },
    {
      table: "image_gen_events",
      column: "character_id",
      allowed: characters,
    },
    { table: "balance_events", column: "battle_id", allowed: battles },
    {
      table: "balance_events",
      column: "character_id",
      allowed: characters,
    },
  ];
  for (const relation of historical) {
    const missing = countMissing(
      tables.get(relation.table) ?? [],
      relation.column,
      relation.allowed,
      true,
    );
    if (missing > 0) {
      warnings.push(
        `${relation.table}.${relation.column} retains ${missing} historical IDs`,
      );
    }
  }
}

export function readSourceSnapshot(sourcePath: string): SourceSnapshot {
  const database = new SqliteDatabase(sourcePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const integrity = database.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    const errors = integrity
      .filter((row) => row.integrity_check !== "ok")
      .map((row) => `SQLite integrity check: ${row.integrity_check}`);
    const warnings: string[] = [];
    const tables = database.transaction(() => {
      const result = new Map<string, SourceRow[]>();
      for (const spec of tableSpecs) {
        const rawRows = database
          .prepare(`SELECT ${spec.columns.join(", ")} FROM ${spec.name}`)
          .all() as SourceRow[];
        result.set(
          spec.name,
          rawRows.map((row, index) =>
            normalizeRow(spec, row, index + 1, errors),
          ),
        );
      }
      return result;
    }).deferred();
    inspectReferences(tables, errors, warnings);
    return {
      tables,
      inspection: {
        counts: Object.fromEntries(
          tableSpecs.map((spec) => [spec.name, tables.get(spec.name)?.length ?? 0]),
        ),
        errors,
        warnings,
      },
    };
  } finally {
    database.close();
  }
}

function assertSafeIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value;
}

async function upsertTable(
  client: Client,
  spec: TableSpec,
  rows: SourceRow[],
): Promise<void> {
  const table = assertSafeIdentifier(spec.name);
  const columns = spec.columns.map(assertSafeIdentifier);
  const primaryKey = assertSafeIdentifier(spec.primaryKey);
  const assignments = columns
    .filter((column) => column !== primaryKey)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `
    INSERT INTO public.${table} (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (${primaryKey}) DO UPDATE SET ${assignments}
  `;
  for (const row of rows) {
    await client.query(sql, columns.map((column) => row[column]));
  }
}

async function resetIdentity(client: Client, table: string): Promise<void> {
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('public.${table}', 'id'),
      COALESCE((SELECT MAX(id) FROM public.${table}), 1),
      EXISTS (SELECT 1 FROM public.${table})
    )
  `);
}

async function verifyTarget(
  client: Client,
  inspection: SourceInspection,
): Promise<void> {
  for (const spec of tableSpecs) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.${spec.name}`,
    );
    const targetCount = Number(result.rows[0]?.count ?? -1);
    const sourceCount = inspection.counts[spec.name] ?? -1;
    if (targetCount !== sourceCount) {
      throw new Error(
        `${spec.name} count mismatch: source=${sourceCount} target=${targetCount}`,
      );
    }
  }
}

async function importSnapshot(
  client: Client,
  snapshot: SourceSnapshot,
): Promise<void> {
  for (const spec of tableSpecs) {
    await upsertTable(client, spec, snapshot.tables.get(spec.name) ?? []);
  }
  await resetIdentity(client, "image_gen_events");
  await resetIdentity(client, "balance_events");
  await verifyTarget(client, snapshot.inspection);
}

function printInspection(inspection: SourceInspection): void {
  for (const spec of tableSpecs) {
    console.log(`${spec.name}: ${inspection.counts[spec.name] ?? 0}`);
  }
  for (const warning of inspection.warnings) console.warn(`warning: ${warning}`);
  for (const error of inspection.errors) console.error(`error: ${error}`);
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runTargetValidation(
  snapshot: SourceSnapshot,
  connectionString: string,
  commit: boolean,
): Promise<void> {
  const client = createPostgresClient(connectionString);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('kshiai_sqlite_import'))`,
    );
    await importSnapshot(client, snapshot);
    if (commit) {
      await client.query("COMMIT");
      console.log("SQLite data import committed");
    } else {
      await client.query("ROLLBACK");
      console.log("Target import verified and rolled back");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const sourceArgument = readArgument("--source");
  const sourcePath = sourceArgument
    ? path.resolve(process.env.INIT_CWD ?? process.cwd(), sourceArgument)
    : process.env.DATABASE_PATH
      ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
      : fileURLToPath(new URL("../../data/kshiai.db", import.meta.url));
  const snapshot = readSourceSnapshot(sourcePath);
  printInspection(snapshot.inspection);
  if (snapshot.inspection.errors.length > 0) {
    throw new Error("Source inspection failed");
  }
  const verifyTargetMode = process.argv.includes("--verify-target");
  const applyMode = process.argv.includes("--apply");
  if (!verifyTargetMode && !applyMode) {
    console.log("Source dry-run passed");
    return;
  }
  const connectionString = process.env.DIRECT_URL;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!connectionString) throw new Error("DIRECT_URL is required");
  if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required");
  const target = new URL(connectionString);
  if (!target.hostname.includes(projectRef)) {
    throw new Error("DIRECT_URL does not match SUPABASE_PROJECT_REF");
  }
  await runTargetValidation(snapshot, connectionString, applyMode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
