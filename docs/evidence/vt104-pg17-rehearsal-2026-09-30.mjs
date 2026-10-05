// R: Measure dump/restore and cutover readback on explicitly disposable PostgreSQL17 synthetic databases.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const repo = resolve(import.meta.dirname, "../..");
const runtime = "/tmp/vt104-pg17-rehearsal";
const bin = join(runtime, "root/usr/lib/postgresql/17/bin");
const socket = join(runtime, "socket");
const require = createRequire(join(repo, "backend/package.json"));
const { Client } = require("pg");
const env = { ...process.env, LD_LIBRARY_PATH: join(runtime, "root/usr/lib/x86_64-linux-gnu"), PGHOST: socket, PGPORT: "55441", PGUSER: "katsumata-m", PGDATABASE: "postgres" };
for (const name of ["PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]) delete env[name];
assert.match(execFileSync(join(bin, "pg_dump"), ["--version"], { env, encoding: "utf8" }), /17\.11/);
const source = "vt104_synthetic_source";
const restores = ["vt104_synthetic_before", "vt104_synthetic_after"];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const connection = (database) => new Client({ host: "127.0.0.1", port: 55441, database, user: "katsumata-m", ssl: { ca: readFileSync(join(runtime, "data/server.crt"), "utf8"), rejectUnauthorized: true }, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
const admin = connection("postgres");
await admin.connect();
assert.match((await admin.query("select version() AS version")).rows[0].version, /PostgreSQL 17\.11/);
for (const name of [source, ...restores]) {
  assert.match(name, /^vt104_synthetic_[a-z]+$/);
  assert.equal((await admin.query("select count(*)::int AS n from pg_database where datname=$1", [name])).rows[0].n, 0, "Never replace an existing database");
  await admin.query(`CREATE DATABASE ${name}`);
}
// These synthetic roles only satisfy checked-in migration grants; they do not model Supabase role topology.
for (const name of ["anon", "authenticated"]) {
  if ((await admin.query("select 1 from pg_roles where rolname=$1", [name])).rowCount === 0) await admin.query(`CREATE ROLE ${name} NOLOGIN`);
}
const db = connection(source);
await db.connect();
await db.query("CREATE TABLE public.kshiai_schema_migrations (name text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
const files = readdirSync(join(repo, "backend/migrations")).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
const migrations = files.map((name) => ({ name, sql: readFileSync(join(repo, "backend/migrations", name), "utf8") }));
async function migrate(list) {
  await db.query("BEGIN");
  try {
    for (const { name, sql } of list) {
      await db.query(sql);
      await db.query("INSERT INTO kshiai_schema_migrations(name,checksum) values($1,$2)", [name, createHash("sha256").update(sql).digest("hex")]);
    }
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
}
const initial = migrations.filter((m) => Number(m.name.slice(0, 4)) <= 25);
const pending = migrations.filter((m) => Number(m.name.slice(0, 4)) > 25);
assert.equal(initial.length, 26); assert.equal(pending.length, 4);
await migrate(initial);
const timestamp = "2026-09-30T00:00:00Z";
await db.query("INSERT INTO users(id,username,password_hash,created_at) VALUES('synthetic-owner','synthetic-owner','not-a-real-password',$1)", [timestamp]);
for (const id of ["synthetic-a", "synthetic-b"]) {
  await db.query("INSERT INTO characters(id,owner_user_id,sheet_json,created_at,updated_at) VALUES($1,'synthetic-owner','{}',$2,$2)", [id, timestamp]);
  await db.query("INSERT INTO asset_generations(asset_type,asset_id,generation,generation_id,schema_version,content_json,content_digest,created_at) VALUES('character',$1,1,$2,3,$3,$4,$5)", [id, `${id}-g1`, JSON.stringify({ synthetic: true, name: id }), hash(id), timestamp]);
  await db.query("INSERT INTO asset_current_generations(asset_type,asset_id,generation,generation_id,updated_at) VALUES('character',$1,1,$2,$3)", [id, `${id}-g1`, timestamp]);
}
for (let i = 0; i < 186; i++) {
  const id = `synthetic-battle-${String(i).padStart(3, "0")}`;
  const state = { id, status: i < 18 ? "active" : "finished", synthetic: true, log: [`Unicode保持 ${i} 🌙`], payload: "x".repeat(2048) };
  await db.query("INSERT INTO battles(id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at) VALUES($1,$2,'synthetic-owner','synthetic-a','synthetic-b',$3,$3)", [id, state, timestamp]);
  if (i < 18) {
    await db.query("INSERT INTO battle_presentations(battle_id,receipt_id,sequence,phase,input_digest,narrative_json,created_at) VALUES($1,'receipt',1,'turn','synthetic',$2,$3)", [id, { text: "Synthetic narration" }, timestamp]);
    await db.query("INSERT INTO battle_narration_events(battle_id,event_sequence,event_id,receipt_id,narration_sequence,kind,public_payload_json,created_at) VALUES($1,1,'event','receipt',1,'synthetic','{}',$2)", [id, timestamp]);
    await db.query("INSERT INTO battle_narration_outbox(outbox_id,battle_id,receipt_id,status,created_at) VALUES($1,$2,'receipt','pending',$3)", [`outbox-${i}`, id, timestamp]);
    await db.query("INSERT INTO idempotency_keys(user_id,scope,key,request_hash,status,owner_id,response_json,created_at,updated_at,expires_at) VALUES('synthetic-owner',$1,'key','synthetic','completed','synthetic',$2,$3,$3,'2030-01-01')", [`battle-advance:${id}`, { battle: { id } }, timestamp]);
  }
}
for (let i = 0; i < 267; i++) await db.query("INSERT INTO balance_events(kind,created_at,battle_id,payload_json) VALUES('synthetic',$1,'synthetic-battle-000',$2)", [timestamp, { ordinal: i, synthetic: true }]);
await db.query("INSERT INTO provider_operation_runs(run_id,observer_user_id,battle_id,taxonomy_revision,projected_operations_json,approved_attempt_ceiling,status,created_at,finished_at) VALUES('synthetic-run','synthetic-owner','synthetic-battle-000','synthetic','{}',1,'completed',$1,$1)", [timestamp]);

async function readback(client) {
  const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((r) => r.tablename);
  const contents = [];
  for (const table of tables) {
    assert.match(table, /^[a-z0-9_]+$/);
    const rows = (await client.query(`SELECT to_jsonb(t)::text AS value FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows.map((r) => r.value);
    contents.push({ table, count: rows.length, digest: hash(rows) });
  }
  const catalog = (await client.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,
    (select jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable) order by grantor,grantee,privilege_type,is_grantable) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))) AS effective_acl,
    (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
    (select jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid)) order by x.conname) from pg_constraint x where x.conrelid=c.oid) as constraints
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`)).rows;
  const exists = (await client.query("select to_regclass('public.character_focused_authoring_payloads') IS NOT NULL as present")).rows[0].present;
  const access = exists ? (await client.query("select has_table_privilege('anon','public.character_focused_authoring_payloads','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as anon_any,has_table_privilege('authenticated','public.character_focused_authoring_payloads','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as authenticated_any WHERE to_regclass('public.character_focused_authoring_payloads') IS NOT NULL")).rows : [];
  if (access.length) { assert.equal(access[0].anon_any, false); assert.equal(access[0].authenticated_any, false); }
  const sequences = [];
  for (const { sequencename } of (await client.query("select sequencename from pg_sequences where schemaname='public' order by sequencename")).rows) {
    assert.match(sequencename, /^[a-z0-9_]+$/);
    sequences.push({ sequence: sequencename, state: (await client.query(`select last_value::text,is_called from public.${sequencename}`)).rows[0] });
  }
  const indexes = (await client.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname")).rows;
  return { tables: contents, contentsDigest: hash(contents), catalogDigest: hash(catalog), indexesDigest: hash(indexes), sequencesDigest: hash(sequences), access };
}
async function snapshotRestore(label, target) {
  const before = await readback(db); const archive = join(runtime, `${label}.dump`);
  const dumpStart = performance.now();
  execFileSync(join(bin, "pg_dump"), ["--dbname", source, "--format=custom", "--file", archive], { env, timeout: 60000 });
  const dumpMs = performance.now() - dumpStart; const restoreStart = performance.now();
  execFileSync(join(bin, "pg_restore"), ["--dbname", target, "--exit-on-error", "--single-transaction", archive], { env, timeout: 60000 });
  const restoreMs = performance.now() - restoreStart; const restored = connection(target); await restored.connect();
  try { assert.deepEqual(await readback(restored), before); } finally { await restored.end(); }
  const bytes = readFileSync(archive);
  return { label, source, restoredDatabase: target, dumpMs, restoreMs, archiveBytes: bytes.length, archiveSha256: createHash("sha256").update(bytes).digest("hex"), readback: before, matched: true };
}
const before = await snapshotRestore("before-pending-migrations", restores[0]);
await migrate(pending);
process.env.DATABASE_URL = `postgresql://katsumata-m@127.0.0.1:55441/${source}`;
process.env.DATABASE_SCHEMA = "public";
process.env.POSTGRES_CA_CERT_PATH = join(runtime, "data/server.crt");
process.env.LLM_PROVIDER = "mock";
const cutover = await import(join(repo, "backend/src/repositories/battle-cutover.ts"));
const database = await import(join(repo, "backend/src/db.ts"));
const plan = await cutover.planBattleCutover({ cutoverId: "synthetic-rehearsal", cutoverAt: "2026-09-30T10:00:00Z" });
assert.equal(plan.targets.length, 18); assert.equal(plan.finished.length, 168);
const retained = (await readback(db)).tables.filter((t) => ["asset_generations", "asset_current_generations", "balance_events", "provider_operation_runs"].includes(t.table));
const finishedRowsBefore = (await db.query("select id,state_json::text from battles where state_json->>'status'='finished' order by id")).rows;
const cutoverStart = performance.now();
const result = await cutover.discardBattleCutover({ plan, operatorId: "synthetic-operator", stopped: true, recoverySnapshotIdentity: before.archiveSha256 });
const cutoverMs = performance.now() - cutoverStart;
assert.deepEqual((await db.query("select id,state_json::text from battles where state_json->>'status'='finished' order by id")).rows, finishedRowsBefore);
assert.equal(result.kind, "discarded"); assert.equal(result.discardedIds.length, 18);
assert.equal((await db.query("select count(*)::int AS n from battles")).rows[0].n, 168);
assert.equal((await db.query("select count(*)::int AS n from battle_discard_receipts")).rows[0].n, 18);
for (const table of ["battle_presentations", "battle_narration_events", "battle_narration_outbox", "idempotency_keys"]) assert.equal((await db.query(`select count(*)::int AS n from ${table}`)).rows[0].n, 0);
assert.deepEqual((await readback(db)).tables.filter((t) => retained.some((r) => r.table === t.table)), retained);
const replay = await cutover.discardBattleCutover({ plan, operatorId: "synthetic-operator", stopped: true, recoverySnapshotIdentity: before.archiveSha256 });
assert.equal(replay.kind, "replayed");
const after = await snapshotRestore("after-cutover", restores[1]);
await database.closeDatabase();
await db.end(); await admin.end();
writeFileSync(join(repo, "docs/evidence/vt104-pg17-rehearsal-result-2026-09-30.json"), JSON.stringify({ schema: "kshiai/vt104-local-recovery-rehearsal/v1", syntheticOnly: true, productionConnection: false, productionSnapshot: false, productionRecoveryProof: false, server: "17.11", initialMigrations: initial.map((m) => m.name), pendingAppliedLocally: pending.map((m) => m.name), before, cutover: { targets: 18, finished: 168, cutoverMs, replay: replay.kind, retainedTablesMatched: true, finishedRowsDigest: hash(finishedRowsBefore) }, after, limitations: ["Synthetic status/JSON rows are not full domain battle fixtures", "186 rows does not model production byte size or contention", "Local superuser/anon/authenticated roles do not model Supabase roles/extensions/auth/storage", "Raw ACL owner-only vs default representation differs; effective privileges, owner and anon/authenticated denial compared instead", "Same-host local dump/restore does not prove production retrieval or recovery timing", "No cloud stop or production dump/restore performed"] }, null, 2) + "\n");
console.log(JSON.stringify({ matched: true, beforeDumpMs: before.dumpMs, beforeRestoreMs: before.restoreMs, cutoverMs, afterDumpMs: after.dumpMs, afterRestoreMs: after.restoreMs }));
