import type { UserProfilePublic, UserPublic } from "@kshiai/shared";
import { query } from "../db.js";
import { isFriendOf } from "./friends.js";

const ADJECTIVES = [
  "疾風",
  "蒼",
  "紅",
  "銀",
  "夜",
  "星",
  "翠",
  "焔",
  "霧",
  "暁",
] as const;
const NOUNS = [
  "旅人",
  "剣士",
  "語り部",
  "探索者",
  "奏者",
  "守護者",
  "使い",
  "影",
] as const;

export function randomDisplayName(seed?: string): string {
  const basis = seed?.replace(/[^a-zA-Z0-9]/g, "") || Math.random().toString(36);
  const a = ADJECTIVES[basis.charCodeAt(0) % ADJECTIVES.length] ?? "蒼";
  const n = NOUNS[basis.charCodeAt(1) % NOUNS.length] ?? "旅人";
  const suffix = (basis.slice(-4) || "0000").toLowerCase();
  return `${a}${n}-${suffix}`.slice(0, 32);
}

export function resolveDisplayName(
  displayName: string | null | undefined,
  username: string,
  userId: string,
): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed.slice(0, 32);
  return randomDisplayName(userId || username);
}

type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  created_at?: string | Date;
};

export function toUserPublic(
  row: UserRow,
  opts?: { isAdmin?: boolean },
): UserPublic {
  return {
    id: row.id,
    username: row.username,
    displayName: resolveDisplayName(row.display_name, row.username, row.id),
    ...(opts?.isAdmin ? { isAdmin: true } : {}),
  };
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, username, display_name, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getUserPublicById(
  userId: string,
): Promise<UserPublic | null> {
  const row = await getUserById(userId);
  return row ? toUserPublic(row) : null;
}

export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<UserPublic> {
  const trimmed = displayName.trim().slice(0, 32);
  if (!trimmed) {
    throw Object.assign(new Error("display_name_required"), { status: 400 });
  }
  await query(`UPDATE users SET display_name = $1 WHERE id = $2`, [
    trimmed,
    userId,
  ]);
  const row = await getUserById(userId);
  if (!row) throw Object.assign(new Error("user_not_found"), { status: 404 });
  return toUserPublic(row);
}

export async function listFavoriteUsers(
  userId: string,
): Promise<Array<UserPublic & { createdAt: string }>> {
  const { rows } = await query<UserRow & { created_at: string }>(
    `SELECT u.id, u.username, u.display_name, f.created_at
     FROM user_favorites f
     JOIN users u ON u.id = f.target_user_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    ...toUserPublic(row),
    createdAt: String(row.created_at),
  }));
}

export async function addFavorite(
  userId: string,
  targetUserId: string,
): Promise<UserPublic & { createdAt: string }> {
  if (userId === targetUserId) {
    throw Object.assign(new Error("cannot_favorite_self"), { status: 400 });
  }
  const target = await getUserById(targetUserId);
  if (!target) {
    throw Object.assign(new Error("user_not_found"), { status: 404 });
  }
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO user_favorites (user_id, target_user_id, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, target_user_id) DO NOTHING`,
    [userId, targetUserId, createdAt],
  );
  const { rows } = await query<{ created_at: string }>(
    `SELECT created_at FROM user_favorites
     WHERE user_id = $1 AND target_user_id = $2`,
    [userId, targetUserId],
  );
  return {
    ...toUserPublic(target),
    createdAt: rows[0]?.created_at ?? createdAt,
  };
}

export async function removeFavorite(
  userId: string,
  targetUserId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM user_favorites
     WHERE user_id = $1 AND target_user_id = $2`,
    [userId, targetUserId],
  );
  return rowCount > 0;
}

export async function isFavorite(
  userId: string,
  targetUserId: string,
): Promise<boolean> {
  const { rows } = await query<{ ok: number }>(
    `SELECT 1 AS ok FROM user_favorites
     WHERE user_id = $1 AND target_user_id = $2 LIMIT 1`,
    [userId, targetUserId],
  );
  return rows.length > 0;
}

export async function createFriendRequest(
  fromUserId: string,
  toUserId: string,
): Promise<{ createdAt: string }> {
  if (fromUserId === toUserId) {
    throw Object.assign(new Error("cannot_friend_self"), { status: 400 });
  }
  const target = await getUserById(toUserId);
  if (!target) {
    throw Object.assign(new Error("user_not_found"), { status: 404 });
  }
  // Already friends from my side: no request needed.
  if (await isFriendOf(fromUserId, toUserId)) {
    throw Object.assign(new Error("already_friends"), { status: 409 });
  }
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO friend_requests (from_user_id, to_user_id, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (from_user_id, to_user_id) DO NOTHING`,
    [fromUserId, toUserId, createdAt],
  );
  // If the other side already requested us, auto-accept both directions.
  const reverse = await query<{ created_at: string }>(
    `SELECT created_at FROM friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2`,
    [toUserId, fromUserId],
  );
  if (reverse.rows[0]) {
    await query(
      `INSERT INTO friendships (user_id, friend_user_id, created_at)
       VALUES ($1, $2, $3), ($2, $1, $3)
       ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
      [fromUserId, toUserId, createdAt],
    );
    await query(
      `DELETE FROM friend_requests
       WHERE (from_user_id = $1 AND to_user_id = $2)
          OR (from_user_id = $2 AND to_user_id = $1)`,
      [fromUserId, toUserId],
    );
  }
  const { rows } = await query<{ created_at: string }>(
    `SELECT created_at FROM friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2`,
    [fromUserId, toUserId],
  );
  return { createdAt: rows[0]?.created_at ?? createdAt };
}

export async function acceptFriendRequest(
  userId: string,
  fromUserId: string,
): Promise<void> {
  const { rows } = await query<{ created_at: string }>(
    `SELECT created_at FROM friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2`,
    [fromUserId, userId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error("request_not_found"), { status: 404 });
  }
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO friendships (user_id, friend_user_id, created_at)
     VALUES ($1, $2, $3), ($2, $1, $3)
     ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
    [userId, fromUserId, createdAt],
  );
  await query(
    `DELETE FROM friend_requests
     WHERE (from_user_id = $1 AND to_user_id = $2)
        OR (from_user_id = $2 AND to_user_id = $1)`,
    [userId, fromUserId],
  );
}

export async function rejectFriendRequest(
  userId: string,
  fromUserId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2`,
    [fromUserId, userId],
  );
  return rowCount > 0;
}

export async function cancelFriendRequest(
  userId: string,
  toUserId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2`,
    [userId, toUserId],
  );
  return rowCount > 0;
}

export async function hasOutgoingFriendRequest(
  fromUserId: string,
  toUserId: string,
): Promise<boolean> {
  const { rows } = await query<{ ok: number }>(
    `SELECT 1 AS ok FROM friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2 LIMIT 1`,
    [fromUserId, toUserId],
  );
  return rows.length > 0;
}

export async function hasIncomingFriendRequest(
  toUserId: string,
  fromUserId: string,
): Promise<boolean> {
  return hasOutgoingFriendRequest(fromUserId, toUserId);
}

export async function getUserProfile(
  targetUserId: string,
  viewerUserId?: string | null,
): Promise<UserProfilePublic | null> {
  const row = await getUserById(targetUserId);
  if (!row) return null;
  const { rows: countRows } = await query<{ n: string | number }>(
    `SELECT COUNT(*) AS n FROM characters
     WHERE owner_user_id = $1
       AND (sheet_json->>'deletedAt') IS NULL`,
    [targetUserId],
  );
  const characterCount = Number(countRows[0]?.n ?? 0);
  const base = toUserPublic(row);
  const isSelf = Boolean(viewerUserId && viewerUserId === targetUserId);
  let relation: UserProfilePublic["relation"];
  if (viewerUserId) {
    relation = {
      isSelf,
      isFriend: isSelf
        ? false
        : await isFriendOf(viewerUserId, targetUserId),
      isFavorite: isSelf
        ? false
        : await isFavorite(viewerUserId, targetUserId),
      outgoingFriendRequest: isSelf
        ? false
        : await hasOutgoingFriendRequest(viewerUserId, targetUserId),
      incomingFriendRequest: isSelf
        ? false
        : await hasIncomingFriendRequest(viewerUserId, targetUserId),
    };
  }
  return {
    ...base,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    characterCount,
    relation,
  };
}
