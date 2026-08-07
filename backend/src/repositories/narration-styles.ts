import {
  DEFAULT_NARRATION_STYLE_ID,
  NarrationStyleSchema,
  SYSTEM_NARRATION_STYLE_SEEDS,
  toPublicNarrationStyle,
  type NarrationStyle,
  type NarrationStylePublic,
} from "@kshiai/shared";
import { query, withTransaction } from "../db.js";
import { newId } from "../id.js";
import {
  canAccessSharedAsset,
  getUserAccessProfile,
  normalizeAccountKind,
} from "../account-access.js";

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
}

function parse(json: unknown): NarrationStyle {
  const raw = (typeof json === "string" ? JSON.parse(json) : json) as Record<string, unknown>;
  // Legacy rows may omit perspective.
  if (raw.perspective == null) raw.perspective = "external";
  return NarrationStyleSchema.parse(raw);
}

export async function listNarrationStyles(userId: string): Promise<NarrationStylePublic[]> {
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
  return rows
    .filter((row) => canAccessSharedAsset({
      viewer,
      ownerUserId: row.owner_user_id,
      ownerKind: normalizeAccountKind(row.account_kind),
      isSystem: Boolean(row.is_system),
    }))
    .map((row) => toPublicNarrationStyle(parse(row.sheet_json)));
}

export async function getNarrationStyle(id: string): Promise<NarrationStyle | null> {
  await ensureSystemNarrationStyles();
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM narration_styles WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return parse(row.sheet_json);
}

/** Resolve for a match: system, owned, or shared test-realm style; else default. */
export async function resolveNarrationStyleForUser(
  userId: string,
  styleId?: string | null,
): Promise<NarrationStyle> {
  await ensureSystemNarrationStyles();
  if (styleId) {
    const s = await getNarrationStyle(styleId);
    if (s) {
      const viewer = await getUserAccessProfile(userId);
      const owner = s.ownerUserId
        ? await getUserAccessProfile(s.ownerUserId)
        : null;
      if (canAccessSharedAsset({
        viewer,
        ownerUserId: s.ownerUserId,
        ownerKind: owner?.accountKind ?? "general",
        isSystem: s.isSystem,
      })) return s;
    }
  }
  return (
    (await getNarrationStyle(DEFAULT_NARRATION_STYLE_ID)) ?? {
      ...SYSTEM_NARRATION_STYLE_SEEDS[0]!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function saveNarrationStyle(style: NarrationStyle): Promise<void> {
  const json = JSON.stringify(style);
  await query(
    `INSERT INTO narration_styles
      (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           is_system = EXCLUDED.is_system,
           sheet_json = EXCLUDED.sheet_json,
           updated_at = EXCLUDED.updated_at`,
    [style.id, style.ownerUserId, style.isSystem, json, style.createdAt, style.updatedAt],
  );
}

export async function createUserNarrationStyle(
  userId: string,
  input: {
    displayName: string;
    description?: string;
    instruction: string;
    tags?: string[];
    perspective?: NarrationStyle["perspective"];
  },
): Promise<NarrationStyle> {
  const t = new Date().toISOString();
  const style: NarrationStyle = {
    id: newId("nst"),
    ownerUserId: userId,
    isSystem: false,
    displayName: input.displayName.trim(),
    description: (input.description ?? "").trim(),
    instruction: input.instruction.trim(),
    perspective: input.perspective ?? "external",
    tags: input.tags ?? [],
    createdAt: t,
    updatedAt: t,
  };
  await saveNarrationStyle(style);
  return style;
}

export async function updateUserNarrationStyle(
  id: string,
  userId: string,
  input: {
    displayName?: string;
    description?: string;
    instruction?: string;
    tags?: string[];
    perspective?: NarrationStyle["perspective"];
  },
): Promise<NarrationStyle | null> {
  const cur = await getNarrationStyle(id);
  if (!cur || cur.isSystem || cur.ownerUserId !== userId) return null;
  const next: NarrationStyle = {
    ...cur,
    displayName: input.displayName?.trim() || cur.displayName,
    description:
      input.description !== undefined
        ? input.description.trim()
        : cur.description,
    instruction: input.instruction?.trim() || cur.instruction,
    perspective: input.perspective ?? cur.perspective ?? "external",
    tags: input.tags ?? cur.tags,
    updatedAt: new Date().toISOString(),
  };
  await saveNarrationStyle(next);
  return next;
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
