import { randomUUID } from "node:crypto";
import {
  BattlePublicSchema,
  type BattleListItem,
  type BattleAdvanceStreamEvent,
  type BattleNarrationSnapshot,
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
import {
  authRequest,
  ensureAuthUser,
  generateEphemeralPassword,
} from "../e2e-supabase-admin.js";
import { assessDialogueQuality } from "./dialogue-quality.js";
import {
  PROVIDER_OPERATION_LAYERS,
  PROVIDER_OPERATION_TAXONOMY_REVISION,
  type ProviderOperationLayer,
} from "../llm/provider-operation-taxonomy.js";
import {
  OBSERVATION_RUN_HEADER,
  createProviderOperationRun,
  finalizeProviderOperationRun,
  readProviderOperationRun,
} from "../llm/provider-accounting.js";

export {
  PROVIDER_OPERATION_LAYERS as OBSERVATION_PROVIDER_OPERATION_LAYERS,
  PROVIDER_OPERATION_TAXONOMY_REVISION as OBSERVATION_PROVIDER_OPERATION_TAXONOMY_REVISION,
};

const OBSERVATION_PREFIX = "KSHIAI_E2E_OBSERVATION=";

type PersistentAccount = {
  email: string;
  authUserId: string;
  applicationUserId: string;
  accessToken: string;
  accountKind: AccountKind;
};

type SanitizedObservation = {
  runId: string;
  observedAt: string;
  target: { revision: string | null };
  accounts: { crossAccount: boolean };
  visibility: {
    testRealmSharing: string;
    generalCharacterLeakage: string;
  };
  battle: {
    id: string;
    status: string;
    log: unknown[];
  };
  [key: string]: unknown;
};

export type ObservationProviderOperationBudget = {
  encounter: number;
  characterExpression: number;
  deepPsyche: number;
  environment: number;
  narration: number;
  referee: number;
  total: number;
};

export function projectObservationProviderOperations(
  maxAdvances: number,
): ObservationProviderOperationBudget {
  if (!Number.isInteger(maxAdvances) || maxAdvances < 1 || maxAdvances > 30) {
    throw new Error("maxAdvances must be an integer from 1 through 30");
  }
  const combatAdvances = Math.max(0, maxAdvances - 2);
  const layers = {
    // Creation can both concretize the battlefield and prepare encounter terms.
    encounter: 2,
    // Each phase may express both characters; combat may additionally decide
    // one action for each side before expression.
    characterExpression: (maxAdvances * 2) + (combatAdvances * 2),
    // Normal-turn psyche is deterministic, while prologue and aftermath may
    // each call both isolated character contexts.
    deepPsyche: 4,
    // Each combat advance may propose an environment beat and reconcile the
    // committed semantic state.
    environment: combatAdvances * 2,
    // One receipt per advance plus bounded judgment/terminal phase receipts.
    narration: maxAdvances + 2,
    referee: 1,
  };
  return { ...layers, total: Object.values(layers).reduce((sum, value) => sum + value, 0) };
}

export function authorizeObservationProviderBudget(input: {
  runId: string;
  approvedRunId: string | undefined;
  ceiling: number;
  projected: ObservationProviderOperationBudget;
}): void {
  if (input.approvedRunId !== input.runId) {
    throw new Error("E2E_OBSERVATION_APPROVED_RUN_ID must exactly match E2E_RUN_ID");
  }
  if (!Number.isInteger(input.ceiling) || input.ceiling < 1) {
    throw new Error("E2E_PROVIDER_OPERATION_CEILING must be a positive integer");
  }
  if (input.projected.total > input.ceiling) {
    throw new Error(
      `Projected provider operations ${input.projected.total} exceed ceiling ${input.ceiling}`,
    );
  }
}

const FORBIDDEN_OBSERVATION_KEYS = new Set([
  "accessToken",
  "authUserId",
  "applicationUserId",
  "parameters",
  "recordOverall",
  "semanticState",
  "ratingSettlement",
]);

export { generateEphemeralPassword } from "../e2e-supabase-admin.js";

export function resolveObservationRunId(raw: string | undefined): string {
  if (!raw) return randomUUID();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw)) {
    throw new Error("E2E_RUN_ID must be a bounded portable identifier");
  }
  return raw;
}

export function assertSanitizedObservation(
  value: unknown,
  expectedRevision: string | null,
): asserts value is SanitizedObservation {
  if (!value || typeof value !== "object") {
    throw new Error("Observation must be an object");
  }
  const observation = value as Partial<SanitizedObservation>;
  if (observation.target?.revision !== expectedRevision) {
    throw new Error("Observation revision mismatch");
  }
  if (observation.battle?.status !== "finished" || !observation.battle.id) {
    throw new Error("Observation did not retain a finished battle");
  }
  const controls = observation as Record<string, unknown>;
  if (controls.historyVisibility !== "passed" ||
      !(controls.narrationConvergence as { terminalReceiptCount?: number } | undefined)
        ?.terminalReceiptCount) {
    throw new Error("Observation lacks narration convergence or history visibility evidence");
  }
  if (observation.accounts?.crossAccount !== true ||
      observation.visibility?.testRealmSharing !== "passed" ||
      observation.visibility?.generalCharacterLeakage !== "not_observed") {
    throw new Error("Observation visibility assertions did not pass");
  }
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_OBSERVATION_KEYS.has(key)) {
        throw new Error(`Forbidden observation key: ${key}`);
      }
      visit(child);
    }
  };
  visit(observation);
}

export async function persistSanitizedObservation(
  observation: SanitizedObservation,
): Promise<void> {
  await query(
    `INSERT INTO balance_events
      (kind, created_at, battle_id, character_id, payload_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      "persistent_e2e_observation",
      observation.observedAt,
      observation.battle.id,
      E2E_FIXTURE_IDS.observerCharacter,
      JSON.stringify(observation),
    ],
  );
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

async function apiRequest(input: {
  apiBaseUrl: string;
  accessToken: string;
  path: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  observationRunId?: string;
}): Promise<Response> {
  return fetch(`${input.apiBaseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
      ...(input.observationRunId
        ? { [OBSERVATION_RUN_HEADER]: input.observationRunId }
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

async function inspectInternalBattleObservation(input: {
  account: PersistentAccount;
  apiBaseUrl: string;
  battleId: string;
}): Promise<{
  turnRecordCount: number;
  canonicalTransitionCount: number;
  narrationProviderOperations: number;
}> {
  const response = await apiJson<{
    role?: string;
    summary?: { battleId?: string };
    rawBattleState?: { id?: string };
    capabilities?: {
      turnRecordCount?: number;
      canonicalTransitionCount?: number;
    };
    narrationQueue?: Array<{
      sequence?: number;
      status?: string;
      attemptCount?: number;
      blockedBySequence?: number | null;
      outbox?: { status?: string } | null;
      lease?: unknown | null;
      latestAttempt?: { httpAttempts?: number } | null;
      attemptTotals?: { httpAttempts?: number };
    }>;
  }>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.account.accessToken,
    path: `/api/internal/observations/${input.battleId}`,
  });
  const turnRecordCount = response.capabilities?.turnRecordCount ?? 0;
  const canonicalTransitionCount =
    response.capabilities?.canonicalTransitionCount ?? 0;
  if (
    response.role !== "e2e" ||
    response.summary?.battleId !== input.battleId ||
    response.rawBattleState?.id !== input.battleId ||
    turnRecordCount <= 0 ||
    canonicalTransitionCount <= 0
  ) {
    throw new Error("Internal observation API did not expose the retained canonical battle");
  }
  const narrationQueue = response.narrationQueue ?? [];
  if (narrationQueue.length === 0 || narrationQueue.some((entry) =>
    !["completed", "failed", "cancelled"].includes(entry.status ?? "") ||
    entry.attemptCount !== 1 || entry.blockedBySequence !== null ||
    entry.lease !== null || entry.outbox?.status !== "completed"
  )) {
    throw new Error("Narration receipts did not converge to one terminal attempt each");
  }
  const sequences = narrationQueue.map((entry) => entry.sequence);
  if (sequences.some((value, index) => value !== index + 1)) {
    throw new Error("Narration receipt sequence is not contiguous");
  }
  return {
    turnRecordCount,
    canonicalTransitionCount,
    narrationProviderOperations: narrationQueue.reduce(
      (sum, entry) => sum + (entry.attemptTotals?.httpAttempts ?? 0),
      0,
    ),
  };
}

async function waitForNarrationConvergence(input: {
  apiBaseUrl: string;
  accessToken: string;
  battleId: string;
}): Promise<BattleNarrationSnapshot> {
  for (let poll = 0; poll < 90; poll += 1) {
    const snapshot = await apiJson<BattleNarrationSnapshot>({
      apiBaseUrl: input.apiBaseUrl,
      accessToken: input.accessToken,
      path: `/api/battles/${input.battleId}/narration`,
    });
    const terminal = snapshot.entries.length > 0 && snapshot.entries.every((entry) =>
      entry.status === "completed" || entry.status === "failed" || entry.status === "cancelled"
    );
    if (terminal) {
      const sequences = snapshot.entries.map((entry) => entry.sequence);
      if (sequences.some((value, index) => value !== index + 1)) {
        throw new Error("Public narration projection is not in contiguous receipt order");
      }
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Narration receipts did not reach terminal state within 180 seconds");
}

async function assertBattleHistoryVisibility(input: {
  apiBaseUrl: string;
  accessToken: string;
  battleId: string;
}): Promise<void> {
  const history = await apiJson<{ battles?: BattleListItem[] }>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: `/api/battles?status=all&q=${encodeURIComponent(input.battleId)}`,
  });
  if (!history.battles?.some((battle) => battle.id === input.battleId)) {
    throw new Error("Finished battle is missing from battle history");
  }
}

export function verifyProviderOperationLedger(input: {
  ledger: Awaited<ReturnType<typeof readProviderOperationRun>>;
  runId: string;
  battleId: string;
  ceiling: number;
  narrationProviderOperations: number;
}): {
  byLayer: Record<ProviderOperationLayer, number>;
  total: number;
  tokenCount: number | null;
  estimatedCostUsd: number | null;
} {
  if (
    input.ledger.runId !== input.runId ||
    input.ledger.battleId !== input.battleId ||
    input.ledger.battleObservationRunId !== input.runId ||
    input.ledger.taxonomyRevision !== PROVIDER_OPERATION_TAXONOMY_REVISION ||
    input.ledger.approvedAttemptCeiling !== input.ceiling ||
    input.ledger.status !== "active"
  ) {
    throw new Error("Provider operation ledger identity mismatch");
  }
  if (input.ledger.attempts.some((attempt) => attempt.status === "reserved")) {
    throw new Error("Provider operation ledger retains unresolved attempts");
  }
  const byLayer: Record<ProviderOperationLayer, number> = {
    encounter: 0,
    characterExpression: 0,
    deepPsyche: 0,
    environment: 0,
    narration: 0,
    referee: 0,
  };
  for (const attempt of input.ledger.attempts) {
    if (!(attempt.layer in byLayer)) {
      throw new Error(`Provider operation ledger contains unknown layer: ${attempt.layer}`);
    }
    byLayer[attempt.layer as ProviderOperationLayer] += attempt.count;
  }
  const total = Object.values(byLayer).reduce((sum, count) => sum + count, 0);
  if (total !== input.ledger.reservedAttempts || total > input.ceiling) {
    throw new Error("Provider operation ledger total does not reconcile with reservations");
  }
  if (byLayer.narration !== input.narrationProviderOperations) {
    throw new Error(
      `Narration accounting mismatch: ledger=${byLayer.narration} receipts=${input.narrationProviderOperations}`,
    );
  }
  const tokenCount = input.ledger.attempts.every((attempt) => attempt.tokenCount !== null)
    ? input.ledger.attempts.reduce((sum, attempt) => sum + (attempt.tokenCount ?? 0), 0)
    : null;
  const estimatedCostUsd = input.ledger.attempts.every(
    (attempt) => attempt.estimatedCostUsd !== null,
  )
    ? input.ledger.attempts.reduce(
        (sum, attempt) => sum + (attempt.estimatedCostUsd ?? 0),
        0,
      )
    : null;
  return { byLayer, total, tokenCount, estimatedCostUsd };
}

async function main(): Promise<void> {
  const apiBaseUrl = validateProductionApiUrl(required("E2E_API_URL"));
  const secretKey = required("SUPABASE_SECRET_KEY");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  required("DATABASE_URL");
  const runId = resolveObservationRunId(process.env.E2E_RUN_ID);
  const targetRevision = process.env.E2E_TARGET_REVISION?.trim() || null;
  const maxAdvances = Math.min(
    30,
    Math.max(1, Number(process.env.E2E_MAX_ADVANCES ?? 24)),
  );
  if (!Number.isInteger(maxAdvances)) throw new Error("E2E_MAX_ADVANCES must be an integer");
  const projectedProviderOperations = projectObservationProviderOperations(maxAdvances);
  const providerOperationCeiling = Number(process.env.E2E_PROVIDER_OPERATION_CEILING ?? "");
  authorizeObservationProviderBudget({
    runId,
    approvedRunId: process.env.E2E_OBSERVATION_APPROVED_RUN_ID,
    ceiling: providerOperationCeiling,
    projected: projectedProviderOperations,
  });

  let providerRunCreated = false;
  let providerRunFinalized = false;
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
    await createProviderOperationRun({
      runId,
      observerUserId: observer.applicationUserId,
      approvedAttemptCeiling: providerOperationCeiling,
      projectedOperations: projectedProviderOperations,
    });
    providerRunCreated = true;

    const created = await apiJson<{ battle?: unknown }>({
      apiBaseUrl,
      accessToken: observer.accessToken,
      path: "/api/battles",
      method: "POST",
      idempotencyKey: `e2e-${runId}-create`,
      timeoutMs: 5 * 60_000,
      observationRunId: runId,
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
    if (persistedBattle.status !== "finished") {
      throw new Error("Finished E2E battle was not persisted");
    }
    const narration = await waitForNarrationConvergence({
      apiBaseUrl,
      accessToken: observer.accessToken,
      battleId: persistedBattle.id,
    });
    await assertBattleHistoryVisibility({
      apiBaseUrl,
      accessToken: observer.accessToken,
      battleId: persistedBattle.id,
    });
    const internalObservability = await inspectInternalBattleObservation({
      account: observer,
      apiBaseUrl,
      battleId: persistedBattle.id,
    });
    const ledger = await readProviderOperationRun(runId);
    const actualProviderOperations = verifyProviderOperationLedger({
      ledger,
      runId,
      battleId: persistedBattle.id,
      ceiling: providerOperationCeiling,
      narrationProviderOperations: internalObservability.narrationProviderOperations,
    });
    await finalizeProviderOperationRun(runId, "completed");
    providerRunFinalized = true;
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
      internalObservability: {
        battleDetail: "passed",
        ...internalObservability,
      },
      providerOperations: {
        approvedCeiling: providerOperationCeiling,
        projected: projectedProviderOperations,
        actualMeasured: {
          taxonomyRevision: PROVIDER_OPERATION_TAXONOMY_REVISION,
          battleId: persistedBattle.id,
          ...actualProviderOperations,
          scope: "durable physical provider HTTP attempts by layer",
        },
      },
      narrationConvergence: {
        terminalReceiptCount: narration.entries.length,
        orderedProjection: "passed",
        oneAttemptPerReceipt: "passed",
        liveGenerations: 0,
      },
      historyVisibility: "passed",
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
      dialogueQuality: assessDialogueQuality(persistedBattle.log),
    };
    assertSanitizedObservation(observation, targetRevision);
    await persistSanitizedObservation(observation);
    console.log(`${OBSERVATION_PREFIX}${JSON.stringify(observation)}`);
  } catch (error) {
    if (providerRunCreated && !providerRunFinalized) {
      try {
        await finalizeProviderOperationRun(runId, "failed");
      } catch (finalizeError) {
        console.error(
          "Failed to finalize provider operation run",
          finalizeError instanceof Error ? finalizeError.message : String(finalizeError),
        );
      }
    }
    throw error;
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
