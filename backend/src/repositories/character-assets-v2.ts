/** R: Manage character authoring attempts, immutable generations, and readiness. */
import { assertCharacterV3UpdateTarget, assertCharacterV3WriteCandidate } from "../services/character-update-policy.js";
import { parseCharacterCandidate, assertCharacterCandidateReady, candidateToSheet, type CharacterAuthoringCandidate } from "../services/character-authoring-candidate.js";
import {
  AssetAuthoringAttemptKindSchema,
  AssetAuthoringAttemptStatusSchema,
  AssetCompatibilitySchema,
  CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
  CharacterCompilerCapabilityV1Schema,
  CharacterGenerationEnvelopeV2Schema,
  CharacterSheetSchema,
  CharacterGenerationEnvelopeV3Schema,
  assertCharacterGenerationReadyV2,
  characterDefinitionV3ToLegacySheet,
  projectCharacterCompilerCompatibilityV1,
  type AssetAuthoringAttemptKind,
  type AssetAuthoringAttemptStatus,
  type AssetCompatibility,
  type CharacterGenerationEnvelopeV2,
  type CharacterGenerationEnvelopeV3,
  type CharacterSheet,
  OwnerRetryCommandV1Schema,
} from "@kshiai/shared";
import { databaseKind, query, withTransaction, type DatabaseConnection } from "../db.js";
import { newId } from "../id.js";
import {
  activateAssetGeneration,
  appendAssetGeneration,
  assetContentDigest,
  getCurrentAssetGeneration,
  type AssetGeneration,
} from "./asset-generations.js";
import { insertOwnerNotification } from "./owner-notifications.js";
import { readCompleteFocusedCharacterReview } from "./character-focused-candidate.js";
import { CharacterReviewCorrectionSourceV1Schema, decodeCharacterReviewCorrectionSourceV1 }
  from "../services/semantic-authoring/character-review-correction-source.js";
import { registerCharacterFocusedAuthoringV3,
  readCharacterFocusedMigrationActivationV3,
  type CharacterFocusedRegistrationSourceV1 } from "../services/character-focused-authoring.js";
import { createCharacterSemanticAuthoringAdapterV3 } from "../services/semantic-authoring/adapters/character-v3.js";
import { decodeUnresolvedCharacterRevisionSourceV1 } from
  "../services/semantic-authoring/character-revision-scope-source.js";
import {
  assertFamilyAuthoringFence,
  assertFamilyAuthoringJobDiscardable,
  finishFamilyAuthoringJob,
  finishFamilyAuthoringJobInTransaction,
  insertFamilyAuthoringJob,
  reopenFamilyAuthoringJob,
  type AuthoringExecutionFence,
} from "./family-authoring-jobs.js";

export type CharacterAuthoringAttempt = {
  attemptId: string;
  ownerUserId: string;
  characterId: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string | null;
  sourceDigest: string;
  expectedGenerationId: string | null;
  expectedContentDigest: string | null;
  status: AssetAuthoringAttemptStatus;
  candidate: CharacterAuthoringCandidate | null;
  candidateDigest: string | null;
  assistantMessage: string;
  errorCode: string | null;
  resultGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type AttemptRow = {
  attempt_id: string;
  owner_user_id: string;
  character_id: string;
  kind: string;
  idempotency_key: string;
  request_digest: string;
  source_text: string | null;
  source_digest: string;
  expected_generation_id: string | null;
  expected_content_digest: string | null;
  status: string;
  candidate_json: unknown | null;
  candidate_digest: string | null;
  assistant_message: string;
  error_code: string | null;
  result_generation_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  expires_at: string | Date;
};

type GenerationRow = {
  asset_type: string;
  asset_id: string;
  generation: number;
  generation_id: string;
  schema_version: number;
  content_json: unknown;
  content_digest: string;
  created_at: string | Date;
};

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function parseAttempt(row: AttemptRow): CharacterAuthoringAttempt {
  const rawCandidate = typeof row.candidate_json === "string"
    ? JSON.parse(row.candidate_json)
    : row.candidate_json;
  return {
    attemptId: row.attempt_id,
    ownerUserId: row.owner_user_id,
    characterId: row.character_id,
    kind: AssetAuthoringAttemptKindSchema.parse(row.kind),
    idempotencyKey: row.idempotency_key,
    requestDigest: row.request_digest,
    sourceText: row.source_text,
    sourceDigest: row.source_digest,
    expectedGenerationId: row.expected_generation_id,
    expectedContentDigest: row.expected_content_digest,
    status: AssetAuthoringAttemptStatusSchema.parse(row.status),
    candidate: rawCandidate == null
      ? null
      : parseCharacterCandidate(rawCandidate),
    candidateDigest: row.candidate_digest,
    assistantMessage: row.assistant_message,
    errorCode: row.error_code,
    resultGenerationId: row.result_generation_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: iso(row.expires_at),
  };
}

function parseGeneration(row: GenerationRow): AssetGeneration {
  return {
    assetType: row.asset_type,
    assetId: row.asset_id,
    generation: Number(row.generation),
    generationId: row.generation_id,
    schemaVersion: Number(row.schema_version),
    content: typeof row.content_json === "string"
      ? JSON.parse(row.content_json)
      : row.content_json,
    contentDigest: row.content_digest,
    createdAt: iso(row.created_at),
  };
}

function characterReadinessReason(content: unknown): string | null {
  const v3 = CharacterGenerationEnvelopeV3Schema.safeParse(content);
  if (v3.success) {
    const compatibility = projectCharacterCompilerCompatibilityV1({
      required: CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
      available: v3.data.compilerCompatibility.map((capability) =>
        CharacterCompilerCapabilityV1Schema.parse(capability)),
      deferredValues: v3.data.deferredValues.values,
      blocked: [],
    });
    return compatibility.status === "ready"
      ? null
      : "missing_required_compiler";
  }
  try {
    assertCharacterGenerationReadyV2(
      CharacterGenerationEnvelopeV2Schema.parse(content),
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("CHARACTER_REQUIRED_COMPILER_MISSING:")) {
      return "missing_required_compiler";
    }
    if (message === "CHARACTER_PROFILE_CLAIM_RECEIPT_MISSING") {
      return "missing_claim_validation";
    }
    if (message === "CHARACTER_ACTION_NORM_SELECTOR_MISSING") {
      return "invalid_action_norm_selector";
    }
    if (message.startsWith("PROFILE_")) return "invalid_claim_validation";
    return "invalid_v2_envelope";
  }
}

function samePortrait(
  left: CharacterGenerationEnvelopeV2["definition"]["appearance"]["portrait"],
  right: CharacterGenerationEnvelopeV2["definition"]["appearance"]["portrait"],
): boolean {
  return left?.mediaId === right?.mediaId &&
    left?.revisionId === right?.revisionId;
}

async function insertCharacterAuthoringJob(
  connection: DatabaseConnection,
  attemptId: string,
  ownerUserId: string,
  characterId: string,
  createdAt: string,
): Promise<void> {
  await insertFamilyAuthoringJob(connection, "character", {
    attemptId,
    ownerUserId,
    assetId: characterId,
    createdAt,
  });
}

async function rejectStaleCharacterAuthoring(
  connection: DatabaseConnection,
  characterId: string,
  ownerUserId: string,
  attemptId: string,
): Promise<void> {
  const latest = await connection.query<{ attempt_id: string }>(
    `SELECT attempt_id FROM character_authoring_attempts
      WHERE character_id = $1 AND owner_user_id = $2
      ORDER BY updated_at DESC LIMIT 1`,
    [characterId, ownerUserId],
  );
  if (latest.rows[0] && latest.rows[0].attempt_id !== attemptId) {
    throw new Error("AUTHORING_ATTEMPT_STALE");
  }
}

async function rejectBusyCharacterAuthoring(
  connection: DatabaseConnection,
  characterId: string,
  ownerUserId: string,
  kind: AssetAuthoringAttemptKind,
  correctionPredecessorAttemptId: string | null = null,
): Promise<void> {
  if (kind === "create") return;
  const inflight = await connection.query<{ attempt_id: string }>(
    `SELECT attempt_id FROM character_authoring_attempts
      WHERE character_id = $1 AND owner_user_id = $2
        AND status IN ('pending_structure', 'generating_structure',
          'validating_structure', 'generating_description',
          'validating_description', 'awaiting_owner_acceptance',
          'committing')
        AND ($3 IS NULL OR attempt_id <> $3)
      LIMIT 1`,
    [characterId, ownerUserId, correctionPredecessorAttemptId],
  );
  if (inflight.rows[0]) throw new Error("AUTHORING_ALREADY_IN_PROGRESS");
}

async function selectAttempt(
  connection: DatabaseConnection,
  attemptId: string,
  ownerUserId: string,
): Promise<CharacterAuthoringAttempt | null> {
  const result = await connection.query<AttemptRow>(
    `SELECT * FROM character_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attemptId, ownerUserId],
  );
  return result.rows[0] ? parseAttempt(result.rows[0]) : null;
}

async function replayExistingAttempt(
  connection: DatabaseConnection,
  ownerUserId: string,
  idempotencyKey: string,
  requestDigest: string,
): Promise<{ attempt: CharacterAuthoringAttempt; replayed: boolean } | null> {
  const existing = await connection.query<AttemptRow>(
    `SELECT * FROM character_authoring_attempts
      WHERE owner_user_id = $1 AND idempotency_key = $2`,
    [ownerUserId, idempotencyKey],
  );
  if (!existing.rows[0]) return null;
  const attempt = parseAttempt(existing.rows[0]);
  if (attempt.requestDigest !== requestDigest) {
    throw new Error("AUTHORING_IDEMPOTENCY_CONFLICT");
  }
  return { attempt, replayed: true };
}

type NewCharacterAuthoringInput = {
  ownerUserId: string;
  characterId?: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string;
  sourceDigest: string;
  ttlMs?: number;
  correctionPredecessorAttemptId?: string;
  focused?: { source: CharacterFocusedRegistrationSourceV1; pricingIdentity: string;
    predecessorRunId?: string; commandId?: string };
};

function assertNewAuthoringTarget(
  input: NewCharacterAuthoringInput,
  existingCharacter: { owner_user_id: string } | null,
  expected: { generation_id: string; content_digest: string } | null,
): void {
  if (input.kind === "create" && (existingCharacter || expected)) {
    throw new Error("CHARACTER_ALREADY_EXISTS");
  }
  if (input.kind !== "create" &&
      (!existingCharacter || existingCharacter.owner_user_id !== input.ownerUserId)) {
    throw new Error("CHARACTER_NOT_FOUND");
  }
  if (input.kind === "revision" && !expected) {
    throw new Error("CHARACTER_GENERATION_MISSING");
  }
}

async function setNewAuthoringAssetState(
  connection: DatabaseConnection,
  kind: AssetAuthoringAttemptKind,
  identity: { characterId: string; attemptId: string; createdAt: string; expectedGenerationId: string | null },
): Promise<void> {
  const { characterId, attemptId, createdAt, expectedGenerationId } = identity;
  if (kind === "upgrade") {
    await connection.query(
      `INSERT INTO character_asset_states
        (character_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'upgrading', $2, $3, NULL, $4)
       ON CONFLICT (character_id) DO UPDATE
         SET compatibility_status = 'upgrading',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = EXCLUDED.active_attempt_id,
             reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [characterId, expectedGenerationId, attemptId, createdAt],
    );
  } else if (kind === "revision") {
    await connection.query(
      `UPDATE character_asset_states
          SET active_attempt_id = $2, updated_at = $3
        WHERE character_id = $1 AND compatibility_status = 'ready'`,
      [characterId, attemptId, createdAt],
    );
  }
}

async function registerInsertedAuthoringAttempt(
  connection: DatabaseConnection,
  input: NewCharacterAuthoringInput,
  identity: { attemptId: string; characterId: string; createdAt: string },
): Promise<CharacterAuthoringAttempt> {
  const { attemptId, characterId, createdAt } = identity;
  const attempt = await selectAttempt(connection, attemptId, input.ownerUserId);
  if (!attempt) throw new Error("AUTHORING_ATTEMPT_INSERT_FAILED");
  if (input.focused) {
    await registerCharacterFocusedAuthoringV3(connection, {
      attemptId, ownerUserId: input.ownerUserId, characterId,
      sourceGenerationId: attempt.expectedGenerationId,
      expectedCurrentGenerationId: attempt.expectedGenerationId,
      source: input.focused.source, pricingIdentity: input.focused.pricingIdentity, createdAt,
      predecessorRunId: input.focused.predecessorRunId, commandId: input.focused.commandId,
    });
  }
  return attempt;
}

async function insertNewAuthoringAttempt(
  connection: DatabaseConnection,
  input: NewCharacterAuthoringInput,
): Promise<CharacterAuthoringAttempt> {
  const characterId = input.characterId ?? newId("chr");
  const character = await connection.query<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM characters WHERE id = $1`,
    [characterId],
  );
  const existingCharacter = character.rows[0] ?? null;
  const current = await connection.query<{
    generation_id: string;
    content_digest: string;
  }>(
    `SELECT c.generation_id, g.content_digest
       FROM asset_current_generations c
       JOIN asset_generations g ON g.generation_id = c.generation_id
      WHERE c.asset_type = 'character' AND c.asset_id = $1`,
    [characterId],
  );
  const expected = current.rows[0] ?? null;
  assertNewAuthoringTarget(input, existingCharacter, expected);
  await rejectBusyCharacterAuthoring(
    connection,
    characterId,
    input.ownerUserId,
    input.kind,
    input.correctionPredecessorAttemptId ?? null,
  );
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? 24 * 60 * 60 * 1000))
    .toISOString();
  const attemptId = newId("cat");
  await connection.query(
    `INSERT INTO character_authoring_attempts
      (attempt_id, owner_user_id, character_id, kind, idempotency_key,
       request_digest, source_text, source_digest, expected_generation_id,
       expected_content_digest, status, created_at, updated_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             'pending_structure', $11, $11, $12)`,
    [
      attemptId,
      input.ownerUserId,
      characterId,
      input.kind,
      input.idempotencyKey,
      input.requestDigest,
      input.sourceText,
      input.sourceDigest,
      expected?.generation_id ?? null,
      expected?.content_digest ?? null,
      createdAt,
      expiresAt,
    ],
  );
  await setNewAuthoringAssetState(connection, input.kind, {
    characterId, attemptId, createdAt, expectedGenerationId: expected?.generation_id ?? null,
  });
  await insertCharacterAuthoringJob(
    connection,
    attemptId,
    input.ownerUserId,
    characterId,
    createdAt,
  );
  return registerInsertedAuthoringAttempt(connection, input, { attemptId, characterId, createdAt });
}

export async function beginCharacterAuthoringAttempt(input: {
  ownerUserId: string;
  characterId?: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string;
  sourceDigest: string;
  ttlMs?: number;
  targetSchemaVersion?: 3;
  focused?: { source: CharacterFocusedRegistrationSourceV1; pricingIdentity: string };
}): Promise<{ attempt: CharacterAuthoringAttempt; replayed: boolean }> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  if (!input.focused && input.targetSchemaVersion !== 3) {
    throw new Error("CHARACTER_V3_AUTHORING_REQUIRED");
  }
  if (input.kind === "revision" && input.characterId) {
    await assertCharacterV3UpdateTarget(input.characterId);
  }
  return withTransaction(async (connection) => {
    const replayed = await replayExistingAttempt(
      connection,
      input.ownerUserId,
      input.idempotencyKey,
      input.requestDigest,
    );
    if (replayed) return replayed;
    return {
      attempt: await insertNewAuthoringAttempt(connection, input),
      replayed: false,
    };
  });
}

/** Retry from frozen source, never from an intermediate/failed candidate. */
function frozenRetrySource(sourceJson: unknown, sourceContentDigest: string, sourceText: string | null) {
  const rawSource = typeof sourceJson === "string" ? JSON.parse(sourceJson) : sourceJson;
  const decoded = createCharacterSemanticAuthoringAdapterV3().decodeFrozenSource(rawSource);
  const pendingScope = decodeUnresolvedCharacterRevisionSourceV1(rawSource);
  const source = decodeCharacterReviewCorrectionSourceV1(rawSource)
    ?? pendingScope ?? (decoded.accepted ? decoded.value : null);
  if (!source || !sourceText
    || assetContentDigest(source) !== sourceContentDigest) {
    throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  }
  return { source, sourceText };
}

export async function retryCharacterFocusedAuthoringV3(input: {
  ownerUserId: string; predecessorAttemptId: string; commandId: string; pricingIdentity: string;
}): Promise<{ attempt: CharacterAuthoringAttempt; replayed: boolean }> {
  OwnerRetryCommandV1Schema.parse({ commandId: input.commandId });
  return withTransaction(async (connection) => {
    const predecessor = await selectAttempt(connection, input.predecessorAttemptId, input.ownerUserId);
    if (!predecessor) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    const requestDigest = assetContentDigest({ operation: "retry", ownerUserId: input.ownerUserId,
      predecessorAttemptId: input.predecessorAttemptId, commandId: input.commandId });
    const idempotencyKey = `semantic-command:${input.commandId}`;
    const replay = await replayExistingAttempt(connection, input.ownerUserId, idempotencyKey, requestDigest);
    if (replay) return replay;
    const result = await connection.query<{ run_id: string; status: string; source_json: unknown;
      pricing_identity: string; expected_current_generation_id: string | null; source_content_digest: string }>(
      `SELECT r.run_id, r.status, r.pricing_identity, r.expected_current_generation_id,
        r.source_content_digest, p.source_json
        FROM semantic_authoring_runs r JOIN character_focused_authoring_payloads p ON p.run_id = r.run_id
        WHERE r.attempt_id = $1 AND r.owner_user_id = $2`,
      [input.predecessorAttemptId, input.ownerUserId]);
    const row = result.rows[0];
    if (!row || row.status !== "failed" || predecessor.status !== "failed") {
      throw new Error("AUTHORING_RETRY_NOT_ALLOWED");
    }
    if (row.pricing_identity !== input.pricingIdentity) throw new Error("FOCUSED_CHARACTER_PROVIDER_IDENTITY_MISMATCH");
    await rejectStaleCharacterAuthoring(connection, predecessor.characterId, input.ownerUserId, predecessor.attemptId);
    const pointer = await connection.query<{ generation_id: string }>(
      `SELECT generation_id FROM asset_current_generations WHERE asset_type = 'character' AND asset_id = $1`,
      [predecessor.characterId]);
    if ((pointer.rows[0]?.generation_id ?? null) !== row.expected_current_generation_id) {
      throw new Error("FOCUSED_CHARACTER_POINTER_DRIFT");
    }
    const frozen = frozenRetrySource(row.source_json, row.source_content_digest, predecessor.sourceText);
    const attempt = await insertNewAuthoringAttempt(connection, {
      ownerUserId: input.ownerUserId, characterId: predecessor.characterId, kind: predecessor.kind,
      idempotencyKey, requestDigest, sourceText: frozen.sourceText, sourceDigest: predecessor.sourceDigest,
      focused: { source: frozen.source, pricingIdentity: row.pricing_identity,
        predecessorRunId: row.run_id, commandId: input.commandId },
    });
    return { attempt, replayed: false };
  });
}

/** Start an immutable successor from an exact reviewed candidate; keep its predecessor intact. */
export async function beginCharacterDraftCorrection(input: {
  ownerUserId: string; predecessorAttemptId: string; candidateDigest: string;
  message: string; idempotencyKey: string; pricingIdentity: string;
}): Promise<{ attempt: CharacterAuthoringAttempt; replayed: boolean }> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const instruction = input.message.trim();
  return withTransaction(async (connection) => {
    if (databaseKind() === "postgres") await connection.query(
      `SELECT attempt_id FROM character_authoring_attempts WHERE attempt_id = $1 AND owner_user_id = $2 FOR UPDATE`,
      [input.predecessorAttemptId, input.ownerUserId]);
    const predecessor = await selectAttempt(connection, input.predecessorAttemptId, input.ownerUserId);
    if (!predecessor) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    const requestDigest = assetContentDigest({ operation: "review_candidate_correction",
      ownerUserId: input.ownerUserId, predecessorAttemptId: input.predecessorAttemptId,
      candidateDigest: input.candidateDigest, instruction });
    const idempotencyKey = `character-draft-correction:${input.idempotencyKey}`;
    const replay = await replayExistingAttempt(connection, input.ownerUserId, idempotencyKey, requestDigest);
    if (replay) return replay;
    if (predecessor.status !== "awaiting_owner_acceptance" || predecessor.kind === "upgrade"
      || Date.parse(predecessor.expiresAt) <= Date.now()) {
      throw new Error("CORRECTION_PREDECESSOR_NOT_READY");
    }
    await rejectStaleCharacterAuthoring(connection, predecessor.characterId, input.ownerUserId, predecessor.attemptId);
    const frozen = await readCompleteFocusedCharacterReview(connection, predecessor.attemptId, input.ownerUserId);
    if (frozen.complete.candidateDigest !== input.candidateDigest) throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
    const pointer = await connection.query<{ generation_id: string }>(
      `SELECT generation_id FROM asset_current_generations WHERE asset_type = 'character' AND asset_id = $1`,
      [predecessor.characterId]);
    if ((pointer.rows[0]?.generation_id ?? null) !== predecessor.expectedGenerationId) {
      throw new Error("FOCUSED_CHARACTER_POINTER_DRIFT");
    }
    const source = CharacterReviewCorrectionSourceV1Schema.parse({
      kind: "review_candidate_correction", predecessorAttemptId: predecessor.attemptId,
      predecessorCandidate: frozen.complete, naturalText: instruction, requestedCluster: null,
    });
    const attempt = await insertNewAuthoringAttempt(connection, {
      ownerUserId: input.ownerUserId, characterId: predecessor.characterId, kind: predecessor.kind,
      idempotencyKey, requestDigest, sourceText: instruction,
      sourceDigest: assetContentDigest({ predecessorAttemptId: predecessor.attemptId,
        candidateDigest: input.candidateDigest, instruction }),
      correctionPredecessorAttemptId: predecessor.attemptId,
      focused: { source, pricingIdentity: input.pricingIdentity, predecessorRunId: frozen.runId },
    });
    return { attempt, replayed: false };
  });
}

export function getCharacterAuthoringAttempt(
  attemptId: string,
  ownerUserId: string,
): Promise<CharacterAuthoringAttempt | null> {
  return query<AttemptRow>(
    `SELECT * FROM character_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attemptId, ownerUserId],
  ).then((result) => result.rows[0] ? parseAttempt(result.rows[0]) : null);
}

export function getInFlightCharacterAuthoringAttempt(
  characterId: string,
  ownerUserId: string,
): Promise<CharacterAuthoringAttempt | null> {
  return query<AttemptRow>(
    `SELECT * FROM character_authoring_attempts
      WHERE character_id = $1 AND owner_user_id = $2
        AND status IN ('pending_structure', 'generating_structure',
          'validating_structure', 'generating_description',
          'validating_description')
      ORDER BY updated_at DESC LIMIT 1`,
    [characterId, ownerUserId],
  ).then((result) => result.rows[0] ? parseAttempt(result.rows[0]) : null);
}

export function getLatestCharacterAuthoringAttempt(
  ownerUserId: string,
): Promise<CharacterAuthoringAttempt | null> {
  return query<AttemptRow>(
    `SELECT * FROM character_authoring_attempts
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC LIMIT 1`,
    [ownerUserId],
  ).then((result) => result.rows[0] ? parseAttempt(result.rows[0]) : null);
}

export function getLatestCharacterAuthoringAttemptForCharacter(
  characterId: string,
  ownerUserId: string,
): Promise<CharacterAuthoringAttempt | null> {
  return query<AttemptRow>(
    `SELECT * FROM character_authoring_attempts
      WHERE character_id = $1 AND owner_user_id = $2
      ORDER BY updated_at DESC LIMIT 1`,
    [characterId, ownerUserId],
  ).then((result) => result.rows[0] ? parseAttempt(result.rows[0]) : null);
}

export async function finishCharacterAuthoringJob(
  attemptId: string,
  status: "completed" | "cancelled",
  executionFence?: AuthoringExecutionFence,
): Promise<void> {
  await finishFamilyAuthoringJob("character", attemptId, status, executionFence);
}

export async function updateCharacterAuthoringStatus(input: {
  attemptId: string;
  ownerUserId: string;
  status: AssetAuthoringAttemptStatus;
  errorCode?: string | null;
  executionFence?: AuthoringExecutionFence;
}): Promise<void> {
  AssetAuthoringAttemptStatusSchema.parse(input.status);
  await withTransaction(async (connection) => {
    if (input.executionFence) {
      await assertFamilyAuthoringFence(
        connection,
        "character",
        input.attemptId,
        input.executionFence,
      );
    }
    await connection.query(
      `UPDATE character_authoring_attempts
          SET status = $3, error_code = $4, updated_at = $5
        WHERE attempt_id = $1 AND owner_user_id = $2
          AND status NOT IN ('succeeded', 'discarded', 'expired', 'failed')`,
      [
        input.attemptId,
        input.ownerUserId,
        input.status,
        input.errorCode ?? null,
        new Date().toISOString(),
      ],
    );
  });
}

export async function replaceCharacterAuthoringSource(input: {
  attemptId: string;
  ownerUserId: string;
  sourceText: string;
  sourceDigest: string;
}): Promise<void> {
  const updatedAt = new Date().toISOString();
  await withTransaction(async (connection) => {
    const current = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (current?.candidate) assertCharacterV3WriteCandidate(current.candidate);
    if (current?.candidate && CharacterGenerationEnvelopeV3Schema.safeParse(current.candidate).success) {
      throw new Error("FIXED_V3_CANDIDATE_REQUIRES_NEW_ATTEMPT");
    }
    const result = await connection.query(
      `UPDATE character_authoring_attempts
          SET source_text = $3, source_digest = $4,
              status = 'pending_structure', error_code = NULL, updated_at = $5
        WHERE attempt_id = $1 AND owner_user_id = $2
          AND status = 'awaiting_owner_acceptance'`,
      [
        input.attemptId,
        input.ownerUserId,
        input.sourceText,
        input.sourceDigest,
        updatedAt,
      ],
    );
    if (result.rowCount !== 1) throw new Error("AUTHORING_ATTEMPT_NOT_EDITABLE");
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    await reopenCharacterAuthoringJob(connection, attempt, updatedAt);
  });
}

async function reopenCharacterAuthoringJob(
  connection: DatabaseConnection,
  attempt: CharacterAuthoringAttempt,
  updatedAt: string,
): Promise<void> {
  await reopenFamilyAuthoringJob(connection, "character", {
    attemptId: attempt.attemptId,
    ownerUserId: attempt.ownerUserId,
    assetId: attempt.characterId,
    updatedAt,
  });
}

type SaveCandidateInput = {
  attemptId: string;
  ownerUserId: string;
  envelope: CharacterAuthoringCandidate;
  assistantMessage: string;
  executionFence?: AuthoringExecutionFence;
};
export async function saveCharacterAuthoringCandidate(input: SaveCandidateInput): Promise<CharacterAuthoringAttempt> {
  return withTransaction((connection) => saveCandidateInTransaction(connection, input));
}
async function saveCandidateInTransaction(connection: DatabaseConnection, input: SaveCandidateInput): Promise<CharacterAuthoringAttempt> {
  assertCharacterV3WriteCandidate(input.envelope);
  const envelope = assertCharacterCandidateReady(input.envelope);
  const candidateDigest = assetContentDigest(envelope);
  const updatedAt = new Date().toISOString();
    if (input.executionFence) {
      await assertFamilyAuthoringFence(
        connection,
        "character",
        input.attemptId,
        input.executionFence,
      );
    }
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (["succeeded", "discarded", "expired"].includes(attempt.status)) {
      throw new Error("AUTHORING_ATTEMPT_TERMINAL");
    }
    if (CharacterGenerationEnvelopeV3Schema.safeParse(envelope).success
      && (envelope.provenance.attemptId !== attempt.attemptId
        || envelope.provenance.sourceDigest !== attempt.sourceDigest)) {
      throw new Error("AUTHORING_CANDIDATE_PROVENANCE_MISMATCH");
    }
    const savedRow = await connection.query(
      `UPDATE character_authoring_attempts
          SET candidate_json = $3, candidate_digest = $4,
              assistant_message = $5, status = 'awaiting_owner_acceptance',
              error_code = NULL, updated_at = $6
        WHERE attempt_id = $1 AND owner_user_id = $2
          AND status NOT IN ('succeeded', 'discarded', 'expired', 'failed')`,
      [
        input.attemptId,
        input.ownerUserId,
        JSON.stringify(envelope),
        candidateDigest,
        input.assistantMessage,
        updatedAt,
      ],
    );
    if (savedRow.rowCount !== 1) throw new Error("AUTHORING_ATTEMPT_TERMINAL");
    await insertOwnerNotification(connection, {
      ownerUserId: input.ownerUserId,
      kind: "authoring_ready",
      attemptId: input.attemptId,
      characterId: attempt.characterId,
      attemptKind: attempt.kind,
      createdAt: updatedAt,
    });
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE character_asset_states
            SET compatibility_status = 'upgrading', active_attempt_id = $2,
                reason_code = NULL, updated_at = $3
          WHERE character_id = $1`,
        [attempt.characterId, attempt.attemptId, updatedAt],
      );
    }
    const saved = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!saved) throw new Error("AUTHORING_ATTEMPT_SAVE_FAILED");
    return saved;
}

/** Persist a supplied create candidate and retire its generation job atomically. */
export async function prepareCharacterCreateCandidate(input: {
  ownerUserId: string; characterId: string; idempotencyKey: string;
  envelope: CharacterAuthoringCandidate;
  source: Record<string, unknown>;
}): Promise<CharacterAuthoringAttempt> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const envelope = assertCharacterCandidateReady(input.envelope);
  const sourceDigest = assetContentDigest(input.source);
  if (envelope.provenance.sourceDigest !== sourceDigest) throw new Error("AUTHORING_SOURCE_DIGEST_MISMATCH");
  const requestDigest = assetContentDigest({ characterId: input.characterId, envelope, sourceDigest });
  return withTransaction(async (connection) => {
    if (databaseKind() === "postgres") await connection.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`character-create-candidate:${input.ownerUserId}:${input.idempotencyKey}`]);
    const owner = await connection.query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [input.ownerUserId]);
    if (!owner.rows[0]) throw new Error("TRIAL_OWNER_NOT_FOUND");
    const replay = await replayExistingAttempt(connection, input.ownerUserId, input.idempotencyKey, requestDigest);
    if (replay) return replay.attempt;
    const attempt = await insertNewAuthoringAttempt(connection, {
      ownerUserId: input.ownerUserId, characterId: input.characterId, kind: "create",
      idempotencyKey: input.idempotencyKey, requestDigest,
      sourceText: JSON.stringify(input.source), sourceDigest,
    });
    const saved = await saveCandidateInTransaction(connection, {
      attemptId: attempt.attemptId, ownerUserId: input.ownerUserId,
      envelope: parseCharacterCandidate({ ...envelope,
        provenance: { ...envelope.provenance, attemptId: attempt.attemptId } }),
      assistantMessage: "固定V3候補の全設定を確認して登録してください。",
    });
    await finishFamilyAuthoringJobInTransaction(connection, "character", attempt.attemptId, "completed");
    return saved;
  });
}

export async function failCharacterAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
  errorCode: string;
  executionFence?: AuthoringExecutionFence;
}): Promise<void> {
  await withTransaction(async (connection) => {
    if (input.executionFence) {
      await assertFamilyAuthoringFence(
        connection,
        "character",
        input.attemptId,
        input.executionFence,
      );
    }
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) return;
    const updatedAt = new Date().toISOString();
    const failed = await connection.query(
      `UPDATE character_authoring_attempts
          SET status = 'failed', error_code = $3, updated_at = $4
        WHERE attempt_id = $1 AND owner_user_id = $2
          AND status NOT IN ('succeeded', 'discarded', 'failed')`,
      [input.attemptId, input.ownerUserId, input.errorCode, updatedAt],
    );
    if (failed.rowCount === 1) {
      await insertOwnerNotification(connection, {
        ownerUserId: input.ownerUserId,
        kind: "authoring_failed",
        attemptId: input.attemptId,
        characterId: attempt.characterId,
        attemptKind: attempt.kind,
        createdAt: updatedAt,
      });
    }
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE character_asset_states
            SET compatibility_status = 'upgrade_failed', active_attempt_id = NULL,
                reason_code = $2, updated_at = $3
          WHERE character_id = $1`,
        [attempt.characterId, input.errorCode, updatedAt],
      );
    } else if (attempt.kind === "revision") {
      await connection.query(
        `UPDATE character_asset_states
            SET active_attempt_id = NULL, updated_at = $2
          WHERE character_id = $1 AND active_attempt_id = $3`,
        [attempt.characterId, updatedAt, attempt.attemptId],
      );
    }
    await finishFamilyAuthoringJobInTransaction(
      connection,
      "character",
      input.attemptId,
      "cancelled",
      input.executionFence,
    );
  });
}

export async function discardCharacterAuthoringAttempt(
  attemptId: string,
  ownerUserId: string,
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, attemptId, ownerUserId);
    if (!attempt || ["succeeded", "discarded"].includes(attempt.status)) return false;
    await assertFamilyAuthoringJobDiscardable(connection, "character", attemptId);
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE character_authoring_attempts
          SET status = 'discarded', source_text = NULL, updated_at = $3
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attemptId, ownerUserId, updatedAt],
    );
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE character_asset_states
            SET compatibility_status = 'unsupported', active_attempt_id = NULL,
                reason_code = 'owner_discarded_upgrade', updated_at = $2
          WHERE character_id = $1`,
        [attempt.characterId, updatedAt],
      );
    } else if (attempt.kind === "revision") {
      await connection.query(
        `UPDATE character_asset_states
            SET active_attempt_id = NULL, updated_at = $2
          WHERE character_id = $1 AND active_attempt_id = $3`,
        [attempt.characterId, updatedAt, attempt.attemptId],
      );
    }
    await finishFamilyAuthoringJobInTransaction(
      connection,
      "character",
      attemptId,
      "cancelled",
    );
    return true;
  });
}

async function readActivatedAuthoringResult(
  connection: DatabaseConnection,
  attempt: CharacterAuthoringAttempt,
  ownerUserId: string,
) {
  const generationResult = await connection.query<{
    asset_type: string;
    asset_id: string;
    generation: number;
    generation_id: string;
    schema_version: number;
    content_json: unknown;
    content_digest: string;
    created_at: string;
  }>(
    `SELECT * FROM asset_generations WHERE generation_id = $1`,
    [attempt.resultGenerationId],
  );
  const sheetResult = await connection.query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id = $1`,
    [attempt.characterId],
  );
  if (!generationResult.rows[0] || !sheetResult.rows[0]) {
    throw new Error("AUTHORING_RESULT_MISSING");
  }
  const generation = parseGeneration(generationResult.rows[0]);
  const current = CharacterSheetSchema.parse(typeof sheetResult.rows[0].sheet_json === "string"
    ? JSON.parse(sheetResult.rows[0].sheet_json) : sheetResult.rows[0].sheet_json);
  const sheet = candidateToSheet(parseCharacterCandidate(generation.content), {
    characterId: attempt.characterId, ownerUserId: ownerUserId,
    createdAt: current.createdAt, updatedAt: generation.createdAt,
    previousImageUrl: current.appearance.previousImageUrl,
    operational: { visibility: current.visibility, record: current.record,
      recordOverall: current.recordOverall, improvementMemo: current.improvementMemo,
      opponentMemories: current.opponentMemories, deletedAt: current.deletedAt,
      revisionSnapshot: current.revisionSnapshot },
  });
  return { kind: "activated" as const, value: { sheet, generation } };
}

type CharacterActivationInput = {
  attemptId: string;
  ownerUserId: string;
  allowFocusedMigrationActivation?: boolean;
  candidateDigest?: string;
};

async function activateFocusedMigrationAttempt(
  connection: DatabaseConnection,
  attempt: CharacterAuthoringAttempt,
  input: CharacterActivationInput,
) {
  if (!input.allowFocusedMigrationActivation) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_ACTIVATION_DISABLED");
  }
  const focused = await readCharacterFocusedMigrationActivationV3(
    attempt.attemptId,
    input.ownerUserId,
    connection,
  );
  if (!focused || attempt.status !== "awaiting_owner_acceptance") {
    throw new Error("AUTHORING_NOT_AWAITING_ACCEPTANCE");
  }
  await rejectStaleCharacterAuthoring(
    connection,
    attempt.characterId,
    input.ownerUserId,
    attempt.attemptId,
  );
  if (Date.parse(attempt.expiresAt) <= Date.now()) {
    throw new Error("AUTHORING_ATTEMPT_EXPIRED");
  }
  if (attempt.expectedGenerationId !== focused.expectedCurrentGenerationId) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_POINTER_IDENTITY_MISMATCH");
  }
  const sourceResult = await connection.query<GenerationRow>(
    `SELECT asset_type, asset_id, generation, generation_id, schema_version,
            content_json, content_digest, created_at
       FROM asset_generations
      WHERE generation_id = $1 AND asset_type = 'character' AND asset_id = $2`,
    [focused.expectedCurrentGenerationId, attempt.characterId],
  );
  const sourceGeneration = sourceResult.rows[0]
    ? parseGeneration(sourceResult.rows[0])
    : null;
  if (!sourceGeneration || sourceGeneration.schemaVersion !== 2
    || sourceGeneration.contentDigest !== attempt.expectedContentDigest) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_SOURCE_GENERATION_MISMATCH");
  }
  const sourceEnvelope = CharacterGenerationEnvelopeV2Schema.parse(
    sourceGeneration.content,
  );
  const currentSheetResult = await connection.query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id = $1`,
    [attempt.characterId],
  );
  const currentSheet = currentSheetResult.rows[0]
    ? CharacterSheetSchema.parse(typeof currentSheetResult.rows[0].sheet_json === "string"
        ? JSON.parse(currentSheetResult.rows[0].sheet_json)
        : currentSheetResult.rows[0].sheet_json)
    : null;
  if (!currentSheet || currentSheet.ownerUserId !== input.ownerUserId) {
    throw new Error("CHARACTER_OWNER_MISMATCH");
  }
  const updatedAt = new Date().toISOString();
  const envelope = CharacterGenerationEnvelopeV3Schema.parse({
    ...sourceEnvelope,
    definitionSchema: { family: "character", version: 3 },
    definition: focused.definition,
    provenance: {
      ...sourceEnvelope.provenance,
      attemptId: attempt.attemptId,
      structureGeneratorContract: focused.adapterIdentity,
    },
    compilerCompatibility:
      CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3.required,
    deferredValues: {
      contractVersion: 1,
      values: focused.deferredValues,
    },
  });
  const sheet = characterDefinitionV3ToLegacySheet({
    characterId: attempt.characterId,
    ownerUserId: input.ownerUserId,
    definition: envelope.definition,
    publicPresentation: envelope.publicPresentation,
    createdAt: currentSheet.createdAt,
    updatedAt,
    previousImageUrl: currentSheet.appearance.previousImageUrl,
    operational: {
      visibility: currentSheet.visibility,
      record: currentSheet.record,
      recordOverall: currentSheet.recordOverall,
      improvementMemo: currentSheet.improvementMemo,
      opponentMemories: currentSheet.opponentMemories,
      deletedAt: currentSheet.deletedAt,
      revisionSnapshot: currentSheet.revisionSnapshot,
    },
  });
  const generation = await appendAssetGeneration(connection, {
    assetType: "character",
    assetId: attempt.characterId,
    schemaVersion: 3,
    content: envelope,
    createdAt: updatedAt,
  });
  await activateAssetGeneration(
    connection,
    generation,
    focused.expectedCurrentGenerationId,
    updatedAt,
  );
  await connection.query(
    `UPDATE characters SET sheet_json = $2, updated_at = $3 WHERE id = $1`,
    [sheet.id, JSON.stringify(sheet), updatedAt],
  );
  await connection.query(
    `UPDATE character_asset_states
        SET compatibility_status = 'ready', current_generation_id = $2,
            active_attempt_id = NULL, reason_code = NULL, updated_at = $3
      WHERE character_id = $1`,
    [attempt.characterId, generation.generationId, updatedAt],
  );
  await connection.query(
    `UPDATE character_authoring_attempts
        SET status = 'succeeded', candidate_digest = $3,
            result_generation_id = $4, source_text = NULL, updated_at = $5
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attempt.attemptId, input.ownerUserId, focused.candidateDigest,
      generation.generationId, updatedAt],
  );
  return { kind: "activated" as const, value: { sheet, generation } };
}

async function expireCharacterActivation(
  connection: DatabaseConnection,
  attempt: CharacterAuthoringAttempt,
  ownerUserId: string,
): Promise<void> {
  const expiredAt = new Date().toISOString();
  await connection.query(
    `UPDATE character_authoring_attempts SET status = 'expired',
      source_text = NULL, updated_at = $3
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attempt.attemptId, ownerUserId, expiredAt],
  );
  if (attempt.kind === "upgrade") {
    await connection.query(
      `UPDATE character_asset_states
          SET compatibility_status = 'upgrade_failed',
              active_attempt_id = NULL,
              reason_code = 'authoring_attempt_expired', updated_at = $2
        WHERE character_id = $1 AND active_attempt_id = $3`,
      [attempt.characterId, expiredAt, attempt.attemptId],
    );
  } else if (attempt.kind === "revision") {
    await connection.query(
      `UPDATE character_asset_states
          SET active_attempt_id = NULL, updated_at = $2
        WHERE character_id = $1 AND active_attempt_id = $3`,
      [attempt.characterId, expiredAt, attempt.attemptId],
    );
  }
}

function assertActivationCandidate(
  attempt: CharacterAuthoringAttempt,
  candidate: CharacterAuthoringCandidate,
): void {
  assertCharacterCandidateReady(candidate);
  if (CharacterGenerationEnvelopeV3Schema.safeParse(candidate).success
    && (candidate.provenance.attemptId !== attempt.attemptId
      || candidate.provenance.sourceDigest !== attempt.sourceDigest)) {
    throw new Error("AUTHORING_CANDIDATE_PROVENANCE_MISMATCH");
  }
  if (assetContentDigest(candidate) !== attempt.candidateDigest) {
    throw new Error("AUTHORING_CANDIDATE_DIGEST_MISMATCH");
  }
}

async function readActivationCurrentSheet(
  connection: DatabaseConnection,
  attempt: CharacterAuthoringAttempt,
  ownerUserId: string,
): Promise<CharacterSheet | null> {
  const currentSheetResult = await connection.query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id = $1`,
    [attempt.characterId],
  );
  const currentSheet = currentSheetResult.rows[0]
    ? CharacterSheetSchema.parse(typeof currentSheetResult.rows[0].sheet_json === "string"
        ? JSON.parse(currentSheetResult.rows[0].sheet_json)
        : currentSheetResult.rows[0].sheet_json)
    : null;
  if (currentSheet && currentSheet.ownerUserId !== ownerUserId) {
    throw new Error("CHARACTER_OWNER_MISMATCH");
  }
  return currentSheet;
}

export async function activateCharacterAuthoringAttempt(input: CharacterActivationInput): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  const result = await withTransaction(async (connection) => {
    // Serialize duplicate confirmations before reading the candidate or appending a generation.
    if (databaseKind() === "postgres") await connection.query(
      `SELECT attempt_id FROM character_authoring_attempts WHERE attempt_id = $1 AND owner_user_id = $2 FOR UPDATE`,
      [input.attemptId, input.ownerUserId]);
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (attempt.candidate) assertCharacterV3WriteCandidate(attempt.candidate);
    if (attempt.candidate && CharacterGenerationEnvelopeV3Schema.safeParse(attempt.candidate).success
      && (!input.candidateDigest || input.candidateDigest !== attempt.candidateDigest)) {
      throw new Error("AUTHORING_REVIEW_DIGEST_MISMATCH");
    }
    if (attempt.status === "succeeded" && attempt.resultGenerationId) {
      return readActivatedAuthoringResult(connection, attempt, input.ownerUserId);
    }
    if (attempt.status !== "awaiting_owner_acceptance" || !attempt.candidate) {
      return activateFocusedMigrationAttempt(connection, attempt, input);
    }
    await rejectStaleCharacterAuthoring(
      connection,
      attempt.characterId,
      input.ownerUserId,
      attempt.attemptId,
    );
    if (Date.parse(attempt.expiresAt) <= Date.now()) {
      await expireCharacterActivation(connection, attempt, input.ownerUserId);
      return { kind: "expired" as const };
    }
    assertActivationCandidate(attempt, attempt.candidate);
    const currentSheet = await readActivationCurrentSheet(connection, attempt, input.ownerUserId);
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE character_authoring_attempts
          SET status = 'committing', updated_at = $3
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attempt.attemptId, input.ownerUserId, updatedAt],
    );
    const sheet = candidateToSheet(attempt.candidate, {
      characterId: attempt.characterId,
      ownerUserId: input.ownerUserId,
      createdAt: currentSheet?.createdAt ?? attempt.createdAt,
      updatedAt,
      previousImageUrl: currentSheet?.appearance.previousImageUrl,
      operational: currentSheet
        ? {
            visibility: currentSheet.visibility,
            record: currentSheet.record,
            recordOverall: currentSheet.recordOverall,
            improvementMemo: currentSheet.improvementMemo,
            opponentMemories: currentSheet.opponentMemories,
            deletedAt: currentSheet.deletedAt,
            revisionSnapshot: currentSheet.revisionSnapshot,
          }
        : undefined,
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "character",
      assetId: attempt.characterId,
      schemaVersion: attempt.candidate.definitionSchema.version,
      content: attempt.candidate,
      createdAt: updatedAt,
    });
    await connection.query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [sheet.id, sheet.ownerUserId, JSON.stringify(sheet), sheet.createdAt, sheet.updatedAt],
    );
    await activateAssetGeneration(
      connection,
      generation,
      attempt.expectedGenerationId,
      updatedAt,
    );
    await connection.query(
      `INSERT INTO character_asset_states
        (character_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)
       ON CONFLICT (character_id) DO UPDATE
         SET compatibility_status = 'ready',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = NULL,
             reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [attempt.characterId, generation.generationId, updatedAt],
    );
    await connection.query(
      `UPDATE character_authoring_attempts
          SET status = 'succeeded', result_generation_id = $3,
              source_text = NULL, updated_at = $4
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attempt.attemptId, input.ownerUserId, generation.generationId, updatedAt],
    );
    return { kind: "activated" as const, value: { sheet, generation } };
  });
  if (result.kind === "expired") throw new Error("AUTHORING_ATTEMPT_EXPIRED");
  return result.value;
}

function compatibilityResult(
  status: string,
  current: AssetGeneration | null,
  fallbackGenerationId: string | null,
  reasonCode: string | null,
): AssetCompatibility {
  return AssetCompatibilitySchema.parse({
    status,
    schemaVersion: current?.schemaVersion ?? null,
    currentGenerationId: current?.generationId ?? fallbackGenerationId,
    reasonCode,
  });
}

export async function getCharacterCompatibility(
  characterId: string,
): Promise<AssetCompatibility> {
  const state = await query<{
    compatibility_status: string;
    current_generation_id: string | null;
    reason_code: string | null;
  }>(
    `SELECT compatibility_status, current_generation_id, reason_code
       FROM character_asset_states WHERE character_id = $1`,
    [characterId],
  );
  const current = await getCurrentAssetGeneration("character", characterId);
  if (!state.rows[0]) {
    return compatibilityResult("unsupported", current, null, "legacy_schema");
  }
  const row = state.rows[0];
  if (row.compatibility_status === "ready" &&
      (!current || ![2, 3].includes(current.schemaVersion)
       || current.generationId !== row.current_generation_id)) {
    return compatibilityResult("unsupported", current, null, "state_pointer_mismatch");
  }
  if (row.compatibility_status === "ready" && current) {
    const reasonCode = characterReadinessReason(current.content);
    if (reasonCode) {
      return compatibilityResult("unsupported", current, null, reasonCode);
    }
  }
  return compatibilityResult(row.compatibility_status, current, row.current_generation_id, row.reason_code);
}

export async function getReadyCharacterGeneration(
  characterId: string,
): Promise<AssetGeneration | null> {
  const compatibility = await getCharacterCompatibility(characterId);
  if (compatibility.status !== "ready" || ![2, 3].includes(compatibility.schemaVersion ?? 0)) {
    return null;
  }
  const current = await getCurrentAssetGeneration("character", characterId);
  if (!current) return null;
  if (current.schemaVersion === 2) {
    assertCharacterGenerationReadyV2(CharacterGenerationEnvelopeV2Schema.parse(current.content));
  } else {
    try { assertCharacterCandidateReady(CharacterGenerationEnvelopeV3Schema.parse(current.content)); }
    catch { return null; } // Invalid claim receipts cannot authorize image-provider work or break profile display.
  }
  return current;
}

export type CharacterGenerationHistory = {
  current: AssetGeneration & { content: CharacterGenerationEnvelopeV3 };
  previous: (AssetGeneration & { content: CharacterGenerationEnvelopeV3 }) | null;
  previousPortrait: {
    generationId: string;
    mediaId: string;
    revisionId: string;
  } | null;
};

export async function getReadyCharacterGenerationHistory(
  characterId: string,
): Promise<CharacterGenerationHistory | null> {
  const currentGeneration = await getReadyCharacterGeneration(characterId);
  if (!currentGeneration || currentGeneration.schemaVersion !== 3) return null;
  const current = {
    ...currentGeneration,
    content: CharacterGenerationEnvelopeV3Schema.parse(assertCharacterCandidateReady(currentGeneration.content)),
  };
  const prior = await query<GenerationRow>(
    `SELECT asset_type, asset_id, generation, generation_id, schema_version,
            content_json, content_digest, created_at
       FROM asset_generations
      WHERE asset_type = 'character' AND asset_id = $1
        AND schema_version = 3 AND generation < $2
      ORDER BY generation DESC
      LIMIT 100`,
    [characterId, current.generation],
  ).then((result) => result.rows.flatMap((row) => {
    const generation = parseGeneration(row);
    try {
      return [{
        ...generation,
        content: CharacterGenerationEnvelopeV3Schema.parse(assertCharacterCandidateReady(generation.content)),
      }];
    } catch {
      return [];
    }
  }));
  const currentPortrait = current.content.definition.appearance.portrait;
  const previousPortraitGeneration = prior.find((generation) => {
    const portrait = generation.content.definition.appearance.portrait;
    return portrait != null && !samePortrait(currentPortrait, portrait);
  });
  const previousPortrait = previousPortraitGeneration
    ? {
        generationId: previousPortraitGeneration.generationId,
        mediaId: previousPortraitGeneration.content.definition.appearance.portrait!.mediaId,
        revisionId: previousPortraitGeneration.content.definition.appearance.portrait!.revisionId,
      }
    : null;
  return {
    current,
    previous: prior[0] ?? null,
    previousPortrait,
  };
}

export async function activateCharacterPortraitRevision(input: {
  characterId: string;
  ownerUserId: string;
  expectedGenerationId: string;
  operationId: string;
  mediaId: string;
  mediaRevisionId: string;
  sourceDigest: string;
}): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  return withTransaction(async (connection) => {
    const current = await selectReadyPortraitCharacter(
      connection,
      input.characterId,
      input.ownerUserId,
    );
    const updatedAt = new Date().toISOString();
    const envelope = CharacterGenerationEnvelopeV3Schema.parse({
      ...current.envelope,
      definition: {
        ...current.envelope.definition,
        appearance: {
          ...current.envelope.definition.appearance,
          portrait: {
            mediaId: input.mediaId,
            revisionId: input.mediaRevisionId,
          },
        },
      },
      provenance: {
        ...current.envelope.provenance,
        sourceKind: "media_revision",
        sourceDigest: input.sourceDigest,
        attemptId: `media:${input.operationId}`.slice(0, 160),
        structureGeneratorContract: "character-media-revision-v3",
      },
    });
    return commitPortraitGeneration({
      connection,
      current,
      expectedGenerationId: input.expectedGenerationId,
      envelope,
      previousImageUrl:
        current.envelope.definition.appearance.portrait?.mediaId ?? null,
      updatedAt,
    });
  });
}

export async function toggleCharacterPortraitGeneration(input: {
  characterId: string;
  ownerUserId: string;
  expectedGenerationId: string;
  operationId: string;
}): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  return withTransaction(async (connection) => {
    const current = await selectReadyPortraitCharacter(
      connection,
      input.characterId,
      input.ownerUserId,
    );
    if (current.generation.generationId !== input.expectedGenerationId) {
      throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
    }
    const currentPortrait = current.envelope.definition.appearance.portrait;
    if (!currentPortrait) throw new Error("NO_CURRENT_CHARACTER_PORTRAIT");
    const prior = await selectPriorPortraitGenerations(
      connection,
      input.characterId,
      current.generation.generation,
    );
    const target = prior.find((generation) => {
      const portrait = generation.content.definition.appearance.portrait;
      return portrait != null && !samePortrait(currentPortrait, portrait);
    });
    const targetPortrait = target?.content.definition.appearance.portrait;
    if (!targetPortrait) throw new Error("NO_PREVIOUS_CHARACTER_PORTRAIT");
    const updatedAt = new Date().toISOString();
    const sourceDigest = assetContentDigest({
      operation: "toggle_character_portrait",
      fromGenerationId: current.generation.generationId,
      targetGenerationId: target!.generationId,
    });
    const envelope = CharacterGenerationEnvelopeV3Schema.parse({
      ...current.envelope,
      definition: {
        ...current.envelope.definition,
        appearance: {
          ...current.envelope.definition.appearance,
          portrait: targetPortrait,
        },
      },
      provenance: {
        ...current.envelope.provenance,
        sourceKind: "media_revision",
        sourceDigest,
        attemptId: `media-toggle:${input.operationId}`.slice(0, 160),
        structureGeneratorContract: "character-media-revision-v3",
      },
    });
    return commitPortraitGeneration({
      connection,
      current,
      expectedGenerationId: input.expectedGenerationId,
      envelope,
      previousImageUrl: currentPortrait.mediaId,
      updatedAt,
    });
  });
}

export async function restorePreviousCharacterGeneration(input: {
  characterId: string;
  ownerUserId: string;
  expectedGenerationId: string;
  operationId: string;
}): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  throw new Error("CHARACTER_UPDATE_UNAVAILABLE");
}

export async function listReadyCharacterIds(
  characterIds: string[],
): Promise<Set<string>> {
  if (characterIds.length === 0) return new Set();
  const placeholders = characterIds.map((_, index) => `$${index + 1}`).join(", ");
  const result = await query<{ character_id: string; content_json: unknown }>(
    `SELECT s.character_id, g.content_json
       FROM character_asset_states s
       JOIN asset_current_generations c
         ON c.asset_type = 'character'
        AND c.asset_id = s.character_id
        AND c.generation_id = s.current_generation_id
       JOIN asset_generations g ON g.generation_id = c.generation_id
      WHERE s.compatibility_status = 'ready'
        AND g.schema_version IN (2, 3)
        AND s.character_id IN (${placeholders})`,
    characterIds,
  );
  return new Set(result.rows.flatMap((row) =>
    characterReadinessReason(
      typeof row.content_json === "string"
        ? JSON.parse(row.content_json)
        : row.content_json,
    ) == null
      ? [row.character_id]
      : []));
}

type ReadyPortraitCharacter = {
  sheet: CharacterSheet;
  generation: AssetGeneration;
  envelope: CharacterGenerationEnvelopeV3;
};
async function selectReadyPortraitCharacter(connection: DatabaseConnection, characterId: string, ownerUserId: string): Promise<ReadyPortraitCharacter> {
  if (databaseKind() === "postgres") {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", ["character", characterId]);
  }
  const found = await connection.query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id=$1 AND owner_user_id=$2${databaseKind() === "postgres" ? " FOR UPDATE" : ""}`,
    [characterId, ownerUserId],
  );
  if (!found.rows[0]) throw new Error("CHARACTER_OWNER_MISMATCH");
  const raw = found.rows[0].sheet_json;
  const sheet = CharacterSheetSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  if (sheet.deletedAt) throw new Error("CHARACTER_DELETED");
  const rows = await connection.query<GenerationRow>(`SELECT g.* FROM asset_generations g JOIN asset_current_generations c ON c.generation_id=g.generation_id JOIN character_asset_states s ON s.character_id=c.asset_id AND s.current_generation_id=g.generation_id WHERE c.asset_type='character' AND c.asset_id=$1 AND s.compatibility_status='ready' AND s.active_attempt_id IS NULL AND g.schema_version=3`, [characterId]);
  if (!rows.rows[0]) throw new Error("CHARACTER_V3_NOT_READY");
  await rejectBusyCharacterAuthoring(connection, characterId, ownerUserId, "revision");
  const generation = parseGeneration(rows.rows[0]);
  const envelope = CharacterGenerationEnvelopeV3Schema.parse(generation.content);
  assertCharacterCandidateReady(envelope);
  return { sheet, generation, envelope };
}
async function selectPriorPortraitGenerations(connection: DatabaseConnection, characterId: string, beforeGeneration: number) {
  const rows = await connection.query<GenerationRow>(`SELECT * FROM asset_generations WHERE asset_type='character' AND asset_id=$1 AND schema_version=3 AND generation<$2 ORDER BY generation DESC LIMIT 100`, [characterId, beforeGeneration]);
  return rows.rows.flatMap((row) => {
    const generation = parseGeneration(row);
    const parsed = CharacterGenerationEnvelopeV3Schema.safeParse(generation.content);
    return parsed.success ? [{ ...generation, content: parsed.data }] : [];
  });
}
async function commitPortraitGeneration(input: {
  connection: DatabaseConnection; current: ReadyPortraitCharacter; expectedGenerationId: string;
  envelope: CharacterGenerationEnvelopeV3; previousImageUrl: string | null; updatedAt: string;
}): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  if (input.current.generation.generationId !== input.expectedGenerationId) throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
  assertCharacterCandidateReady(input.envelope);
  const current = input.current.sheet;
  const sheet = characterDefinitionV3ToLegacySheet({ characterId: current.id, ownerUserId: current.ownerUserId,
    definition: input.envelope.definition, publicPresentation: input.envelope.publicPresentation,
    createdAt: current.createdAt, updatedAt: input.updatedAt, previousImageUrl: input.previousImageUrl,
    operational: { visibility: current.visibility, record: current.record, recordOverall: current.recordOverall,
      improvementMemo: current.improvementMemo, opponentMemories: current.opponentMemories,
      deletedAt: current.deletedAt, revisionSnapshot: current.revisionSnapshot } });
  const generation = await appendAssetGeneration(input.connection, { assetType: "character", assetId: current.id,
    schemaVersion: 3, content: input.envelope, createdAt: input.updatedAt });
  await activateAssetGeneration(input.connection, generation, input.expectedGenerationId, input.updatedAt);
  await input.connection.query("UPDATE characters SET sheet_json=$2,updated_at=$3 WHERE id=$1", [current.id, JSON.stringify(sheet), input.updatedAt]);
  const state = await input.connection.query(`UPDATE character_asset_states SET current_generation_id=$2,reason_code=NULL,updated_at=$3 WHERE character_id=$1 AND current_generation_id=$4 AND compatibility_status='ready' AND active_attempt_id IS NULL`, [current.id, generation.generationId, input.updatedAt, input.expectedGenerationId]);
  if (state.rowCount !== 1) throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
  return { sheet, generation };
}
