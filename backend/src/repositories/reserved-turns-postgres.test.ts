// R: Verify reserved-turn pipeline v1 fences, optimistic writes and rollback on native PostgreSQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Client } from "pg";
import { initializeReservedTurns, ReservedTurnPolicySchema } from "@kshiai/shared";
import type { DatabaseConnection, DatabaseRow } from "../db.js";
const connectionString = process.env.AWARENESS_POSTGRES_TEST_URL;
process.env.DATABASE_URL = connectionString ?? "";
const repository = await import("./reserved-turns.js");
function connection(client: Client): DatabaseConnection {
  return { async query<Row extends DatabaseRow>(sql: string, parameters: unknown[] = []) {
    const result = await client.query<Row>(sql, parameters);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  } };
}
test("reserved-turn pipeline v1 persists only current fenced writes and rolls back atomically on PostgreSQL", { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const target = new URL(connectionString);
  assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname));
  assert.equal(target.pathname, "/kshiai_awareness_test");
  const client = new Client({ connectionString });
  const schema = `reserved_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query("CREATE TABLE battles(id TEXT PRIMARY KEY)");
    await client.query("CREATE TABLE battle_leases(battle_id TEXT PRIMARY KEY, owner_id TEXT, fencing_token INTEGER, expires_at TEXT)");
    await client.query(readFileSync(new URL("../../migrations/0038_reserved_turns.sql", import.meta.url), "utf8"));
    await client.query("INSERT INTO battles VALUES('battle')");
    const now = new Date().toISOString();
    await client.query("INSERT INTO battle_leases VALUES('battle','writer',2,$1)", [new Date(Date.now() + 60000).toISOString()]);
    const policy = ReservedTurnPolicySchema.parse({ revision: "reserved-turn-policy-v1", maxTurns: 36, maxReservations: 5, maxLogicalCallsPerTurn: 4,
      maxPhysicalAttempts: 200, durationMs: 600000, deadlineMs: 60000, characterOutputTokens: 2000, adjudicationOutputTokens: 10000, inputCharacters: 128000,
      character: { provider: "fixture", model: "character" }, adjudication: { provider: "fixture", model: "judge" }, narration: { provider: "fixture", model: "narration" } });
    const db = connection(client);
    await repository.insertReservedRuntime(db, "battle", initializeReservedTurns(policy, Date.now()), now);
    const initial = await repository.getReservedRuntimeInTransaction(db, "battle", { lock: true });
    assert.ok(initial);
    const fence = { battleId: "battle", ownerId: "writer", fencingToken: 2 };
    const saved = await repository.writeReservedRuntime(db, initial, { ...initial.runtime, turn: 1 }, now, fence);
    assert.equal(saved.revision, 1);
    assert.equal(saved.fencingToken, 2);
    await assert.rejects(repository.writeReservedRuntime(db, initial, initial.runtime, now, fence), /REVISION_OR_LEASE_CONFLICT/);
    await assert.rejects(repository.writeReservedRuntime(db, saved, saved.runtime, now, { ...fence, ownerId: "stale" }), /REVISION_OR_LEASE_CONFLICT/);
    await client.query("BEGIN");
    await repository.writeReservedRuntime(db, saved, { ...saved.runtime, turn: 2 }, now, fence);
    await client.query("ROLLBACK");
    assert.equal((await repository.getReservedRuntimeInTransaction(db, "battle"))?.runtime.turn, 1);
    await client.query("UPDATE battle_leases SET fencing_token=3 WHERE battle_id='battle'");
    await assert.rejects(repository.writeReservedRuntime(db, saved, saved.runtime, now, fence), /REVISION_OR_LEASE_CONFLICT/);
    const accounted = await repository.writeReservedRuntime(db, saved, saved.runtime, now);
    assert.equal(accounted.revision, 2, "physical accounting can close after lease loss");
    await client.query("DELETE FROM battles WHERE id='battle'");
    assert.equal(await repository.getReservedRuntimeInTransaction(db, "battle"), null);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
