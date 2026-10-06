// R: Verify narrator budget admission serializes against actual concurrent PostgreSQL runtime writers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { AwarenessInitialize, AwarenessObservedPolicy, AwarenessPipelineStateSchema } from "@kshiai/shared";
import type { DatabaseConnection, DatabaseRow } from "../db.js";
import { reserveNarrationAttemptInTransaction, type NarrationReservationInput } from "./battle-awareness-narration-reservation.js";
const connectionString = process.env.AWARENESS_POSTGRES_TEST_URL;
function url() {
  if (!connectionString) {
    throw new Error("Missing local test URL");
  }
  const parsed = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== "kshiai_awareness_test") {
    throw new Error("Only loopback kshiai_awareness_test is permitted");
  }
  return parsed.toString();
}
function connection(client: Client): DatabaseConnection {
  return {
    async query<Row extends DatabaseRow>(sql: string, parameters: unknown[] = []) {
      const result = await client.query<Row>(sql, parameters);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0,
      };
    },
  };
}
const now = "2026-10-06T00:00:00.000Z";
async function waiting(observer: Client, pid: number) {
  for (let i = 0; i < 100; i++) {
    if ((await observer.query<{ waiting: boolean }>("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting) {
      return;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Runtime writer did not reach server lock barrier");
}
test("PostgreSQL narrator admission preserves world fence and prevents concurrent budget oversubscription", {
  skip: !connectionString,
}, async () => {
  const a = new Client(url()), b = new Client(url()), observer = new Client(url());
  const clients = [a, b, observer];
  const schema = `narration_reserve_${randomUUID().replaceAll("-", "")}`;
  await Promise.all(clients.map(client => client.connect()));
  try {
    await a.query(`CREATE SCHEMA ${schema}`);
    for (const client of clients) {
      await client.query(`SET search_path TO ${schema}`);
      await client.query("SET statement_timeout TO '5s'");
    }
    await a.query("CREATE TABLE battle_awareness_runtime(battle_id TEXT PRIMARY KEY,revision INTEGER,fencing_token INTEGER,runtime_json TEXT,updated_at TEXT)");
    await a.query("CREATE TABLE battle_narration_leases(battle_id TEXT PRIMARY KEY,owner_id TEXT,fencing_token INTEGER,expires_at TEXT)");
    await a.query("CREATE TABLE battle_awareness_narration_batches(battle_id TEXT,attempt_id TEXT PRIMARY KEY,fencing_token INTEGER,receipt_ids_json TEXT,deadline_at TEXT,status TEXT,reservation_id TEXT,request_digest TEXT,pricing_revision TEXT,maximum_usd REAL,updated_at TEXT)");
    await a.query("CREATE TABLE battle_narration_attempts(battle_id TEXT,attempt_id TEXT,fencing_token INTEGER,status TEXT)");
    await a.query("CREATE TABLE battle_narration_entries(battle_id TEXT,receipt_id TEXT,active_attempt_id TEXT,status TEXT)");
    const runtime = AwarenessInitialize({
      startedAt: Date.parse(now), promptRevision: "test", outputRevision: "test", policy: AwarenessObservedPolicy,
    });
    await a.query("INSERT INTO battle_awareness_runtime VALUES('battle',0,7,$1,$2)", [JSON.stringify(runtime), now]);
    await a.query("INSERT INTO battle_narration_leases VALUES('battle','narrator',3,'2026-10-06T00:01:00.000Z')");
    for (const id of ["first", "second", "rollback"]) {
      await a.query("INSERT INTO battle_awareness_narration_batches(battle_id,attempt_id,fencing_token,receipt_ids_json,deadline_at,status) VALUES('battle',$1,3,$2,'2026-10-06T00:00:30.000Z','claimed')", [id, JSON.stringify([id])]);
      await a.query("INSERT INTO battle_narration_attempts VALUES('battle',$1,3,'generating')", [id]);
      await a.query("INSERT INTO battle_narration_entries VALUES('battle',$1,$1,'generating')", [id]);
    }
    const input = (attemptId: string): NarrationReservationInput => ({
      battleId: "battle", ownerId: "narrator", fencingToken: 3, attemptId, receiptIds: [attemptId], now, requestDigest: "proof", pricingRevision: "unpriced", maximumUsd: null,
    });
    await a.query("BEGIN");
    await reserveNarrationAttemptInTransaction(connection(a), input("first"), "postgres");
    await b.query("BEGIN");
    const pid = (await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const pending = reserveNarrationAttemptInTransaction(connection(b), input("second"), "postgres").then(() => null, error => error);
    await waiting(observer, pid);
    await a.query("COMMIT");
    const failure: unknown = await pending;
    assert.ok(failure instanceof Error);
    assert.match(failure.message, /BUDGET_ADMISSION_REJECTED/);
    await b.query("ROLLBACK");
    const saved = (await observer.query<{
      revision: number;
      fencing_token: number;
      runtime_json: string;
    }>("SELECT revision,fencing_token,runtime_json FROM battle_awareness_runtime")).rows[0]!;
    assert.equal(saved.fencing_token, 7);
    assert.equal(saved.revision, 1);
    assert.equal(AwarenessPipelineStateSchema.parse(JSON.parse(saved.runtime_json)).budget.physicalAttempts, 1);
    assert.equal((await observer.query<{ status: string }>("SELECT status FROM battle_awareness_narration_batches WHERE attempt_id='second'")).rows[0]?.status, "claimed");
    // Simulate a world writer's old CAS: it cannot overwrite the reservation. Its fresh snapshot retains it.
    assert.equal((await observer.query("UPDATE battle_awareness_runtime SET runtime_json=$1 WHERE battle_id='battle' AND revision=0", [JSON.stringify(runtime)])).rowCount, 0);
    const refreshed = AwarenessPipelineStateSchema.parse(JSON.parse(saved.runtime_json));
    refreshed.tick = 1;
    await observer.query("UPDATE battle_awareness_runtime SET runtime_json=$1,revision=revision+1 WHERE battle_id='battle' AND revision=$2", [JSON.stringify(refreshed), saved.revision]);
    assert.equal((await observer.query<{ runtime_json: string }>("SELECT runtime_json FROM battle_awareness_runtime")).rows[0]?.runtime_json.includes('"first"'), true);
    await observer.query("UPDATE battle_awareness_runtime SET runtime_json=$1,revision=0", [JSON.stringify(runtime)]);
    await a.query("BEGIN");
    await reserveNarrationAttemptInTransaction(connection(a), input("rollback"), "postgres");
    await a.query("ROLLBACK");
    assert.equal((await observer.query<{ status: string }>("SELECT status FROM battle_awareness_narration_batches WHERE attempt_id='rollback'")).rows[0]?.status, "claimed");
    await a.query("BEGIN");
    await assert.rejects(reserveNarrationAttemptInTransaction(connection(a), {
      ...input("rollback"), fencingToken: 2,
    }, "postgres"), /STALE_FENCE/);
    await a.query("ROLLBACK");
  }
  finally {
    await Promise.all(clients.map(client => client.query("ROLLBACK").catch(() => undefined)));
    await a.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all(clients.map(client => client.end()));
  }
});
