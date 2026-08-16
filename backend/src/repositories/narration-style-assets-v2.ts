import {
  AssetAuthoringAttemptKindSchema,
  AssetAuthoringAttemptStatusSchema,
  AssetCompatibilitySchema,
  NarrationGenerationEnvelopeV2Schema,
  assertNarrationGenerationReadyV2,
  narrationDefinitionV2ToLegacyStyle,
  type AssetAuthoringAttemptKind,
  type AssetAuthoringAttemptStatus,
  type AssetCompatibility,
  type NarrationGenerationEnvelopeV2,
  type NarrationStyle,
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
import {
  finishFamilyAuthoringJob,
  insertFamilyAuthoringJob,
} from "./family-authoring-jobs.js";
import { insertOwnerNotification } from "./owner-notifications.js";
import {
  isoTimestamp,
  parseAuthoringAttemptBase,
  projectAssetCompatibility,
  type AuthoringAttemptRow,
} from "./authoring-attempt-row.js";

export type NarrationStyleAuthoringAttempt = {
  attemptId: string;
  ownerUserId: string;
  narrationStyleId: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string | null;
  sourceDigest: string;
  expectedGenerationId: string | null;
  expectedContentDigest: string | null;
  status: AssetAuthoringAttemptStatus;
  candidate: NarrationGenerationEnvelopeV2 | null;
  candidateDigest: string | null;
  assistantMessage: string;
  errorCode: string | null;
  resultGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type AttemptRow = AuthoringAttemptRow & { narration_style_id: string };

function parseAttempt(row: AttemptRow): NarrationStyleAuthoringAttempt {
  const base = parseAuthoringAttemptBase(row);
  return {
    ...base,
    narrationStyleId: row.narration_style_id,
    candidate: base.rawCandidate == null
      ? null
      : NarrationGenerationEnvelopeV2Schema.parse(base.rawCandidate),
  };
}

async function selectAttempt(
  connection: DatabaseConnection,
  attemptId: string,
  ownerUserId: string,
): Promise<NarrationStyleAuthoringAttempt | null> {
  const result = await connection.query<AttemptRow>(
    `SELECT * FROM narration_style_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [attemptId, ownerUserId],
  );
  return result.rows[0] ? parseAttempt(result.rows[0]) : null;
}

async function currentGenerationRow(
  connection: DatabaseConnection,
  narrationStyleId: string,
): Promise<{ generation_id: string; content_digest: string } | null> {
  const result = await connection.query<{
    generation_id: string;
    content_digest: string;
  }>(
    `SELECT c.generation_id, g.content_digest
       FROM asset_current_generations c
       JOIN asset_generations g ON g.generation_id = c.generation_id
      WHERE c.asset_type = 'narration-style' AND c.asset_id = $1`,
    [narrationStyleId],
  );
  return result.rows[0] ?? null;
}

export async function beginNarrationStyleAuthoringAttempt(input: {
  ownerUserId: string;
  narrationStyleId?: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string;
  sourceDigest: string;
  ttlMs?: number;
}): Promise<{ attempt: NarrationStyleAuthoringAttempt; replayed: boolean }> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  return withTransaction(async (connection) => {
    const replay = await connection.query<AttemptRow>(
      `SELECT * FROM narration_style_authoring_attempts
        WHERE owner_user_id = $1 AND idempotency_key = $2`,
      [input.ownerUserId, input.idempotencyKey],
    );
    if (replay.rows[0]) {
      const attempt = parseAttempt(replay.rows[0]);
      if (attempt.requestDigest !== input.requestDigest) {
        throw new Error("AUTHORING_IDEMPOTENCY_CONFLICT");
      }
      return { attempt, replayed: true };
    }

    const narrationStyleId = input.narrationStyleId ?? newId("nst");
    const row = await connection.query<{
      owner_user_id: string | null;
      is_system: boolean | number;
    }>(
      `SELECT owner_user_id, is_system FROM narration_styles WHERE id = $1`,
      [narrationStyleId],
    );
    const existing = row.rows[0] ?? null;
    const expected = await currentGenerationRow(connection, narrationStyleId);
    if (input.kind === "create" && (existing || expected)) {
      throw new Error("NARRATION_STYLE_ALREADY_EXISTS");
    }
    if (input.kind !== "create" &&
        (!existing || existing.owner_user_id !== input.ownerUserId ||
         Boolean(existing.is_system))) {
      throw new Error("NARRATION_STYLE_NOT_FOUND");
    }
    if (input.kind === "revision" && !expected) {
      throw new Error("NARRATION_STYLE_GENERATION_MISSING");
    }
    if (input.kind !== "create") {
      const inflight = await connection.query<{ attempt_id: string }>(
        `SELECT attempt_id FROM narration_style_authoring_attempts
          WHERE narration_style_id = $1 AND owner_user_id = $2
            AND status IN ('pending_structure', 'generating_structure',
              'validating_structure', 'generating_description',
              'validating_description', 'awaiting_owner_acceptance',
              'committing')
          LIMIT 1`,
        [narrationStyleId, input.ownerUserId],
      );
      if (inflight.rows[0]) throw new Error("AUTHORING_ALREADY_IN_PROGRESS");
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + (input.ttlMs ?? 24 * 60 * 60 * 1000),
    ).toISOString();
    const attemptId = newId("nat");
    await connection.query(
      `INSERT INTO narration_style_authoring_attempts
        (attempt_id, owner_user_id, narration_style_id, kind, idempotency_key,
         request_digest, source_text, source_digest, expected_generation_id,
         expected_content_digest, status, created_at, updated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               'pending_structure', $11, $11, $12)`,
      [
        attemptId,
        input.ownerUserId,
        narrationStyleId,
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
        `INSERT INTO narration_style_asset_states
          (narration_style_id, compatibility_status, current_generation_id,
           active_attempt_id, reason_code, updated_at)
         VALUES ($1, 'upgrading', $2, $3, NULL, $4)
         ON CONFLICT (narration_style_id) DO UPDATE
           SET compatibility_status = 'upgrading',
               active_attempt_id = EXCLUDED.active_attempt_id,
               reason_code = NULL, updated_at = EXCLUDED.updated_at`,
        [narrationStyleId, expected?.generation_id ?? null, attemptId, createdAt],
      );
    } else if (input.kind === "revision") {
      await connection.query(
        `UPDATE narration_style_asset_states
            SET active_attempt_id = $2, updated_at = $3
          WHERE narration_style_id = $1`,
        [narrationStyleId, attemptId, createdAt],
      );
    }
    await insertFamilyAuthoringJob(connection, "narration_style", {
      attemptId,
      ownerUserId: input.ownerUserId,
      assetId: narrationStyleId,
      createdAt,
    });
    const attempt = await selectAttempt(connection, attemptId, input.ownerUserId);
    return { attempt: attempt!, replayed: false };
  });
}

export function getNarrationStyleAuthoringAttempt(
  attemptId: string,
  ownerUserId: string,
): Promise<NarrationStyleAuthoringAttempt | null> {
  return withTransaction((connection) =>
    selectAttempt(connection, attemptId, ownerUserId));
}

export async function getLatestNarrationStyleAuthoringAttemptForAsset(
  narrationStyleId: string,
  ownerUserId: string,
): Promise<NarrationStyleAuthoringAttempt | null> {
  const result = await query<AttemptRow>(
    `SELECT * FROM narration_style_authoring_attempts
      WHERE narration_style_id = $1 AND owner_user_id = $2
      ORDER BY updated_at DESC LIMIT 1`,
    [narrationStyleId, ownerUserId],
  );
  return result.rows[0] ? parseAttempt(result.rows[0]) : null;
}

export async function getLatestNarrationStyleAuthoringAttempt(
  ownerUserId: string,
): Promise<NarrationStyleAuthoringAttempt | null> {
  const result = await query<AttemptRow>(
    `SELECT * FROM narration_style_authoring_attempts
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC LIMIT 1`,
    [ownerUserId],
  );
  return result.rows[0] ? parseAttempt(result.rows[0]) : null;
}

export async function saveNarrationStyleAuthoringCandidate(input: {
  attemptId: string;
  ownerUserId: string;
  envelope: NarrationGenerationEnvelopeV2;
  assistantMessage: string;
}): Promise<NarrationStyleAuthoringAttempt> {
  const envelope = assertNarrationGenerationReadyV2(input.envelope);
  return withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt || ["succeeded", "discarded", "expired"].includes(attempt.status)) {
      throw new Error("AUTHORING_ATTEMPT_NOT_WRITABLE");
    }
    if (Date.parse(attempt.expiresAt) <= Date.now()) {
      throw new Error("AUTHORING_ATTEMPT_EXPIRED");
    }
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE narration_style_authoring_attempts
          SET status = 'awaiting_owner_acceptance', candidate_json = $3,
              candidate_digest = $4, assistant_message = $5,
              error_code = NULL, updated_at = $6
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [
        input.attemptId,
        input.ownerUserId,
        JSON.stringify(envelope),
        assetContentDigest(envelope),
        input.assistantMessage,
        updatedAt,
      ],
    );
    await insertOwnerNotification(connection, {
      ownerUserId: input.ownerUserId,
      kind: "authoring_ready",
      attemptId: input.attemptId,
      characterId: attempt.narrationStyleId,
      attemptKind: attempt.kind,
      createdAt: updatedAt,
      assetType: "narration_style",
    });
    return (await selectAttempt(connection, input.attemptId, input.ownerUserId))!;
  });
}

export async function failNarrationStyleAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
  errorCode: string;
}): Promise<void> {
  await withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt || ["succeeded", "discarded"].includes(attempt.status)) return;
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE narration_style_authoring_attempts
          SET status = 'failed', source_text = NULL, error_code = $3,
              updated_at = $4 WHERE attempt_id = $1 AND owner_user_id = $2`,
      [input.attemptId, input.ownerUserId, input.errorCode, updatedAt],
    );
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE narration_style_asset_states
            SET compatibility_status = 'upgrade_failed', active_attempt_id = NULL,
                reason_code = $2, updated_at = $3
          WHERE narration_style_id = $1`,
        [attempt.narrationStyleId, input.errorCode, updatedAt],
      );
    } else if (attempt.kind === "revision") {
      await connection.query(
        `UPDATE narration_style_asset_states
            SET active_attempt_id = NULL, updated_at = $2
          WHERE narration_style_id = $1 AND active_attempt_id = $3`,
        [attempt.narrationStyleId, updatedAt, attempt.attemptId],
      );
    }
    await insertOwnerNotification(connection, {
      ownerUserId: input.ownerUserId,
      kind: "authoring_failed",
      attemptId: input.attemptId,
      characterId: attempt.narrationStyleId,
      attemptKind: attempt.kind,
      createdAt: updatedAt,
      assetType: "narration_style",
    });
    await finishFamilyAuthoringJob("narration_style", input.attemptId, "cancelled");
  });
}

export async function discardNarrationStyleAuthoringAttempt(
  attemptId: string,
  ownerUserId: string,
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, attemptId, ownerUserId);
    if (!attempt || ["succeeded", "discarded"].includes(attempt.status)) return false;
    const updatedAt = new Date().toISOString();
    await connection.query(
      `UPDATE narration_style_authoring_attempts
          SET status = 'discarded', source_text = NULL, updated_at = $3
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attemptId, ownerUserId, updatedAt],
    );
    if (attempt.kind === "upgrade") {
      await connection.query(
        `UPDATE narration_style_asset_states
            SET compatibility_status = 'unsupported', active_attempt_id = NULL,
                reason_code = 'owner_discarded_upgrade', updated_at = $2
          WHERE narration_style_id = $1`,
        [attempt.narrationStyleId, updatedAt],
      );
    } else if (attempt.kind === "revision") {
      await connection.query(
        `UPDATE narration_style_asset_states
            SET active_attempt_id = NULL, updated_at = $2
          WHERE narration_style_id = $1 AND active_attempt_id = $3`,
        [attempt.narrationStyleId, updatedAt, attempt.attemptId],
      );
    }
    await finishFamilyAuthoringJob("narration_style", attemptId, "cancelled");
    return true;
  });
}

export async function activateNarrationStyleAuthoringAttempt(input: {
  attemptId: string;
  ownerUserId: string;
}): Promise<{ style: NarrationStyle; generation: AssetGeneration }> {
  const result = await withTransaction(async (connection) => {
    const attempt = await selectAttempt(connection, input.attemptId, input.ownerUserId);
    if (!attempt) throw new Error("AUTHORING_ATTEMPT_NOT_FOUND");
    if (attempt.status === "succeeded" && attempt.resultGenerationId) {
      const styleResult = await connection.query<{ sheet_json: unknown }>(
        `SELECT sheet_json FROM narration_styles WHERE id = $1`,
        [attempt.narrationStyleId],
      );
      const generationResult = await connection.query<{
        asset_type: string;
        asset_id: string;
        generation: number;
        generation_id: string;
        schema_version: number;
        content_json: unknown;
        content_digest: string;
        created_at: string | Date;
      }>(
        `SELECT * FROM asset_generations WHERE generation_id = $1`,
        [attempt.resultGenerationId],
      );
      if (!styleResult.rows[0] || !generationResult.rows[0]) {
        throw new Error("AUTHORING_RESULT_MISSING");
      }
      const rawStyle = styleResult.rows[0].sheet_json;
      const row = generationResult.rows[0];
      return {
        kind: "activated" as const,
        value: {
          style: (typeof rawStyle === "string" ? JSON.parse(rawStyle) : rawStyle) as NarrationStyle,
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
          createdAt: isoTimestamp(row.created_at),
          },
        },
      };
    }
    if (attempt.status !== "awaiting_owner_acceptance" || !attempt.candidate) {
      throw new Error("AUTHORING_NOT_AWAITING_ACCEPTANCE");
    }
    const latest = await connection.query<{ attempt_id: string }>(
      `SELECT attempt_id FROM narration_style_authoring_attempts
        WHERE narration_style_id = $1 AND owner_user_id = $2
        ORDER BY updated_at DESC LIMIT 1`,
      [attempt.narrationStyleId, input.ownerUserId],
    );
    if (latest.rows[0] && latest.rows[0].attempt_id !== attempt.attemptId) {
      throw new Error("AUTHORING_ATTEMPT_STALE");
    }
    if (Date.parse(attempt.expiresAt) <= Date.now()) {
      const expiredAt = new Date().toISOString();
      await connection.query(
        `UPDATE narration_style_authoring_attempts
            SET status = 'expired', source_text = NULL, updated_at = $3
          WHERE attempt_id = $1 AND owner_user_id = $2`,
        [attempt.attemptId, input.ownerUserId, expiredAt],
      );
      if (attempt.kind === "upgrade") {
        await connection.query(
          `UPDATE narration_style_asset_states
              SET compatibility_status = 'upgrade_failed',
                  active_attempt_id = NULL,
                  reason_code = 'authoring_attempt_expired', updated_at = $2
            WHERE narration_style_id = $1 AND active_attempt_id = $3`,
          [attempt.narrationStyleId, expiredAt, attempt.attemptId],
        );
      } else if (attempt.kind === "revision") {
        await connection.query(
          `UPDATE narration_style_asset_states
              SET active_attempt_id = NULL, updated_at = $2
            WHERE narration_style_id = $1 AND active_attempt_id = $3`,
          [attempt.narrationStyleId, expiredAt, attempt.attemptId],
        );
      }
      return { kind: "expired" as const };
    }
    assertNarrationGenerationReadyV2(attempt.candidate);
    if (assetContentDigest(attempt.candidate) !== attempt.candidateDigest) {
      throw new Error("AUTHORING_CANDIDATE_DIGEST_MISMATCH");
    }
    const currentResult = await connection.query<{
      sheet_json: unknown;
      owner_user_id: string | null;
      is_system: boolean | number;
    }>(
      `SELECT sheet_json, owner_user_id, is_system
         FROM narration_styles WHERE id = $1`,
      [attempt.narrationStyleId],
    );
    const currentRow = currentResult.rows[0] ?? null;
    if (currentRow &&
        (currentRow.owner_user_id !== input.ownerUserId || Boolean(currentRow.is_system))) {
      throw new Error("NARRATION_STYLE_OWNER_MISMATCH");
    }
    const currentStyle = currentRow
      ? (typeof currentRow.sheet_json === "string"
          ? JSON.parse(currentRow.sheet_json)
          : currentRow.sheet_json) as NarrationStyle
      : null;
    const actual = await currentGenerationRow(connection, attempt.narrationStyleId);
    if ((actual?.generation_id ?? null) !== attempt.expectedGenerationId ||
        (actual?.content_digest ?? null) !== attempt.expectedContentDigest) {
      throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
    }

    const updatedAt = new Date().toISOString();
    const style = narrationDefinitionV2ToLegacyStyle({
      styleId: attempt.narrationStyleId,
      ownerUserId: input.ownerUserId,
      isSystem: false,
      definition: attempt.candidate.definition,
      publicPresentation: attempt.candidate.publicPresentation,
      createdAt: currentStyle?.createdAt ?? attempt.createdAt,
      updatedAt,
      visibility: currentStyle?.visibility,
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "narration-style",
      assetId: attempt.narrationStyleId,
      schemaVersion: 2,
      content: attempt.candidate,
      createdAt: updatedAt,
    });
    await connection.query(
      `INSERT INTO narration_styles
        (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES ($1, $2, FALSE, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id, is_system = FALSE,
             sheet_json = EXCLUDED.sheet_json, updated_at = EXCLUDED.updated_at`,
      [style.id, input.ownerUserId, JSON.stringify(style), style.createdAt, updatedAt],
    );
    await activateAssetGeneration(
      connection,
      generation,
      attempt.expectedGenerationId,
      updatedAt,
    );
    await connection.query(
      `INSERT INTO narration_style_asset_states
        (narration_style_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)
       ON CONFLICT (narration_style_id) DO UPDATE
         SET compatibility_status = 'ready',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = NULL, reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [style.id, generation.generationId, updatedAt],
    );
    await connection.query(
      `UPDATE narration_style_authoring_attempts
          SET status = 'succeeded', result_generation_id = $3,
              source_text = NULL, updated_at = $4
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [attempt.attemptId, input.ownerUserId, generation.generationId, updatedAt],
    );
    return { kind: "activated" as const, value: { style, generation } };
  });
  if (result.kind === "expired") throw new Error("AUTHORING_ATTEMPT_EXPIRED");
  return result.value;
}

function readinessReason(content: unknown): string | null {
  try {
    assertNarrationGenerationReadyV2(
      NarrationGenerationEnvelopeV2Schema.parse(content),
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("NARRATION_REQUIRED_COMPILER_MISSING:")) {
      return "missing_required_compiler";
    }
    if (message === "NARRATION_STYLE_CLAIM_RECEIPT_MISSING") {
      return "missing_claim_validation";
    }
    if (message.startsWith("NARRATION_STYLE_")) {
      return "invalid_claim_validation";
    }
    return "invalid_v2_envelope";
  }
}

export async function getNarrationStyleCompatibility(
  narrationStyleId: string,
): Promise<AssetCompatibility> {
  const state = await query<{
    compatibility_status: string;
    current_generation_id: string | null;
    reason_code: string | null;
  }>(
    `SELECT compatibility_status, current_generation_id, reason_code
       FROM narration_style_asset_states WHERE narration_style_id = $1`,
    [narrationStyleId],
  );
  const current = await getCurrentAssetGeneration("narration-style", narrationStyleId);
  return projectAssetCompatibility({
    state: state.rows[0],
    current,
    readinessReason,
  });
}

export async function getReadyNarrationStyleGeneration(
  narrationStyleId: string,
): Promise<AssetGeneration | null> {
  const compatibility = await getNarrationStyleCompatibility(narrationStyleId);
  if (compatibility.status !== "ready" || compatibility.schemaVersion !== 2) {
    return null;
  }
  const current = await getCurrentAssetGeneration("narration-style", narrationStyleId);
  if (!current) return null;
  assertNarrationGenerationReadyV2(
    NarrationGenerationEnvelopeV2Schema.parse(current.content),
  );
  return current;
}

export async function activateImportedNarrationStyle(input: {
  style: NarrationStyle;
  envelope: NarrationGenerationEnvelopeV2;
}): Promise<AssetGeneration> {
  const envelope = assertNarrationGenerationReadyV2(input.envelope);
  return withTransaction(async (connection) => {
    const style = narrationDefinitionV2ToLegacyStyle({
      styleId: input.style.id,
      ownerUserId: input.style.ownerUserId,
      isSystem: input.style.isSystem,
      definition: envelope.definition,
      publicPresentation: envelope.publicPresentation,
      createdAt: input.style.createdAt,
      updatedAt: input.style.updatedAt,
      visibility: input.style.visibility,
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "narration-style",
      assetId: style.id,
      schemaVersion: 2,
      content: envelope,
      createdAt: style.updatedAt,
    });
    const current = await currentGenerationRow(connection, input.style.id);
    await connection.query(
      `INSERT INTO narration_styles
        (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             is_system = EXCLUDED.is_system,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [
        style.id,
        style.ownerUserId,
        style.isSystem,
        JSON.stringify(style),
        style.createdAt,
        style.updatedAt,
      ],
    );
    await activateAssetGeneration(
      connection,
      generation,
      current?.generation_id ?? null,
      style.updatedAt,
    );
    await connection.query(
      `INSERT INTO narration_style_asset_states
        (narration_style_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)
       ON CONFLICT (narration_style_id) DO UPDATE
         SET compatibility_status = 'ready',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = NULL, reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [style.id, generation.generationId, style.updatedAt],
    );
    return generation;
  });
}

export async function listReadyNarrationStyleIds(
  ids: string[],
): Promise<Set<string>> {
  const ready = new Set<string>();
  await Promise.all(ids.map(async (id) => {
    if (await getReadyNarrationStyleGeneration(id)) ready.add(id);
  }));
  return ready;
}
