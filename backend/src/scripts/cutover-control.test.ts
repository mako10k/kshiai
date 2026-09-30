// R: Verify operator CLI target binding and independent stopped-barrier accounting readback.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { after, describe, it } from "node:test";
import { parseCutoverControlArguments, runCutoverControl } from "./cutover-control.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-cutover-cli-"));
const databasePath = join(directory, "control.sqlite");
const policyPath = join(directory, "policy.json");
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
function field(value: unknown, name: string): unknown {
  assert.ok(value && typeof value === "object");
  return Reflect.get(value, name);
}
const target = ["--db", databasePath, "--cutover-id", "cli-cutover", "--artifact-id", "cli-artifact"];
writeFileSync(policyPath, JSON.stringify({
  cutoverId: "cli-cutover",
  artifactId: "cli-artifact",
  ownerUserId: "owner",
  ownerCandidates: [
    { attemptId: "attempt-a", candidateDigest: digest("a") },
    { attemptId: "attempt-b", candidateDigest: digest("b") },
  ],
  trialBindings: null,
  taskBattleIds: [],
  stageAcceptance: { health: null, postgres: null, email: null, google: null,
    ownership: null, r2: null, sse: null, directProtection: null },
  productionReceipt: null,
}));

function runNode(args: string[], environment: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), ...args], {
    cwd: process.cwd(), env: environment, encoding: "utf8",
  });
}

const initialize = runNode(["--input-type=module", "--eval", `
  process.env.DATABASE_URL = "";
  process.env.DIRECT_URL = "";
  process.env.DATABASE_PATH = ${JSON.stringify(databasePath)};
  delete process.env.CUTOVER_ID;
  delete process.env.CUTOVER_ARTIFACT_ID;
  const db = await import(${JSON.stringify(new URL("../db.ts", import.meta.url).href)});
  db.getDb({ initializeSchema: true });
  await db.closeDatabase();
`], { ...process.env });
assert.equal(initialize.status, 0, initialize.stderr);

after(async () => {
  const { closeDatabase } = await import("../db.js");
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("cutover-control operator CLI", () => {
  it("requires one explicit database target and an absolute local path", () => {
    assert.throws(() => parseCutoverControlArguments(["read", "--db", "relative.db",
      "--cutover-id", "x", "--artifact-id", "y"]), /--db must be absolute/);
    assert.throws(() => parseCutoverControlArguments(["read", "--configured-database",
      "--db", databasePath, "--cutover-id", "x", "--artifact-id", "y"]), /exactly one/);
  });

  it("fails reads against missing SQLite schemas without creating or backfilling them", () => {
    const missingPath = join(directory, "missing.sqlite");
    const result = runNode([new URL("./cutover-control.ts", import.meta.url).pathname,
      "read", "--db", missingPath, "--cutover-id", "missing-cutover",
      "--artifact-id", "missing-artifact"], { ...process.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unable to open database file|does not exist/i);
    assert.equal(existsSync(missingPath), false);
    const emptyPath = join(directory, "existing-empty.sqlite");
    writeFileSync(emptyPath, "");
    const emptyResult = runNode([new URL("./cutover-control.ts", import.meta.url).pathname,
      "read", "--db", emptyPath, "--cutover-id", "missing-cutover",
      "--artifact-id", "missing-artifact"], { ...process.env });
    assert.notEqual(emptyResult.status, 0);
    assert.match(emptyResult.stderr, /CUTOVER_SCHEMA_NOT_INITIALIZED/);
    assert.equal(statSync(emptyPath).size, 0);
    assert.equal(existsSync(`${emptyPath}-wal`), false);
    assert.equal(existsSync(`${emptyPath}-shm`), false);
  });

  it("initializes the exact artifact and independently blocks unresolved provider accounting", async () => {
    const initialized = await runCutoverControl(["initialize", ...target,
      "--operation-id", "cli-initialize", "--operator-id", "operator", "--policy", policyPath]);
    assert.equal(field(initialized, "kind"), "initialized");
    const db = await import("../db.js");
    await db.query("INSERT INTO users (id,username,password_hash,created_at) VALUES ('owner','owner','x',$1)",
      [new Date().toISOString()]);
    await db.query(`INSERT INTO provider_operation_runs
      (run_id,observer_user_id,battle_id,taxonomy_revision,projected_operations_json,
       approved_attempt_ceiling,reserved_attempts,status,created_at,finished_at)
      VALUES ('active-run','owner',NULL,'test','[]',1,0,'active',$1,NULL)`, [new Date().toISOString()]);
    const blocked = await runCutoverControl(["barrier", ...target,
      "--operation-id", "cli-barrier", "--operator-id", "operator", "--expect-revision", "1",
      "--provider-accounting-receipt", "accounting-readback"]);
    assert.equal(field(blocked, "kind"), "blocked");
    assert.deepEqual(field(blocked, "unresolved"), {
      activeProviderRuns: 1, reservedProviderAttempts: 0, generatingNarrationAttempts: 0,
      unfinishedCharacterJobs: 0, unfinishedBattlefieldJobs: 0, unfinishedNarrationStyleJobs: 0,
    });
    await db.query("UPDATE provider_operation_runs SET status='completed',finished_at=$1 WHERE run_id='active-run'",
      [new Date().toISOString()]);
    const recorded = await runCutoverControl(["barrier", ...target,
      "--operation-id", "cli-barrier", "--operator-id", "operator", "--expect-revision", "1",
      "--provider-accounting-receipt", "accounting-readback"]);
    assert.equal(field(recorded, "kind"), "recorded");
    assert.equal(field(field(recorded, "control"), "revision"), 2);
  });
});
