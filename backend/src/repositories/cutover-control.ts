// R: Persist and atomically fence shared-runtime cutover control and operation permits.
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  databaseKind,
  query,
  withTransaction,
  type DatabaseConnection,
} from "../db.js";

const Nonempty = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Receipt = Nonempty;
const OwnerCandidateSchema = z.object({
  attemptId: Nonempty,
  candidateDigest: Sha256,
}).strict();
export const StageAcceptanceSchema = z.object({
  health: Receipt.nullable(),
  postgres: Receipt.nullable(),
  email: Receipt.nullable(),
  google: Receipt.nullable(),
  ownership: Receipt.nullable(),
  r2: Receipt.nullable(),
  sse: Receipt.nullable(),
  directProtection: Receipt.nullable(),
}).strict();
export const TrialRequestSchema = z.object({
  bindingOperationId: Nonempty,
  kind: z.enum(["http", "task", "provider", "background"]),
  method: Nonempty.optional(),
  path: Nonempty.optional(),
  requestDigest: Sha256,
  battleId: Nonempty.optional(),
  backgroundKind: Nonempty.optional(),
  maximumReservations: z.number().int().positive(),
}).strict();
export const TrialBindingsSchema = z.object({
  generationIds: z.tuple([Nonempty, Nonempty]),
  ownerConfirmationReceiptIds: z.tuple([Receipt, Receipt]),
  cutoverReadbackReceiptId: Receipt,
  stoppedBarrierReceiptId: Receipt,
  requests: z.array(TrialRequestSchema),
}).strict();
export const CutoverControlPolicySchema = z.object({
  cutoverId: Nonempty,
  artifactId: Nonempty,
  ownerUserId: Nonempty,
  ownerCandidates: z.tuple([OwnerCandidateSchema, OwnerCandidateSchema]),
  trialBindings: TrialBindingsSchema.nullable(),
  taskBattleIds: z.array(Nonempty),
  stageAcceptance: StageAcceptanceSchema,
  productionReceipt: Receipt.nullable(),
}).strict().superRefine((value, context) => {
  const ids = value.ownerCandidates.map((candidate) => candidate.attemptId);
  if (new Set(ids).size !== 2) context.addIssue({ code: "custom", message: "owner candidates must be distinct" });
  if (value.trialBindings && new Set(value.trialBindings.generationIds).size !== 2) {
    context.addIssue({ code: "custom", message: "trial generations must be distinct" });
  }
});
export type CutoverControlPolicy = z.infer<typeof CutoverControlPolicySchema>;
export const CutoverPhaseSchema = z.enum(["closed", "trial", "open"]);
export type CutoverPhase = z.infer<typeof CutoverPhaseSchema>;
export const StageSmokeKindSchema = z.enum([
  "health", "postgres", "email", "google", "ownership", "r2", "sse", "direct-protection",
]);
export type StageSmokeKind = z.infer<typeof StageSmokeKindSchema>;
function isBoundedStageSmoke(input: ReserveInput): boolean {
  return input.kind === "background" && input.battleId === undefined &&
    input.method === "SMOKE" && typeof input.backgroundKind === "string" &&
    input.backgroundKind.startsWith("stage-smoke:") &&
    StageSmokeKindSchema.safeParse(input.backgroundKind.slice("stage-smoke:".length)).success &&
    input.path === `/stage-smoke/${input.backgroundKind.slice("stage-smoke:".length)}`;
}
export const PermitStateSchema = z.enum([
  "reserved-not-sent", "sending", "result-accounting-pending", "settled",
  "indeterminate", "cancelled-before-send",
]);
export type PermitState = z.infer<typeof PermitStateSchema>;
export const OperationKindSchema = z.enum(["http", "task", "provider", "background"]);
export type OperationKind = z.infer<typeof OperationKindSchema>;

export type CutoverControl = {
  cutoverId: string;
  artifactId: string;
  revision: number;
  phase: CutoverPhase;
  policy: CutoverControlPolicy;
  operationId: string;
  operatorId: string;
  recoveryMode: "snapshot-eligible" | "forward-only";
  stoppedBarrierReceiptId: string | null;
  createdAt: string;
};
export type CutoverPermit = {
  permitId: string;
  cutoverId: string;
  controlRevision: number;
  bindingOperationId: string;
  reservationAttemptId: string;
  requestDigest: string;
  actorId: string;
  kind: OperationKind;
  method: string | null;
  path: string | null;
  battleId: string | null;
  backgroundKind: string | null;
  ownerAttemptId: string | null;
  candidateDigest: string | null;
  state: PermitState;
  resultDigest: string | null;
  reconciliationReceiptId: string | null;
  reconciliationOperationId: string | null;
  reconciliationOperatorId: string | null;
};

export type CutoverStorageErrorCode =
  | "CONTROL_MISSING" | "CONTROL_CORRUPT" | "CONTROL_ID_MISMATCH"
  | "ARTIFACT_MISMATCH" | "INVALID_TRANSITION" | "RECEIPTS_REQUIRED";
export class CutoverControlStorageError extends Error {
  constructor(public readonly code: CutoverStorageErrorCode, message = code) {
    super(message);
    this.name = "CutoverControlStorageError";
  }
}

type ControlRow = {
  cutover_id: string; artifact_id: string; revision: number; phase: string;
  policy_json: unknown; operation_id: string; operator_id: string;
  previous_revision: number | null;
  recovery_mode: string; stopped_barrier_receipt_id: string | null;
  created_at: string | Date;
};
type PermitRow = {
  permit_id: string; cutover_id: string; control_revision: number;
  binding_operation_id: string; reservation_attempt_id: string;
  request_digest: string; actor_id: string; operation_kind: string;
  method: string | null; path: string | null; battle_id: string | null;
  background_kind: string | null; owner_attempt_id: string | null;
  candidate_digest: string | null; state: string; result_digest: string | null;
  reconciliation_receipt_id: string | null;
  reconciliation_operation_id: string | null;
  reconciliation_operator_id: string | null;
};

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new CutoverControlStorageError("CONTROL_CORRUPT"); }
}
function controlFromRow(row: ControlRow): CutoverControl {
  const phase = CutoverPhaseSchema.safeParse(row.phase);
  const policy = CutoverControlPolicySchema.safeParse(jsonValue(row.policy_json));
  const recoveryMode = z.enum(["snapshot-eligible", "forward-only"]).safeParse(row.recovery_mode);
  if (!phase.success || !policy.success || !recoveryMode.success || !Number.isInteger(row.revision)) {
    throw new CutoverControlStorageError("CONTROL_CORRUPT");
  }
  if (policy.data.cutoverId !== row.cutover_id || policy.data.artifactId !== row.artifact_id) {
    throw new CutoverControlStorageError("CONTROL_CORRUPT");
  }
  return { cutoverId: row.cutover_id, artifactId: row.artifact_id, revision: row.revision,
    phase: phase.data, policy: policy.data, operationId: row.operation_id,
    operatorId: row.operator_id, recoveryMode: recoveryMode.data,
    stoppedBarrierReceiptId: row.stopped_barrier_receipt_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString() };
}
function permitFromRow(row: PermitRow): CutoverPermit {
  const kind = OperationKindSchema.safeParse(row.operation_kind);
  const state = PermitStateSchema.safeParse(row.state);
  if (!kind.success || !state.success || !Sha256.safeParse(row.request_digest).success) {
    throw new CutoverControlStorageError("CONTROL_CORRUPT");
  }
  return { permitId: row.permit_id, cutoverId: row.cutover_id, controlRevision: row.control_revision,
    bindingOperationId: row.binding_operation_id, reservationAttemptId: row.reservation_attempt_id,
    requestDigest: row.request_digest, actorId: row.actor_id, kind: kind.data, method: row.method,
    path: row.path, battleId: row.battle_id, backgroundKind: row.background_kind,
    ownerAttemptId: row.owner_attempt_id, candidateDigest: row.candidate_digest,
    state: state.data, resultDigest: row.result_digest,
    reconciliationReceiptId: row.reconciliation_receipt_id,
    reconciliationOperationId: row.reconciliation_operation_id,
    reconciliationOperatorId: row.reconciliation_operator_id };
}
async function activeRow(connection: DatabaseConnection, lock: boolean): Promise<ControlRow | null> {
  if (lock && databaseKind() === "postgres") {
    const pointer = await connection.query<{ cutover_id: string; revision: number }>(
      `SELECT cutover_id,revision FROM cutover_control_active
       WHERE singleton_id='active' FOR UPDATE`,
    );
    const active = pointer.rows[0];
    if (!active) return null;
    const revision = await connection.query<ControlRow>(
      "SELECT * FROM cutover_control_revisions WHERE cutover_id=$1 AND revision=$2",
      [active.cutover_id, active.revision],
    );
    return revision.rows[0] ?? null;
  }
  const result = await connection.query<ControlRow>(
    `SELECT r.* FROM cutover_control_active a
     JOIN cutover_control_revisions r ON r.cutover_id=a.cutover_id AND r.revision=a.revision
     WHERE a.singleton_id='active'`,
  );
  return result.rows[0] ?? null;
}
function requireIdentity(control: CutoverControl, cutoverId: string, artifactId: string): void {
  if (control.cutoverId !== cutoverId) throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
  if (control.artifactId !== artifactId) throw new CutoverControlStorageError("ARTIFACT_MISMATCH");
}
async function readRequired(connection: DatabaseConnection, lock: boolean): Promise<CutoverControl> {
  const row = await activeRow(connection, lock);
  if (!row) throw new CutoverControlStorageError("CONTROL_MISSING");
  return controlFromRow(row);
}

async function activePermits(connection: DatabaseConnection, cutoverId: string): Promise<PermitRow[]> {
  return (await connection.query<PermitRow>(
    `SELECT * FROM cutover_operation_permits WHERE cutover_id=$1
     AND state IN ('reserved-not-sent','sending','result-accounting-pending','indeterminate')
     ORDER BY permit_id`,
    [cutoverId],
  )).rows;
}

async function sentBlockingPermits(connection: DatabaseConnection, cutoverId: string): Promise<PermitRow[]> {
  return (await connection.query<PermitRow>(
    `SELECT * FROM cutover_operation_permits WHERE cutover_id=$1
     AND state IN ('sending','result-accounting-pending','indeterminate')
     ORDER BY permit_id`,
    [cutoverId],
  )).rows;
}

async function verifyTrialConfirmations(
  connection: DatabaseConnection,
  control: CutoverControl,
  bindings: z.infer<typeof TrialBindingsSchema>,
): Promise<void> {
  if (new Set(bindings.ownerConfirmationReceiptIds).size !== 2) {
    throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
  }
  for (let index = 0; index < 2; index += 1) {
    const candidate = control.policy.ownerCandidates[index];
    const receiptId = bindings.ownerConfirmationReceiptIds[index];
    const generationId = bindings.generationIds[index];
    if (!candidate || !receiptId || !generationId) throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
    const result = await connection.query<PermitRow & {
      attempt_owner_user_id: string;
      character_id: string;
      attempt_candidate_digest: string | null;
      attempt_status: string;
      result_generation_id: string | null;
      character_owner_user_id: string;
      generation_asset_type: string;
      generation_asset_id: string;
      current_generation_id: string;
    }>(
      `SELECT p.*,
              a.owner_user_id AS attempt_owner_user_id,
              a.character_id,
              a.candidate_digest AS attempt_candidate_digest,
              a.status AS attempt_status,
              a.result_generation_id,
              c.owner_user_id AS character_owner_user_id,
              g.asset_type AS generation_asset_type,
              g.asset_id AS generation_asset_id,
              cg.generation_id AS current_generation_id
       FROM cutover_operation_permits p
       JOIN character_authoring_attempts a ON a.attempt_id=p.owner_attempt_id
       JOIN characters c ON c.id=a.character_id
       JOIN asset_generations g ON g.generation_id=a.result_generation_id
       JOIN asset_current_generations cg
         ON cg.asset_type=g.asset_type AND cg.asset_id=g.asset_id AND cg.generation_id=g.generation_id
       WHERE p.permit_id=$1 AND p.cutover_id=$2`,
      [receiptId, control.cutoverId],
    );
    const row = result.rows[0];
    const exactPath = `/api/characters/${candidate.attemptId}/confirm`;
    if (!row || row.state !== "settled" || row.operation_kind !== "http" || row.method !== "POST" ||
        row.path !== exactPath || row.actor_id !== control.policy.ownerUserId ||
        row.owner_attempt_id !== candidate.attemptId || row.candidate_digest !== candidate.candidateDigest ||
        row.attempt_owner_user_id !== control.policy.ownerUserId ||
        row.character_owner_user_id !== control.policy.ownerUserId ||
        row.attempt_candidate_digest !== candidate.candidateDigest || row.attempt_status !== "succeeded" ||
        row.result_generation_id !== generationId || row.generation_asset_type !== "character" ||
        row.generation_asset_id !== row.character_id || row.current_generation_id !== generationId ||
        !Sha256.safeParse(row.request_digest).success || !row.result_digest ||
        !Sha256.safeParse(row.result_digest).success) {
      throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
    }
  }
}

export async function initializeCutoverControl(input: {
  policy: CutoverControlPolicy; operationId: string; operatorId: string; phase: "closed";
}): Promise<{ kind: "initialized" | "replayed"; control: CutoverControl }> {
  const policy = CutoverControlPolicySchema.parse(input.policy);
  if (policy.trialBindings !== null) throw new CutoverControlStorageError("INVALID_TRANSITION");
  return withTransaction(async (connection) => {
    const existing = await activeRow(connection, true);
    if (existing) {
      const control = controlFromRow(existing);
      if (control.operationId === input.operationId && control.cutoverId === policy.cutoverId &&
          control.artifactId === policy.artifactId && control.operatorId === input.operatorId &&
          control.revision === 1 && control.phase === input.phase &&
          isDeepStrictEqual(control.policy, policy)) return { kind: "replayed", control };
      throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
    }
    const createdAt = new Date().toISOString();
    await connection.query(
      `INSERT INTO cutover_control_revisions
       (cutover_id,revision,artifact_id,phase,policy_json,operation_id,operator_id,previous_revision,recovery_mode,stopped_barrier_receipt_id,created_at)
       VALUES ($1,1,$2,'closed',$3,$4,$5,NULL,'snapshot-eligible',NULL,$6)`,
      [policy.cutoverId, policy.artifactId, JSON.stringify(policy), input.operationId, input.operatorId, createdAt],
    );
    await connection.query(
      `INSERT INTO cutover_control_active (singleton_id,cutover_id,revision,artifact_id) VALUES ('active',$1,1,$2)`,
      [policy.cutoverId, policy.artifactId],
    );
    return { kind: "initialized", control: await readRequired(connection, false) };
  });
}

export async function readCutoverControl(expected: { cutoverId: string; artifactId: string }): Promise<CutoverControl> {
  const row = await query<ControlRow>(
    `SELECT r.* FROM cutover_control_active a JOIN cutover_control_revisions r
     ON r.cutover_id=a.cutover_id AND r.revision=a.revision WHERE a.singleton_id='active'`,
  );
  if (!row.rows[0]) throw new CutoverControlStorageError("CONTROL_MISSING");
  const control = controlFromRow(row.rows[0]);
  requireIdentity(control, expected.cutoverId, expected.artifactId);
  return control;
}

const allStageReceipts = (value: z.infer<typeof StageAcceptanceSchema>): boolean =>
  Object.values(value).every((receipt) => receipt !== null);

function isExactTransitionReplay(
  row: ControlRow,
  input: {
    artifactId: string; expectedRevision: number; operatorId: string; toPhase: CutoverPhase;
    trialBindings?: z.infer<typeof TrialBindingsSchema>;
    stageAcceptance?: z.infer<typeof StageAcceptanceSchema>;
    productionReceipt?: string;
  },
): boolean {
  const prior = controlFromRow(row);
  if (prior.artifactId !== input.artifactId || prior.operatorId !== input.operatorId ||
      row.previous_revision !== input.expectedRevision || prior.phase !== input.toPhase) return false;
  if (input.toPhase === "trial") {
    return input.stageAcceptance === undefined && input.productionReceipt === undefined &&
      input.trialBindings !== undefined &&
      isDeepStrictEqual(prior.policy.trialBindings, TrialBindingsSchema.parse(input.trialBindings));
  }
  if (input.toPhase === "open") {
    return input.trialBindings === undefined && input.stageAcceptance !== undefined &&
      input.productionReceipt !== undefined &&
      isDeepStrictEqual(prior.policy.stageAcceptance, StageAcceptanceSchema.parse(input.stageAcceptance)) &&
      prior.policy.productionReceipt === Receipt.parse(input.productionReceipt);
  }
  return input.trialBindings === undefined && input.stageAcceptance === undefined &&
    input.productionReceipt === undefined;
}

export async function transitionCutoverControl(input: {
  cutoverId: string; artifactId: string; expectedRevision: number;
  operationId: string; operatorId: string; toPhase: CutoverPhase;
  trialBindings?: z.infer<typeof TrialBindingsSchema>;
  stageAcceptance?: z.infer<typeof StageAcceptanceSchema>;
  productionReceipt?: string;
}): Promise<{ kind: "transitioned" | "replayed" | "conflict"; control: CutoverControl }> {
  return withTransaction(async (connection) => {
    const current = await readRequired(connection, true);
    requireIdentity(current, input.cutoverId, input.artifactId);
    const replay = await connection.query<ControlRow>(
      "SELECT * FROM cutover_control_revisions WHERE cutover_id=$1 AND operation_id=$2",
      [input.cutoverId, input.operationId],
    );
    if (replay.rows[0]) {
      if (!isExactTransitionReplay(replay.rows[0], input)) {
        throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
      }
      return { kind: "replayed", control: controlFromRow(replay.rows[0]) };
    }
    if (current.revision !== input.expectedRevision) return { kind: "conflict", control: current };
    if (current.phase === input.toPhase) throw new CutoverControlStorageError("INVALID_TRANSITION");
    const policy: CutoverControlPolicy = { ...current.policy };
    if (input.toPhase === "trial") {
      if (current.phase !== "closed" || !current.stoppedBarrierReceiptId || !input.trialBindings) {
        throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
      }
      const bindings = TrialBindingsSchema.parse(input.trialBindings);
      if (bindings.stoppedBarrierReceiptId !== current.stoppedBarrierReceiptId) {
        throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
      }
      if ((await activePermits(connection, input.cutoverId)).length !== 0) {
        throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
      }
      await verifyTrialConfirmations(connection, current, bindings);
      policy.trialBindings = bindings;
    } else if (input.toPhase === "open") {
      if (current.phase !== "trial" || !input.stageAcceptance || !input.productionReceipt) {
        throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
      }
      const receipts = StageAcceptanceSchema.parse(input.stageAcceptance);
      if (!allStageReceipts(receipts)) throw new CutoverControlStorageError("RECEIPTS_REQUIRED");
      policy.stageAcceptance = receipts;
      policy.productionReceipt = Receipt.parse(input.productionReceipt);
    } else if (input.toPhase !== "closed") {
      throw new CutoverControlStorageError("INVALID_TRANSITION");
    }
    const revision = current.revision + 1;
    const createdAt = new Date().toISOString();
    const recoveryMode = current.phase === "trial" || current.recoveryMode === "forward-only"
      ? "forward-only" : "snapshot-eligible";
    await connection.query(
      `INSERT INTO cutover_control_revisions
       (cutover_id,revision,artifact_id,phase,policy_json,operation_id,operator_id,previous_revision,recovery_mode,stopped_barrier_receipt_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10)`,
      [input.cutoverId, revision, input.artifactId, input.toPhase, JSON.stringify(policy), input.operationId,
        input.operatorId, current.revision, recoveryMode, createdAt],
    );
    const updated = await connection.query(
      `UPDATE cutover_control_active SET revision=$1 WHERE singleton_id='active' AND cutover_id=$2 AND revision=$3 AND artifact_id=$4`,
      [revision, input.cutoverId, current.revision, input.artifactId],
    );
    if (updated.rowCount !== 1) return { kind: "conflict", control: await readRequired(connection, false) };
    if (input.toPhase === "closed") {
      await connection.query(
        `UPDATE cutover_operation_permits SET state='cancelled-before-send',updated_at=$2
         WHERE cutover_id=$1 AND state='reserved-not-sent'`,
        [input.cutoverId, createdAt],
      );
    }
    return { kind: "transitioned", control: await readRequired(connection, false) };
  });
}

export type ReserveRejectReason =
  | "control_revision_changed" | "not_admitted" | "request_mismatch"
  | "quota_exhausted" | "already_active";
export type ReserveInput = {
  cutoverId: string; artifactId: string; controlRevision: number;
  bindingOperationId: string; reservationAttemptId: string; requestDigest: string;
  actorId: string; kind: OperationKind; method?: string; path?: string;
  battleId?: string; backgroundKind?: string; ownerAttemptId?: string; candidateDigest?: string;
};
function matchesTrialRequest(input: ReserveInput, request: z.infer<typeof TrialRequestSchema>): boolean {
  return input.bindingOperationId === request.bindingOperationId && input.kind === request.kind &&
    input.requestDigest === request.requestDigest && input.method === request.method && input.path === request.path &&
    input.battleId === request.battleId && input.backgroundKind === request.backgroundKind;
}
function isClosedConfirm(control: CutoverControl, input: ReserveInput): boolean {
  if (input.kind !== "http" || input.actorId !== control.policy.ownerUserId || input.method !== "POST" ||
      !input.ownerAttemptId || !input.candidateDigest ||
      input.path !== `/api/characters/${input.ownerAttemptId}/confirm`) return false;
  return control.policy.ownerCandidates.some((candidate) => candidate.attemptId === input.ownerAttemptId &&
    candidate.candidateDigest === input.candidateDigest);
}
async function permitByAttempt(connection: DatabaseConnection, input: ReserveInput): Promise<CutoverPermit | null> {
  const result = await connection.query<PermitRow>(
    `SELECT * FROM cutover_operation_permits WHERE cutover_id=$1 AND binding_operation_id=$2 AND reservation_attempt_id=$3`,
    [input.cutoverId, input.bindingOperationId, input.reservationAttemptId],
  );
  return result.rows[0] ? permitFromRow(result.rows[0]) : null;
}
export async function reserveCutoverOperation(input: ReserveInput): Promise<
  | { kind: "reserved"; permit: CutoverPermit }
  | { kind: "settled_replay"; permit: CutoverPermit }
  | { kind: "rejected"; reason: ReserveRejectReason; permit?: CutoverPermit }
> {
  Sha256.parse(input.requestDigest);
  if (input.candidateDigest) Sha256.parse(input.candidateDigest);
  return withTransaction(async (connection) => {
    const control = await readRequired(connection, true);
    requireIdentity(control, input.cutoverId, input.artifactId);
    const prior = await permitByAttempt(connection, input);
    if (prior) {
      const same = prior.controlRevision === input.controlRevision &&
        prior.requestDigest === input.requestDigest && prior.actorId === input.actorId &&
        prior.kind === input.kind && prior.method === (input.method ?? null) &&
        prior.path === (input.path ?? null) && prior.battleId === (input.battleId ?? null) &&
        prior.backgroundKind === (input.backgroundKind ?? null) &&
        prior.ownerAttemptId === (input.ownerAttemptId ?? null) &&
        prior.candidateDigest === (input.candidateDigest ?? null);
      if (!same) return { kind: "rejected", reason: "request_mismatch", permit: prior };
      return prior.state === "settled"
        ? { kind: "settled_replay", permit: prior }
        : { kind: "rejected", reason: "already_active", permit: prior };
    }
    if (control.revision !== input.controlRevision) return { kind: "rejected", reason: "control_revision_changed" };
    let maximumReservations: number | null = null;
    if (control.phase === "closed") {
      if (!isClosedConfirm(control, input)) return { kind: "rejected", reason: "not_admitted" };
    } else if (control.phase === "trial") {
      const binding = control.policy.trialBindings?.requests.find((request) => matchesTrialRequest(input, request));
      if (!binding || input.actorId !== control.policy.ownerUserId) return { kind: "rejected", reason: "not_admitted" };
      if ((input.kind === "task" || input.kind === "background") &&
          !isBoundedStageSmoke(input) &&
          (!input.battleId || !control.policy.taskBattleIds.includes(input.battleId) ||
           (input.backgroundKind && !input.backgroundKind.toLowerCase().includes("narration")))) {
        return { kind: "rejected", reason: "not_admitted" };
      }
      maximumReservations = binding.maximumReservations;
    }
    const active = await connection.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM cutover_operation_permits
       WHERE cutover_id=$1 AND binding_operation_id=$2
       AND state IN ('reserved-not-sent','sending','result-accounting-pending','indeterminate')`,
      [input.cutoverId, input.bindingOperationId],
    );
    if (Number(active.rows[0]?.count ?? 0) > 0) return { kind: "rejected", reason: "already_active" };
    if (maximumReservations !== null) {
      const count = await connection.query<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM cutover_operation_permits
         WHERE cutover_id=$1 AND binding_operation_id=$2 AND state <> 'cancelled-before-send'`,
        [input.cutoverId, input.bindingOperationId],
      );
      if (Number(count.rows[0]?.count ?? 0) >= maximumReservations) return { kind: "rejected", reason: "quota_exhausted" };
    }
    const permitId = createHash("sha256").update(`${input.cutoverId}\0${input.bindingOperationId}\0${input.reservationAttemptId}`).digest("hex");
    const now = new Date().toISOString();
    await connection.query(
      `INSERT INTO cutover_operation_permits
       (permit_id,cutover_id,control_revision,binding_operation_id,reservation_attempt_id,request_digest,actor_id,operation_kind,method,path,battle_id,background_kind,owner_attempt_id,candidate_digest,state,result_digest,reconciliation_receipt_id,reconciliation_operation_id,reconciliation_operator_id,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'reserved-not-sent',NULL,NULL,NULL,NULL,$15,$15)`,
      [permitId, input.cutoverId, control.revision, input.bindingOperationId, input.reservationAttemptId,
        input.requestDigest, input.actorId, input.kind, input.method ?? null, input.path ?? null,
        input.battleId ?? null, input.backgroundKind ?? null, input.ownerAttemptId ?? null,
        input.candidateDigest ?? null, now],
    );
    const permit = await permitByAttempt(connection, input);
    if (!permit) throw new CutoverControlStorageError("CONTROL_CORRUPT");
    return { kind: "reserved", permit };
  });
}

async function permitById(connection: DatabaseConnection, permitId: string): Promise<CutoverPermit | null> {
  const row = await connection.query<PermitRow>("SELECT * FROM cutover_operation_permits WHERE permit_id=$1", [permitId]);
  return row.rows[0] ? permitFromRow(row.rows[0]) : null;
}
export async function startCutoverOperation(input: {
  cutoverId: string; artifactId: string; permitId: string;
}): Promise<{ kind: "started" | "already_started" | "rejected"; permit: CutoverPermit }> {
  return withTransaction(async (connection) => {
    const control = await readRequired(connection, true);
    requireIdentity(control, input.cutoverId, input.artifactId);
    const permit = await permitById(connection, input.permitId);
    if (!permit || permit.cutoverId !== input.cutoverId) throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
    if (permit.state === "sending") return { kind: "already_started", permit };
    if (permit.state !== "reserved-not-sent" || control.phase === "closed" && permit.controlRevision !== control.revision) {
      return { kind: "rejected", permit };
    }
    const updated = await connection.query(
      `UPDATE cutover_operation_permits SET state='sending',updated_at=$2 WHERE permit_id=$1 AND state='reserved-not-sent'`,
      [permit.permitId, new Date().toISOString()],
    );
    return { kind: updated.rowCount === 1 ? "started" : "rejected",
      permit: (await permitById(connection, permit.permitId)) ?? permit };
  });
}

export async function settleCutoverOperation(input: {
  cutoverId: string; artifactId: string; permitId: string;
  outcome: "settled" | "result-accounting-pending" | "indeterminate";
  resultDigest?: string;
}): Promise<CutoverPermit> {
  if (input.resultDigest) Sha256.parse(input.resultDigest);
  return withTransaction(async (connection) => {
    const control = await readRequired(connection, true);
    requireIdentity(control, input.cutoverId, input.artifactId);
    const permit = await permitById(connection, input.permitId);
    if (!permit || permit.cutoverId !== input.cutoverId) throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
    const allowed = permit.state === "sending" ||
      permit.state === "result-accounting-pending" && input.outcome === "settled";
    if (!allowed || permit.state === "indeterminate") throw new CutoverControlStorageError("INVALID_TRANSITION");
    await connection.query(
      `UPDATE cutover_operation_permits SET state=$2,result_digest=$3,updated_at=$4 WHERE permit_id=$1`,
      [permit.permitId, input.outcome, input.resultDigest ?? permit.resultDigest, new Date().toISOString()],
    );
    const saved = await permitById(connection, permit.permitId);
    if (!saved) throw new CutoverControlStorageError("CONTROL_CORRUPT");
    return saved;
  });
}

export async function reconcileIndeterminateOperation(input: {
  cutoverId: string; artifactId: string; permitId: string;
  operationId: string; operatorId: string;
  reconciliationReceiptId: string; resultDigest: string;
}): Promise<CutoverPermit> {
  Nonempty.parse(input.operationId);
  Nonempty.parse(input.operatorId);
  Receipt.parse(input.reconciliationReceiptId);
  Sha256.parse(input.resultDigest);
  return withTransaction(async (connection) => {
    const control = await readRequired(connection, true);
    requireIdentity(control, input.cutoverId, input.artifactId);
    const permit = await permitById(connection, input.permitId);
    if (!permit) throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
    if (permit.state === "settled" && permit.reconciliationOperationId === input.operationId &&
        permit.reconciliationOperatorId === input.operatorId &&
        permit.reconciliationReceiptId === input.reconciliationReceiptId &&
        permit.resultDigest === input.resultDigest) return permit;
    if (permit.state !== "indeterminate") throw new CutoverControlStorageError("INVALID_TRANSITION");
    await connection.query(
      `UPDATE cutover_operation_permits SET state='settled',result_digest=$2,reconciliation_receipt_id=$3,
       reconciliation_operation_id=$4,reconciliation_operator_id=$5,updated_at=$6
       WHERE permit_id=$1 AND state='indeterminate'`,
      [permit.permitId, input.resultDigest, input.reconciliationReceiptId,
        input.operationId, input.operatorId, new Date().toISOString()],
    );
    const saved = await permitById(connection, permit.permitId);
    if (!saved) throw new CutoverControlStorageError("CONTROL_CORRUPT");
    return saved;
  });
}

export async function recordStoppedBarrier(input: {
  cutoverId: string; artifactId: string; expectedRevision: number;
  operationId: string; operatorId: string; providerAccountingReceiptId: string;
}): Promise<
  | { kind: "recorded" | "replayed"; control: CutoverControl }
  | { kind: "blocked"; control: CutoverControl; blockingPermits: CutoverPermit[] }
> {
  Receipt.parse(input.providerAccountingReceiptId);
  return withTransaction(async (connection) => {
    const control = await readRequired(connection, true);
    requireIdentity(control, input.cutoverId, input.artifactId);
    const replay = await connection.query<ControlRow>(
      "SELECT * FROM cutover_control_revisions WHERE cutover_id=$1 AND operation_id=$2",
      [input.cutoverId, input.operationId],
    );
    if (replay.rows[0]) {
      const prior = controlFromRow(replay.rows[0]);
      if (prior.artifactId !== input.artifactId || prior.phase !== "closed" ||
          prior.operatorId !== input.operatorId || replay.rows[0].previous_revision !== input.expectedRevision ||
          prior.stoppedBarrierReceiptId !== input.providerAccountingReceiptId) {
        throw new CutoverControlStorageError("CONTROL_ID_MISMATCH");
      }
      return { kind: "replayed", control: prior };
    }
    if (control.phase !== "closed" || control.revision !== input.expectedRevision) {
      throw new CutoverControlStorageError("INVALID_TRANSITION");
    }
    const blockers = await sentBlockingPermits(connection, input.cutoverId);
    if (blockers.length > 0) return { kind: "blocked", control, blockingPermits: blockers.map(permitFromRow) };
    await connection.query(
      `UPDATE cutover_operation_permits SET state='cancelled-before-send',updated_at=$2
       WHERE cutover_id=$1 AND state='reserved-not-sent'`,
      [input.cutoverId, new Date().toISOString()],
    );
    const revision = control.revision + 1;
    await connection.query(
      `INSERT INTO cutover_control_revisions
       (cutover_id,revision,artifact_id,phase,policy_json,operation_id,operator_id,previous_revision,recovery_mode,stopped_barrier_receipt_id,created_at)
       VALUES ($1,$2,$3,'closed',$4,$5,$6,$7,$8,$9,$10)`,
      [input.cutoverId, revision, input.artifactId, JSON.stringify(control.policy), input.operationId,
        input.operatorId, control.revision, control.recoveryMode, input.providerAccountingReceiptId,
        new Date().toISOString()],
    );
    const advanced = await connection.query(
      `UPDATE cutover_control_active SET revision=$1 WHERE singleton_id='active' AND cutover_id=$2 AND revision=$3`,
      [revision, input.cutoverId, control.revision],
    );
    if (advanced.rowCount !== 1) throw new CutoverControlStorageError("INVALID_TRANSITION");
    return { kind: "recorded", control: await readRequired(connection, false) };
  });
}
