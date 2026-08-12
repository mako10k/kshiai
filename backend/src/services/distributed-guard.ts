import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { query, withTransaction } from "../db.js";

const battleLeaseMs = 10 * 60 * 1000;
const idempotencyProcessingMs = 10 * 60 * 1000;
const idempotencyRetentionMs = 24 * 60 * 60 * 1000;

export type BattleLeaseFence = {
  battleId: string;
  ownerId: string;
  fencingToken: number;
};

const battleLeaseContext = new AsyncLocalStorage<BattleLeaseFence>();

export function currentBattleLeaseFence(): BattleLeaseFence | null {
  return battleLeaseContext.getStore() ?? null;
}

export function requestDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function acquireBattleLease(
  battleId: string,
  ownerId: string,
  now = new Date(),
  durationMs = battleLeaseMs,
): Promise<boolean> {
  return (await acquireBattleLeaseFence(battleId, ownerId, now, durationMs)) !== null;
}

export async function acquireBattleLeaseFence(
  battleId: string,
  ownerId: string,
  now = new Date(),
  durationMs = battleLeaseMs,
): Promise<BattleLeaseFence | null> {
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();
  const result = await query<{ owner_id: string; fencing_token: number }>(
    `INSERT INTO battle_leases
       (battle_id, owner_id, fencing_token, acquired_at, expires_at)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (battle_id) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           fencing_token = battle_leases.fencing_token + 1,
           acquired_at = EXCLUDED.acquired_at,
           expires_at = EXCLUDED.expires_at
       WHERE battle_leases.owner_id = EXCLUDED.owner_id
          OR battle_leases.expires_at <= EXCLUDED.acquired_at
     RETURNING owner_id, fencing_token`,
    [battleId, ownerId, now.toISOString(), expiresAt],
  );
  const row = result.rows[0];
  return row?.owner_id === ownerId
    ? { battleId, ownerId, fencingToken: Number(row.fencing_token) }
    : null;
}

export async function renewBattleLease(
  battleId: string,
  ownerId: string,
  now = new Date(),
  durationMs = battleLeaseMs,
): Promise<boolean> {
  const result = await query(
    `UPDATE battle_leases
        SET expires_at = $3
      WHERE battle_id = $1 AND owner_id = $2 AND expires_at > $4`,
    [
      battleId,
      ownerId,
      new Date(now.getTime() + durationMs).toISOString(),
      now.toISOString(),
    ],
  );
  return result.rowCount === 1;
}

async function renewBattleLeaseFence(
  fence: BattleLeaseFence,
  now = new Date(),
  durationMs = battleLeaseMs,
): Promise<boolean> {
  const result = await query(
    `UPDATE battle_leases
        SET expires_at = $4
      WHERE battle_id = $1 AND owner_id = $2 AND fencing_token = $3
        AND expires_at > $5`,
    [
      fence.battleId,
      fence.ownerId,
      fence.fencingToken,
      new Date(now.getTime() + durationMs).toISOString(),
      now.toISOString(),
    ],
  );
  return result.rowCount === 1;
}

export async function releaseBattleLease(
  battleId: string,
  ownerId: string,
): Promise<void> {
  await query(
    `DELETE FROM battle_leases WHERE battle_id = $1 AND owner_id = $2`,
    [battleId, ownerId],
  );
}

export async function withBattleLease<T>(
  battleId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const ownerId = randomUUID();
  const fence = await acquireBattleLeaseFence(battleId, ownerId);
  if (!fence) {
    throw new Error("BATTLE_BUSY");
  }
  let rejectOwnershipLoss!: (error: Error) => void;
  const ownershipLoss = new Promise<never>((_resolve, reject) => {
    rejectOwnershipLoss = reject;
  });
  let lost = false;
  const heartbeat = setInterval(() => {
    void renewBattleLeaseFence(fence).then((renewed) => {
      if (!renewed && !lost) {
        lost = true;
        rejectOwnershipLoss(new Error("BATTLE_LEASE_LOST"));
      }
    }).catch((error) => {
      console.error("[battle] lease renewal failed", battleId, error);
      if (!lost) {
        lost = true;
        rejectOwnershipLoss(new Error("BATTLE_LEASE_LOST"));
      }
    });
  }, 60_000);
  heartbeat.unref();
  try {
    return await battleLeaseContext.run(
      fence,
      () => Promise.race([callback(), ownershipLoss]),
    );
  } finally {
    clearInterval(heartbeat);
    await releaseBattleLease(battleId, ownerId).catch((error) => {
      console.error("[battle] lease release failed", battleId, error);
    });
  }
}

export type IdempotencyStart =
  | { kind: "started"; ownerId: string }
  | { kind: "replay"; response: unknown }
  | { kind: "conflict" }
  | { kind: "processing" };

export async function beginIdempotentRequest(input: {
  userId: string;
  scope: string;
  key: string;
  requestHash: string;
  now?: Date;
}): Promise<IdempotencyStart> {
  const now = input.now ?? new Date();
  const ownerId = randomUUID();
  return withTransaction(async (connection) => {
    const inserted = await connection.query<{ owner_id: string }>(
      `INSERT INTO idempotency_keys
        (user_id, scope, key, request_hash, status, owner_id, response_json,
         created_at, updated_at, expires_at)
       VALUES ($1, $2, $3, $4, 'processing', $5, NULL, $6, $6, $7)
       ON CONFLICT (user_id, scope, key) DO NOTHING
       RETURNING owner_id`,
      [
        input.userId,
        input.scope,
        input.key,
        input.requestHash,
        ownerId,
        now.toISOString(),
        new Date(now.getTime() + idempotencyProcessingMs).toISOString(),
      ],
    );
    if (inserted.rowCount === 1) return { kind: "started", ownerId };

    const existing = await connection.query<{
      request_hash: string;
      status: string;
      response_json: unknown;
      expires_at: string | Date;
    }>(
      `SELECT request_hash, status, response_json, expires_at
         FROM idempotency_keys
        WHERE user_id = $1 AND scope = $2 AND key = $3`,
      [input.userId, input.scope, input.key],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== input.requestHash) return { kind: "conflict" };
    if (row.status === "completed") {
      const response = typeof row.response_json === "string"
        ? JSON.parse(row.response_json)
        : row.response_json;
      return { kind: "replay", response };
    }
    if (new Date(row.expires_at).getTime() > now.getTime()) {
      return { kind: "processing" };
    }

    const takeover = await connection.query<{ owner_id: string }>(
      `UPDATE idempotency_keys
          SET owner_id = $4, updated_at = $5, expires_at = $6
        WHERE user_id = $1 AND scope = $2 AND key = $3
          AND status = 'processing' AND expires_at <= $5
        RETURNING owner_id`,
      [
        input.userId,
        input.scope,
        input.key,
        ownerId,
        now.toISOString(),
        new Date(now.getTime() + idempotencyProcessingMs).toISOString(),
      ],
    );
    return takeover.rowCount === 1
      ? { kind: "started", ownerId }
      : { kind: "processing" };
  });
}

export async function completeIdempotentRequest(input: {
  userId: string;
  scope: string;
  key: string;
  ownerId: string;
  response: unknown;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const result = await query(
    `UPDATE idempotency_keys
        SET status = 'completed', response_json = $5, updated_at = $6,
            expires_at = $7
      WHERE user_id = $1 AND scope = $2 AND key = $3 AND owner_id = $4
        AND status = 'processing'`,
    [
      input.userId,
      input.scope,
      input.key,
      input.ownerId,
      JSON.stringify(input.response),
      now.toISOString(),
      new Date(now.getTime() + idempotencyRetentionMs).toISOString(),
    ],
  );
  if (result.rowCount !== 1) throw new Error("IDEMPOTENCY_OWNERSHIP_LOST");
}

export async function abandonIdempotentRequest(input: {
  userId: string;
  scope: string;
  key: string;
  ownerId: string;
}): Promise<void> {
  await query(
    `DELETE FROM idempotency_keys
      WHERE user_id = $1 AND scope = $2 AND key = $3 AND owner_id = $4
        AND status = 'processing'`,
    [input.userId, input.scope, input.key, input.ownerId],
  );
}
