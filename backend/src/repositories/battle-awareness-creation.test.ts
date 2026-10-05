// R: Verify creation accounting survives crashes and atomically transfers into battle runtime.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AwarenessInitialize, AwarenessObservedPolicy, type BattleEncounterProposal } from "@kshiai/shared";
import { battleAwarenessCreationSchemaSql } from "./battle-awareness-creation-schema.js";
import { battleAwarenessSchemaSql } from "./battle-awareness-schema.js";
const directory = mkdtempSync(join(tmpdir(), "kshiai-creation-ledger-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { getDb, withTransaction } = await import("../db.js");
const repo = await import("./battle-awareness-creation.js");
const runtimeRepo = await import("./battle-awareness.js");
getDb().exec(battleAwarenessCreationSchemaSql + battleAwarenessSchemaSql);
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const now = Date.parse("2026-10-05T06:00:00Z");
const result: BattleEncounterProposal = { participants: { a: { battleLabel: "A" }, b: { battleLabel: "B" } },
  social: { a: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null },
    b: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null } }, openingSummary: "対峙する" };
function claim(battleId: string) { return { battleId, requestDigest: "digest", frozenInput: "immutable encounter prompt", now }; }
function reservation(battleId: string) { return { battleId, requestDigest: "digest", id: `encounter:${battleId}`, now,
  proof: { requestDigest: "full-prompt-digest", verifiedFullPrompt: true as const, inputTokens: 100, outputTokenLimit: 1500, maximumChargeUsd: 0.02 } }; }
function initial() { return AwarenessInitialize({ startedAt: now + 1000, promptRevision: "test", outputRevision: "test" }); }
async function ready(id: string, actualUsd: number | null = 0.01, physicalOutstanding = false) {
  await repo.claimAwarenessCreation(claim(id));
  await repo.reserveAwarenessCreationAttempt(reservation(id));
  return repo.completeAwarenessCreationAttempt({ battleId: id, id: `encounter:${id}`, result, actualUsd, physicalOutstanding, finishedAt: now + 500 });
}
async function insert(connection: import("../db.js").DatabaseConnection, id: string) {
  await connection.query(`INSERT INTO battles(id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at)
    VALUES($1,'{}','u','a','b',$2,$2)`, [id, new Date(now).toISOString()]);
}
describe("pre-battle encounter ledger", () => {
  it("binds observed creation and unknown maximum without weakening a stored certified policy", async () => {
    const observedProof = { mode: "observed" as const, verifiedFullPrompt: false as const, inputTokens: null,
      maximumChargeUsd: null, requestDigest: "frozen-full-prompt", outputTokenLimit: 1500 };
    await repo.claimAwarenessCreation({ ...claim("observed-creation"), policy: AwarenessObservedPolicy });
    await assert.rejects(repo.claimAwarenessCreation(claim("observed-creation")), /IDENTITY_CONFLICT/);
    const dispatched = await repo.reserveAwarenessCreationAttempt({ ...reservation("observed-creation"), proof: observedProof });
    assert.equal(dispatched.reservation?.maximumUsd, null);
    assert.equal(dispatched.proof?.verifiedFullPrompt, false);
    await repo.completeAwarenessCreationAttempt({ battleId: "observed-creation", id: "encounter:observed-creation",
      result, actualUsd: null, physicalOutstanding: false, finishedAt: now + 500 });
    await assert.rejects(withTransaction((connection) => repo.adoptAwarenessCreationInTransaction(connection,
      { battleId: "observed-creation", requestDigest: "digest", runtime: initial(), now: now + 1000 })), /POLICY_MISMATCH/);
    const adopted = await withTransaction(async (connection) => {
      await insert(connection, "observed-creation");
      return repo.adoptAwarenessCreationInTransaction(connection, { battleId: "observed-creation", requestDigest: "digest",
        runtime: { ...initial(), policy: AwarenessObservedPolicy }, now: now + 1000 });
    });
    assert.equal(adopted.budget.reservedUsd, 0);
    assert.deepEqual(adopted.budget.unknownAttemptIds, ["encounter:observed-creation"]);
    assert.equal(adopted.budget.reservations[0]?.maximumUsd, null);
    assert.equal(adopted.policy.accountingMode, "observed");
    await repo.claimAwarenessCreation(claim("old-certified"));
    await assert.rejects(repo.reserveAwarenessCreationAttempt({ ...reservation("old-certified"), proof: observedProof }), /ADMISSION_REJECTED/);
  });
  it("reserves a concurrent same-id dispatch exactly once and never resends after restart", async () => {
    await Promise.all([repo.claimAwarenessCreation(claim("once")), repo.claimAwarenessCreation(claim("once"))]);
    const attempts = await Promise.allSettled([repo.reserveAwarenessCreationAttempt(reservation("once")), repo.reserveAwarenessCreationAttempt(reservation("once"))]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal((await repo.claimAwarenessCreation({ ...claim("once"), now: now + 2000 })).status, "dispatched");
    await assert.rejects(repo.reserveAwarenessCreationAttempt({ ...reservation("once"), now: now + 2000 }), /ALREADY_DISPATCHED/);
    await assert.rejects(repo.claimAwarenessCreation({ ...claim("once"), frozenInput: "different" }), /IDENTITY_CONFLICT/);
  });
  it("rejects missing proof, expensive quotes and expired original deadline without dispatch", async () => {
    await repo.claimAwarenessCreation(claim("admission"));
    const request = reservation("admission");
    await assert.rejects(repo.reserveAwarenessCreationAttempt({ ...request, proof: { ...request.proof, inputTokens: 4001 } }), /ADMISSION_REJECTED/);
    await assert.rejects(repo.reserveAwarenessCreationAttempt({ ...request, proof: { ...request.proof, maximumChargeUsd: 0.31 } }), /ADMISSION_REJECTED/);
    await assert.rejects(repo.reserveAwarenessCreationAttempt({ ...request, now: now + 180000 }), /DEADLINE/);
    assert.equal((await repo.claimAwarenessCreation(claim("admission"))).status, "prepared");
  });
  it("rolls back canonical insertion and adoption together, then transfers the original clock and expense", async () => {
    await ready("atomic");
    await assert.rejects(withTransaction(async (connection) => {
      await insert(connection, "atomic");
      await repo.adoptAwarenessCreationInTransaction(connection, { battleId: "atomic", requestDigest: "digest", runtime: initial(), now: now + 1000 });
      throw new Error("rollback");
    }), /rollback/);
    assert.equal((await repo.claimAwarenessCreation(claim("atomic"))).status, "ready");
    assert.equal(await runtimeRepo.getAwarenessRuntime("atomic"), null);
    const adopted = await withTransaction(async (connection) => {
      await insert(connection, "atomic");
      return repo.adoptAwarenessCreationInTransaction(connection, { battleId: "atomic", requestDigest: "digest", runtime: initial(), now: now + 1000 });
    });
    assert.equal(adopted.startedAt, now);
    assert.equal(adopted.deadlineAt, now + 180000);
    assert.equal(adopted.budget.physicalAttempts, 1);
    assert.equal(adopted.budget.settledUsd, 0.01);
    assert.equal((await runtimeRepo.getAwarenessRuntime("atomic"))?.fencingToken, 1);
    await assert.rejects(runtimeRepo.mutateAwarenessRuntime({ battleId: "atomic", expectedRevision: 0,
      fence: { battleId: "atomic", ownerId: "unleased", fencingToken: 1 }, now: new Date(now + 1001).toISOString() },
    (state) => state), /REVISION_OR_LEASE_CONFLICT/);
  });
  it("retains unknown physical cost through adoption and routes a late actual receipt into runtime", async () => {
    await ready("late", null, true);
    await withTransaction(async (connection) => {
      await insert(connection, "late");
      await repo.adoptAwarenessCreationInTransaction(connection, { battleId: "late", requestDigest: "digest", runtime: initial(), now: now + 1000 });
    });
    const before = await runtimeRepo.getAwarenessRuntime("late");
    assert.equal(before?.runtime.budget.physicalOutstanding, 1);
    assert.equal(before?.runtime.budget.reservedUsd, 0.02);
    await repo.completeAwarenessCreationAttempt({ battleId: "late", id: "encounter:late", actualUsd: 0.012, physicalOutstanding: false, finishedAt: now + 15000 });
    const afterReceipt = await runtimeRepo.getAwarenessRuntime("late");
    assert.equal(afterReceipt?.runtime.budget.physicalOutstanding, 0);
    assert.equal(afterReceipt?.runtime.budget.settledUsd, 0.012);
    assert.equal(afterReceipt?.runtime.budget.reservedUsd, 0);
  });
  it("does not adopt failed or deadline-expired encounter results", async () => {
    await repo.claimAwarenessCreation(claim("failed"));
    await repo.reserveAwarenessCreationAttempt(reservation("failed"));
    await repo.completeAwarenessCreationAttempt({ battleId: "failed", id: "encounter:failed", result, actualUsd: null, physicalOutstanding: true, finishedAt: now + 10000 });
    await assert.rejects(withTransaction((connection) => repo.adoptAwarenessCreationInTransaction(connection,
      { battleId: "failed", requestDigest: "digest", runtime: initial(), now: now + 10001 })), /NOT_ADOPTABLE/);
  });
  it("preserves a timely logical result during late fee settlement and rejects actual overspend", async () => {
    const receipt = await ready("cost", null, true);
    assert.equal(receipt.proof?.maximumChargeUsd, 0.02);
    const settled = await repo.completeAwarenessCreationAttempt({ battleId: "cost", id: "encounter:cost",
      actualUsd: 0.31, physicalOutstanding: false, finishedAt: now + 15000 });
    assert.equal(settled.status, "ready");
    assert.deepEqual(settled.result, result);
    await assert.rejects(withTransaction((connection) => repo.adoptAwarenessCreationInTransaction(connection,
      { battleId: "cost", requestDigest: "digest", runtime: initial(), now: now + 15001 })), /BUDGET_EXCEEDED/);
    await assert.rejects(repo.completeAwarenessCreationAttempt({ battleId: "cost", id: "encounter:cost",
      result: { ...result, openingSummary: "別の提案" }, actualUsd: 0.31, physicalOutstanding: false, finishedAt: now + 15002 }), /RESULT_CONFLICT/);
  });
});
