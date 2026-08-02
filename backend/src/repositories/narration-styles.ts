import {
  DEFAULT_NARRATION_STYLE_ID,
  NarrationStyleSchema,
  SYSTEM_NARRATION_STYLE_SEEDS,
  toPublicNarrationStyle,
  type NarrationStyle,
  type NarrationStylePublic,
} from "@kshiai/shared";
import { getDb } from "../db.js";
import { newId } from "../id.js";

let seeded = false;

export function ensureSystemNarrationStyles(): void {
  if (seeded) return;
  const db = getDb();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO narration_styles
      (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
     VALUES (?, NULL, 1, ?, ?, ?)`,
  );
  for (const seed of SYSTEM_NARRATION_STYLE_SEEDS) {
    const full: NarrationStyle = {
      ...seed,
      createdAt: now,
      updatedAt: now,
    };
    insert.run(seed.id, JSON.stringify(full), now, now);
  }
  seeded = true;
}

function parse(json: string): NarrationStyle {
  return NarrationStyleSchema.parse(JSON.parse(json));
}

export function listNarrationStyles(userId: string): NarrationStylePublic[] {
  ensureSystemNarrationStyles();
  const rows = getDb()
    .prepare(
      `SELECT sheet_json FROM narration_styles
       WHERE is_system = 1 OR owner_user_id = ?
       ORDER BY is_system DESC, updated_at DESC`,
    )
    .all(userId) as { sheet_json: string }[];
  return rows.map((r) => toPublicNarrationStyle(parse(r.sheet_json)));
}

export function getNarrationStyle(id: string): NarrationStyle | null {
  ensureSystemNarrationStyles();
  const row = getDb()
    .prepare(`SELECT sheet_json FROM narration_styles WHERE id = ?`)
    .get(id) as { sheet_json: string } | undefined;
  if (!row) return null;
  return parse(row.sheet_json);
}

/** Resolve for a match: system or owned by user; else default. */
export function resolveNarrationStyleForUser(
  userId: string,
  styleId?: string | null,
): NarrationStyle {
  ensureSystemNarrationStyles();
  if (styleId) {
    const s = getNarrationStyle(styleId);
    if (s && (s.isSystem || s.ownerUserId === userId)) return s;
  }
  return (
    getNarrationStyle(DEFAULT_NARRATION_STYLE_ID) ?? {
      ...SYSTEM_NARRATION_STYLE_SEEDS[0]!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
}

export function saveNarrationStyle(style: NarrationStyle): void {
  const db = getDb();
  const json = JSON.stringify(style);
  const existing = db
    .prepare(`SELECT id FROM narration_styles WHERE id = ?`)
    .get(style.id);
  if (existing) {
    db.prepare(
      `UPDATE narration_styles
       SET sheet_json = ?, updated_at = ?, owner_user_id = ?, is_system = ?
       WHERE id = ?`,
    ).run(
      json,
      style.updatedAt,
      style.ownerUserId,
      style.isSystem ? 1 : 0,
      style.id,
    );
  } else {
    db.prepare(
      `INSERT INTO narration_styles
        (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      style.id,
      style.ownerUserId,
      style.isSystem ? 1 : 0,
      json,
      style.createdAt,
      style.updatedAt,
    );
  }
}

export function createUserNarrationStyle(
  userId: string,
  input: {
    displayName: string;
    description?: string;
    instruction: string;
    tags?: string[];
  },
): NarrationStyle {
  const t = new Date().toISOString();
  const style: NarrationStyle = {
    id: newId("nst"),
    ownerUserId: userId,
    isSystem: false,
    displayName: input.displayName.trim(),
    description: (input.description ?? "").trim(),
    instruction: input.instruction.trim(),
    tags: input.tags ?? [],
    createdAt: t,
    updatedAt: t,
  };
  saveNarrationStyle(style);
  return style;
}

export function updateUserNarrationStyle(
  id: string,
  userId: string,
  input: {
    displayName?: string;
    description?: string;
    instruction?: string;
    tags?: string[];
  },
): NarrationStyle | null {
  const cur = getNarrationStyle(id);
  if (!cur || cur.isSystem || cur.ownerUserId !== userId) return null;
  const next: NarrationStyle = {
    ...cur,
    displayName: input.displayName?.trim() || cur.displayName,
    description:
      input.description !== undefined
        ? input.description.trim()
        : cur.description,
    instruction: input.instruction?.trim() || cur.instruction,
    tags: input.tags ?? cur.tags,
    updatedAt: new Date().toISOString(),
  };
  saveNarrationStyle(next);
  return next;
}

export function deleteUserNarrationStyle(
  id: string,
  userId: string,
): boolean {
  const cur = getNarrationStyle(id);
  if (!cur || cur.isSystem || cur.ownerUserId !== userId) return false;
  getDb().prepare(`DELETE FROM narration_styles WHERE id = ?`).run(id);
  return true;
}
