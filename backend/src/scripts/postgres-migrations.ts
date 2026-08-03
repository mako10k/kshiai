import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { createPostgresConfig } from "../postgres-config.js";

export type MigrationFile = {
  name: string;
  checksum: string;
  sql: string;
};

const migrationsDir = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);
export function createPostgresClient(connectionString: string): Client {
  return new Client(createPostgresConfig(connectionString));
}

export function listMigrationFiles(directory = migrationsDir): MigrationFile[] {
  return fs
    .readdirSync(directory)
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(directory, name), "utf8");
      return {
        name,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    });
}

async function readAppliedMigrations(
  client: Client,
): Promise<Map<string, string>> {
  const exists = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public.kshiai_schema_migrations') IS NOT NULL AS present`,
  );
  if (!exists.rows[0]?.present) return new Map();
  const result = await client.query<{ name: string; checksum: string }>(
    `SELECT name, checksum
       FROM public.kshiai_schema_migrations
      ORDER BY name`,
  );
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

export async function checkPostgresMigrations(
  connectionString: string,
): Promise<{ applied: string[]; pending: string[] }> {
  const client = createPostgresClient(connectionString);
  await client.connect();
  try {
    const files = listMigrationFiles();
    const applied = await readAppliedMigrations(client);
    for (const file of files) {
      const previous = applied.get(file.name);
      if (previous && previous !== file.checksum) {
        throw new Error(`Applied migration checksum mismatch: ${file.name}`);
      }
    }
    return {
      applied: files.filter((file) => applied.has(file.name)).map((file) => file.name),
      pending: files.filter((file) => !applied.has(file.name)).map((file) => file.name),
    };
  } finally {
    await client.end();
  }
}

export async function applyPostgresMigrations(
  connectionString: string,
): Promise<string[]> {
  const client = createPostgresClient(connectionString);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('kshiai_schema_migrations'))`,
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.kshiai_schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await readAppliedMigrations(client);
    const newlyApplied: string[] = [];
    for (const file of listMigrationFiles()) {
      const previous = applied.get(file.name);
      if (previous && previous !== file.checksum) {
        throw new Error(`Applied migration checksum mismatch: ${file.name}`);
      }
      if (previous) continue;
      await client.query(file.sql);
      await client.query(
        `INSERT INTO public.kshiai_schema_migrations (name, checksum)
         VALUES ($1, $2)`,
        [file.name, file.checksum],
      );
      newlyApplied.push(file.name);
    }
    await client.query("COMMIT");
    return newlyApplied;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL is required");
  }
  if (process.argv.includes("--apply")) {
    const applied = await applyPostgresMigrations(connectionString);
    console.log(
      applied.length > 0
        ? `Applied PostgreSQL migrations: ${applied.join(", ")}`
        : "PostgreSQL schema is already current",
    );
    return;
  }
  const status = await checkPostgresMigrations(connectionString);
  console.log(`Applied: ${status.applied.join(", ") || "none"}`);
  console.log(`Pending: ${status.pending.join(", ") || "none"}`);
  if (status.pending.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
