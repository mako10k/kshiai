// R: Verify cutover control CAS, fencing, immutable bindings, and quotas on isolated databases.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "kshiai-cutover-control-"));
const postgresHarnessUrl = process.env.VT104_CUTOVER_CONTROL_TEST_DATABASE_URL;
let postgresAdministrator: import("pg").Client | null = null;
let disposableDatabase: string | null = null;
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.DATABASE_PATH = join(directory, "control.sqlite");
process.env.AUTH_PROVIDER = "legacy";
if (postgresHarnessUrl) {
  const { Client } = await import("pg");
  postgresAdministrator = new Client({ connectionString: postgresHarnessUrl });
  await postgresAdministrator.connect();
  disposableDatabase = `vt104_cutover_${process.pid}`;
  await postgresAdministrator.query(`CREATE DATABASE ${disposableDatabase}`);
  const disposableUrl = new URL(postgresHarnessUrl);
  disposableUrl.pathname = `/${disposableDatabase}`;
  process.env.DATABASE_URL = disposableUrl.toString();
  const { applyPostgresMigrations } = await import("../scripts/postgres-migrations.js");
  try {
    await applyPostgresMigrations(process.env.DATABASE_URL);
  } catch (error) {
    await postgresAdministrator.query(`DROP DATABASE ${disposableDatabase}`);
    await postgresAdministrator.end();
    throw error;
  }
}
const db = await import("../db.js");
const control = await import("./cutover-control.js");
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const cutoverId = "cutover-storage-test";
const artifactId = "artifact-exact-revision";
const ownerId = "owner-1";
const candidates: [
  { attemptId: string; candidateDigest: string },
  { attemptId: string; candidateDigest: string },
] = [
  { attemptId: "attempt-a", candidateDigest: digest("candidate-a") },
  { attemptId: "attempt-b", candidateDigest: digest("candidate-b") },
];
const basePolicy: import("./cutover-control.js").CutoverControlPolicy = {
  cutoverId,
  artifactId,
  ownerUserId: ownerId,
  ownerCandidates: candidates,
  trialBindings: null,
  taskBattleIds: ["battle-trial"],
  stageAcceptance: {
    health: null, postgres: null, email: null, google: null,
    ownership: null, r2: null, sse: null, directProtection: null,
  },
  productionReceipt: null,
};

after(async () => {
  await db.closeDatabase();
  if (postgresAdministrator && disposableDatabase) {
    await postgresAdministrator.query(`DROP DATABASE ${disposableDatabase}`);
    await postgresAdministrator.end();
  }
  rmSync(directory, { recursive: true, force: true });
});

describe("cutover control storage", () => {
  it("fails closed without a configured control and binds the artifact", async () => {
    await assert.rejects(
      control.readCutoverControl({ cutoverId, artifactId }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_MISSING",
    );
    const initialized = await control.initializeCutoverControl({
      policy: basePolicy, operationId: "initialize", operatorId: "operator", phase: "closed",
    });
    assert.equal(initialized.kind, "initialized");
    assert.equal(initialized.control.revision, 1);
    assert.equal((await control.initializeCutoverControl({
      policy: basePolicy, operationId: "initialize", operatorId: "operator", phase: "closed",
    })).kind, "replayed");
    await assert.rejects(
      control.initializeCutoverControl({
        policy: basePolicy, operationId: "initialize", operatorId: "different-operator", phase: "closed",
      }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_ID_MISMATCH",
    );
    await assert.rejects(
      control.initializeCutoverControl({
        policy: { ...basePolicy, ownerUserId: "different-owner" },
        operationId: "initialize", operatorId: "operator", phase: "closed",
      }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_ID_MISMATCH",
    );
    await assert.rejects(
      control.readCutoverControl({ cutoverId, artifactId: "different-artifact" }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "ARTIFACT_MISMATCH",
    );
  });

  it("admits only the exact closed owner confirmation and blocks a barrier while sent work is unresolved", async () => {
    const wrong = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: 1, bindingOperationId: "confirm-wrong",
      reservationAttemptId: "reservation-wrong", requestDigest: digest("wrong"), actorId: "other-owner",
      kind: "http", method: "POST", path: "/api/characters/attempt-a/confirm",
      ownerAttemptId: "attempt-a", candidateDigest: candidates[0].candidateDigest,
    });
    assert.deepEqual(wrong, { kind: "rejected", reason: "not_admitted" });
    const reserved = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: 1, bindingOperationId: "confirm-a",
      reservationAttemptId: "reservation-a", requestDigest: digest("confirm-a"), actorId: ownerId,
      kind: "http", method: "POST", path: "/api/characters/attempt-a/confirm",
      ownerAttemptId: "attempt-a", candidateDigest: candidates[0].candidateDigest,
    });
    assert.equal(reserved.kind, "reserved");
    if (reserved.kind !== "reserved") return;
    assert.equal((await control.startCutoverOperation({ cutoverId, artifactId, permitId: reserved.permit.permitId })).kind, "started");
    assert.equal((await control.startCutoverOperation({ cutoverId, artifactId, permitId: reserved.permit.permitId })).kind, "already_started");
    const blocked = await control.recordStoppedBarrier({
      cutoverId, artifactId, expectedRevision: 1, operationId: "barrier-blocked",
      operatorId: "operator", providerAccountingReceiptId: "accounting-readback-1",
    });
    assert.equal(blocked.kind, "blocked");
    await control.settleCutoverOperation({
      cutoverId, artifactId, permitId: reserved.permit.permitId,
      outcome: "settled", resultDigest: digest("confirmed"),
    });
    if (db.databaseKind() === "sqlite") {
      db.getDb().pragma("ignore_check_constraints = ON");
      await db.query("UPDATE cutover_operation_permits SET state='unknown-state' WHERE permit_id=$1", [reserved.permit.permitId]);
      await assert.rejects(
        control.reserveCutoverOperation({
          cutoverId, artifactId, controlRevision: 1, bindingOperationId: "confirm-a",
          reservationAttemptId: "reservation-a", requestDigest: digest("confirm-a"), actorId: ownerId,
          kind: "http", method: "POST", path: "/api/characters/attempt-a/confirm",
          ownerAttemptId: "attempt-a", candidateDigest: candidates[0].candidateDigest,
        }),
        (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_CORRUPT",
      );
      await db.query("UPDATE cutover_operation_permits SET state='settled' WHERE permit_id=$1", [reserved.permit.permitId]);
      db.getDb().pragma("ignore_check_constraints = OFF");
    }
    const replay = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: 1, bindingOperationId: "confirm-a",
      reservationAttemptId: "reservation-a", requestDigest: digest("confirm-a"), actorId: ownerId,
      kind: "http", method: "POST", path: "/api/characters/attempt-a/confirm",
      ownerAttemptId: "attempt-a", candidateDigest: candidates[0].candidateDigest,
    });
    assert.equal(replay.kind, "settled_replay");
    const changedReplay = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: 1, bindingOperationId: "confirm-a",
      reservationAttemptId: "reservation-a", requestDigest: digest("confirm-a"), actorId: ownerId,
      kind: "http", method: "POST", path: "/api/characters/attempt-b/confirm",
      ownerAttemptId: "attempt-b", candidateDigest: candidates[1].candidateDigest,
    });
    assert.equal(changedReplay.kind, "rejected");
    if (changedReplay.kind === "rejected") assert.equal(changedReplay.reason, "request_mismatch");
    const barrier = await control.recordStoppedBarrier({
      cutoverId, artifactId, expectedRevision: 1, operationId: "barrier-recorded",
      operatorId: "operator", providerAccountingReceiptId: "accounting-readback-2",
    });
    assert.equal(barrier.kind, "recorded");
    assert.equal(barrier.control.revision, 2);
    assert.equal((await control.recordStoppedBarrier({
      cutoverId, artifactId, expectedRevision: 1, operationId: "barrier-recorded",
      operatorId: "operator", providerAccountingReceiptId: "accounting-readback-2",
    })).kind, "replayed");
    await assert.rejects(
      control.recordStoppedBarrier({
        cutoverId, artifactId, expectedRevision: 1, operationId: "barrier-recorded",
        operatorId: "operator", providerAccountingReceiptId: "changed-readback",
      }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_ID_MISMATCH",
    );
  });

  it("serializes transition CAS, freezes trial bindings, and enforces a shared retry quota", async () => {
    const now = new Date().toISOString();
    await db.query("INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$1,'x',$2)", [ownerId, now]);
    for (const [index, candidate] of candidates.entries()) {
      const characterId = `character-${index}`;
      const generationId = `generation-${index === 0 ? "a" : "b"}`;
      await db.query(
        "INSERT INTO characters (id,owner_user_id,sheet_json,created_at,updated_at) VALUES ($1,$2,'{}',$3,$3)",
        [characterId, ownerId, now],
      );
      await db.query(
        `INSERT INTO asset_generations
         (asset_type,asset_id,generation,generation_id,schema_version,content_json,content_digest,created_at)
         VALUES ('character',$1,1,$2,3,'{}',$3,$4)`,
        [characterId, generationId, digest(`generation-${index}`), now],
      );
      await db.query(
        `INSERT INTO asset_current_generations (asset_type,asset_id,generation,generation_id,updated_at)
         VALUES ('character',$1,1,$2,$3)`,
        [characterId, generationId, now],
      );
      await db.query(
        `INSERT INTO character_authoring_attempts
         (attempt_id,owner_user_id,character_id,kind,idempotency_key,request_digest,source_text,
          source_digest,status,candidate_json,candidate_digest,assistant_message,error_code,
          result_generation_id,created_at,updated_at,expires_at)
         VALUES ($1,$2,$3,'create',$4,$5,NULL,$6,'succeeded','{}',$7,'',NULL,$8,$9,$9,$10)`,
        [candidate.attemptId, ownerId, characterId, `key-${index}`, digest(`request-${index}`),
          digest(`source-${index}`), candidate.candidateDigest, generationId, now, "2099-01-01T00:00:00.000Z"],
      );
    }
    const confirmationA = await db.query<{ permit_id: string }>(
      "SELECT permit_id FROM cutover_operation_permits WHERE owner_attempt_id='attempt-a' AND state='settled'",
    );
    const reservedB = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: 2, bindingOperationId: "confirm-b",
      reservationAttemptId: "reservation-b", requestDigest: digest("confirm-b"), actorId: ownerId,
      kind: "http", method: "POST", path: "/api/characters/attempt-b/confirm",
      ownerAttemptId: "attempt-b", candidateDigest: candidates[1].candidateDigest,
    });
    assert.equal(reservedB.kind, "reserved");
    if (reservedB.kind !== "reserved") return;
    const trialBindings = {
      generationIds: ["generation-a", "generation-b"] as [string, string],
      ownerConfirmationReceiptIds: [confirmationA.rows[0]?.permit_id ?? "", reservedB.permit.permitId] as [string, string],
      cutoverReadbackReceiptId: "cutover-readback",
      stoppedBarrierReceiptId: "accounting-readback-2",
      requests: [{
        bindingOperationId: "trial-narration", kind: "background" as const,
        method: "BACKGROUND", path: "narration", requestDigest: digest("trial-narration"),
        battleId: "battle-trial", backgroundKind: "narration", maximumReservations: 1,
      }],
    };
    await assert.rejects(
      control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
        operationId: "enter-trial-unsettled", operatorId: "operator", toPhase: "trial", trialBindings }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "RECEIPTS_REQUIRED",
    );
    await control.startCutoverOperation({ cutoverId, artifactId, permitId: reservedB.permit.permitId });
    await control.settleCutoverOperation({ cutoverId, artifactId, permitId: reservedB.permit.permitId,
      outcome: "settled", resultDigest: digest("confirmed-b") });
    await assert.rejects(
      control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
        operationId: "enter-trial-fake-receipts", operatorId: "operator", toPhase: "trial",
        trialBindings: { ...trialBindings,
          ownerConfirmationReceiptIds: ["invented-a", "invented-b"] } }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "RECEIPTS_REQUIRED",
    );
    const [first, second] = await Promise.all([
      control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
        operationId: "enter-trial-a", operatorId: "operator", toPhase: "trial", trialBindings }),
      control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
        operationId: "enter-trial-b", operatorId: "operator", toPhase: "trial", trialBindings }),
    ]);
    assert.deepEqual([first.kind, second.kind].sort(), ["conflict", "transitioned"]);
    const current = await control.readCutoverControl({ cutoverId, artifactId });
    assert.equal(current.phase, "trial");
    assert.deepEqual(current.policy.trialBindings?.generationIds, ["generation-a", "generation-b"]);
    assert.equal((await control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
      operationId: current.operationId, operatorId: "operator", toPhase: "trial", trialBindings })).kind, "replayed");
    await assert.rejects(
      control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
        operationId: current.operationId, operatorId: "different-operator", toPhase: "trial", trialBindings }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_ID_MISMATCH",
    );
    await assert.rejects(
      control.transitionCutoverControl({ cutoverId, artifactId, expectedRevision: 2,
        operationId: current.operationId, operatorId: "operator", toPhase: "trial",
        trialBindings: { ...trialBindings, cutoverReadbackReceiptId: "changed-readback" } }),
      (error: unknown) => error instanceof control.CutoverControlStorageError && error.code === "CONTROL_ID_MISMATCH",
    );
    const reserved = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: current.revision,
      bindingOperationId: "trial-narration", reservationAttemptId: "trial-reservation-1",
      requestDigest: digest("trial-narration"), actorId: ownerId, kind: "background",
      method: "BACKGROUND", path: "narration", battleId: "battle-trial", backgroundKind: "narration",
    });
    assert.equal(reserved.kind, "reserved");
    if (reserved.kind !== "reserved") return;
    await control.startCutoverOperation({ cutoverId, artifactId, permitId: reserved.permit.permitId });
    await control.settleCutoverOperation({ cutoverId, artifactId, permitId: reserved.permit.permitId,
      outcome: "settled", resultDigest: digest("narration-result") });
    const exhausted = await control.reserveCutoverOperation({
      cutoverId, artifactId, controlRevision: current.revision,
      bindingOperationId: "trial-narration", reservationAttemptId: "trial-reservation-2",
      requestDigest: digest("trial-narration"), actorId: ownerId, kind: "background",
      method: "BACKGROUND", path: "narration", battleId: "battle-trial", backgroundKind: "narration",
    });
    assert.deepEqual(exhausted, { kind: "rejected", reason: "quota_exhausted" });
    const closed = await control.transitionCutoverControl({ cutoverId, artifactId,
      expectedRevision: current.revision, operationId: "forward-close", operatorId: "operator", toPhase: "closed" });
    assert.equal(closed.control.recoveryMode, "forward-only");
    assert.deepEqual(closed.control.policy.trialBindings?.generationIds, ["generation-a", "generation-b"]);
  });
});
