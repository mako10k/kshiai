// R: Freeze, validate, and transactionally prepare disposal of the unreleased initial V3 trial.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { databaseKind, withTransaction, type DatabaseConnection } from "../db.js";
import {
  buildBattleCutoverPlanInTransaction,
  discardBattleCutoverInTransaction,
  verifyBattleCutoverReadbackInTransaction,
  type BattleCutoverPlan,
} from "./battle-cutover.js";

const MIGRATION_0029_SHA256 = "932895ea9df2cc8a495af10e78cc5a6545abb183b79b550eab9d930653188aa7";
const migration0029Path = fileURLToPath(new URL("../../migrations/0029_battle_discard_receipts.sql", import.meta.url));
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const strictIdentity = z.string().min(1);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

const frozenBattleSchema = z.object({ id: strictIdentity, stateDigest: digestSchema }).strict();
const finishedOutboxSchema = z.object({
  outboxId: strictIdentity,
  battleId: strictIdentity,
  receiptId: strictIdentity,
  deliveryGeneration: z.number().int().nonnegative(),
  expectedStatus: z.enum(["pending", "dispatched"]),
  entryDigest: digestSchema,
}).strict();

export const UnreleasedTrialPreparationPlanSchema = z.object({
  cutoverId: strictIdentity,
  cutoverAt: z.string().datetime(),
  targets: z.array(frozenBattleSchema).max(18),
  finished: z.array(frozenBattleSchema),
  relatedCounts: z.record(z.number().int().nonnegative()),
  inventoryDigest: digestSchema,
  finishedOutbox: z.array(finishedOutboxSchema).max(14),
  planDigest: digestSchema,
}).strict();
export type UnreleasedTrialPreparationPlan = z.infer<typeof UnreleasedTrialPreparationPlanSchema>;

export const UnreleasedTrialPolicySchema = z.object({
  kind: z.literal("unreleased-initial-v3-trial"),
  ownerDecisionIdentity: strictIdentity,
  stoppedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  oldWritersClosedReceiptId: strictIdentity,
}).strict();
export type UnreleasedTrialPolicy = z.infer<typeof UnreleasedTrialPolicySchema>;

export type UnreleasedTrialPreparationResult = {
  kind: "prepared" | "replayed";
  discardedIds: string[];
  finishedIds: string[];
  completedOutboxIds: string[];
};

type EntryRow = {
  battle_id: string;
  receipt_id: string;
  status: string;
  input_digest: string;
  terminal_narrative_json: unknown;
  fallback_reason: string | null;
};
type OutboxRow = {
  outbox_id: string;
  battle_id: string;
  receipt_id: string;
  status: string;
  delivery_generation: number | string;
};
type PlannedOutboxRow = OutboxRow & Omit<EntryRow, "status"> & {
  entry_status: string;
  state_json: unknown;
};

function entryDigest(row: EntryRow): string {
  const terminal = typeof row.terminal_narrative_json === "string"
    ? JSON.parse(row.terminal_narrative_json) : row.terminal_narrative_json;
  return sha256(JSON.stringify({
    battleId: row.battle_id,
    receiptId: row.receipt_id,
    status: row.status,
    inputDigest: row.input_digest,
    terminalNarrative: terminal,
    fallbackReason: row.fallback_reason,
  }));
}

async function finishedOutbox(connection: DatabaseConnection): Promise<UnreleasedTrialPreparationPlan["finishedOutbox"]> {
  const rows = (await connection.query<PlannedOutboxRow>(
    `SELECT outbox.outbox_id, outbox.battle_id, outbox.receipt_id, battle.state_json,
            outbox.status, outbox.delivery_generation,
            entry.status AS entry_status, entry.input_digest,
            entry.terminal_narrative_json, entry.fallback_reason
       FROM battle_narration_outbox outbox
       JOIN battles battle ON battle.id = outbox.battle_id
       JOIN battle_narration_entries entry
         ON entry.battle_id = outbox.battle_id AND entry.receipt_id = outbox.receipt_id
      WHERE outbox.status IN ('pending', 'dispatched')
      ORDER BY outbox.outbox_id`,
  )).rows;
  const result: UnreleasedTrialPreparationPlan["finishedOutbox"] = [];
  for (const row of rows) {
    const battleState = typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json;
    if (!battleState || typeof battleState !== "object" || Reflect.get(battleState, "status") !== "finished") continue;
    const normalized: EntryRow = { ...row, status: row.entry_status };
    if (normalized.status !== "completed") throw new Error(`UNRELEASED_TRIAL_ENTRY_NOT_COMPLETED:${row.outbox_id}`);
    if (row.status !== "pending" && row.status !== "dispatched") throw new Error(`UNRELEASED_TRIAL_OUTBOX_STATUS_INVALID:${row.outbox_id}`);
    result.push({ outboxId: row.outbox_id, battleId: row.battle_id, receiptId: row.receipt_id,
      deliveryGeneration: Number(row.delivery_generation), expectedStatus: row.status,
      entryDigest: entryDigest(normalized) });
  }
  return result;
}

function cutoverPlan(plan: UnreleasedTrialPreparationPlan): BattleCutoverPlan {
  const base = { cutoverId: plan.cutoverId, cutoverAt: plan.cutoverAt, targets: plan.targets,
    finished: plan.finished, relatedCounts: plan.relatedCounts, inventoryDigest: plan.inventoryDigest };
  return { ...base, planDigest: sha256(JSON.stringify(base)) };
}

async function buildPlan(connection: DatabaseConnection, input: { cutoverId: string; cutoverAt: string }): Promise<UnreleasedTrialPreparationPlan> {
  const base = await buildBattleCutoverPlanInTransaction(connection, input);
  const { planDigest: ignored, ...cutover } = base;
  void ignored;
  const planned = { ...cutover, finishedOutbox: await finishedOutbox(connection) };
  return { ...planned, planDigest: sha256(JSON.stringify(planned)) };
}

function validatePlan(raw: UnreleasedTrialPreparationPlan): UnreleasedTrialPreparationPlan {
  const plan = UnreleasedTrialPreparationPlanSchema.parse(raw);
  const { planDigest, ...base } = plan;
  if (sha256(JSON.stringify(base)) !== planDigest) throw new Error("UNRELEASED_TRIAL_PLAN_DIGEST_MISMATCH");
  return plan;
}

function validatePolicy(raw: UnreleasedTrialPolicy): number {
  const policy = UnreleasedTrialPolicySchema.parse(raw);
  const stoppedAt = Date.parse(policy.stoppedAt);
  const expiresAt = Date.parse(policy.expiresAt);
  const now = Date.now();
  if (expiresAt <= stoppedAt || expiresAt - stoppedAt > 1_800_000 || now < stoppedAt || now >= expiresAt) {
    throw new Error("UNRELEASED_TRIAL_STOP_POLICY_INVALID");
  }
  return expiresAt;
}

async function migration0029(): Promise<string> {
  const sql = await readFile(migration0029Path, "utf8");
  if (sha256(sql) !== MIGRATION_0029_SHA256) throw new Error("UNRELEASED_TRIAL_MIGRATION_0029_MISMATCH");
  return sql;
}

async function validateReceiptTable(connection: DatabaseConnection): Promise<void> {
  const columns = databaseKind() === "postgres"
    ? (await connection.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'battle_discard_receipts' ORDER BY ordinal_position`,
    )).rows.map((row) => [row.column_name, row.data_type, row.is_nullable])
    : (await connection.query<{ name: string; type: string; notnull: number; pk: number }>("PRAGMA table_info(battle_discard_receipts)"))
      .rows.map((row) => [row.name, row.type.toLowerCase(), row.notnull || row.pk ? "NO" : "YES"]);
  const expected = [["battle_id", "text", "NO"], ["cutover_id", "text", "NO"]];
  if (JSON.stringify(columns) !== JSON.stringify(expected)) throw new Error("UNRELEASED_TRIAL_RECEIPT_SCHEMA_MISMATCH");
  const primaryKey = databaseKind() === "postgres"
    ? (await connection.query<{ column_name: string }>(
      `SELECT key_column_usage.column_name
         FROM information_schema.table_constraints
         JOIN information_schema.key_column_usage
           ON table_constraints.constraint_catalog=key_column_usage.constraint_catalog
          AND table_constraints.constraint_schema=key_column_usage.constraint_schema
          AND table_constraints.constraint_name=key_column_usage.constraint_name
          AND table_constraints.table_catalog=key_column_usage.table_catalog
          AND table_constraints.table_schema=key_column_usage.table_schema
          AND table_constraints.table_name=key_column_usage.table_name
        WHERE table_constraints.table_schema=current_schema()
          AND table_constraints.table_name='battle_discard_receipts'
          AND table_constraints.constraint_type='PRIMARY KEY'
        ORDER BY key_column_usage.ordinal_position`,
    )).rows.map((row) => row.column_name)
    : (await connection.query<{ name: string; pk: number }>("PRAGMA table_info(battle_discard_receipts)"))
      .rows.filter((row) => row.pk > 0).sort((a, b) => a.pk - b.pk).map((row) => row.name);
  if (JSON.stringify(primaryKey) !== JSON.stringify(["battle_id"])) throw new Error("UNRELEASED_TRIAL_RECEIPT_SCHEMA_MISMATCH");
}

async function receiptTableExists(connection: DatabaseConnection): Promise<boolean> {
  if (databaseKind() === "postgres") {
    return (await connection.query<{ name: string | null }>("SELECT to_regclass('public.battle_discard_receipts') AS name")).rows[0]?.name !== null;
  }
  return (await connection.query("SELECT name FROM sqlite_master WHERE type='table' AND name='battle_discard_receipts'")).rowCount === 1;
}

async function bootstrapReceiptTable(connection: DatabaseConnection): Promise<void> {
  const sql = await migration0029();
  if (databaseKind() === "postgres") await connection.query(sql);
  else await connection.query("CREATE TABLE battle_discard_receipts (battle_id TEXT PRIMARY KEY, cutover_id TEXT NOT NULL)");
  await validateReceiptTable(connection);
}

async function lockMutableTables(connection: DatabaseConnection, includeReceipts: boolean): Promise<void> {
  if (databaseKind() !== "postgres") return;
  await connection.query(
    `LOCK TABLE battles, battle_leases, battle_presentations, battle_narration_entries,
       battle_narration_leases, battle_narration_retention, battle_narration_events,
       battle_narration_outbox, battle_narration_attempts, provider_operation_runs,
       provider_operation_attempts, character_authoring_jobs, battlefield_authoring_jobs,
       narration_style_authoring_jobs, asset_authoring_outbox,
       idempotency_keys${includeReceipts ? ", battle_discard_receipts" : ""} IN SHARE ROW EXCLUSIVE MODE`,
  );
}

async function assertQuiescent(connection: DatabaseConnection): Promise<void> {
  const now = new Date().toISOString();
  const checks = [
    "SELECT 1 FROM provider_operation_runs WHERE status='active' LIMIT 1",
    "SELECT 1 FROM provider_operation_attempts WHERE status='reserved' LIMIT 1",
    "SELECT 1 FROM battle_narration_attempts WHERE status='generating' LIMIT 1",
    "SELECT 1 FROM battle_narration_entries WHERE status IN ('queued','generating') LIMIT 1",
    "SELECT 1 FROM character_authoring_jobs WHERE status IN ('pending','claimed') LIMIT 1",
    "SELECT 1 FROM battlefield_authoring_jobs WHERE status IN ('pending','claimed') LIMIT 1",
    "SELECT 1 FROM narration_style_authoring_jobs WHERE status IN ('pending','claimed') LIMIT 1",
    "SELECT 1 FROM asset_authoring_outbox WHERE status IN ('pending','dispatched') LIMIT 1",
  ];
  for (const sql of checks) {
    if ((await connection.query(sql)).rowCount !== 0) throw new Error("UNRELEASED_TRIAL_NOT_QUIESCENT");
  }
  if ((await connection.query("SELECT 1 FROM battle_leases WHERE expires_at > $1 LIMIT 1", [now])).rowCount !== 0 ||
      (await connection.query("SELECT 1 FROM battle_narration_leases WHERE expires_at > $1 LIMIT 1", [now])).rowCount !== 0) {
    throw new Error("UNRELEASED_TRIAL_NOT_QUIESCENT");
  }
}

async function assertNarrationOutboxDrained(connection: DatabaseConnection): Promise<void> {
  if ((await connection.query(
    "SELECT 1 FROM battle_narration_outbox WHERE status IN ('pending','dispatched') LIMIT 1",
  )).rowCount !== 0) throw new Error("UNRELEASED_TRIAL_OUTBOX_NOT_DRAINED");
}

async function recordedTargetIds(connection: DatabaseConnection, plan: UnreleasedTrialPreparationPlan): Promise<string[]> {
  const rows = (await connection.query<{ battle_id: string }>(
    "SELECT battle_id FROM battle_discard_receipts WHERE cutover_id = $1 ORDER BY battle_id", [plan.cutoverId],
  )).rows.map((row) => row.battle_id);
  return rows;
}

async function verifyCompletedOutbox(connection: DatabaseConnection, plan: UnreleasedTrialPreparationPlan): Promise<void> {
  for (const expected of plan.finishedOutbox) {
    const outbox = (await connection.query<OutboxRow>(
      "SELECT outbox_id,battle_id,receipt_id,status,delivery_generation FROM battle_narration_outbox WHERE outbox_id=$1",
      [expected.outboxId],
    )).rows[0];
    const entry = (await connection.query<EntryRow>(
      `SELECT battle_id,receipt_id,status,input_digest,terminal_narrative_json,fallback_reason
         FROM battle_narration_entries WHERE battle_id=$1 AND receipt_id=$2`, [expected.battleId, expected.receiptId],
    )).rows[0];
    if (!outbox || outbox.battle_id !== expected.battleId || outbox.receipt_id !== expected.receiptId ||
        outbox.status !== "completed" || Number(outbox.delivery_generation) !== expected.deliveryGeneration ||
        !entry || entry.status !== "completed" || entryDigest(entry) !== expected.entryDigest) {
      throw new Error(`UNRELEASED_TRIAL_OUTBOX_READBACK_FAILED:${expected.outboxId}`);
    }
  }
}

async function hasCompletedOutboxAccounting(connection: DatabaseConnection, plan: UnreleasedTrialPreparationPlan): Promise<boolean> {
  if (plan.finishedOutbox.length === 0) return false;
  for (const expected of plan.finishedOutbox) {
    const row = (await connection.query<{ status: string }>(
      `SELECT status FROM battle_narration_outbox
        WHERE outbox_id=$1 AND battle_id=$2 AND receipt_id=$3 AND delivery_generation=$4`,
      [expected.outboxId, expected.battleId, expected.receiptId, expected.deliveryGeneration],
    )).rows[0];
    if (row?.status !== "completed") return false;
  }
  await verifyCompletedOutbox(connection, plan);
  return true;
}

export async function planUnreleasedTrialPreparation(input: { cutoverId: string; cutoverAt: string }): Promise<UnreleasedTrialPreparationPlan> {
  return withTransaction(async (connection) => {
    if (databaseKind() === "postgres") await connection.query("SET TRANSACTION READ ONLY");
    return buildPlan(connection, input);
  });
}

export async function prepareUnreleasedTrial(input: {
  plan: UnreleasedTrialPreparationPlan;
  operatorId: string;
  policy: UnreleasedTrialPolicy;
}): Promise<UnreleasedTrialPreparationResult> {
  const plan = validatePlan(input.plan);
  if (!input.operatorId) throw new Error("UNRELEASED_TRIAL_OPERATOR_REQUIRED");
  const expiresAt = validatePolicy(input.policy);
  return withTransaction(async (connection) => {
    if (databaseKind() === "postgres") {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) throw new Error("UNRELEASED_TRIAL_STOP_POLICY_INVALID");
      await connection.query(`SET LOCAL lock_timeout = '${Math.max(1, remaining)}ms'`);
      await connection.query(`SET LOCAL statement_timeout = '${Math.max(1, remaining)}ms'`);
    }
    const hadReceiptTable = await receiptTableExists(connection);
    await lockMutableTables(connection, hadReceiptTable);
    validatePolicy(input.policy);
    await assertQuiescent(connection);
    if (hadReceiptTable) await validateReceiptTable(connection);
    const current = await buildPlan(connection, { cutoverId: plan.cutoverId, cutoverAt: plan.cutoverAt });
    if (!hadReceiptTable && current.planDigest !== plan.planDigest) throw new Error("UNRELEASED_TRIAL_PLAN_STALE");
    if (!hadReceiptTable) {
      await bootstrapReceiptTable(connection);
      await lockMutableTables(connection, true);
    }
    const recorded = await recordedTargetIds(connection, plan);
    const targetIds = plan.targets.map((row) => row.id);
    const replay = recorded.length > 0 ||
      (targetIds.length === 0 && await hasCompletedOutboxAccounting(connection, plan));
    if (replay) {
      if (JSON.stringify(recorded) !== JSON.stringify(targetIds)) throw new Error("UNRELEASED_TRIAL_REPLAY_CONFLICT");
      await verifyCompletedOutbox(connection, plan);
    } else {
      if (current.planDigest !== plan.planDigest) throw new Error("UNRELEASED_TRIAL_PLAN_STALE");
      for (const expected of plan.finishedOutbox) {
        const updated = await connection.query(
          `UPDATE battle_narration_outbox SET status='completed'
            WHERE outbox_id=$1 AND battle_id=$2 AND receipt_id=$3 AND delivery_generation=$4 AND status=$5`,
          [expected.outboxId, expected.battleId, expected.receiptId, expected.deliveryGeneration, expected.expectedStatus],
        );
        if (updated.rowCount !== 1) throw new Error(`UNRELEASED_TRIAL_OUTBOX_CONFLICT:${expected.outboxId}`);
      }
    }
    const discarded = await discardBattleCutoverInTransaction(connection, {
      plan: cutoverPlan(plan), operatorId: input.operatorId, stopped: true,
      authorization: { kind: "unreleased-initial-v3-trial",
        ownerDecisionIdentity: input.policy.ownerDecisionIdentity,
        oldWritersClosedReceiptId: input.policy.oldWritersClosedReceiptId },
    });
    await verifyCompletedOutbox(connection, plan);
    validatePolicy(input.policy);
    await assertQuiescent(connection);
    await assertNarrationOutboxDrained(connection);
    return { kind: replay || discarded.kind === "replayed" ? "replayed" : "prepared",
      discardedIds: discarded.discardedIds, finishedIds: discarded.finishedIds,
      completedOutboxIds: plan.finishedOutbox.map((row) => row.outboxId) };
  });
}

export async function readbackUnreleasedTrialPreparation(planInput: UnreleasedTrialPreparationPlan): Promise<UnreleasedTrialPreparationResult> {
  const plan = validatePlan(planInput);
  return withTransaction(async (connection) => {
    if (databaseKind() === "postgres") await connection.query("SET TRANSACTION READ ONLY");
    const recorded = await recordedTargetIds(connection, plan);
    const targetIds = plan.targets.map((row) => row.id);
    if (JSON.stringify(recorded) !== JSON.stringify(targetIds)) throw new Error("UNRELEASED_TRIAL_READBACK_FAILED");
    await verifyBattleCutoverReadbackInTransaction(connection, cutoverPlan(plan));
    await verifyCompletedOutbox(connection, plan);
    await assertQuiescent(connection);
    await assertNarrationOutboxDrained(connection);
    return { kind: "replayed", discardedIds: targetIds, finishedIds: plan.finished.map((row) => row.id),
      completedOutboxIds: plan.finishedOutbox.map((row) => row.outboxId) };
  });
}
