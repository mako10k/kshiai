import { query, withTransaction, type DatabaseConnection } from "../db.js";

export type AuthoringFamily = "character" | "battlefield" | "narration_style";

export const AUTHORING_JOB_CLAIM_MS = 180_000;

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
  if (reset.rowCount === 1) return;
  await connection.query(
    `INSERT INTO ${spec.table}
      (attempt_id, owner_user_id, ${spec.assetColumn}, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $4)
     ON CONFLICT (attempt_id) DO NOTHING`,
    [input.attemptId, input.ownerUserId, input.assetId, input.updatedAt],
  );
}

export async function finishFamilyAuthoringJob(
  family: AuthoringFamily,
  attemptId: string,
  status: "completed" | "cancelled",
): Promise<void> {
  const spec = FAMILY[family];
  await query(
    `UPDATE ${spec.table}
        SET status = $2, claimed_by = NULL, claimed_until = NULL, updated_at = $3
      WHERE attempt_id = $1 AND status IN ('pending', 'claimed')`,
    [attemptId, status, new Date().toISOString()],
  );
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
} | null> {
  const cap = input.cap ?? 1;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const claimedUntil = new Date(now.getTime() + AUTHORING_JOB_CLAIM_MS).toISOString();
  await recoverExpiredFamilyAuthoringJobs(nowIso);
  return withTransaction(async (connection) => {
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
      const claimed = await connection.query(
        `UPDATE ${spec.table}
            SET status = 'claimed', claimed_by = $2, claimed_until = $3,
                updated_at = $4
          WHERE attempt_id = $1 AND status = 'pending'`,
        [row.attempt_id, input.workerId, claimedUntil, nowIso],
      );
      if (claimed.rowCount === 1) {
        return {
          family: row.family,
          attemptId: row.attempt_id,
          ownerUserId: row.owner_user_id,
          assetId: row.asset_id,
        };
      }
    }
    return null;
  });
}
