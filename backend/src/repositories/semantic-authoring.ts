import {
  SemanticAuthoringAccountingV1Schema,
  SemanticAuthoringFailureReceiptV1Schema,
  SemanticAuthoringOwnerQuestionEvidenceV1Schema,
  SemanticAuthoringReservationV1Schema,
  SemanticAuthoringResumptionRecipeV1Schema,
  isTerminalSemanticAuthoringStatusV1,
  type SemanticAuthoringAccountingV1,
  type SemanticAuthoringDurableRunV1,
  type SemanticAuthoringFailureReceiptV1,
  type SemanticAuthoringOwnerQuestionEvidenceV1,
  type SemanticAuthoringProviderRequestOutcomeV1,
  type SemanticAuthoringReservationV1,
  type SemanticAuthoringResumptionRecipeV1,
  type SemanticAuthoringRunStatusV1,
  type SemanticAuthoringRunV1,
} from "@kshiai/shared";
import {
  query,
  withTransaction,
  type DatabaseConnection,
} from "../db.js";

type RunRow = {
  run_id: string;
  attempt_id: string;
  predecessor_run_id: string | null;
  family: SemanticAuthoringDurableRunV1["family"];
  mode: SemanticAuthoringDurableRunV1["mode"];
  owner_user_id: string;
  source_asset_id: string;
  source_generation_id: string | null;
  source_content_digest: string;
  source_payload_ref: string;
  target_family: SemanticAuthoringDurableRunV1["family"];
  target_version: number;
  adapter_identity: string;
  policy_identity: string;
  pricing_identity: string;
  token_estimator_identity: string;
  expected_current_generation_id: string | null;
  status: SemanticAuthoringRunStatusV1;
  accounting_json: unknown;
  failure_receipt_json: unknown | null;
  fence_owner_id: string;
  fencing_token: number;
  run_version: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type RequestRow = {
  request_id: string;
  run_id: string;
  ordinal: number;
  reservation_json: unknown;
  request_digest: string;
  provider_route: string;
  outcome: SemanticAuthoringProviderRequestOutcomeV1 | null;
  accounting_json: unknown | null;
  created_at: string | Date;
  finished_at: string | Date | null;
};

export type SemanticAuthoringFenceWriteFailureV1 =
  | "fence_mismatch"
  | "terminal"
  | "not_found"
  | "not_outstanding"
  | "duplicate";

export type SemanticAuthoringFenceWriteV1<Value> =
  | Readonly<{ accepted: true; value: Value }>
  | Readonly<{ accepted: false; reason: SemanticAuthoringFenceWriteFailureV1 }>;

export type SemanticAuthoringDurableQuestionV1 = Readonly<{
  questionId: string;
  runId: string;
  question: unknown;
  evidence: SemanticAuthoringOwnerQuestionEvidenceV1;
  resumption: SemanticAuthoringResumptionRecipeV1;
  state: "open" | "answered" | "superseded";
  createdAt: string;
}>;

export type SemanticAuthoringDurableAnswerV1 = Readonly<{
  answerId: string;
  questionId: string;
  ownerUserId: string;
  answer: unknown;
  createdAt: string;
}>;

export type SemanticAuthoringProviderRequestRecordV1 = Readonly<{
  requestId: string;
  runId: string;
  ordinal: number;
  reservation: SemanticAuthoringReservationV1;
  requestDigest: string;
  providerRoute: string;
  outcome: SemanticAuthoringProviderRequestOutcomeV1 | null;
  accounting: SemanticAuthoringAccountingV1 | null;
  createdAt: string;
  finishedAt: string | null;
}>;

const zeroAccounting: SemanticAuthoringAccountingV1 = {
  llmCalls: 0,
  countedSteps: 0,
  elapsedMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  costMicroUsd: 0,
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return JSON.parse(value);
}

function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseRun(row: RunRow): SemanticAuthoringDurableRunV1 {
  return {
    runId: row.run_id,
    attemptId: row.attempt_id,
    predecessorRunId: row.predecessor_run_id,
    family: row.family,
    mode: row.mode,
    ownerUserId: row.owner_user_id,
    sourceIdentity: {
      assetId: row.source_asset_id,
      generationId: row.source_generation_id,
      contentDigest: row.source_content_digest,
    },
    sourcePayloadRef: row.source_payload_ref,
    targetContract: {
      family: row.target_family,
      version: row.target_version,
    },
    adapterIdentity: row.adapter_identity,
    policyIdentity: row.policy_identity,
    pricingIdentity: row.pricing_identity,
    tokenEstimatorIdentity: row.token_estimator_identity,
    expectedCurrentGenerationId: row.expected_current_generation_id,
    status: row.status,
    accounting: SemanticAuthoringAccountingV1Schema.parse(parseJson(row.accounting_json)),
    failureReceipt: row.failure_receipt_json == null
      ? null
      : SemanticAuthoringFailureReceiptV1Schema.parse(parseJson(row.failure_receipt_json)),
    executionFence: {
      ownerId: row.fence_owner_id,
      fencingToken: row.fencing_token,
      runVersion: row.run_version,
    },
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function parseRequest(row: RequestRow): SemanticAuthoringProviderRequestRecordV1 {
  return {
    requestId: row.request_id,
    runId: row.run_id,
    ordinal: row.ordinal,
    reservation: SemanticAuthoringReservationV1Schema.parse(parseJson(row.reservation_json)),
    requestDigest: row.request_digest,
    providerRoute: row.provider_route,
    outcome: row.outcome,
    accounting: row.accounting_json == null
      ? null
      : SemanticAuthoringAccountingV1Schema.parse(parseJson(row.accounting_json)),
    createdAt: toIso(row.created_at),
    finishedAt: row.finished_at == null ? null : toIso(row.finished_at),
  };
}

class SemanticAuthoringWriteAbort extends Error {
  readonly reason: SemanticAuthoringFenceWriteFailureV1;
  constructor(reason: SemanticAuthoringFenceWriteFailureV1) {
    super(reason);
    this.name = "SemanticAuthoringWriteAbort";
    this.reason = reason;
  }
}

function abortWrite(reason: SemanticAuthoringFenceWriteFailureV1): never {
  throw new SemanticAuthoringWriteAbort(reason);
}

async function transactWrite<Value>(
  work: (connection: DatabaseConnection) => Promise<Value>,
): Promise<SemanticAuthoringFenceWriteV1<Value>> {
  try {
    return { accepted: true, value: await withTransaction(work) };
  } catch (error) {
    if (error instanceof SemanticAuthoringWriteAbort) {
      return { accepted: false, reason: error.reason };
    }
    throw error;
  }
}

function reservationAccounting(
  reservation: SemanticAuthoringReservationV1,
): SemanticAuthoringAccountingV1 {
  return {
    llmCalls: 1,
    countedSteps: 0,
    elapsedMs: reservation.elapsedMs,
    inputTokens: reservation.inputTokens,
    outputTokens: reservation.outputTokens,
    costMicroUsd: reservation.costMicroUsd,
  };
}

function chargeReservation(
  accounting: SemanticAuthoringAccountingV1,
  reservation: SemanticAuthoringReservationV1,
): SemanticAuthoringAccountingV1 {
  return {
    llmCalls: accounting.llmCalls + 1,
    countedSteps: accounting.countedSteps,
    elapsedMs: accounting.elapsedMs + reservation.elapsedMs,
    inputTokens: accounting.inputTokens + reservation.inputTokens,
    outputTokens: accounting.outputTokens + reservation.outputTokens,
    costMicroUsd: accounting.costMicroUsd + reservation.costMicroUsd,
  };
}

export async function getSemanticAuthoringRunV1(
  runId: string,
  connection?: DatabaseConnection,
): Promise<SemanticAuthoringDurableRunV1 | null> {
  const db = connection ?? { query };
  const result = await db.query<RunRow>(
    `SELECT * FROM semantic_authoring_runs WHERE run_id = $1`,
    [runId],
  );
  const row = result.rows[0];
  return row ? parseRun(row) : null;
}

export async function listSemanticAuthoringRequestsV1(
  runId: string,
  connection?: DatabaseConnection,
): Promise<readonly SemanticAuthoringProviderRequestRecordV1[]> {
  const db = connection ?? { query };
  const result = await db.query<RequestRow>(
    `SELECT * FROM semantic_authoring_provider_requests
      WHERE run_id = $1
      ORDER BY ordinal`,
    [runId],
  );
  return result.rows.map(parseRequest);
}

export async function insertPendingSemanticAuthoringRunV1(
  input: Readonly<{
    run: Omit<SemanticAuthoringRunV1, "executionFence">;
    sourcePayloadRef: string;
    predecessorRunId: string | null;
    createdAt: string;
  }>,
  connection?: DatabaseConnection,
): Promise<SemanticAuthoringDurableRunV1> {
  const db = connection ?? { query };
  await db.query(
    `INSERT INTO semantic_authoring_runs (
        run_id, attempt_id, predecessor_run_id, family, mode, owner_user_id,
        source_asset_id, source_generation_id, source_content_digest, source_payload_ref,
        target_family, target_version, adapter_identity, policy_identity,
        pricing_identity, token_estimator_identity, expected_current_generation_id,
        status, accounting_json, failure_receipt_json,
        fence_owner_id, fencing_token, run_version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17,
        'pending', $18, NULL,
        $19, 0, 0, $20, $20
      )`,
    [
      input.run.runId,
      input.run.attemptId,
      input.predecessorRunId,
      input.run.family,
      input.run.mode,
      input.run.ownerUserId,
      input.run.sourceIdentity.assetId,
      input.run.sourceIdentity.generationId,
      input.run.sourceIdentity.contentDigest,
      input.sourcePayloadRef,
      input.run.targetContract.family,
      input.run.targetContract.version,
      input.run.adapterIdentity,
      input.run.policyIdentity,
      input.run.pricingIdentity,
      input.run.tokenEstimatorIdentity,
      input.run.expectedCurrentGenerationId,
      encodeJson(zeroAccounting),
      input.run.ownerUserId,
      input.createdAt,
    ],
  );
  const created = await getSemanticAuthoringRunV1(input.run.runId, db);
  if (!created) {
    throw new Error("SEMANTIC_AUTHORING_RUN_INSERT_FAILED");
  }
  return created;
}

export async function claimSemanticAuthoringRunV1(
  runId: string,
  claimOwnerId: string,
  claimedAt: string,
): Promise<SemanticAuthoringFenceWriteV1<SemanticAuthoringDurableRunV1>> {
  const claimed = await withTransaction(async (connection) => {
    const current = await getSemanticAuthoringRunV1(runId, connection);
    if (!current) {
      return { accepted: false as const, reason: "not_found" as const };
    }
    if (current.status !== "pending") {
      return {
        accepted: false as const,
        reason: isTerminalSemanticAuthoringStatusV1(current.status) ? "terminal" as const : "fence_mismatch" as const,
      };
    }
    const updated = await connection.query<RunRow>(
      `UPDATE semantic_authoring_runs
          SET status = 'claimed',
              fence_owner_id = $2,
              fencing_token = fencing_token + 1,
              run_version = run_version + 1,
              updated_at = $3
        WHERE run_id = $1 AND status = 'pending'
        RETURNING *`,
      [runId, claimOwnerId, claimedAt],
    );
    const row = updated.rows[0];
    if (!row) {
      return { accepted: false as const, reason: "fence_mismatch" as const };
    }
    return { accepted: true as const, value: parseRun(row) };
  });
  return claimed;
}

async function inspectFenceFailure(
  connection: DatabaseConnection,
  runId: string,
): Promise<never> {
  const current = await getSemanticAuthoringRunV1(runId, connection);
  if (!current) {
    abortWrite("not_found");
  }
  if (isTerminalSemanticAuthoringStatusV1(current.status)) {
    abortWrite("terminal");
  }
  abortWrite("fence_mismatch");
}

async function casClaimedRun(
  connection: DatabaseConnection,
  runId: string,
  fence: SemanticAuthoringRunV1["executionFence"],
  updatedAt: string,
  extra: Readonly<{
    status?: Extract<
      SemanticAuthoringRunStatusV1,
      "ready_for_review" | "needs_owner_answer" | "failed" | "cancelled" | "expired"
    >;
    accounting?: SemanticAuthoringAccountingV1;
    failureReceipt?: SemanticAuthoringFailureReceiptV1 | null;
  }> = {},
): Promise<RunRow> {
  const updated = await connection.query<RunRow>(
    `UPDATE semantic_authoring_runs
        SET run_version = run_version + 1,
            updated_at = $2,
            status = COALESCE($6, status),
            accounting_json = COALESCE($7, accounting_json),
            failure_receipt_json = CASE
              WHEN $8 = 1 THEN $9
              ELSE failure_receipt_json
            END
      WHERE run_id = $1
        AND fence_owner_id = $3
        AND fencing_token = $4
        AND run_version = $5
        AND status = 'claimed'
      RETURNING *`,
    [
      runId,
      updatedAt,
      fence.ownerId,
      fence.fencingToken,
      fence.runVersion,
      extra.status ?? null,
      extra.accounting ? encodeJson(extra.accounting) : null,
      extra.failureReceipt === undefined ? 0 : 1,
      extra.failureReceipt ? encodeJson(extra.failureReceipt) : null,
    ],
  );
  const row = updated.rows[0];
  if (!row) {
    return await inspectFenceFailure(connection, runId);
  }
  return row;
}

async function closeOutstandingRequests(
  connection: DatabaseConnection,
  runId: string,
  finishedAt: string,
): Promise<void> {
  const requests = await listSemanticAuthoringRequestsV1(runId, connection);
  for (const request of requests) {
    if (request.outcome !== null) {
      continue;
    }
    await connection.query(
      `UPDATE semantic_authoring_provider_requests
          SET outcome = 'unknown_consumption',
              accounting_json = $2,
              finished_at = $3
        WHERE request_id = $1 AND outcome IS NULL`,
      [request.requestId, encodeJson(reservationAccounting(request.reservation)), finishedAt],
    );
  }
}

export async function writeSemanticAuthoringReservationV1(
  input: Readonly<{
    runId: string;
    fence: SemanticAuthoringRunV1["executionFence"];
    reservation: SemanticAuthoringReservationV1;
    requestDigest: string;
    providerRoute: string;
    createdAt: string;
  }>,
): Promise<SemanticAuthoringFenceWriteV1<SemanticAuthoringProviderRequestRecordV1>> {
  return transactWrite(async (connection) => {
    const existing = await listSemanticAuthoringRequestsV1(input.runId, connection);
    await casClaimedRun(connection, input.runId, input.fence, input.createdAt);
    await connection.query(
      `INSERT INTO semantic_authoring_provider_requests (
          request_id, run_id, ordinal, reservation_json, request_digest,
          provider_route, outcome, accounting_json, created_at, finished_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, NULL)`,
      [
        input.reservation.requestId,
        input.runId,
        existing.length + 1,
        encodeJson(input.reservation),
        input.requestDigest,
        input.providerRoute,
        input.createdAt,
      ],
    );
    const requests = await listSemanticAuthoringRequestsV1(input.runId, connection);
    const recorded = requests.find((request) => request.requestId === input.reservation.requestId);
    if (!recorded) {
      abortWrite("not_found");
    }
    return recorded;
  });
}

export async function settleSemanticAuthoringRequestV1(
  input: Readonly<{
    runId: string;
    requestId: string;
    fence: SemanticAuthoringRunV1["executionFence"];
    outcome: Exclude<SemanticAuthoringProviderRequestOutcomeV1, "unknown_consumption">;
    finishedAt: string;
    measuredElapsedMs?: number;
    measuredUsage?: Readonly<{ inputTokens: number; outputTokens: number; costMicroUsd: number }>;
  }>,
): Promise<SemanticAuthoringFenceWriteV1<SemanticAuthoringProviderRequestRecordV1>> {
  return transactWrite(async (connection) => {
    const current = await getSemanticAuthoringRunV1(input.runId, connection);
    if (!current) {
      abortWrite("not_found");
    }
    if (isTerminalSemanticAuthoringStatusV1(current.status)) {
      abortWrite("terminal");
    }
    const requests = await listSemanticAuthoringRequestsV1(input.runId, connection);
    const request = requests.find((item) => item.requestId === input.requestId);
    if (!request || request.outcome !== null) {
      abortWrite("not_outstanding");
    }
    const measuredElapsedMs = input.measuredElapsedMs;
    if (measuredElapsedMs !== undefined && (!Number.isSafeInteger(measuredElapsedMs)
      || measuredElapsedMs < 0)) {
      throw new Error("SEMANTIC_AUTHORING_INVALID_ELAPSED_RECEIPT");
    }
    const usage = input.measuredUsage;
    if (usage && (![usage.inputTokens, usage.outputTokens, usage.costMicroUsd]
      .every((value) => Number.isSafeInteger(value) && value >= 0)
      || usage.inputTokens > request.reservation.inputTokens
      || usage.outputTokens > request.reservation.outputTokens
      || usage.costMicroUsd > request.reservation.costMicroUsd)) {
      throw new Error("SEMANTIC_AUTHORING_INVALID_USAGE_RECEIPT");
    }
    const settledReservation = { ...request.reservation, ...usage,
      ...(measuredElapsedMs === undefined ? {} : { elapsedMs: measuredElapsedMs }) };
    const accounting = chargeReservation(current.accounting, settledReservation);
    await casClaimedRun(connection, input.runId, input.fence, input.finishedAt, { accounting });
    const settled = await connection.query<RequestRow>(
      `UPDATE semantic_authoring_provider_requests
          SET outcome = $2,
              accounting_json = $3,
              finished_at = $4
        WHERE request_id = $1 AND outcome IS NULL
        RETURNING *`,
      [
        input.requestId,
        input.outcome,
        encodeJson(reservationAccounting(settledReservation)),
        input.finishedAt,
      ],
    );
    const row = settled.rows[0];
    if (!row) {
      abortWrite("not_outstanding");
    }
    return parseRequest(row);
  });
}

export async function writeSemanticAuthoringTerminalV1(
  input: Readonly<{
    runId: string;
    fence: SemanticAuthoringRunV1["executionFence"];
    status: Extract<
      SemanticAuthoringRunStatusV1,
      "ready_for_review" | "needs_owner_answer" | "failed" | "cancelled" | "expired"
    >;
    accounting: SemanticAuthoringAccountingV1;
    failureReceipt: SemanticAuthoringFailureReceiptV1 | null;
    question?: Readonly<{
      questionId: string;
      question: unknown;
      evidence: SemanticAuthoringOwnerQuestionEvidenceV1;
      resumption: SemanticAuthoringResumptionRecipeV1;
    }>;
    finalCandidate?: Readonly<{
      finalCandidateId: string;
      digest: string;
      familyPayloadRef: string;
      obligationCoverage: Readonly<{
        resolvedRequiredObligationCount: number;
        requiredObligationCount: number;
      }>;
      reconciliationReceiptIdentity: string;
      compilerReceiptIdentity: string;
      disclosureReceiptIdentity: string;
      expectedCurrentGenerationId: string | null;
    }>;
    updatedAt: string;
    persistFamilyResult?: (connection: DatabaseConnection) => Promise<void>;
  }>,
): Promise<SemanticAuthoringFenceWriteV1<SemanticAuthoringDurableRunV1>> {
  return transactWrite(async (connection) => {
    if (input.status === "needs_owner_answer" && !input.question) {
      abortWrite("not_found");
    }
    if (input.status === "ready_for_review" && !input.finalCandidate) {
      abortWrite("not_found");
    }
    const row = await casClaimedRun(connection, input.runId, input.fence, input.updatedAt, {
      status: input.status,
      accounting: input.accounting,
      failureReceipt: input.failureReceipt,
    });
    await closeOutstandingRequests(connection, input.runId, input.updatedAt);
    // The family payload and common terminal receipt commit or roll back together.
    await input.persistFamilyResult?.(connection);
    if (input.question) {
      SemanticAuthoringOwnerQuestionEvidenceV1Schema.parse(input.question.evidence);
      SemanticAuthoringResumptionRecipeV1Schema.parse(input.question.resumption);
      await connection.query(
        `INSERT INTO semantic_authoring_questions (
            question_id, run_id, question_json, evidence_json, resumption_json, state, created_at
          ) VALUES ($1, $2, $3, $4, $5, 'open', $6)`,
        [
          input.question.questionId,
          input.runId,
          encodeJson(input.question.question),
          encodeJson(input.question.evidence),
          encodeJson(input.question.resumption),
          input.updatedAt,
        ],
      );
    }
    if (input.finalCandidate) {
      await connection.query(
        `INSERT INTO semantic_authoring_final_candidates (
            final_candidate_id, run_id, digest, family_payload_ref,
            obligation_coverage_json, reconciliation_receipt_identity,
            compiler_receipt_identity, disclosure_receipt_identity,
            expected_current_generation_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.finalCandidate.finalCandidateId,
          input.runId,
          input.finalCandidate.digest,
          input.finalCandidate.familyPayloadRef,
          encodeJson(input.finalCandidate.obligationCoverage),
          input.finalCandidate.reconciliationReceiptIdentity,
          input.finalCandidate.compilerReceiptIdentity,
          input.finalCandidate.disclosureReceiptIdentity,
          input.finalCandidate.expectedCurrentGenerationId,
          input.updatedAt,
        ],
      );
    }
    const stored = await getSemanticAuthoringRunV1(input.runId, connection);
    if (!stored) {
      abortWrite("not_found");
    }
    return stored;
  });
}

export async function recoverSemanticAuthoringProcessLossV1(
  input: Readonly<{
    runId: string;
    recoveryOwnerId: string;
    recoveredAt: string;
  }>,
): Promise<SemanticAuthoringFenceWriteV1<SemanticAuthoringDurableRunV1>> {
  return transactWrite(async (connection) => {
    const current = await getSemanticAuthoringRunV1(input.runId, connection);
    if (!current) {
      abortWrite("not_found");
    }
    if (isTerminalSemanticAuthoringStatusV1(current.status)) {
      abortWrite("terminal");
    }
    const requests = await listSemanticAuthoringRequestsV1(input.runId, connection);
    const accounting = requests.reduce(
      (sum, request) => request.outcome === null
        ? chargeReservation(sum, request.reservation)
        : sum,
      current.accounting,
    );
    const receipt: SemanticAuthoringFailureReceiptV1 = {
      category: "process_or_lease_lost",
      accounting,
      relevantFindingKeys: [],
      sourceIdentity: current.sourceIdentity,
    };
    const updated = await connection.query<RunRow>(
      `UPDATE semantic_authoring_runs
          SET status = 'failed',
              accounting_json = $2,
              failure_receipt_json = $3,
              fence_owner_id = $4,
              fencing_token = fencing_token + 1,
              run_version = run_version + 1,
              updated_at = $5
        WHERE run_id = $1 AND status = 'claimed'
        RETURNING *`,
      [
        input.runId,
        encodeJson(accounting),
        encodeJson(receipt),
        input.recoveryOwnerId,
        input.recoveredAt,
      ],
    );
    const row = updated.rows[0];
    if (!row) {
      abortWrite("fence_mismatch");
    }
    await closeOutstandingRequests(connection, input.runId, input.recoveredAt);
    return parseRun(row);
  });
}

type QuestionRow = {
  question_id: string;
  run_id: string;
  question_json: unknown;
  evidence_json: unknown;
  resumption_json: unknown;
  state: "open" | "answered" | "superseded";
  created_at: string | Date;
};

function parseQuestion(row: QuestionRow): SemanticAuthoringDurableQuestionV1 {
  return {
    questionId: row.question_id,
    runId: row.run_id,
    question: parseJson(row.question_json),
    evidence: SemanticAuthoringOwnerQuestionEvidenceV1Schema.parse(parseJson(row.evidence_json)),
    resumption: SemanticAuthoringResumptionRecipeV1Schema.parse(parseJson(row.resumption_json)),
    state: row.state,
    createdAt: toIso(row.created_at),
  };
}

export async function getSemanticAuthoringQuestionV1(
  questionId: string,
): Promise<SemanticAuthoringDurableQuestionV1 | null> {
  const result = await query<QuestionRow>(
    `SELECT * FROM semantic_authoring_questions WHERE question_id = $1`,
    [questionId],
  );
  const row = result.rows[0];
  return row ? parseQuestion(row) : null;
}

export async function appendSemanticAuthoringAnswerV1(
  input: Readonly<{
    answerId: string;
    questionId: string;
    ownerUserId: string;
    answer: unknown;
    createdAt: string;
  }>,
): Promise<SemanticAuthoringFenceWriteV1<SemanticAuthoringDurableAnswerV1>> {
  return transactWrite(async (connection) => {
    const question = await connection.query<QuestionRow>(
      `SELECT * FROM semantic_authoring_questions WHERE question_id = $1`,
      [input.questionId],
    );
    const row = question.rows[0];
    if (!row) {
      abortWrite("not_found");
    }
    if (row.state !== "open") {
      abortWrite("terminal");
    }
    await connection.query(
      `INSERT INTO semantic_authoring_answers (
          answer_id, question_id, owner_user_id, answer_json, created_at
        ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.answerId,
        input.questionId,
        input.ownerUserId,
        encodeJson(input.answer),
        input.createdAt,
      ],
    );
    await connection.query(
      `UPDATE semantic_authoring_questions
          SET state = 'answered'
        WHERE question_id = $1 AND state = 'open'`,
      [input.questionId],
    );
    return {
      answerId: input.answerId,
      questionId: input.questionId,
      ownerUserId: input.ownerUserId,
      answer: input.answer,
      createdAt: input.createdAt,
    };
  });
}

export async function replayOrCreateSemanticAuthoringCommandV1(
  input: Readonly<{
    ownerUserId: string;
    commandId: string;
    createdAt: string;
    run: Omit<SemanticAuthoringRunV1, "executionFence">;
    sourcePayloadRef: string;
    predecessorRunId: string | null;
  }>,
): Promise<SemanticAuthoringDurableRunV1> {
  return withTransaction(async (connection) => {
    const existing = await connection.query<{ run_id: string }>(
      `SELECT run_id FROM semantic_authoring_commands
        WHERE owner_user_id = $1 AND command_id = $2`,
      [input.ownerUserId, input.commandId],
    );
    const existingRunId = existing.rows[0]?.run_id;
    if (existingRunId) {
      const run = await getSemanticAuthoringRunV1(existingRunId, connection);
      if (!run) {
        throw new Error("SEMANTIC_AUTHORING_COMMAND_RUN_MISSING");
      }
      return run;
    }
    const created = await insertPendingSemanticAuthoringRunV1({
      run: input.run,
      sourcePayloadRef: input.sourcePayloadRef,
      predecessorRunId: input.predecessorRunId,
      createdAt: input.createdAt,
    }, connection);
    await connection.query(
      `INSERT INTO semantic_authoring_commands (
          owner_user_id, command_id, run_id, created_at
        ) VALUES ($1, $2, $3, $4)`,
      [input.ownerUserId, input.commandId, created.runId, input.createdAt],
    );
    return created;
  });
}
