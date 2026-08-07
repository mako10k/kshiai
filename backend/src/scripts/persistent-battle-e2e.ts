import { randomUUID } from "node:crypto";
import {
  BattlePublicSchema,
  type BattleAdvanceStreamEvent,
  type BattlePublic,
} from "@kshiai/shared";
import { config } from "../config.js";
import { closeDatabase, query } from "../db.js";
import {
  E2E_ACCOUNT_EMAILS,
  E2E_FIXTURE_IDS,
  ensurePersistentE2eFixtures,
} from "../e2e-observer.js";
import { setAccountKind, type AccountKind } from "../account-access.js";

const OBSERVATION_PREFIX = "KSHIAI_E2E_OBSERVATION=";

type PersistentAccount = {
  email: string;
  authUserId: string;
  applicationUserId: string;
  accessToken: string;
  accountKind: AccountKind;
};

type SupabaseAdminUser = {
  id?: string;
  email?: string;
};

export function generateEphemeralPassword(): string {
  return `E2E-${randomUUID()}-9a!`;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function validateProductionApiUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/") {
    throw new Error("E2E_API_URL must be an HTTPS origin without path or credentials");
  }
  const allowedHosts = (process.env.E2E_ALLOWED_HOSTS ?? "kshiai.mk10.org")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`E2E_API_URL host is not allowed: ${url.hostname}`);
  }
  return url.origin;
}

async function readError(response: Response): Promise<string> {
  return (await response.text()).replaceAll(/\s+/g, " ").slice(0, 300);
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
    signal: AbortSignal.timeout(30_000),
  });
}

async function findAuthUserByEmail(
  email: string,
  secretKey: string,
): Promise<SupabaseAdminUser | null> {
  for (let page = 1; page <= 10; page += 1) {
    const response = await authRequest(
      `/admin/users?page=${page}&per_page=1000`,
      secretKey,
      { method: "GET" },
    );
    if (!response.ok) {
      throw new Error(`Supabase admin list failed: ${response.status}: ${await readError(response)}`);
    }
    const body = await response.json() as {
      users?: SupabaseAdminUser[];
      next_page?: number | null;
    };
    const match = body.users?.find(
      (user) => user.email?.trim().toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (!body.next_page || (body.users?.length ?? 0) === 0) return null;
  }
  throw new Error("Supabase admin user pagination exceeded its safety bound");
}

async function ensureAuthUser(input: {
  email: string;
  password: string;
  secretKey: string;
}): Promise<string> {
  const mapped = await query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id FROM users WHERE lower(email) = lower($1)`,
    [input.email],
  );
  const mappedAuthId = mapped.rows[0]?.auth_user_id ?? null;
  if (mapped.rows[0] && !mappedAuthId) {
    throw new Error(`Existing application account is not Supabase-owned: ${input.email}`);
  }

  let authUserId = mappedAuthId;
  if (!authUserId) {
    const existing = await findAuthUserByEmail(input.email, input.secretKey);
    authUserId = existing?.id ?? null;
  }
  if (!authUserId) {
    const created = await authRequest("/admin/users", input.secretKey, {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { name: input.email.split("@")[0] },
      }),
    });
    if (!created.ok) {
      throw new Error(`Supabase admin create failed: ${created.status}: ${await readError(created)}`);
    }
    authUserId = (await created.json() as SupabaseAdminUser).id ?? null;
    if (!authUserId) throw new Error("Supabase admin create returned no user ID");
    return authUserId;
  }

  const updated = await authRequest(`/admin/users/${authUserId}`, input.secretKey, {
    method: "PUT",
    body: JSON.stringify({
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.email.split("@")[0] },
    }),
  });
  if (!updated.ok) {
    throw new Error(`Supabase admin update failed: ${updated.status}: ${await readError(updated)}`);
  }
  return authUserId;
}

async function apiRequest(input: {
  apiBaseUrl: string;
  accessToken: string;
  path: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}): Promise<Response> {
  return fetch(`${input.apiBaseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
  });
}

async function apiJson<T>(input: Parameters<typeof apiRequest>[0]): Promise<T> {
  const response = await apiRequest(input);
  if (!response.ok) {
    throw new Error(`API ${input.method ?? "GET"} ${input.path} failed: ${response.status}: ${await readError(response)}`);
  }
  return response.json() as Promise<T>;
}

async function ensurePersistentAccount(input: {
  email: string;
  accountKind: AccountKind;
  apiBaseUrl: string;
  secretKey: string;
  publishableKey: string;
}): Promise<PersistentAccount> {
  const password = generateEphemeralPassword();
  const authUserId = await ensureAuthUser({
    email: input.email,
    password,
    secretKey: input.secretKey,
  });
  const signedIn = await authRequest(
    "/token?grant_type=password",
    input.publishableKey,
    {
      method: "POST",
      body: JSON.stringify({ email: input.email, password }),
    },
  );
  if (!signedIn.ok) {
    throw new Error(`Supabase password sign-in failed: ${signedIn.status}: ${await readError(signedIn)}`);
  }
  const accessToken = (await signedIn.json() as { access_token?: string }).access_token;
  if (!accessToken) throw new Error("Supabase sign-in returned no access token");

  const me = await apiJson<{ user?: { id?: string } }>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken,
    path: "/api/me",
  });
  const applicationUserId = me.user?.id;
  if (!applicationUserId) throw new Error("Authenticated API returned no application user");
  const mapped = await query<{
    auth_user_id: string | null;
    email: string | null;
  }>(
    `SELECT auth_user_id, email FROM users WHERE id = $1`,
    [applicationUserId],
  );
  if (mapped.rows[0]?.auth_user_id !== authUserId ||
      mapped.rows[0]?.email?.toLowerCase() !== input.email.toLowerCase()) {
    throw new Error(`Application user mapping mismatch: ${input.email}`);
  }
  await setAccountKind(applicationUserId, input.accountKind);
  return {
    email: input.email,
    authUserId,
    applicationUserId,
    accessToken,
    accountKind: input.accountKind,
  };
}

export function parseBattleAdvanceStream(body: string): BattlePublic {
  const events: BattleAdvanceStreamEvent[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice("data:".length).trim();
    if (!raw) continue;
    events.push(JSON.parse(raw) as BattleAdvanceStreamEvent);
  }
  const failure = [...events].reverse().find((event) => event.type === "error");
  if (failure?.type === "error") {
    throw new Error(`Battle advance stream error: ${failure.message}`);
  }
  const done = [...events].reverse().find((event) => event.type === "done");
  if (done?.type !== "done") throw new Error("Battle advance stream returned no done event");
  return BattlePublicSchema.parse(done.battle);
}

async function advanceBattle(input: {
  apiBaseUrl: string;
  accessToken: string;
  battleId: string;
  runId: string;
  sequence: number;
}): Promise<{ battle: BattlePublic; elapsedMs: number }> {
  const started = Date.now();
  const response = await apiRequest({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: `/api/battles/${input.battleId}/advance/stream`,
    method: "POST",
    idempotencyKey: `e2e-${input.runId}-advance-${input.sequence}`,
    timeoutMs: 10 * 60_000,
  });
  if (!response.ok) {
    throw new Error(`Battle advance failed: ${response.status}: ${await readError(response)}`);
  }
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("Battle advance returned another content type");
  }
  return {
    battle: parseBattleAdvanceStream(await response.text()),
    elapsedMs: Date.now() - started,
  };
}

function assertContainsId(
  items: Array<{ id?: string }>,
  id: string,
  label: string,
): void {
  if (!items.some((item) => item.id === id)) {
    throw new Error(`${label} did not expose the shared E2E fixture ${id}`);
  }
}

async function assertTestRealmApiVisibility(
  account: PersistentAccount,
  apiBaseUrl: string,
): Promise<void> {
  const candidates = await apiJson<{ candidates?: Array<{ id?: string }> }>({
    apiBaseUrl,
    accessToken: account.accessToken,
    path: "/api/match/candidates",
  });
  const candidateItems = candidates.candidates ?? [];
  assertContainsId(
    candidateItems,
    E2E_FIXTURE_IDS.opponentCharacter,
    "match candidates",
  );
  const ids = candidateItems.flatMap((item) => item.id ? [item.id] : []);
  if (ids.length > 0) {
    const rows = await query<{ id: string; account_kind: string | null }>(
      `SELECT c.id, u.account_kind
       FROM characters c JOIN users u ON u.id = c.owner_user_id
       WHERE c.id = ANY($1)`,
      [ids],
    );
    if (rows.rows.some((row) => row.account_kind === "general")) {
      throw new Error("E2E match candidates leaked a general-realm character");
    }
  }

  const fields = await apiJson<{ battlefields?: Array<{ id?: string }> }>({
    apiBaseUrl,
    accessToken: account.accessToken,
    path: "/api/battlefields",
  });
  assertContainsId(fields.battlefields ?? [], E2E_FIXTURE_IDS.battlefield, "battlefields");
  const styles = await apiJson<{ styles?: Array<{ id?: string }> }>({
    apiBaseUrl,
    accessToken: account.accessToken,
    path: "/api/narration-styles",
  });
  assertContainsId(styles.styles ?? [], E2E_FIXTURE_IDS.narrationStyle, "narration styles");
}

async function main(): Promise<void> {
  const apiBaseUrl = validateProductionApiUrl(required("E2E_API_URL"));
  const secretKey = required("SUPABASE_SECRET_KEY");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  required("DATABASE_URL");
  const runId = randomUUID();
  const targetRevision = process.env.E2E_TARGET_REVISION?.trim() || null;
  const maxAdvances = Math.min(
    30,
    Math.max(1, Number(process.env.E2E_MAX_ADVANCES ?? 24)),
  );
  if (!Number.isInteger(maxAdvances)) throw new Error("E2E_MAX_ADVANCES must be an integer");

  try {
    const observer = await ensurePersistentAccount({
      email: E2E_ACCOUNT_EMAILS.observer,
      accountKind: "e2e",
      apiBaseUrl,
      secretKey,
      publishableKey,
    });
    const opponent = await ensurePersistentAccount({
      email: E2E_ACCOUNT_EMAILS.opponent,
      accountKind: "test",
      apiBaseUrl,
      secretKey,
      publishableKey,
    });
    if (observer.applicationUserId === opponent.applicationUserId) {
      throw new Error("Persistent E2E accounts resolved to the same application user");
    }
    const fixtures = await ensurePersistentE2eFixtures({
      observerUserId: observer.applicationUserId,
      opponentUserId: opponent.applicationUserId,
    });
    await assertTestRealmApiVisibility(observer, apiBaseUrl);

    const created = await apiJson<{ battle?: unknown }>({
      apiBaseUrl,
      accessToken: observer.accessToken,
      path: "/api/battles",
      method: "POST",
      idempotencyKey: `e2e-${runId}-create`,
      timeoutMs: 5 * 60_000,
      body: {
        myCharacterId: E2E_FIXTURE_IDS.observerCharacter,
        opponentCharacterId: E2E_FIXTURE_IDS.opponentCharacter,
        battlefieldMode: "preset",
        battlefieldPresetId: E2E_FIXTURE_IDS.battlefield,
        narrationStyleId: E2E_FIXTURE_IDS.narrationStyle,
        stance: "balanced",
      },
    });
    let battle = BattlePublicSchema.parse(created.battle);
    const advances: Array<{
      sequence: number;
      turn: number;
      status: BattlePublic["status"];
      elapsedMs: number;
      prologuePending: boolean;
      aftermathPending: boolean;
    }> = [];
    for (let sequence = 1; battle.status !== "finished"; sequence += 1) {
      if (sequence > maxAdvances) {
        throw new Error(`Battle did not finish within ${maxAdvances} advances`);
      }
      const result = await advanceBattle({
        apiBaseUrl,
        accessToken: observer.accessToken,
        battleId: battle.id,
        runId,
        sequence,
      });
      battle = result.battle;
      advances.push({
        sequence,
        turn: battle.turn,
        status: battle.status,
        elapsedMs: result.elapsedMs,
        prologuePending: battle.prologuePending,
        aftermathPending: battle.aftermathPending,
      });
    }

    const persisted = await apiJson<{ battle?: unknown }>({
      apiBaseUrl,
      accessToken: observer.accessToken,
      path: `/api/battles/${battle.id}`,
    });
    const persistedBattle = BattlePublicSchema.parse(persisted.battle);
    if (persistedBattle.status !== "finished" || persistedBattle.log.length === 0) {
      throw new Error("Finished E2E battle was not persisted with narration");
    }
    const observation = {
      schemaVersion: 1,
      runId,
      observedAt: new Date().toISOString(),
      target: {
        apiOrigin: apiBaseUrl,
        revision: targetRevision,
      },
      accounts: {
        observer: { email: observer.email, accountKind: observer.accountKind },
        opponent: { email: opponent.email, accountKind: opponent.accountKind },
        crossAccount: true,
      },
      fixtures: {
        ids: E2E_FIXTURE_IDS,
        disposition: fixtures,
      },
      visibility: {
        testRealmSharing: "passed",
        generalCharacterLeakage: "not_observed",
      },
      battle: {
        id: persistedBattle.id,
        status: persistedBattle.status,
        turn: persistedBattle.turn,
        turnLimit: persistedBattle.turnLimit,
        winnerSide: persistedBattle.winnerSide,
        finishReason: persistedBattle.finishReason,
        battlefieldName: persistedBattle.battlefield?.displayName ?? null,
        narrationStyleName: persistedBattle.narrationStyleName ?? null,
        advances,
        log: persistedBattle.log,
      },
    };
    console.log(`${OBSERVATION_PREFIX}${JSON.stringify(observation)}`);
  } finally {
    await closeDatabase();
  }
}

if (process.env.NODE_ENV !== "test" || process.env.KSHIAI_RUN_E2E_MAIN === "1") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
