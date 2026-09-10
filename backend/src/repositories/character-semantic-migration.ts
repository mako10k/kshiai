import {
  CHARACTER_MIGRATION_CAPSULE_MAX_BYTES,
  CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT,
  CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1,
  CharacterSemanticMigrationAttemptV1Schema,
  CharacterSemanticMigrationEventV1Schema,
  CharacterSemanticMigrationProviderReceiptV1Schema,
  CharacterSemanticMigrationProviderRequestV1Schema,
  MigrationPreservationCapsuleV1Schema,
  type CharacterSemanticMigrationAttemptV1,
  type CharacterSemanticMigrationEventV1,
  type CharacterSemanticMigrationProviderReceiptV1,
  type CharacterSemanticMigrationProviderRequestV1,
  type MigrationPreservationCapsuleV1,
} from "@kshiai/shared";
import {
  databaseKind,
  query,
  withTransaction,
  type DatabaseConnection,
} from "../db.js";
import {
  assetContentDigest,
  canonicalAssetJson,
} from "./asset-generations.js";

type AttemptRow = {
  migration_attempt_id: string;
  owner_user_id: string;
  character_id: string;
  source_generation_id: string;
  source_schema_version: number;
  source_content_json: unknown;
  source_content_digest: string;
  natural_source_json: unknown | null;
  natural_source_digest: string | null;
  natural_source_disclosure_contract_id: string | null;
  allowed_source_paths_json: unknown | null;
  target_schema_version: number;
  migration_contract_id: string;
  prompt_identity: string;
  response_schema_identity: string;
  provider_route: string;
  model_identity: string;
  compiler_capabilities_json: unknown;
  initial_request_digest: string;
  created_at: string | Date;
};

type RequestRow = {
  provider_request_id: string;
  migration_attempt_id: string;
  parent_provider_request_id: string | null;
  request_ordinal: number;
  request_kind: string;
  request_digest: string;
  created_at: string | Date;
};

type ReceiptRow = {
  provider_request_id: string;
  outcome: string;
  response_digest: string | null;
  response_json: unknown | null;
  failure_code: string | null;
  failure_detail: string | null;
  accounting_json: unknown;
  finished_at: string | Date;
};

type EventRow = {
  migration_attempt_id: string;
  event_sequence: number;
  event_type: string;
  subject_id: string;
  details_json: unknown;
  created_at: string | Date;
};

type CapsuleRow = {
  capsule_digest: string;
  capsule_json: unknown;
  byte_length: number;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

function parseAttempt(row: AttemptRow): CharacterSemanticMigrationAttemptV1 {
  const naturalFragments = row.natural_source_json == null
    ? null
    : parseJson(row.natural_source_json);
  const naturalSource = naturalFragments == null
    ? null
    : {
        disclosureContractId: row.natural_source_disclosure_contract_id,
        allowedSourcePaths: parseJson(row.allowed_source_paths_json),
        contentDigest: row.natural_source_digest,
        fragments: naturalFragments,
      };
  return CharacterSemanticMigrationAttemptV1Schema.parse({
    migrationAttemptId: row.migration_attempt_id,
    ownerUserId: row.owner_user_id,
    characterId: row.character_id,
    sourceGenerationId: row.source_generation_id,
    sourceSchemaVersion: Number(row.source_schema_version),
    sourceContentDigest: row.source_content_digest,
    sourceContent: parseJson(row.source_content_json),
    naturalSource,
    targetSchemaVersion: Number(row.target_schema_version),
    migrationContractId: row.migration_contract_id,
    promptIdentity: row.prompt_identity,
    responseSchemaIdentity: row.response_schema_identity,
    providerRoute: row.provider_route,
    modelIdentity: row.model_identity,
    compilerCapabilities: parseJson(row.compiler_capabilities_json),
    initialRequestDigest: row.initial_request_digest,
    createdAt: toIso(row.created_at),
  });
}

function parseRequest(row: RequestRow): CharacterSemanticMigrationProviderRequestV1 {
  return CharacterSemanticMigrationProviderRequestV1Schema.parse({
    providerRequestId: row.provider_request_id,
    migrationAttemptId: row.migration_attempt_id,
    parentProviderRequestId: row.parent_provider_request_id,
    ordinal: Number(row.request_ordinal),
    kind: row.request_kind,
    requestDigest: row.request_digest,
    createdAt: toIso(row.created_at),
  });
}

function parseReceipt(row: ReceiptRow): CharacterSemanticMigrationProviderReceiptV1 {
  const common = {
    outcome: row.outcome,
    accounting: parseJson(row.accounting_json),
    finishedAt: toIso(row.finished_at),
  };
  return CharacterSemanticMigrationProviderReceiptV1Schema.parse(
    row.outcome === "succeeded"
      ? {
          ...common,
          responseDigest: row.response_digest,
          response: parseJson(row.response_json),
        }
      : {
          ...common,
          failureCode: row.failure_code,
          failureDetail: row.failure_detail,
        },
  );
}

function parseEvent(row: EventRow): CharacterSemanticMigrationEventV1 {
  return CharacterSemanticMigrationEventV1Schema.parse({
    migrationAttemptId: row.migration_attempt_id,
    sequence: Number(row.event_sequence),
    type: row.event_type,
    subjectId: row.subject_id,
    details: parseJson(row.details_json),
    createdAt: toIso(row.created_at),
  });
}

function initialRequestMaterial(
  attempt: Omit<CharacterSemanticMigrationAttemptV1, "initialRequestDigest">,
): unknown {
  return {
    migrationAttemptId: attempt.migrationAttemptId,
    characterId: attempt.characterId,
    sourceGenerationId: attempt.sourceGenerationId,
    sourceSchemaVersion: attempt.sourceSchemaVersion,
    sourceContentDigest: attempt.sourceContentDigest,
    sourceContent: attempt.sourceContent,
    naturalSource: attempt.naturalSource,
    targetSchemaVersion: attempt.targetSchemaVersion,
    migrationContractId: attempt.migrationContractId,
    promptIdentity: attempt.promptIdentity,
    responseSchemaIdentity: attempt.responseSchemaIdentity,
    providerRoute: attempt.providerRoute,
    modelIdentity: attempt.modelIdentity,
    compilerCapabilities: attempt.compilerCapabilities,
  };
}

export function characterSemanticMigrationInitialRequestDigest(
  attempt: Omit<CharacterSemanticMigrationAttemptV1, "initialRequestDigest">,
): string {
  return assetContentDigest(initialRequestMaterial(attempt));
}

async function appendEvent(
  connection: DatabaseConnection,
  input: Omit<CharacterSemanticMigrationEventV1, "sequence">,
): Promise<CharacterSemanticMigrationEventV1> {
  const latest = await connection.query<{ event_sequence: number }>(
    `SELECT event_sequence
       FROM character_semantic_migration_events
      WHERE migration_attempt_id = $1
      ORDER BY event_sequence DESC
      LIMIT 1`,
    [input.migrationAttemptId],
  );
  const event = CharacterSemanticMigrationEventV1Schema.parse({
    ...input,
    sequence: Number(latest.rows[0]?.event_sequence ?? 0) + 1,
  });
  await connection.query(
    `INSERT INTO character_semantic_migration_events
      (migration_attempt_id, event_sequence, event_type, subject_id,
       details_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.migrationAttemptId,
      event.sequence,
      event.type,
      event.subjectId,
      canonicalAssetJson(event.details),
      event.createdAt,
    ],
  );
  return event;
}

async function readAttempt(
  connection: DatabaseConnection,
  migrationAttemptId: string,
): Promise<CharacterSemanticMigrationAttemptV1 | null> {
  const result = await connection.query<AttemptRow>(
    `SELECT migration_attempt_id, owner_user_id, character_id,
            source_generation_id, source_schema_version, source_content_json,
            source_content_digest, natural_source_json, natural_source_digest,
            natural_source_disclosure_contract_id, allowed_source_paths_json,
            target_schema_version, migration_contract_id, prompt_identity,
            response_schema_identity, provider_route, model_identity,
            compiler_capabilities_json, initial_request_digest, created_at
       FROM character_semantic_migration_attempts
      WHERE migration_attempt_id = $1`,
    [migrationAttemptId],
  );
  return result.rows[0] ? parseAttempt(result.rows[0]) : null;
}

function assertExactIdentity(left: unknown, right: unknown, code: string): void {
  if (canonicalAssetJson(left) !== canonicalAssetJson(right)) throw new Error(code);
}

async function lockAttempt(
  connection: DatabaseConnection,
  migrationAttemptId: string,
): Promise<void> {
  if (databaseKind() !== "postgres") return;
  await connection.query(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    [migrationAttemptId],
  );
}

async function verifyFrozenSource(
  connection: DatabaseConnection,
  attempt: CharacterSemanticMigrationAttemptV1,
): Promise<void> {
  const result = await connection.query<{
    generation_id: string;
    schema_version: number;
    content_json: unknown;
    content_digest: string;
    owner_user_id: string | null;
    current_generation_id: string | null;
  }>(
    `SELECT g.generation_id, g.schema_version, g.content_json, g.content_digest,
            ch.owner_user_id, c.generation_id AS current_generation_id
       FROM asset_generations g
       LEFT JOIN characters ch ON ch.id = g.asset_id
       LEFT JOIN asset_current_generations c
         ON c.asset_type = g.asset_type AND c.asset_id = g.asset_id
      WHERE g.generation_id = $1
        AND g.asset_type = 'character'
        AND g.asset_id = $2`,
    [attempt.sourceGenerationId, attempt.characterId],
  );
  const source = result.rows[0];
  if (!source) throw new Error("CHARACTER_MIGRATION_SOURCE_NOT_FOUND");
  if (source.owner_user_id !== attempt.ownerUserId) {
    throw new Error("CHARACTER_MIGRATION_SOURCE_OWNER_MISMATCH");
  }
  if (source.current_generation_id !== attempt.sourceGenerationId) {
    throw new Error("CHARACTER_MIGRATION_SOURCE_POINTER_DRIFT");
  }
  if (
    Number(source.schema_version) !== attempt.sourceSchemaVersion
    || source.content_digest !== attempt.sourceContentDigest
  ) {
    throw new Error("CHARACTER_MIGRATION_SOURCE_IDENTITY_MISMATCH");
  }
  assertExactIdentity(
    parseJson(source.content_json),
    attempt.sourceContent,
    "CHARACTER_MIGRATION_SOURCE_CONTENT_MISMATCH",
  );
}

export async function beginCharacterSemanticMigrationAttempt(
  input: CharacterSemanticMigrationAttemptV1,
): Promise<{ attempt: CharacterSemanticMigrationAttemptV1; replayed: boolean }> {
  const attempt = CharacterSemanticMigrationAttemptV1Schema.parse(input);
  if (assetContentDigest(attempt.sourceContent) !== attempt.sourceContentDigest) {
    throw new Error("CHARACTER_MIGRATION_SOURCE_DIGEST_MISMATCH");
  }
  if (
    attempt.naturalSource
    && assetContentDigest(attempt.naturalSource.fragments)
      !== attempt.naturalSource.contentDigest
  ) {
    throw new Error("CHARACTER_MIGRATION_NATURAL_SOURCE_DIGEST_MISMATCH");
  }
  if (
    characterSemanticMigrationInitialRequestDigest(attempt)
      !== attempt.initialRequestDigest
  ) {
    throw new Error("CHARACTER_MIGRATION_INITIAL_REQUEST_DIGEST_MISMATCH");
  }
  return withTransaction(async (connection) => {
    await lockAttempt(connection, attempt.migrationAttemptId);
    const existing = await readAttempt(connection, attempt.migrationAttemptId);
    if (existing) {
      assertExactIdentity(existing, attempt, "CHARACTER_MIGRATION_ATTEMPT_IDENTITY_DRIFT");
      await verifyFrozenSource(connection, existing);
      return { attempt: existing, replayed: true };
    }
    await verifyFrozenSource(connection, attempt);
    await connection.query(
      `INSERT INTO character_semantic_migration_attempts
        (migration_attempt_id, owner_user_id, character_id,
         source_generation_id, source_schema_version, source_content_json,
         source_content_digest, natural_source_json, natural_source_digest,
         natural_source_disclosure_contract_id, allowed_source_paths_json,
         target_schema_version, migration_contract_id, prompt_identity,
         response_schema_identity, provider_route, model_identity,
         compiler_capabilities_json, initial_request_digest, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        attempt.migrationAttemptId,
        attempt.ownerUserId,
        attempt.characterId,
        attempt.sourceGenerationId,
        attempt.sourceSchemaVersion,
        canonicalAssetJson(attempt.sourceContent),
        attempt.sourceContentDigest,
        attempt.naturalSource
          ? canonicalAssetJson(attempt.naturalSource.fragments)
          : null,
        attempt.naturalSource?.contentDigest ?? null,
        attempt.naturalSource?.disclosureContractId ?? null,
        attempt.naturalSource
          ? canonicalAssetJson(attempt.naturalSource.allowedSourcePaths)
          : null,
        attempt.targetSchemaVersion,
        attempt.migrationContractId,
        attempt.promptIdentity,
        attempt.responseSchemaIdentity,
        attempt.providerRoute,
        attempt.modelIdentity,
        canonicalAssetJson(attempt.compilerCapabilities),
        attempt.initialRequestDigest,
        attempt.createdAt,
      ],
    );
    await appendEvent(connection, {
      migrationAttemptId: attempt.migrationAttemptId,
      type: "attempt_started",
      subjectId: attempt.migrationAttemptId,
      details: { sourceGenerationId: attempt.sourceGenerationId },
      createdAt: attempt.createdAt,
    });
    return { attempt, replayed: false };
  });
}

async function readRequest(
  connection: DatabaseConnection,
  providerRequestId: string,
): Promise<CharacterSemanticMigrationProviderRequestV1 | null> {
  const result = await connection.query<RequestRow>(
    `SELECT provider_request_id, migration_attempt_id,
            parent_provider_request_id, request_ordinal, request_kind,
            request_digest, created_at
       FROM character_semantic_migration_provider_requests
      WHERE provider_request_id = $1`,
    [providerRequestId],
  );
  return result.rows[0] ? parseRequest(result.rows[0]) : null;
}

export async function recordCharacterSemanticMigrationProviderRequest(input: {
  providerRequestId: string;
  migrationAttemptId: string;
  parentProviderRequestId: string | null;
  kind: CharacterSemanticMigrationProviderRequestV1["kind"];
  requestDigest: string;
  createdAt: string;
}): Promise<{
  request: CharacterSemanticMigrationProviderRequestV1;
  replayed: boolean;
}> {
  return withTransaction(async (connection) => {
    await lockAttempt(connection, input.migrationAttemptId);
    const attempt = await readAttempt(connection, input.migrationAttemptId);
    if (!attempt) throw new Error("CHARACTER_MIGRATION_ATTEMPT_NOT_FOUND");
    await verifyFrozenSource(connection, attempt);
    const existing = await readRequest(connection, input.providerRequestId);
    if (existing) {
      assertExactIdentity(
        {
          providerRequestId: existing.providerRequestId,
          migrationAttemptId: existing.migrationAttemptId,
          parentProviderRequestId: existing.parentProviderRequestId,
          kind: existing.kind,
          requestDigest: existing.requestDigest,
          createdAt: existing.createdAt,
        },
        input,
        "CHARACTER_MIGRATION_PROVIDER_REQUEST_IDENTITY_DRIFT",
      );
      return { request: existing, replayed: true };
    }
    const latest = await connection.query<{ request_ordinal: number }>(
      `SELECT request_ordinal
         FROM character_semantic_migration_provider_requests
        WHERE migration_attempt_id = $1
        ORDER BY request_ordinal DESC
        LIMIT 1`,
      [input.migrationAttemptId],
    );
    const ordinal = Number(latest.rows[0]?.request_ordinal ?? 0) + 1;
    if (ordinal > CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT) {
      throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT_EXCEEDED");
    }
    if (ordinal === 1) {
      if (
        input.kind !== "initial_generation"
        || input.parentProviderRequestId !== null
        || input.requestDigest !== attempt.initialRequestDigest
      ) {
        throw new Error("CHARACTER_MIGRATION_INITIAL_PROVIDER_REQUEST_INVALID");
      }
    } else {
      if (!input.parentProviderRequestId) {
        throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_PARENT_REQUIRED");
      }
      const parent = await readRequest(connection, input.parentProviderRequestId);
      if (!parent || parent.migrationAttemptId !== input.migrationAttemptId) {
        throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_PARENT_INVALID");
      }
      const parentReceipt = await readReceipt(connection, parent.providerRequestId);
      if (!parentReceipt) {
        throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_PARENT_PENDING");
      }
      if (Date.parse(input.createdAt) < Date.parse(parentReceipt.finishedAt)) {
        throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_TIME_INVALID");
      }
    }
    const request = CharacterSemanticMigrationProviderRequestV1Schema.parse({
      ...input,
      ordinal,
    });
    if (Date.parse(request.createdAt) < Date.parse(attempt.createdAt)) {
      throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_TIME_INVALID");
    }
    await connection.query(
      `INSERT INTO character_semantic_migration_provider_requests
        (provider_request_id, migration_attempt_id, parent_provider_request_id,
         request_ordinal, request_kind, request_digest, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        request.providerRequestId,
        request.migrationAttemptId,
        request.parentProviderRequestId,
        request.ordinal,
        request.kind,
        request.requestDigest,
        request.createdAt,
      ],
    );
    await appendEvent(connection, {
      migrationAttemptId: request.migrationAttemptId,
      type: "provider_request_recorded",
      subjectId: request.providerRequestId,
      details: { kind: request.kind, ordinal: request.ordinal },
      createdAt: request.createdAt,
    });
    return { request, replayed: false };
  });
}

async function readReceipt(
  connection: DatabaseConnection,
  providerRequestId: string,
): Promise<CharacterSemanticMigrationProviderReceiptV1 | null> {
  const result = await connection.query<ReceiptRow>(
    `SELECT provider_request_id, outcome, response_digest, response_json,
            failure_code, failure_detail, accounting_json, finished_at
       FROM character_semantic_migration_provider_receipts
      WHERE provider_request_id = $1`,
    [providerRequestId],
  );
  return result.rows[0] ? parseReceipt(result.rows[0]) : null;
}

export async function recordCharacterSemanticMigrationProviderReceipt(input: {
  providerRequestId: string;
  receipt: CharacterSemanticMigrationProviderReceiptV1;
}): Promise<{
  receipt: CharacterSemanticMigrationProviderReceiptV1;
  replayed: boolean;
}> {
  const receipt = CharacterSemanticMigrationProviderReceiptV1Schema.parse(
    input.receipt,
  );
  if (
    receipt.outcome === "succeeded"
    && assetContentDigest(receipt.response) !== receipt.responseDigest
  ) {
    throw new Error("CHARACTER_MIGRATION_PROVIDER_RESPONSE_DIGEST_MISMATCH");
  }
  return withTransaction(async (connection) => {
    const request = await readRequest(connection, input.providerRequestId);
    if (!request) throw new Error("CHARACTER_MIGRATION_PROVIDER_REQUEST_NOT_FOUND");
    await lockAttempt(connection, request.migrationAttemptId);
    if (Date.parse(receipt.finishedAt) < Date.parse(request.createdAt)) {
      throw new Error("CHARACTER_MIGRATION_PROVIDER_RECEIPT_TIME_INVALID");
    }
    const existing = await readReceipt(connection, input.providerRequestId);
    if (existing) {
      assertExactIdentity(
        existing,
        receipt,
        "CHARACTER_MIGRATION_PROVIDER_RECEIPT_IDENTITY_DRIFT",
      );
      return { receipt: existing, replayed: true };
    }
    await connection.query(
      `INSERT INTO character_semantic_migration_provider_receipts
        (provider_request_id, outcome, response_digest, response_json,
         failure_code, failure_detail, accounting_json, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.providerRequestId,
        receipt.outcome,
        receipt.outcome === "succeeded" ? receipt.responseDigest : null,
        receipt.outcome === "succeeded"
          ? canonicalAssetJson(receipt.response)
          : null,
        receipt.outcome === "failed" ? receipt.failureCode : null,
        receipt.outcome === "failed" ? receipt.failureDetail : null,
        canonicalAssetJson(receipt.accounting),
        receipt.finishedAt,
      ],
    );
    await appendEvent(connection, {
      migrationAttemptId: request.migrationAttemptId,
      type: receipt.outcome === "succeeded"
        ? "provider_request_succeeded"
        : "provider_request_failed",
      subjectId: request.providerRequestId,
      details: receipt.outcome === "succeeded"
        ? { responseDigest: receipt.responseDigest }
        : { failureCode: receipt.failureCode },
      createdAt: receipt.finishedAt,
    });
    return { receipt, replayed: false };
  });
}

export async function loadCharacterSemanticMigrationWork(input: {
  migrationAttemptId: string;
  ownerUserId: string;
}): Promise<{
  attempt: CharacterSemanticMigrationAttemptV1;
  events: CharacterSemanticMigrationEventV1[];
  requests: Array<{
    request: CharacterSemanticMigrationProviderRequestV1;
    receipt: CharacterSemanticMigrationProviderReceiptV1 | null;
  }>;
} | null> {
  const attempt = await readAttemptForOwner(input);
  if (!attempt) return null;
  const events = await query<EventRow>(
    `SELECT migration_attempt_id, event_sequence, event_type, subject_id,
            details_json, created_at
       FROM character_semantic_migration_events
      WHERE migration_attempt_id = $1
      ORDER BY event_sequence`,
    [input.migrationAttemptId],
  );
  const requests = await query<RequestRow & ReceiptRow>(
    `SELECT r.provider_request_id, r.migration_attempt_id,
            r.parent_provider_request_id, r.request_ordinal, r.request_kind,
            r.request_digest, r.created_at, x.outcome, x.response_digest,
            x.response_json, x.failure_code, x.failure_detail,
            x.accounting_json, x.finished_at
       FROM character_semantic_migration_provider_requests r
       LEFT JOIN character_semantic_migration_provider_receipts x
         ON x.provider_request_id = r.provider_request_id
      WHERE r.migration_attempt_id = $1
      ORDER BY r.request_ordinal`,
    [input.migrationAttemptId],
  );
  return {
    attempt,
    events: events.rows.map(parseEvent),
    requests: requests.rows.map((row) => ({
      request: parseRequest(row),
      receipt: row.outcome == null ? null : parseReceipt(row),
    })),
  };
}

async function readAttemptForOwner(input: {
  migrationAttemptId: string;
  ownerUserId: string;
}): Promise<CharacterSemanticMigrationAttemptV1 | null> {
  const attempt = await readAttempt({ query }, input.migrationAttemptId);
  return attempt?.ownerUserId === input.ownerUserId ? attempt : null;
}

export async function storeMigrationPreservationCapsule(input: {
  ownerUserId: string;
  capsule: MigrationPreservationCapsuleV1;
}): Promise<{ capsuleDigest: string; byteLength: number; replayed: boolean }> {
  const capsule = MigrationPreservationCapsuleV1Schema.parse(input.capsule);
  const capsuleJson = canonicalAssetJson(capsule);
  const byteLength = Buffer.byteLength(capsuleJson, "utf8");
  if (byteLength > CHARACTER_MIGRATION_CAPSULE_MAX_BYTES) {
    throw new Error("CHARACTER_MIGRATION_CAPSULE_TOO_LARGE");
  }
  const capsuleDigest = assetContentDigest(capsule);
  return withTransaction(async (connection) => {
    await lockAttempt(connection, capsule.migrationAttemptId);
    const attempt = await readAttempt(connection, capsule.migrationAttemptId);
    if (!attempt || attempt.ownerUserId !== input.ownerUserId) {
      throw new Error("CHARACTER_MIGRATION_ATTEMPT_NOT_FOUND");
    }
    if (attempt.sourceGenerationId !== capsule.sourceGenerationId) {
      throw new Error("CHARACTER_MIGRATION_CAPSULE_SOURCE_MISMATCH");
    }
    const target = await connection.query<{
      asset_type: string;
      asset_id: string;
      schema_version: number;
    }>(
      `SELECT asset_type, asset_id, schema_version
         FROM asset_generations
        WHERE generation_id = $1`,
      [capsule.targetGenerationId],
    );
    const generation = target.rows[0];
    if (
      !generation
      || generation.asset_type !== "character"
      || generation.asset_id !== attempt.characterId
      || Number(generation.schema_version) !== 3
    ) {
      throw new Error("CHARACTER_MIGRATION_CAPSULE_TARGET_MISMATCH");
    }
    const existing = await connection.query<CapsuleRow>(
      `SELECT capsule_digest, capsule_json, byte_length
         FROM character_migration_preservation_capsules
        WHERE capsule_digest = $1`,
      [capsuleDigest],
    );
    if (existing.rows[0]) {
      assertExactIdentity(
        parseJson(existing.rows[0].capsule_json),
        capsule,
        "CHARACTER_MIGRATION_CAPSULE_DIGEST_COLLISION",
      );
      return {
        capsuleDigest,
        byteLength: Number(existing.rows[0].byte_length),
        replayed: true,
      };
    }
    await connection.query(
      `INSERT INTO character_migration_preservation_capsules
        (capsule_digest, migration_attempt_id, source_generation_id,
         target_generation_id, capsule_json, byte_length, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        capsuleDigest,
        capsule.migrationAttemptId,
        capsule.sourceGenerationId,
        capsule.targetGenerationId,
        capsuleJson,
        byteLength,
        capsule.createdAt,
      ],
    );
    return { capsuleDigest, byteLength, replayed: false };
  });
}

export async function loadMigrationPreservationCapsuleForConsumer(input: {
  ownerUserId: string;
  capsuleDigest: string;
  consumer: typeof CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1;
}): Promise<MigrationPreservationCapsuleV1 | null> {
  if (input.consumer !== CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1) {
    throw new Error("CHARACTER_MIGRATION_CAPSULE_CONSUMER_FORBIDDEN");
  }
  const result = await query<CapsuleRow & { owner_user_id: string }>(
    `SELECT c.capsule_digest, c.capsule_json, c.byte_length, a.owner_user_id
       FROM character_migration_preservation_capsules c
       JOIN character_semantic_migration_attempts a
         ON a.migration_attempt_id = c.migration_attempt_id
      WHERE c.capsule_digest = $1`,
    [input.capsuleDigest],
  );
  const row = result.rows[0];
  if (!row || row.owner_user_id !== input.ownerUserId) return null;
  return MigrationPreservationCapsuleV1Schema.parse(parseJson(row.capsule_json));
}
