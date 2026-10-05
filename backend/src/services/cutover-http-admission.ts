// R: Fence public HTTP traffic against cutover phases and finalize admitted operations.
import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import type { UserPublic } from "@kshiai/shared";
import {
  beginCutoverOperation,
  withCutoverBattleOperation,
  currentCutoverControl,
  CutoverUnavailableError,
  cutoverRequestDigest,
} from "./cutover-admission.js";
import type { CutoverControl } from "../repositories/cutover-control.js";
import { existingUserFromRequest } from "./cutover-http-auth.js";
import { finishHttpOperation, requestBodyFor } from "./cutover-http-response.js";
import { assertTrialHttpRequest } from "./cutover-http-trial.js";

declare module "hono" {
  interface ContextVariableMap {
    cutoverControl: CutoverControl | undefined;
  }
}

export { existingUserFromRequest } from "./cutover-http-auth.js";
export { assertTrialHttpRequest } from "./cutover-http-trial.js";

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
  const path = normalizePath(c.req.path);
  if (isBypassPath(path)) return next();
  const loadedControl = await loadControl(c);
  if (loadedControl instanceof Response) return loadedControl;
  const control = loadedControl;
  if (!control) return next();
  c.set("cutoverControl", control);
  if (isClosedBlocked(control, path)) return unavailable(c);
  const user = await existingUserFromRequest(c);
  return control.phase === "open"
    ? openAdmission(c, next, path, user)
    : restrictedAdmission(c, next, control, path, user);
}

function normalizePath(path: string): string {
  return path.startsWith("/api") ? path : `/api${path}`;
}

function isBypassPath(path: string): boolean {
  return /^\/api\/internal\/(narration|authoring)\/task$/.test(path) || path === "/api/health";
}

async function loadControl(c: Context): Promise<CutoverControl | Response | null> {
  try { return await currentCutoverControl(); }
  catch (error) {
    if (error instanceof CutoverUnavailableError) return unavailable(c);
    throw error;
  }
}

function isClosedBlocked(control: CutoverControl, path: string): boolean {
  return control.phase === "closed" && path !== "/api/me" && !isOwnerReviewPath(path);
}

function unavailable(c: Context): Response {
  return c.json({ error: "cutover_unavailable" }, 503, { "Cache-Control": "no-store" });
}

async function openAdmission(c: Context, next: Next, path: string, user: UserPublic | null): Promise<Response | void> {
  const operation = await beginCutoverOperation({
    bindingOperationId: `http:${randomUUID()}`, kind: "http", actorId: user?.id ?? "unresolved",
    method: c.req.method, path,
    requestDigest: cutoverRequestDigest({
      method: c.req.method, path, body: await requestBodyFor(c),
      idempotencyKey: c.req.header("Idempotency-Key") ?? null,
    }),
    battleId: path.match(/^\/api\/battles\/([^/]+)/)?.[1],
  });
  try { await next(); } catch (error) { await operation.finish("indeterminate"); throw error; }
  return finishHttpOperation(c, operation);
}

async function restrictedAdmission(c: Context, next: Next, control: CutoverControl, path: string, user: UserPublic | null): Promise<Response | void> {
  const requestGate = restrictedRequest(c, control, path, user);
  if (requestGate instanceof Response) return requestGate;
  if (c.req.method === "GET" && (requestGate.ownerReview || path === "/api/me")) return next();
  const requestBody = await requestBodyFor(c);
  const request = { method: c.req.method, path, body: requestBody, idempotencyKey: c.req.header("Idempotency-Key") ?? null };
  const battleId = requestBattleId(path, c.req.method, c.req.header("Idempotency-Key"), requestBody, user!.id);
  const trialError = await restrictedTrialError({ control, userId: user!.id, method: c.req.method, path, request, battleId, bindingOperationId: requestGate.trialRequest?.bindingOperationId });
  if (trialError) return unavailable(c);
  const operationResult = await beginRestrictedOperation({ c, path, request, requestBody, battleId, trialRequest: requestGate.trialRequest, userId: user!.id });
  if (operationResult instanceof Response) return operationResult;
  const operation = operationResult;
  try {
    if (battleId) await withCutoverBattleOperation(battleId, next); else await next();
  } catch (error) { await operation.finish("indeterminate"); throw error; }
  return finishHttpOperation(c, operation);
}

type RestrictedTrialInput = {
  control: CutoverControl; userId: string; method: string; path: string; request: unknown;
  battleId: string | undefined; bindingOperationId: string | undefined;
};

async function restrictedTrialError(input: RestrictedTrialInput): Promise<boolean> {
  if (input.control.phase !== "trial") return false;
  try {
    await assertTrialHttpRequest(input);
    return false;
  } catch (error) {
    if (error instanceof CutoverUnavailableError) return true;
    throw error;
  }
}

async function beginRestrictedOperation(
  input: {
    c: Context; path: string; request: unknown; requestBody: unknown; battleId: string | undefined;
    trialRequest: RestrictedRequest["trialRequest"]; userId: string;
  },
): Promise<Awaited<ReturnType<typeof beginCutoverOperation>> | Response> {
  try {
    return await beginCutoverOperation({
      bindingOperationId: input.trialRequest?.bindingOperationId ?? `owner-confirm:${ownerAttempt(input.path)}`,
      kind: "http", actorId: input.userId, method: input.c.req.method, path: input.path,
      requestDigest: cutoverRequestDigest(input.request), battleId: input.battleId,
      ownerAttemptId: ownerAttempt(input.path) ?? undefined, candidateDigest: candidateDigestOf(input.requestBody),
    });
  } catch (error) {
    if (error instanceof CutoverUnavailableError) return unavailable(input.c);
    throw error;
  }
}

function candidateDigestOf(requestBody: unknown): string | undefined {
  if (!requestBody || typeof requestBody !== "object") return undefined;
  const candidateDigest = (requestBody as { candidateDigest?: unknown }).candidateDigest;
  return typeof candidateDigest === "string" ? candidateDigest : undefined;
}

type RestrictedRequest = { ownerReview: boolean; trialRequest: NonNullable<CutoverControl["policy"]["trialBindings"]>["requests"][number] | null };

function restrictedRequest(c: Context, control: CutoverControl, path: string, user: UserPublic | null): RestrictedRequest | Response {
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  const isMe = path === "/api/me";
  if (isMe && user.id !== control.policy.ownerUserId) return unavailable(c);
  const ownerReview = control.phase === "closed" && user.id === control.policy.ownerUserId && isOwnerReviewPath(path);
  if (ownerReview && !validOwnerReview(control, path)) return unavailable(c);
  const trialRequest = findTrialRequest(c, control, path, user.id);
  if (control.phase === "trial" && user.id === control.policy.ownerUserId && !trialRequest) return unavailable(c);
  if (!ownerReview && !trialRequest && !isMe) return unavailable(c);
  return { ownerReview, trialRequest };
}

function findTrialRequest(c: Context, control: CutoverControl, path: string, userId: string): RestrictedRequest["trialRequest"] {
  if (control.phase !== "trial" || userId !== control.policy.ownerUserId) return null;
  return control.policy.trialBindings?.requests.find((candidate) =>
    candidate.kind === "http" && candidate.method === c.req.method && candidate.path === path) ?? null;
}

function validOwnerReview(control: CutoverControl, path: string): boolean {
  const attemptId = ownerAttempt(path);
  return Boolean(attemptId && control.policy.ownerCandidates.some((candidate) => candidate.attemptId === attemptId));
}

function requestBattleId(path: string, method: string, idempotencyKey: string | undefined, body: unknown, userId: string): string | undefined {
  const pathBattleId = path.match(/^\/api\/battles\/([^/]+)/)?.[1];
  if (pathBattleId || path !== "/api/battles" || method !== "POST" || !idempotencyKey) return pathBattleId;
  return `btl_${cutoverRequestDigest({ userId, scope: "battle-create", key: idempotencyKey, requestHash: cutoverRequestDigest(body) }).slice(0, 32)}`;
}
