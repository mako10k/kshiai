// R: Verify exact Stage smoke admission, call bounds, and uncertainty using an isolated control ledger.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, it } from "node:test";
import type { CutoverControlPolicy } from "../repositories/cutover-control.js";
import type { StageSmokeManifest } from "./cutover-stage-smoke.js";

const directory = mkdtempSync(join(tmpdir(), "cutover-stage-smoke-"));
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.CUTOVER_ID = "smoke-control";
process.env.CUTOVER_ARTIFACT_ID = "smoke-artifact";
const db = await import("../db.js");
db.getDb({ initializeSchema: true });
const storage = await import("../repositories/cutover-control.js");
const smoke = await import("./cutover-stage-smoke.js");
const admission = await import("./cutover-admission.js");
const authSmoke = await import("./stage-auth-smoke.js");
const r2Smoke = await import("./stage-r2-smoke.js");
const httpSmoke = await import("./stage-http-smoke.js");
after(async () => { await db.closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
const manifest = (runId: string): StageSmokeManifest => ({
  runId, ownerUserId: "owner", kind: "r2",
  steps: [{ name: "readback", method: "HEAD", target: "https://media.example.test/exact-object",
    minimumCalls: 1, maximumCalls: 1 }],
});
const policy: CutoverControlPolicy = {
  cutoverId: "smoke-control", artifactId: "smoke-artifact", ownerUserId: "owner",
  ownerCandidates: [{ attemptId: "a", candidateDigest: "a".repeat(64) },
    { attemptId: "b", candidateDigest: "b".repeat(64) }],
  trialBindings: null, taskBattleIds: [], productionReceipt: null,
  stageAcceptance: { health: null, postgres: null, email: null, google: null,
    ownership: null, r2: null, sse: null, directProtection: null },
};
await storage.initializeCutoverControl({ policy, phase: "closed", operationId: "init", operatorId: "operator" });

async function trial(input: StageSmokeManifest, override: Partial<NonNullable<CutoverControlPolicy["trialBindings"]>["requests"][number]> = {}) {
  const operation = smoke.stageSmokeOperation(input);
  const { actorId: _actorId, ...request } = operation;
  // Only the admission fixture is seeded directly; actual closed->trial receipts
  // remain covered by routes-cutover-confirm and control repository integration.
  const trialPolicy: CutoverControlPolicy = { ...policy, trialBindings: {
    generationIds: ["generation-a", "generation-b"], ownerConfirmationReceiptIds: ["confirm-a", "confirm-b"],
    cutoverReadbackReceiptId: "cutover-readback", stoppedBarrierReceiptId: "barrier",
    requests: [{ ...request, maximumReservations: 1, ...override }],
  } };
  await db.query("UPDATE cutover_control_revisions SET phase='trial',policy_json=$1 WHERE cutover_id=$2",
    [JSON.stringify(trialPolicy), policy.cutoverId]);
}
it("blocks closed, admits one exact trial smoke, and rejects replay and changed resource", async () => {
  let sends = 0;
  const input = manifest("bounded-read");
  await assert.rejects(smoke.runCutoverStageSmoke(input, async () => ++sends), admission.CutoverUnavailableError);
  assert.equal(sends, 0);
  await trial(input);
  const result = await smoke.runCutoverStageSmoke(input, async (context) =>
    context.step("readback", async (target) => { assert.equal(target, input.steps[0]?.target); return ++sends; }));
  assert.equal(result.result, 1);
  assert.match(result.receiptDigest, /^[0-9a-f]{64}$/);
  await assert.rejects(smoke.runCutoverStageSmoke(input, async () => ++sends), admission.CutoverUnavailableError);
  await assert.rejects(smoke.runCutoverStageSmoke({ ...input, ownerUserId: "other" }, async () => ++sends), admission.CutoverUnavailableError);
  const changed = { ...input, steps: input.steps.map((step) => ({ ...step, target: "https://other.example.test" })) };
  await assert.rejects(smoke.runCutoverStageSmoke(changed, async () => ++sends), admission.CutoverUnavailableError);
  assert.equal(sends, 1);
});
it("does not send above the per-step limit and keeps failed execution indeterminate", async () => {
  const input = manifest("over-limit"); await trial(input);
  let sends = 0;
  await assert.rejects(smoke.runCutoverStageSmoke(input, async (context) => {
    await context.step("readback", async () => ++sends);
    await context.step("readback", async () => ++sends);
  }), /not_admitted/);
  assert.equal(sends, 1);
  const result = await db.query<{ state: string }>("SELECT state FROM cutover_operation_permits WHERE binding_operation_id=$1",
    [smoke.stageSmokeOperation(input).bindingOperationId]);
  assert.equal(result.rows[0]?.state, "indeterminate");
});
it("cannot settle skipped readback or a caught uncertain external failure", async () => {
  const skipped = manifest("skipped"); await trial(skipped);
  await assert.rejects(smoke.runCutoverStageSmoke(skipped, async () => "fake-pass"), /incomplete/);
  const failed = manifest("caught-failure"); await trial(failed);
  await assert.rejects(smoke.runCutoverStageSmoke(failed, async (context) => {
    try { await context.step("readback", async () => { throw new Error("ambiguous_transport"); }); }
    catch { return "caught"; }
  }), /incomplete/);
});
it("retains narration fencing for arbitrary background work", async () => {
  const input = manifest("ordinary-work");
  await trial(input, { bindingOperationId: "ordinary", backgroundKind: "authoring-worker" });
  const current = await storage.readCutoverControl({ cutoverId: policy.cutoverId, artifactId: policy.artifactId });
  const base = smoke.stageSmokeOperation(input);
  assert.equal((await storage.reserveCutoverOperation({ ...base, ...{
    cutoverId: policy.cutoverId, artifactId: policy.artifactId, controlRevision: current.revision,
    bindingOperationId: "ordinary", reservationAttemptId: "ordinary", backgroundKind: "authoring-worker",
  } })).kind, "rejected");
});
it("verifies an existing email account without a provision or asset API callback", async () => {
  const target = { supabaseUrl: "https://identity.example.test", expectedSubject: "existing-email-subject",
    expectedApplicationUserId: "existing-email-user", authentication: "email" as const };
  const input: StageSmokeManifest = { runId: "email-existing", ownerUserId: "owner",
    kind: "email", steps: authSmoke.stageAuthSmokeSteps(target) };
  await trial(input);
  const calls: string[] = [];
  const result = await authSmoke.runStageAuthSmoke(input, target, {
    signIn: async () => { calls.push("sign-in"); return "private-token"; },
    verifyIdentity: async (token) => { assert.equal(token, "private-token"); calls.push("verify");
      return { subject: target.expectedSubject, email: "test@example.test", displayName: null }; },
    readApplicationMapping: async (subject) => { assert.equal(subject, target.expectedSubject);
      calls.push("SELECT"); return target.expectedApplicationUserId; },
  });
  assert.deepEqual(calls, ["sign-in", "verify", "SELECT"]);
  assert.equal(JSON.stringify(result).includes("private-token"), false);
  assert.equal(JSON.stringify(result).includes("test@example.test"), false);
  assert.equal(result.result.applicationUserId, target.expectedApplicationUserId);
});
it("keeps a wrong authentication subject unresolved instead of accepting its mapping", async () => {
  const target = { supabaseUrl: "https://identity.example.test", expectedSubject: "expected",
    expectedApplicationUserId: "expected-user", authentication: "email" as const };
  const input: StageSmokeManifest = { runId: "email-wrong", ownerUserId: "owner",
    kind: "email", steps: authSmoke.stageAuthSmokeSteps(target) }; await trial(input);
  let mappingReads = 0;
  await assert.rejects(authSmoke.runStageAuthSmoke(input, target, {
    signIn: async () => "token",
    verifyIdentity: async () => ({ subject: "other", email: null, displayName: null }),
    readApplicationMapping: async () => { ++mappingReads; return "expected-user"; },
  }), /identity_mismatch/);
  assert.equal(mappingReads, 0);
});
it("reads only the exact R2 object and requires its public route to succeed", async () => {
  const target = { accountId: "account", bucket: "bucket", objectKey: "exact/path image.png",
    publicBaseUrl: "https://media.example.test" };
  const input: StageSmokeManifest = { runId: "r2-exact", ownerUserId: "owner",
    kind: "r2", steps: r2Smoke.stageR2SmokeSteps(target) }; await trial(input);
  const seen: string[] = [];
  const result = await r2Smoke.runStageR2Smoke(input, target, {
    headObject: async (bucket, key) => { seen.push(`${bucket}:${key}`); },
    headPublic: async (url) => { seen.push(url); return 200; },
  });
  assert.deepEqual(seen, ["bucket:exact/path image.png", "https://media.example.test/exact/path%20image.png"]);
  assert.equal(result.result.status, 200);
  const failed = { ...input, runId: "r2-missing-public" }; await trial(failed);
  await assert.rejects(r2Smoke.runStageR2Smoke(failed, target, {
    headObject: async () => undefined, headPublic: async () => 404,
  }), /readback_failed/);
});
it("checks same-revision health and rejects a healthy response from another revision", async () => {
  const target = { kind: "health" as const, url: "https://stage.example.test/api/health", expectedRevision: "exact-revision" };
  const input: StageSmokeManifest = { runId: "health-exact", ownerUserId: "owner", kind: "health",
    steps: httpSmoke.stageHttpSmokeSteps(target) }; await trial(input);
  const result = await httpSmoke.runStageHttpSmoke(input, target, async (url, authenticated) => {
    assert.equal(url, target.url); assert.equal(authenticated, false);
    return Response.json({ ok: true, database: "postgres", auth: "supabase", revision: target.expectedRevision });
  });
  assert.equal(result.result.kind, "health");
  const wrong = { ...input, runId: "health-other-revision" }; await trial(wrong);
  await assert.rejects(httpSmoke.runStageHttpSmoke(wrong, target, async () =>
    Response.json({ ok: true, database: "postgres", auth: "supabase", revision: "other" })), /identity_mismatch/);
});
it("requires the authenticated ownership response to match the fixed owner", async () => {
  const target = { kind: "ownership" as const, url: "https://stage.example.test/api/me", expectedOwnerUserId: "owner" };
  const input: StageSmokeManifest = { runId: "owner-exact", ownerUserId: "owner", kind: "ownership",
    steps: httpSmoke.stageHttpSmokeSteps(target) }; await trial(input);
  const result = await httpSmoke.runStageHttpSmoke(input, target, async (_url, authenticated) => {
    assert.equal(authenticated, true); return Response.json({ user: { id: "owner" } });
  });
  assert.equal(result.result.kind, "ownership");
});
it("treats unauthenticated 401/403 as direct protection and rejects a generic 503", async () => {
  const target = { kind: "direct-protection" as const, url: "https://backend.example.test/api/health" };
  const input: StageSmokeManifest = { runId: "direct-protected", ownerUserId: "owner", kind: "direct-protection",
    steps: httpSmoke.stageHttpSmokeSteps(target) }; await trial(input);
  await httpSmoke.runStageHttpSmoke(input, target, async (_url, authenticated) => {
    assert.equal(authenticated, false); return new Response("protected", { status: 403 });
  });
  const failed = { ...input, runId: "direct-unavailable" }; await trial(failed);
  await assert.rejects(httpSmoke.runStageHttpSmoke(failed, target, async () => new Response("unavailable", { status: 503 })), /protection_failed/);
});
