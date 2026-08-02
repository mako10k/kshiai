import { Hono } from "hono";
import {
  BattlefieldChatRequestSchema,
  CharacterChatRequestSchema,
  CreateBattleRequestSchema,
  GenerateBattlefieldRequestSchema,
  GenerateCharacterRequestSchema,
  GeneratePoliciesRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  SaveBattlefieldFromBattleRequestSchema,
  toPublicCharacter,
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
import {
  advanceTurn,
  generateMatchPolicies,
  instanceToPreset,
  pickAutoOpponent,
  pickRandomOpponent,
  startBattle,
  toBattlePublic,
} from "./services/battle-service.js";

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
    c.json({ ok: true, llm: llm.name, service: "kshiai" }),
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

  authed.get("/characters", (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    return c.json({ characters: charRepo.listCharactersForUser(user.id, q) });
  });

  authed.post("/characters/generate", async (c) => {
    const user = c.get("user");
    const body = GenerateCharacterRequestSchema.parse(await c.req.json());
    const gen = await llm.generateCharacter(body.prompt);
    const t = new Date().toISOString();
    const { defaultRecord } = await import("@kshiai/shared");
    const sheet: CharacterSheet = {
      id: newId("chr"),
      ownerUserId: user.id,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      record: defaultRecord(),
      ...gen.sheet,
    };
    charRepo.saveSheet(sheet);
    return c.json({
      character: toPublicCharacter(sheet),
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
    const next: CharacterSheet = {
      ...sheet,
      ...adj.sheetPatch,
      parameters: adj.sheetPatch.parameters
        ? { ...sheet.parameters, ...adj.sheetPatch.parameters }
        : sheet.parameters,
      skills: adj.sheetPatch.skills ?? sheet.skills,
      appearance: adj.sheetPatch.appearance
        ? { ...sheet.appearance, ...adj.sheetPatch.appearance }
        : sheet.appearance,
      updatedAt: new Date().toISOString(),
    };
    charRepo.saveSheet(next);
    return c.json({
      character: toPublicCharacter(next),
      assistantMessage: adj.assistantMessage,
    });
  });

  authed.post("/characters/:id/copy", (c) => {
    const user = c.get("user");
    const copy = charRepo.copyCharacter(c.req.param("id"), user.id);
    if (!copy) return c.json({ error: "not_found" }, 404);
    return c.json({ character: toPublicCharacter(copy) });
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

  authed.post("/characters/:id/image", async (c) => {
    const user = c.get("user");
    const sheet = charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
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
      const { generateAndStoreCharacterPortrait } = await import(
        "./services/image-service.js"
      );
      const result = await generateAndStoreCharacterPortrait(sheet, extra);
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
        character: toPublicCharacter(next),
        note: result.note,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[characters/image]", message);
      // 502 for upstream image API failures (not client param mistakes)
      return c.json({ error: "image_generation_failed", message }, 502);
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

  authed.post("/match/auto", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as {
      myCharacterId?: string;
    };
    if (!body.myCharacterId) {
      return c.json({ error: "myCharacterId_required" }, 400);
    }
    const opp = pickAutoOpponent(user.id, body.myCharacterId);
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

  authed.post("/battles", async (c) => {
    const user = c.get("user");
    const body = CreateBattleRequestSchema.parse(await c.req.json());
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
        llm,
      });
      return c.json({ battle });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg.toLowerCase() }, 400);
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
    return c.json({ battle: toBattlePublic(state, mine) });
  });

  /** Advance one turn; actions chosen automatically from stances. */
  authed.post("/battles/:id/advance", async (c) => {
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
