import {
  DEFAULT_NARRATION_STYLE_ID,
  NarrationStyleSchema,
  SYSTEM_NARRATION_STYLE_SEEDS,
  toPublicNarrationStyle,
  type NarrationStyle,
  type NarrationStylePublic,
  NarrationGenerationEnvelopeV2Schema,
  compileNarrationPolicyV2,
} from "@kshiai/shared";
import { query, withTransaction } from "../db.js";
import {
  canAccessSharedAsset,
  getUserAccessProfile,
  normalizeAccountKind,
} from "../account-access.js";
import * as narrationAssetRepo from "./narration-style-assets-v2.js";
import { buildImportedNarrationStyleEnvelopeV2 } from "../services/narration-style-authoring-service.js";
import {
  listLatestNarrationStyleAttemptsByIds,
  reviewStateFromAttempt,
} from "./owner-notifications.js";
import type { AssetGeneration } from "./asset-generations.js";

let seedPromise: Promise<void> | null = null;

export function ensureSystemNarrationStyles(): Promise<void> {
  seedPromise ??= seedSystemNarrationStyles().catch((error) => {
    seedPromise = null;
    throw error;
  });
  return seedPromise;
}

async function seedSystemNarrationStyles(): Promise<void> {
  const now = new Date().toISOString();
  await withTransaction(async (connection) => {
    for (const seed of SYSTEM_NARRATION_STYLE_SEEDS) {
      const existing = await connection.query<{ created_at: string | Date }>(
        `SELECT created_at FROM narration_styles WHERE id = $1`,
        [seed.id],
      );
      const rawCreatedAt = existing.rows[0]?.created_at;
      const createdAt = rawCreatedAt instanceof Date
        ? rawCreatedAt.toISOString()
        : rawCreatedAt ?? now;
      const full: NarrationStyle = {
        ...seed,
        perspective: seed.perspective ?? "external",
        createdAt,
        updatedAt: now,
      };
      await connection.query(
        `INSERT INTO narration_styles
          (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
         VALUES ($1, NULL, TRUE, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET owner_user_id = NULL,
               is_system = TRUE,
               sheet_json = EXCLUDED.sheet_json,
               updated_at = EXCLUDED.updated_at`,
        [seed.id, JSON.stringify(full), createdAt, now],
      );
    }
  });
  for (const seed of SYSTEM_NARRATION_STYLE_SEEDS) {
    const style = await getNarrationStyleRow(seed.id);
    if (!style) continue;
    const envelope = buildImportedNarrationStyleEnvelopeV2({
      style,
      attemptId: `system-import:${style.id}:v2`,
    });
    await narrationAssetRepo.activateImportedNarrationStyle({ style, envelope });
  }
}

function parse(json: unknown): NarrationStyle {
  const raw = (typeof json === "string" ? JSON.parse(json) : json) as Record<string, unknown>;
  // Legacy rows may omit perspective.
  if (raw.perspective == null) raw.perspective = "external";
  return NarrationStyleSchema.parse(raw);
}

async function getNarrationStyleRow(id: string): Promise<NarrationStyle | null> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM narration_styles WHERE id = $1`,
    [id],
  );
  return rows[0] ? parse(rows[0].sheet_json) : null;
}

export async function listNarrationStyles(
  userId: string,
  options?: { selectable?: boolean },
): Promise<NarrationStylePublic[]> {
  await ensureSystemNarrationStyles();
  const viewer = await getUserAccessProfile(userId);
  const { rows } = await query<{
    sheet_json: unknown;
    owner_user_id: string | null;
    is_system: boolean | number;
    account_kind: string | null;
  }>(
    `SELECT n.sheet_json, n.owner_user_id, n.is_system, u.account_kind
     FROM narration_styles n
     LEFT JOIN users u ON u.id = n.owner_user_id
     ORDER BY n.is_system DESC, n.updated_at DESC`,
  );
  const accessible = rows
    .filter((row) => canAccessSharedAsset({
      viewer,
      ownerUserId: row.owner_user_id,
      ownerKind: normalizeAccountKind(row.account_kind),
      isSystem: Boolean(row.is_system),
    }))
    .map((row) => parse(row.sheet_json));
  const readyIds = await narrationAssetRepo.listReadyNarrationStyleIds(
    accessible.map((style) => style.id),
  );
  const ownedIds = accessible
    .filter((style) => style.ownerUserId === userId)
    .map((style) => style.id);
  const latestAttempts = await listLatestNarrationStyleAttemptsByIds(
    userId,
    ownedIds,
  );
  const publicStyles = await Promise.all(accessible.map(async (style) => {
    const compatibility = await narrationAssetRepo.getNarrationStyleCompatibility(
      style.id,
    );
    const selectable = readyIds.has(style.id);
    const mark = style.ownerUserId === userId
      ? reviewStateFromAttempt(latestAttempts.get(style.id) ?? null)
      : { reviewState: null, reviewAttemptId: null };
    return {
      ...toPublicNarrationStyle(style, {
        compatibility,
        selectable,
        upgradeAction: !style.isSystem && compatibility.status !== "ready"
          ? { label: "最新版に更新", targetSchemaVersion: 2 }
          : null,
      }),
      reviewState: mark.reviewState,
      reviewAttemptId: mark.reviewAttemptId,
    };
  }));
  return options?.selectable
    ? publicStyles.filter((style) => style.selectable)
    : publicStyles;
}

export async function getNarrationStyle(id: string): Promise<NarrationStyle | null> {
  await ensureSystemNarrationStyles();
  return getNarrationStyleRow(id);
}

export async function resolveReadyNarrationStyleForUser(
  userId: string,
  styleId?: string | null,
): Promise<{
  style: NarrationStyle;
  generation: AssetGeneration;
  envelope: ReturnType<typeof NarrationGenerationEnvelopeV2Schema.parse>;
  compiledPolicy: ReturnType<typeof compileNarrationPolicyV2>;
}> {
  await ensureSystemNarrationStyles();
  const requestedId = styleId ?? DEFAULT_NARRATION_STYLE_ID;
  const style = await getNarrationStyleRow(requestedId);
  if (!style) throw new Error("NARRATION_STYLE_NOT_FOUND");
  const viewer = await getUserAccessProfile(userId);
  const owner = style.ownerUserId
    ? await getUserAccessProfile(style.ownerUserId)
    : null;
  if (!canAccessSharedAsset({
    viewer,
    ownerUserId: style.ownerUserId,
    ownerKind: owner?.accountKind ?? "general",
    isSystem: style.isSystem,
  })) {
    throw new Error("NARRATION_STYLE_NOT_FOUND");
  }
  const generation = await narrationAssetRepo.getReadyNarrationStyleGeneration(
    requestedId,
  );
  if (!generation) throw new Error("NARRATION_STYLE_UPGRADE_REQUIRED");
  const envelope = NarrationGenerationEnvelopeV2Schema.parse(generation.content);
  return {
    style,
    generation,
    envelope,
    compiledPolicy: compileNarrationPolicyV2(envelope.definition),
  };
}

export async function deleteUserNarrationStyle(
  id: string,
  userId: string,
): Promise<boolean> {
  const cur = await getNarrationStyle(id);
  if (!cur || cur.isSystem || cur.ownerUserId !== userId) return false;
  await query(`DELETE FROM narration_styles WHERE id = $1`, [id]);
  return true;
}
