// R: Reserve one narrator physical dispatch under its live receipt capability without taking the world lease.
import { AwarenessPipelineStateSchema, type AwarenessReservation } from "@kshiai/shared";
import { z } from "zod";
import { databaseKind, withTransaction, type DatabaseConnection } from "../db.js";
import { getBattleOperationalRuntimeInTransaction, writeUnifiedOperationalBudget } from "./battle-operational-runtime.js";
import { budgetSnapshot, validateReservationAdmission } from "./awareness-reservation-budget.js";
export interface NarrationReservationInput {
  battleId: string;
  ownerId: string;
  fencingToken: number;
  attemptId: string;
  receiptIds: readonly string[];
  now: string;
  requestDigest: string;
  pricingRevision: string;
  maximumUsd: number | null;
}
export async function reserveNarrationAttempt(input: NarrationReservationInput): Promise<void> {
  await withTransaction(connection => reserveNarrationAttemptInTransaction(connection, input));
}
export async function reserveNarrationAttemptInTransaction(connection: DatabaseConnection, input: NarrationReservationInput, dialect: "postgres" | "sqlite" = databaseKind()): Promise<void> {
  if (!input.ownerId.trim() || !input.requestDigest.trim() || !input.pricingRevision.trim() ||
    !Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1 || !Number.isFinite(Date.parse(input.now)) ||
    input.receiptIds.length === 0 || new Set(input.receiptIds).size !== input.receiptIds.length ||
    input.receiptIds.some(id => !id.trim()) ||
    (input.maximumUsd !== null && (!Number.isFinite(input.maximumUsd) || input.maximumUsd < 0))) {
    throw new Error("AWARENESS_NARRATION_RESERVATION_INVALID");
  }
  // Runtime precedes the narrator lease/batch/entry locks, matching failure accounting.
  if (dialect === "postgres") {
    await getBattleOperationalRuntimeInTransaction(connection, input.battleId, { lock: true });
  }
  const current = await getBattleOperationalRuntimeInTransaction(connection, input.battleId);
  if (!current) {
    throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
  }
  const lease = await connection.query(`SELECT 1 FROM battle_narration_leases WHERE battle_id=$1 AND owner_id=$2 AND fencing_token=$3 AND expires_at>$4${dialect === "postgres" ? " FOR UPDATE" : ""}`, [input.battleId, input.ownerId, input.fencingToken, input.now]);
  if (lease.rowCount !== 1) {
    throw new Error("NARRATION_STALE_FENCE");
  }
  const batch = await connection.query<{
    receipt_ids_json: string;
    deadline_at: string;
    reservation_id: string | null;
  }>(`SELECT receipt_ids_json,deadline_at,reservation_id FROM battle_awareness_narration_batches
      WHERE battle_id=$1 AND attempt_id=$2 AND fencing_token=$3 AND status='claimed'${dialect === "postgres" ? " FOR UPDATE" : ""}`, [input.battleId, input.attemptId, input.fencingToken]);
  const row = batch.rows[0];
  if (!row || row.reservation_id !== null || !Number.isFinite(Date.parse(row.deadline_at)) || Date.parse(input.now) >= Date.parse(row.deadline_at)) {
    throw new Error("AWARENESS_NARRATION_CAPABILITY_INVALID");
  }
  const logicalAttempt = await connection.query("SELECT 1 FROM battle_narration_attempts WHERE battle_id=$1 AND attempt_id=$2 AND fencing_token=$3 AND status='generating'", [input.battleId, input.attemptId, input.fencingToken]);
  if (logicalAttempt.rowCount !== 1) {
    throw new Error("AWARENESS_NARRATION_CAPABILITY_INVALID");
  }
  const receipts = z.array(z.string().min(1)).parse(JSON.parse(row.receipt_ids_json));
  if (receipts.length !== input.receiptIds.length || receipts.some((id, index) => id !== input.receiptIds[index])) {
    throw new Error("AWARENESS_NARRATION_CAPABILITY_INVALID");
  }
  const linked = await connection.query<{ receipt_id: string }>(`SELECT receipt_id FROM battle_narration_entries WHERE battle_id=$1 AND active_attempt_id=$2 AND status='generating'${dialect === "postgres" ? " FOR UPDATE" : ""}`, [input.battleId, input.attemptId]);
  if (linked.rows.length !== receipts.length || linked.rows.some(entry => !receipts.includes(entry.receipt_id))) {
    throw new Error("AWARENESS_NARRATION_CAPABILITY_INVALID");
  }
  const attempt: Pick<AwarenessReservation, "id" | "role" | "maximumUsd"> = {
    id: input.attemptId, role: "narration", maximumUsd: input.maximumUsd,
  };
  validateReservationAdmission(current.runtime, input, attempt);
  const reservations: AwarenessReservation[] = [...current.runtime.budget.reservations, {
    ...attempt, status: "reserved", actualUsd: null, physicalOutstanding: true,
  }];
  if (!await writeUnifiedOperationalBudget(connection, input.battleId, current.revision, reservations, input.now)) {
    // The historical full snapshot is required only for its own storage schema.
    const historical = await connection.query<{ runtime_json: string }>("SELECT runtime_json FROM battle_awareness_runtime WHERE battle_id=$1", [input.battleId]);
    const stored = AwarenessPipelineStateSchema.parse(JSON.parse(historical.rows[0]!.runtime_json));
    const updated = await connection.query(`UPDATE battle_awareness_runtime SET revision=revision+1,runtime_json=$3,updated_at=$4
      WHERE battle_id=$1 AND revision=$2`, [input.battleId, current.revision, JSON.stringify(AwarenessPipelineStateSchema.parse({ ...stored, budget: budgetSnapshot(reservations) })), input.now]);
    if (updated.rowCount !== 1) throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
  }
  const marked = await connection.query(`UPDATE battle_awareness_narration_batches SET reservation_id=$2,request_digest=$3,
    pricing_revision=$4,maximum_usd=$5,status='generating',updated_at=$6 WHERE battle_id=$1 AND attempt_id=$2
    AND fencing_token=$7 AND status='claimed' AND reservation_id IS NULL`, [input.battleId, input.attemptId, input.requestDigest, input.pricingRevision, input.maximumUsd, input.now, input.fencingToken]);
  if (marked.rowCount !== 1) {
    throw new Error("AWARENESS_NARRATION_CAPABILITY_INVALID");
  }
}
