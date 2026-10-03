// R: Verify trial disposal and rollback exclusively in a newly created disposable local PostgreSQL17 database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "backend/package.json"));
const { Client } = require("pg");
const caPath = "/tmp/vt104-trial-disposal-pg17/data/server.crt";
const options = { host: "127.0.0.1", port: 55443, user: "katsumata-m",
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true }, connectionTimeoutMillis: 3000 };
const admin = new Client({ ...options, database: "postgres" });
const databaseName = `vt104_trial_disposal_${Date.now()}_${process.pid}`;
const directory = mkdtempSync(join(tmpdir(), "vt104-trial-disposal-input-"));
const node = "/home/katsumata-m/.nvm/versions/node/v22.22.3/bin/node";
const cliPath = join(root, "backend/src/scripts/prepare-unreleased-v3-trial.ts");
const identity = ["--configured-database", "--local-test-database", databaseName, "--schema", "public"];
const cliEnv = { ...process.env, DIRECT_URL: `postgres://katsumata-m@127.0.0.1:55443/${databaseName}`,
  POSTGRES_CA_CERT_PATH: caPath, AUTH_PROVIDER: "legacy", CUTOVER_ID: "", CUTOVER_ARTIFACT_ID: "" };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const checks = [];
let database;
let created = false;
function command(commandName, flags, success = true) {
  const result = spawnSync(node, ["--import", "tsx", cliPath, commandName, ...identity, ...flags],
    { cwd: root, env: cliEnv, encoding: "utf8", timeout: 15000 });
  if (success) {
    assert.equal(result.status, 0, `${commandName}: ${result.stderr}`);
    return JSON.parse(result.stdout);
  }
  assert.notEqual(result.status, 0, "Expected a rejected operation");
  return result;
}
const cutover = ["--cutover-id", "synthetic-trial-cutover", "--cutover-at", "2026-10-01T02:00:00.000Z"];
const policyPath = join(directory, "policy.json");
const planPath = join(directory, "plan.json");
function setPolicy(expired = false) {
  const stoppedAt = Date.now() - (expired ? 20000 : 10000);
  writeFileSync(policyPath, JSON.stringify({ kind: "unreleased-initial-v3-trial",
    ownerDecisionIdentity: "synthetic-local-only-owner-decision", oldWritersClosedReceiptId: "synthetic-local-only-stopped-writer",
    stoppedAt: new Date(stoppedAt).toISOString(), expiresAt: new Date(stoppedAt + (expired ? 10000 : 1800000)).toISOString() }));
}
function savePlan(plan) {
  const bytes = `${JSON.stringify(plan, null, 2)}\n`;
  writeFileSync(planPath, bytes);
  return ["--plan", planPath, "--expect-plan-sha256", hash(bytes)];
}
async function stateFingerprint() {
  const tables = (await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const rows = [];
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    rows.push({ table: tablename, values: (await database.query(`SELECT to_jsonb(t)::text AS row FROM public.${tablename} t ORDER BY to_jsonb(t)::text`)).rows });
  }
  return hash(JSON.stringify(rows));
}
async function rejectUnchanged(name, flags) {
  const before = await stateFingerprint();
  command("apply", [...flags, "--policy", policyPath, "--operator-id", "synthetic-operator"], false);
  assert.equal(await stateFingerprint(), before, name);
  checks.push({ name, passed: true });
}
try {
  await admin.connect();
  assert.match((await admin.query("SELECT version() AS version")).rows[0].version, /PostgreSQL 17\.11/);
  assert.equal((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [databaseName])).rowCount, 0);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;
  for (const role of ["anon", "authenticated"]) {
    if ((await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount === 0) await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  }
  database = new Client({ ...options, database: databaseName });
  await database.connect();
  await database.query("CREATE TABLE kshiai_schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
  const migrations = readdirSync(join(root, "backend/migrations")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const name of migrations.filter((name) => Number(name.slice(0, 4)) <= 25)) {
    const sql = readFileSync(join(root, "backend/migrations", name), "utf8");
    await database.query(sql);
    await database.query("INSERT INTO kshiai_schema_migrations(name,checksum) VALUES($1,$2)", [name, hash(sql)]);
  }
  const at = "2026-10-01T01:00:00.000Z";
  await database.query("INSERT INTO users(id,username,password_hash,created_at) VALUES('synthetic-owner','synthetic-owner','synthetic-only',$1)", [at]);
  for (const id of ["synthetic-a", "synthetic-b"]) {
    await database.query("INSERT INTO characters(id,owner_user_id,sheet_json,created_at,updated_at) VALUES($1,'synthetic-owner','{}',$2,$2)", [id, at]);
  }
  for (let index = 0; index < 186; index += 1) {
    const active = index < 18;
    const id = `synthetic-${active ? "active" : "finished"}-${String(index).padStart(3, "0")}`;
    await database.query("INSERT INTO battles(id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at) VALUES($1,$2,'synthetic-owner','synthetic-a','synthetic-b',$3,$3)",
      [id, JSON.stringify({ id, status: active ? "active" : "finished", synthetic: true }), at]);
    if (active) {
      await database.query("INSERT INTO idempotency_keys(user_id,scope,key,request_hash,status,owner_id,response_json,created_at,updated_at,expires_at) VALUES('synthetic-owner',$1,'synthetic-key','synthetic-hash','completed','synthetic-owner',$2,$3,$3,'2030-01-01')",
        [`battle-advance:${id}`, JSON.stringify({ battle: { id } }), at]);
    }
    if (index < 8 || (index >= 18 && index < 32)) {
      await database.query("INSERT INTO battle_narration_entries(battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,status,attempt_count,terminal_narrative_json,created_at,updated_at) VALUES($1,'synthetic-receipt',1,'turn',1,'{}',$2,'completed',1,$3,$4,$4)",
        [id, "a".repeat(64), JSON.stringify({ synthetic: true, text: "completed" }), at]);
      await database.query("INSERT INTO battle_narration_outbox(outbox_id,battle_id,receipt_id,status,delivery_generation,created_at) VALUES($1,$2,'synthetic-receipt','dispatched',3,$3)", [`synthetic-outbox-${index}`, id, at]);
    }
  }
  const originalFinished = (await database.query("SELECT id,state_json::text FROM battles WHERE state_json->>'status'='finished' ORDER BY id")).rows;
  const originalUsers = (await database.query("SELECT to_jsonb(u)::text AS row FROM users u ORDER BY id")).rows;
  const beforePreview = await stateFingerprint();
  const plan = command("preview", cutover);
  assert.equal(plan.targets.length, 18);
  assert.equal(plan.finished.length, 168);
  assert.equal(plan.finishedOutbox.length, 14);
  assert.equal(await stateFingerprint(), beforePreview);
  assert.equal((await database.query("SELECT to_regclass('public.battle_discard_receipts') AS name")).rows[0].name, null);
  checks.push({ name: "read-only preview with receipt table absent,18targets/168finished/14outbox", passed: true });
  const flags = savePlan(plan);
  setPolicy(true);
  await rejectUnchanged("expired stop policy", flags);
  setPolicy();
  await database.query("UPDATE battle_narration_outbox SET delivery_generation=4 WHERE outbox_id='synthetic-outbox-18'");
  await rejectUnchanged("frozen finished-outbox generation drift", flags);
  await database.query("UPDATE battle_narration_outbox SET delivery_generation=3 WHERE outbox_id='synthetic-outbox-18'");
  await database.query("INSERT INTO provider_operation_runs(run_id,observer_user_id,battle_id,taxonomy_revision,projected_operations_json,approved_attempt_ceiling,status,created_at) VALUES('synthetic-running','synthetic-owner','synthetic-active-000','synthetic','{}',1,'active',$1)", [at]);
  await rejectUnchanged("active provider fails quiescence", flags);
  await database.query("DELETE FROM provider_operation_runs WHERE run_id='synthetic-running'");
  await database.query("INSERT INTO battle_leases(battle_id,owner_id,fencing_token,expires_at,acquired_at) VALUES('synthetic-active-000','synthetic-worker',1,$1,$2)",
    [new Date(Date.now() + 60000).toISOString(), new Date().toISOString()]);
  await rejectUnchanged("nonexpired battle lease blocks before receipt bootstrap", flags);
  await database.query("DELETE FROM battle_leases WHERE battle_id='synthetic-active-000'");
  await database.query("CREATE TABLE battle_discard_receipts(battle_id text NOT NULL,cutover_id text NOT NULL)");
  await rejectUnchanged("receipt table without required primary key", flags);
  await database.query("DROP TABLE battle_discard_receipts");
  await database.query("CREATE FUNCTION synthetic_discard_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$");
  await database.query("CREATE TRIGGER synthetic_discard_failure BEFORE DELETE ON battles FOR EACH ROW EXECUTE FUNCTION synthetic_discard_failure()");
  await rejectUnchanged("rollback includes receipt bootstrap and finished-outbox updates", flags);
  assert.equal((await database.query("SELECT to_regclass('public.battle_discard_receipts') AS name")).rows[0].name, null);
  await database.query("DROP TRIGGER synthetic_discard_failure ON battles");
  await database.query("DROP FUNCTION synthetic_discard_failure()");
  const result = command("apply", [...flags, "--policy", policyPath, "--operator-id", "synthetic-operator"]);
  assert.equal(result.kind, "prepared");
  assert.equal(result.discardedIds.length, 18);
  assert.equal(result.completedOutboxIds.length, 14);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM battle_discard_receipts")).rows[0].n, 18);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM battles")).rows[0].n, 168);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM battle_narration_outbox WHERE status='completed'")).rows[0].n, 14);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM idempotency_keys")).rows[0].n, 0);
  assert.deepEqual((await database.query("SELECT id,state_json::text FROM battles WHERE state_json->>'status'='finished' ORDER BY id")).rows, originalFinished);
  assert.deepEqual((await database.query("SELECT to_jsonb(u)::text AS row FROM users u ORDER BY id")).rows, originalUsers);
  checks.push({ name: "exact18 discard+14accounting,finished168/users preserved", passed: true });
  assert.equal(command("readback", flags).kind, "replayed");
  const afterApply = await stateFingerprint();
  assert.equal(command("apply", [...flags, "--policy", policyPath, "--operator-id", "synthetic-operator"]).kind, "replayed");
  assert.equal(await stateFingerprint(), afterApply);
  checks.push({ name: "independent CLI readback and no-write replay", passed: true });
  await database.query("INSERT INTO battle_narration_outbox(outbox_id,battle_id,receipt_id,status,delivery_generation,created_at) VALUES('synthetic-extra','synthetic-finished-018','synthetic-receipt','dispatched',3,$1)", [at]);
  const beforeExtraReadback = await stateFingerprint();
  command("readback", flags, false);
  assert.equal(await stateFingerprint(), beforeExtraReadback);
  await rejectUnchanged("unexpected post-apply pending outbox rejects replay", flags);
  await database.query("DELETE FROM battle_narration_outbox WHERE outbox_id='synthetic-extra'");
  checks.push({ name: "unexpected post-apply pending outbox rejects readback", passed: true });
  await database.query("UPDATE battles SET state_json=jsonb_set(state_json,'{synthetic}','false') WHERE id='synthetic-finished-018'");
  command("readback", flags, false);
  await database.query("UPDATE battles SET state_json=jsonb_set(state_json,'{synthetic}','true') WHERE id='synthetic-finished-018'");
  checks.push({ name: "finished-state drift rejected on independent readback", passed: true });
  assert.equal((await database.query("SELECT 1 FROM kshiai_schema_migrations WHERE name='0029_battle_discard_receipts.sql'")).rowCount, 0);
  for (const name of migrations.filter((name) => Number(name.slice(0, 4)) > 25)) {
    const sql = readFileSync(join(root, "backend/migrations", name), "utf8");
    await database.query(sql);
    await database.query("INSERT INTO kshiai_schema_migrations(name,checksum) VALUES($1,$2)", [name, hash(sql)]);
  }
  assert.equal((await database.query("SELECT count(*)::int AS n FROM kshiai_schema_migrations")).rows[0].n, migrations.length);
  assert.equal(command("readback", flags).kind, "replayed");
  checks.push({ name: "formal forward migrations0026-0030 succeed after bootstrap without earlyledger", passed: true });
  writeFileSync(join(root, "docs/evidence/vt104-disposal-pg17-result-2026-10-01.json"), `${JSON.stringify({
    observedAt: new Date().toISOString(), PostgreSQL: "17.11", node: execFileSync(node, ["--version"], { encoding: "utf8" }).trim(),
    target: { host: "127.0.0.1", port: 55443, database: databaseName }, synthetic: true,
    sharedCloudDatabaseWrites: 0, checks, finishedPreserved: 168, discardedSynthetic: 18, accountedSynthetic: 14,
    migration0029: hash(readFileSync(join(root, "backend/migrations/0029_battle_discard_receipts.sql"))),
    limitation: "Local synthetic PostgreSQL proof; no deployed startup/Google/real V3 battle or shared database disposal proof.",
  }, null, 2)}\n`);
  console.log(JSON.stringify({ checks: checks.length, allPassed: true, synthetic: true }));
} finally {
  if (database) await database.end();
  if (created) await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
  await admin.end();
  rmSync(directory, { recursive: true, force: true });
}
