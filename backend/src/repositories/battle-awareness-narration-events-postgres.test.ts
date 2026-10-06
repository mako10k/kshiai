// R: Verify per-battle event allocation under actual PostgreSQL statement-level concurrency.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import type { DatabaseConnection, DatabaseRow } from "../db.js";
import { appendNarrationEvent } from "../services/narration-event-storage.js";

const connectionString = process.env.AWARENESS_POSTGRES_TEST_URL;
function localUrl(): string {
  if (!connectionString) throw new Error("Missing local PostgreSQL test URL");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !== "kshiai_awareness_test") {
    throw new Error("PostgreSQL tests require loopback database kshiai_awareness_test");
  }
  return url.toString();
}
function connection(client: Client): DatabaseConnection {
  return { async query<Row extends DatabaseRow>(sql: string, parameters: unknown[] = []) {
    const result = await client.query<Row>(sql, parameters);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  } };
}
function append(client: Client, battleId: string) {
  return appendNarrationEvent({ connection: connection(client), battleId, receiptId: "receipt", narrationSequence: 1,
    kind: "queued", payload: { turnReceiptId: "receipt", narrationSequence: 1, phase: "combat", combatTurn: 1, status: "queued" },
    now: "2026-10-06T00:00:00.000Z" }, "postgres");
}
async function waitForLock(observer: Client, pid: number): Promise<void> {
  // Observe the actual server barrier; elapsed time alone cannot prove serialization.
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await observer.query<{ waiting: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS waiting", [pid]);
    if (result.rows[0]?.waiting) return;
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Second allocator did not reach its advisory lock barrier");
}

test("PostgreSQL event allocation serializes one battle, preserves others and retains prune floor", { skip: !connectionString }, async () => {
  const clients = [new Client(localUrl()), new Client(localUrl()), new Client(localUrl())];
  const first = clients[0]!; const second = clients[1]!; const observer = clients[2]!;
  const schema = `narration_events_${randomUUID().replaceAll("-", "")}`;
  await Promise.all(clients.map(client => client.connect()));
  try {
    await first.query(`CREATE SCHEMA ${schema}`);
    for (const client of clients) {
      await client.query(`SET search_path TO ${schema}`);
      await client.query("SET statement_timeout TO '5s'");
    }
    await first.query(`CREATE TABLE battle_narration_events(battle_id TEXT NOT NULL,event_sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,receipt_id TEXT NOT NULL,narration_sequence INTEGER NOT NULL,kind TEXT NOT NULL,
      public_payload_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(battle_id,event_sequence),UNIQUE(battle_id,event_id))`);
    await first.query("CREATE TABLE battle_narration_retention(battle_id TEXT PRIMARY KEY,pruned_through_sequence INTEGER NOT NULL,updated_at TEXT NOT NULL)");

    // Control: both old unlocked MAX reads see the same value before either INSERT.
    await first.query("BEGIN"); await second.query("BEGIN");
    const sql = "SELECT COALESCE(MAX(event_sequence),0)+1 AS next FROM battle_narration_events WHERE battle_id='control'";
    const values = await Promise.all([first.query<{ next: number }>(sql), second.query<{ next: number }>(sql)]);
    assert.deepEqual(values.map(value => value.rows[0]?.next), [1, 1]);
    const insert = "INSERT INTO battle_narration_events VALUES('control',1,'control:event:1','receipt',1,'queued','{}','now')";
    await first.query(insert);
    const collision = second.query(insert).then(() => "unexpected success", error => error instanceof Error ? error.message : "unknown error");
    await first.query("COMMIT");
    assert.match(await collision, /duplicate key/);
    await second.query("ROLLBACK");

    await first.query("BEGIN"); await second.query("BEGIN");
    await append(first, "serial");
    const pid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const pending = append(second, "serial");
    // Attach rejection immediately so a failed assertion cannot leave an unhandled promise.
    const completed = pending.then(() => null, error => error);
    await waitForLock(observer, pid);
    await observer.query("BEGIN"); await append(observer, "other"); await observer.query("COMMIT");
    await first.query("COMMIT");
    assert.equal(await completed, null);
    await second.query("COMMIT");
    assert.deepEqual((await observer.query<{ event_id: string }>("SELECT event_id FROM battle_narration_events WHERE battle_id='serial' ORDER BY event_sequence")).rows,
      [{ event_id: "serial:event:1" }, { event_id: "serial:event:2" }]);

    await first.query("BEGIN"); await append(first, "rolled-back"); await first.query("ROLLBACK");
    await second.query("BEGIN"); await append(second, "rolled-back"); await second.query("COMMIT");
    assert.equal((await observer.query<{ event_id: string }>("SELECT event_id FROM battle_narration_events WHERE battle_id='rolled-back'")).rows[0]?.event_id, "rolled-back:event:1");
    await first.query("BEGIN");
    await first.query("INSERT INTO battle_narration_retention VALUES('serial',2,'now')");
    await first.query("DELETE FROM battle_narration_events WHERE battle_id='serial'");
    await first.query("COMMIT");
    await second.query("BEGIN"); await append(second, "serial"); await second.query("COMMIT");
    assert.equal((await observer.query<{ event_id: string }>("SELECT event_id FROM battle_narration_events WHERE battle_id='serial'")).rows[0]?.event_id, "serial:event:3");
  } finally {
    await Promise.all(clients.map(client => client.query("ROLLBACK").catch(() => undefined)));
    await first.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all(clients.map(client => client.end()));
  }
});
