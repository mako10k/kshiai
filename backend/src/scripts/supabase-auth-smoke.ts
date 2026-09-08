import { randomUUID } from "node:crypto";
import {
  defaultBasicAttack,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import { config } from "../config.js";
import { closeDatabase, query } from "../db.js";
import { userFromSupabaseAccessToken } from "../auth.js";
import { assetContentDigest } from "../repositories/asset-generations.js";
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

function retainedCompatibilityFixture(input: {
  characterId: string;
  ownerUserId: string;
  attemptId: string;
  createdAt: string;
}): { sheet: CharacterSheet; candidate: ReturnType<typeof buildImportedCharacterEnvelopeV2> } {
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
  const candidate = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: input.attemptId,
  });
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
  return { sheet, candidate };
}

async function insertRetainedCompatibilityFixture(input: {
  marker: string;
  ownerUserId: string;
  characterId: string;
  attemptId: string;
}): Promise<void> {
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

async function cleanupSmokeResources(input: {
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
  if (input.fixtureAttemptId) {
    await cleanup("character attempt cleanup failed", async () => {
      await query(`DELETE FROM character_authoring_attempts WHERE attempt_id = $1`, [
        input.fixtureAttemptId,
      ]);
    });
  }
  if (input.fixtureCharacterId) {
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

async function main(): Promise<void> {
  const secretKey = required("SUPABASE_SECRET_KEY");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  required("DATABASE_URL");
  const marker = randomUUID();
  const email = `auth-smoke-${marker}@example.test`;
  const password = `Smoke-${randomUUID()}-9a!`;
  let authUserId: string | null = null;
  let applicationUserId: string | null = null;
  let fixtureCharacterId: string | null = null;
  let fixtureAttemptId: string | null = null;

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
      const originSecret = process.env.AUTH_SMOKE_ORIGIN_SECRET?.trim();
      fixtureCharacterId = `chr_auth_smoke_${marker}`;
      fixtureAttemptId = `cat_auth_smoke_${marker}`;
      await insertRetainedCompatibilityFixture({
        marker,
        ownerUserId: applicationUser.id,
        characterId: fixtureCharacterId,
        attemptId: fixtureAttemptId,
      });
      await smokeAuthenticatedReadSurface({
        apiBaseUrl,
        accessToken: session.access_token,
        originSecret,
        fixtureCharacterId,
      });
      await smokeAuthenticatedSse({
        apiBaseUrl,
        accessToken: session.access_token,
        originSecret,
        marker,
      });
    }
    console.log(
      process.env.AUTH_SMOKE_SSE === "1"
        ? "Supabase Auth JWT, retained-data reads, screen API surface, and SSE proxy smoke passed"
        : "Supabase Auth JWT, retained-data reads, and screen API surface smoke passed",
    );
  } finally {
    await cleanupSmokeResources({
      fixtureAttemptId,
      fixtureCharacterId,
      applicationUserId,
      authUserId,
      secretKey,
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
