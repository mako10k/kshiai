// R: Authenticate existing HTTP identities and fence public HTTP traffic against cutover phases.
import { createSupabaseIdentityVerifier } from "./supabase-identity.js";
import { randomUUID, createHash } from "node:crypto";
import type { Context, Next } from "hono";
import type { UserPublic } from "@kshiai/shared";
import { CharacterGenerationEnvelopeV3Schema } from "@kshiai/shared";
import { config } from "../config.js";
import { getSessionToken } from "../auth.js";
import { query } from "../db.js";
import {
  assertCutoverTrialBattle,
  beginCutoverOperation,
  withCutoverBattleOperation,
  currentCutoverControl,
  CutoverUnavailableError,
  cutoverRequestDigest,
} from "./cutover-admission.js";
import type { CutoverControl } from "../repositories/cutover-control.js";

declare module "hono" {
  interface ContextVariableMap {
    cutoverControl: CutoverControl | undefined;
  }
}

const verifySupabaseIdentity = createSupabaseIdentityVerifier(config);

type ExistingUserRow = { id: string; username: string; display_name: string | null };

function toUser(row: ExistingUserRow): UserPublic {
  return { id: row.id, username: row.username, displayName: row.display_name ?? row.username };
}

/** Authenticate without provisioning a user or deleting an expired session. */
export async function existingUserFromRequest(c: Context): Promise<UserPublic | null> {
  if (config.authProvider === "supabase") {
    const token = c.req.header("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) return null;
    try {
      const identity = await verifySupabaseIdentity(token);
      if (!identity) return null;
      const result = await query<ExistingUserRow>(
        "SELECT id, username, display_name FROM users WHERE auth_user_id = $1", [identity.subject],
      );
      return result.rows[0] ? toUser(result.rows[0]) : null;
    } catch { return null; }
  }
  const token = getSessionToken(c);
  if (!token) return null;
  const result = await query<ExistingUserRow & { expires_at: string | Date }>(
    `SELECT u.id, u.username, u.display_name, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`, [token],
  );
  const row = result.rows[0];
  if (!row) return null;
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return toUser(row);
}

function isOwnerReviewPath(path: string): boolean {
  return /^\/api\/character-drafts\/[^/]+$/.test(path) ||
    /^\/api\/characters\/[^/]+\/confirm$/.test(path);
}

function ownerAttempt(path: string): string | null {
  const review = path.match(/^\/api\/character-drafts\/([^/]+)$/);
  if (review) return review[1];
  const confirm = path.match(/^\/api\/characters\/([^/]+)\/confirm$/);
  return confirm?.[1] ?? null;
}

export function isExactOwnerReviewPath(c: Context): boolean {
  return isOwnerReviewPath(c.req.path);
}

export function exactOwnerAttempt(c: Context): string | null {
  return ownerAttempt(c.req.path);
}

export function closedOwnerConfirmInput(input: {
  control: CutoverControl;
  userId: string;
  path: string;
  method: string;
  candidateDigest?: string;
}): boolean {
  if (input.method !== "POST" || input.userId !== input.control.policy.ownerUserId) return false;
  const attemptId = ownerAttempt(input.path);
  return Boolean(attemptId && input.path === `/api/characters/${attemptId}/confirm` &&
    input.candidateDigest && input.control.policy.ownerCandidates.some((candidate) =>
      candidate.attemptId === attemptId && candidate.candidateDigest === input.candidateDigest));
}

export async function cutoverHttpAdmission(c: Context, next: Next): Promise<Response | void> {
  const path = c.req.path.startsWith("/api") ? c.req.path : `/api${c.req.path}`;
  // Task handlers authenticate their OIDC caller before this fence; do not let
  // the public HTTP middleware acknowledge a task smoke request first.
  if (/^\/api\/internal\/(narration|authoring)\/task$/.test(path)) return next();
  if (path === "/api/health") return next();
  let control: CutoverControl | null;
  try {
    control = await currentCutoverControl();
  } catch (error) {
    if (error instanceof CutoverUnavailableError) {
      return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
    }
    throw error;
  }
  if (!control) return next();
  c.set("cutoverControl", control);
  if (control.phase === "closed" && path !== "/api/me" && !isOwnerReviewPath(path)) {
    return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
  }
  const user = await existingUserFromRequest(c);
  if (control.phase === "open") {
    const operation = await beginCutoverOperation({
      bindingOperationId: `http:${randomUUID()}`,
      kind: "http", actorId: user?.id ?? "unresolved", method: c.req.method, path,
      requestDigest: cutoverRequestDigest({
        method: c.req.method, path, body: await requestBodyFor(c),
        idempotencyKey: c.req.header("Idempotency-Key") ?? null,
      }),
      battleId: path.match(/^\/api\/battles\/([^/]+)/)?.[1],
    });
    try { await next(); } catch (error) { await operation.finish("indeterminate"); throw error; }
    return finishHttpOperation(c, operation);
  }
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  const isMe = path === "/api/me";
  if (isMe && user.id !== control.policy.ownerUserId) {
    return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
  }
  const ownerReview = control.phase === "closed" && user.id === control.policy.ownerUserId && isOwnerReviewPath(path);
  if (ownerReview) {
    const attemptId = ownerAttempt(path);
    if (!attemptId || !control.policy.ownerCandidates.some((candidate) => candidate.attemptId === attemptId)) {
      return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
    }
  }
  let trialRequest: NonNullable<CutoverControl["policy"]["trialBindings"]>["requests"][number] | null = null;
  if (control.phase === "trial" && user.id === control.policy.ownerUserId) {
    const method = c.req.method;
    trialRequest = control.policy.trialBindings?.requests.find((candidate) =>
      candidate.kind === "http" && candidate.method === method && candidate.path === path) ?? null;
    if (!trialRequest) {
      return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
    }
  }
  if (!ownerReview && !trialRequest && !isMe) {
    return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
  }
  if (c.req.method === "GET" && (ownerReview || isMe)) return next();
  const requestBody = await requestBodyFor(c);
  const request = { method: c.req.method, path, body: requestBody,
    idempotencyKey: c.req.header("Idempotency-Key") ?? null };
  const pathBattleId = path.match(/^\/api\/battles\/([^/]+)/)?.[1];
  const battleId = pathBattleId ?? (path === "/api/battles" && c.req.method === "POST" &&
    c.req.header("Idempotency-Key")
    ? `btl_${cutoverRequestDigest({ userId: user.id, scope: "battle-create",
      key: c.req.header("Idempotency-Key"), requestHash: cutoverRequestDigest(requestBody) }).slice(0, 32)}`
    : undefined);
  if (control.phase === "trial") {
    try {
      await assertTrialHttpRequest({ control, userId: user.id, method: c.req.method,
        path, request, battleId,
        bindingOperationId: trialRequest?.bindingOperationId });
    } catch (error) {
      if (error instanceof CutoverUnavailableError) {
        return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
      }
      throw error;
    }
  }
  const candidateDigest = requestBody && typeof requestBody === "object" &&
    typeof (requestBody as { candidateDigest?: unknown }).candidateDigest === "string"
    ? (requestBody as { candidateDigest: string }).candidateDigest : undefined;
  let operation: Awaited<ReturnType<typeof beginCutoverOperation>>;
  try {
    operation = await beginCutoverOperation({
      bindingOperationId: trialRequest?.bindingOperationId ?? `owner-confirm:${ownerAttempt(path)}`,
      kind: "http", actorId: user.id, method: c.req.method, path,
      requestDigest: cutoverRequestDigest(request), battleId,
      ownerAttemptId: ownerAttempt(path) ?? undefined, candidateDigest,
    });
  } catch (error) {
    if (error instanceof CutoverUnavailableError) {
      return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
    }
    throw error;
  }
  try {
    if (battleId) await withCutoverBattleOperation(battleId, next);
    else await next();
  } catch (error) { await operation.finish("indeterminate"); throw error; }
  return finishHttpOperation(c, operation);
}

async function requestBodyFor(c: Context): Promise<unknown> {
  try { return await c.req.raw.clone().json(); } catch { return null; }
}
async function finishHttpOperation(c: Context, operation: Awaited<ReturnType<typeof beginCutoverOperation>>): Promise<void> {
  const response = c.res;
  if (!response.body || response.headers.get("content-type")?.includes("text/event-stream") !== true) {
    const body = new Uint8Array(await response.clone().arrayBuffer());
    await operation.finish(response.status >= 500 ? "indeterminate" : "settled", responseDigest(response.status, body));
    return;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await operation.finish("settled", responseDigest(response.status, concatChunks(chunks)));
          controller.close(); return;
        }
        chunks.push(chunk.value);
        controller.enqueue(chunk.value);
      } catch (error) {
        await operation.finish("indeterminate", responseDigest(response.status, concatChunks(chunks))); controller.error(error);
      }
    },
    async cancel() {
      await operation.finish("indeterminate", responseDigest(response.status, concatChunks(chunks)));
      await reader.cancel();
    },
  });
  c.res = new Response(stream, response);
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
function responseDigest(status: number, body: Uint8Array): string {
  return createHash("sha256").update(String(status)).update(":").update(body).digest("hex");
}

export async function assertTrialHttpRequest(input: {
  control: CutoverControl;
  userId: string;
  method: string;
  path: string;
  request: unknown;
  battleId?: string;
  bindingOperationId?: string;
}): Promise<void> {
  if (input.control.phase !== "trial") return;
  const digest = cutoverRequestDigest(input.request);
  const binding = input.control.policy.trialBindings?.requests.find((candidate) =>
    candidate.kind === "http" && candidate.requestDigest === digest &&
    candidate.method === input.method && candidate.path === input.path &&
    candidate.battleId === input.battleId &&
    (!input.bindingOperationId || candidate.bindingOperationId === input.bindingOperationId));
  if (!binding || input.userId !== input.control.policy.ownerUserId) throw new CutoverUnavailableError();
  if (input.path === "/api/battles" && input.method === "POST") {
    await assertTrialCreateParticipants(input.control, input.userId, input.request);
  }
  if (input.battleId && input.path !== "/api/battles") {
    await assertCutoverTrialBattle(input.control, input.battleId);
  }
}

async function assertTrialCreateParticipants(
  control: CutoverControl,
  userId: string,
  request: unknown,
): Promise<void> {
  const body = request && typeof request === "object" && "body" in request
    ? (request as { body?: unknown }).body : null;
  const myCharacterId = body && typeof body === "object" &&
    typeof (body as { myCharacterId?: unknown }).myCharacterId === "string"
    ? (body as { myCharacterId: string }).myCharacterId : null;
  const opponentCharacterId = body && typeof body === "object" &&
    typeof (body as { opponentCharacterId?: unknown }).opponentCharacterId === "string"
    ? (body as { opponentCharacterId: string }).opponentCharacterId : null;
  const generations = control.policy.trialBindings?.generationIds;
  if (!myCharacterId || !opponentCharacterId || !generations) throw new CutoverUnavailableError();
  const result = await query<{
    id: string; owner_user_id: string; generation_id: string; schema_version: number; content_json: unknown;
  }>(
    `SELECT c.id, c.owner_user_id, g.generation_id, g.schema_version, g.content_json
     FROM characters c
     JOIN asset_current_generations current ON current.asset_type='character' AND current.asset_id=c.id
     JOIN asset_generations g ON g.asset_type='character' AND g.asset_id=c.id
       AND g.generation=current.generation
     WHERE c.id IN ($1,$2)`, [myCharacterId, opponentCharacterId],
  );
  if (result.rows.length !== 2) throw new CutoverUnavailableError();
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  const mine = byId.get(myCharacterId);
  const opponent = byId.get(opponentCharacterId);
  let mineContent: unknown = mine?.content_json;
  let opponentContent: unknown = opponent?.content_json;
  try {
    if (typeof mineContent === "string") mineContent = JSON.parse(mineContent);
    if (typeof opponentContent === "string") opponentContent = JSON.parse(opponentContent);
  } catch { throw new CutoverUnavailableError(); }
  if (!mine || !opponent || mine.owner_user_id !== userId || mine.generation_id !== generations[0] ||
      opponent.generation_id !== generations[1] || mine.schema_version !== 3 || opponent.schema_version !== 3 ||
      !CharacterGenerationEnvelopeV3Schema.safeParse(mineContent).success ||
      !CharacterGenerationEnvelopeV3Schema.safeParse(opponentContent).success) {
    throw new CutoverUnavailableError();
  }
}
