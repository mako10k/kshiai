import {
  type AssetAuthoringAttemptKind,
  type AuthoringAssetType,
  type CharacterReviewState,
  type OwnerNotificationKind,
  type OwnerNotificationPublic,
} from "@kshiai/shared";
import { query, type DatabaseConnection } from "../db.js";
import { newId } from "../id.js";
import type { CharacterAuthoringAttempt } from "./character-assets-v2.js";

export function reviewStateFromAttempt(
  attempt: Pick<CharacterAuthoringAttempt, "attemptId" | "status"> | null,
): { reviewState: CharacterReviewState | null; reviewAttemptId: string | null } {
  if (!attempt) return { reviewState: null, reviewAttemptId: null };
  if (attempt.status === "pending_structure") {
    return { reviewState: "queued", reviewAttemptId: attempt.attemptId };
  }
  if (
    attempt.status === "generating_structure" ||
    attempt.status === "validating_structure" ||
    attempt.status === "generating_description" ||
    attempt.status === "validating_description"
  ) {
    return { reviewState: "generating", reviewAttemptId: attempt.attemptId };
  }
  if (attempt.status === "awaiting_owner_acceptance") {
    return { reviewState: "awaiting_acceptance", reviewAttemptId: attempt.attemptId };
  }
  if (attempt.status === "failed") {
    return { reviewState: "failed", reviewAttemptId: attempt.attemptId };
  }
  return { reviewState: null, reviewAttemptId: null };
}

export function notificationTitle(
  kind: OwnerNotificationKind,
  attemptKind: AssetAuthoringAttemptKind,
  assetType: AuthoringAssetType = "character",
): string {
  const noun = assetType === "battlefield"
    ? "戦場"
    : assetType === "narration_style"
      ? "語り口"
      : "キャラ";
  if (kind === "authoring_failed") return `${noun}の生成に失敗しました`;
  if (attemptKind === "upgrade") return `${noun}の最新版案が届きました`;
  if (attemptKind === "revision") return `${noun}の変更案が届きました`;
  return `${noun}の生成案が届きました`;
}

export function notificationHref(
  attemptId: string,
  assetType: AuthoringAssetType = "character",
): string {
  if (assetType === "battlefield") return `/reviews/battlefields/${attemptId}`;
  if (assetType === "narration_style") {
    return `/reviews/narration-styles/${attemptId}`;
  }
  return `/reviews/${attemptId}`;
}

export function toPublicNotification(row: {
  notification_id: string;
  kind: OwnerNotificationKind;
  attempt_id: string;
  character_id: string;
  attempt_kind: AssetAuthoringAttemptKind;
  created_at: string;
  read_at: string | null;
  asset_type?: AuthoringAssetType | null;
}): OwnerNotificationPublic {
  const assetType = row.asset_type ?? "character";
  return {
    id: row.notification_id,
    kind: row.kind,
    attemptId: row.attempt_id,
    characterId: row.character_id,
    assetType,
    attemptKind: row.attempt_kind,
    title: notificationTitle(row.kind, row.attempt_kind, assetType),
    href: notificationHref(row.attempt_id, assetType),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function insertOwnerNotification(
  connection: DatabaseConnection,
  input: {
    ownerUserId: string;
    kind: OwnerNotificationKind;
    attemptId: string;
    characterId: string;
    attemptKind: AssetAuthoringAttemptKind;
    createdAt: string;
    assetType?: AuthoringAssetType;
  },
): Promise<void> {
  await connection.query(
    `INSERT INTO owner_notifications
      (notification_id, owner_user_id, kind, attempt_id, character_id,
       attempt_kind, created_at, read_at, asset_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)
     ON CONFLICT (attempt_id, kind) DO NOTHING`,
    [
      newId("ntf"),
      input.ownerUserId,
      input.kind,
      input.attemptId,
      input.characterId,
      input.attemptKind,
      input.createdAt,
      input.assetType ?? "character",
    ],
  );
}

export async function listOwnerNotifications(
  ownerUserId: string,
  limit = 20,
): Promise<{ notifications: OwnerNotificationPublic[]; unreadCount: number }> {
  const unread = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM owner_notifications
      WHERE owner_user_id = $1 AND read_at IS NULL`,
    [ownerUserId],
  );
  const rows = await query<{
    notification_id: string;
    kind: OwnerNotificationKind;
    attempt_id: string;
    character_id: string;
    attempt_kind: AssetAuthoringAttemptKind;
    created_at: string;
    read_at: string | null;
    asset_type?: AuthoringAssetType | null;
  }>(
    `SELECT notification_id, kind, attempt_id, character_id, attempt_kind,
            created_at, read_at, asset_type
       FROM owner_notifications
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [ownerUserId, Math.max(1, Math.min(50, limit))],
  );
  return {
    notifications: rows.rows.map(toPublicNotification),
    unreadCount: Number(unread.rows[0]?.count ?? 0),
  };
}

export async function markOwnerNotificationRead(
  notificationId: string,
  ownerUserId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await query(
    `UPDATE owner_notifications
        SET read_at = COALESCE(read_at, $3)
      WHERE notification_id = $1 AND owner_user_id = $2`,
    [notificationId, ownerUserId, now],
  );
  return result.rowCount === 1;
}

export async function listLatestAttemptsByCharacterIds(
  ownerUserId: string,
  characterIds: string[],
): Promise<Map<string, CharacterAuthoringAttempt>> {
  const latest = new Map<string, CharacterAuthoringAttempt>();
  if (characterIds.length === 0) return latest;
  const { getLatestCharacterAuthoringAttemptForCharacter } =
    await import("./character-assets-v2.js");
  await Promise.all(characterIds.map(async (characterId) => {
    const attempt = await getLatestCharacterAuthoringAttemptForCharacter(
      characterId,
      ownerUserId,
    );
    if (attempt) latest.set(characterId, attempt);
  }));
  return latest;
}

export async function listLatestBattlefieldAttemptsByIds(
  ownerUserId: string,
  battlefieldIds: string[],
): Promise<Map<string, Pick<CharacterAuthoringAttempt, "attemptId" | "status">>> {
  const latest = new Map<string, Pick<CharacterAuthoringAttempt, "attemptId" | "status">>();
  if (battlefieldIds.length === 0) return latest;
  const { getLatestBattlefieldAuthoringAttemptForAsset } =
    await import("./battlefield-assets-v2.js");
  await Promise.all(battlefieldIds.map(async (battlefieldId) => {
    const attempt = await getLatestBattlefieldAuthoringAttemptForAsset(
      battlefieldId,
      ownerUserId,
    );
    if (attempt) latest.set(battlefieldId, attempt);
  }));
  return latest;
}

export async function listLatestNarrationStyleAttemptsByIds(
  ownerUserId: string,
  styleIds: string[],
): Promise<Map<string, Pick<CharacterAuthoringAttempt, "attemptId" | "status">>> {
  const latest = new Map<string, Pick<CharacterAuthoringAttempt, "attemptId" | "status">>();
  if (styleIds.length === 0) return latest;
  const { getLatestNarrationStyleAuthoringAttemptForAsset } =
    await import("./narration-style-assets-v2.js");
  await Promise.all(styleIds.map(async (styleId) => {
    const attempt = await getLatestNarrationStyleAuthoringAttemptForAsset(
      styleId,
      ownerUserId,
    );
    if (attempt) latest.set(styleId, attempt);
  }));
  return latest;
}
