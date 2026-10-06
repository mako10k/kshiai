// R: Read worker battle state and close durable narration entries, fences, and budget reservations.
import { BattleStateSchema } from "@kshiai/shared";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import { getAwarenessRuntimeInTransaction, settleAwarenessAttemptInTransaction } from "../repositories/battle-awareness.js";
import type { Entry, AwarenessNarrationWorkerInput, AwarenessNarrationWorkerLeasePort } from "./awareness-narration-worker-contract.js";
export async function readBattle(battleId: string) {
  const result = await query<{ state_json: unknown }>("SELECT state_json FROM battles WHERE id = $1", [battleId]);
  const row = result.rows[0];
  return row ? BattleStateSchema.parse(typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json) : null;
}
export async function failEntries(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, entries: readonly Entry[], reason: string, now: string, ports: AwarenessNarrationWorkerLeasePort): Promise<void> {
  const activeIds = new Set(entries.flatMap((entry) => entry.active_attempt_id ? [entry.active_attempt_id] : []));
  if (activeIds.size) {
    const snapshot = await getAwarenessRuntimeInTransaction(connection, input.battleId, { lock: true });
    for (const reservation of snapshot?.runtime.budget.reservations ?? []) {
      if (activeIds.has(reservation.id) && reservation.status !== "settled") await settleAwarenessAttemptInTransaction(connection, {
        battleId: input.battleId, id: reservation.id, finishedAt: Date.parse(now),
        outcome: "unknown", actualUsd: null, physicalOutstanding: reservation.physicalOutstanding,
      });
    }
  }
  for (const entry of entries) {
    const updated = await connection.query(
      `UPDATE battle_narration_entries SET status = 'failed', terminal_narrative_json = NULL,
        fallback_reason = $3, updated_at = $4 WHERE battle_id = $1 AND receipt_id = $2
        AND status IN ('queued', 'generating')`, [input.battleId, entry.receipt_id, reason, now],
    );
    if (updated.rowCount === 1) await ports.appendEvent(connection, { battleId: input.battleId, receiptId: entry.receipt_id,
      sequence: Number(entry.sequence), phase: entry.phase, combatTurn: entry.combat_turn, status: "failed", fallbackReason: reason, now });
    await connection.query("UPDATE battle_narration_outbox SET status = 'completed' WHERE battle_id = $1 AND receipt_id = $2", [input.battleId, entry.receipt_id]);
  }
}
export async function requireFence(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, fence: number, now: string): Promise<boolean> {
  return (await connection.query(`SELECT 1 FROM battle_narration_leases WHERE battle_id = $1
    AND owner_id = $2 AND fencing_token = $3 AND expires_at > $4`, [input.battleId, input.ownerId, fence, now])).rowCount === 1;
}
export async function requeueInputOutbox(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput): Promise<void> {
  if (!input.outboxId || input.deliveryGeneration === undefined) return;
  await connection.query(`UPDATE battle_narration_outbox
    SET status='pending',dispatched_at=NULL,delivery_generation=delivery_generation+1
    WHERE outbox_id=$1 AND battle_id=$2 AND status='dispatched' AND delivery_generation=$3`,
    [input.outboxId, input.battleId, input.deliveryGeneration]);
}
export async function closeReservation(battleId: string, attemptId: string, finishedAt: number, physicalFinished: boolean, sent: boolean): Promise<void> {
  await withTransaction(async (connection) => {
    const snapshot = await getAwarenessRuntimeInTransaction(connection, battleId, { lock: true });
    if (!snapshot) return;
    const reservation = snapshot.runtime.budget.reservations.find((item) => item.id === attemptId);
    if (!reservation || reservation.status === "settled") return;
    await settleAwarenessAttemptInTransaction(connection, { battleId, id: attemptId, finishedAt,
      outcome: sent ? "unknown" : "settled", actualUsd: sent ? null : 0,
      physicalOutstanding: reservation.physicalOutstanding && !physicalFinished && sent });
  });
}
