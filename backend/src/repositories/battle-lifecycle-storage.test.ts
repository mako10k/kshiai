// R: Verify creation, update fencing, and frozen cutover storage contracts on isolated databases.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultParameters, type BattleState } from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-lifecycle-"));
// PostgreSQL mode must explicitly name a disposable test database supplied by the runner.
process.env.DATABASE_URL = process.env.VT110_TEST_DATABASE_URL ?? "";
let pgAdministrator: import("pg").Client | null = null;
let disposableDatabase: string | null = null;
if (process.env.VT110_TEST_DATABASE_URL) {
  const { Client } = await import("pg");
  pgAdministrator = new Client({ connectionString: process.env.VT110_TEST_DATABASE_URL });
  await pgAdministrator.connect();
  disposableDatabase = `vt110_storage_${process.pid}`;
  await pgAdministrator.query(`CREATE DATABASE ${disposableDatabase}`);
  const url = new URL(process.env.VT110_TEST_DATABASE_URL);
  url.pathname = `/${disposableDatabase}`;
  process.env.DATABASE_URL = url.toString();
  const { applyPostgresMigrations } = await import("../scripts/postgres-migrations.js");
  try {
    await applyPostgresMigrations(process.env.DATABASE_URL);
  } catch (error) {
    await pgAdministrator.query(`DROP DATABASE ${disposableDatabase}`);
    await pgAdministrator.end();
    throw error;
  }
}
process.env.DATABASE_PATH = join(directory, "lifecycle.db");
process.env.AUTH_PROVIDER = "legacy";
const { query, closeDatabase } = await import("../db.js");
const battle = await import("./battles.js");
const cutover = await import("./battle-cutover.js");
const guard = await import("../services/distributed-guard.js");
const accounting = await import("../llm/provider-accounting.js");
const now = "2026-09-30T01:00:00.000Z";
const meta = { sideAUserId: "lifecycle-user", sideACharacterId: "a", sideBCharacterId: "b" };
function state(id: string, finished = false): BattleState {
  const side = (characterId: string) => ({ characterId, displayName: characterId,
    parameters: defaultParameters(), defending: false, canFight: true, irreversibleIncapacitated: false });
  return { id, status: finished ? "finished" : "active", turn: 0, turnLimit: 20,
    sideA: side("a"), sideB: side("b"), policiesA: [], policiesB: [], selectedPolicyIdsA: [], selectedPolicyIdsB: [],
    situation: { scene: "test", notes: "", coefficients: {}, tags: [] },
    prologuePending: false, aftermathPending: false, turnRecords: [], log: [],
    winnerSide: finished ? "draw" : null, finishReason: finished ? "turn_limit" : null,
    createdAt: now, updatedAt: now, battleRevision: 0 };
}
async function count(table: string, id: string): Promise<number> {
  return Number((await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM ${table} WHERE battle_id = $1`, [id])).rows[0]?.count ?? 0);
}
async function apply(plan: Awaited<ReturnType<typeof cutover.planBattleCutover>>) {
  return cutover.discardBattleCutover({ plan, operatorId: "test-operator", stopped: true, recoverySnapshotIdentity: "isolated-snapshot" });
}
before(async () => {
  await query("INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, 'test', $3)", [meta.sideAUserId, meta.sideAUserId, now]);
  for (const id of ["a", "b"]) await query("INSERT INTO characters (id,owner_user_id,sheet_json,created_at,updated_at) VALUES ($1,$2,'{}',$3,$3)", [id,meta.sideAUserId,now]);
});
after(async () => {
  await closeDatabase();
  if (pgAdministrator && disposableDatabase) {
    await pgAdministrator.query(`DROP DATABASE ${disposableDatabase}`);
    await pgAdministrator.end();
  }
  rmSync(directory, { recursive: true, force: true });
});

describe("vt110 battle lifecycle storage", () => {
  it("separates insertion from CAS updates and cannot recreate a missing in-memory battle", async () => {
    const initial = state("storage-cas");
    assert.equal(await battle.insertNewBattle(initial, meta), "created");
    assert.equal(await battle.insertNewBattle({ ...initial, turn: 3 }, meta), "conflict");
    assert.equal((await battle.getBattle(initial.id))?.turn, 0);
    await battle.updateExistingBattle({ ...initial, turn: 1, battleRevision: 1 }, { ...meta, expectedRevision: 0 });
    await assert.rejects(battle.saveBattle(initial, meta), /BATTLE_REVISION_CONFLICT/);
    await guard.withBattleLease(initial.id, async () => {
      await query("UPDATE battle_leases SET fencing_token = fencing_token + 1 WHERE battle_id = $1", [initial.id]);
      await assert.rejects(battle.saveBattle({ ...initial, battleRevision: 1 }, meta), /BATTLE_REVISION_CONFLICT/);
    });
    await query("DELETE FROM battles WHERE id = $1", [initial.id]);
    await assert.rejects(battle.saveBattle(initial, meta), /BATTLE_NOT_FOUND/);
    assert.equal(await battle.getBattle(initial.id), null);
  });

  it("blocks unknown persisted status before choosing any deletion target", async () => {
    const invalid = { ...state("storage-unknown"), status: "unrecognized" };
    await query("INSERT INTO battles (id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at) VALUES ($1,$2,$3,'a','b',$4,$4)", [invalid.id,JSON.stringify(invalid),meta.sideAUserId,now]);
    await assert.rejects(cutover.planBattleCutover({ cutoverId: "unknown", cutoverAt: "2026-09-30T02:00:00Z" }), /BATTLE_CUTOVER_STATUS_UNKNOWN:storage-unknown/);
    assert.equal((await query("SELECT 1 FROM battles WHERE id=$1",[invalid.id])).rowCount,1);
    await query("DELETE FROM battles WHERE id=$1",[invalid.id]);
  });

  it("rolls back a frozen inventory mismatch without deleting any target or writing a receipt", async () => {
    const initial = state("storage-stale");
    await battle.insertNewBattle(initial, meta);
    const plan = await cutover.planBattleCutover({ cutoverId: "stale", cutoverAt: "2026-09-30T02:00:00Z" });
    await battle.saveBattle({ ...initial, turn: 1 }, meta);
    await assert.rejects(apply(plan), /BATTLE_CUTOVER_PLAN_STALE/);
    assert.equal((await battle.getBattle(initial.id))?.turn, 1);
    assert.equal(await battle.isBattleDiscarded(initial.id), false);
    await query("DELETE FROM battles WHERE id = $1", [initial.id]);
  });

  it("physically removes every payload dependency, preserves finished state and accounting, and rejects resurrection", async () => {
    const requestHash = "request-hash";
    const key = "old-create";
    const id = `btl_${guard.requestDigest({ userId: meta.sideAUserId, scope: "battle-create", key, requestHash }).slice(0, 32)}`;
    const initial = state(id);
    const completed = state("storage-finished", true);
    await battle.insertNewBattle(initial, meta);
    await battle.insertNewBattle(completed, meta);
    const finishedBefore = await query("SELECT state_json FROM battles WHERE id = $1", [completed.id]);
    await query("INSERT INTO battle_presentations (battle_id,receipt_id,sequence,phase,combat_turn,input_digest,narrative_json,created_at) VALUES ($1, 'finished-receipt', 1, 'aftermath', 0, 'digest', '{\"finished\":true}', $2)", [completed.id, now]);
    await query("INSERT INTO idempotency_keys (user_id,scope,key,request_hash,status,owner_id,response_json,created_at,updated_at,expires_at) VALUES ($1,$2,'finished-key','finished-hash','completed','worker','{}',$3,$3,$4)", [meta.sideAUserId,`battle-advance:${completed.id}`,now,"2099-01-01T00:00:00Z"]);
    await query("INSERT INTO battle_leases (battle_id,owner_id,fencing_token,acquired_at,expires_at) VALUES ($1, 'worker', 1, $2, $3)", [id, now, "2099-01-01T00:00:00Z"]);
    await query("INSERT INTO battle_presentations (battle_id,receipt_id,sequence,phase,combat_turn,input_digest,narrative_json,created_at) VALUES ($1, 'receipt', 1, 'combat', 1, 'digest', '{}', $2)", [id, now]);
    await query("INSERT INTO battle_narration_entries (battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,status,active_attempt_id,attempt_count,terminal_narrative_json,fallback_reason,created_at,updated_at) VALUES ($1, 'receipt', 1, 'combat', 1, '{}', 'digest', 'generating', 'attempt', 1, NULL, NULL, $2, $2)", [id, now]);
    await query("INSERT INTO battle_narration_leases (battle_id,owner_id,fencing_token,expires_at,updated_at) VALUES ($1, 'worker', 1, $2, $3)", [id, "2099-01-01T00:00:00Z", now]);
    await query("INSERT INTO battle_narration_retention (battle_id,pruned_through_sequence,updated_at) VALUES ($1, 0, $2)", [id, now]);
    await query("INSERT INTO battle_narration_events (battle_id,event_sequence,event_id,receipt_id,narration_sequence,kind,public_payload_json,created_at) VALUES ($1, 1, 'event', 'receipt', 1, 'ready', '{\"private\":true}', $2)", [id, now]);
    await query("INSERT INTO battle_narration_outbox (outbox_id, battle_id, receipt_id, status, created_at) VALUES ('outbox', $1, 'receipt', 'pending', $2)", [id, now]);
    await query("INSERT INTO battle_narration_attempts (attempt_id,battle_id,receipt_id,fencing_token,status,provider,route,started_at) VALUES ('attempt',$1,'receipt',1,'generating','mock','test',$2)", [id, now]);
    await accounting.createProviderOperationRun({ runId: "run", observerUserId: meta.sideAUserId, approvedAttemptCeiling: 2, projectedOperations: [] });
    await query("UPDATE provider_operation_runs SET battle_id=$1 WHERE run_id='run'", [id]);
    let started: () => void = () => {};
    const providerStarted = new Promise<void>((resolve) => { started = resolve; });
    let finish: (value: string) => void = () => {};
    const delayedResponse = new Promise<string>((resolve) => { finish = resolve; });
    const pending = accounting.withProviderOperationContext({ runId: "run", battleId: id }, () =>
      accounting.executeProviderOperationAttempt({ logicalCallId: "call", attemptOrdinal: 1,
        operation: "narrateTurn", provider: "mock", model: "mock", usage: () => ({ tokenCount: 17, estimatedCostUsd: 0.01 }),
        action: () => { started(); return delayedResponse; } }));
    await providerStarted;
    await query("INSERT INTO balance_events (kind,created_at,battle_id,payload_json) VALUES ('provider',$1,$2,'{}')", [now,id]);
    for (const scope of ["battle-create", `battle-advance:${id}`]) {
      await query("INSERT INTO idempotency_keys (user_id,scope,key,request_hash,status,owner_id,response_json,created_at,updated_at,expires_at) VALUES ($1,$2,$3,$4,'completed','worker',NULL,$5,$5,$6)", [meta.sideAUserId,scope,key,requestHash,now,"2099-01-01T00:00:00Z"]);
    }
    const plan = await cutover.planBattleCutover({ cutoverId: "cutover-test", cutoverAt: "2026-09-30T02:00:00Z" });
    assert.deepEqual(plan.targets.map((item) => item.id), [id]);
    assert.equal(plan.relatedCounts.idempotency_keys, 2);
    assert.equal((await apply(plan)).kind, "discarded");
    assert.equal((await apply(plan)).kind, "replayed");
    finish("late-provider-text");
    assert.equal(await pending, "late-provider-text");
    const lateAttempt = await query<{ status: string; token_count: number }>("SELECT status,token_count FROM provider_operation_attempts WHERE run_id='run'");
    assert.equal(lateAttempt.rows[0]?.status, "succeeded");
    assert.equal(lateAttempt.rows[0]?.token_count, 17);
    for (const table of ["battle_leases","battle_presentations","battle_narration_entries","battle_narration_leases","battle_narration_retention","battle_narration_events","battle_narration_outbox"]) {
      assert.equal(await count(table, id), 0, table);
    }
    assert.deepEqual(await query("SELECT state_json FROM battles WHERE id = $1", [completed.id]), finishedBefore);
    assert.equal(await count("provider_operation_attempts",id),1);
    assert.equal(await count("balance_events",id),1);
    assert.equal((await query<{ status: string }>("SELECT status FROM provider_operation_runs WHERE run_id='run'")).rows[0]?.status,"failed");
    assert.equal((await query<{ status: string }>("SELECT status FROM battle_narration_attempts WHERE attempt_id='attempt'")).rows[0]?.status,"abandoned");
    assert.equal((await query("SELECT 1 FROM idempotency_keys WHERE key=$1", [key])).rowCount,0);
    assert.equal((await query("SELECT 1 FROM idempotency_keys WHERE key='finished-key'")).rowCount,1);
    assert.equal(await count("battle_presentations", completed.id),1);
    assert.equal(await battle.isBattleDiscarded(id), true);
    await assert.rejects(battle.insertNewBattle(initial,meta), /BATTLE_NOT_FOUND/);
    await assert.rejects(battle.saveBattle(initial,meta), /BATTLE_NOT_FOUND/);
    const receipt = await query<{ battle_id: string; cutover_id: string }>("SELECT * FROM battle_discard_receipts WHERE battle_id=$1",[id]);
    assert.deepEqual(Object.keys(receipt.rows[0] ?? {}).sort(),["battle_id","cutover_id"]);
    await battle.saveBattle({ ...completed, turn: 1 }, meta);
    await assert.rejects(apply(plan), /BATTLE_CUTOVER_HISTORY_CHANGED/);
    await battle.saveBattle(completed, meta);
  });
  it("accounts for an over-ceiling delayed narration result after deletion without publication", async () => {
    const worker = await import("../services/narration-worker.js");
    const id = "storage-late-narration";
    await battle.insertNewBattle(state(id), meta);
    await worker.enqueueNarration({ battleId: id, receiptId: "late-receipt", sequence: 1,
      phase: "combat", combatTurn: 1, frozenInput: { scene: "never-publish" }, inputDigest: "a".repeat(64) });
    let started: () => void = () => {};
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let finish: () => void = () => {};
    const delayed = new Promise<void>((resolve) => { finish = resolve; });
    const pending = worker.processNextNarration({ battleId: id, ownerId: "late-worker", generator: async () => {
      started();
      await delayed;
      return { narrative: { turn: 1, narrator: ["late-provider-text"], speeches: [] },
        provider: "mock", model: "mock", route: "fast", httpAttempts: 1,
        tokenCount: worker.NARRATION_TOTAL_TOKEN_CEILING + 7, estimatedCostUsd: 0.03 };
    } });
    await entered;
    const plan = await cutover.planBattleCutover({ cutoverId: "late-narration", cutoverAt: "2026-09-30T02:00:00Z" });
    await apply(plan);
    finish();
    assert.equal(await pending, "acknowledged");
    const attempts = await query<{ status: string; token_count: number; http_attempts: number; estimated_cost_usd: number }>(
      "SELECT status,token_count,http_attempts,estimated_cost_usd FROM battle_narration_attempts WHERE battle_id=$1", [id]);
    assert.equal(attempts.rows[0]?.status, "failed");
    assert.equal(attempts.rows[0]?.token_count, worker.NARRATION_TOTAL_TOKEN_CEILING + 7);
    assert.equal(attempts.rows[0]?.http_attempts, 1);
    assert.equal(Number(attempts.rows[0]?.estimated_cost_usd), 0.03);
    assert.equal(await count("battle_presentations", id), 0);
    assert.equal(await count("battle_narration_events", id), 0);
    assert.equal(await count("battle_narration_outbox", id), 0);
  });

  it("replays an empty plan after unrelated post-cutover creation", async () => {
    const plan = await cutover.planBattleCutover({ cutoverId: "empty", cutoverAt: "2026-09-30T02:00:00Z" });
    assert.equal(plan.targets.length, 0);
    assert.equal((await apply(plan)).kind, "replayed");
    const later = { ...state("storage-postcutover"), createdAt: "2026-09-30T03:00:00Z" };
    await battle.insertNewBattle(later, meta);
    assert.equal((await apply(plan)).kind, "replayed");
    assert.ok(await battle.getBattle(later.id));
    await query("DELETE FROM battles WHERE id=$1", [later.id]);
  });

});
