import { Hono } from "hono";
import {
  BattleActionRequestSchema,
  CharacterChatRequestSchema,
  CreateBattleRequestSchema,
  GenerateCharacterRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  toPublicCharacter,
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
import {
  performAction,
  pickAutoOpponent,
  pickRandomOpponent,
  startBattle,
  toBattlePublic,
} from "./services/battle-service.js";

const llm = createLlmProvider();

export function buildRoutes() {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, llm: llm.name, service: "kshiai" }),
  );

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
    const sheet: CharacterSheet = {
      id: newId("chr"),
      ownerUserId: user.id,
      createdAt: t,
      updatedAt: t,
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

  authed.delete("/characters/:id", (c) => {
    const user = c.get("user");
    const ok = charRepo.deleteCharacter(c.req.param("id"), user.id);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  authed.post("/characters/:id/image", async (c) => {
    const user = c.get("user");
    const sheet = charRepo.getSheet(c.req.param("id"));
    if (!sheet || sheet.ownerUserId !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    // Scaffold: placeholder image via dicebear-style URL (no external API key).
    const seed = encodeURIComponent(sheet.displayName);
    const imageUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
    const next: CharacterSheet = {
      ...sheet,
      appearance: { ...sheet.appearance, imageUrl },
      updatedAt: new Date().toISOString(),
    };
    charRepo.saveSheet(next);
    return c.json({
      character: toPublicCharacter(next),
      note: "Scaffold uses a deterministic avatar URL. Wire xAI/Venice image API next.",
    });
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

  authed.post("/battles", async (c) => {
    const user = c.get("user");
    const body = CreateBattleRequestSchema.parse(await c.req.json());
    try {
      const battle = await startBattle({
        userId: user.id,
        myCharacterId: body.myCharacterId,
        opponentCharacterId: body.opponentCharacterId,
        llm,
      });
      return c.json({ battle });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg.toLowerCase() }, 400);
    }
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

  authed.post("/battles/:id/action", async (c) => {
    const user = c.get("user");
    const body = BattleActionRequestSchema.parse(await c.req.json());
    try {
      const battle = await performAction({
        userId: user.id,
        battleId: c.req.param("id"),
        action: body,
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
