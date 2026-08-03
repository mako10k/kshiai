import bcrypt from "bcryptjs";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { UserPublic } from "@kshiai/shared";
import { config } from "./config.js";
import { query } from "./db.js";
import { newId } from "./id.js";

const COOKIE = "kshiai_session";
const SESSION_DAYS = 14;

export type AuthUser = UserPublic;

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

export async function requireUser(c: Context, next: Next) {
  const user = await userFromToken(getSessionToken(c));
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}
