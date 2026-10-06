// R: Persist typed awareness snapshots with revision and live-lease fencing.
import { AwarenessPipelineStateSchema, type AwarenessPipelineState, type AwarenessConsciousOutput, type AwarenessRole, type AwarenessReservation } from "@kshiai/shared";
import { budgetSnapshot, validateReservationAdmission } from "./awareness-reservation-budget.js";
import { config } from "../config.js";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import type { BattleLeaseFence } from "../services/distributed-guard.js";
import { awarenessRuntimeInitializationQuery } from "./battle-awareness-initialization-query.js";

export type AwarenessRuntimeSnapshot = {
  battleId: string;
  revision: number;
  fencingToken: number;
  runtime: AwarenessPipelineState;
  updatedAt: string;
};

export type AwarenessRuntimeWrite = {
  battleId: string;
  expectedRevision: number;
  fence: BattleLeaseFence;
  now: string;
};

type RuntimeRow = {
  battle_id: string;
  revision: number;
  fencing_token: number;
  runtime_json: string;
  updated_at: string;
};

function parseRow(row: RuntimeRow): AwarenessRuntimeSnapshot {
  return {
    battleId: row.battle_id,
    revision: Number(row.revision),
    fencingToken: Number(row.fencing_token),
    runtime: AwarenessPipelineStateSchema.parse(JSON.parse(row.runtime_json)),
    updatedAt: row.updated_at,
  };
}

function validateWrite(input: AwarenessRuntimeWrite): void {
  if (input.fence.battleId !== input.battleId) throw new Error("AWARENESS_LEASE_SCOPE_MISMATCH");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error("AWARENESS_REVISION_INVALID");
  }
  if (!Number.isSafeInteger(input.fence.fencingToken) || input.fence.fencingToken < 1) {
    throw new Error("AWARENESS_FENCE_INVALID");
  }
  if (!Number.isFinite(Date.parse(input.now))) throw new Error("AWARENESS_TIMESTAMP_INVALID");
}

/** A read performs no recovery, transmission, or automatic mutation. */
export async function getAwarenessRuntime(battleId: string): Promise<AwarenessRuntimeSnapshot | null> {
  return getAwarenessRuntimeInTransaction({ query }, battleId);
}

/** The caller owns the transaction; locking does not create a nested transaction. */
export async function getAwarenessRuntimeInTransaction(
  connection: DatabaseConnection,
  battleId: string,
  options: { lock: boolean } = { lock: false },
): Promise<AwarenessRuntimeSnapshot | null> {
  const result = await connection.query<RuntimeRow>(
    `SELECT battle_id, revision, fencing_token, runtime_json, updated_at FROM battle_awareness_runtime
      WHERE battle_id = $1${options.lock && config.databaseUrl ? " FOR UPDATE" : ""}`, [battleId],
  );
  return result.rows[0] ? parseRow(result.rows[0]) : null;
}

/** Initialize once while holding the live battle lease; never replace an existing runtime. */
export async function initializeAwarenessRuntime(input: {
  battleId: string; runtime: AwarenessPipelineState; fence: BattleLeaseFence; now: string;
}): Promise<boolean> {
  validateWrite({ ...input, expectedRevision: 0 });
  const runtime = AwarenessPipelineStateSchema.parse(input.runtime);
  const statement = awarenessRuntimeInitializationQuery({
    battleId: input.battleId,
    ownerId: input.fence.ownerId,
    fencingToken: input.fence.fencingToken,
    runtimeJson: JSON.stringify(runtime),
    now: input.now,
  });
  const result = await query(statement.text, statement.values);
  return result.rowCount === 1;
}

/** Combine this CAS with canonical battle persistence in the caller's transaction.
 * Maximum effect: one sidecar revision. No provider call or domain decision occurs here.
 * A rejected CAS throws so the caller's entire transaction rolls back.
 */
export async function commitAwarenessRuntimeInTransaction(
  connection: DatabaseConnection,
  input: AwarenessRuntimeWrite,
  nextRuntime: AwarenessPipelineState,
): Promise<AwarenessRuntimeSnapshot> {
  validateWrite(input);
  const runtime = AwarenessPipelineStateSchema.parse(nextRuntime);
  const result = await connection.query<RuntimeRow>(
    `UPDATE battle_awareness_runtime
        SET revision = revision + 1, fencing_token = $3, runtime_json = $4, updated_at = $5
      WHERE battle_id = $1 AND revision = $6 AND fencing_token <= $3
        AND EXISTS (SELECT 1 FROM battle_leases WHERE battle_id = $1
          AND owner_id = $2 AND fencing_token = $3 AND expires_at > $5)
      RETURNING battle_id, revision, fencing_token, runtime_json, updated_at`,
    [input.battleId, input.fence.ownerId, input.fence.fencingToken,
      JSON.stringify(runtime), input.now, input.expectedRevision],
  );
  const row = result.rows[0];
  if (!row) throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
  return parseRow(row);
}

/** Run a synchronous pure transition against the latest locked snapshot. */
export async function mutateAwarenessRuntime(
  input: AwarenessRuntimeWrite,
  reduce: (runtime: AwarenessPipelineState) => AwarenessPipelineState,
): Promise<AwarenessRuntimeSnapshot> {
  validateWrite(input);
  return withTransaction(async (connection) => {
    const result = await connection.query<RuntimeRow>(
      `SELECT battle_id, revision, fencing_token, runtime_json, updated_at
         FROM battle_awareness_runtime WHERE battle_id = $1${config.databaseUrl ? " FOR UPDATE" : ""}`,
      [input.battleId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    const current = parseRow(row);
    if (current.revision !== input.expectedRevision) throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
    return commitAwarenessRuntimeInTransaction(connection, input, reduce(current.runtime));
  });
}

/** A thought outlives a world-tick lease. Its frozen generation is its receipt fence.
 * Completion publishes a mailbox candidate only; the next leased tick owns application.
 */
export async function completeAwarenessConsciousJob(input: {
  battleId: string;
  side: "a" | "b";
  jobId: string;
  generation: number;
  jobFence: number;
  finishedAt: number;
  outcome: { kind: "succeeded"; result: AwarenessConsciousOutput } | { kind: "failed"; reason: string };
  settlement?: AwarenessAttemptSettlement;
}): Promise<{ accepted: boolean; snapshot: AwarenessRuntimeSnapshot }> {
  if (!Number.isFinite(input.finishedAt) || input.finishedAt < 0) throw new Error("AWARENESS_TIMESTAMP_INVALID");
  return withTransaction(async (connection) => {
    if (input.settlement) await settleAwarenessAttemptInTransaction(connection, {
      ...input.settlement, battleId: input.battleId, finishedAt: input.finishedAt,
    });
    const result = await connection.query<RuntimeRow>(
      `SELECT battle_id, revision, fencing_token, runtime_json, updated_at FROM battle_awareness_runtime
        WHERE battle_id = $1${config.databaseUrl ? " FOR UPDATE" : ""}`, [input.battleId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    const current = parseRow(row);
    const side = current.runtime.sides[input.side];
    const job = side.job;
    if (!job || job.id !== input.jobId || job.generation !== input.generation ||
        job.fence !== input.jobFence || job.physicalStatus !== "outstanding") {
      return { accepted: false, snapshot: current };
    }
    const { accepted, nextJob } = completeConsciousJobState(current, input, side, job);
    const runtime = AwarenessPipelineStateSchema.parse({
      ...current.runtime, sides: { ...current.runtime.sides, [input.side]: { ...side, job: nextJob } },
    });
    const saved = await connection.query<RuntimeRow>(
      `UPDATE battle_awareness_runtime SET revision = revision + 1, runtime_json = $3, updated_at = $4
        WHERE battle_id = $1 AND revision = $2
        RETURNING battle_id, revision, fencing_token, runtime_json, updated_at`,
      [input.battleId, current.revision, JSON.stringify(runtime), new Date(input.finishedAt).toISOString()],
    );
    if (!saved.rows[0]) throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
    return { accepted, snapshot: parseRow(saved.rows[0]) };
  });
}

function completeConsciousJobState(current: AwarenessRuntimeSnapshot, input: Parameters<typeof completeAwarenessConsciousJob>[0], side: AwarenessPipelineState["sides"]["a"], job: NonNullable<AwarenessPipelineState["sides"]["a"]["job"]>) {
  const applicable = current.runtime.status === "active" && job.status === "running" && side.generation === input.generation &&
    side.fence === input.jobFence && input.finishedAt < job.deadlineAt && input.finishedAt >= job.startedAt;
  const accepted = applicable && input.outcome.kind === "succeeded";
  const nextJob = { ...job, physicalStatus: input.settlement?.physicalOutstanding ? "outstanding" as const : "finished" as const,
    status: accepted ? "ready" as const : applicable ? "failed" as const : job.status === "running" ? "expired" as const : job.status,
    result: accepted && input.outcome.kind === "succeeded" ? input.outcome.result : job.result };
  return { accepted, nextJob };
}

export type AwarenessAttemptSettlement = {
  id: string;
  outcome: "settled" | "unknown" | "cancelled";
  actualUsd: number | null;
  physicalOutstanding: boolean;
};

function validateSettlement(input: AwarenessAttemptSettlement & { finishedAt: number }): void {
  if (!Number.isFinite(input.finishedAt) || input.finishedAt < 0 ||
      (input.actualUsd !== null && (!Number.isFinite(input.actualUsd) || input.actualUsd < 0)) ||
      (input.outcome === "settled" && (input.actualUsd === null || input.physicalOutstanding)) ||
      (input.outcome !== "settled" && input.actualUsd !== null)) throw new Error("AWARENESS_ACCOUNTING_RECEIPT_INVALID");
}

function mergeSettlement(current: AwarenessRuntimeSnapshot, input: AwarenessAttemptSettlement): AwarenessRuntimeSnapshot {
  const reservation = current.runtime.budget.reservations.find((item) => item.id === input.id);
  if (!reservation) throw new Error("AWARENESS_ATTEMPT_NOT_RESERVED");
  if (reservation.status === input.outcome && reservation.actualUsd === input.actualUsd && reservation.physicalOutstanding === input.physicalOutstanding) return current;
  if (reservation.status === "settled") {
    if (input.outcome !== "settled" || reservation.actualUsd !== input.actualUsd) throw new Error("AWARENESS_ACCOUNTING_RECEIPT_CONFLICT");
    return current;
  }
  if (!reservation.physicalOutstanding && input.physicalOutstanding) throw new Error("AWARENESS_PHYSICAL_ATTEMPT_REOPENED");
  const reservations = current.runtime.budget.reservations.map((item) => item.id === input.id
    ? { ...item, status: input.outcome, actualUsd: input.actualUsd, physicalOutstanding: input.physicalOutstanding } : item);
  const runtime = AwarenessPipelineStateSchema.parse({ ...current.runtime, budget: budgetSnapshot(reservations) });
  return { ...current, runtime };
}

/** Reserve one physical send before transmission. Duplicate IDs can never resend. */
export async function reserveAwarenessAttempt(
  input: AwarenessRuntimeWrite,
  attempt: { id: string; role: AwarenessRole; maximumUsd: number | null },
): Promise<AwarenessRuntimeSnapshot> {
  if (attempt.maximumUsd !== null && (!Number.isFinite(attempt.maximumUsd) || attempt.maximumUsd < 0)) throw new Error("AWARENESS_COST_INVALID");
  return mutateAwarenessRuntime(input, (state) => {
    validateReservationAdmission(state, input, attempt);
    const reservations = state.budget.reservations;
    const next: AwarenessReservation = { ...attempt, status: "reserved", actualUsd: null, physicalOutstanding: true };
    return { ...state, budget: budgetSnapshot([...reservations, next]) };
  });
}

/** Accounting receipts may arrive after cancellation or lease release. */
export async function settleAwarenessAttempt(input: AwarenessAttemptSettlement & {
  battleId: string; finishedAt: number;
}): Promise<AwarenessRuntimeSnapshot> {
  return withTransaction((connection) => settleAwarenessAttemptInTransaction(connection, input));
}

export async function settleAwarenessAttemptInTransaction(
  connection: DatabaseConnection,
  input: AwarenessAttemptSettlement & { battleId: string; finishedAt: number },
): Promise<AwarenessRuntimeSnapshot> {
  validateSettlement(input);
  const result = await connection.query<RuntimeRow>(
    `SELECT battle_id, revision, fencing_token, runtime_json, updated_at FROM battle_awareness_runtime
      WHERE battle_id = $1${config.databaseUrl ? " FOR UPDATE" : ""}`, [input.battleId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
  const current = parseRow(row);
  const merged = mergeSettlement(current, input);
  if (merged === current) return current;
  const saved = await connection.query<RuntimeRow>(
    `UPDATE battle_awareness_runtime SET revision = revision + 1, runtime_json = $3, updated_at = $4
      WHERE battle_id = $1 AND revision = $2
      RETURNING battle_id, revision, fencing_token, runtime_json, updated_at`,
    [input.battleId, current.revision, JSON.stringify(merged.runtime), new Date(input.finishedAt).toISOString()],
  );
  if (!saved.rows[0]) throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
  return parseRow(saved.rows[0]);
}
