import bcrypt from "bcryptjs";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { UserPublic } from "@kshiai/shared";
import { getDb } from "./db.js";
import { newId } from "./id.js";

const COOKIE = "kshiai_session";
const SESSION_DAYS = 14;

export type AuthUser = UserPublic;

export async function registerUser(
  username: string,
  password: string,
): Promise<AuthUser> {
  const db = getDb();
  const id = newId("usr");
  const password_hash = await bcrypt.hash(password, 10);
  const created_at = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).run(id, username, password_hash, created_at);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
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
  const db = getDb();
  const row = db
    .prepare(`SELECT id, username, password_hash FROM users WHERE username = ?`)
    .get(username) as
    | { id: string; username: string; password_hash: string }
    | undefined;
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, username: row.username };
}

export function createSession(userId: string): string {
  const db = getDb();
  const token = newId("ses");
  const created_at = new Date().toISOString();
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(token, userId, created_at, expires.toISOString());
  return token;
}

export function destroySession(token: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function userFromToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as { id: string; username: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/" });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, COOKIE);
}

export async function requireUser(c: Context, next: Next) {
  const user = userFromToken(getSessionToken(c));
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
