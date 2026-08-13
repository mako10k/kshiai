import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { query, withTransaction } from "../db.js";
import {
  PROVIDER_OPERATION_TAXONOMY_REVISION,
  providerOperationLayer,
  type ProviderOperationLayer,
} from "./provider-operation-taxonomy.js";

export const OBSERVATION_RUN_HEADER = "X-Kshiai-Observation-Run-Id";

export type ProviderOperationContext = {
  runId: string;
  battleId: string;
};

type AttemptCapture = { httpAttempts: number };

const operationContext = new AsyncLocalStorage<ProviderOperationContext>();
const attemptCapture = new AsyncLocalStorage<AttemptCapture>();

function boundedIdentifier(value: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function boundedMetadata(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new Error(`${name}_INVALID`);
  return normalized;
}

function providerErrorClass(error: unknown): string {
  if (!error || typeof error !== "object") return "ProviderError";
  const value = error as { name?: unknown; code?: unknown; status?: unknown };
  const parts = [value.name, value.code, value.status]
    .filter((part) => typeof part === "string" || typeof part === "number")
    .map((part) => String(part).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 40))
    .filter(Boolean);
  return (parts.join(":") || "ProviderError").slice(0, 80);
}

export function parseObservationRunId(value: string | undefined): string | null {
  const runId = value?.trim();
  if (!runId) return null;
  return boundedIdentifier(runId, "OBSERVATION_RUN_ID");
}

export function isProviderOperationAccountingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /^(?:PROVIDER_(?:OPERATION|ATTEMPT)_|OBSERVATION_RUN_)/.test(message);
}

export function currentProviderOperationContext(): ProviderOperationContext | null {
  return operationContext.getStore() ?? null;
}

export function withProviderOperationContext<T>(
  context: ProviderOperationContext,
  action: () => Promise<T>,
): Promise<T> {
  return operationContext.run(context, action);
}

export async function withBattleProviderOperationContext<T>(
  battleId: string,
  action: () => Promise<T>,
): Promise<T> {
  const result = await query<{ observation_run_id: string | null }>(
    `SELECT observation_run_id FROM battles WHERE id = $1`,
    [battleId],
  );
  const runId = result.rows[0]?.observation_run_id ?? null;
  return runId
    ? withProviderOperationContext({ runId, battleId }, action)
    : action();
}

export async function captureProviderHttpAttempts<T>(
  action: () => Promise<T>,
): Promise<{ value: T; httpAttempts: number }> {
  const capture = { httpAttempts: 0 };
  try {
    const value = await attemptCapture.run(capture, action);
    return { value, httpAttempts: capture.httpAttempts };
  } catch (error) {
    if (error && typeof error === "object" && !("httpAttempts" in error)) {
      try {
        Object.defineProperty(error, "httpAttempts", {
          value: capture.httpAttempts,
          configurable: true,
        });
      } catch {
        // Preserve the original provider error if it is not extensible.
      }
    }
    throw error;
  }
}

export async function createProviderOperationRun(input: {
  runId: string;
  observerUserId: string;
  approvedAttemptCeiling: number;
  projectedOperations: unknown;
  createdAt?: string;
}): Promise<void> {
  const runId = boundedIdentifier(input.runId, "OBSERVATION_RUN_ID");
  if (!Number.isInteger(input.approvedAttemptCeiling) || input.approvedAttemptCeiling < 1) {
    throw new Error("PROVIDER_OPERATION_CEILING_INVALID");
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  const projected = JSON.stringify(input.projectedOperations);
  await query(
    `INSERT INTO provider_operation_runs
      (run_id, observer_user_id, battle_id, taxonomy_revision,
       projected_operations_json, approved_attempt_ceiling, reserved_attempts,
       status, created_at, finished_at)
     VALUES ($1, $2, NULL, $3, $4, $5, 0, 'active', $6, NULL)
     ON CONFLICT (run_id) DO NOTHING`,
    [runId, input.observerUserId, PROVIDER_OPERATION_TAXONOMY_REVISION,
      projected, input.approvedAttemptCeiling, createdAt],
  );
  const existing = await query<{
    observer_user_id: string;
    taxonomy_revision: string;
    projected_operations_json: unknown;
    approved_attempt_ceiling: number;
    status: string;
  }>(
    `SELECT observer_user_id, taxonomy_revision, projected_operations_json,
            approved_attempt_ceiling, status
       FROM provider_operation_runs WHERE run_id = $1`,
    [runId],
  );
  const row = existing.rows[0];
  const storedProjection = typeof row?.projected_operations_json === "string"
    ? JSON.parse(row.projected_operations_json) as unknown
    : row?.projected_operations_json;
  if (!row || row.observer_user_id !== input.observerUserId ||
      row.taxonomy_revision !== PROVIDER_OPERATION_TAXONOMY_REVISION ||
      Number(row.approved_attempt_ceiling) !== input.approvedAttemptCeiling ||
      !isDeepStrictEqual(storedProjection, input.projectedOperations) ||
      row.status !== "active") {
    throw new Error("PROVIDER_OPERATION_RUN_IDENTITY_CONFLICT");
  }
}

export async function bindProviderOperationRun(input: {
  runId: string;
  observerUserId: string;
  battleId: string;
}): Promise<ProviderOperationContext> {
  const runId = boundedIdentifier(input.runId, "OBSERVATION_RUN_ID");
  const battleId = boundedIdentifier(input.battleId, "OBSERVATION_BATTLE_ID");
  await withTransaction(async (connection) => {
    const existingBattle = await connection.query<{
      observation_run_id: string | null;
    }>(
      `SELECT observation_run_id FROM battles WHERE id = $1`,
      [battleId],
    );
    if (existingBattle.rows[0]?.observation_run_id !== undefined &&
        existingBattle.rows[0].observation_run_id !== runId) {
      throw new Error("PROVIDER_OPERATION_BATTLE_BINDING_CONFLICT");
    }
    const updated = await connection.query<{ run_id: string }>(
      `UPDATE provider_operation_runs
          SET battle_id = $3
        WHERE run_id = $1 AND observer_user_id = $2 AND status = 'active'
          AND (battle_id IS NULL OR battle_id = $3)
        RETURNING run_id`,
      [runId, input.observerUserId, battleId],
    );
    if (updated.rowCount !== 1) {
      throw new Error("PROVIDER_OPERATION_RUN_BINDING_REJECTED");
    }
  });
  return { runId, battleId };
}

export async function reserveProviderOperationAttempt(input: {
  context: ProviderOperationContext;
  logicalCallId: string;
  attemptOrdinal: number;
  operation: string;
  provider: string;
  model: string;
  startedAt?: string;
}): Promise<{ reserved: boolean; layer: ProviderOperationLayer }> {
  const layer = providerOperationLayer(input.operation);
  if (!layer) throw new Error("PROVIDER_OPERATION_UNCLASSIFIED");
  boundedIdentifier(input.logicalCallId, "PROVIDER_LOGICAL_CALL_ID");
  const provider = boundedMetadata(input.provider, "PROVIDER_NAME");
  const model = boundedMetadata(input.model, "PROVIDER_MODEL");
  if (!Number.isInteger(input.attemptOrdinal) || input.attemptOrdinal < 1) {
    throw new Error("PROVIDER_ATTEMPT_ORDINAL_INVALID");
  }
  return withTransaction(async (connection) => {
    const prior = await connection.query<{ layer: string; operation: string }>(
      `SELECT layer, operation FROM provider_operation_attempts
        WHERE run_id = $1 AND logical_call_id = $2 AND attempt_ordinal = $3`,
      [input.context.runId, input.logicalCallId, input.attemptOrdinal],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].layer !== layer || prior.rows[0].operation !== input.operation) {
        throw new Error("PROVIDER_ATTEMPT_IDENTITY_CONFLICT");
      }
      return { reserved: false, layer };
    }
    const reservation = await connection.query<{ reserved_attempts: number }>(
      `UPDATE provider_operation_runs
          SET reserved_attempts = reserved_attempts + 1
        WHERE run_id = $1 AND battle_id = $2 AND status = 'active'
          AND taxonomy_revision = $3
          AND reserved_attempts < approved_attempt_ceiling
        RETURNING reserved_attempts`,
      [input.context.runId, input.context.battleId,
        PROVIDER_OPERATION_TAXONOMY_REVISION],
    );
    if (reservation.rowCount !== 1) {
      const run = await connection.query<{
        battle_id: string | null;
        status: string;
        reserved_attempts: number;
        approved_attempt_ceiling: number;
      }>(
        `SELECT battle_id, status, reserved_attempts, approved_attempt_ceiling
           FROM provider_operation_runs WHERE run_id = $1`,
        [input.context.runId],
      );
      const row = run.rows[0];
      if (!row) throw new Error("PROVIDER_OPERATION_RUN_NOT_FOUND");
      if (row.battle_id !== input.context.battleId) {
        throw new Error("PROVIDER_OPERATION_BATTLE_MISMATCH");
      }
      if (row.status !== "active") throw new Error("PROVIDER_OPERATION_RUN_INACTIVE");
      if (Number(row.reserved_attempts) >= Number(row.approved_attempt_ceiling)) {
        throw new Error("PROVIDER_OPERATION_CEILING_EXHAUSTED");
      }
      throw new Error("PROVIDER_OPERATION_RESERVATION_REJECTED");
    }
    await connection.query(
      `INSERT INTO provider_operation_attempts
        (run_id, logical_call_id, attempt_ordinal, battle_id, layer, operation,
         provider, model, status, token_count, estimated_cost_usd, elapsed_ms,
         error_class, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved', NULL, NULL,
         NULL, NULL, $9, NULL)`,
      [input.context.runId, input.logicalCallId, input.attemptOrdinal,
        input.context.battleId, layer, input.operation, provider,
        model, input.startedAt ?? new Date().toISOString()],
    );
    return { reserved: true, layer };
  });
}

async function completeProviderOperationAttempt(input: {
  context: ProviderOperationContext;
  logicalCallId: string;
  attemptOrdinal: number;
  status: "succeeded" | "failed";
  tokenCount: number | null;
  estimatedCostUsd: number | null;
  elapsedMs: number;
  errorClass: string | null;
}): Promise<void> {
  const updated = await query(
    `UPDATE provider_operation_attempts
        SET status = $4, token_count = $5, estimated_cost_usd = $6,
            elapsed_ms = $7, error_class = $8, finished_at = $9
      WHERE run_id = $1 AND logical_call_id = $2 AND attempt_ordinal = $3
        AND status = 'reserved'`,
    [input.context.runId, input.logicalCallId, input.attemptOrdinal, input.status,
      input.tokenCount, input.estimatedCostUsd, input.elapsedMs,
      input.errorClass?.slice(0, 80) ?? null, new Date().toISOString()],
  );
  if (updated.rowCount !== 1) throw new Error("PROVIDER_ATTEMPT_COMPLETION_CONFLICT");
}

export async function executeProviderOperationAttempt<T>(input: {
  logicalCallId: string;
  attemptOrdinal: number;
  operation: string;
  provider: string;
  model: string;
  action: () => Promise<T>;
  usage?: (value: T) => {
    tokenCount?: number | null;
    estimatedCostUsd?: number | null;
  };
}): Promise<T> {
  const context = currentProviderOperationContext();
  if (context) {
    const reservation = await reserveProviderOperationAttempt({
      context,
      logicalCallId: input.logicalCallId,
      attemptOrdinal: input.attemptOrdinal,
      operation: input.operation,
      provider: input.provider,
      model: input.model,
    });
    if (!reservation.reserved) throw new Error("PROVIDER_ATTEMPT_ALREADY_RECORDED");
  }
  const capture = attemptCapture.getStore();
  if (capture) capture.httpAttempts += 1;
  const started = Date.now();
  let value: T;
  try {
    value = await input.action();
  } catch (error) {
    if (context) {
      await completeProviderOperationAttempt({
        context,
        logicalCallId: input.logicalCallId,
        attemptOrdinal: input.attemptOrdinal,
        status: "failed",
        tokenCount: null,
        estimatedCostUsd: null,
        elapsedMs: Math.max(0, Date.now() - started),
        errorClass: providerErrorClass(error),
      });
    }
    throw error;
  }
  if (context) {
    const usage = input.usage?.(value) ?? {};
    await completeProviderOperationAttempt({
      context,
      logicalCallId: input.logicalCallId,
      attemptOrdinal: input.attemptOrdinal,
      status: "succeeded",
      tokenCount: usage.tokenCount ?? null,
      estimatedCostUsd: usage.estimatedCostUsd ?? null,
      elapsedMs: Math.max(0, Date.now() - started),
      errorClass: null,
    });
  }
  return value;
}

export async function finalizeProviderOperationRun(
  runId: string,
  status: "completed" | "failed",
): Promise<void> {
  const updated = await query(
    `UPDATE provider_operation_runs
        SET status = $2, finished_at = $3
      WHERE run_id = $1 AND status = 'active'`,
    [runId, status, new Date().toISOString()],
  );
  if (updated.rowCount !== 1) throw new Error("PROVIDER_OPERATION_RUN_FINALIZE_CONFLICT");
}

export async function readProviderOperationRun(runId: string): Promise<{
  runId: string;
  battleId: string | null;
  battleObservationRunId: string | null;
  taxonomyRevision: string;
  approvedAttemptCeiling: number;
  reservedAttempts: number;
  status: string;
  attempts: Array<{
    layer: string;
    operation: string;
    status: string;
    count: number;
    tokenCount: number | null;
    estimatedCostUsd: number | null;
  }>;
}> {
  const run = await query<{
    battle_id: string | null;
    battle_observation_run_id: string | null;
    taxonomy_revision: string;
    approved_attempt_ceiling: number;
    reserved_attempts: number;
    status: string;
  }>(
    `SELECT run.battle_id, battle.observation_run_id AS battle_observation_run_id,
            run.taxonomy_revision, run.approved_attempt_ceiling,
            run.reserved_attempts, run.status
       FROM provider_operation_runs run
       LEFT JOIN battles battle ON battle.id = run.battle_id
      WHERE run.run_id = $1`,
    [runId],
  );
  const row = run.rows[0];
  if (!row) throw new Error("PROVIDER_OPERATION_RUN_NOT_FOUND");
  const attempts = await query<{
    layer: string;
    operation: string;
    status: string;
    attempt_count: number;
    token_count: number | null;
    estimated_cost_usd: number | null;
    known_token_count: number;
    known_cost_count: number;
  }>(
    `SELECT layer, operation, status, COUNT(*) AS attempt_count,
            SUM(token_count) AS token_count,
            SUM(estimated_cost_usd) AS estimated_cost_usd,
            COUNT(token_count) AS known_token_count,
            COUNT(estimated_cost_usd) AS known_cost_count
       FROM provider_operation_attempts
      WHERE run_id = $1
      GROUP BY layer, operation, status
      ORDER BY layer, operation, status`,
    [runId],
  );
  return {
    runId,
    battleId: row.battle_id,
    battleObservationRunId: row.battle_observation_run_id,
    taxonomyRevision: row.taxonomy_revision,
    approvedAttemptCeiling: Number(row.approved_attempt_ceiling),
    reservedAttempts: Number(row.reserved_attempts),
    status: row.status,
    attempts: attempts.rows.map((attempt) => ({
      layer: attempt.layer,
      operation: attempt.operation,
      status: attempt.status,
      count: Number(attempt.attempt_count),
      tokenCount: Number(attempt.known_token_count) === Number(attempt.attempt_count)
        ? Number(attempt.token_count ?? 0)
        : null,
      estimatedCostUsd:
        Number(attempt.known_cost_count) === Number(attempt.attempt_count)
          ? Number(attempt.estimated_cost_usd ?? 0)
          : null,
    })),
  };
}
