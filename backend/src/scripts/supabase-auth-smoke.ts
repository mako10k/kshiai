import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
  CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
  CharacterGenerationEnvelopeV3Schema,
  CharacterGenerationEnvelopeV2Schema,
  assertCharacterGenerationReadyV2,
  defaultBasicAttack,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import { config } from "../config.js";
import { closeDatabase, query } from "../db.js";
import { userFromSupabaseAccessToken } from "../auth.js";
import {
  appendAssetGeneration,
  assetContentDigest,
  createAssetGeneration,
  getCurrentAssetGeneration,
} from "../repositories/asset-generations.js";
import { loadCharacterGeneration } from "../repositories/character-generation-reader.js";
import {
  beginCharacterSemanticMigrationAttempt,
  characterSemanticMigrationInitialRequestDigest,
  loadCharacterSemanticMigrationWork,
} from "../repositories/character-semantic-migration.js";
import { buildImportedCharacterEnvelopeV2 } from "../services/character-authoring-service.js";
import { smokeAuthenticatedReadSurface } from "./authenticated-read-surface-smoke.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function authRequest(
  path: string,
  key: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${config.supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
}

export function retainedCompatibilityFixture(input: {
  characterId: string;
  ownerUserId: string;
  attemptId: string;
  createdAt: string;
}): {
  sheet: CharacterSheet;
  candidate: ReturnType<typeof buildImportedCharacterEnvelopeV2>;
  readyCandidate: ReturnType<typeof buildImportedCharacterEnvelopeV2>;
} {
  const sheet: CharacterSheet = {
    id: input.characterId,
    ownerUserId: input.ownerUserId,
    displayName: "保持データ互換スモーク",
    tags: ["auth-smoke"],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    appearance: {
      summary: "互換性確認用の外套",
      visualPrompt: "compatibility smoke fixture cloak",
      imageUrl: null,
    },
    traits: ["慎重"],
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "リリース前後で保持データを読めることを確認する一時フィクスチャ。",
  };
  const readyCandidate = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: input.attemptId,
  });
  const candidate = structuredClone(readyCandidate);
  candidate.definition.actionNorms = [{
    id: "historical-selectorless-norm",
    when: {
      match: "all",
      clauses: [{ kind: "always", operator: "is", value: "true" }],
    },
    response: {
      disposition: "prefer",
      actionRefs: [],
      actionKinds: [],
      tacticTags: [],
      statement: "旧版では説明文だけでも保存できた行動規範",
      fallbackActionRef: null,
    },
    priority: 50,
    force: "preference",
    selfAwareness: "aware",
    exceptions: [],
    description: null,
  }];
  return { sheet, candidate, readyCandidate };
}

export async function insertRetainedCompatibilityFixture(input: {
  marker: string;
  ownerUserId: string;
  characterId: string;
  attemptId: string;
}): Promise<ReturnType<typeof retainedCompatibilityFixture>> {
  const createdAt = new Date().toISOString();
  const fixture = retainedCompatibilityFixture({
    characterId: input.characterId,
    ownerUserId: input.ownerUserId,
    attemptId: input.attemptId,
    createdAt,
  });
  await query(
    `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)`,
    [input.characterId, input.ownerUserId, JSON.stringify(fixture.sheet), createdAt],
  );
  await query(
    `INSERT INTO character_authoring_attempts
      (attempt_id, owner_user_id, character_id, kind, idempotency_key,
       request_digest, source_text, source_digest, status, candidate_json,
       candidate_digest, assistant_message, created_at, updated_at, expires_at)
     VALUES ($1, $2, $3, 'revision', $4, $5, $6, $7,
             'awaiting_owner_acceptance', $8, $9, $10, $11, $11, $12)`,
    [
      input.attemptId,
      input.ownerUserId,
      input.characterId,
      `auth-smoke:${input.marker}`,
      assetContentDigest({ marker: input.marker, kind: "retained-compatibility" }),
      fixture.sheet.narrativeBlurb,
      assetContentDigest(fixture.sheet.narrativeBlurb),
      JSON.stringify(fixture.candidate),
      assetContentDigest(fixture.candidate),
      "保持データ互換性を確認してください",
      createdAt,
      new Date(Date.now() + 15 * 60_000).toISOString(),
    ],
  );
  return fixture;
}

function buildVersion3SmokeEnvelope(input: {
  marker: string;
  fixture: ReturnType<typeof retainedCompatibilityFixture>;
}) {
  const {
    schemaVersion: _schemaVersion,
    actionNorms: _actionNorms,
    ...stableDefinition
  } = input.fixture.readyCandidate.definition;
  return CharacterGenerationEnvelopeV3Schema.parse({
    ...input.fixture.readyCandidate,
    definitionSchema: { family: "character", version: 3 },
    definition: {
      ...stableDefinition,
      schemaVersion: 3,
      actionNorms: [],
      consciousGuidance: [],
      mechanicalConflictFallbacks: [],
    },
    provenance: {
      ...input.fixture.readyCandidate.provenance,
      attemptId: `migration-smoke:${input.marker}`,
      structureGeneratorContract: CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
    },
    compilerCompatibility: [{ consumer: "battle-mechanics", version: 3 }],
    deferredValues: { contractVersion: 1, values: [] },
  });
}

const requiredV3Capabilities = {
  contractVersion: 1 as const,
  required: [{ consumer: "battle-mechanics" as const, version: 3 }],
};

async function assertStoredVersionedCharacterReads(input: {
  v2GenerationId: string;
  v3GenerationId: string;
  currentSheet: CharacterSheet;
}): Promise<void> {
  const readV2 = await loadCharacterGeneration({
    generationId: input.v2GenerationId,
    currentSheet: input.currentSheet,
    requiredV3Capabilities,
  });
  const readV3 = await loadCharacterGeneration({
    generationId: input.v3GenerationId,
    currentSheet: input.currentSheet,
    requiredV3Capabilities,
  });
  if (!readV2 || readV2.schemaVersion !== 2 || readV2.readiness !== "ready") {
    throw new Error("Historical V2 generation read was not ready");
  }
  if (!readV3 || readV3.schemaVersion !== 3 ||
      readV3.compatibility.status !== "ready") {
    throw new Error("New V3 generation read was not compatible");
  }
}

async function beginAndResumeMigrationSmoke(input: {
  migrationAttemptId: string;
  ownerUserId: string;
  sheet: CharacterSheet;
  sourceGeneration: Awaited<ReturnType<typeof createAssetGeneration>>;
}): Promise<void> {
  const attemptBase = {
    migrationAttemptId: input.migrationAttemptId,
    ownerUserId: input.ownerUserId,
    characterId: input.sheet.id,
    sourceGenerationId: input.sourceGeneration.generationId,
    sourceSchemaVersion: 2 as const,
    sourceContentDigest: input.sourceGeneration.contentDigest,
    sourceContent: input.sourceGeneration.content,
    naturalSource: null,
    targetSchemaVersion: 3 as const,
    migrationContractId: CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
    promptIdentity: "character-semantic-migration-prompt-v4",
    responseSchemaIdentity: CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
    providerRoute: "stage-smoke-no-provider",
    modelIdentity: "stage-smoke-no-provider",
    compilerCapabilities: requiredV3Capabilities,
    createdAt: new Date().toISOString(),
  };
  await beginCharacterSemanticMigrationAttempt({
    ...attemptBase,
    initialRequestDigest: characterSemanticMigrationInitialRequestDigest(
      attemptBase,
    ),
  });
  const resumed = await loadCharacterSemanticMigrationWork({
    migrationAttemptId: input.migrationAttemptId,
    ownerUserId: input.ownerUserId,
  });
  if (!resumed || resumed.requests.length !== 0) {
    throw new Error("Semantic migration work did not resume without provider work");
  }
}

export async function smokeVersionedCharacterReads(input: {
  marker: string;
  ownerUserId: string;
  fixture: ReturnType<typeof retainedCompatibilityFixture>;
  migrationAttemptId?: string;
}): Promise<{ migrationAttemptId: string; v3GenerationId: string }> {
  const v2 = await createAssetGeneration({
    assetType: "character",
    assetId: input.fixture.sheet.id,
    schemaVersion: 2,
    content: input.fixture.readyCandidate,
  });
  await query(
    `INSERT INTO character_asset_states
      (character_id, compatibility_status, current_generation_id,
       active_attempt_id, reason_code, updated_at)
     VALUES ($1, 'ready', $2, NULL, NULL, $3)`,
    [input.fixture.sheet.id, v2.generationId, new Date().toISOString()],
  );
  const v3 = await appendAssetGeneration({ query }, {
    assetType: "character",
    assetId: input.fixture.sheet.id,
    schemaVersion: 3,
    content: buildVersion3SmokeEnvelope(input),
  });
  await assertStoredVersionedCharacterReads({
    v2GenerationId: v2.generationId,
    v3GenerationId: v3.generationId,
    currentSheet: input.fixture.sheet,
  });
  const migrationAttemptId = input.migrationAttemptId ??
    `migration_auth_smoke_${input.marker}`;
  await beginAndResumeMigrationSmoke({
    migrationAttemptId,
    ownerUserId: input.ownerUserId,
    sheet: input.fixture.sheet,
    sourceGeneration: v2,
  });
  if ((await getCurrentAssetGeneration("character", input.fixture.sheet.id))
      ?.generationId !== v2.generationId) {
    throw new Error("Versioned read smoke moved the current generation pointer");
  }
  return { migrationAttemptId, v3GenerationId: v3.generationId };
}

async function smokeAuthenticatedSse(input: {
  apiBaseUrl: string;
  accessToken: string;
  originSecret?: string;
  marker: string;
}): Promise<void> {
  if (process.env.AUTH_SMOKE_SSE !== "1") return;
  const streamResponse = await fetch(
    `${input.apiBaseUrl}/api/battles/btl_auth_smoke_missing/advance/stream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Idempotency-Key": `auth-smoke-${input.marker}`,
        ...(input.originSecret ? { "x-kshiai-origin": input.originSecret } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!streamResponse.ok) {
    const detail = (await streamResponse.text()).slice(0, 200);
    throw new Error(`Authenticated SSE smoke failed: ${streamResponse.status}: ${detail}`);
  }
  if (!streamResponse.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("Authenticated SSE smoke returned another content type");
  }
  const streamBody = await streamResponse.text();
  if (!streamBody.includes(": stream-open") ||
    !streamBody.includes('"type":"error"') ||
    !streamBody.includes("BATTLE_NOT_FOUND")) {
    throw new Error("Authenticated SSE smoke returned an incomplete event stream");
  }
}

function apiHeaders(input: {
  accessToken: string;
  originSecret?: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
    ...(input.originSecret ? { "x-kshiai-origin": input.originSecret } : {}),
  };
}

type CharacterCreateReview = {
  status?: unknown;
  canAccept?: unknown;
  acceptanceError?: unknown;
  failed?: { errorCode?: unknown } | null;
};

async function waitForCharacterCreateReview(input: {
  apiBaseUrl: string;
  attemptId: string;
  headers: Record<string, string>;
}): Promise<CharacterCreateReview | null> {
  for (let poll = 0; poll < 96; poll += 1) {
    const response = await fetch(
      `${input.apiBaseUrl}/api/character-drafts/${input.attemptId}`,
      { headers: input.headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      throw new Error(`Character create smoke poll failed: HTTP ${response.status}`);
    }
    const review = await response.json() as CharacterCreateReview;
    if (review.status === "awaiting_owner_acceptance" || review.status === "failed") {
      return review;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return null;
}

function assertAcceptableCharacterCreateReview(
  review: CharacterCreateReview | null,
): void {
  if (review?.status === "awaiting_owner_acceptance" &&
      review.canAccept === true && review.acceptanceError === null) return;
  throw new Error(
    `Character create smoke did not produce an acceptable draft: ${String(
      review?.failed?.errorCode ?? review?.status ?? "timeout",
    ).slice(0, 120)}`,
  );
}

async function assertAndDiscardCharacterCreate(input: {
  apiBaseUrl: string;
  attemptId: string;
  ownerUserId: string;
  headers: Record<string, string>;
}): Promise<void> {
  const stored = await query<{ candidate_json: unknown }>(
    `SELECT candidate_json FROM character_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [input.attemptId, input.ownerUserId],
  );
  const rawCandidate = stored.rows[0]?.candidate_json;
  const candidate = CharacterGenerationEnvelopeV2Schema.parse(
    typeof rawCandidate === "string" ? JSON.parse(rawCandidate) : rawCandidate,
  );
  assertCharacterGenerationReadyV2(candidate);
  const discarded = await fetch(
    `${input.apiBaseUrl}/api/character-drafts/${input.attemptId}`,
    {
      method: "DELETE",
      headers: input.headers,
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!discarded.ok) {
    throw new Error(`Character create smoke discard failed: HTTP ${discarded.status}`);
  }
  const readback = await query<{ status: string }>(
    `SELECT status FROM character_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`,
    [input.attemptId, input.ownerUserId],
  );
  if (readback.rows[0]?.status !== "discarded") {
    throw new Error("Character create smoke discard readback failed");
  }
}

async function smokeCharacterCreate(input: {
  apiBaseUrl: string;
  accessToken: string;
  originSecret?: string;
  marker: string;
  ownerUserId: string;
}): Promise<string | null> {
  if (process.env.AUTH_SMOKE_CHARACTER_CREATE !== "true") return null;
  if (process.env.AUTH_SMOKE_CHARACTER_CREATE_PROVIDER_ATTEMPT_CEILING !== "30") {
    throw new Error(
      "A3 smoke requires the reviewed 30-attempt conservative provider ceiling",
    );
  }
  const headers = apiHeaders(input);
  const response = await fetch(`${input.apiBaseUrl}/api/characters/generate`, {
    method: "POST",
    headers: {
      ...headers,
      "Idempotency-Key": `a3-stage-smoke-${input.marker}`,
    },
    body: JSON.stringify({
      prompt: `A3 Stage smoke ${input.marker}: 成人の慎重な時計職人。既存人物との関係は作らない。`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 202) {
    throw new Error(`Character create smoke start failed: HTTP ${response.status}`);
  }
  const started = await response.json() as { attemptId?: unknown };
  if (typeof started.attemptId !== "string") {
    throw new Error("Character create smoke returned no attempt ID");
  }
  const attemptId = started.attemptId;
  assertAcceptableCharacterCreateReview(await waitForCharacterCreateReview({
    apiBaseUrl: input.apiBaseUrl,
    attemptId,
    headers,
  }));
  await assertAndDiscardCharacterCreate({
    apiBaseUrl: input.apiBaseUrl,
    attemptId,
    ownerUserId: input.ownerUserId,
    headers,
  });
  return attemptId;
}

async function cleanupSmokeResources(input: {
  migrationAttemptId: string | null;
  fixtureAttemptId: string | null;
  fixtureCharacterId: string | null;
  applicationUserId: string | null;
  authUserId: string | null;
  secretKey: string;
}): Promise<void> {
  const cleanupErrors: Error[] = [];
  const cleanup = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      cleanupErrors.push(new Error(`${label}: ${detail}`));
    }
  };
  if (input.migrationAttemptId) {
    await cleanup("semantic migration cleanup failed", async () => {
      await query(
        `DELETE FROM character_semantic_migration_attempts
          WHERE migration_attempt_id = $1`,
        [input.migrationAttemptId],
      );
    });
  }
  if (input.fixtureAttemptId) {
    await cleanup("character attempt cleanup failed", async () => {
      await query(`DELETE FROM character_authoring_attempts WHERE attempt_id = $1`, [
        input.fixtureAttemptId,
      ]);
    });
  }
  if (input.fixtureCharacterId) {
    await cleanup("character asset state cleanup failed", async () => {
      await query(`DELETE FROM character_asset_states WHERE character_id = $1`, [
        input.fixtureCharacterId,
      ]);
    });
    await cleanup("character current generation cleanup failed", async () => {
      await query(
        `DELETE FROM asset_current_generations
          WHERE asset_type = 'character' AND asset_id = $1`,
        [input.fixtureCharacterId],
      );
    });
    await cleanup("character generations cleanup failed", async () => {
      await query(
        `DELETE FROM asset_generations
          WHERE asset_type = 'character' AND asset_id = $1`,
        [input.fixtureCharacterId],
      );
    });
    await cleanup("character cleanup failed", async () => {
      await query(`DELETE FROM characters WHERE id = $1`, [input.fixtureCharacterId]);
    });
  }
  if (input.applicationUserId) {
    await cleanup("application user cleanup failed", async () => {
      await query(`DELETE FROM users WHERE id = $1`, [input.applicationUserId]);
    });
  }
  if (input.authUserId) {
    await cleanup("Supabase auth cleanup failed", async () => {
      const removed = await authRequest(`/admin/users/${input.authUserId}`, input.secretKey, {
        method: "DELETE",
      });
      if (!removed.ok) throw new Error(`HTTP ${removed.status}`);
    });
  }
  await cleanup("database close failed", closeDatabase);
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Supabase Auth smoke cleanup incomplete");
  }
}

type ApiSmokeResources = {
  fixtureCharacterId: string | null;
  fixtureAttemptId: string | null;
  migrationAttemptId: string | null;
  createAttemptId: string | null;
};

async function runAuthenticatedApiSmoke(input: {
  apiBaseUrl: string;
  accessToken: string;
  marker: string;
  ownerUserId: string;
  resources: ApiSmokeResources;
}): Promise<void> {
  const originSecret = process.env.AUTH_SMOKE_ORIGIN_SECRET?.trim();
  input.resources.createAttemptId = await smokeCharacterCreate({
    ...input,
    originSecret,
  });
  input.resources.fixtureCharacterId = `chr_auth_smoke_${input.marker}`;
  input.resources.fixtureAttemptId = `cat_auth_smoke_${input.marker}`;
  const fixture = await insertRetainedCompatibilityFixture({
    marker: input.marker,
    ownerUserId: input.ownerUserId,
    characterId: input.resources.fixtureCharacterId,
    attemptId: input.resources.fixtureAttemptId,
  });
  input.resources.migrationAttemptId = `migration_auth_smoke_${input.marker}`;
  await smokeVersionedCharacterReads({
    marker: input.marker,
    ownerUserId: input.ownerUserId,
    fixture,
    migrationAttemptId: input.resources.migrationAttemptId,
  });
  await smokeAuthenticatedReadSurface({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    originSecret,
    fixtureCharacterId: input.resources.fixtureCharacterId,
  });
  await smokeAuthenticatedSse({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    originSecret,
    marker: input.marker,
  });
}

async function main(): Promise<void> {
  const secretKey = required("SUPABASE_SECRET_KEY");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  required("DATABASE_URL");
  const marker = randomUUID();
  const email = `auth-smoke-${marker}@example.test`;
  const password = `Smoke-${randomUUID()}-9a!`;
  let authUserId: string | null = null;
  let applicationUserId: string | null = null;
  const resources: ApiSmokeResources = {
    fixtureCharacterId: null,
    fixtureAttemptId: null,
    migrationAttemptId: null,
    createAttemptId: null,
  };

  try {
    const created = await authRequest("/admin/users", secretKey, {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!created.ok) throw new Error(`Supabase admin create failed: ${created.status}`);
    const createdBody = await created.json() as { id?: string };
    if (!createdBody.id) throw new Error("Supabase admin create returned no user ID");
    authUserId = createdBody.id;

    const signedIn = await authRequest("/token?grant_type=password", publishableKey, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!signedIn.ok) throw new Error(`Supabase password sign-in failed: ${signedIn.status}`);
    const session = await signedIn.json() as { access_token?: string };
    if (!session.access_token) throw new Error("Supabase sign-in returned no access token");

    const applicationUser = await userFromSupabaseAccessToken(session.access_token);
    if (!applicationUser) throw new Error("Backend JWT verification failed");
    applicationUserId = applicationUser.id;
    const mapped = await query<{ auth_user_id: string; email: string }>(
      `SELECT auth_user_id, email FROM users WHERE id = $1`,
      [applicationUser.id],
    );
    if (mapped.rows[0]?.auth_user_id !== authUserId || mapped.rows[0]?.email !== email) {
      throw new Error("Application user mapping mismatch");
    }
    const apiBaseUrl = process.env.AUTH_SMOKE_API_URL?.replace(/\/$/, "");
    if (apiBaseUrl) {
      await runAuthenticatedApiSmoke({
        apiBaseUrl,
        accessToken: session.access_token,
        marker,
        ownerUserId: applicationUser.id,
        resources,
      });
    }
    console.log(
      [
        "Supabase Auth JWT",
        ...(resources.createAttemptId ? ["A3 V2 character create and discard"] : []),
        "V2/V3 reads",
        "migration resume",
        "screen API surface",
        ...(process.env.AUTH_SMOKE_SSE === "1" ? ["SSE proxy"] : []),
        "smoke passed",
      ].join(", "),
    );
  } finally {
    await cleanupSmokeResources({
      migrationAttemptId: resources.migrationAttemptId,
      fixtureAttemptId: resources.fixtureAttemptId,
      fixtureCharacterId: resources.fixtureCharacterId,
      applicationUserId,
      authUserId,
      secretKey,
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
