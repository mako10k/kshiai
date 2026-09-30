// R: Supervise the full disposable-schema PostgreSQL smoke under an exact Stage permit.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { config } from "../config.js";
import { closeDatabase } from "../db.js";
import { createPostgresConfig } from "../postgres-config.js";
import { readStageSmokeManifest } from "../services/stage-smoke-manifest.js";
import { runCutoverStageSmoke, stageSmokeOperation } from "../services/cutover-stage-smoke.js";

const execute = promisify(execFile);
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function databaseTarget(value: string): string {
  const url = new URL(value);
  return `${url.hostname}:${url.port || "5432"}:${decodeURIComponent(url.pathname.slice(1))}`;
}
async function main(): Promise<void> {
  if (!config.cutover) throw new Error("configured cutover required");
  const manifest = readStageSmokeManifest(process.env.STAGE_SMOKE_MANIFEST_FILE);
  const schema = required("STAGE_SMOKE_FIXED_SCHEMA");
  if (!/^kshiai_smoke_[a-z0-9_]{1,40}$/.test(schema)) throw new Error("Unsafe smoke schema");
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const script = fileURLToPath(new URL(`./postgres-runtime-smoke.${extension}`, import.meta.url));
  const scriptDigest = createHash("sha256").update(fs.readFileSync(script)).digest("hex");
  const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
  const migrations = fs.readdirSync(migrationsDirectory).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort()
    .map((name) => ({ name, sha256: createHash("sha256").update(fs.readFileSync(`${migrationsDirectory}/${name}`)).digest("hex") }));
  const migrationsDigest = createHash("sha256").update(JSON.stringify(migrations)).digest("hex");
  const directUrl = required("DIRECT_URL");
  const target = `postgres-runtime:${databaseTarget(required("DATABASE_URL"))}:${databaseTarget(directUrl)}:${schema}:${scriptDigest}:${migrationsDigest}`;
  const steps = [
    { name: "runtime-fixture", target, method: "RUN", minimumCalls: 1, maximumCalls: 1 },
    { name: "schema-readback", target: `postgres-schema:${databaseTarget(directUrl)}:${schema}`,
      method: "SELECT", minimumCalls: 1, maximumCalls: 1 },
  ];
  if (manifest.kind !== "postgres" || JSON.stringify(manifest.steps) !== JSON.stringify(steps)) {
    throw new Error("stage_postgres_target_mismatch");
  }
  const binding = stageSmokeOperation(manifest);
  try {
    const result = await runCutoverStageSmoke(manifest, async (context) => {
      const execution = await context.step("runtime-fixture", async () => {
        const client = new Client(createPostgresConfig(directUrl));
        try {
          await client.connect();
          const present = await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]);
          if (present.rowCount !== 0) throw new Error("smoke schema must be absent before creation");
        } finally { await client.end(); }
        const child = await execute(process.execPath, [
          ...(extension === "ts" ? ["--import", "tsx"] : []), script,
        ], { env: { ...process.env, STAGE_SMOKE_PARENT_BINDING: binding.bindingOperationId,
          STAGE_SMOKE_PARENT_DIGEST: binding.requestDigest, STAGE_SMOKE_LEDGER_SCHEMA: config.databaseSchema },
          timeout: 120_000, maxBuffer: 64 * 1024 });
        return createHash("sha256").update(child.stdout).digest("hex");
      });
      await context.step("schema-readback", async () => {
        const client = new Client(createPostgresConfig(directUrl));
        try {
          await client.connect();
          const present = await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]);
          if (present.rowCount !== 0) throw new Error("smoke schema cleanup readback failed");
        } finally { await client.end(); }
      });
      return { schema, scriptDigest, migrationsDigest, executionDigest: execution };
    });
    console.log(JSON.stringify({ ...result.result, receiptDigest: result.receiptDigest }));
  } finally { await closeDatabase(); }
}
main().catch(() => { console.error("stage_postgres_smoke_failed; inspect exact permit and schema readback"); process.exitCode = 1; });
