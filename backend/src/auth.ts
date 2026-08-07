import bcrypt from "bcryptjs";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { UserPublic } from "@kshiai/shared";
import { config } from "./config.js";
import { query } from "./db.js";
import { newId } from "./id.js";
import {
  adminIdentityMatches,
  getUserAccessProfile,
} from "./account-access.js";

export { adminIdentityMatches } from "./account-access.js";

const COOKIE = "kshiai_session";
const SESSION_DAYS = 14;
let supabaseJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export type AuthUser = UserPublic;

export type SupabaseIdentity = {
  subject: string;
  email: string | null;
  displayName: string | null;
};

function identityFromClaims(payload: JWTPayload): SupabaseIdentity | null {
  if (typeof payload.sub !== "string" || payload.role !== "authenticated") {
    return null;
  }
  const metadata = payload.user_metadata;
  const displayName = metadata && typeof metadata === "object"
    ? ["full_name", "name", "user_name"]
      .map((key) => (metadata as Record<string, unknown>)[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
    : null;
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    displayName,
  };
}

function usernameForIdentity(identity: SupabaseIdentity, attempt: number): string {
  const emailName = identity.email?.split("@")[0] ?? "";
  const raw = identity.displayName?.trim() || emailName.trim() || "player";
  const normalized = raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 23) || "player";
  const suffix = identity.subject.replaceAll("-", "").slice(0, 6);
  return attempt === 0
    ? `${normalized}-${suffix}`.slice(0, 32)
    : `${normalized.slice(0, 20)}-${suffix}-${attempt}`.slice(0, 32);
}

export async function ensureSupabaseUser(
  identity: SupabaseIdentity,
): Promise<AuthUser> {
  const existing = await query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE auth_user_id = $1`,
    [identity.subject],
  );
  if (existing.rows[0]) return existing.rows[0];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const user = {
      id: newId("usr"),
      username: usernameForIdentity(identity, attempt),
    };
    try {
      await query(
        `INSERT INTO users
          (id, username, password_hash, auth_user_id, email, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id,
          user.username,
          "!supabase-auth",
          identity.subject,
          identity.email,
          new Date().toISOString(),
        ],
      );
      return user;
    } catch (error) {
      const afterConflict = await query<{ id: string; username: string }>(
        `SELECT id, username FROM users WHERE auth_user_id = $1`,
        [identity.subject],
      );
      if (afterConflict.rows[0]) return afterConflict.rows[0];
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : String(error);
      if (code !== "23505" && !message.includes("UNIQUE")) throw error;
    }
  }
  throw new Error("SUPABASE_USER_MAPPING_FAILED");
}

export async function userFromSupabaseAccessToken(
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token || !config.supabaseJwksUrl || !config.supabaseUrl) return null;
  try {
    supabaseJwks ??= createRemoteJWKSet(new URL(config.supabaseJwksUrl));
    const { payload } = await jwtVerify(token, supabaseJwks, {
      algorithms: ["ES256"],
      issuer: `${config.supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });
    const identity = identityFromClaims(payload);
    return identity ? ensureSupabaseUser(identity) : null;
  } catch (error) {
    console.warn(
      "[auth] Supabase access token rejected",
      error instanceof Error
        ? (error as Error & { code?: string }).code ?? error.name
        : "invalid_token",
    );
    return null;
  }
}

export async function registerUser(
  username: string,
  password: string,
): Promise<AuthUser> {
  const id = newId("usr");
  const password_hash = await bcrypt.hash(password, 10);
  const created_at = new Date().toISOString();
  try {
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      [id, username, password_hash, created_at],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || (e as { code?: string }).code === "23505") {
      throw new Error("USERNAME_TAKEN");
    }
    throw e;
  }
  return { id, username };
}

export async function verifyLogin(
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const result = await query<{
    id: string;
    username: string;
    password_hash: string;
  }>(
    `SELECT id, username, password_hash FROM users WHERE username = $1`,
    [username],
  );
  const row = result.rows[0];
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, username: row.username };
}

export async function createSession(userId: string): Promise<string> {
  const token = newId("ses");
  const created_at = new Date().toISOString();
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, userId, created_at, expires.toISOString()],
  );
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const result = await query<{
    id: string;
    username: string;
    expires_at: string | Date;
  }>(
    `SELECT u.id, u.username, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

function cookieSecureForRequest(c: Context): boolean {
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || "";
  const proto = c.req.header("x-forwarded-proto") || "";
  if (proto === "https") return true;
  if (host.includes("mk10.org")) return true;
  if (host.startsWith("127.0.0.1") || host.startsWith("localhost")) return false;
  return config.cookieSecure;
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: cookieSecureForRequest(c),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/", secure: cookieSecureForRequest(c) });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, COOKIE);
}

function getBearerToken(c: Context): string | undefined {
  const authorization = c.req.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}

export async function userFromRequest(c: Context): Promise<AuthUser | null> {
  if (config.authProvider === "supabase") {
    return userFromSupabaseAccessToken(getBearerToken(c));
  }
  return userFromToken(getSessionToken(c));
}

export async function requireUser(c: Context, next: Next) {
  const user = await userFromRequest(c);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const user = c.get("user");
  if ((await getUserAccessProfile(user.id)).isAdmin) {
    await next();
    return;
  }
  return c.json({ error: "forbidden" }, 403);
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}
