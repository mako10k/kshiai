import { query, withTransaction, type DatabaseConnection } from "../db.js";

export type AuthoringFamily = "character" | "battlefield" | "narration_style";

export type AuthoringExecutionFence = {
  workerId: string;
  fencingToken: number;
};

export type AuthoringOutboxDelivery = {
  outboxId: string;
  family: AuthoringFamily;
  attemptId: string;
  deliveryGeneration: number;
};

export const AUTHORING_JOB_CLAIM_MS = 180_000;
export const AUTHORING_OUTBOX_STALE_MS = 5 * 60_000;

const FAMILY = {
  character: {
    table: "character_authoring_jobs",
    assetColumn: "character_id",
  },
  battlefield: {
    table: "battlefield_authoring_jobs",
    assetColumn: "battlefield_id",
  },
  narration_style: {
    table: "narration_style_authoring_jobs",
    assetColumn: "narration_style_id",
  },
} as const;

function authoringOutboxId(family: AuthoringFamily, attemptId: string): string {
  return `authoring-outbox:${family}:${attemptId}`;
}

async function lockEnvironmentAuthoringScheduler(
  connection: DatabaseConnection,
): Promise<void> {
  const locked = await connection.query(
    `UPDATE asset_authoring_scheduler
        SET lock_version = lock_version
      WHERE scheduler_id = 'environment-global'`,
  );
  if (locked.rowCount !== 1) throw new Error("AUTHORING_SCHEDULER_MISSING");
}

async function insertAuthoringOutbox(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  attemptId: string,
  createdAt: string,
): Promise<void> {
  await connection.query(
    `INSERT INTO asset_authoring_outbox
      (outbox_id, family, attempt_id, status, created_at)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (family, attempt_id) DO NOTHING`,
    [authoringOutboxId(family, attemptId), family, attemptId, createdAt],
  );
}

async function rearmAuthoringOutbox(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  attemptId: string,
  updatedAt: string,
): Promise<void> {
  await connection.query(
    `INSERT INTO asset_authoring_outbox
      (outbox_id, family, attempt_id, status, created_at)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (family, attempt_id) DO UPDATE
       SET status = 'pending', dispatched_at = NULL,
           delivery_generation = asset_authoring_outbox.delivery_generation + 1`,
    [authoringOutboxId(family, attemptId), family, attemptId, updatedAt],
  );
}

export async function insertFamilyAuthoringJob(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  input: {
    attemptId: string;
    ownerUserId: string;
    assetId: string;
    createdAt: string;
  },
): Promise<void> {
  const spec = FAMILY[family];
  await connection.query(
    `INSERT INTO ${spec.table}
      (attempt_id, owner_user_id, ${spec.assetColumn}, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $4)`,
    [input.attemptId, input.ownerUserId, input.assetId, input.createdAt],
  );
  await insertAuthoringOutbox(
    connection,
    family,
    input.attemptId,
    input.createdAt,
  );
}

export async function reopenFamilyAuthoringJob(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  input: {
    attemptId: string;
    ownerUserId: string;
    assetId: string;
    updatedAt: string;
  },
): Promise<void> {
  const spec = FAMILY[family];
  const reset = await connection.query(
    `UPDATE ${spec.table}
        SET status = 'pending', claimed_by = NULL, claimed_until = NULL,
            updated_at = $2
      WHERE attempt_id = $1 AND status IN ('completed', 'cancelled')`,
    [input.attemptId, input.updatedAt],
  );
  if (reset.rowCount !== 1) {
    await connection.query(
      `INSERT INTO ${spec.table}
        (attempt_id, owner_user_id, ${spec.assetColumn}, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $4)
       ON CONFLICT (attempt_id) DO NOTHING`,
      [input.attemptId, input.ownerUserId, input.assetId, input.updatedAt],
    );
  }
  await rearmAuthoringOutbox(connection, family, input.attemptId, input.updatedAt);
}

export async function finishFamilyAuthoringJob(
  family: AuthoringFamily,
  attemptId: string,
  status: "completed" | "cancelled",
  executionFence?: AuthoringExecutionFence,
): Promise<void> {
  await withTransaction(async (connection) => {
    await finishFamilyAuthoringJobInTransaction(
      connection,
      family,
      attemptId,
      status,
      executionFence,
    );
  });
}

export async function finishFamilyAuthoringJobInTransaction(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  attemptId: string,
  status: "completed" | "cancelled",
  executionFence?: AuthoringExecutionFence,
): Promise<void> {
  const spec = FAMILY[family];
  if (executionFence) {
    await assertFamilyAuthoringFence(
      connection,
      family,
      attemptId,
      executionFence,
    );
  }
  const completed = await connection.query(
    `UPDATE ${spec.table}
        SET status = $2, claimed_by = NULL, claimed_until = NULL, updated_at = $3
      WHERE attempt_id = $1 AND status IN ('pending', 'claimed')`,
    [attemptId, status, new Date().toISOString()],
  );
  if (executionFence && completed.rowCount !== 1) {
    throw new Error("AUTHORING_STALE_FENCE");
  }
  await connection.query(
    `UPDATE asset_authoring_outbox
        SET status = 'completed'
      WHERE family = $1 AND attempt_id = $2`,
    [family, attemptId],
  );
}

export async function assertFamilyAuthoringFence(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  attemptId: string,
  executionFence: AuthoringExecutionFence,
  now = new Date().toISOString(),
): Promise<void> {
  const spec = FAMILY[family];
  const held = await connection.query(
    `UPDATE ${spec.table}
        SET updated_at = updated_at
      WHERE attempt_id = $1 AND status = 'claimed'
        AND claimed_by = $2 AND fencing_token = $3
        AND claimed_until IS NOT NULL AND claimed_until > $4`,
    [
      attemptId,
      executionFence.workerId,
      executionFence.fencingToken,
      now,
    ],
  );
  if (held.rowCount !== 1) throw new Error("AUTHORING_STALE_FENCE");
}

export async function assertFamilyAuthoringJobDiscardable(
  connection: DatabaseConnection,
  family: AuthoringFamily,
  attemptId: string,
): Promise<void> {
  await lockEnvironmentAuthoringScheduler(connection);
  const spec = FAMILY[family];
  const result = await connection.query<{ status: string }>(
    `SELECT status FROM ${spec.table} WHERE attempt_id = $1`,
    [attemptId],
  );
  if (result.rows[0]?.status === "claimed") {
    throw new Error("AUTHORING_JOB_CLAIMED");
  }
}

export async function renewFamilyAuthoringFence(
  family: AuthoringFamily,
  attemptId: string,
  executionFence: AuthoringExecutionFence,
  now = new Date(),
): Promise<void> {
  const spec = FAMILY[family];
  const nowIso = now.toISOString();
  const renewed = await query(
    `UPDATE ${spec.table}
        SET claimed_until = $4, updated_at = $5
      WHERE attempt_id = $1 AND status = 'claimed'
        AND claimed_by = $2 AND fencing_token = $3
        AND claimed_until IS NOT NULL AND claimed_until > $5`,
    [
      attemptId,
      executionFence.workerId,
      executionFence.fencingToken,
      new Date(now.getTime() + AUTHORING_JOB_CLAIM_MS).toISOString(),
      nowIso,
    ],
  );
  if (renewed.rowCount !== 1) throw new Error("AUTHORING_STALE_FENCE");
}

export async function recoverExpiredFamilyAuthoringJobs(
  now = new Date().toISOString(),
): Promise<void> {
  for (const spec of Object.values(FAMILY)) {
    await query(
      `UPDATE ${spec.table}
          SET status = 'pending', claimed_by = NULL, claimed_until = NULL,
              updated_at = $1
        WHERE status = 'claimed' AND claimed_until IS NOT NULL
          AND claimed_until <= $1`,
      [now],
    );
  }
}

export async function countOpenFamilyAuthoringJobs(): Promise<number> {
  let total = 0;
  for (const spec of Object.values(FAMILY)) {
    const result = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${spec.table}
        WHERE status IN ('pending', 'claimed')`,
    );
    total += Number(result.rows[0]?.count ?? 0);
  }
  return total;
}

export async function claimNextFamilyAuthoringJob(input: {
  workerId: string;
  cap?: number;
  now?: Date;
}): Promise<{
  family: AuthoringFamily;
  attemptId: string;
  ownerUserId: string;
  assetId: string;
  executionFence: AuthoringExecutionFence;
} | null> {
  const cap = input.cap ?? 1;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const claimedUntil = new Date(now.getTime() + AUTHORING_JOB_CLAIM_MS).toISOString();
  await recoverExpiredFamilyAuthoringJobs(nowIso);
  return withTransaction(async (connection) => {
    await lockEnvironmentAuthoringScheduler(connection);
    let running = 0;
    for (const spec of Object.values(FAMILY)) {
      const count = await connection.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${spec.table} WHERE status = 'claimed'`,
      );
      running += Number(count.rows[0]?.count ?? 0);
    }
    if (running >= cap) return null;
    const pending = await connection.query<{
      family: AuthoringFamily;
      attempt_id: string;
      owner_user_id: string;
      asset_id: string;
    }>(
      `SELECT family, attempt_id, owner_user_id, asset_id FROM (
          SELECT 'character' AS family, attempt_id, owner_user_id,
                 character_id AS asset_id, created_at
            FROM character_authoring_jobs WHERE status = 'pending'
          UNION ALL
          SELECT 'battlefield', attempt_id, owner_user_id, battlefield_id, created_at
            FROM battlefield_authoring_jobs WHERE status = 'pending'
          UNION ALL
          SELECT 'narration_style', attempt_id, owner_user_id,
                 narration_style_id, created_at
            FROM narration_style_authoring_jobs WHERE status = 'pending'
        ) pending_jobs
        ORDER BY created_at ASC
        LIMIT 8`,
    );
    for (const row of pending.rows) {
      const spec = FAMILY[row.family];
      const sibling = await connection.query(
        `SELECT 1 FROM ${spec.table}
          WHERE ${spec.assetColumn} = $1 AND status = 'claimed' LIMIT 1`,
        [row.asset_id],
      );
      if (sibling.rowCount) continue;
      const claimed = await connection.query<{ fencing_token: number }>(
        `UPDATE ${spec.table}
            SET status = 'claimed', claimed_by = $2, claimed_until = $3,
                fencing_token = fencing_token + 1, updated_at = $4
          WHERE attempt_id = $1 AND status = 'pending'
          RETURNING fencing_token`,
        [row.attempt_id, input.workerId, claimedUntil, nowIso],
      );
      if (claimed.rowCount === 1) {
        const fencingToken = claimed.rows[0]?.fencing_token;
        if (fencingToken === undefined) throw new Error("AUTHORING_FENCE_MISSING");
        return {
          family: row.family,
          attemptId: row.attempt_id,
          ownerUserId: row.owner_user_id,
          assetId: row.asset_id,
          executionFence: {
            workerId: input.workerId,
            fencingToken: Number(fencingToken),
          },
        };
      }
    }
    return null;
  });
}

export type ExactAuthoringJobClaim = {
  family: AuthoringFamily;
  attemptId: string;
  ownerUserId: string;
  assetId: string;
  executionFence: AuthoringExecutionFence;
};

export async function claimFamilyAuthoringJob(input: {
  family: AuthoringFamily;
  attemptId: string;
  workerId: string;
  cap?: number;
  now?: Date;
}): Promise<"busy" | "terminal" | ExactAuthoringJobClaim> {
  const cap = input.cap ?? 1;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const claimedUntil = new Date(now.getTime() + AUTHORING_JOB_CLAIM_MS).toISOString();
  await recoverExpiredFamilyAuthoringJobs(nowIso);
  return withTransaction(async (connection) => {
    await lockEnvironmentAuthoringScheduler(connection);
    const spec = FAMILY[input.family];
    const target = await connection.query<{
      status: string;
      owner_user_id: string;
      asset_id: string;
    }>(
      `SELECT status, owner_user_id, ${spec.assetColumn} AS asset_id
         FROM ${spec.table}
        WHERE attempt_id = $1`,
      [input.attemptId],
    );
    const row = target.rows[0];
    if (!row || row.status === "completed" || row.status === "cancelled") {
      return "terminal" as const;
    }
    if (row.status === "claimed") return "busy" as const;

    let running = 0;
    for (const familySpec of Object.values(FAMILY)) {
      const count = await connection.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${familySpec.table} WHERE status = 'claimed'`,
      );
      running += Number(count.rows[0]?.count ?? 0);
    }
    if (running >= cap) return "busy" as const;
    const sibling = await connection.query(
      `SELECT 1 FROM ${spec.table}
        WHERE ${spec.assetColumn} = $1 AND status = 'claimed' LIMIT 1`,
      [row.asset_id],
    );
    if (sibling.rowCount > 0) return "busy" as const;
    const claimed = await connection.query<{ fencing_token: number }>(
      `UPDATE ${spec.table}
          SET status = 'claimed', claimed_by = $2, claimed_until = $3,
              fencing_token = fencing_token + 1, updated_at = $4
        WHERE attempt_id = $1 AND status = 'pending'
        RETURNING fencing_token`,
      [input.attemptId, input.workerId, claimedUntil, nowIso],
    );
    const fencingToken = claimed.rows[0]?.fencing_token;
    if (fencingToken === undefined) return "busy" as const;
    return {
      family: input.family,
      attemptId: input.attemptId,
      ownerUserId: row.owner_user_id,
      assetId: row.asset_id,
      executionFence: {
        workerId: input.workerId,
        fencingToken: Number(fencingToken),
      },
    };
  });
}

export async function getAuthoringOutboxDelivery(input: {
  outboxId: string;
  family: AuthoringFamily;
  attemptId: string;
  deliveryGeneration: number;
}): Promise<"active" | "acknowledged"> {
  const result = await query<{
    status: string;
    delivery_generation: number;
  }>(
    `SELECT status, delivery_generation
       FROM asset_authoring_outbox
      WHERE outbox_id = $1 AND family = $2 AND attempt_id = $3`,
    [input.outboxId, input.family, input.attemptId],
  );
  const row = result.rows[0];
  if (!row || row.status === "completed" ||
      Number(row.delivery_generation) !== input.deliveryGeneration) {
    return "acknowledged";
  }
  return "active";
}

export async function deferAuthoringOutboxDelivery(input: {
  outboxId: string;
  deliveryGeneration: number;
}): Promise<void> {
  await query(
    `UPDATE asset_authoring_outbox
        SET status = 'pending', dispatched_at = NULL
      WHERE outbox_id = $1 AND delivery_generation = $2
        AND status = 'dispatched'`,
    [input.outboxId, input.deliveryGeneration],
  );
}

export async function completeAuthoringOutboxDelivery(input: {
  outboxId: string;
  deliveryGeneration: number;
}): Promise<void> {
  await query(
    `UPDATE asset_authoring_outbox
        SET status = 'completed'
      WHERE outbox_id = $1 AND delivery_generation = $2`,
    [input.outboxId, input.deliveryGeneration],
  );
}

export async function recoverStaleAuthoringOutbox(
  now = new Date(),
  staleMs = AUTHORING_OUTBOX_STALE_MS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - Math.max(60_000, staleMs)).toISOString();
  let recovered = 0;
  for (const [family, spec] of Object.entries(FAMILY) as Array<
    [AuthoringFamily, (typeof FAMILY)[AuthoringFamily]]
  >) {
    const result = await query(
      `UPDATE asset_authoring_outbox
          SET status = 'pending', dispatched_at = NULL,
              delivery_generation = delivery_generation + 1
        WHERE family = $1 AND status = 'dispatched' AND dispatched_at <= $2
          AND EXISTS (
            SELECT 1 FROM ${spec.table} job
             WHERE job.attempt_id = asset_authoring_outbox.attempt_id
               AND (
                 job.status = 'pending'
                 OR (job.status = 'claimed' AND (
                   job.claimed_until IS NULL OR job.claimed_until <= $3
                 ))
               )
          )`,
      [family, cutoff, now.toISOString()],
    );
    recovered += result.rowCount;
  }
  return recovered;
}

export async function dispatchAuthoringOutbox(
  dispatcher: (delivery: AuthoringOutboxDelivery) => Promise<void>,
  limit = 20,
): Promise<{ delivered: number; failed: number }> {
  const pending = await query<{
    outbox_id: string;
    family: AuthoringFamily;
    attempt_id: string;
    delivery_generation: number;
  }>(
    `SELECT outbox_id, family, attempt_id, delivery_generation
       FROM asset_authoring_outbox
      WHERE status = 'pending'
      ORDER BY created_at, outbox_id
      LIMIT $1`,
    [Math.max(1, Math.min(100, Math.trunc(limit)))],
  );
  let delivered = 0;
  let failed = 0;
  for (const row of pending.rows) {
    await query(
      `UPDATE asset_authoring_outbox
          SET delivery_attempts = delivery_attempts + 1
        WHERE outbox_id = $1 AND status = 'pending'`,
      [row.outbox_id],
    );
    try {
      await dispatcher({
        outboxId: row.outbox_id,
        family: row.family,
        attemptId: row.attempt_id,
        deliveryGeneration: Number(row.delivery_generation),
      });
      const marked = await query(
        `UPDATE asset_authoring_outbox
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
