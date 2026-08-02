import { getDb } from "../db.js";

/** Per-character portrait generation limits. */
export const IMAGE_GEN_LIMIT_HOUR = 2;
export const IMAGE_GEN_LIMIT_DAY = 3;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ImageGenQuota = {
  allowed: boolean;
  limitHour: number;
  limitDay: number;
  usedHour: number;
  usedDay: number;
  remainingHour: number;
  remainingDay: number;
  /** ISO time when the user can generate again (null if allowed now). */
  nextAllowedAt: string | null;
  /** Human-readable Japanese summary for UI. */
  message: string;
};

function parseIsoMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function listEventsSince(characterId: string, sinceIso: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT created_at FROM image_gen_events
       WHERE character_id = ? AND created_at >= ?
       ORDER BY created_at ASC`,
    )
    .all(characterId, sinceIso) as { created_at: string }[];
  return rows.map((r) => r.created_at);
}

function formatNextMessage(nextAllowedAt: string | null, allowed: boolean): string {
  if (allowed) {
    return "生成できます";
  }
  if (!nextAllowedAt) {
    return "しばらく待ってから再度お試しください";
  }
  try {
    const d = new Date(nextAllowedAt);
    const label = d.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `次回生成可能: ${label}`;
  } catch {
    return `次回生成可能: ${nextAllowedAt}`;
  }
}

/**
 * Rolling windows: 2 / hour, 3 / day, per character.
 */
export function getImageGenQuota(characterId: string, now = new Date()): ImageGenQuota {
  const nowMs = now.getTime();
  const hourSince = new Date(nowMs - HOUR_MS).toISOString();
  const daySince = new Date(nowMs - DAY_MS).toISOString();

  const hourEvents = listEventsSince(characterId, hourSince);
  const dayEvents = listEventsSince(characterId, daySince);

  const usedHour = hourEvents.length;
  const usedDay = dayEvents.length;
  const remainingHour = Math.max(0, IMAGE_GEN_LIMIT_HOUR - usedHour);
  const remainingDay = Math.max(0, IMAGE_GEN_LIMIT_DAY - usedDay);
  const allowed = remainingHour > 0 && remainingDay > 0;

  const unlockTimes: number[] = [];
  if (remainingHour <= 0 && hourEvents.length > 0) {
    // When the oldest of the last LIMIT_HOUR events leaves the 1h window
    const window = hourEvents.slice(-IMAGE_GEN_LIMIT_HOUR);
    unlockTimes.push(parseIsoMs(window[0]!) + HOUR_MS);
  }
  if (remainingDay <= 0 && dayEvents.length > 0) {
    const window = dayEvents.slice(-IMAGE_GEN_LIMIT_DAY);
    unlockTimes.push(parseIsoMs(window[0]!) + DAY_MS);
  }

  const nextAllowedAt =
    !allowed && unlockTimes.length > 0
      ? new Date(Math.max(...unlockTimes)).toISOString()
      : null;

  const parts: string[] = [];
  if (allowed) {
    parts.push(
      `残り 1時間あたり ${remainingHour}/${IMAGE_GEN_LIMIT_HOUR}・1日あたり ${remainingDay}/${IMAGE_GEN_LIMIT_DAY}`,
    );
  } else {
    parts.push(
      `制限中（1時間 ${usedHour}/${IMAGE_GEN_LIMIT_HOUR}・1日 ${usedDay}/${IMAGE_GEN_LIMIT_DAY}）`,
    );
    parts.push(formatNextMessage(nextAllowedAt, false));
  }

  return {
    allowed,
    limitHour: IMAGE_GEN_LIMIT_HOUR,
    limitDay: IMAGE_GEN_LIMIT_DAY,
    usedHour,
    usedDay,
    remainingHour,
    remainingDay,
    nextAllowedAt,
    message: parts.join(" — "),
  };
}

export function recordImageGenEvent(input: {
  userId: string;
  characterId: string;
  ok: boolean;
  at?: Date;
}): ImageGenQuota {
  const createdAt = (input.at ?? new Date()).toISOString();
  getDb()
    .prepare(
      `INSERT INTO image_gen_events (user_id, character_id, created_at, ok)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.userId, input.characterId, createdAt, input.ok ? 1 : 0);
  return getImageGenQuota(input.characterId);
}

/** Best-effort prune of old rows (keep ~7 days). */
export function pruneImageGenEvents(olderThanDays = 7): void {
  const cutoff = new Date(Date.now() - olderThanDays * DAY_MS).toISOString();
  getDb()
    .prepare(`DELETE FROM image_gen_events WHERE created_at < ?`)
    .run(cutoff);
}
