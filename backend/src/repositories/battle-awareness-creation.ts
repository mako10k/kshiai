import { type UnifiedConsciousnessRuntime } from "@kshiai/shared";
import { insertUnifiedRuntime } from "./unified-consciousness.js";
import { budgetSnapshot } from "./awareness-reservation-budget.js";
import { settleBattleOperationalAttemptInTransaction } from "./battle-operational-runtime.js";
// R: Reserve and adopt one immutable encounter dispatch without requiring a battle row.
import { z } from "zod";
import { AwarenessDefaultPolicy, AwarenessPolicyV1Schema, AwarenessPipelineStateSchema, AwarenessReservationSchema,
  BattleEncounterProposalSchema, type AwarenessPolicyV1, type AwarenessPipelineState, type BattleEncounterProposal } from "@kshiai/shared";
import { isDeepStrictEqual } from "node:util";
import { config } from "../config.js";
import { withTransaction, type DatabaseConnection } from "../db.js";
import type { AwarenessDispatchProof } from "../services/awareness-execution.js";
import { settleAwarenessAttemptInTransaction } from "./battle-awareness.js";

const snapshotSchema = z.object({
  battleId: z.string().min(1), requestDigest: z.string().min(1), frozenInput: z.string().min(1),
  startedAt: z.number().finite().nonnegative(), deadlineAt: z.number().finite().nonnegative(),
  policy: AwarenessPolicyV1Schema.default(AwarenessDefaultPolicy),
  status: z.enum(["prepared", "dispatched", "ready", "failed", "unknown", "adopted"]),
  dispatchedAt: z.number().finite().nonnegative().nullable(),
  proof: z.union([z.object({ mode: z.literal("certified").optional(), requestDigest: z.string().min(1), verifiedFullPrompt: z.literal(true), inputTokens: z.number().int().positive(),
    outputTokenLimit: z.number().int().positive(), maximumChargeUsd: z.number().finite().nonnegative() }).strict(),
    z.object({ mode: z.literal("observed"), requestDigest: z.string().min(1), verifiedFullPrompt: z.literal(false), inputTokens: z.null(),
      outputTokenLimit: z.number().int().positive(), maximumChargeUsd: z.null() }).strict()]).nullable(),
  reservation: AwarenessReservationSchema.nullable(), result: BattleEncounterProposalSchema.nullable(),
  failure: z.string().nullable(),
}).strict();
export type AwarenessCreationSnapshot = z.infer<typeof snapshotSchema>;
type Row = { revision: number; snapshot_json: string };

function validObservedAdmission(proof: AwarenessDispatchProof, policy: AwarenessPolicyV1): boolean {
  return proof.mode === "observed" && policy.accountingMode === "observed" && proof.verifiedFullPrompt === false &&
    proof.inputTokens === null && proof.maximumChargeUsd === null;
}

function validCertifiedAdmission(proof: AwarenessDispatchProof, policy: AwarenessPolicyV1): boolean {
  return proof.mode !== "observed" && proof.verifiedFullPrompt && Number.isInteger(proof.inputTokens) &&
    proof.inputTokens >= 1 && proof.inputTokens <= policy.roles.adjudication.inputTokens &&
    Number.isFinite(proof.maximumChargeUsd) && proof.maximumChargeUsd >= 0 &&
    (policy.accountingMode === "observed" || proof.maximumChargeUsd <= policy.maxCostUsd * policy.budgetShares.required);
}

function validateCreationAdmission(input: { id: string; proof: AwarenessDispatchProof }, policy: AwarenessPolicyV1): void {
  const { proof } = input;
  if (!input.id.startsWith("encounter") || !proof.requestDigest || proof.outputTokenLimit !== policy.roles.adjudication.outputTokens ||
      (!validObservedAdmission(proof, policy) && !validCertifiedAdmission(proof, policy))) {
    throw new Error("AWARENESS_CREATION_ADMISSION_REJECTED");
  }
}

function validateCreationReservation(current: AwarenessCreationSnapshot, input: { requestDigest: string; now: number }): void {
  if (current.requestDigest !== input.requestDigest) throw new Error("AWARENESS_CREATION_IDENTITY_CONFLICT");
  if (current.status !== "prepared") throw new Error("AWARENESS_CREATION_ALREADY_DISPATCHED");
  if (input.now >= current.deadlineAt || input.now < current.startedAt) throw new Error("AWARENESS_CREATION_DEADLINE");
}

function readCompletion(current: { snapshot: AwarenessCreationSnapshot } | null, input: { id: string; physicalOutstanding: boolean; actualUsd: number | null }): AwarenessCreationSnapshot {
  const reservation = current?.snapshot.reservation;
  if (!current || !reservation || reservation.id !== input.id) throw new Error("AWARENESS_CREATION_ATTEMPT_MISMATCH");
  if (!reservation.physicalOutstanding && input.physicalOutstanding) throw new Error("AWARENESS_PHYSICAL_ATTEMPT_REOPENED");
  if (reservation.status === "settled" && reservation.actualUsd !== input.actualUsd) throw new Error("AWARENESS_ACCOUNTING_RECEIPT_CONFLICT");
  return current.snapshot;
}

async function settleAdoptedCreation(connection: DatabaseConnection, snapshot: AwarenessCreationSnapshot, input: Parameters<typeof completeAwarenessCreationAttempt>[0]): Promise<void> {
  if (snapshot.status !== "adopted") return;
  await settleBattleOperationalAttemptInTransaction(connection, { battleId: input.battleId, id: input.id,
    outcome: input.actualUsd === null ? "unknown" : "settled", actualUsd: input.actualUsd,
    physicalOutstanding: input.physicalOutstanding, finishedAt: input.finishedAt });
}

function validateCreationCompletion(input: { finishedAt: number; actualUsd: number | null; physicalOutstanding: boolean }): void {
  if (!Number.isFinite(input.finishedAt) || input.finishedAt < 0 ||
      (input.actualUsd !== null && (!Number.isFinite(input.actualUsd) || input.actualUsd < 0 || input.physicalOutstanding))) {
    throw new Error("AWARENESS_ACCOUNTING_RECEIPT_INVALID");
  }
}

function completionStatus(current: AwarenessCreationSnapshot, result: BattleEncounterProposal | null, input: { failure?: string; finishedAt: number }): AwarenessCreationSnapshot["status"] {
  if (current.status === "adopted" || current.status === "ready" || current.status === "failed") return current.status;
  const applicable = current.dispatchedAt !== null && input.finishedAt >= current.dispatchedAt &&
    input.finishedAt < Math.min(current.deadlineAt, current.dispatchedAt + current.policy.roles.adjudication.deadlineMs);
  return result && applicable && !input.failure ? "ready" : input.failure || !applicable ? "failed" : "unknown";
}

function completionFailure(current: AwarenessCreationSnapshot, input: { failure?: string; finishedAt: number }): string | null {
  if (current.failure || input.failure) return current.failure ?? input.failure ?? null;
  if (current.dispatchedAt === null || input.finishedAt < current.dispatchedAt ||
      input.finishedAt >= Math.min(current.deadlineAt, current.dispatchedAt + current.policy.roles.adjudication.deadlineMs)) return "creation_deadline";
  return null;
}

function validateAdoption(current: AwarenessCreationSnapshot, input: { requestDigest: string; runtime: Pick<AwarenessPipelineState, "policy" | "budget">; now: number }): void {
  if (current.requestDigest !== input.requestDigest || current.status !== "ready" || !current.result || !current.reservation || input.now >= current.deadlineAt) {
    throw new Error(current.requestDigest !== input.requestDigest ? "AWARENESS_CREATION_IDENTITY_CONFLICT" : "AWARENESS_CREATION_NOT_ADOPTABLE");
  }
  if (input.runtime.budget.reservations.length !== 0) throw new Error("AWARENESS_CREATION_BOOTSTRAP_NOT_EMPTY");
  if (!isDeepStrictEqual(input.runtime.policy, current.policy)) throw new Error("AWARENESS_CREATION_POLICY_MISMATCH");
  const reservation = current.reservation;
  if (current.policy.accountingMode !== "observed" && (reservation.actualUsd ?? reservation.maximumUsd ?? Infinity) > current.policy.maxCostUsd * current.policy.budgetShares.required) {
    throw new Error("AWARENESS_CREATION_BUDGET_EXCEEDED");
  }
}

function bootstrapRuntime(current: AwarenessCreationSnapshot, runtime: AwarenessPipelineState, now: number): AwarenessPipelineState {
  const reservation = current.reservation;
  if (!reservation) throw new Error("AWARENESS_CREATION_NOT_ADOPTABLE");
  return AwarenessPipelineStateSchema.parse({ ...runtime, startedAt: current.startedAt, deadlineAt: current.deadlineAt,
    budget: { physicalAttempts: 1, physicalOutstanding: reservation.physicalOutstanding ? 1 : 0,
      reservedUsd: reservation.status === "settled" ? 0 : reservation.maximumUsd ?? 0,
      settledUsd: reservation.status === "settled" ? reservation.actualUsd ?? 0 : 0,
      unknownAttemptIds: reservation.status === "unknown" || reservation.status === "cancelled" ||
        (reservation.status !== "settled" && reservation.maximumUsd === null) ? [reservation.id] : [], reservations: [reservation] } });
}

async function read(connection: DatabaseConnection, battleId: string) {
  const found = await connection.query<Row>(`SELECT revision,snapshot_json FROM battle_awareness_creation
    WHERE battle_id=$1${config.databaseUrl ? " FOR UPDATE" : ""}`, [battleId]);
  return found.rows[0] ? { revision: Number(found.rows[0].revision), snapshot: snapshotSchema.parse(JSON.parse(found.rows[0].snapshot_json)) } : null;
}
async function write(connection: DatabaseConnection, revision: number, snapshot: AwarenessCreationSnapshot, now: number) {
  const valid = snapshotSchema.parse(snapshot);
  const saved = await connection.query(`UPDATE battle_awareness_creation SET revision=revision+1,snapshot_json=$3,updated_at=$4
    WHERE battle_id=$1 AND revision=$2`, [valid.battleId, revision, JSON.stringify(valid), new Date(now).toISOString()]);
  if (saved.rowCount !== 1) throw new Error("AWARENESS_CREATION_CAS_CONFLICT");
  return valid;
}

/** Existing dispatched/unknown receipts are returned for inspection, never authorized to resend. */
export async function claimAwarenessCreation(input: { battleId: string; requestDigest: string; frozenInput: string; now: number; policy?: AwarenessPolicyV1 }): Promise<AwarenessCreationSnapshot> {
  const policy = AwarenessPolicyV1Schema.parse(input.policy ?? AwarenessDefaultPolicy);
  const snapshot = snapshotSchema.parse({ battleId: input.battleId, requestDigest: input.requestDigest, frozenInput: input.frozenInput,
    policy, startedAt: input.now, deadlineAt: input.now + policy.maxDurationMs,
    status: "prepared", dispatchedAt: null, proof: null, reservation: null, result: null, failure: null });
  return withTransaction(async (connection) => {
    await connection.query(`INSERT INTO battle_awareness_creation(battle_id,revision,request_digest,snapshot_json,updated_at)
      VALUES($1,0,$2,$3,$4) ON CONFLICT(battle_id) DO NOTHING`, [input.battleId, input.requestDigest, JSON.stringify(snapshot), new Date(input.now).toISOString()]);
    const existing = await read(connection, input.battleId);
    if (!existing || existing.snapshot.requestDigest !== input.requestDigest || existing.snapshot.frozenInput !== input.frozenInput ||
      !isDeepStrictEqual(existing.snapshot.policy, policy)) {
      throw new Error("AWARENESS_CREATION_IDENTITY_CONFLICT");
    }
    return existing.snapshot;
  });
}

/** The returned dispatched snapshot is the only authorization for this physical send. */
export async function reserveAwarenessCreationAttempt(input: { battleId: string; requestDigest: string; id: string; proof: AwarenessDispatchProof; now: number }): Promise<AwarenessCreationSnapshot> {
  return withTransaction(async (connection) => {
    const current = await read(connection, input.battleId);
    if (!current) throw new Error("AWARENESS_CREATION_IDENTITY_CONFLICT");
    const policy = current.snapshot.policy;
    validateCreationAdmission(input, policy);
    validateCreationReservation(current.snapshot, input);
    return write(connection, current.revision, { ...current.snapshot, status: "dispatched", dispatchedAt: input.now, proof: input.proof,
      reservation: { id: input.id, role: "adjudication", maximumUsd: input.proof.maximumChargeUsd,
        status: "reserved", actualUsd: null, physicalOutstanding: true } }, input.now);
  });
}

export async function completeAwarenessCreationAttempt(input: { battleId: string; id: string;
  result?: BattleEncounterProposal; failure?: string; actualUsd: number | null; physicalOutstanding: boolean; finishedAt: number }): Promise<AwarenessCreationSnapshot> {
  validateCreationCompletion(input);
  return withTransaction(async (connection) => {
    const current = await read(connection, input.battleId);
    const snapshot = readCompletion(current, input);
    const reservation = snapshot.reservation!;
    if (snapshot.result && input.result && JSON.stringify(snapshot.result) !== JSON.stringify(BattleEncounterProposalSchema.parse(input.result))) {
      throw new Error("AWARENESS_CREATION_RESULT_CONFLICT");
    }
    await settleAdoptedCreation(connection, snapshot, input);
    const outcome = input.actualUsd === null ? "unknown" : "settled";
    const result = snapshot.result ?? (input.result ? BattleEncounterProposalSchema.parse(input.result) : null);
    const status = completionStatus(snapshot, result, input);
    return write(connection, current!.revision, { ...snapshot, status, result,
      failure: completionFailure(snapshot, input), reservation: { ...reservation, status: outcome,
        actualUsd: input.actualUsd, physicalOutstanding: input.physicalOutstanding } }, input.finishedAt);
  });
}

/** Caller inserts the canonical battle in this same transaction. Bootstrap writes need no world lease. */
export async function adoptAwarenessCreationInTransaction(connection: DatabaseConnection, input: {
  battleId: string; requestDigest: string; runtime: AwarenessPipelineState; now: number;
}): Promise<AwarenessPipelineState> {
  const current = await read(connection, input.battleId);
  if (!current) throw new Error("AWARENESS_CREATION_IDENTITY_CONFLICT");
  validateAdoption(current.snapshot, input);
  const runtime = bootstrapRuntime(current.snapshot, input.runtime, input.now);
  await connection.query(`INSERT INTO battle_awareness_runtime(battle_id,revision,fencing_token,runtime_json,updated_at)
    VALUES($1,0,1,$2,$3)`, [input.battleId, JSON.stringify(runtime), new Date(input.now).toISOString()]);
  await write(connection, current.revision, { ...current.snapshot, status: "adopted" }, input.now);
  return runtime;
}

/** New unified battles adopt creation usage without storing historical psychological state. */
export async function adoptUnifiedCreationInTransaction(connection: DatabaseConnection, input: {
  battleId: string; requestDigest: string; runtime: UnifiedConsciousnessRuntime; now: number;
}): Promise<void> {
  const current = await read(connection, input.battleId);
  if (!current) throw new Error("AWARENESS_CREATION_IDENTITY_CONFLICT");
  validateAdoption(current.snapshot, { ...input, runtime: { policy: input.runtime.operatingPolicy, budget: input.runtime.budget } });
  const reservation = current.snapshot.reservation;
  if (!reservation) throw new Error("AWARENESS_CREATION_NOT_ADOPTABLE");
  await insertUnifiedRuntime(connection, input.battleId, { ...input.runtime,
    startedAt: current.snapshot.startedAt, deadlineAt: current.snapshot.startedAt + input.runtime.policy.durationMs,
    budget: budgetSnapshot([reservation]) }, new Date(input.now).toISOString());
  await write(connection, current.revision, { ...current.snapshot, status: "adopted" }, input.now);
}
