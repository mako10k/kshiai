// R: Verify the real Hono HTTP boundary blocks closed-state public routes while retaining owner identity reads.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";

test("closed HTTP routes block public auth/media and preserve owner /api/me auth", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kshiai-cutover-http-"));
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.DIRECT_URL;
  process.env.AUTH_PROVIDER = "legacy";
  process.env.LLM_PROVIDER = "mock";
  process.env.DATABASE_PATH = path.join(directory, "test.db");
  process.env.CUTOVER_ID = "cutover-http-test";
  process.env.CUTOVER_ARTIFACT_ID = "artifact-http-test";

  const { closeDatabase, getDb, initializeDatabase, query } = await import("./db.js");
  const auth = await import("./auth.js");
  const control = await import("./repositories/cutover-control.js");
  const { buildRoutes } = await import("./routes.js");
  getDb({ initializeSchema: true });
  await initializeDatabase();
  const owner = await auth.registerUser("cutover-owner", "password-123");
  await control.initializeCutoverControl({
    operationId: "init-http-test",
    operatorId: owner.id,
    phase: "closed",
    policy: {
      cutoverId: "cutover-http-test",
      artifactId: "artifact-http-test",
      ownerUserId: owner.id,
      ownerCandidates: [
        { attemptId: "attempt-a", candidateDigest: "a".repeat(64) },
        { attemptId: "attempt-b", candidateDigest: "b".repeat(64) },
      ],
      trialBindings: null,
      taskBattleIds: [],
      stageAcceptance: {
        health: null, postgres: null, email: null, google: null,
        ownership: null, r2: null, sse: null, directProtection: null,
      },
      productionReceipt: null,
    },
  });
  const app = buildRoutes({});
  const blocked = await app.request("/api/auth/register", { method: "POST" });
  assert.equal(blocked.status, 503);
  const media = await app.request("/api/media/character/missing.png");
  assert.equal(media.status, 503);

  const token = await auth.createSession(owner.id);
  const me = await app.request("/api/me", { headers: { Cookie: `kshiai_session=${token}` } });
  assert.equal(me.status, 200);
  assert.deepEqual((await me.json()).reviewConfirmOnly, true);

  const expired = await auth.createSession(owner.id);
  await query("UPDATE sessions SET expires_at = $1 WHERE token = $2", [new Date(0).toISOString(), expired]);
  const expiredResponse = await app.request("/api/me", { headers: { Cookie: `kshiai_session=${expired}` } });
  assert.equal(expiredResponse.status, 401);
  const retained = await query<{ count: number }>("SELECT COUNT(*) AS count FROM sessions WHERE token = $1", [expired]);
  assert.equal(Number(retained.rows[0]?.count ?? 0), 1);

  await query("UPDATE cutover_control_revisions SET stopped_barrier_receipt_id = $1 WHERE cutover_id = $2", ["stop-http-test", "cutover-http-test"]);
  const { cutoverRequestDigest } = await import("./services/cutover-admission.js");
  const body = { myCharacterId: "mine", opponentCharacterId: "opponent" };
  const expectedKey = "expected-key";
  const requestShape = { method: "POST", path: "/api/battles", body, idempotencyKey: expectedKey };
  const trialBindings = {
    generationIds: ["generation-a", "generation-b"] as [string, string],
    ownerConfirmationReceiptIds: ["owner-a", "owner-b"] as [string, string],
    cutoverReadbackReceiptId: "readback-http-test", stoppedBarrierReceiptId: "stop-http-test",
    requests: [{ bindingOperationId: "trial-create-http", kind: "http" as const, method: "POST", path: "/api/battles",
      requestDigest: cutoverRequestDigest(requestShape), battleId: "btl-trial-http", maximumReservations: 1 }],
  };
  await query("UPDATE cutover_control_revisions SET phase = 'trial', policy_json = $1, stopped_barrier_receipt_id = $2 WHERE cutover_id = $3", [
    JSON.stringify({
      cutoverId: "cutover-http-test", artifactId: "artifact-http-test", ownerUserId: owner.id,
      ownerCandidates: [{ attemptId: "attempt-a", candidateDigest: "a".repeat(64) }, { attemptId: "attempt-b", candidateDigest: "b".repeat(64) }],
      trialBindings: trialBindings, taskBattleIds: [], stageAcceptance: {
        health: null, postgres: null, email: null, google: null, ownership: null, r2: null, sse: null, directProtection: null,
      }, productionReceipt: null,
    }), "stop-http-test", "cutover-http-test",
  ]);
  const wrongKey = await app.request("/api/battles", {
    method: "POST", headers: { Cookie: `kshiai_session=${token}`, "Idempotency-Key": "wrong-key", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(wrongKey.status, 503);
  const wrongGeneration = await app.request("/api/battles", {
    method: "POST", headers: { Cookie: `kshiai_session=${token}`, "Idempotency-Key": expectedKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(wrongGeneration.status, 503);
  const battles = await query<{ count: number }>("SELECT COUNT(*) AS count FROM battles");
  assert.equal(Number(battles.rows[0]?.count ?? 0), 0);
  await query("UPDATE cutover_control_revisions SET phase = 'open' WHERE cutover_id = $1", ["cutover-http-test"]);
  const { cutoverHttpAdmission } = await import("./services/cutover-http-admission.js");
  const streamApp = new Hono();
  streamApp.use("/api/*", cutoverHttpAdmission);
  streamApp.get("/api/test/stream", () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("data: done\\n\\n")); controller.close(); },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  streamApp.get("/api/test/cancel", () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("data: pending\\n\\n")); },
    cancel() { /* client cancellation is the tested terminal event */ },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const streamResponse = await streamApp.request("/api/test/stream", { headers: { Cookie: `kshiai_session=${token}` } });
  assert.equal(streamResponse.status, 200);
  assert.match(await streamResponse.text(), /data: done/);
  const settled = await query<{ state: string }>("SELECT state FROM cutover_operation_permits WHERE path = $1 ORDER BY created_at DESC LIMIT 1", ["/api/test/stream"]);
  assert.equal(settled.rows[0]?.state, "settled");
  const cancelResponse = await streamApp.request("/api/test/cancel", { headers: { Cookie: `kshiai_session=${token}` } });
  const cancelReader = cancelResponse.body?.getReader();
  assert.ok(cancelReader);
  await cancelReader.read();
  await cancelReader.cancel();
  const indeterminate = await query<{ state: string }>("SELECT state FROM cutover_operation_permits WHERE path = $1 ORDER BY created_at DESC LIMIT 1", ["/api/test/cancel"]);
  assert.equal(indeterminate.rows[0]?.state, "indeterminate");
  const other = await auth.registerUser("cutover-other", "password-123");
  const otherToken = await auth.createSession(other.id);
  const otherMe = await app.request("/api/me", { headers: { Cookie: `kshiai_session=${otherToken}` } });
  assert.equal(otherMe.status, 200);
  const registered = await app.request("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "cutover-third", password: "password-123" }),
  });
  assert.notEqual(registered.status, 503);
  await closeDatabase();
  await fs.rm(directory, { recursive: true, force: true });
});
