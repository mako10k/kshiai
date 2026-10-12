import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createPostgresConfig, createPostgresPool } from "./postgres-config.js";

const connectionString = "postgresql://user:password@localhost:5432/database";
const originalCaPath = process.env.POSTGRES_CA_CERT_PATH;

afterEach(() => {
  if (originalCaPath === undefined) {
    delete process.env.POSTGRES_CA_CERT_PATH;
  } else {
    process.env.POSTGRES_CA_CERT_PATH = originalCaPath;
  }
});

describe("createPostgresConfig", () => {
  it("uses the bundled CA when the override is absent", () => {
    delete process.env.POSTGRES_CA_CERT_PATH;
    assert.doesNotThrow(() => createPostgresConfig(connectionString));
  });

  it("uses the bundled CA when the override is empty", () => {
    process.env.POSTGRES_CA_CERT_PATH = "";
    assert.doesNotThrow(() => createPostgresConfig(connectionString));
  });

  it("uses the bundled CA when the override is whitespace", () => {
    process.env.POSTGRES_CA_CERT_PATH = "   ";
    assert.doesNotThrow(() => createPostgresConfig(connectionString));
  });

  it("uses a non-empty explicit override", () => {
    process.env.POSTGRES_CA_CERT_PATH = "/missing/kshiai-postgres-ca.crt";
    assert.throws(() => createPostgresConfig(connectionString));
  });
});

it("contains idle pool errors without serializing connection errors or clients", async (context) => {
  const diagnostic = context.mock.method(console, "error", () => undefined);
  const pool = createPostgresPool({ max: 1 });
  try {
    assert.equal(pool.emit("error", new Error("PRIVATE_CONNECTION_DETAILS"), { password: "PRIVATE_CLIENT_PASSWORD" }), true);
    assert.deepEqual(diagnostic.mock.calls.map((call) => call.arguments), [["[database] Idle PostgreSQL connection lost; pool will replace it"]]);
    assert.equal(pool.totalCount, 0);
  } finally { await pool.end(); }
});

it("replaces a terminated idle PostgreSQL client and rejects active query errors without replay", { skip: !process.env.AWARENESS_POSTGRES_TEST_URL }, async (context) => {
  const connectionString = process.env.AWARENESS_POSTGRES_TEST_URL;
  assert.ok(connectionString);
  const target = new URL(connectionString);
  assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname));
  assert.equal(target.pathname, "/kshiai_awareness_test");
  const diagnostic = context.mock.method(console, "error", () => undefined);
  const pool = createPostgresPool({ connectionString, max: 1, connectionTimeoutMillis: 2000 });
  const admin = createPostgresPool({ connectionString, max: 1 });
  try {
    const first = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const idleError = new Promise<void>((resolve) => pool.once("error", () => resolve()));
    await admin.query("SELECT pg_terminate_backend($1)", [first.rows[0]?.pid]);
    await idleError;
    const second = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    assert.notEqual(second.rows[0]?.pid, first.rows[0]?.pid);
    assert.equal(diagnostic.mock.calls.length, 1);
    const client = await pool.connect();
    try {
      const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      const pending = client.query("SELECT pg_sleep(5)");
      const rejected = assert.rejects(pending, /terminating connection|Connection terminated/);
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
      await rejected;
    } finally { client.release(true); }
    assert.equal(diagnostic.mock.calls.length, 1, "checked-out query error is not an idle error or an automatic retry");
    assert.equal((await pool.query<{ value: number }>("SELECT 1 AS value")).rows[0]?.value, 1);
  } finally { await pool.end(); await admin.end(); }
});
