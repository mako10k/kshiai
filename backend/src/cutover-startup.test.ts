// R: Verify a configured closed cold start serves health without schema, seed, queue, or provider writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { it } from "node:test";
it("connects to an initialized SQLite schema without cold-start mutation even when control is missing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cutover-cold-start-"));
  process.env.DATABASE_URL = "";
  process.env.DIRECT_URL = "";
  process.env.DATABASE_PATH = join(directory, "runtime.sqlite");
  process.env.CUTOVER_ID = "startup-cutover";
  process.env.CUTOVER_ARTIFACT_ID = "startup-artifact";
  const db = await import("./db.js");
  db.getDb({ initializeSchema: true });
  const before = db.getDb().pragma("schema_version", { simple: true });
  await db.closeDatabase();
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => socket.close((error) => error ? reject(error) : resolveClose()));
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), resolve("backend/src/index.ts")], {
    cwd: directory, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
      LLM_PROVIDER: "mock", AUTH_PROVIDER: "legacy", HOST: "127.0.0.1", PORT: String(port),
      ORIGIN_SHARED_SECRET: "", NARRATION_TASK_QUEUE: "", AUTHORING_TASK_QUEUE: "",
    },
  });
  let diagnostic = "";
  child.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString(); });
  try {
    await new Promise<void>((ready, reject) => {
      const timer = setTimeout(() => reject(new Error(`cold start timeout: ${diagnostic}`)), 15000);
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("API listening")) { clearTimeout(timer); ready(); }
      });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`cold start exited ${code}: ${diagnostic}`)); });
    });
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    const blocked = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "blocked", password: "password" }),
    });
    assert.equal(blocked.status, 503);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  }
  assert.equal(db.getDb().pragma("schema_version", { simple: true }), before);
  for (const table of ["users", "battlefields", "narration_styles", "battles", "provider_operation_runs", "provider_operation_attempts", "battle_narration_outbox", "character_authoring_jobs"]) {
    const count = db.getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    assert.deepEqual(count, { n: 0 }, table);
  }
  await db.closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});
