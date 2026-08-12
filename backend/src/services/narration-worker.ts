import {
  NarrativeBlockSchema,
  type BattleNarrationEntryPublic,
  type BattleNarrationEventPublic,
  type BattleNarrationFollowEvent,
  type BattleNarrationSnapshot,
  type NarrativeBlock,
} from "@kshiai/shared";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import { newId } from "../id.js";
import type { LlmProvider } from "../llm/types.js";

export const NARRATION_WORKER_MAX_ATTEMPTS = 2;
export const NARRATION_TOTAL_HTTP_ATTEMPTS = 4;
export const NARRATION_TOTAL_TOKEN_CEILING = 12_000;
export const NARRATION_PUBLIC_EVENT_RETENTION_DAYS = 30;
export const NARRATION_ATTEMPT_RETENTION_DAYS = 14;

type EntryRow = {
  battle_id: string;
  receipt_id: string;
  sequence: number;
  phase: "prologue" | "combat" | "judgment" | "aftermath";
  combat_turn: number | null;
  input_json: unknown;
  input_digest: string;
  status: "queued" | "generating" | "completed" | "failed" | "cancelled";
  attempt_count: number;
};

export type NarrationGenerationResult = {
  narrative: NarrativeBlock;
  provider: string;
  model: string | null;
  route: "fast" | "deterministic";
  httpAttempts: number;
  tokenCount: number | null;
  estimatedCostUsd: number | null;
};

export type NarrationGenerator = (
  input: unknown,
  context?: {
    heartbeat: () => Promise<void>;
    remainingHttpAttempts: number;
    remainingTokens: number;
  },
) => Promise<NarrationGenerationResult>;

export function createLlmNarrationGenerator(llm: LlmProvider): NarrationGenerator {
  return async (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("narration_input_invalid");
    const input = raw as { kind?: unknown; request?: unknown };
    if (!input.request || typeof input.request !== "object") {
      throw new Error("narration_request_missing");
    }
    let narrative: NarrativeBlock;
    if (input.kind === "combat") {
      const result = await llm.narrateTurn(
        input.request as Parameters<LlmProvider["narrateTurn"]>[0],
      );
      narrative = {
        turn: result.turn,
        narrator: result.narrator,
        speeches: result.speeches,
      };
    } else if (input.kind === "prologue") {
      const result = await llm.narratePrologue(
        input.request as Parameters<LlmProvider["narratePrologue"]>[0],
      );
      narrative = {
        turn: result.turn,
        narrator: result.narrator,
        speeches: result.speeches,
      };
    } else if (input.kind === "aftermath") {
      const request = input.request as Parameters<LlmProvider["narrateAftermath"]>[0];
      const result = await llm.narrateAftermath(request);
      narrative = {
        turn: request.turn,
        narrator: [...result.before, ...result.after],
        speeches: result.speeches,
      };
    } else if (input.kind === "judgment") {
      const request = input.request as Parameters<LlmProvider["narrateJudgment"]>[0];
      const result = await llm.narrateJudgment(request);
      const verdict = request.winnerName
        ? `${request.winnerName} の勝利。${request.adjudicationReason}`
        : `引き分け。${request.adjudicationReason}`;
      narrative = {
        turn: request.turn,
        narrator: [...result.before, "——判定——", verdict, ...result.after],
        speeches: [],
      };
    } else {
      throw new Error("narration_kind_invalid");
    }
    return {
      narrative: NarrativeBlockSchema.parse(narrative),
      provider: llm.name,
      model: llm.models?.fast ?? null,
      route: "fast",
      httpAttempts: 1,
      tokenCount: null,
      estimatedCostUsd: null,
    };
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

async function nextEventSequence(
  connection: DatabaseConnection,
  battleId: string,
): Promise<number> {
  const result = await connection.query<{ next_sequence: number }>(
    `SELECT COALESCE(MAX(event_sequence), 0) + 1 AS next_sequence
       FROM battle_narration_events
      WHERE battle_id = $1`,
    [battleId],
  );
  return Number(result.rows[0]?.next_sequence ?? 1);
}

async function appendPublicEvent(input: {
  connection: DatabaseConnection;
  battleId: string;
  receiptId: string;
  narrationSequence: number;
  kind: "queued" | "started" | "completed" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  now: string;
}): Promise<void> {
  const sequence = await nextEventSequence(input.connection, input.battleId);
  await input.connection.query(
    `INSERT INTO battle_narration_events
      (battle_id, event_sequence, event_id, receipt_id, narration_sequence,
       kind, public_payload_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.battleId,
      sequence,
      `${input.battleId}:event:${sequence}`,
      input.receiptId,
      input.narrationSequence,
      input.kind,
      json(input.payload),
      input.now,
    ],
  );
}

type EnqueueNarrationInput = {
  battleId: string;
  receiptId: string;
  sequence: number;
  phase: "prologue" | "combat" | "judgment" | "aftermath";
  combatTurn: number | null;
  frozenInput: unknown;
  inputDigest: string;
  now?: string;
};

export async function enqueueNarrationInTransaction(
  connection: DatabaseConnection,
  input: EnqueueNarrationInput,
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const inserted = await connection.query<{ receipt_id: string }>(
      `INSERT INTO battle_narration_entries
        (battle_id, receipt_id, sequence, phase, combat_turn, input_json,
         input_digest, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, $8)
       ON CONFLICT (battle_id, receipt_id) DO NOTHING
       RETURNING receipt_id`,
      [
        input.battleId,
        input.receiptId,
        input.sequence,
        input.phase,
        input.combatTurn,
        json(input.frozenInput),
        input.inputDigest,
        now,
      ],
  );
  if (inserted.rowCount === 0) {
      const existing = await connection.query<{ input_digest: string }>(
        `SELECT input_digest FROM battle_narration_entries
          WHERE battle_id = $1 AND receipt_id = $2`,
        [input.battleId, input.receiptId],
      );
      if (existing.rows[0]?.input_digest !== input.inputDigest) {
        throw new Error("NARRATION_INPUT_DIGEST_CONFLICT");
      }
    return;
  }
  await appendPublicEvent({
      connection,
      battleId: input.battleId,
      receiptId: input.receiptId,
      narrationSequence: input.sequence,
      kind: "queued",
      payload: {
        turnReceiptId: input.receiptId,
        narrationSequence: input.sequence,
        phase: input.phase,
        combatTurn: input.combatTurn,
        status: "queued",
      },
      now,
  });
  await connection.query(
      `INSERT INTO battle_narration_outbox
        (outbox_id, battle_id, receipt_id, status, created_at)
       VALUES ($1, $2, $3, 'pending', $4)
       ON CONFLICT (outbox_id) DO NOTHING`,
      [`outbox:${input.battleId}:${input.receiptId}`, input.battleId, input.receiptId, now],
  );
}

export async function enqueueNarration(input: EnqueueNarrationInput): Promise<void> {
  await withTransaction(async (connection) => {
    await enqueueNarrationInTransaction(connection, input);
  });
}

async function acquireFencedLease(input: {
  battleId: string;
  ownerId: string;
  now: string;
  expiresAt: string;
}): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await connection.query<{ fencing_token: number }>(
      `INSERT INTO battle_narration_leases
        (battle_id, owner_id, fencing_token, expires_at, updated_at)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (battle_id) DO UPDATE
         SET owner_id = EXCLUDED.owner_id,
             fencing_token = battle_narration_leases.fencing_token + 1,
             expires_at = EXCLUDED.expires_at,
             updated_at = EXCLUDED.updated_at
       WHERE battle_narration_leases.owner_id = EXCLUDED.owner_id
          OR battle_narration_leases.expires_at <= $4
       RETURNING fencing_token`,
      [input.battleId, input.ownerId, input.expiresAt, input.now],
    );
    const token = result.rows[0]?.fencing_token;
    if (token === undefined) throw new Error("NARRATION_LEASE_BUSY");
    return Number(token);
  });
}

async function renewFencedLease(input: {
  battleId: string;
  ownerId: string;
  fencingToken: number;
  now?: Date;
  leaseMs?: number;
}): Promise<void> {
  const now = input.now ?? new Date();
  const result = await query(
    `UPDATE battle_narration_leases
        SET expires_at = $4, updated_at = $5
      WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3
        AND expires_at > $5`,
    [
      input.battleId,
      input.ownerId,
      input.fencingToken,
      new Date(now.getTime() + (input.leaseMs ?? 60_000)).toISOString(),
      now.toISOString(),
    ],
  );
  if (result.rowCount !== 1) throw new Error("NARRATION_STALE_FENCE");
}

function deterministicFallback(entry: EntryRow): NarrativeBlock {
  const parsed = typeof entry.input_json === "string"
    ? JSON.parse(entry.input_json) as Record<string, unknown>
    : entry.input_json as Record<string, unknown>;
  const scene = typeof parsed?.scene === "string" ? parsed.scene : "戦場";
  return {
    turn: entry.combat_turn ?? 0,
    narrator: [`${scene}で、確定した局面が静かに刻まれた。`],
    speeches: [],
  };
}

export async function processNextNarration(input: {
  battleId: string;
  receiptId?: string;
  outboxId?: string;
  deliveryGeneration?: number;
  ownerId: string;
  generator: NarrationGenerator;
  now?: Date;
  leaseMs?: number;
}): Promise<"idle" | "acknowledged" | "deferred" | "completed" | "retry_queued" | "failed"> {
  const nowDate = input.now ?? new Date();
  const now = nowDate.toISOString();
  if (input.receiptId && input.outboxId && input.deliveryGeneration !== undefined) {
    const disposition = await withTransaction(async (connection) => {
      const delivery = await connection.query<{
        status: string;
        delivery_generation: number;
      }>(
        `SELECT status, delivery_generation
           FROM battle_narration_outbox
          WHERE outbox_id = $1 AND battle_id = $2 AND receipt_id = $3`,
        [input.outboxId, input.battleId, input.receiptId],
      );
      const outbox = delivery.rows[0];
      if (!outbox || Number(outbox.delivery_generation) !== input.deliveryGeneration ||
          outbox.status === "completed") {
        return "acknowledged" as const;
      }
      const predecessor = await connection.query(
        `SELECT 1
           FROM battle_narration_entries current_entry
           JOIN battle_narration_entries earlier
             ON earlier.battle_id = current_entry.battle_id
            AND earlier.sequence < current_entry.sequence
          WHERE current_entry.battle_id = $1
            AND current_entry.receipt_id = $2
            AND earlier.status IN ('queued', 'generating')
          LIMIT 1`,
        [input.battleId, input.receiptId],
      );
      if (predecessor.rowCount === 0) return "ready" as const;
      await connection.query(
        `UPDATE battle_narration_outbox
            SET status = 'pending', dispatched_at = NULL
          WHERE outbox_id = $1 AND delivery_generation = $2
            AND status = 'dispatched'`,
        [input.outboxId, input.deliveryGeneration],
      );
      return "deferred" as const;
    });
    if (disposition !== "ready") return disposition;
  }
  const expiresAt = new Date(
    nowDate.getTime() + (input.leaseMs ?? 60_000),
  ).toISOString();
  const fence = await acquireFencedLease({
    battleId: input.battleId,
    ownerId: input.ownerId,
    now,
    expiresAt,
  });
  const claimed = await withTransaction(async (connection) => {
    if (input.receiptId && input.outboxId && input.deliveryGeneration !== undefined) {
      const delivery = await connection.query<{
        status: string;
        delivery_generation: number;
      }>(
        `SELECT status, delivery_generation
           FROM battle_narration_outbox
          WHERE outbox_id = $1 AND battle_id = $2 AND receipt_id = $3`,
        [input.outboxId, input.battleId, input.receiptId],
      );
      const outbox = delivery.rows[0];
      if (!outbox || Number(outbox.delivery_generation) !== input.deliveryGeneration ||
          outbox.status === "completed") {
        await connection.query(
          `DELETE FROM battle_narration_leases
            WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3`,
          [input.battleId, input.ownerId, fence],
        );
        return { disposition: "acknowledged" as const };
      }
      const predecessor = await connection.query(
        `SELECT 1
           FROM battle_narration_entries current_entry
           JOIN battle_narration_entries earlier
             ON earlier.battle_id = current_entry.battle_id
            AND earlier.sequence < current_entry.sequence
          WHERE current_entry.battle_id = $1
            AND current_entry.receipt_id = $2
            AND earlier.status IN ('queued', 'generating')
          LIMIT 1`,
        [input.battleId, input.receiptId],
      );
      if (predecessor.rowCount > 0) {
        await connection.query(
          `UPDATE battle_narration_outbox
              SET status = 'pending', dispatched_at = NULL
            WHERE outbox_id = $1 AND delivery_generation = $2
              AND status = 'dispatched'`,
          [input.outboxId, input.deliveryGeneration],
        );
        await connection.query(
          `DELETE FROM battle_narration_leases
            WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3`,
          [input.battleId, input.ownerId, fence],
        );
        return { disposition: "deferred" as const };
      }
    }
    const selected = await connection.query<EntryRow>(
      `SELECT battle_id, receipt_id, sequence, phase, combat_turn, input_json,
              input_digest, status, attempt_count
         FROM battle_narration_entries
        WHERE battle_id = $1
          AND status IN ('queued', 'generating')
          ${input.receiptId ? "AND receipt_id = $2" : ""}
        ORDER BY sequence ASC
        LIMIT 1`,
      input.receiptId ? [input.battleId, input.receiptId] : [input.battleId],
    );
    const entry = selected.rows[0];
    if (!entry) {
      if (input.outboxId && input.deliveryGeneration !== undefined) {
        await connection.query(
          `UPDATE battle_narration_outbox
              SET status = 'completed'
            WHERE outbox_id = $1 AND delivery_generation = $2`,
          [input.outboxId, input.deliveryGeneration],
        );
      }
      await connection.query(
        `DELETE FROM battle_narration_leases
          WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3`,
        [input.battleId, input.ownerId, fence],
      );
      return { disposition: "acknowledged" as const };
    }
    const attemptId = newId("narration_attempt");
    const updated = await connection.query(
      `UPDATE battle_narration_entries
          SET status = 'generating', active_attempt_id = $3,
              attempt_count = attempt_count + 1, updated_at = $4
        WHERE battle_id = $1 AND receipt_id = $2
          AND status IN ('queued', 'generating')`,
      [entry.battle_id, entry.receipt_id, attemptId, now],
    );
    if (updated.rowCount !== 1) throw new Error("NARRATION_CLAIM_CONFLICT");
    await connection.query(
      `INSERT INTO battle_narration_attempts
        (attempt_id, battle_id, receipt_id, fencing_token, status,
         provider, model, route, started_at)
       VALUES ($1, $2, $3, $4, 'generating', 'pending', NULL, 'fast', $5)`,
      [attemptId, entry.battle_id, entry.receipt_id, fence, now],
    );
    await appendPublicEvent({
      connection,
      battleId: entry.battle_id,
      receiptId: entry.receipt_id,
      narrationSequence: Number(entry.sequence),
      kind: "started",
      payload: {
        turnReceiptId: entry.receipt_id,
        narrationSequence: Number(entry.sequence),
        phase: entry.phase,
        combatTurn: entry.combat_turn,
        status: "generating",
      },
      now,
    });
    return { disposition: "claimed" as const, entry, attemptId };
  });
  if (claimed.disposition !== "claimed") return claimed.disposition;

  const started = Date.now();
  let generated: NarrationGenerationResult | null = null;
  let errorClass: string | null = null;
  let failureHttpAttempts = 0;
  let failureTokenCount: number | null = null;
  let failureEstimatedCostUsd: number | null = null;
  let ceilingReached = false;
  const priorUsage = await query<{
    http_attempts: number;
    token_count: number;
  }>(
    `SELECT COALESCE(SUM(http_attempts), 0) AS http_attempts,
            COALESCE(SUM(token_count), 0) AS token_count
       FROM battle_narration_attempts
      WHERE battle_id = $1 AND receipt_id = $2 AND attempt_id <> $3`,
    [input.battleId, claimed.entry.receipt_id, claimed.attemptId],
  );
  const priorHttpAttempts = Number(priorUsage.rows[0]?.http_attempts ?? 0);
  const priorTokenCount = Number(priorUsage.rows[0]?.token_count ?? 0);
  try {
    if (priorHttpAttempts >= NARRATION_TOTAL_HTTP_ATTEMPTS ||
        priorTokenCount >= NARRATION_TOTAL_TOKEN_CEILING) {
      ceilingReached = true;
      throw new Error("narration_budget_exhausted");
    }
    generated = await input.generator(
      typeof claimed.entry.input_json === "string"
        ? JSON.parse(claimed.entry.input_json)
        : claimed.entry.input_json,
      {
        heartbeat: () => renewFencedLease({
          battleId: input.battleId,
          ownerId: input.ownerId,
          fencingToken: fence,
          leaseMs: input.leaseMs,
        }),
        remainingHttpAttempts: NARRATION_TOTAL_HTTP_ATTEMPTS - priorHttpAttempts,
        remainingTokens: NARRATION_TOTAL_TOKEN_CEILING - priorTokenCount,
      },
    );
    NarrativeBlockSchema.parse(generated.narrative);
    const totalHttpAttempts = priorHttpAttempts + generated.httpAttempts;
    const totalTokenCount = priorTokenCount +
      (generated.tokenCount ?? 0);
    if (totalHttpAttempts > NARRATION_TOTAL_HTTP_ATTEMPTS) {
      ceilingReached = true;
      throw new Error("http_attempt_ceiling");
    }
    if (totalTokenCount > NARRATION_TOTAL_TOKEN_CEILING) {
      ceilingReached = true;
      throw new Error("token_ceiling");
    }
  } catch (error) {
    errorClass = error instanceof Error ? error.message.slice(0, 80) : "generation_error";
    const usage = error && typeof error === "object"
      ? error as { httpAttempts?: unknown; tokenCount?: unknown; estimatedCostUsd?: unknown }
      : null;
    failureHttpAttempts = typeof usage?.httpAttempts === "number" ? usage.httpAttempts : 0;
    failureTokenCount = typeof usage?.tokenCount === "number" ? usage.tokenCount : null;
    failureEstimatedCostUsd = typeof usage?.estimatedCostUsd === "number"
      ? usage.estimatedCostUsd
      : null;
    if (priorHttpAttempts + failureHttpAttempts >= NARRATION_TOTAL_HTTP_ATTEMPTS ||
        priorTokenCount + (failureTokenCount ?? 0) >= NARRATION_TOTAL_TOKEN_CEILING) {
      ceilingReached = true;
    }
    generated = null;
  }
  const finishedAt = new Date().toISOString();
  const elapsedMs = Math.max(0, Date.now() - started);
  return withTransaction(async (connection) => {
    const lease = await connection.query<{ fencing_token: number }>(
      `SELECT fencing_token FROM battle_narration_leases
        WHERE battle_id = $1 AND owner_id = $2
          AND fencing_token = $3 AND expires_at > $4`,
      [input.battleId, input.ownerId, fence, finishedAt],
    );
    if (lease.rowCount !== 1) throw new Error("NARRATION_STALE_FENCE");
    if (generated) {
      await connection.query(
        `UPDATE battle_narration_attempts
            SET status = 'completed', provider = $2, model = $3, route = $4,
                http_attempts = $5, token_count = $6, estimated_cost_usd = $7,
                elapsed_ms = $8, finished_at = $9
          WHERE attempt_id = $1 AND fencing_token = $10`,
        [claimed.attemptId, generated.provider, generated.model, generated.route,
          generated.httpAttempts, generated.tokenCount, generated.estimatedCostUsd,
          elapsedMs, finishedAt, fence],
      );
      const committed = await connection.query(
        `UPDATE battle_narration_entries
            SET status = 'completed', terminal_narrative_json = $3,
                active_attempt_id = NULL, updated_at = $4
          WHERE battle_id = $1 AND receipt_id = $2
            AND active_attempt_id = $5`,
        [input.battleId, claimed.entry.receipt_id, json(generated.narrative), finishedAt,
          claimed.attemptId],
      );
      if (committed.rowCount !== 1) throw new Error("NARRATION_STALE_ATTEMPT");
      const presentation = await connection.query(
        `INSERT INTO battle_presentations
          (battle_id, receipt_id, sequence, phase, combat_turn, input_digest,
           narrative_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (battle_id, receipt_id) DO UPDATE
           SET narrative_json = EXCLUDED.narrative_json
           WHERE battle_presentations.input_digest = EXCLUDED.input_digest`,
        [input.battleId, claimed.entry.receipt_id, claimed.entry.sequence,
          claimed.entry.phase, claimed.entry.combat_turn, claimed.entry.input_digest,
          json(generated.narrative), finishedAt],
      );
      if (presentation.rowCount !== 1) throw new Error("PRESENTATION_DIGEST_CONFLICT");
      await appendPublicEvent({
        connection,
        battleId: input.battleId,
        receiptId: claimed.entry.receipt_id,
        narrationSequence: Number(claimed.entry.sequence),
        kind: "completed",
        payload: {
          turnReceiptId: claimed.entry.receipt_id,
          narrationSequence: Number(claimed.entry.sequence),
          phase: claimed.entry.phase,
          combatTurn: claimed.entry.combat_turn,
          status: "completed",
          narrative: generated.narrative,
        },
        now: finishedAt,
      });
      if (input.outboxId && input.deliveryGeneration !== undefined) {
        await connection.query(
          `UPDATE battle_narration_outbox
              SET status = 'completed'
            WHERE outbox_id = $1 AND delivery_generation = $2`,
          [input.outboxId, input.deliveryGeneration],
        );
      }
      await connection.query(
        `DELETE FROM battle_narration_leases
          WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3`,
        [input.battleId, input.ownerId, fence],
      );
      return "completed";
    }

    const attempts = Number(claimed.entry.attempt_count) + 1;
    const terminal = ceilingReached || attempts >= NARRATION_WORKER_MAX_ATTEMPTS;
    await connection.query(
      `UPDATE battle_narration_attempts
          SET status = $2, provider = 'unavailable', route = 'deterministic',
              http_attempts = $3, token_count = $4, estimated_cost_usd = $5,
              elapsed_ms = $6, fallback_reason = $7, error_class = $7,
              finished_at = $8
        WHERE attempt_id = $1 AND fencing_token = $9`,
      [claimed.attemptId, terminal ? "failed" : "abandoned", failureHttpAttempts,
        failureTokenCount, failureEstimatedCostUsd, elapsedMs,
        errorClass ?? "generation_error", finishedAt, fence],
    );
    if (!terminal) {
      await connection.query(
        `UPDATE battle_narration_entries
            SET status = 'queued', active_attempt_id = NULL, updated_at = $3
          WHERE battle_id = $1 AND receipt_id = $2 AND active_attempt_id = $4`,
        [input.battleId, claimed.entry.receipt_id, finishedAt, claimed.attemptId],
      );
      await connection.query(
        `DELETE FROM battle_narration_leases
          WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3`,
        [input.battleId, input.ownerId, fence],
      );
      return "retry_queued";
    }
    const fallback = deterministicFallback(claimed.entry);
    await connection.query(
      `UPDATE battle_narration_entries
          SET status = 'failed', terminal_narrative_json = $3,
              fallback_reason = $4, active_attempt_id = NULL, updated_at = $5
        WHERE battle_id = $1 AND receipt_id = $2 AND active_attempt_id = $6`,
      [input.battleId, claimed.entry.receipt_id, json(fallback),
        errorClass ?? "generation_error", finishedAt, claimed.attemptId],
    );
    await appendPublicEvent({
      connection,
      battleId: input.battleId,
      receiptId: claimed.entry.receipt_id,
      narrationSequence: Number(claimed.entry.sequence),
      kind: "failed",
      payload: {
        turnReceiptId: claimed.entry.receipt_id,
        narrationSequence: Number(claimed.entry.sequence),
        phase: claimed.entry.phase,
        combatTurn: claimed.entry.combat_turn,
        status: "failed",
        narrative: fallback,
        fallbackReason: errorClass ?? "generation_error",
      },
      now: finishedAt,
    });
    if (input.outboxId && input.deliveryGeneration !== undefined) {
      await connection.query(
        `UPDATE battle_narration_outbox
            SET status = 'completed'
          WHERE outbox_id = $1 AND delivery_generation = $2`,
        [input.outboxId, input.deliveryGeneration],
      );
    }
    await connection.query(
      `DELETE FROM battle_narration_leases
        WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3`,
      [input.battleId, input.ownerId, fence],
    );
    return "failed";
  });
}

export type NarrationOutboxDelivery = {
  outboxId: string;
  battleId: string;
  receiptId: string;
  deliveryGeneration: number;
};

export async function recoverStaleNarrationOutbox(
  now = new Date(),
  staleMs = 5 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(now.getTime() - Math.max(60_000, staleMs)).toISOString();
  const recovered = await query(
    `UPDATE battle_narration_outbox
        SET status = 'pending', dispatched_at = NULL,
            delivery_generation = delivery_generation + 1
      WHERE status = 'dispatched'
        AND dispatched_at <= $1
        AND EXISTS (
          SELECT 1
            FROM battle_narration_entries entry
            LEFT JOIN battle_narration_leases lease
              ON lease.battle_id = entry.battle_id
           WHERE entry.battle_id = battle_narration_outbox.battle_id
             AND entry.receipt_id = battle_narration_outbox.receipt_id
             AND NOT EXISTS (
               SELECT 1 FROM battle_narration_entries earlier
                WHERE earlier.battle_id = entry.battle_id
                  AND earlier.sequence < entry.sequence
                  AND earlier.status IN ('queued', 'generating')
             )
             AND (
               entry.status = 'queued'
               OR (entry.status = 'generating' AND (
                 lease.battle_id IS NULL OR lease.expires_at <= $2
               ))
             )
        )`,
    [cutoff, now.toISOString()],
  );
  return recovered.rowCount;
}

export async function dispatchNarrationOutbox(
  dispatcher: (delivery: NarrationOutboxDelivery) => Promise<void>,
  limit = 20,
): Promise<{ delivered: number; failed: number }> {
  const pending = await query<{
    outbox_id: string;
    battle_id: string;
    receipt_id: string;
    delivery_generation: number;
  }>(
    `SELECT outbox.outbox_id, outbox.battle_id, outbox.receipt_id,
            outbox.delivery_generation
       FROM battle_narration_outbox outbox
       JOIN battle_narration_entries entry
         ON entry.battle_id = outbox.battle_id
        AND entry.receipt_id = outbox.receipt_id
      WHERE outbox.status = 'pending'
        AND entry.status IN ('queued', 'generating')
        AND NOT EXISTS (
          SELECT 1 FROM battle_narration_entries earlier
           WHERE earlier.battle_id = entry.battle_id
             AND earlier.sequence < entry.sequence
             AND earlier.status IN ('queued', 'generating')
        )
      ORDER BY outbox.created_at, outbox.outbox_id
      LIMIT $1`,
    [Math.max(1, Math.min(100, Math.trunc(limit)))],
  );
  let delivered = 0;
  let failed = 0;
  for (const row of pending.rows) {
    await query(
      `UPDATE battle_narration_outbox
          SET delivery_attempts = delivery_attempts + 1
        WHERE outbox_id = $1 AND status = 'pending'`,
      [row.outbox_id],
    );
    try {
      await dispatcher({
        outboxId: row.outbox_id,
        battleId: row.battle_id,
        receiptId: row.receipt_id,
        deliveryGeneration: Number(row.delivery_generation),
      });
      const marked = await query(
        `UPDATE battle_narration_outbox
            SET status = 'dispatched', dispatched_at = $2
          WHERE outbox_id = $1 AND status = 'pending'`,
        [row.outbox_id, new Date().toISOString()],
      );
      if (marked.rowCount === 1) delivered += 1;
    } catch {
      failed += 1;
    }
  }
  return { delivered, failed };
}

export async function nextNarrationBattleId(): Promise<string | null> {
  const result = await query<{ battle_id: string }>(
    `SELECT battle_id
       FROM battle_narration_entries entry
      WHERE status IN ('queued', 'generating')
        AND NOT EXISTS (
          SELECT 1 FROM battle_narration_entries earlier
           WHERE earlier.battle_id = entry.battle_id
             AND earlier.sequence < entry.sequence
             AND earlier.status IN ('queued', 'generating')
        )
      ORDER BY updated_at, battle_id
      LIMIT 1`,
  );
  return result.rows[0]?.battle_id ?? null;
}

export async function processNextNarrationAcrossBattles(input: {
  ownerId: string;
  generator: NarrationGenerator;
  leaseMs?: number;
}): Promise<"idle" | "acknowledged" | "deferred" | "completed" | "retry_queued" | "failed"> {
  const battleId = await nextNarrationBattleId();
  if (!battleId) return "idle";
  return processNextNarration({ ...input, battleId });
}

export async function pruneNarrationOperationalHistory(now = new Date()): Promise<{
  publicEvents: number;
  attempts: number;
}> {
  const publicCutoff = new Date(
    now.getTime() - NARRATION_PUBLIC_EVENT_RETENTION_DAYS * 86_400_000,
  ).toISOString();
  const attemptCutoff = new Date(
    now.getTime() - NARRATION_ATTEMPT_RETENTION_DAYS * 86_400_000,
  ).toISOString();
  return withTransaction(async (connection) => {
    await connection.query(
      `INSERT INTO battle_narration_retention
        (battle_id, pruned_through_sequence, updated_at)
       SELECT battle_id, MAX(event_sequence), $2
         FROM battle_narration_events
        WHERE created_at < $1
        GROUP BY battle_id
       ON CONFLICT (battle_id) DO UPDATE
         SET pruned_through_sequence = CASE
               WHEN EXCLUDED.pruned_through_sequence > battle_narration_retention.pruned_through_sequence
               THEN EXCLUDED.pruned_through_sequence
               ELSE battle_narration_retention.pruned_through_sequence
             END,
             updated_at = EXCLUDED.updated_at`,
      [publicCutoff, now.toISOString()],
    );
    const publicEvents = await connection.query(
      `DELETE FROM battle_narration_events WHERE created_at < $1`,
      [publicCutoff],
    );
    const attempts = await connection.query(
      `DELETE FROM battle_narration_attempts
        WHERE finished_at IS NOT NULL AND finished_at < $1`,
      [attemptCutoff],
    );
    return {
      publicEvents: publicEvents.rowCount,
      attempts: attempts.rowCount,
    };
  });
}

export async function listNarrationEvents(battleId: string): Promise<Array<{
  eventId: string;
  sequence: number;
  kind: string;
  payload: unknown;
}>> {
  const result = await query<{
    event_id: string;
    event_sequence: number;
    kind: string;
    public_payload_json: unknown;
  }>(
    `SELECT event_id, event_sequence, kind, public_payload_json
       FROM battle_narration_events
      WHERE battle_id = $1 ORDER BY event_sequence`,
    [battleId],
  );
  return result.rows.map((row) => ({
    eventId: row.event_id,
    sequence: Number(row.event_sequence),
    kind: row.kind,
    payload: typeof row.public_payload_json === "string"
      ? JSON.parse(row.public_payload_json)
      : row.public_payload_json,
  }));
}

function encodeCursor(sequence: number): string {
  return Buffer.from(`battle-narration-event:${sequence}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): number | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^battle-narration-event:(\d+)$/.exec(decoded);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function publicEntry(row: {
  receipt_id: string;
  sequence: number;
  phase: BattleNarrationEntryPublic["phase"];
  combat_turn: number | null;
  status: BattleNarrationEntryPublic["status"];
  terminal_narrative_json: unknown | null;
}): BattleNarrationEntryPublic {
  const terminal = row.terminal_narrative_json === null
    ? null
    : NarrativeBlockSchema.parse(typeof row.terminal_narrative_json === "string"
      ? JSON.parse(row.terminal_narrative_json)
      : row.terminal_narrative_json);
  return {
    turnReceiptId: row.receipt_id,
    sequence: Number(row.sequence),
    phase: row.phase,
    combatTurn: row.combat_turn === null ? null : Number(row.combat_turn),
    status: row.status,
    narrative: terminal,
  };
}

export async function getBattleNarrationSnapshot(
  battleId: string,
): Promise<BattleNarrationSnapshot> {
  return withTransaction(async (connection) => {
    const highWatermark = await connection.query<{ event_sequence: number | null }>(
      `SELECT MAX(event_sequence) AS event_sequence FROM (
         SELECT event_sequence FROM battle_narration_events WHERE battle_id = $1
         UNION ALL
         SELECT pruned_through_sequence AS event_sequence
           FROM battle_narration_retention WHERE battle_id = $1
       ) watermark`,
      [battleId],
    );
    const sequence = highWatermark.rows[0]?.event_sequence;
    const entries = await connection.query<{
      receipt_id: string;
      sequence: number;
      phase: BattleNarrationEntryPublic["phase"];
      combat_turn: number | null;
      status: BattleNarrationEntryPublic["status"];
      terminal_narrative_json: unknown | null;
    }>(
      `SELECT receipt_id, sequence, phase, combat_turn, status,
              terminal_narrative_json
         FROM battle_narration_entries
        WHERE battle_id = $1 ORDER BY sequence`,
      [battleId],
    );
    return {
      battleId,
      entries: entries.rows.map(publicEntry),
      cursor: sequence === null || sequence === undefined
        ? null
        : encodeCursor(Number(sequence)),
      reset: true,
    };
  });
}

export async function readBattleNarrationEvents(input: {
  battleId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ events: BattleNarrationFollowEvent[]; cursor: string | null }> {
  const after = decodeCursor(input.cursor);
  if (input.cursor && after === null) throw new Error("NARRATION_CURSOR_INVALID");
  if (after !== null) {
    const retained = await query<{
      minimum_sequence: number | null;
      pruned_through_sequence: number | null;
    }>(
      `SELECT
        (SELECT MIN(event_sequence) FROM battle_narration_events
          WHERE battle_id = $1) AS minimum_sequence,
        (SELECT pruned_through_sequence FROM battle_narration_retention
          WHERE battle_id = $1) AS pruned_through_sequence`,
      [input.battleId],
    );
    const minimum = retained.rows[0]?.minimum_sequence;
    const prunedThrough = Number(retained.rows[0]?.pruned_through_sequence ?? 0);
    if (after < prunedThrough ||
        (minimum !== null && minimum !== undefined && after < Number(minimum) - 1)) {
      const snapshot = await getBattleNarrationSnapshot(input.battleId);
      return {
        events: [{
          eventId: `reset:${snapshot.cursor ?? "empty"}`,
          cursor: snapshot.cursor,
          type: "reset",
          snapshot,
        }],
        cursor: snapshot.cursor,
      };
    }
  }
  const result = await query<{
    event_id: string;
    event_sequence: number;
    receipt_id: string;
    sequence: number;
    phase: BattleNarrationEntryPublic["phase"];
    combat_turn: number | null;
    status: BattleNarrationEntryPublic["status"];
    terminal_narrative_json: unknown | null;
  }>(
    `SELECT event.event_id, event.event_sequence, entry.receipt_id,
            entry.sequence, entry.phase, entry.combat_turn, entry.status,
            entry.terminal_narrative_json
       FROM battle_narration_events event
       JOIN battle_narration_entries entry
         ON entry.battle_id = event.battle_id
        AND entry.receipt_id = event.receipt_id
      WHERE event.battle_id = $1 AND event.event_sequence > $2
      ORDER BY event.event_sequence
      LIMIT $3`,
    [input.battleId, after ?? 0, Math.max(1, Math.min(100, input.limit ?? 50))],
  );
  const events = result.rows.map((row): BattleNarrationEventPublic => ({
    eventId: row.event_id,
    cursor: encodeCursor(Number(row.event_sequence)),
    type: "narration",
    entry: publicEntry(row),
  }));
  return {
    events,
    cursor: events.at(-1)?.cursor ?? input.cursor ?? null,
  };
}

export async function waitForBattleNarrationEvents(input: {
  battleId: string;
  cursor?: string | null;
  waitMs?: number;
  pollMs?: number;
}): Promise<{ events: BattleNarrationFollowEvent[]; cursor: string | null }> {
  const deadline = Date.now() + Math.max(0, Math.min(input.waitMs ?? 10_000, 15_000));
  const pollMs = Math.max(50, Math.min(input.pollMs ?? 250, 1_000));
  while (true) {
    const replay = await readBattleNarrationEvents(input);
    if (replay.events.length > 0 || Date.now() >= deadline) return replay;
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
}
