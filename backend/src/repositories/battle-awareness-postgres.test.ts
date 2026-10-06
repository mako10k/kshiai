// R: Verify the fenced PostgreSQL awareness initialization contract against a disposable local database.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Client, type Client as PgClient } from "pg";
import { awarenessRuntimeInitializationQuery } from "./battle-awareness-initialization-query.js";

const connectionString = process.env.AWARENESS_POSTGRES_TEST_URL;
type RuntimeRow = { revision: number; fencing_token: number; runtime_json: string; updated_at: string };

function testDatabaseUrl(): URL | null {
  if (!connectionString) return null;
  const url = new URL(connectionString);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
  const database = decodeURIComponent(url.pathname.slice(1));
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !loopback || database !== "kshiai_awareness_test") {
    throw new Error("AWARENESS_POSTGRES_TEST_URL must target postgres:// loopback database kshiai_awareness_test");
  }
  return url;
}

async function withDatabase(run: (client: PgClient) => Promise<void>): Promise<void> {
  const url = testDatabaseUrl();
  if (!url) return;
  const client = new Client(url.toString());
  await client.connect();
  try {
    await client.query(`CREATE TEMP TABLE battle_leases (
      battle_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      fencing_token BIGINT NOT NULL,
      acquired_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query(`CREATE TEMP TABLE battle_awareness_runtime (
      battle_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      fencing_token INTEGER NOT NULL,
      runtime_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    return await run(client);
  } finally {
    await client.end();
  }
}

async function initialize(client: PgClient, input: Parameters<typeof awarenessRuntimeInitializationQuery>[0]) {
  const query = awarenessRuntimeInitializationQuery(input);
  return client.query(query.text, query.values);
}

async function insertLease(client: PgClient, battleId: string, ownerId: string, fencingToken: number, expiresAt: string, acquiredAt = "2026-10-06T00:00:00.000Z") {
  await client.query(
    "INSERT INTO battle_leases (battle_id, owner_id, fencing_token, acquired_at, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [battleId, ownerId, fencingToken, acquiredAt, expiresAt],
  );
}

test("PostgreSQL awareness initialization enforces owner, fence, and lease expiry", { skip: !connectionString }, async () => {
  await withDatabase(async (client) => {
    const now = "2026-10-06T00:00:00.000Z";
    await insertLease(client, "wrong-owner", "owner-1", 7, "2026-10-06T01:00:00.000Z");
    await insertLease(client, "stale-fence", "owner-1", 7, "2026-10-06T01:00:00.000Z");
    await insertLease(client, "expired", "owner-1", 7, "2026-10-06T01:00:00.000Z");
    await insertLease(client, "equal-expiry", "owner-1", 7, now);
    assert.equal((await initialize(client, { battleId: "wrong-owner", ownerId: "wrong-owner", fencingToken: 7, runtimeJson: '{"turn":2}', now })).rowCount, 0);
    assert.equal((await initialize(client, { battleId: "stale-fence", ownerId: "owner-1", fencingToken: 6, runtimeJson: '{"turn":3}', now })).rowCount, 0);
    assert.equal((await initialize(client, { battleId: "expired", ownerId: "owner-1", fencingToken: 7, runtimeJson: '{"turn":4}', now: "2026-10-06T02:00:00.000Z" })).rowCount, 0);
    assert.equal((await initialize(client, { battleId: "equal-expiry", ownerId: "owner-1", fencingToken: 7, runtimeJson: '{"turn":5}', now })).rowCount, 0);
    assert.equal((await initialize(client, { battleId: "missing-lease", ownerId: "owner-1", fencingToken: 7, runtimeJson: '{"turn":6}', now })).rowCount, 0);
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM battle_awareness_runtime")).rows[0]?.count, 0);

    await insertLease(client, "battle-1", "owner-1", 7, "2026-10-06T01:00:00.000Z");
    assert.equal((await initialize(client, { battleId: "battle-1", ownerId: "owner-1", fencingToken: 7, runtimeJson: '{"turn":1}', now })).rowCount, 1);
    const row = await client.query<RuntimeRow>("SELECT revision, fencing_token, runtime_json, updated_at FROM battle_awareness_runtime WHERE battle_id = $1", ["battle-1"]);
    assert.deepEqual(row.rows[0], { revision: 0, fencing_token: 7, runtime_json: '{"turn":1}', updated_at: now });
  });
});

test("PostgreSQL awareness initialization conflict preserves the original snapshot", { skip: !connectionString }, async () => {
  await withDatabase(async (client) => {
    const now = "2026-10-06T00:00:00.000Z";
    await client.query(
      "INSERT INTO battle_leases (battle_id, owner_id, fencing_token, acquired_at, expires_at) VALUES ($1, $2, $3, $4, $5)",
      ["battle-2", "owner-2", 9, now, "2026-10-06T01:00:00.000Z"],
    );
    const input = { battleId: "battle-2", ownerId: "owner-2", fencingToken: 9, runtimeJson: '{"turn":1}', now };
    assert.equal((await initialize(client, input)).rowCount, 1);
    assert.equal((await initialize(client, { ...input, runtimeJson: '{"turn":99}', now: "2026-10-06T00:05:00.000Z" })).rowCount, 0);
    const row = await client.query<RuntimeRow>("SELECT revision, fencing_token, runtime_json, updated_at FROM battle_awareness_runtime WHERE battle_id = $1", ["battle-2"]);
    assert.deepEqual(row.rows[0], { revision: 0, fencing_token: 9, runtime_json: '{"turn":1}', updated_at: now });
  });
});
