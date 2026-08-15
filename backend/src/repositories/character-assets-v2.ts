import {
  AssetAuthoringAttemptKindSchema,
  AssetAuthoringAttemptStatusSchema,
  AssetCompatibilitySchema,
  CharacterGenerationEnvelopeV2Schema,
  assertCharacterGenerationReadyV2,
  characterDefinitionV2ToLegacySheet,
  type AssetAuthoringAttemptKind,
  type AssetAuthoringAttemptStatus,
  type AssetCompatibility,
  type CharacterGenerationEnvelopeV2,
  type CharacterSheet,
} from "@kshiai/shared";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import { newId } from "../id.js";
import {
  activateAssetGeneration,
  appendAssetGeneration,
  assetContentDigest,
  getCurrentAssetGeneration,
  type AssetGeneration,
} from "./asset-generations.js";
import { insertOwnerNotification } from "./owner-notifications.js";

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
  candidate: CharacterGenerationEnvelopeV2 | null;
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

type ReadyCurrentCharacter = {
  sheet: CharacterSheet;
  generation: AssetGeneration;
  envelope: CharacterGenerationEnvelopeV2;
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
      : CharacterGenerationEnvelopeV2Schema.parse(rawCandidate),
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
    if (message.startsWith("PROFILE_")) return "invalid_claim_validation";
    return "invalid_v2_envelope";
  }
}

async function selectReadyCurrentCharacter(
  connection: DatabaseConnection,
  characterId: string,
  ownerUserId: string,
): Promise<ReadyCurrentCharacter> {
  const result = await connection.query<GenerationRow & { sheet_json: unknown }>(
    `SELECT g.asset_type, g.asset_id, g.generation, g.generation_id,
            g.schema_version, g.content_json, g.content_digest, g.created_at,
            ch.sheet_json
       FROM characters ch
       JOIN character_asset_states s
         ON s.character_id = ch.id
        AND s.compatibility_status = 'ready'
       JOIN asset_current_generations c
         ON c.asset_type = 'character'
        AND c.asset_id = ch.id
        AND c.generation_id = s.current_generation_id
       JOIN asset_generations g ON g.generation_id = c.generation_id
      WHERE ch.id = $1 AND ch.owner_user_id = $2 AND g.schema_version = 2`,
    [characterId, ownerUserId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("CHARACTER_V2_NOT_READY");
  const generation = parseGeneration(row);
  return {
    sheet: (typeof row.sheet_json === "string"
      ? JSON.parse(row.sheet_json)
      : row.sheet_json) as CharacterSheet,
    generation,
    envelope: assertCharacterGenerationReadyV2(
      CharacterGenerationEnvelopeV2Schema.parse(generation.content),
    ),
  };
}

async function selectPriorV2Generations(
  connection: DatabaseConnection,
  characterId: string,
  beforeGeneration: number,
): Promise<Array<AssetGeneration & { content: CharacterGenerationEnvelopeV2 }>> {
  const result = await connection.query<GenerationRow>(
    `SELECT asset_type, asset_id, generation, generation_id, schema_version,
            content_json, content_digest, created_at
       FROM asset_generations
      WHERE asset_type = 'character' AND asset_id = $1
        AND schema_version = 2 AND generation < $2
      ORDER BY generation DESC
      LIMIT 100`,
    [characterId, beforeGeneration],
  );
  return result.rows.flatMap((row) => {
    const generation = parseGeneration(row);
    try {
      return [{
        ...generation,
        content: assertCharacterGenerationReadyV2(
          CharacterGenerationEnvelopeV2Schema.parse(generation.content),
        ),
      }];
    } catch {
      return [];
    }
  });
}

function samePortrait(
  left: CharacterGenerationEnvelopeV2["definition"]["appearance"]["portrait"],
  right: CharacterGenerationEnvelopeV2["definition"]["appearance"]["portrait"],
): boolean {
  return left?.mediaId === right?.mediaId &&
    left?.revisionId === right?.revisionId;
}

async function commitDerivedCharacterGeneration(input: {
  connection: DatabaseConnection;
  current: ReadyCurrentCharacter;
  expectedGenerationId: string;
  envelope: CharacterGenerationEnvelopeV2;
  previousImageUrl?: string | null;
  updatedAt: string;
}): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  if (input.current.generation.generationId !== input.expectedGenerationId) {
    throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
  }
  const envelope = assertCharacterGenerationReadyV2(
    CharacterGenerationEnvelopeV2Schema.parse(input.envelope),
  );
  const generation = await appendAssetGeneration(input.connection, {
    assetType: "character",
    assetId: input.current.sheet.id,
    schemaVersion: 2,
    content: envelope,
    createdAt: input.updatedAt,
  });
  const currentSheet = input.current.sheet;
  const sheet = characterDefinitionV2ToLegacySheet({
    characterId: currentSheet.id,
    ownerUserId: currentSheet.ownerUserId,
    definition: envelope.definition,
    publicPresentation: envelope.publicPresentation,
    createdAt: currentSheet.createdAt,
    updatedAt: input.updatedAt,
    previousImageUrl: input.previousImageUrl !== undefined
      ? input.previousImageUrl
      : currentSheet.appearance.previousImageUrl,
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
  await input.connection.query(
    `UPDATE characters
        SET sheet_json = $3, updated_at = $4
      WHERE id = $1 AND owner_user_id = $2`,
    [sheet.id, sheet.ownerUserId, JSON.stringify(sheet), input.updatedAt],
  );
  await activateAssetGeneration(
    input.connection,
    generation,
    input.expectedGenerationId,
    input.updatedAt,
  );
  const state = await input.connection.query(
    `UPDATE character_asset_states
        SET current_generation_id = $2, active_attempt_id = NULL,
            reason_code = NULL, updated_at = $3
      WHERE character_id = $1 AND compatibility_status = 'ready'
        AND current_generation_id = $4`,
    [
      sheet.id,
      generation.generationId,
      input.updatedAt,
      input.expectedGenerationId,
    ],
  );
  if (state.rowCount !== 1) throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
  return { sheet, generation };
}

async function insertCharacterAuthoringJob(
  connection: DatabaseConnection,
  attemptId: string,
  ownerUserId: string,
  characterId: string,
  createdAt: string,
): Promise<void> {
  await connection.query(
    `INSERT INTO character_authoring_jobs
      (attempt_id, owner_user_id, character_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $4)`,
    [attemptId, ownerUserId, characterId, createdAt],
  );
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
): Promise<void> {
  if (kind === "create") return;
  const inflight = await connection.query<{ attempt_id: string }>(
    `SELECT attempt_id FROM character_authoring_attempts
      WHERE character_id = $1 AND owner_user_id = $2
        AND status IN ('pending_structure', 'generating_structure',
          'validating_structure', 'generating_description',
          'validating_description', 'awaiting_owner_acceptance',
          'committing')
      LIMIT 1`,
    [characterId, ownerUserId],
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

async function insertNewAuthoringAttempt(
  connection: DatabaseConnection,
  input: {
    ownerUserId: string;
    characterId?: string;
    kind: AssetAuthoringAttemptKind;
    idempotencyKey: string;
    requestDigest: string;
    sourceText: string;
    sourceDigest: string;
    ttlMs?: number;
  },
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
  await rejectBusyCharacterAuthoring(
    connection,
    characterId,
    input.ownerUserId,
    input.kind,
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
  if (input.kind === "upgrade") {
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
      [characterId, expected?.generation_id ?? null, attemptId, createdAt],
    );
  } else if (input.kind === "revision") {
    await connection.query(
      `UPDATE character_asset_states
          SET active_attempt_id = $2, updated_at = $3
        WHERE character_id = $1 AND compatibility_status = 'ready'`,
      [characterId, attemptId, createdAt],
    );
  }
  await insertCharacterAuthoringJob(
    connection,
    attemptId,
    input.ownerUserId,
    characterId,
    createdAt,
  );
  const attempt = await selectAttempt(connection, attemptId, input.ownerUserId);
  if (!attempt) throw new Error("AUTHORING_ATTEMPT_INSERT_FAILED");
  return attempt;
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
}): Promise<{ attempt: CharacterAuthoringAttempt; replayed: boolean }> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
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

export const AUTHORING_JOB_CLAIM_MS = 180_000;

export async function recoverExpiredCharacterAuthoringJobs(
  now = new Date().toISOString(),
): Promise<void> {
  await query(
    `UPDATE character_authoring_jobs
        SET status = 'pending', claimed_by = NULL, claimed_until = NULL,
            updated_at = $1
      WHERE status = 'claimed' AND claimed_until IS NOT NULL
        AND claimed_until <= $1`,
    [now],
  );
}

export async function claimNextCharacterAuthoringJob(input: {
  workerId: string;
  cap?: number;
  now?: Date;
}): Promise<{
  attemptId: string;
  ownerUserId: string;
  characterId: string;
} | null> {
  const cap = input.cap ?? 1;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const claimedUntil = new Date(now.getTime() + AUTHORING_JOB_CLAIM_MS).toISOString();
  await recoverExpiredCharacterAuthoringJobs(nowIso);
  return withTransaction(async (connection) => {
    const running = await connection.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM character_authoring_jobs
        WHERE status = 'claimed'`,
    );
    if (Number(running.rows[0]?.count ?? 0) >= cap) return null;
    const next = await connection.query<{
      attempt_id: string;
      owner_user_id: string;
      character_id: string;
    }>(
      `SELECT attempt_id, owner_user_id, character_id
         FROM character_authoring_jobs candidate
        WHERE status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM character_authoring_jobs sibling
             WHERE sibling.character_id = candidate.character_id
               AND sibling.status = 'claimed'
          )
        ORDER BY created_at ASC
        LIMIT 1`,
    );
    const row = next.rows[0];
    if (!row) return null;
    const claimed = await connection.query(
      `UPDATE character_authoring_jobs
          SET status = 'claimed', claimed_by = $2, claimed_until = $3,
              updated_at = $4
        WHERE attempt_id = $1 AND status = 'pending'`,
      [row.attempt_id, input.workerId, claimedUntil, nowIso],
    );
    if (claimed.rowCount !== 1) return null;
    return {
      attemptId: row.attempt_id,
      ownerUserId: row.owner_user_id,
      characterId: row.character_id,
    };
  });
}

export async function countOpenCharacterAuthoringJobs(): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM character_authoring_jobs
      WHERE status IN ('pending', 'claimed')`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function finishCharacterAuthoringJob(
  attemptId: string,
  status: "completed" | "cancelled",
): Promise<void> {
  await query(
    `UPDATE character_authoring_jobs
        SET status = $2, claimed_by = NULL, claimed_until = NULL,
            updated_at = $3
      WHERE attempt_id = $1 AND status IN ('pending', 'claimed')`,
    [attemptId, status, new Date().toISOString()],
  );
}

export async function updateCharacterAuthoringStatus(input: {
  attemptId: string;
  ownerUserId: string;
  status: AssetAuthoringAttemptStatus;
  errorCode?: string | null;
}): Promise<void> {
  AssetAuthoringAttemptStatusSchema.parse(input.status);
  await query(
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
}

export async function replaceCharacterAuthoringSource(input: {
  attemptId: string;
  ownerUserId: string;
  sourceText: string;
  sourceDigest: string;
}): Promise<void> {
  const updatedAt = new Date().toISOString();
  await withTransaction(async (connection) => {
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
  const reset = await connection.query(
    `UPDATE character_authoring_jobs
        SET status = 'pending', claimed_by = NULL, claimed_until = NULL,
            updated_at = $2
      WHERE attempt_id = $1 AND status IN ('completed', 'cancelled')`,
    [attempt.attemptId, updatedAt],
  );
  if (reset.rowCount === 1) return;
  await connection.query(
    `INSERT INTO character_authoring_jobs
      (attempt_id, owner_user_id, character_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $4)
     ON CONFLICT (attempt_id) DO NOTHING`,
    [attempt.attemptId, attempt.ownerUserId, attempt.characterId, updatedAt],
  );
}

export async function saveCharacterAuthoringCandidate(input: {
  attemptId: string;
  ownerUserId: string;
  envelope: CharacterGenerationEnvelopeV2;
  assistantMessage: string;
}): Promise<CharacterAuthoringAttempt> {
  const envelope = assertCharacterGenerationReadyV2(
    CharacterGenerationEnvelopeV2Schema.parse(input.envelope),
  );
  const candidateDigest = assetContentDigest(envelope);
  const updatedAt = new Date().toISOString();
  return withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (["succeeded", "discarded", "expired"].includes(attempt.status)) {
      throw new Error("AUTHORING_ATTEMPT_TERMINAL");
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
  });
}

export async function failCharacterAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
  errorCode: string;
}): Promise<void> {
  await withTransaction(async (connection) => {
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
    await connection.query(
      `UPDATE character_authoring_jobs
          SET status = 'cancelled', claimed_by = NULL, claimed_until = NULL,
              updated_at = $2
        WHERE attempt_id = $1 AND status IN ('pending', 'claimed')`,
      [input.attemptId, updatedAt],
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
    await connection.query(
      `UPDATE character_authoring_jobs
          SET status = 'cancelled', claimed_by = NULL, claimed_until = NULL,
              updated_at = $2
        WHERE attempt_id = $1 AND status IN ('pending', 'claimed')`,
      [attemptId, updatedAt],
    );
    return true;
  });
}

export async function activateCharacterAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
}): Promise<{ sheet: CharacterSheet; generation: AssetGeneration }> {
  const result = await withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (attempt.status === "succeeded" && attempt.resultGenerationId) {
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
      const row = generationResult.rows[0];
      return {
        kind: "activated" as const,
        value: {
          sheet: (typeof sheetResult.rows[0].sheet_json === "string"
            ? JSON.parse(sheetResult.rows[0].sheet_json)
            : sheetResult.rows[0].sheet_json) as CharacterSheet,
          generation: {
            assetType: row.asset_type,
            assetId: row.asset_id,
            generation: Number(row.generation),
            generationId: row.generation_id,
            schemaVersion: Number(row.schema_version),
            content: typeof row.content_json === "string"
              ? JSON.parse(row.content_json)
              : row.content_json,
            contentDigest: row.content_digest,
            createdAt: row.created_at,
          },
        },
      };
    }
    if (attempt.status !== "awaiting_owner_acceptance" || !attempt.candidate) {
      throw new Error("AUTHORING_NOT_AWAITING_ACCEPTANCE");
    }
    await rejectStaleCharacterAuthoring(
      connection,
      attempt.characterId,
      input.ownerUserId,
      attempt.attemptId,
    );
    if (Date.parse(attempt.expiresAt) <= Date.now()) {
      const expiredAt = new Date().toISOString();
      await connection.query(
        `UPDATE character_authoring_attempts SET status = 'expired',
          source_text = NULL, updated_at = $3
          WHERE attempt_id = $1 AND owner_user_id = $2`,
        [attempt.attemptId, input.ownerUserId, expiredAt],
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
      return { kind: "expired" as const };
    }
    assertCharacterGenerationReadyV2(attempt.candidate);
    if (assetContentDigest(attempt.candidate) !== attempt.candidateDigest) {
      throw new Error("AUTHORING_CANDIDATE_DIGEST_MISMATCH");
    }
    const currentSheetResult = await connection.query<{ sheet_json: unknown }>(
      `SELECT sheet_json FROM characters WHERE id = $1`,
      [attempt.characterId],
    );
    const currentSheet = currentSheetResult.rows[0]
      ? (typeof currentSheetResult.rows[0].sheet_json === "string"
          ? JSON.parse(currentSheetResult.rows[0].sheet_json)
          : currentSheetResult.rows[0].sheet_json) as CharacterSheet
      : null;
    if (currentSheet && currentSheet.ownerUserId !== input.ownerUserId) {
      throw new Error("CHARACTER_OWNER_MISMATCH");
    }
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE character_authoring_attempts
          SET status = 'committing', updated_at = $3
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attempt.attemptId, input.ownerUserId, updatedAt],
    );
    const sheet = characterDefinitionV2ToLegacySheet({
      characterId: attempt.characterId,
      ownerUserId: input.ownerUserId,
      definition: attempt.candidate.definition,
      publicPresentation: attempt.candidate.publicPresentation,
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
      schemaVersion: 2,
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
    return AssetCompatibilitySchema.parse({
      status: "unsupported",
      schemaVersion: current?.schemaVersion ?? null,
      currentGenerationId: current?.generationId ?? null,
      reasonCode: "legacy_schema",
    });
  }
  const row = state.rows[0];
  if (row.compatibility_status === "ready" &&
      (!current || current.schemaVersion !== 2 ||
       current.generationId !== row.current_generation_id)) {
    return AssetCompatibilitySchema.parse({
      status: "unsupported",
      schemaVersion: current?.schemaVersion ?? null,
      currentGenerationId: current?.generationId ?? null,
      reasonCode: "state_pointer_mismatch",
    });
  }
  if (row.compatibility_status === "ready" && current) {
    const reasonCode = characterReadinessReason(current.content);
    if (reasonCode) {
      return AssetCompatibilitySchema.parse({
        status: "unsupported",
        schemaVersion: current.schemaVersion,
        currentGenerationId: current.generationId,
        reasonCode,
      });
    }
  }
  return AssetCompatibilitySchema.parse({
    status: row.compatibility_status,
    schemaVersion: current?.schemaVersion ?? null,
    currentGenerationId: current?.generationId ?? row.current_generation_id,
    reasonCode: row.reason_code,
  });
}

export async function getReadyCharacterGeneration(
  characterId: string,
): Promise<AssetGeneration | null> {
  const compatibility = await getCharacterCompatibility(characterId);
  if (compatibility.status !== "ready" || compatibility.schemaVersion !== 2) {
    return null;
  }
  const current = await getCurrentAssetGeneration("character", characterId);
  if (!current) return null;
  assertCharacterGenerationReadyV2(
    CharacterGenerationEnvelopeV2Schema.parse(current.content),
  );
  return current;
}

export type CharacterGenerationHistory = {
  current: AssetGeneration & { content: CharacterGenerationEnvelopeV2 };
  previous: (AssetGeneration & { content: CharacterGenerationEnvelopeV2 }) | null;
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
  if (!currentGeneration) return null;
  const current = {
    ...currentGeneration,
    content: assertCharacterGenerationReadyV2(
      CharacterGenerationEnvelopeV2Schema.parse(currentGeneration.content),
    ),
  };
  const prior = await query<GenerationRow>(
    `SELECT asset_type, asset_id, generation, generation_id, schema_version,
            content_json, content_digest, created_at
       FROM asset_generations
      WHERE asset_type = 'character' AND asset_id = $1
        AND schema_version = 2 AND generation < $2
      ORDER BY generation DESC
      LIMIT 100`,
    [characterId, current.generation],
  ).then((result) => result.rows.flatMap((row) => {
    const generation = parseGeneration(row);
    try {
      return [{
        ...generation,
        content: assertCharacterGenerationReadyV2(
          CharacterGenerationEnvelopeV2Schema.parse(generation.content),
        ),
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
    const current = await selectReadyCurrentCharacter(
      connection,
      input.characterId,
      input.ownerUserId,
    );
    const updatedAt = new Date().toISOString();
    const envelope = CharacterGenerationEnvelopeV2Schema.parse({
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
        structureGeneratorContract: "character-media-revision-v2",
      },
    });
    return commitDerivedCharacterGeneration({
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
    const current = await selectReadyCurrentCharacter(
      connection,
      input.characterId,
      input.ownerUserId,
    );
    if (current.generation.generationId !== input.expectedGenerationId) {
      throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
    }
    const currentPortrait = current.envelope.definition.appearance.portrait;
    if (!currentPortrait) throw new Error("NO_CURRENT_CHARACTER_PORTRAIT");
    const prior = await selectPriorV2Generations(
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
    const envelope = CharacterGenerationEnvelopeV2Schema.parse({
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
        structureGeneratorContract: "character-media-revision-v2",
      },
    });
    return commitDerivedCharacterGeneration({
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
  return withTransaction(async (connection) => {
    const current = await selectReadyCurrentCharacter(
      connection,
      input.characterId,
      input.ownerUserId,
    );
    if (current.generation.generationId !== input.expectedGenerationId) {
      throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
    }
    const prior = await selectPriorV2Generations(
      connection,
      input.characterId,
      current.generation.generation,
    );
    const target = prior[0];
    if (!target) throw new Error("NO_PREVIOUS_CHARACTER_GENERATION");
    const updatedAt = new Date().toISOString();
    const sourceDigest = assetContentDigest({
      operation: "restore_character_generation",
      fromGenerationId: current.generation.generationId,
      targetGenerationId: target.generationId,
    });
    const envelope = CharacterGenerationEnvelopeV2Schema.parse({
      ...target.content,
      provenance: {
        ...target.content.provenance,
        sourceKind: "restore_revision",
        sourceDigest,
        attemptId: `restore:${input.operationId}`.slice(0, 160),
        structureGeneratorContract: "character-generation-restore-v2",
        descriptionGeneratorContract: "character-generation-restore-v2",
      },
    });
    return commitDerivedCharacterGeneration({
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
        AND g.schema_version = 2
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
