import {
  AssetAuthoringAttemptKindSchema,
  AssetAuthoringAttemptStatusSchema,
  AssetCompatibilitySchema,
  BattlefieldGenerationEnvelopeV2Schema,
  assertBattlefieldGenerationReadyV2,
  battlefieldDefinitionV2ToLegacyPreset,
  type AssetAuthoringAttemptKind,
  type AssetAuthoringAttemptStatus,
  type AssetCompatibility,
  type BattlefieldGenerationEnvelopeV2,
  type BattlefieldPreset,
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

export type BattlefieldAuthoringAttempt = {
  attemptId: string;
  ownerUserId: string;
  battlefieldId: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string | null;
  sourceDigest: string;
  expectedGenerationId: string | null;
  expectedContentDigest: string | null;
  status: AssetAuthoringAttemptStatus;
  candidate: BattlefieldGenerationEnvelopeV2 | null;
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
  battlefield_id: string;
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

function parseAttempt(row: AttemptRow): BattlefieldAuthoringAttempt {
  const rawCandidate = typeof row.candidate_json === "string"
    ? JSON.parse(row.candidate_json)
    : row.candidate_json;
  return {
    attemptId: row.attempt_id,
    ownerUserId: row.owner_user_id,
    battlefieldId: row.battlefield_id,
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
      : BattlefieldGenerationEnvelopeV2Schema.parse(rawCandidate),
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

function battlefieldReadinessReason(content: unknown): string | null {
  try {
    assertBattlefieldGenerationReadyV2(
      BattlefieldGenerationEnvelopeV2Schema.parse(content),
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("BATTLEFIELD_REQUIRED_COMPILER_MISSING:")) {
      return "missing_required_compiler";
    }
    if (message === "BATTLEFIELD_SCENE_CLAIM_RECEIPT_MISSING") {
      return "missing_claim_validation";
    }
    if (message.startsWith("BATTLEFIELD_SCENE_")) {
      return "invalid_claim_validation";
    }
    return "invalid_v2_envelope";
  }
}

async function selectAttempt(
  connection: DatabaseConnection,
  attemptId: string,
  ownerUserId: string,
): Promise<BattlefieldAuthoringAttempt | null> {
  const result = await connection.query<AttemptRow>(
    `SELECT * FROM battlefield_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attemptId, ownerUserId],
  );
  return result.rows[0] ? parseAttempt(result.rows[0]) : null;
}

async function currentGenerationRow(
  connection: DatabaseConnection,
  battlefieldId: string,
): Promise<{ generation_id: string; content_digest: string } | null> {
  const result = await connection.query<{
    generation_id: string;
    content_digest: string;
  }>(
    `SELECT c.generation_id, g.content_digest
       FROM asset_current_generations c
       JOIN asset_generations g ON g.generation_id = c.generation_id
      WHERE c.asset_type = 'battlefield-preset' AND c.asset_id = $1`,
    [battlefieldId],
  );
  return result.rows[0] ?? null;
}

export async function beginBattlefieldAuthoringAttempt(input: {
  ownerUserId: string;
  battlefieldId?: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string;
  sourceDigest: string;
  ttlMs?: number;
}): Promise<{ attempt: BattlefieldAuthoringAttempt; replayed: boolean }> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  return withTransaction(async (connection) => {
    const existing = await connection.query<AttemptRow>(
      `SELECT * FROM battlefield_authoring_attempts
        WHERE owner_user_id = $1 AND idempotency_key = $2`,
      [input.ownerUserId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      const attempt = parseAttempt(existing.rows[0]);
      if (attempt.requestDigest !== input.requestDigest) {
        throw new Error("AUTHORING_IDEMPOTENCY_CONFLICT");
      }
      return { attempt, replayed: true };
    }
    const battlefieldId = input.battlefieldId ?? newId("bfp");
    const row = await connection.query<{
      owner_user_id: string | null;
      is_system: boolean | number;
    }>(
      `SELECT owner_user_id, is_system FROM battlefields WHERE id = $1`,
      [battlefieldId],
    );
    const existingPreset = row.rows[0] ?? null;
    const expected = await currentGenerationRow(connection, battlefieldId);
    if (input.kind === "create" && (existingPreset || expected)) {
      throw new Error("BATTLEFIELD_ALREADY_EXISTS");
    }
    if (input.kind !== "create" &&
        (!existingPreset || existingPreset.owner_user_id !== input.ownerUserId ||
         Boolean(existingPreset.is_system))) {
      throw new Error("BATTLEFIELD_NOT_FOUND");
    }
    if (input.kind === "revision" && !expected) {
      throw new Error("BATTLEFIELD_GENERATION_MISSING");
    }
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + (input.ttlMs ?? 24 * 60 * 60 * 1000))
      .toISOString();
    const attemptId = newId("bat");
    await connection.query(
      `INSERT INTO battlefield_authoring_attempts
        (attempt_id, owner_user_id, battlefield_id, kind, idempotency_key,
         request_digest, source_text, source_digest, expected_generation_id,
         expected_content_digest, status, created_at, updated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               'pending_structure', $11, $11, $12)`,
      [
        attemptId,
        input.ownerUserId,
        battlefieldId,
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
        `INSERT INTO battlefield_asset_states
          (battlefield_id, compatibility_status, current_generation_id,
           active_attempt_id, reason_code, updated_at)
         VALUES ($1, 'upgrading', $2, $3, NULL, $4)
         ON CONFLICT (battlefield_id) DO UPDATE
           SET compatibility_status = 'upgrading',
               current_generation_id = EXCLUDED.current_generation_id,
               active_attempt_id = EXCLUDED.active_attempt_id,
               reason_code = NULL,
               updated_at = EXCLUDED.updated_at`,
        [battlefieldId, expected?.generation_id ?? null, attemptId, createdAt],
      );
    } else if (input.kind === "revision") {
      await connection.query(
        `UPDATE battlefield_asset_states
            SET active_attempt_id = $2, updated_at = $3
          WHERE battlefield_id = $1 AND compatibility_status = 'ready'`,
        [battlefieldId, attemptId, createdAt],
      );
    }
    const attempt = await selectAttempt(connection, attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_INSERT_FAILED");
    return { attempt, replayed: false };
  });
}

export function getBattlefieldAuthoringAttempt(
  attemptId: string,
  ownerUserId: string,
): Promise<BattlefieldAuthoringAttempt | null> {
  return query<AttemptRow>(
    `SELECT * FROM battlefield_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attemptId, ownerUserId],
  ).then((result) => result.rows[0] ? parseAttempt(result.rows[0]) : null);
}

export function getLatestBattlefieldAuthoringAttempt(
  ownerUserId: string,
): Promise<BattlefieldAuthoringAttempt | null> {
  return query<AttemptRow>(
    `SELECT * FROM battlefield_authoring_attempts
      WHERE owner_user_id = $1
        AND status IN ('pending_structure', 'generating_structure',
          'validating_structure', 'generating_description',
          'validating_description', 'awaiting_owner_acceptance')
      ORDER BY updated_at DESC LIMIT 1`,
    [ownerUserId],
  ).then((result) => result.rows[0] ? parseAttempt(result.rows[0]) : null);
}

export async function updateBattlefieldAuthoringStatus(input: {
  attemptId: string;
  ownerUserId: string;
  status: AssetAuthoringAttemptStatus;
  errorCode?: string | null;
}): Promise<void> {
  AssetAuthoringAttemptStatusSchema.parse(input.status);
  await query(
    `UPDATE battlefield_authoring_attempts
        SET status = $3, error_code = $4, updated_at = $5
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [
      input.attemptId,
      input.ownerUserId,
      input.status,
      input.errorCode ?? null,
      new Date().toISOString(),
    ],
  );
}

export async function replaceBattlefieldAuthoringSource(input: {
  attemptId: string;
  ownerUserId: string;
  sourceText: string;
  sourceDigest: string;
}): Promise<void> {
  const result = await query(
    `UPDATE battlefield_authoring_attempts
        SET source_text = $3, source_digest = $4,
            status = 'generating_structure', candidate_json = NULL,
            candidate_digest = NULL, error_code = NULL, updated_at = $5
      WHERE attempt_id = $1 AND owner_user_id = $2
        AND status = 'awaiting_owner_acceptance'`,
    [
      input.attemptId,
      input.ownerUserId,
      input.sourceText,
      input.sourceDigest,
      new Date().toISOString(),
    ],
  );
  if (result.rowCount !== 1) throw new Error("AUTHORING_ATTEMPT_NOT_EDITABLE");
}

export async function saveBattlefieldAuthoringCandidate(input: {
  attemptId: string;
  ownerUserId: string;
  envelope: BattlefieldGenerationEnvelopeV2;
  assistantMessage: string;
}): Promise<BattlefieldAuthoringAttempt> {
  const envelope = assertBattlefieldGenerationReadyV2(
    BattlefieldGenerationEnvelopeV2Schema.parse(input.envelope),
  );
  const candidateDigest = assetContentDigest(envelope);
  return withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (["succeeded", "discarded", "expired"].includes(attempt.status)) {
      throw new Error("AUTHORING_ATTEMPT_TERMINAL");
    }
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE battlefield_authoring_attempts
          SET candidate_json = $3, candidate_digest = $4,
              assistant_message = $5, status = 'awaiting_owner_acceptance',
              error_code = NULL, updated_at = $6
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [
        input.attemptId,
        input.ownerUserId,
        JSON.stringify(envelope),
        candidateDigest,
        input.assistantMessage,
        updatedAt,
      ],
    );
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE battlefield_asset_states
            SET compatibility_status = 'upgrading', active_attempt_id = $2,
                reason_code = NULL, updated_at = $3
          WHERE battlefield_id = $1`,
        [attempt.battlefieldId, attempt.attemptId, updatedAt],
      );
    }
    const saved = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!saved) throw new Error("AUTHORING_ATTEMPT_SAVE_FAILED");
    return saved;
  });
}

export async function failBattlefieldAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
  errorCode: string;
}): Promise<void> {
  await withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) return;
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE battlefield_authoring_attempts
          SET status = 'failed', error_code = $3, updated_at = $4
        WHERE attempt_id = $1 AND owner_user_id = $2
          AND status NOT IN ('succeeded', 'discarded')`,
      [input.attemptId, input.ownerUserId, input.errorCode, updatedAt],
    );
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE battlefield_asset_states
            SET compatibility_status = 'upgrade_failed', active_attempt_id = NULL,
                reason_code = $2, updated_at = $3
          WHERE battlefield_id = $1`,
        [attempt.battlefieldId, input.errorCode, updatedAt],
      );
    } else if (attempt.kind === "revision") {
      await connection.query(
        `UPDATE battlefield_asset_states
            SET active_attempt_id = NULL, updated_at = $2
          WHERE battlefield_id = $1 AND active_attempt_id = $3`,
        [attempt.battlefieldId, updatedAt, attempt.attemptId],
      );
    }
  });
}

export async function discardBattlefieldAuthoringAttempt(
  attemptId: string,
  ownerUserId: string,
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, attemptId, ownerUserId);
    if (!attempt || ["succeeded", "discarded"].includes(attempt.status)) return false;
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE battlefield_authoring_attempts
          SET status = 'discarded', source_text = NULL, updated_at = $3
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attemptId, ownerUserId, updatedAt],
    );
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE battlefield_asset_states
            SET compatibility_status = 'unsupported', active_attempt_id = NULL,
                reason_code = 'owner_discarded_upgrade', updated_at = $2
          WHERE battlefield_id = $1`,
        [attempt.battlefieldId, updatedAt],
      );
    } else if (attempt.kind === "revision") {
      await connection.query(
        `UPDATE battlefield_asset_states
            SET active_attempt_id = NULL, updated_at = $2
          WHERE battlefield_id = $1 AND active_attempt_id = $3`,
        [attempt.battlefieldId, updatedAt, attempt.attemptId],
      );
    }
    return true;
  });
}

export async function activateBattlefieldAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
}): Promise<{ preset: BattlefieldPreset; generation: AssetGeneration }> {
  const result = await withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (attempt.status === "succeeded" && attempt.resultGenerationId) {
      const generationResult = await connection.query<GenerationRow>(
        `SELECT * FROM asset_generations WHERE generation_id = $1`,
        [attempt.resultGenerationId],
      );
      const presetResult = await connection.query<{ sheet_json: unknown }>(
        `SELECT sheet_json FROM battlefields WHERE id = $1`,
        [attempt.battlefieldId],
      );
      if (!generationResult.rows[0] || !presetResult.rows[0]) {
        throw new Error("AUTHORING_RESULT_MISSING");
      }
      return {
        kind: "activated" as const,
        value: {
          preset: (typeof presetResult.rows[0].sheet_json === "string"
            ? JSON.parse(presetResult.rows[0].sheet_json)
            : presetResult.rows[0].sheet_json) as BattlefieldPreset,
          generation: parseGeneration(generationResult.rows[0]),
        },
      };
    }
    if (attempt.status !== "awaiting_owner_acceptance" || !attempt.candidate) {
      throw new Error("AUTHORING_NOT_AWAITING_ACCEPTANCE");
    }
    if (Date.parse(attempt.expiresAt) <= Date.now()) {
      const expiredAt = new Date().toISOString();
      await connection.query(
        `UPDATE battlefield_authoring_attempts SET status = 'expired',
          source_text = NULL, updated_at = $3
          WHERE attempt_id = $1 AND owner_user_id = $2`,
        [attempt.attemptId, input.ownerUserId, expiredAt],
      );
      if (attempt.kind === "upgrade") {
        await connection.query(
          `UPDATE battlefield_asset_states
              SET compatibility_status = 'upgrade_failed',
                  active_attempt_id = NULL,
                  reason_code = 'authoring_attempt_expired', updated_at = $2
            WHERE battlefield_id = $1 AND active_attempt_id = $3`,
          [attempt.battlefieldId, expiredAt, attempt.attemptId],
        );
      } else if (attempt.kind === "revision") {
        await connection.query(
          `UPDATE battlefield_asset_states
              SET active_attempt_id = NULL, updated_at = $2
            WHERE battlefield_id = $1 AND active_attempt_id = $3`,
          [attempt.battlefieldId, expiredAt, attempt.attemptId],
        );
      }
      return { kind: "expired" as const };
    }
    assertBattlefieldGenerationReadyV2(attempt.candidate);
    if (assetContentDigest(attempt.candidate) !== attempt.candidateDigest) {
      throw new Error("AUTHORING_CANDIDATE_DIGEST_MISMATCH");
    }
    const currentResult = await connection.query<{
      sheet_json: unknown;
      owner_user_id: string | null;
      is_system: boolean | number;
    }>(
      `SELECT sheet_json, owner_user_id, is_system
         FROM battlefields WHERE id = $1`,
      [attempt.battlefieldId],
    );
    const currentRow = currentResult.rows[0] ?? null;
    const currentPreset = currentRow
      ? (typeof currentRow.sheet_json === "string"
          ? JSON.parse(currentRow.sheet_json)
          : currentRow.sheet_json) as BattlefieldPreset
      : null;
    if (currentRow &&
        (currentRow.owner_user_id !== input.ownerUserId || Boolean(currentRow.is_system))) {
      throw new Error("BATTLEFIELD_OWNER_MISMATCH");
    }
    const actualCurrent = await currentGenerationRow(connection, attempt.battlefieldId);
    if ((actualCurrent?.generation_id ?? null) !== attempt.expectedGenerationId ||
        (actualCurrent?.content_digest ?? null) !== attempt.expectedContentDigest) {
      throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
    }
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE battlefield_authoring_attempts
          SET status = 'committing', updated_at = $3
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attempt.attemptId, input.ownerUserId, updatedAt],
    );
    const preset = battlefieldDefinitionV2ToLegacyPreset({
      battlefieldId: attempt.battlefieldId,
      ownerUserId: input.ownerUserId,
      isSystem: false,
      definition: attempt.candidate.definition,
      publicPresentation: attempt.candidate.publicPresentation,
      createdAt: currentPreset?.createdAt ?? attempt.createdAt,
      updatedAt,
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "battlefield-preset",
      assetId: attempt.battlefieldId,
      schemaVersion: 2,
      content: attempt.candidate,
      createdAt: updatedAt,
    });
    await connection.query(
      `INSERT INTO battlefields
        (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES ($1, $2, FALSE, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             is_system = FALSE,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [preset.id, input.ownerUserId, JSON.stringify(preset), preset.createdAt, updatedAt],
    );
    await activateAssetGeneration(
      connection,
      generation,
      attempt.expectedGenerationId,
      updatedAt,
    );
    await connection.query(
      `INSERT INTO battlefield_asset_states
        (battlefield_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)
       ON CONFLICT (battlefield_id) DO UPDATE
         SET compatibility_status = 'ready',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = NULL,
             reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [attempt.battlefieldId, generation.generationId, updatedAt],
    );
    await connection.query(
      `UPDATE battlefield_authoring_attempts
          SET status = 'succeeded', result_generation_id = $3,
              source_text = NULL, updated_at = $4
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attempt.attemptId, input.ownerUserId, generation.generationId, updatedAt],
    );
    return { kind: "activated" as const, value: { preset, generation } };
  });
  if (result.kind === "expired") throw new Error("AUTHORING_ATTEMPT_EXPIRED");
  return result.value;
}

export async function getBattlefieldCompatibility(
  battlefieldId: string,
): Promise<AssetCompatibility> {
  const state = await query<{
    compatibility_status: string;
    current_generation_id: string | null;
    reason_code: string | null;
  }>(
    `SELECT compatibility_status, current_generation_id, reason_code
       FROM battlefield_asset_states WHERE battlefield_id = $1`,
    [battlefieldId],
  );
  const current = await getCurrentAssetGeneration("battlefield-preset", battlefieldId);
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
    const reasonCode = battlefieldReadinessReason(current.content);
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

export async function getReadyBattlefieldGeneration(
  battlefieldId: string,
): Promise<AssetGeneration | null> {
  const compatibility = await getBattlefieldCompatibility(battlefieldId);
  if (compatibility.status !== "ready" || compatibility.schemaVersion !== 2) {
    return null;
  }
  const current = await getCurrentAssetGeneration("battlefield-preset", battlefieldId);
  if (!current) return null;
  assertBattlefieldGenerationReadyV2(
    BattlefieldGenerationEnvelopeV2Schema.parse(current.content),
  );
  return current;
}

export async function activateImportedBattlefield(input: {
  preset: BattlefieldPreset;
  envelope: BattlefieldGenerationEnvelopeV2;
}): Promise<AssetGeneration> {
  const envelope = assertBattlefieldGenerationReadyV2(input.envelope);
  return withTransaction(async (connection) => {
    const updatedAt = input.preset.updatedAt;
    const generation = await appendAssetGeneration(connection, {
      assetType: "battlefield-preset",
      assetId: input.preset.id,
      schemaVersion: 2,
      content: envelope,
      createdAt: updatedAt,
    });
    const current = await currentGenerationRow(connection, input.preset.id);
    await connection.query(
      `INSERT INTO battlefields
        (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             is_system = EXCLUDED.is_system,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [
        input.preset.id,
        input.preset.ownerUserId,
        input.preset.isSystem,
        JSON.stringify(input.preset),
        input.preset.createdAt,
        updatedAt,
      ],
    );
    await activateAssetGeneration(
      connection,
      generation,
      current?.generation_id ?? null,
      updatedAt,
    );
    await connection.query(
      `INSERT INTO battlefield_asset_states
        (battlefield_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)
       ON CONFLICT (battlefield_id) DO UPDATE
         SET compatibility_status = 'ready',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = NULL,
             reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [input.preset.id, generation.generationId, updatedAt],
    );
    return generation;
  });
}

export async function activateBattlefieldImageRevision(input: {
  battlefieldId: string;
  ownerUserId: string;
  expectedGenerationId: string;
  operationId: string;
  mediaId: string;
  mediaRevisionId: string;
}): Promise<{ preset: BattlefieldPreset; generation: AssetGeneration }> {
  return withTransaction(async (connection) => {
    const current = await currentGenerationRow(connection, input.battlefieldId);
    if (!current || current.generation_id !== input.expectedGenerationId) {
      throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
    }
    const generationRow = await connection.query<GenerationRow>(
      `SELECT * FROM asset_generations WHERE generation_id = $1`,
      [current.generation_id],
    );
    const presetRow = await connection.query<{
      sheet_json: unknown;
      owner_user_id: string | null;
      is_system: boolean | number;
    }>(
      `SELECT sheet_json, owner_user_id, is_system
         FROM battlefields WHERE id = $1`,
      [input.battlefieldId],
    );
    const sourceRow = generationRow.rows[0];
    const rawPreset = presetRow.rows[0];
    if (!sourceRow || !rawPreset || rawPreset.owner_user_id !== input.ownerUserId ||
        Boolean(rawPreset.is_system)) {
      throw new Error("BATTLEFIELD_V2_NOT_READY");
    }
    const source = assertBattlefieldGenerationReadyV2(
      BattlefieldGenerationEnvelopeV2Schema.parse(parseGeneration(sourceRow).content),
    );
    const updatedAt = new Date().toISOString();
    const envelope = BattlefieldGenerationEnvelopeV2Schema.parse({
      ...source,
      definition: {
        ...source.definition,
        appearance: {
          ...source.definition.appearance,
          image: {
            mediaId: input.mediaId,
            revisionId: input.mediaRevisionId,
          },
        },
      },
      provenance: {
        ...source.provenance,
        sourceKind: "media_revision",
        sourceDigest: assetContentDigest({
          prior: sourceRow.content_digest,
          operationId: input.operationId,
          mediaId: input.mediaId,
          mediaRevisionId: input.mediaRevisionId,
        }),
        attemptId: input.operationId,
      },
    });
    const raw = typeof rawPreset.sheet_json === "string"
      ? JSON.parse(rawPreset.sheet_json)
      : rawPreset.sheet_json;
    const currentPreset = raw as BattlefieldPreset;
    const preset = battlefieldDefinitionV2ToLegacyPreset({
      battlefieldId: input.battlefieldId,
      ownerUserId: input.ownerUserId,
      isSystem: false,
      definition: envelope.definition,
      publicPresentation: envelope.publicPresentation,
      createdAt: currentPreset.createdAt,
      updatedAt,
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "battlefield-preset",
      assetId: input.battlefieldId,
      schemaVersion: 2,
      content: envelope,
      createdAt: updatedAt,
    });
    await connection.query(
      `UPDATE battlefields SET sheet_json = $2, updated_at = $3 WHERE id = $1`,
      [input.battlefieldId, JSON.stringify(preset), updatedAt],
    );
    await activateAssetGeneration(
      connection,
      generation,
      input.expectedGenerationId,
      updatedAt,
    );
    await connection.query(
      `UPDATE battlefield_asset_states
          SET compatibility_status = 'ready', current_generation_id = $2,
              reason_code = NULL, updated_at = $3
        WHERE battlefield_id = $1`,
      [input.battlefieldId, generation.generationId, updatedAt],
    );
    return { preset, generation };
  });
}

export async function listReadyBattlefieldIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const placeholders = ids.map((_id, index) => `$${index + 1}`).join(", ");
  const result = await query<{ battlefield_id: string }>(
    `SELECT s.battlefield_id
       FROM battlefield_asset_states s
       JOIN asset_current_generations c
         ON c.asset_type = 'battlefield-preset'
        AND c.asset_id = s.battlefield_id
        AND c.generation_id = s.current_generation_id
       JOIN asset_generations g ON g.generation_id = c.generation_id
      WHERE s.compatibility_status = 'ready'
        AND g.schema_version = 2
        AND s.battlefield_id IN (${placeholders})`,
    ids,
  );
  const ready = new Set<string>();
  for (const row of result.rows) {
    if (await getReadyBattlefieldGeneration(row.battlefield_id)) {
      ready.add(row.battlefield_id);
    }
  }
  return ready;
}
