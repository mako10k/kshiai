// R: Authenticate an existing HTTP identity without provisioning or session cleanup.
import type { Context } from "hono";
import type { UserPublic } from "@kshiai/shared";
import { config } from "../config.js";
import { getSessionToken } from "../auth.js";
import { query } from "../db.js";
import { createSupabaseIdentityVerifier } from "./supabase-identity.js";

type ExistingUserRow = { id: string; username: string; display_name: string | null };
const verifySupabaseIdentity = createSupabaseIdentityVerifier(config);

function toUser(row: ExistingUserRow): UserPublic {
  return { id: row.id, username: row.username, displayName: row.display_name ?? row.username };
}

export async function existingUserFromRequest(c: Context): Promise<UserPublic | null> {
  return config.authProvider === "supabase"
    ? existingSupabaseUser(c)
    : existingLegacyUser(c);
}

async function existingSupabaseUser(c: Context): Promise<UserPublic | null> {
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

async function existingLegacyUser(c: Context): Promise<UserPublic | null> {
  const token = getSessionToken(c);
  if (!token) return null;
  const result = await query<ExistingUserRow & { expires_at: string | Date }>(
    `SELECT u.id, u.username, u.display_name, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`, [token],
  );
  const row = result.rows[0];
  if (!row) return null;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? toUser(row) : null;
}
