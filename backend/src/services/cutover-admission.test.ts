// R: Verify configured runtime fencing and unresolved operation barriers on an isolated database.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, it } from "node:test";
const directory = mkdtempSync(join(tmpdir(), "cutover-admission-"));
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.CUTOVER_ID = "local-control";
process.env.CUTOVER_ARTIFACT_ID = "local-artifact";
const db = await import("../db.js");
db.getDb({ initializeSchema: true });
const storage = await import("../repositories/cutover-control.js");
const admission = await import("./cutover-admission.js");
after(async () => { await db.closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
it("fails closed before initialization and prevents background callbacks without writes", async () => {
  assert.equal(await admission.cutoverAllowsGeneralWork(), false);
  assert.deepEqual(await admission.cutoverNarrationBattleIds(), []);
  let invoked = 0;
  await assert.rejects(admission.runCutoverBackgroundOperation({ operationId: "scan", kind: "narration-dispatch" }, async () => ++invoked), admission.CutoverUnavailableError);
  assert.equal(invoked, 0);
  await storage.initializeCutoverControl({ phase: "closed", operationId: "init", operatorId: "operator", policy: {
    cutoverId: "local-control", artifactId: "local-artifact", ownerUserId: "owner",
    ownerCandidates: [
      { attemptId: "a", candidateDigest: admission.cutoverRequestDigest("a") },
      { attemptId: "b", candidateDigest: admission.cutoverRequestDigest("b") },
    ], trialBindings: null, taskBattleIds: [], productionReceipt: null,
    stageAcceptance: { health: null, postgres: null, email: null, google: null, ownership: null, r2: null, sse: null, directProtection: null },
  } });
  await assert.rejects(admission.runCutoverBackgroundOperation({ operationId: "worker", kind: "authoring-worker" }, async () => ++invoked), admission.CutoverUnavailableError);
  assert.equal(invoked, 0);
  const permits = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM cutover_operation_permits");
  assert.equal(permits.rows[0]?.n, 0);
});
it("holds an admitted confirmation until completion and retains failed work for reconciliation", async () => {
  const operation = {
    bindingOperationId: "confirm-a", requestDigest: admission.cutoverRequestDigest({ candidateDigest: admission.cutoverRequestDigest("a") }),
    actorId: "owner", kind: "http" as const, method: "POST", path: "/api/characters/a/confirm",
    ownerAttemptId: "a", candidateDigest: admission.cutoverRequestDigest("a"),
  };
  const handle = await admission.beginCutoverOperation(operation);
  const identity = { cutoverId: "local-control", artifactId: "local-artifact", expectedRevision: 1, operatorId: "operator", providerAccountingReceiptId: "accounting-local" };
  assert.equal((await storage.recordStoppedBarrier({ ...identity, operationId: "blocked" })).kind, "blocked");
  await handle.finish("settled");
  await handle.finish("settled");
  assert.equal((await storage.recordStoppedBarrier({ ...identity, operationId: "settled" })).kind, "recorded");
  await assert.rejects(admission.runCutoverOperation({ ...operation, bindingOperationId: "confirm-failure" }, async () => { throw new Error("provider outcome unknown"); }), /provider outcome unknown/);
  const control = await admission.currentCutoverControl();
  assert.equal((await storage.recordStoppedBarrier({ ...identity, expectedRevision: control!.revision, operationId: "unknown" })).kind, "blocked");
  const rows = await db.query<{ state: string }>("SELECT state FROM cutover_operation_permits WHERE binding_operation_id=$1", ["confirm-failure"]);
  assert.equal(rows.rows[0]?.state, "indeterminate");
});
