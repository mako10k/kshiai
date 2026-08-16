import { Hono } from "hono";
import {
  BattlefieldChatRequestSchema,
  CharacterChatRequestSchema,
  CreateBattleRequestSchema,
  GenerateBattlefieldRequestSchema,
  GenerateCharacterRequestSchema,
  GenerateNarrationStyleRequestSchema,
  GeneratePoliciesRequestSchema,
  AddFriendRequestSchema,
  CharacterVisibilityUpdateSchema,
  E2eSessionRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  UpdateDisplayNameRequestSchema,

  UpdateDialoguePipelineSettingsSchema,
  coalesceNonEmptyList,
  toPublicNarrationStyle,
  toPublicPreset,
  balanceCharacterCombatFields,
  CharacterGenerationEnvelopeV2Schema,
  BattlefieldGenerationEnvelopeV2Schema,
  narrationDefinitionV2ToLegacyStyle,
  characterDefinitionV2ToLegacySheet,
  battlefieldDefinitionV2ToLegacyPreset,
  projectCharacterImageBriefV2,
  projectBattlefieldImageBriefV2,
  toAssetAuthoringProgress,
  type BattlefieldPreset,
  type CharacterSheet,
  type NarrationStyle,
} from "@kshiai/shared";
import {
  clearSessionCookie,
  createSession,
  getSessionToken,
  registerUser,
  requireAdmin,
  requireE2eSessionOperator,
  requireInternalObservability,
  requireUser,
  setSessionCookie,
  userFromRequest,
  verifyLogin,
  destroySession,
} from "./auth.js";
import { newId } from "./id.js";
import { createLlmProvider } from "./llm/index.js";
import {
  OBSERVATION_RUN_HEADER,
  bindProviderOperationRun,
  parseObservationRunId,
  withBattleProviderOperationContext,
  withProviderOperationContext,
} from "./llm/provider-accounting.js";
import * as charRepo from "./repositories/characters.js";
import * as charAssetRepo from "./repositories/character-assets-v2.js";
import * as battlefieldAssetRepo from "./repositories/battlefield-assets-v2.js";
import * as narrationStyleAssetRepo from "./repositories/narration-style-assets-v2.js";
import * as battleRepo from "./repositories/battles.js";
import * as bfRepo from "./repositories/battlefields.js";
import * as styleRepo from "./repositories/narration-styles.js";
import * as friendRepo from "./repositories/friends.js";
import * as userRepo from "./repositories/users.js";
import * as dialoguePipelineRepo from "./repositories/dialogue-pipeline-settings.js";
import * as notificationRepo from "./repositories/owner-notifications.js";
import {
  advanceTurn,
  generateMatchPolicies,
  pickRandomOpponent,
  pickAutoMatchedOpponent,
  startBattle,
  toBattlePublicForViewer,
} from "./services/battle-service.js";
import { getBalanceSummary } from "./services/balance-observe.js";
import {
  getInternalBattleObservation,
  listInternalBattleObservations,
} from "./services/internal-observability.js";
import { mintE2eSession } from "./services/e2e-session.js";
import { findCharacterNameConflict } from "./character-name-uniqueness.js";
import { databaseKind, query } from "./db.js";
import { config } from "./config.js";
import { getUserAccessProfile } from "./account-access.js";
import {
  abandonIdempotentRequest,
  beginIdempotentRequest,
  completeIdempotentRequest,
  requestDigest,
} from "./services/distributed-guard.js";
import {
  createLlmNarrationGenerator,
  getBattleNarrationSnapshot,
  processNextNarration,
  processNextNarrationAcrossBattles,
  readBattleNarrationEvents,
  waitForBattleNarrationEvents,
} from "./services/narration-worker.js";
import {
  dispatchPendingNarrationTasks,
  verifyNarrationTaskAuthorization,
} from "./services/narration-task-dispatch.js";
import { assetContentDigest } from "./repositories/asset-generations.js";

import {
  authoringAcceptedFromAttempt,
  wakeCharacterAuthoringJobs,
} from "./services/character-authoring-jobs.js";
import type { LlmProvider } from "./llm/types.js";

type CharacterPortraitGenerator = typeof import(
  "./services/image-service.js"
)["generateAndStoreCharacterPortrait"];

type BattlefieldImageGenerator = typeof import(
  "./services/image-service.js"
)["generateAndStoreBattlefieldImage"];

async function publicUserWithAccess(user: {
  id: string;
  username: string;
  displayName?: string;
}) {
  const displayName =
    user.displayName ??
    (await userRepo.getUserPublicById(user.id))?.displayName ??
    user.username;
  return {
    id: user.id,
    username: user.username,
    displayName,
    isAdmin: (await getUserAccessProfile(user.id)).isAdmin,
  };
}

async function wakeNarrationTasks(): Promise<void> {
  try {
    const dispatch = await dispatchPendingNarrationTasks();
    if (dispatch.failed > 0) {
      console.error("[narration] task dispatch incomplete", dispatch);
    }
  } catch (error) {
    console.error("[narration] task dispatch failed", error);
  }
}

/** Versioned media (?v=) can be cached hard; bare paths revalidate often (iOS Safari). */
function cacheControlForMedia(version: string | undefined): string {
  if (version && version.length > 0) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=60, must-revalidate";
}

function readIdempotencyKey(value: string | undefined): string | null {
  const key = value?.trim() ?? "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(key) ? key : null;
}

async function characterSheetForAttempt(
  attempt: charAssetRepo.CharacterAuthoringAttempt,
): Promise<CharacterSheet> {
  if (!attempt.candidate) throw new Error("AUTHORING_CANDIDATE_MISSING");
  const existing = await charRepo.getSheetIncludingDeleted(attempt.characterId);
  const now = attempt.updatedAt;
  return characterDefinitionV2ToLegacySheet({
    characterId: attempt.characterId,
    ownerUserId: attempt.ownerUserId,
    definition: attempt.candidate.definition,
    publicPresentation: attempt.candidate.publicPresentation,
    createdAt: existing?.createdAt ?? attempt.createdAt,
    updatedAt: now,
    previousImageUrl: existing?.appearance.previousImageUrl,
    operational: existing
      ? {
          visibility: existing.visibility,
          record: existing.record,
          recordOverall: existing.recordOverall,
          improvementMemo: existing.improvementMemo,
          opponentMemories: existing.opponentMemories,
          deletedAt: existing.deletedAt,
          revisionSnapshot: existing.revisionSnapshot,
        }
      : undefined,
  });
}

async function characterReviewResponse(
  attempt: charAssetRepo.CharacterAuthoringAttempt,
  viewerUserId: string,
) {
  const latest = await charAssetRepo.getLatestCharacterAuthoringAttemptForCharacter(
    attempt.characterId,
    attempt.ownerUserId,
  );
  const latestAttemptId = latest?.attemptId ?? attempt.attemptId;
  const stale = latestAttemptId !== attempt.attemptId;
  const awaiting = attempt.status === "awaiting_owner_acceptance" && Boolean(attempt.candidate);
  const candidate = awaiting && !stale
    ? (await characterDraftResponse(attempt, viewerUserId)).character
    : null;
  const currentSheet = attempt.kind === "create"
    ? null
    : await charRepo.getSheetIncludingDeleted(attempt.characterId);
  const current = currentSheet
    ? await charRepo.toPublicCharacterForViewer(currentSheet, viewerUserId)
    : null;
  return {
    attemptId: attempt.attemptId,
    characterId: attempt.characterId,
    kind: attempt.kind,
    status: attempt.status,
    assistantMessage: attempt.assistantMessage,
    expiresAt: attempt.expiresAt,
    candidate,
    current,
    latestAttemptId,
    stale,
    canAccept: Boolean(candidate),
    failed: attempt.status === "failed"
      ? {
          attemptId: attempt.attemptId,
          characterId: attempt.characterId,
          kind: attempt.kind,
          errorCode: attempt.errorCode,
          updatedAt: attempt.updatedAt,
        }
      : null,
    progress: toAssetAuthoringProgress(attempt.kind, attempt.status, attempt.attemptId),
  };
}

async function characterDraftResponse(
  attempt: charAssetRepo.CharacterAuthoringAttempt,
  viewerUserId: string,
) {
  const sheet = await characterSheetForAttempt(attempt);
  return {
    id: attempt.attemptId,
    character: await charRepo.toPublicCharacterForViewer(sheet, viewerUserId),
    assistantMessage: attempt.assistantMessage,
    kind: attempt.kind,
    expiresAt: attempt.expiresAt,
  };
}

async function battlefieldPresetForAttempt(
  attempt: battlefieldAssetRepo.BattlefieldAuthoringAttempt,
): Promise<BattlefieldPreset> {
  if (!attempt.candidate) throw new Error("AUTHORING_CANDIDATE_MISSING");
  const existing = await bfRepo.getPreset(attempt.battlefieldId);
  return battlefieldDefinitionV2ToLegacyPreset({
    battlefieldId: attempt.battlefieldId,
    ownerUserId: attempt.ownerUserId,
    isSystem: false,
    definition: attempt.candidate.definition,
    publicPresentation: attempt.candidate.publicPresentation,
    createdAt: existing?.createdAt ?? attempt.createdAt,
    updatedAt: attempt.updatedAt,
    visibility: existing?.visibility,
  });
}

async function battlefieldDraftResponse(
  attempt: battlefieldAssetRepo.BattlefieldAuthoringAttempt,
) {
  return {
    id: attempt.attemptId,
    battlefield: toPublicPreset(await battlefieldPresetForAttempt(attempt)),
    assistantMessage: attempt.assistantMessage,
    kind: attempt.kind,
    expiresAt: attempt.expiresAt,
  };
}

async function narrationStyleForAttempt(
  attempt: narrationStyleAssetRepo.NarrationStyleAuthoringAttempt,
): Promise<NarrationStyle> {
  if (!attempt.candidate) throw new Error("AUTHORING_CANDIDATE_MISSING");
  const existing = await styleRepo.getNarrationStyle(attempt.narrationStyleId);
  return narrationDefinitionV2ToLegacyStyle({
    styleId: attempt.narrationStyleId,
    ownerUserId: attempt.ownerUserId,
    isSystem: false,
    definition: attempt.candidate.definition,
    publicPresentation: attempt.candidate.publicPresentation,
    createdAt: existing?.createdAt ?? attempt.createdAt,
    updatedAt: attempt.updatedAt,
    visibility: existing?.visibility,
  });
}

async function narrationStyleDraftResponse(
  attempt: narrationStyleAssetRepo.NarrationStyleAuthoringAttempt,
) {
  return {
    id: attempt.attemptId,
    style: toPublicNarrationStyle(await narrationStyleForAttempt(attempt)),
    definition: attempt.candidate?.definition ?? null,
    assistantMessage: attempt.assistantMessage,
    kind: attempt.kind,
    expiresAt: attempt.expiresAt,
  };
}

export function buildRoutes(options: {
  llm?: LlmProvider;
  generateCharacterPortrait?: CharacterPortraitGenerator;
  generateBattlefieldImage?: BattlefieldImageGenerator;
} = {}) {
  const app = new Hono();
  const llm = options.llm ?? createLlmProvider();
  const generateCharacterPortrait = options.generateCharacterPortrait ??
    (async (...args: Parameters<CharacterPortraitGenerator>) =>
      (await import("./services/image-service.js"))
        .generateAndStoreCharacterPortrait(...args));
  const generateBattlefieldImage = options.generateBattlefieldImage ??
    (async (...args: Parameters<BattlefieldImageGenerator>) =>
      (await import("./services/image-service.js"))
        .generateAndStoreBattlefieldImage(...args));

  app.post("/api/internal/narration/task", async (c) => {
    if (!await verifyNarrationTaskAuthorization(c.req.header("Authorization"))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await c.req.json().catch(() => ({})) as {
      battleId?: unknown;
      receiptId?: unknown;
      outboxId?: unknown;
      deliveryGeneration?: unknown;
      smokeId?: unknown;
    };
    if (
      typeof body.smokeId === "string" &&
      /^[a-zA-Z0-9_-]{8,80}$/.test(body.smokeId)
    ) {
      console.info(`[narration] task smoke ok ${body.smokeId}`);
      return c.json({ result: "smoke_ok", smokeId: body.smokeId });
    }
    if (
      typeof body.battleId !== "string" ||
      typeof body.receiptId !== "string" ||
      typeof body.outboxId !== "string" ||
      typeof body.deliveryGeneration !== "number" ||
      !Number.isInteger(body.deliveryGeneration) ||
      body.deliveryGeneration < 0
    ) {
      return c.json({ error: "invalid_task" }, 400);
    }
    try {
      const result = await withBattleProviderOperationContext(
        body.battleId,
        () => processNextNarration({
          battleId: body.battleId as string,
          receiptId: body.receiptId as string,
          outboxId: body.outboxId as string,
          deliveryGeneration: body.deliveryGeneration as number,
          ownerId: `cloud-task:${body.outboxId}:${body.deliveryGeneration}`,
          generator: createLlmNarrationGenerator(llm),
        }),
      );
      if (result === "retry_queued") {
        return c.json({ result }, 503);
      }
      await dispatchPendingNarrationTasks();
      return c.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "error";
      if (message === "NARRATION_LEASE_BUSY" || message === "NARRATION_CLAIM_CONFLICT") {
        return c.json({ error: message.toLowerCase() }, 503);
      }
      throw error;
    }
  });

  app.get("/api/health", async (c) => {
    await query(`SELECT 1 AS ready`);
    return c.json({
      ok: true,
      llm: llm.name,
      auth: config.authProvider,
      models: llm.models ?? null,
      service: "kshiai",
      database: databaseKind(),
    });
  });

  // Local media (character portraits etc.)
  // Cache-bust with ?v=<updatedAt> from public DTOs; versioned URLs may be cached long.
  app.get("/api/media/:kind/:file", async (c) => {
    const { resolveMediaFile } = await import("./services/image-service.js");
    const full = resolveMediaFile(c.req.param("kind"), c.req.param("file"));
    if (!full) {
      // Never let Safari cache a 404 of a soon-to-exist portrait
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      });
    }
    const { readFile, stat } = await import("node:fs/promises");
    const st = await stat(full);
    const etag = `"${Math.trunc(st.mtimeMs)}-${st.size}"`;
    if (c.req.header("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": cacheControlForMedia(c.req.query("v") ?? c.req.query("t")),
        },
      });
    }
    const buf = await readFile(full);
    return new Response(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": cacheControlForMedia(c.req.query("v") ?? c.req.query("t")),
        ETag: etag,
        "Last-Modified": st.mtime.toUTCString(),
      },
    });
  });

  app.post("/api/auth/register", async (c) => {
    if (config.authProvider !== "legacy") {
      return c.json({ error: "supabase_auth_required" }, 410);
    }
    const body = RegisterRequestSchema.parse(await c.req.json());
    try {
      const user = await registerUser(body.username, body.password);
      const token = await createSession(user.id);
      setSessionCookie(c, token);
      return c.json({ user: await publicUserWithAccess(user) });
    } catch (e) {
      if (e instanceof Error && e.message === "USERNAME_TAKEN") {
        return c.json({ error: "username_taken" }, 409);
      }
      throw e;
    }
  });

  app.post("/api/auth/login", async (c) => {
    if (config.authProvider !== "legacy") {
      return c.json({ error: "supabase_auth_required" }, 410);
    }
    const body = LoginRequestSchema.parse(await c.req.json());
    const user = await verifyLogin(body.username, body.password);
    if (!user) return c.json({ error: "invalid_credentials" }, 401);
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ user: await publicUserWithAccess(user) });
  });

  app.post("/api/auth/logout", async (c) => {
    const token = getSessionToken(c);
    if (token) await destroySession(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get("/api/me", async (c) => {
    const user = await userFromRequest(c);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ user: await publicUserWithAccess(user) });
  });

  const authed = new Hono();
  authed.use("*", requireUser);

  /**
   * Balance observability summary (aggregates only).
   * Does not affect combat; for operators watching early-KO / one-shot rates.
   */
  authed.get("/balance/summary", requireAdmin, async (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json({
      summary: await getBalanceSummary(Number.isFinite(limit) ? limit : 20),
    });
  });

  authed.get("/admin/dialogue-pipeline", requireAdmin, async (c) => {
    c.header("Cache-Control", "private, no-store");
    return c.json({ settings: await dialoguePipelineRepo.getDialoguePipelineSettings() });
  });

  authed.put("/admin/dialogue-pipeline", requireAdmin, async (c) => {
    c.header("Cache-Control", "private, no-store");
    const patch = UpdateDialoguePipelineSettingsSchema.parse(await c.req.json());
    const settings = await dialoguePipelineRepo.updateDialoguePipelineSettings({
      userId: c.get("user").id,
      patch,
    });
    if (!settings) return c.json({ error: "settings_revision_conflict" }, 409);
    return c.json({ settings });
  });

  authed.get(
    "/internal/observations",
    requireInternalObservability,
    async (c) => {
      const limit = Number(c.req.query("limit") ?? 30);
      const role = c.get("internalObservabilityRole");
      return c.json({
        role,
        battles: await listInternalBattleObservations(
          limit,
          role === "admin" || role === "developer" ? "all" : "test",
        ),
      });
    },
  );

  authed.get(
    "/internal/observations/:battleId",
    requireInternalObservability,
    async (c) => {
      const role = c.get("internalObservabilityRole");
      const detail = await getInternalBattleObservation(
        c.req.param("battleId") ?? "",
        role === "admin" || role === "developer" ? "all" : "test",
      );
      if (!detail) return c.json({ error: "not_found" }, 404);
      return c.json({
        role,
        ...detail,
      });
    },
  );

  authed.post(
    "/internal/e2e-session",
    requireE2eSessionOperator,
    async (c) => {
      let body: ReturnType<typeof E2eSessionRequestSchema.parse>;
      try {
        body = E2eSessionRequestSchema.parse(await c.req.json());
      } catch {
        return c.json({ error: "invalid_request" }, 400);
      }
      try {
        const session = await mintE2eSession({
          operatorUserId: c.get("user").id,
          target: body.target,
        });
        c.header("Cache-Control", "private, no-store");
        return c.json(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : "error";
        if (message === "E2E_SESSION_UNAVAILABLE") {
          return c.json({ error: "e2e_session_unavailable" }, 503);
        }
        if (message === "E2E_SESSION_FIXTURE_MISSING") {
          return c.json({ error: "e2e_session_fixture_missing" }, 409);
        }
        console.error("[e2e-session] mint failed", message);
        return c.json({ error: "e2e_session_failed" }, 500);
      }
    },
  );

  authed.post(
    "/internal/narration/process-next",
    requireInternalObservability,
    async (c) => {
      const body = await c.req.json().catch(() => ({})) as { battleId?: unknown };
      const ownerId = `local-worker:${c.get("user").id}`;
      const generator = createLlmNarrationGenerator(llm);
      const result = typeof body.battleId === "string" && body.battleId.length > 0
        ? await withBattleProviderOperationContext(
            body.battleId,
            () => processNextNarration({
              battleId: body.battleId as string,
              ownerId,
              generator,
            }),
          )
        : await processNextNarrationAcrossBattles({ ownerId, generator });
      c.header("Cache-Control", "private, no-store");
      return c.json({ result });
    },
  );

  authed.get("/characters", async (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    const limit = Number(c.req.query("limit") ?? 20);
    const offset = Number(c.req.query("offset") ?? 0);
    const page = await charRepo.listCharactersForUser(user.id, q, {
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    if (c.req.query("selectable") === "true") {
      const characters = page.characters.filter((character) => character.selectable);
      return c.json({ ...page, characters, total: characters.length });
    }
    return c.json(page);
  });

  authed.get("/friends", async (c) => {
    const user = c.get("user");
    return c.json({ friends: await friendRepo.listFriends(user.id) });
  });

  authed.post("/friends", async (c) => {
    const user = c.get("user");
    const parsed = AddFriendRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    try {
      const friend = await friendRepo.addFriend(user.id, {
        username: parsed.data.username,
        userId: parsed.data.userId,
      });
      return c.json({ friend });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status) || 400
          : 400;
      return c.json({ error: message }, status as 400 | 404);
    }
  });

  authed.delete("/friends/:id", async (c) => {
    const user = c.get("user");
    const removed = await friendRepo.removeFriend(user.id, c.req.param("id"));
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.get("/users/:id", async (c) => {
    const user = c.get("user");
    const profile = await userRepo.getUserProfile(c.req.param("id"), user.id);
    if (!profile) return c.json({ error: "not_found" }, 404);
    return c.json({ user: profile });
  });

  authed.patch("/me/display-name", async (c) => {
    const user = c.get("user");
    const parsed = UpdateDisplayNameRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    try {
      const updated = await userRepo.updateDisplayName(
        user.id,
        parsed.data.displayName,
      );
      return c.json({ user: await publicUserWithAccess(updated) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      return c.json({ error: message }, 400);
    }
  });

  authed.get("/favorites", async (c) => {
    const user = c.get("user");
    return c.json({ favorites: await userRepo.listFavoriteUsers(user.id) });
  });

  authed.post("/favorites/:id", async (c) => {
    const user = c.get("user");
    try {
      const favorite = await userRepo.addFavorite(user.id, c.req.param("id"));
      return c.json({ favorite });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status) || 400
          : 400;
      return c.json({ error: message }, status as 400 | 404);
    }
  });

  authed.delete("/favorites/:id", async (c) => {
    const user = c.get("user");
    const removed = await userRepo.removeFavorite(user.id, c.req.param("id"));
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.post("/friend-requests", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as {
      userId?: string;
      username?: string;
    };
    let targetId = body.userId?.trim() ?? "";
    if (!targetId && body.username?.trim()) {
      const found = await friendRepo.findUserByUsername(body.username.trim());
      targetId = found?.id ?? "";
    }
    if (!targetId) return c.json({ error: "user_required" }, 400);
    try {
      const request = await userRepo.createFriendRequest(user.id, targetId);
      return c.json({ request, targetUserId: targetId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status) || 400
          : 400;
      return c.json({ error: message }, status as 400 | 404 | 409);
    }
  });

  authed.post("/friend-requests/:fromUserId/accept", async (c) => {
    const user = c.get("user");
    try {
      await userRepo.acceptFriendRequest(user.id, c.req.param("fromUserId"));
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      return c.json({ error: message }, 404);
    }
  });

  authed.post("/friend-requests/:fromUserId/reject", async (c) => {
    const user = c.get("user");
    const removed = await userRepo.rejectFriendRequest(
      user.id,
      c.req.param("fromUserId"),
    );
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.delete("/friend-requests/:toUserId", async (c) => {
    const user = c.get("user");
    const removed = await userRepo.cancelFriendRequest(
      user.id,
      c.req.param("toUserId"),
    );
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.patch("/characters/:id/visibility", async (c) => {
    const user = c.get("user");
    const parsed = CharacterVisibilityUpdateSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    const sheet = await charRepo.updateCharacterVisibility(
      c.req.param("id"),
      user.id,
      parsed.data.visibility,
    );
    if (!sheet) return c.json({ error: "not_found" }, 404);
    return c.json({
      character: await charRepo.toPublicCharacterForViewer(sheet, user.id),
    });
  });

  /** Public character profile (any authenticated user). */
  authed.get("/characters/:id", async (c) => {
    const user = c.get("user");
    const sheet = await charRepo.getSheet(c.req.param("id"));
    if (!sheet || !(await charRepo.canViewCharacter(user.id, sheet))) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({
      character: await charRepo.toPublicCharacterForViewer(sheet, user.id),
      isOwner: sheet.ownerUserId === user.id,
    });
  });

  /** Per-character battle history. */
  authed.get("/characters/:id/battles", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.getSheet(id);
    if (!sheet || !(await charRepo.canViewCharacter(user.id, sheet))) {
      return c.json({ error: "not_found" }, 404);
    }
    const limit = Number(c.req.query("limit") ?? 50);
    const result = await battleRepo.listBattleItemsForCharacter({
      characterId: id,
      viewerUserId: user.id,
      characterOwnerUserId: sheet.ownerUserId,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return c.json(result);
  });

  authed.post("/characters/generate", async (c) => {
    const user = c.get("user");
    const body = GenerateCharacterRequestSchema.parse(await c.req.json());
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const sourceDigest = assetContentDigest(body.prompt);
    let started: Awaited<ReturnType<
      typeof charAssetRepo.beginCharacterAuthoringAttempt
    >>;
    try {
      started = await charAssetRepo.beginCharacterAuthoringAttempt({
        ownerUserId: user.id,
        kind: "create",
        idempotencyKey: `character-create:${idempotencyKey}`,
        requestDigest: assetContentDigest({ prompt: body.prompt }),
        sourceText: body.prompt,
        sourceDigest,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "authoring_failed";
      return c.json(
        { error: message === "AUTHORING_IDEMPOTENCY_CONFLICT"
            ? "idempotency_key_conflict"
            : "authoring_start_failed" },
        message === "AUTHORING_IDEMPOTENCY_CONFLICT" ? 409 : 400,
      );
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({
        draft: await characterDraftResponse(started.attempt, user.id),
      });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt(started.attempt), 202);
  });

  authed.post("/character-drafts/:id/chat", async (c) => {
    const user = c.get("user");
    const body = CharacterChatRequestSchema.parse(await c.req.json());
    const structured = await charAssetRepo.getCharacterAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    if (structured?.status === "awaiting_owner_acceptance" && structured.candidate) {
      const current = await characterSheetForAttempt(structured);
      const sourceText = `${structured.sourceText ?? current.narrativeBlurb}\n\n追加調整: ${body.message}`;
      try {
        await charAssetRepo.replaceCharacterAuthoringSource({
          attemptId: structured.attemptId,
          ownerUserId: user.id,
          sourceText,
          sourceDigest: assetContentDigest(sourceText),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "authoring_failed";
        return c.json({ error: "character_authoring_failed", message }, 409);
      }
      wakeCharacterAuthoringJobs(llm);
      return c.json(authoringAcceptedFromAttempt(structured), 202);
    }
    return c.json({ error: "not_found" }, 404);
  });

  authed.get("/character-drafts/latest", async (c) => {
    const user = c.get("user");
    wakeCharacterAuthoringJobs(llm);
    const structured = await charAssetRepo.getLatestCharacterAuthoringAttempt(user.id);
    if (!structured) {
      return c.json({ draft: null, progress: null, failed: null });
    }
    if (structured.status === "failed") {
      return c.json({
        draft: null,
        progress: null,
        failed: {
          attemptId: structured.attemptId,
          characterId: structured.characterId,
          kind: structured.kind,
          errorCode: structured.errorCode,
          updatedAt: structured.updatedAt,
        },
      });
    }
    if (structured.candidate && structured.status === "awaiting_owner_acceptance") {
      return c.json({
        draft: await characterDraftResponse(structured, user.id),
        progress: null,
        failed: null,
      });
    }
    return c.json({
      draft: null,
      progress: toAssetAuthoringProgress(
        structured.kind,
        structured.status,
        structured.attemptId,
      ),
      failed: null,
    });
  });

  authed.get("/notifications", async (c) => {
    const user = c.get("user");
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json(await notificationRepo.listOwnerNotifications(
      user.id,
      Number.isFinite(limit) ? limit : 20,
    ));
  });

  authed.post("/notifications/:id/read", async (c) => {
    const user = c.get("user");
    const ok = await notificationRepo.markOwnerNotificationRead(
      c.req.param("id"),
      user.id,
    );
    return ok ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  authed.get("/character-drafts/:id", async (c) => {
    const user = c.get("user");
    wakeCharacterAuthoringJobs(llm);
    const structured = await charAssetRepo.getCharacterAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    if (!structured) return c.json({ error: "not_found" }, 404);
    return c.json(await characterReviewResponse(structured, user.id));
  });

  authed.post("/characters/:id/confirm", async (c) => {
    const user = c.get("user");
    const structured = await charAssetRepo.getCharacterAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    if (structured) {
      if (structured.candidate) {
        const preview = await characterSheetForAttempt(structured);
        const reservedNames = await charRepo.listOwnedCharacterReservedNames(
          user.id,
          structured.kind === "create" ? undefined : structured.characterId,
        );
        const conflict = findCharacterNameConflict(
          [preview.displayName, preview.identity?.realName],
          reservedNames,
        );
        if (conflict) {
          return c.json({
            error: "duplicate_character_name",
            message: `「${conflict.candidate}」は既存の「${conflict.reservedName}」と重複しています。下書きを調整してください。`,
          }, 409);
        }
      }
      try {
        const activated = await charAssetRepo.activateCharacterAuthoringAttempt({
          attemptId: structured.attemptId,
          ownerUserId: user.id,
        });
        return c.json({
          character: await charRepo.toPublicCharacterForViewer(
            activated.sheet,
            user.id,
          ),
          assistantMessage: "構造化設定と公開プロフィールを確定して保存しました。",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "activation_failed";
        return c.json({ error: "character_activation_failed", message }, 409);
      }
    }
    return c.json({ error: "not_found" }, 404);
  });

  authed.delete("/character-drafts/:id", async (c) => {
    const user = c.get("user");
    const discarded = await charAssetRepo.discardCharacterAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    return discarded
      ? c.json({ ok: true })
      : c.json({ error: "not_found" }, 404);
  });

  authed.post("/characters/:id/upgrade", async (c) => {
    const user = c.get("user");
    const sheet = await charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const compatibility = await charAssetRepo.getCharacterCompatibility(sheet.id);
    if (compatibility.status === "ready") {
      return c.json({ error: "already_current" }, 409);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    const sourceText = sheet.narrativeBlurb;
    let started: Awaited<ReturnType<
      typeof charAssetRepo.beginCharacterAuthoringAttempt
    >>;
    try {
      started = await charAssetRepo.beginCharacterAuthoringAttempt({
        ownerUserId: user.id,
        characterId: sheet.id,
        kind: "upgrade",
        idempotencyKey: `character-upgrade:${sheet.id}:${idempotencyKey}`,
        requestDigest: assetContentDigest({ characterId: sheet.id, sourceText }),
        sourceText,
        sourceDigest: assetContentDigest(sourceText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "upgrade_start_failed";
      if (message === "AUTHORING_IDEMPOTENCY_CONFLICT") {
        return c.json({ error: "idempotency_key_conflict" }, 409);
      }
      if (message === "AUTHORING_ALREADY_IN_PROGRESS") {
        return c.json({ error: "request_in_progress" }, 409);
      }
      return c.json({ error: "upgrade_start_failed" }, 400);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({ draft: await characterDraftResponse(started.attempt, user.id) });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt(started.attempt), 202);
  });

  authed.post("/characters/:id/chat", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = CharacterChatRequestSchema.parse(await c.req.json());
    const sheet = await charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const compatibility = await charAssetRepo.getCharacterCompatibility(sheet.id);
    if (compatibility.status !== "ready") {
      return c.json({
        error: "character_upgrade_required",
        message: "先に「このキャラを最新版に更新」を実行してください。",
      }, 409);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    let started: Awaited<ReturnType<
      typeof charAssetRepo.beginCharacterAuthoringAttempt
    >>;
    try {
      started = await charAssetRepo.beginCharacterAuthoringAttempt({
        ownerUserId: user.id,
        characterId: sheet.id,
        kind: "revision",
        idempotencyKey: `character-revision:${sheet.id}:${idempotencyKey}`,
        requestDigest: assetContentDigest({ characterId: sheet.id, message: body.message }),
        sourceText: body.message,
        sourceDigest: assetContentDigest(body.message),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "revision_start_failed";
      if (message === "AUTHORING_IDEMPOTENCY_CONFLICT") {
        return c.json({ error: "idempotency_key_conflict" }, 409);
      }
      if (message === "AUTHORING_ALREADY_IN_PROGRESS") {
        return c.json({ error: "request_in_progress" }, 409);
      }
      return c.json({ error: "revision_start_failed" }, 400);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({
        draft: await characterDraftResponse(started.attempt, user.id),
        requiresConfirmation: true,
      });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json({
      ...authoringAcceptedFromAttempt(started.attempt),
      requiresConfirmation: true,
    }, 202);
  });

  /** Restore one immutable V2 generation. */
  authed.post("/characters/:id/restore-revision", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const compatibility = await charAssetRepo.getCharacterCompatibility(id);
    if (compatibility.status !== "ready") {
      return c.json({
        error: "character_upgrade_required",
        message: "このキャラを最新版に更新してから復元してください。",
      }, 409);
    }
    const readyGeneration = await charAssetRepo.getReadyCharacterGeneration(id);
    if (!readyGeneration) {
      return c.json({ error: "character_upgrade_required" }, 409);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const scope = `character-generation-restore:${id}`;
    const operation = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: requestDigest({ characterId: id, operation: "restore" }),
    });
    if (operation.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (operation.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (operation.kind === "replay") return c.json(operation.response);
    try {
      const restored = await charAssetRepo.restorePreviousCharacterGeneration({
        characterId: id,
        ownerUserId: user.id,
        expectedGenerationId: readyGeneration.generationId,
        operationId: idempotencyKey,
      });
      const response = {
        character: await charRepo.toPublicCharacterForViewer(restored.sheet, user.id),
        assistantMessage: "直前の確定世代を、新しい世代として復元しました。",
      };
      await completeIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: operation.ownerId,
        response,
      });
      return c.json(response);
    } catch (error) {
      await abandonIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: operation.ownerId,
      });
      const message = error instanceof Error ? error.message : "restore_failed";
      return c.json(
        { error: message.toLowerCase(), message },
        message === "NO_PREVIOUS_CHARACTER_GENERATION" ? 400 : 409,
      );
    }
  });

  /** Owner-only improvement memo + analysis eligibility. */
  authed.get("/characters/:id/improvement", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const {
      getCharacterImprovementPublic,
    } = await import("./services/character-improvement.js");
    return c.json(await getCharacterImprovementPublic(sheet));
  });

  /**
   * Analyze recent battles via LLM tools and register strengths/improvements.
   * Gated: first after 5 finished battles, then every 10 battles.
   */
  authed.post("/characters/:id/improvement/analyze", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    try {
      const { analyzeCharacterImprovement } = await import(
        "./services/character-improvement.js"
      );
      const result = await analyzeCharacterImprovement({ sheet, llm });
      return c.json({
        ...result.public,
        assistantMessage: result.assistantMessage,
      });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "analyze_failed";
      const message = err instanceof Error ? err.message : "analyze_failed";
      const status =
        code === "analysis_not_allowed" || code === "no_battles" ? 400 : 500;
      return c.json({ error: code, message }, status);
    }
  });

  /**
   * Build a chat revision prompt from the memo (fills the adjust conversation box).
   */
  authed.post("/characters/:id/improvement/prompt", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    try {
      const { generateCharacterImprovementPrompt } = await import(
        "./services/character-improvement.js"
      );
      const result = await generateCharacterImprovementPrompt({ sheet, llm });
      return c.json(result);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "prompt_failed";
      const message = err instanceof Error ? err.message : "prompt_failed";
      const status = code === "memo_empty" ? 400 : 500;
      return c.json({ error: code, message }, status);
    }
  });

  authed.post("/characters/:id/copy", async (c) => {
    const user = c.get("user");
    const copy = await charRepo.copyCharacter(c.req.param("id"), user.id);
    if (!copy) return c.json({ error: "not_found" }, 404);
    try {
      const { recordSheetSnapshot } = await import(
        "./services/balance-observe.js"
      );
      await recordSheetSnapshot({ sheet: copy, phase: "copy" });
    } catch {
      /* non-fatal */
    }
    return c.json({
      character: await charRepo.toPublicCharacterForViewer(copy, user.id),
    });
  });

  authed.delete("/characters/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.softDeleteCharacter(id, user.id);
    if (!sheet) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.get("/characters/:id/image-quota", async (c) => {
    const user = c.get("user");
    const sheet = await charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const { getImageGenQuota } = await import("./services/image-quota.js");
    return c.json({ quota: await getImageGenQuota(sheet.id) });
  });

  /**
   * Toggle active portrait with the archived previous one (preview swap).
   * Does not consume image-gen quota.
   */
  authed.post("/characters/:id/image/toggle", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = await charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const compatibility = await charAssetRepo.getCharacterCompatibility(id);
    if (compatibility.status !== "ready") {
      return c.json({
        error: "character_upgrade_required",
        message: "このキャラを最新版に更新してから顔画像を変更してください。",
      }, 409);
    }
    const readyGeneration = await charAssetRepo.getReadyCharacterGeneration(id);
    if (!readyGeneration) {
      return c.json({ error: "character_upgrade_required" }, 409);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const scope = `character-portrait-toggle:${id}`;
    const operation = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: requestDigest({ characterId: id, operation: "toggle" }),
    });
    if (operation.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (operation.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (operation.kind === "replay") return c.json(operation.response);
    try {
      const toggled = await charAssetRepo.toggleCharacterPortraitGeneration({
        characterId: id,
        ownerUserId: user.id,
        expectedGenerationId: readyGeneration.generationId,
        operationId: idempotencyKey,
      });
      const response = {
        character: await charRepo.toPublicCharacterForViewer(toggled.sheet, user.id),
        assistantMessage: "顔画像を新しい世代として切り替えました。",
      };
      await completeIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: operation.ownerId,
        response,
      });
      return c.json(response);
    } catch (error) {
      await abandonIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: operation.ownerId,
      });
      const message = error instanceof Error ? error.message : "toggle_failed";
      return c.json(
        { error: message.toLowerCase(), message },
        message === "NO_PREVIOUS_CHARACTER_PORTRAIT" ? 400 : 409,
      );
    }
  });

  authed.post("/characters/:id/image", async (c) => {
    const user = c.get("user");
    const sheet = await charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }

    // Body may be missing / null / empty — never throw on parse.
    let extra: string | undefined;
    try {
      const raw = await c.req.json();
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const e = (raw as { extra?: unknown }).extra;
        if (typeof e === "string" && e.trim()) extra = e.trim();
      }
    } catch {
      /* no body is fine */
    }

    const compatibility = await charAssetRepo.getCharacterCompatibility(sheet.id);
    if (compatibility.status !== "ready") {
      return c.json({
        error: "character_upgrade_required",
        message: "このキャラを最新版に更新してから顔画像を生成してください。",
      }, 409);
    }
    const readyGeneration = await charAssetRepo.getReadyCharacterGeneration(sheet.id);
    if (!readyGeneration) {
      return c.json({ error: "character_upgrade_required" }, 409);
    }
    const imageIdempotencyKey = readIdempotencyKey(
      c.req.header("Idempotency-Key"),
    );
    if (!imageIdempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const imageScope = `character-portrait-generate:${sheet.id}`;
    const imageOperation = await beginIdempotentRequest({
      userId: user.id,
      scope: imageScope,
      key: imageIdempotencyKey,
      requestHash: requestDigest({
        characterId: sheet.id,
        operation: "generate",
        extra: extra ?? null,
      }),
    });
    if (imageOperation.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (imageOperation.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (imageOperation.kind === "replay") return c.json(imageOperation.response);
    const mediaRevisionId = `img-${assetContentDigest({
      characterId: sheet.id,
      key: imageIdempotencyKey,
    }).slice(0, 24)}`;

    const { getImageGenQuota, recordImageGenEvent, pruneImageGenEvents } =
      await import("./services/image-quota.js");
    try {
      await pruneImageGenEvents();
    } catch {
      /* non-fatal */
    }

    const quotaBefore = await getImageGenQuota(sheet.id);
    if (!quotaBefore.allowed) {
      await abandonIdempotentRequest({
        userId: user.id,
        scope: imageScope,
        key: imageIdempotencyKey,
        ownerId: imageOperation.ownerId,
      });
      return c.json(
        {
          error: "rate_limited",
          message: `顔生成の上限です。${quotaBefore.message}`,
          quota: quotaBefore,
        },
        429,
      );
    }

    let quotaRecorded = false;
    let lastQuota = quotaBefore;
    let immutableRevisionCommitted = false;
    try {
      const { logImageEvent } = await import(
        "./services/image-service.js"
      );
      logImageEvent({
        phase: "route_hit",
        characterId: sheet.id,
        userId: user.id,
        hasExtra: Boolean(extra),
        quota: quotaBefore,
      });
      const result = await generateCharacterPortrait(
        sheet,
        extra,
        undefined,
        mediaRevisionId,
        projectCharacterImageBriefV2(
          CharacterGenerationEnvelopeV2Schema.parse(
            readyGeneration.content,
          ).definition,
        ),
      );
      // Count attempt after we actually hit the image pipeline (ok or soft-fallback)
      const quota = await recordImageGenEvent({
        userId: user.id,
        characterId: sheet.id,
        ok: result.ok,
      });
      quotaRecorded = true;
      lastQuota = quota;
      const saved = await charAssetRepo.activateCharacterPortraitRevision({
        characterId: sheet.id,
        ownerUserId: user.id,
        expectedGenerationId: readyGeneration.generationId,
        operationId: imageIdempotencyKey,
        mediaId: result.url,
        mediaRevisionId,
        sourceDigest: assetContentDigest({
          characterId: sheet.id,
          extra: extra ?? null,
          mediaId: result.url,
          mediaRevisionId,
        }),
      }).then((activated) => {
        immutableRevisionCommitted = true;
        return activated.sheet;
      });
      const response = {
        character: await charRepo.toPublicCharacterForViewer(saved, user.id),
        note: result.note,
        ok: result.ok,
        quota,
      };
      await completeIdempotentRequest({
        userId: user.id,
        scope: imageScope,
        key: imageIdempotencyKey,
        ownerId: imageOperation.ownerId,
        response,
      });
      return c.json(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[characters/image]", message);
      try {
        const { logImageEvent } = await import("./services/image-service.js");
        logImageEvent({
          phase: "route_error",
          ok: false,
          characterId: c.req.param("id"),
          error: message,
        });
      } catch {
        /* ignore */
      }
      if (!immutableRevisionCommitted) {
        await abandonIdempotentRequest({
          userId: user.id,
          scope: imageScope,
          key: imageIdempotencyKey,
          ownerId: imageOperation.ownerId,
        });
      }
      // Hard failure still consumes a slot when no earlier attempt was recorded.
      const quota = quotaRecorded
        ? lastQuota
        : await recordImageGenEvent({
            userId: user.id,
            characterId: sheet.id,
            ok: false,
          });
      return c.json(
        { error: "image_generation_failed", message, quota },
        message === "ASSET_CURRENT_GENERATION_DRIFT" ? 409 : 502,
      );
    }
  });

  authed.get("/match/candidates", async (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    const limit = Number(c.req.query("limit") ?? 10);
    const offset = Number(c.req.query("offset") ?? 0);
    const page = await charRepo.listPublicOpponents(user.id, q, {
      limit: Number.isFinite(limit) ? limit : 10,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return c.json({
      candidates: page.characters,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    });
  });

  authed.post("/match/random", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as {
      myCharacterId?: string;
    };
    if (!body.myCharacterId) {
      return c.json({ error: "myCharacterId_required" }, 400);
    }
    const opp = await pickRandomOpponent(user.id, body.myCharacterId);
    if (!opp) return c.json({ error: "no_candidates" }, 404);
    return c.json({ opponent: opp });
  });

  authed.post("/match/auto", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as {
      myCharacterId?: string;
    };
    if (!body.myCharacterId) {
      return c.json({ error: "myCharacterId_required" }, 400);
    }
    const opponent = await pickAutoMatchedOpponent(
      user.id,
      body.myCharacterId,
    );
    if (!opponent) return c.json({ error: "no_candidates" }, 404);
    return c.json({ opponent });
  });

  /** LLM case-policies for multi-select at match start. */
  authed.post("/match/policies", async (c) => {
    const user = c.get("user");
    const body = GeneratePoliciesRequestSchema.parse(await c.req.json());
    try {
      const result = await generateMatchPolicies({
        userId: user.id,
        myCharacterId: body.myCharacterId,
        opponentCharacterId: body.opponentCharacterId,
        battlefieldPresetId: body.battlefieldPresetId,
        battlefieldMode: body.battlefieldMode,
        llm,
      });
      return c.json({
        options: result.options,
        engineOptions: result.engineOptions,
        defaultSelectedIds: result.defaultSelectedIds,
        rationale: result.rationale,
        fieldHint: result.fieldHint,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg.toLowerCase() }, 400);
    }
  });

  // —— Battlefields ——
  authed.get("/battlefields", async (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    const selectable = c.req.query("selectable") === "true";
    return c.json({
      battlefields: await bfRepo.listPresets({
        userId: user.id,
        q,
        selectable,
      }),
    });
  });

  authed.patch("/battlefields/:id/visibility", async (c) => {
    const user = c.get("user");
    const parsed = CharacterVisibilityUpdateSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    const preset = await bfRepo.updateBattlefieldVisibility(
      c.req.param("id"),
      user.id,
      parsed.data.visibility,
    );
    if (!preset) return c.json({ error: "not_found" }, 404);
    return c.json({ battlefield: toPublicPreset(preset) });
  });

  authed.post("/battlefields/generate", async (c) => {
    const user = c.get("user");
    const body = GenerateBattlefieldRequestSchema.parse(await c.req.json());
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    let started: Awaited<ReturnType<
      typeof battlefieldAssetRepo.beginBattlefieldAuthoringAttempt
    >>;
    try {
      started = await battlefieldAssetRepo.beginBattlefieldAuthoringAttempt({
        ownerUserId: user.id,
        kind: "create",
        idempotencyKey: `battlefield-create:${idempotencyKey}`,
        requestDigest: assetContentDigest(body),
        sourceText: body.prompt,
        sourceDigest: assetContentDigest(body.prompt),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "authoring_failed";
      return c.json(
        { error: message === "AUTHORING_IDEMPOTENCY_CONFLICT"
            ? "idempotency_key_conflict"
            : "authoring_start_failed" },
        message === "AUTHORING_IDEMPOTENCY_CONFLICT" ? 409 : 400,
      );
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({ draft: await battlefieldDraftResponse(started.attempt) });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt({
      attemptId: started.attempt.attemptId,
      characterId: started.attempt.battlefieldId,
      kind: started.attempt.kind,
      status: started.attempt.status,
    }), 202);
  });

  authed.get("/battlefield-drafts/latest", async (c) => {
    const user = c.get("user");
    wakeCharacterAuthoringJobs(llm);
    const attempt = await battlefieldAssetRepo.getLatestBattlefieldAuthoringAttempt(
      user.id,
    );
    if (!attempt) return c.json({ draft: null, progress: null, failed: null });
    if (attempt.status === "failed") {
      return c.json({
        draft: null,
        progress: null,
        failed: {
          attemptId: attempt.attemptId,
          characterId: attempt.battlefieldId,
          kind: attempt.kind,
          errorCode: attempt.errorCode,
          updatedAt: attempt.updatedAt,
        },
      });
    }
    if (attempt.candidate && attempt.status === "awaiting_owner_acceptance") {
      return c.json({
        draft: await battlefieldDraftResponse(attempt),
        progress: null,
        failed: null,
      });
    }
    return c.json({
      draft: null,
      progress: toAssetAuthoringProgress(
        attempt.kind,
        attempt.status,
        attempt.attemptId,
      ),
      failed: null,
    });
  });

  authed.get("/battlefield-drafts/:id", async (c) => {
    const user = c.get("user");
    wakeCharacterAuthoringJobs(llm);
    const attempt = await battlefieldAssetRepo.getBattlefieldAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    if (!attempt) return c.json({ error: "not_found" }, 404);
    const latest = await battlefieldAssetRepo
      .getLatestBattlefieldAuthoringAttemptForAsset(
        attempt.battlefieldId,
        user.id,
      );
    const stale = Boolean(latest && latest.attemptId !== attempt.attemptId);
    const awaiting = attempt.status === "awaiting_owner_acceptance" &&
      Boolean(attempt.candidate) && !stale;
    return c.json({
      attemptId: attempt.attemptId,
      assetId: attempt.battlefieldId,
      family: "battlefield",
      kind: attempt.kind,
      status: attempt.status,
      assistantMessage: attempt.assistantMessage,
      expiresAt: attempt.expiresAt,
      candidate: awaiting ? (await battlefieldDraftResponse(attempt)).battlefield : null,
      current: attempt.kind === "create"
        ? null
        : toPublicPreset((await bfRepo.getPreset(attempt.battlefieldId))!),
      latestAttemptId: latest?.attemptId ?? attempt.attemptId,
      stale,
      canAccept: awaiting,
      failed: attempt.status === "failed"
        ? {
            attemptId: attempt.attemptId,
            characterId: attempt.battlefieldId,
            kind: attempt.kind,
            errorCode: attempt.errorCode,
            updatedAt: attempt.updatedAt,
          }
        : null,
      progress: toAssetAuthoringProgress(
        attempt.kind,
        attempt.status,
        attempt.attemptId,
      ),
    });
  });

  authed.post("/battlefield-drafts/:id/chat", async (c) => {
    const user = c.get("user");
    const body = BattlefieldChatRequestSchema.parse(await c.req.json());
    const attempt = await battlefieldAssetRepo.getBattlefieldAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    if (attempt?.status !== "awaiting_owner_acceptance" || !attempt.candidate) {
      return c.json({ error: "not_found" }, 404);
    }
    const current = await battlefieldPresetForAttempt(attempt);
    const sourceText = `${attempt.sourceText ?? current.narrativeBlurb}\n\n追加調整: ${body.message}`;
    try {
      await battlefieldAssetRepo.replaceBattlefieldAuthoringSource({
        attemptId: attempt.attemptId,
        ownerUserId: user.id,
        sourceText,
        sourceDigest: assetContentDigest(sourceText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "authoring_failed";
      return c.json({ error: "battlefield_authoring_failed", message }, 409);
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt({
      attemptId: attempt.attemptId,
      characterId: attempt.battlefieldId,
      kind: attempt.kind,
      status: "pending_structure",
    }), 202);
  });

  authed.post("/battlefields/:id/confirm", async (c) => {
    const user = c.get("user");
    try {
      const activated = await battlefieldAssetRepo.activateBattlefieldAuthoringAttempt({
        attemptId: c.req.param("id"),
        ownerUserId: user.id,
      });
      return c.json({
        battlefield: {
          ...toPublicPreset(activated.preset),
          compatibility: await battlefieldAssetRepo.getBattlefieldCompatibility(
            activated.preset.id,
          ),
          selectable: true,
          upgradeAction: null,
        },
        assistantMessage: "構造化した戦場設定と公開シーンを確定しました。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "activation_failed";
      return c.json({ error: "battlefield_activation_failed", message }, 409);
    }
  });

  authed.delete("/battlefield-drafts/:id", async (c) => {
    const user = c.get("user");
    const discarded = await battlefieldAssetRepo.discardBattlefieldAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    return discarded
      ? c.json({ ok: true })
      : c.json({ error: "not_found" }, 404);
  });

  authed.post("/battlefields/:id/upgrade", async (c) => {
    const user = c.get("user");
    const preset = await bfRepo.getPreset(c.req.param("id"));
    if (!preset || preset.isSystem || preset.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const compatibility = await battlefieldAssetRepo.getBattlefieldCompatibility(preset.id);
    if (compatibility.status === "ready") {
      return c.json({ error: "already_current" }, 409);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    let started: Awaited<ReturnType<
      typeof battlefieldAssetRepo.beginBattlefieldAuthoringAttempt
    >>;
    try {
      started = await battlefieldAssetRepo.beginBattlefieldAuthoringAttempt({
        ownerUserId: user.id,
        battlefieldId: preset.id,
        kind: "upgrade",
        idempotencyKey: `battlefield-upgrade:${preset.id}:${idempotencyKey}`,
        requestDigest: assetContentDigest({
          battlefieldId: preset.id,
          source: preset.narrativeBlurb,
        }),
        sourceText: preset.narrativeBlurb,
        sourceDigest: assetContentDigest(preset.narrativeBlurb),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "upgrade_start_failed";
      if (message === "AUTHORING_IDEMPOTENCY_CONFLICT") {
        return c.json({ error: "idempotency_key_conflict" }, 409);
      }
      if (message === "AUTHORING_ALREADY_IN_PROGRESS") {
        return c.json({ error: "request_in_progress" }, 409);
      }
      return c.json({ error: "upgrade_start_failed" }, 400);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({ draft: await battlefieldDraftResponse(started.attempt) });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt({
      attemptId: started.attempt.attemptId,
      characterId: started.attempt.battlefieldId,
      kind: started.attempt.kind,
      status: started.attempt.status,
    }), 202);
  });

  authed.post("/battlefields/:id/chat", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = BattlefieldChatRequestSchema.parse(await c.req.json());
    const preset = await bfRepo.getPreset(id);
    if (!preset || preset.isSystem || preset.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const ready = await battlefieldAssetRepo.getReadyBattlefieldGeneration(id);
    if (!ready) return c.json({ error: "battlefield_upgrade_required" }, 409);
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    let started: Awaited<ReturnType<
      typeof battlefieldAssetRepo.beginBattlefieldAuthoringAttempt
    >>;
    try {
      started = await battlefieldAssetRepo.beginBattlefieldAuthoringAttempt({
        ownerUserId: user.id,
        battlefieldId: id,
        kind: "revision",
        idempotencyKey: `battlefield-revision:${id}:${idempotencyKey}`,
        requestDigest: assetContentDigest({ battlefieldId: id, message: body.message }),
        sourceText: body.message,
        sourceDigest: assetContentDigest(body.message),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "revision_start_failed";
      if (message === "AUTHORING_ALREADY_IN_PROGRESS") {
        return c.json({ error: "request_in_progress" }, 409);
      }
      return c.json({ error: message.toLowerCase() }, 409);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({
        draft: await battlefieldDraftResponse(started.attempt),
        requiresConfirmation: true,
      });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json({
      ...authoringAcceptedFromAttempt({
        attemptId: started.attempt.attemptId,
        characterId: started.attempt.battlefieldId,
        kind: started.attempt.kind,
        status: started.attempt.status,
      }),
      requiresConfirmation: true,
    }, 202);
  });

  authed.post("/battlefields/:id/copy", async (c) => {
    const user = c.get("user");
    const copy = await bfRepo.copyPreset(c.req.param("id"), user.id);
    if (!copy) return c.json({ error: "not_found" }, 404);
    return c.json({ battlefield: toPublicPreset(copy) });
  });

  authed.delete("/battlefields/:id", async (c) => {
    const user = c.get("user");
    const ok = await bfRepo.deletePreset(c.req.param("id"), user.id);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.post("/battlefields/:id/image", async (c) => {
    const user = c.get("user");
    const preset = await bfRepo.getPreset(c.req.param("id"));
    if (!preset || preset.isSystem || preset.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    let extra: string | undefined;
    try {
      const raw = await c.req.json();
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const value = (raw as { extra?: unknown }).extra;
        if (typeof value === "string" && value.trim()) extra = value.trim();
      }
    } catch {
      // An empty body is valid.
    }
    const ready = await battlefieldAssetRepo.getReadyBattlefieldGeneration(preset.id);
    if (!ready) return c.json({ error: "battlefield_upgrade_required" }, 409);
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    const scope = `battlefield-image:${preset.id}`;
    const operation = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: requestDigest({ battlefieldId: preset.id, extra: extra ?? null }),
    });
    if (operation.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (operation.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (operation.kind === "replay") return c.json(operation.response);
    const mediaRevisionId = `img-${assetContentDigest({
      battlefieldId: preset.id,
      key: idempotencyKey,
    }).slice(0, 24)}`;
    try {
      const envelope = BattlefieldGenerationEnvelopeV2Schema.parse(ready.content);
      const result = await generateBattlefieldImage(
        preset,
        extra,
        undefined,
        mediaRevisionId,
        projectBattlefieldImageBriefV2(envelope.definition),
      );
      const activated = await battlefieldAssetRepo.activateBattlefieldImageRevision({
        battlefieldId: preset.id,
        ownerUserId: user.id,
        expectedGenerationId: ready.generationId,
        operationId: idempotencyKey,
        mediaId: result.url,
        mediaRevisionId,
      });
      const response = {
        battlefield: toPublicPreset(activated.preset),
        note: result.note,
        ok: true,
      };
      await completeIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: operation.ownerId,
        response,
      });
      return c.json({
        ...response,
      });
    } catch (error) {
      await abandonIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: operation.ownerId,
      });
      const message = error instanceof Error ? error.message : String(error);
      console.error("[battlefields/image]", message);
      return c.json(
        { error: "image_generation_failed", message },
        502,
      );
    }
  });

  // —— Narration styles (system presets + user custom) ——
  authed.get("/narration-styles", async (c) => {
    const user = c.get("user");
    return c.json({
      styles: await styleRepo.listNarrationStyles(user.id, {
        selectable: c.req.query("selectable") === "true",
      }),
    });
  });

  authed.patch("/narration-styles/:id/visibility", async (c) => {
    const user = c.get("user");
    const parsed = CharacterVisibilityUpdateSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    const style = await styleRepo.updateNarrationStyleVisibility(
      c.req.param("id"),
      user.id,
      parsed.data.visibility,
    );
    if (!style) return c.json({ error: "not_found" }, 404);
    return c.json({ style: toPublicNarrationStyle(style) });
  });

  authed.post("/narration-styles", async (c) => {
    return c.json({
      error: "structured_authoring_required",
      message: "自然文から候補を生成し、内容を確認して確定してください。",
    }, 409);
  });

  authed.post("/narration-styles/generate", async (c) => {
    const user = c.get("user");
    const body = GenerateNarrationStyleRequestSchema.parse(await c.req.json());
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    let started: Awaited<ReturnType<
      typeof narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt
    >>;
    try {
      started = await narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt({
        ownerUserId: user.id,
        kind: "create",
        idempotencyKey: `narration-create:${idempotencyKey}`,
        requestDigest: assetContentDigest(body),
        sourceText: body.prompt,
        sourceDigest: assetContentDigest(body.prompt),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "authoring_failed";
      return c.json({
        error: message === "AUTHORING_IDEMPOTENCY_CONFLICT"
          ? "idempotency_key_conflict"
          : "authoring_start_failed",
      }, message === "AUTHORING_IDEMPOTENCY_CONFLICT" ? 409 : 400);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({ draft: await narrationStyleDraftResponse(started.attempt) });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt({
      attemptId: started.attempt.attemptId,
      characterId: started.attempt.narrationStyleId,
      kind: started.attempt.kind,
      status: started.attempt.status,
    }), 202);
  });

  authed.get("/narration-style-drafts/latest", async (c) => {
    const user = c.get("user");
    wakeCharacterAuthoringJobs(llm);
    const attempt = await narrationStyleAssetRepo
      .getLatestNarrationStyleAuthoringAttempt(user.id);
    if (!attempt) return c.json({ draft: null, progress: null, failed: null });
    if (attempt.status === "failed") {
      return c.json({
        draft: null,
        progress: null,
        failed: {
          attemptId: attempt.attemptId,
          characterId: attempt.narrationStyleId,
          kind: attempt.kind,
          errorCode: attempt.errorCode,
          updatedAt: attempt.updatedAt,
        },
      });
    }
    if (attempt.candidate && attempt.status === "awaiting_owner_acceptance") {
      return c.json({
        draft: await narrationStyleDraftResponse(attempt),
        progress: null,
        failed: null,
      });
    }
    return c.json({
      draft: null,
      progress: toAssetAuthoringProgress(
        attempt.kind,
        attempt.status,
        attempt.attemptId,
      ),
      failed: null,
    });
  });

  authed.get("/narration-style-drafts/:id", async (c) => {
    const user = c.get("user");
    wakeCharacterAuthoringJobs(llm);
    const attempt = await narrationStyleAssetRepo.getNarrationStyleAuthoringAttempt(
      c.req.param("id"),
      user.id,
    );
    if (!attempt) return c.json({ error: "not_found" }, 404);
    const latest = await narrationStyleAssetRepo
      .getLatestNarrationStyleAuthoringAttemptForAsset(
        attempt.narrationStyleId,
        user.id,
      );
    const stale = Boolean(latest && latest.attemptId !== attempt.attemptId);
    const awaiting = attempt.status === "awaiting_owner_acceptance" &&
      Boolean(attempt.candidate) && !stale;
    const currentStyle = attempt.kind === "create"
      ? null
      : await styleRepo.getNarrationStyle(attempt.narrationStyleId);
    return c.json({
      attemptId: attempt.attemptId,
      assetId: attempt.narrationStyleId,
      family: "narration_style",
      kind: attempt.kind,
      status: attempt.status,
      assistantMessage: attempt.assistantMessage,
      expiresAt: attempt.expiresAt,
      candidate: awaiting
        ? (await narrationStyleDraftResponse(attempt)).style
        : null,
      current: currentStyle ? toPublicNarrationStyle(currentStyle) : null,
      definition: awaiting ? attempt.candidate?.definition ?? null : null,
      latestAttemptId: latest?.attemptId ?? attempt.attemptId,
      stale,
      canAccept: awaiting,
      failed: attempt.status === "failed"
        ? {
            attemptId: attempt.attemptId,
            characterId: attempt.narrationStyleId,
            kind: attempt.kind,
            errorCode: attempt.errorCode,
            updatedAt: attempt.updatedAt,
          }
        : null,
      progress: toAssetAuthoringProgress(
        attempt.kind,
        attempt.status,
        attempt.attemptId,
      ),
    });
  });

  authed.delete("/narration-style-drafts/:id", async (c) => {
    const user = c.get("user");
    const discarded = await narrationStyleAssetRepo
      .discardNarrationStyleAuthoringAttempt(c.req.param("id"), user.id);
    return discarded
      ? c.json({ ok: true })
      : c.json({ error: "not_found" }, 404);
  });

  authed.post("/narration-styles/:id/confirm", async (c) => {
    const user = c.get("user");
    try {
      const activated = await narrationStyleAssetRepo
        .activateNarrationStyleAuthoringAttempt({
          attemptId: c.req.param("id"),
          ownerUserId: user.id,
        });
      return c.json({
        style: toPublicNarrationStyle(activated.style, {
          compatibility: await narrationStyleAssetRepo
            .getNarrationStyleCompatibility(activated.style.id),
          selectable: true,
          upgradeAction: null,
        }),
        assistantMessage: "構造化した語り方針と公開説明を確定しました。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "activation_failed";
      return c.json({ error: "narration_style_activation_failed", message }, 409);
    }
  });

  authed.post("/narration-styles/:id/upgrade", async (c) => {
    const user = c.get("user");
    const style = await styleRepo.getNarrationStyle(c.req.param("id"));
    if (!style || style.isSystem || style.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const compatibility = await narrationStyleAssetRepo
      .getNarrationStyleCompatibility(style.id);
    if (compatibility.status === "ready") {
      return c.json({ error: "already_current" }, 409);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    const sourceText = [style.description, style.instruction].filter(Boolean).join("\n\n");
    let started: Awaited<ReturnType<
      typeof narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt
    >>;
    try {
      started = await narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt({
        ownerUserId: user.id,
        narrationStyleId: style.id,
        kind: "upgrade",
        idempotencyKey: `narration-upgrade:${style.id}:${idempotencyKey}`,
        requestDigest: assetContentDigest({ narrationStyleId: style.id, sourceText }),
        sourceText,
        sourceDigest: assetContentDigest(sourceText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "upgrade_start_failed";
      if (message === "AUTHORING_ALREADY_IN_PROGRESS") {
        return c.json({ error: "request_in_progress" }, 409);
      }
      return c.json({ error: message.toLowerCase() }, 409);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({ draft: await narrationStyleDraftResponse(started.attempt) });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt({
      attemptId: started.attempt.attemptId,
      characterId: started.attempt.narrationStyleId,
      kind: started.attempt.kind,
      status: started.attempt.status,
    }), 202);
  });

  authed.post("/narration-styles/:id/revise", async (c) => {
    const user = c.get("user");
    const style = await styleRepo.getNarrationStyle(c.req.param("id"));
    if (!style || style.isSystem || style.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const ready = await narrationStyleAssetRepo
      .getReadyNarrationStyleGeneration(style.id);
    if (!ready) return c.json({ error: "narration_style_upgrade_required" }, 409);
    const body = GenerateNarrationStyleRequestSchema.parse(await c.req.json());
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) return c.json({ error: "idempotency_key_required" }, 400);
    let started: Awaited<ReturnType<
      typeof narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt
    >>;
    try {
      started = await narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt({
        ownerUserId: user.id,
        narrationStyleId: style.id,
        kind: "revision",
        idempotencyKey: `narration-revision:${style.id}:${idempotencyKey}`,
        requestDigest: assetContentDigest({ narrationStyleId: style.id, prompt: body.prompt }),
        sourceText: body.prompt,
        sourceDigest: assetContentDigest(body.prompt),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "revision_start_failed";
      if (message === "AUTHORING_ALREADY_IN_PROGRESS") {
        return c.json({ error: "request_in_progress" }, 409);
      }
      return c.json({ error: message.toLowerCase() }, 409);
    }
    if (started.replayed && started.attempt.candidate) {
      return c.json({ draft: await narrationStyleDraftResponse(started.attempt) });
    }
    wakeCharacterAuthoringJobs(llm);
    return c.json(authoringAcceptedFromAttempt({
      attemptId: started.attempt.attemptId,
      characterId: started.attempt.narrationStyleId,
      kind: started.attempt.kind,
      status: started.attempt.status,
    }), 202);
  });

  authed.patch("/narration-styles/:id", async (c) => {
    return c.json({
      error: "structured_authoring_required",
      message: "revision endpoint で候補を生成し、内容を確認して確定してください。",
    }, 409);
  });

  authed.delete("/narration-styles/:id", async (c) => {
    const user = c.get("user");
    const ok = await styleRepo.deleteUserNarrationStyle(c.req.param("id"), user.id);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.post("/battles", async (c) => {
    const user = c.get("user");
    let body: ReturnType<typeof CreateBattleRequestSchema.parse>;
    try {
      body = CreateBattleRequestSchema.parse(await c.req.json());
    } catch (e) {
      const message = e instanceof Error ? e.message : "invalid_body";
      console.error("[battles] create validation failed", message);
      return c.json({ error: "invalid_request", message }, 400);
    }
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const scope = "battle-create";
    const createRequestHash = requestDigest(body);
    const battleId = `btl_${requestDigest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: createRequestHash,
    }).slice(0, 32)}`;
    let observationRunId: string | null;
    try {
      observationRunId = parseObservationRunId(
        c.req.header(OBSERVATION_RUN_HEADER),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_observation_run";
      return c.json({ error: message.toLowerCase() }, 400);
    }
    const idempotency = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: createRequestHash,
    });
    if (idempotency.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (idempotency.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (idempotency.kind === "replay") return c.json(idempotency.response);
    let operationCompleted = false;
    try {
      const start = () => startBattle({
        userId: user.id,
        battleId,
        myCharacterId: body.myCharacterId,
        opponentCharacterId: body.opponentCharacterId,
        battlefieldPresetId: body.battlefieldPresetId,
        battlefieldMode: body.battlefieldMode,
        stance: body.stance,
        policies: body.policies,
        selectedPolicyIds: body.selectedPolicyIds,
        narrationStyleId: body.narrationStyleId,
        llm,
      });
      const battle = observationRunId
        ? await (async () => {
            const access = await getUserAccessProfile(user.id);
            if (access.accountKind !== "e2e") {
              throw new Error("OBSERVATION_RUN_FORBIDDEN");
            }
            const context = await bindProviderOperationRun({
              runId: observationRunId,
              observerUserId: user.id,
              battleId,
            });
            return withProviderOperationContext(context, start);
          })()
        : await start();
      operationCompleted = true;
      const response = { battle };
      await completeIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: idempotency.ownerId,
        response,
      });
      await wakeNarrationTasks();
      return c.json(response);
    } catch (e) {
      if (!operationCompleted) {
        await abandonIdempotentRequest({
          userId: user.id,
          scope,
          key: idempotencyKey,
          ownerId: idempotency.ownerId,
        });
      }
      const msg = e instanceof Error ? e.message : "error";
      console.error("[battles] startBattle failed", msg, e);
      return c.json(
        { error: msg.toLowerCase(), message: msg },
        msg === "OBSERVATION_RUN_FORBIDDEN"
          ? 403
          : msg.includes("UPGRADE_REQUIRED")
            ? 409
          : msg.includes("NOT_FOUND") || msg.includes("FORBIDDEN")
            ? 400
            : msg.includes("PROVIDER_OPERATION_")
              ? 409
              : 500,
      );
    }
  });

  /** Battle history (search + status filter). Must be before /battles/:id */
  authed.get("/battles", async (c) => {
    const user = c.get("user");
    const q = c.req.query("q") ?? undefined;
    const statusRaw = c.req.query("status") ?? "all";
    const status =
      statusRaw === "active" || statusRaw === "finished" || statusRaw === "all"
        ? statusRaw
        : "all";
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    const result = await battleRepo.listBattlesForUser({
      userId: user.id,
      q,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return c.json(result);
  });

  authed.delete("/battles/:id", async (c) => {
    const user = c.get("user");
    const ok = await battleRepo.deleteBattle(c.req.param("id"), user.id);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  async function authorizeBattleNarration(battleId: string, userId: string) {
    const meta = await battleRepo.getBattleMeta(battleId);
    if (!meta) return "not_found" as const;
    if (meta.side_a_user_id !== userId) return "forbidden" as const;
    return meta;
  }

  authed.get("/battles/:id/narration", async (c) => {
    const battleId = c.req.param("id");
    const access = await authorizeBattleNarration(battleId, c.get("user").id);
    if (access === "not_found") return c.json({ error: access }, 404);
    if (access === "forbidden") return c.json({ error: access }, 403);
    c.header("Cache-Control", "private, no-store");
    return c.json(await getBattleNarrationSnapshot(battleId));
  });

  authed.get("/battles/:id/narration/events", async (c) => {
    const battleId = c.req.param("id");
    const access = await authorizeBattleNarration(battleId, c.get("user").id);
    if (access === "not_found") return c.json({ error: access }, 404);
    if (access === "forbidden") return c.json({ error: access }, 403);
    try {
      c.header("Cache-Control", "private, no-store");
      return c.json(await readBattleNarrationEvents({
        battleId,
        cursor: c.req.query("cursor") ?? null,
      }));
    } catch (error) {
      if (error instanceof Error && error.message === "NARRATION_CURSOR_INVALID") {
        return c.json({ error: "narration_cursor_invalid" }, 400);
      }
      throw error;
    }
  });

  /** Finite authenticated SSE replay. Clients reconnect with the last cursor. */
  authed.get("/battles/:id/narration/follow", async (c) => {
    const battleId = c.req.param("id");
    const access = await authorizeBattleNarration(battleId, c.get("user").id);
    if (access === "not_found") return c.json({ error: access }, 404);
    if (access === "forbidden") return c.json({ error: access }, 403);
    try {
      const replay = await waitForBattleNarrationEvents({
        battleId,
        cursor: c.req.query("cursor") ?? null,
      });
      const frames = replay.events.map((event) =>
        `id: ${event.cursor ?? "reset"}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
      ).join("");
      return new Response(`${frames}: reconnect\n\n`, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "private, no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NARRATION_CURSOR_INVALID") {
        return c.json({ error: "narration_cursor_invalid" }, 400);
      }
      throw error;
    }
  });

  authed.get("/battles/:id/narration/:receiptId", async (c) => {
    const battleId = c.req.param("id");
    const access = await authorizeBattleNarration(battleId, c.get("user").id);
    if (access === "not_found") return c.json({ error: access }, 404);
    if (access === "forbidden") return c.json({ error: access }, 403);
    const snapshot = await getBattleNarrationSnapshot(battleId);
    const entry = snapshot.entries.find(
      (candidate) => candidate.turnReceiptId === c.req.param("receiptId"),
    );
    if (!entry) return c.json({ error: "not_found" }, 404);
    c.header("Cache-Control", "private, no-store");
    return c.json({ entry, cursor: snapshot.cursor });
  });

  authed.get("/battles/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const meta = await battleRepo.getBattleMeta(id);
    const state = await battleRepo.getBattle(id);
    if (!meta || !state) return c.json({ error: "not_found" }, 404);
    if (meta.side_a_user_id !== user.id) return c.json({ error: "forbidden" }, 403);
    const mine = state.assetManifest?.characters.a.snapshot ??
      await charRepo.getSheetIncludingDeleted(meta.side_a_character_id);
    if (!mine) return c.json({ error: "not_found" }, 404);
    const opp = state.assetManifest?.characters.b.snapshot ??
      await charRepo.getSheetIncludingDeleted(meta.side_b_character_id);
    return c.json({
      battle: await toBattlePublicForViewer(state, mine, null, opp),
    });
  });

  /** Advance one turn; actions chosen automatically from stances. */
  authed.post("/battles/:id/advance", async (c) => {
    const user = c.get("user");
    const battleId = c.req.param("id");
    const started = Date.now();
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const scope = `battle-advance:${battleId}`;
    const idempotency = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: requestDigest({ battleId }),
    });
    if (idempotency.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (idempotency.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (idempotency.kind === "replay") return c.json(idempotency.response);
    console.info(`[battles] advance start ${battleId}`);
    let operationCompleted = false;
    try {
      const battle = await withBattleProviderOperationContext(
        battleId,
        () => advanceTurn({
          userId: user.id,
          battleId,
          operationId: requestDigest({
            userId: user.id,
            scope,
            key: idempotencyKey,
          }),
          llm,
        }),
      );
      operationCompleted = true;
      console.info(
        `[battles] advance ok ${battleId} turn=${battle.turn} ${Date.now() - started}ms aft=${battle.aftermathPending ? 1 : 0}`,
      );
      const response = { battle };
      await completeIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: idempotency.ownerId,
        response,
      });
      await wakeNarrationTasks();
      return c.json(response);
    } catch (e) {
      if (!operationCompleted) {
        await abandonIdempotentRequest({
          userId: user.id,
          scope,
          key: idempotencyKey,
          ownerId: idempotency.ownerId,
        });
      }
      const msg = e instanceof Error ? e.message : "error";
      console.error(
        `[battles] advance fail ${battleId} ${Date.now() - started}ms`,
        msg,
      );
      const code =
        msg === "FORBIDDEN"
          ? 403
          : msg === "BATTLE_NOT_FOUND"
            ? 404
            : msg === "BATTLE_FINISHED"
              ? 409
              : msg === "BATTLE_BUSY"
                ? 409
                : msg.startsWith("PROVIDER_OPERATION_") ||
                    msg.startsWith("PROVIDER_ATTEMPT_")
                  ? 409
                  : 500;
      return c.json({ error: msg.toLowerCase(), message: msg }, code);
    }
  });

  /**
   * Stream one advance as SSE (`text/event-stream`).
   * Events: phase | narrator | speeches | done | error (see BattleAdvanceStreamEvent).
   *
   * Cloudflare Tunnel buffers proxied responses unless Content-Type is
   * text/event-stream. Keep-alive comments also avoid Proxy Write Timeout (30s)
   * during long LLM gaps (agents / narrator).
   */
  authed.post("/battles/:id/advance/stream", async (c) => {
    const user = c.get("user");
    const battleId = c.req.param("id");
    const started = Date.now();
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const scope = `battle-advance:${battleId}`;
    const idempotency = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: requestDigest({ battleId }),
    });
    if (idempotency.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (idempotency.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (idempotency.kind === "replay") {
      const replay = idempotency.response as { battle?: unknown };
      return new Response(
        `data: ${JSON.stringify({ type: "done", battle: replay.battle })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
          },
        },
      );
    }
    console.info(`[battles] advance stream start ${battleId}`);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let operationCompleted = false;
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };
        const send = (payload: unknown) => {
          write(`data: ${JSON.stringify(payload)}\n\n`);
        };
        // Immediate first byte + periodic comments: cloudflared/CF edge stay live.
        write(`: stream-open\n\n`);
        const keepAlive = setInterval(() => {
          write(`: ka ${Date.now() - started}\n\n`);
        }, 12_000);
        try {
          const battle = await withBattleProviderOperationContext(
            battleId,
            () => advanceTurn({
              userId: user.id,
              battleId,
              operationId: requestDigest({
                userId: user.id,
                scope,
                key: idempotencyKey,
              }),
              llm,
              // Narration is followed through the durable narration API. Advance
              // SSE carries only non-prose phase state plus the terminal battle.
              onProgress: (event) => {
                if (event.type === "phase") send(event);
              },
            }),
          );
          operationCompleted = true;
          await completeIdempotentRequest({
            userId: user.id,
            scope,
            key: idempotencyKey,
            ownerId: idempotency.ownerId,
            response: { battle },
          });
          await wakeNarrationTasks();
          send({ type: "done", battle });
          console.info(
            `[battles] advance stream ok ${battleId} turn=${battle.turn} ${Date.now() - started}ms aft=${battle.aftermathPending ? 1 : 0}`,
          );
        } catch (e) {
          if (!operationCompleted) {
            await abandonIdempotentRequest({
              userId: user.id,
              scope,
              key: idempotencyKey,
              ownerId: idempotency.ownerId,
            });
          }
          const msg = e instanceof Error ? e.message : "error";
          console.error(
            `[battles] advance stream fail ${battleId} ${Date.now() - started}ms`,
            msg,
          );
          send({ type: "error", message: msg });
        } finally {
          clearInterval(keepAlive);
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        // Exact media type required for cloudflared to disable response buffering.
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  /** Legacy alias — same as advance (per-turn skill pick is removed). */
  authed.post("/battles/:id/action", async (c) => {
    const user = c.get("user");
    const battleId = c.req.param("id");
    const idempotencyKey = readIdempotencyKey(c.req.header("Idempotency-Key"));
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const scope = `battle-advance:${battleId}`;
    const idempotency = await beginIdempotentRequest({
      userId: user.id,
      scope,
      key: idempotencyKey,
      requestHash: requestDigest({ battleId }),
    });
    if (idempotency.kind === "conflict") {
      return c.json({ error: "idempotency_key_conflict" }, 409);
    }
    if (idempotency.kind === "processing") {
      return c.json({ error: "request_in_progress" }, 409);
    }
    if (idempotency.kind === "replay") return c.json(idempotency.response);
    let operationCompleted = false;
    try {
      const battle = await withBattleProviderOperationContext(
        battleId,
        () => advanceTurn({
          userId: user.id,
          battleId,
          llm,
        }),
      );
      operationCompleted = true;
      const response = { battle };
      await completeIdempotentRequest({
        userId: user.id,
        scope,
        key: idempotencyKey,
        ownerId: idempotency.ownerId,
        response,
      });
      await wakeNarrationTasks();
      return c.json(response);
    } catch (e) {
      if (!operationCompleted) {
        await abandonIdempotentRequest({
          userId: user.id,
          scope,
          key: idempotencyKey,
          ownerId: idempotency.ownerId,
        });
      }
      const msg = e instanceof Error ? e.message : "error";
      const code =
        msg === "FORBIDDEN"
          ? 403
          : msg === "BATTLE_NOT_FOUND"
            ? 404
            : msg === "BATTLE_BUSY" || msg === "BATTLE_FINISHED"
              ? 409
              : 400;
      return c.json({ error: msg.toLowerCase() }, code);
    }
  });

  app.route("/api", authed);
  return app;
}
