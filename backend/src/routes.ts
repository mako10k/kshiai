import { Hono } from "hono";
import {
  BattlefieldChatRequestSchema,
  CharacterChatRequestSchema,
  CreateBattleRequestSchema,
  GenerateBattlefieldRequestSchema,
  GenerateCharacterRequestSchema,
  GenerateNarrationStyleRequestSchema,
  GeneratePoliciesRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  SaveBattlefieldFromBattleRequestSchema,
  UpsertNarrationStyleRequestSchema,
  toPublicCharacter,
  toPublicNarrationStyle,
  toPublicPreset,
  type BattlefieldPreset,
  type CharacterSheet,
} from "@kshiai/shared";
import {
  clearSessionCookie,
  createSession,
  getSessionToken,
  registerUser,
  requireUser,
  setSessionCookie,
  userFromToken,
  verifyLogin,
  destroySession,
} from "./auth.js";
import { newId } from "./id.js";
import { createLlmProvider } from "./llm/index.js";
import * as charRepo from "./repositories/characters.js";
import * as battleRepo from "./repositories/battles.js";
import * as bfRepo from "./repositories/battlefields.js";
import * as styleRepo from "./repositories/narration-styles.js";
import {
  advanceTurn,
  generateMatchPolicies,
  instanceToPreset,
  pickRandomOpponent,
  startBattle,
  toBattlePublic,
} from "./services/battle-service.js";
import { getBalanceSummary } from "./services/balance-observe.js";

const llm = createLlmProvider();

/** Versioned media (?v=) can be cached hard; bare paths revalidate often (iOS Safari). */
function cacheControlForMedia(version: string | undefined): string {
  if (version && version.length > 0) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=60, must-revalidate";
}

export function buildRoutes() {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      llm: llm.name,
      models: llm.models ?? null,
      service: "kshiai",
    }),
  );

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
    const body = RegisterRequestSchema.parse(await c.req.json());
    try {
      const user = await registerUser(body.username, body.password);
      const token = createSession(user.id);
      setSessionCookie(c, token);
      return c.json({ user });
    } catch (e) {
      if (e instanceof Error && e.message === "USERNAME_TAKEN") {
        return c.json({ error: "username_taken" }, 409);
      }
      throw e;
    }
  });

  app.post("/api/auth/login", async (c) => {
    const body = LoginRequestSchema.parse(await c.req.json());
    const user = await verifyLogin(body.username, body.password);
    if (!user) return c.json({ error: "invalid_credentials" }, 401);
    const token = createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ user });
  });

  app.post("/api/auth/logout", async (c) => {
    const token = getSessionToken(c);
    if (token) destroySession(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get("/api/me", (c) => {
    const user = userFromToken(getSessionToken(c));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ user });
  });

  const authed = new Hono();
  authed.use("*", requireUser);

  /**
   * Balance observability summary (aggregates only).
   * Does not affect combat; for operators watching early-KO / one-shot rates.
   */
  authed.get("/balance/summary", (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json({
      summary: getBalanceSummary(Number.isFinite(limit) ? limit : 20),
    });
  });

  authed.get("/characters", (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    return c.json({ characters: charRepo.listCharactersForUser(user.id, q) });
  });

  /** Public character profile (any authenticated user). */
  authed.get("/characters/:id", (c) => {
    const user = c.get("user");
    const sheet = charRepo.getSheet(c.req.param("id"));
    if (!sheet) return c.json({ error: "not_found" }, 404);
    return c.json({
      character: toPublicCharacter(sheet, user.id),
      isOwner: sheet.ownerUserId === user.id,
    });
  });

  /** Per-character battle history. */
  authed.get("/characters/:id/battles", (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = charRepo.getSheet(id);
    if (!sheet) return c.json({ error: "not_found" }, 404);
    const limit = Number(c.req.query("limit") ?? 50);
    const result = battleRepo.listBattleItemsForCharacter({
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
    const gen = await llm.generateCharacter({
      prompt: body.prompt,
      referenceTools: {
        search: async (query, limit) =>
          charRepo.searchOwnedCharacterReferences(user.id, query, limit),
        get: async (characterId) =>
          charRepo.getOwnedCharacterReference(user.id, characterId),
      },
    });
    const t = new Date().toISOString();
    const { balanceCharacterCombatFields, defaultRecord } = await import(
      "@kshiai/shared"
    );
    const balanced = balanceCharacterCombatFields(gen.sheet);
    const sheet: CharacterSheet = {
      id: newId("chr"),
      ownerUserId: user.id,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      record: defaultRecord(),
      ...balanced,
    };
    charRepo.saveSheet(sheet);
    try {
      const { recordSheetSnapshot } = await import(
        "./services/balance-observe.js"
      );
      recordSheetSnapshot({ sheet, phase: "generate" });
    } catch {
      /* non-fatal */
    }
    return c.json({
      character: toPublicCharacter(sheet, user.id),
      assistantMessage: gen.assistantMessage,
    });
  });

  authed.post("/characters/:id/chat", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = CharacterChatRequestSchema.parse(await c.req.json());
    const sheet = charRepo.getSheet(id);
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const adj = await llm.adjustCharacter(sheet, body.message);
    const { balanceCharacterCombatFields } = await import("@kshiai/shared");
    const merged = {
      ...sheet,
      ...adj.sheetPatch,
      parameters: adj.sheetPatch.parameters
        ? { ...sheet.parameters, ...adj.sheetPatch.parameters }
        : sheet.parameters,
      basicAttack: adj.sheetPatch.basicAttack ?? sheet.basicAttack,
      skills: adj.sheetPatch.skills ?? sheet.skills,
      weapon: adj.sheetPatch.weapon !== undefined ? adj.sheetPatch.weapon : sheet.weapon,
      armor: adj.sheetPatch.armor !== undefined ? adj.sheetPatch.armor : sheet.armor,
      traits: adj.sheetPatch.traits ?? sheet.traits,
      narrativeBlurb: adj.sheetPatch.narrativeBlurb ?? sheet.narrativeBlurb,
      appearance: adj.sheetPatch.appearance
        ? { ...sheet.appearance, ...adj.sheetPatch.appearance }
        : sheet.appearance,
    };
    const next: CharacterSheet = {
      ...balanceCharacterCombatFields(merged),
      id: sheet.id,
      ownerUserId: sheet.ownerUserId,
      createdAt: sheet.createdAt,
      record: sheet.record,
      recordOverall: sheet.recordOverall,
      deletedAt: sheet.deletedAt,
      updatedAt: new Date().toISOString(),
    };
    charRepo.saveSheet(next);
    try {
      const { recordSheetSnapshot } = await import(
        "./services/balance-observe.js"
      );
      recordSheetSnapshot({ sheet: next, phase: "chat" });
    } catch {
      /* non-fatal */
    }
    return c.json({
      character: toPublicCharacter(next, user.id),
      assistantMessage: adj.assistantMessage,
    });
  });

  authed.post("/characters/:id/copy", async (c) => {
    const user = c.get("user");
    const copy = charRepo.copyCharacter(c.req.param("id"), user.id);
    if (!copy) return c.json({ error: "not_found" }, 404);
    try {
      const { recordSheetSnapshot } = await import(
        "./services/balance-observe.js"
      );
      recordSheetSnapshot({ sheet: copy, phase: "copy" });
    } catch {
      /* non-fatal */
    }
    return c.json({ character: toPublicCharacter(copy, user.id) });
  });

  authed.delete("/characters/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sheet = charRepo.softDeleteCharacter(id, user.id);
    if (!sheet) return c.json({ error: "not_found" }, 404);
    // Void Elo gained/lost against this character so deletes can't farm rating
    const { voidRatingsInvolvingCharacter } = await import(
      "./services/rating-service.js"
    );
    const voided = voidRatingsInvolvingCharacter(id);
    return c.json({ ok: true, ratingMatchesVoided: voided });
  });

  authed.get("/characters/:id/image-quota", async (c) => {
    const user = c.get("user");
    const sheet = charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const { getImageGenQuota } = await import("./services/image-quota.js");
    return c.json({ quota: getImageGenQuota(sheet.id) });
  });

  authed.post("/characters/:id/image", async (c) => {
    const user = c.get("user");
    const sheet = charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }

    const { getImageGenQuota, recordImageGenEvent, pruneImageGenEvents } =
      await import("./services/image-quota.js");
    try {
      pruneImageGenEvents();
    } catch {
      /* non-fatal */
    }

    const quotaBefore = getImageGenQuota(sheet.id);
    if (!quotaBefore.allowed) {
      return c.json(
        {
          error: "rate_limited",
          message: `顔生成の上限です。${quotaBefore.message}`,
          quota: quotaBefore,
        },
        429,
      );
    }

    // Body may be missing / null / empty — never throw on parse
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

    try {
      const { generateAndStoreCharacterPortrait, logImageEvent } = await import(
        "./services/image-service.js"
      );
      logImageEvent({
        phase: "route_hit",
        characterId: sheet.id,
        userId: user.id,
        hasExtra: Boolean(extra),
        quota: quotaBefore,
      });
      const result = await generateAndStoreCharacterPortrait(sheet, extra);
      // Count attempt after we actually hit the image pipeline (ok or soft-fallback)
      const quota = recordImageGenEvent({
        userId: user.id,
        characterId: sheet.id,
        ok: result.ok,
      });
      // Always bump updatedAt so public imageUrl ?v= changes (cache bust for iOS)
      const updatedAt = new Date().toISOString();
      const next: CharacterSheet = {
        ...sheet,
        appearance: {
          ...sheet.appearance,
          imageUrl: result.url,
          visualPrompt:
            sheet.appearance.visualPrompt?.trim() ||
            `${sheet.displayName}, ${sheet.appearance.summary || "anime portrait"}`,
        },
        updatedAt,
      };
      charRepo.saveSheet(next);
      return c.json({
        character: toPublicCharacter(next, user.id),
        note: result.note,
        ok: result.ok,
        quota,
      });
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
      // Hard failure still consumes a slot (API may have been billed / attempted)
      const quota = recordImageGenEvent({
        userId: user.id,
        characterId: sheet.id,
        ok: false,
      });
      return c.json(
        { error: "image_generation_failed", message, quota },
        502,
      );
    }
  });

  authed.get("/match/candidates", (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    return c.json({ candidates: charRepo.listPublicOpponents(user.id, q) });
  });

  authed.post("/match/random", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as {
      myCharacterId?: string;
    };
    if (!body.myCharacterId) {
      return c.json({ error: "myCharacterId_required" }, 400);
    }
    const opp = pickRandomOpponent(user.id, body.myCharacterId);
    if (!opp) return c.json({ error: "no_candidates" }, 404);
    return c.json({ opponent: opp });
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
  authed.get("/battlefields", (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    return c.json({ battlefields: bfRepo.listPresets({ userId: user.id, q }) });
  });

  authed.post("/battlefields/generate", async (c) => {
    const user = c.get("user");
    const body = GenerateBattlefieldRequestSchema.parse(await c.req.json());
    const gen = await llm.generateBattlefieldPreset({
      prompt: body.prompt,
      category: body.category,
    });
    const t = new Date().toISOString();
    const preset: BattlefieldPreset = {
      id: newId("bfp"),
      ownerUserId: user.id,
      isSystem: false,
      createdAt: t,
      updatedAt: t,
      ...gen.preset,
    };
    bfRepo.savePreset(preset);
    return c.json({
      battlefield: toPublicPreset(preset),
      assistantMessage: gen.assistantMessage,
    });
  });

  authed.post("/battlefields/:id/chat", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = BattlefieldChatRequestSchema.parse(await c.req.json());
    const preset = bfRepo.getPreset(id);
    if (!preset || preset.isSystem || preset.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const adj = await llm.adjustBattlefieldPreset(preset, body.message);
    const next: BattlefieldPreset = {
      ...preset,
      ...adj.presetPatch,
      baseCoefficients: adj.presetPatch.baseCoefficients
        ? { ...preset.baseCoefficients, ...adj.presetPatch.baseCoefficients }
        : preset.baseCoefficients,
      appearance: adj.presetPatch.appearance
        ? { ...preset.appearance, ...adj.presetPatch.appearance }
        : preset.appearance,
      updatedAt: new Date().toISOString(),
    };
    bfRepo.savePreset(next);
    return c.json({
      battlefield: toPublicPreset(next),
      assistantMessage: adj.assistantMessage,
    });
  });

  authed.post("/battlefields/:id/copy", (c) => {
    const user = c.get("user");
    const copy = bfRepo.copyPreset(c.req.param("id"), user.id);
    if (!copy) return c.json({ error: "not_found" }, 404);
    return c.json({ battlefield: toPublicPreset(copy) });
  });

  authed.delete("/battlefields/:id", (c) => {
    const user = c.get("user");
    const ok = bfRepo.deletePreset(c.req.param("id"), user.id);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.post("/battlefields/:id/image", async (c) => {
    const user = c.get("user");
    const preset = bfRepo.getPreset(c.req.param("id"));
    if (!preset || preset.isSystem || preset.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    const seed = encodeURIComponent(preset.displayName);
    const imageUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}`;
    const next: BattlefieldPreset = {
      ...preset,
      appearance: { ...preset.appearance, imageUrl },
      updatedAt: new Date().toISOString(),
    };
    bfRepo.savePreset(next);
    return c.json({
      battlefield: toPublicPreset(next),
      note: "Scaffold placeholder image. Wire xAI/Venice image API next.",
    });
  });

  authed.post("/battlefields/from-battle", async (c) => {
    const user = c.get("user");
    const body = SaveBattlefieldFromBattleRequestSchema.parse(await c.req.json());
    const meta = battleRepo.getBattleMeta(body.battleId);
    const state = battleRepo.getBattle(body.battleId);
    if (!meta || !state) return c.json({ error: "not_found" }, 404);
    if (meta.side_a_user_id !== user.id) return c.json({ error: "forbidden" }, 403);
    if (!state.battlefield) {
      return c.json({ error: "no_battlefield" }, 400);
    }
    const preset = instanceToPreset(
      state.battlefield,
      user.id,
      body.displayName,
    );
    bfRepo.savePreset(preset);
    return c.json({ battlefield: toPublicPreset(preset) });
  });

  // —— Narration styles (system presets + user custom) ——
  authed.get("/narration-styles", (c) => {
    const user = c.get("user");
    return c.json({ styles: styleRepo.listNarrationStyles(user.id) });
  });

  authed.post("/narration-styles", async (c) => {
    const user = c.get("user");
    try {
      const body = UpsertNarrationStyleRequestSchema.parse(await c.req.json());
      const style = styleRepo.createUserNarrationStyle(user.id, body);
      return c.json({ style: toPublicNarrationStyle(style) }, 201);
    } catch (e) {
      const message = e instanceof Error ? e.message : "invalid";
      return c.json({ error: "invalid_request", message }, 400);
    }
  });

  authed.post("/narration-styles/generate", async (c) => {
    const user = c.get("user");
    try {
      const body = GenerateNarrationStyleRequestSchema.parse(await c.req.json());
      const draft = llm.generateNarrationStyle
        ? await llm.generateNarrationStyle(body.prompt)
        : {
            displayName: body.prompt.slice(0, 12) || "カスタム",
            description: body.prompt.slice(0, 80),
            instruction: `次の雰囲気で語る: ${body.prompt}`,
            tags: ["custom"],
          };
      const style = styleRepo.createUserNarrationStyle(user.id, draft);
      return c.json({ style: toPublicNarrationStyle(style) }, 201);
    } catch (e) {
      const message = e instanceof Error ? e.message : "failed";
      return c.json({ error: "generate_failed", message }, 400);
    }
  });

  authed.patch("/narration-styles/:id", async (c) => {
    const user = c.get("user");
    try {
      const body = UpsertNarrationStyleRequestSchema.partial().parse(
        await c.req.json(),
      );
      const style = styleRepo.updateUserNarrationStyle(
        c.req.param("id"),
        user.id,
        body,
      );
      if (!style) return c.json({ error: "not_found" }, 404);
      return c.json({ style: toPublicNarrationStyle(style) });
    } catch (e) {
      const message = e instanceof Error ? e.message : "invalid";
      return c.json({ error: "invalid_request", message }, 400);
    }
  });

  authed.delete("/narration-styles/:id", (c) => {
    const user = c.get("user");
    const ok = styleRepo.deleteUserNarrationStyle(c.req.param("id"), user.id);
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
    try {
      const battle = await startBattle({
        userId: user.id,
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
      return c.json({ battle });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      console.error("[battles] startBattle failed", msg, e);
      return c.json(
        { error: msg.toLowerCase(), message: msg },
        msg.includes("NOT_FOUND") || msg.includes("FORBIDDEN") ? 400 : 500,
      );
    }
  });

  /** Battle history (search + status filter). Must be before /battles/:id */
  authed.get("/battles", (c) => {
    const user = c.get("user");
    const q = c.req.query("q") ?? undefined;
    const statusRaw = c.req.query("status") ?? "all";
    const status =
      statusRaw === "active" || statusRaw === "finished" || statusRaw === "all"
        ? statusRaw
        : "all";
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    const result = battleRepo.listBattlesForUser({
      userId: user.id,
      q,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return c.json(result);
  });

  authed.delete("/battles/:id", (c) => {
    const user = c.get("user");
    const ok = battleRepo.deleteBattle(c.req.param("id"), user.id);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.get("/battles/:id", (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const meta = battleRepo.getBattleMeta(id);
    const state = battleRepo.getBattle(id);
    if (!meta || !state) return c.json({ error: "not_found" }, 404);
    if (meta.side_a_user_id !== user.id) return c.json({ error: "forbidden" }, 403);
    const mine = charRepo.getSheet(meta.side_a_character_id);
    if (!mine) return c.json({ error: "not_found" }, 404);
    const opp = charRepo.getSheet(meta.side_b_character_id);
    return c.json({ battle: toBattlePublic(state, mine, null, opp) });
  });

  /** Advance one turn; actions chosen automatically from stances. */
  authed.post("/battles/:id/advance", async (c) => {
    const user = c.get("user");
    const battleId = c.req.param("id");
    const started = Date.now();
    console.info(`[battles] advance start ${battleId}`);
    try {
      const battle = await advanceTurn({
        userId: user.id,
        battleId,
        llm,
      });
      console.info(
        `[battles] advance ok ${battleId} turn=${battle.turn} ${Date.now() - started}ms aft=${battle.aftermathPending ? 1 : 0}`,
      );
      return c.json({ battle });
    } catch (e) {
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
              : 500;
      return c.json({ error: msg.toLowerCase(), message: msg }, code);
    }
  });

  /** Legacy alias — same as advance (per-turn skill pick is removed). */
  authed.post("/battles/:id/action", async (c) => {
    const user = c.get("user");
    try {
      const battle = await advanceTurn({
        userId: user.id,
        battleId: c.req.param("id"),
        llm,
      });
      return c.json({ battle });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      const code =
        msg === "FORBIDDEN"
          ? 403
          : msg === "BATTLE_NOT_FOUND"
            ? 404
            : 400;
      return c.json({ error: msg.toLowerCase() }, code);
    }
  });

  app.route("/api", authed);
  return app;
}
