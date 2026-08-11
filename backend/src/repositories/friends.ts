import type { FriendPublic, UserPublic } from "@kshiai/shared";
import { query } from "../db.js";

export async function listFriends(userId: string): Promise<FriendPublic[]> {
  const { rows } = await query<{
    id: string;
    username: string;
    created_at: string;
  }>(
    `SELECT u.id, u.username, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.friend_user_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  }));
}

export async function listFriendUserIds(userId: string): Promise<Set<string>> {
  const { rows } = await query<{ friend_user_id: string }>(
    `SELECT friend_user_id FROM friendships WHERE user_id = $1`,
    [userId],
  );
  return new Set(rows.map((row) => row.friend_user_id));
}

/** True when viewer is on the character owner's friend list. */
export async function isViewerFriendedByOwner(
  ownerUserId: string,
  viewerUserId: string,
): Promise<boolean> {
  if (ownerUserId === viewerUserId) return true;
  const { rows } = await query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM friendships
     WHERE user_id = $1 AND friend_user_id = $2
     LIMIT 1`,
    [ownerUserId, viewerUserId],
  );
  return rows.length > 0;
}

export async function findUserByUsername(
  username: string,
): Promise<UserPublic | null> {
  const { rows } = await query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE lower(username) = lower($1) LIMIT 1`,
    [username.trim()],
  );
  const row = rows[0];
  return row ? { id: row.id, username: row.username } : null;
}

export async function addFriend(
  userId: string,
  friendUsername: string,
): Promise<FriendPublic> {
  const friend = await findUserByUsername(friendUsername);
  if (!friend) {
    throw Object.assign(new Error("user_not_found"), { status: 404 });
  }
  if (friend.id === userId) {
    throw Object.assign(new Error("cannot_friend_self"), { status: 400 });
  }
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO friendships (user_id, friend_user_id, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
    [userId, friend.id, createdAt],
  );
  const { rows } = await query<{ created_at: string }>(
    `SELECT created_at FROM friendships
     WHERE user_id = $1 AND friend_user_id = $2`,
    [userId, friend.id],
  );
  return {
    id: friend.id,
    username: friend.username,
    createdAt: rows[0]?.created_at ?? createdAt,
  };
}

export async function removeFriend(
  userId: string,
  friendUserId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM friendships
     WHERE user_id = $1 AND friend_user_id = $2`,
    [userId, friendUserId],
  );
  return rowCount > 0;
}
