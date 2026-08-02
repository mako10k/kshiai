import {
  BattlefieldPresetSchema,
  SYSTEM_PRESET_SEEDS,
  toPublicPreset,
  type BattlefieldPreset,
} from "@kshiai/shared";
import { getDb } from "../db.js";
import { newId } from "../id.js";

export function ensureSystemPresets(): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM battlefields WHERE is_system = 1`)
    .get() as { c: number };

  if (row.c === 0) {
    const t = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO battlefields (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES (?, NULL, 1, ?, ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (const seed of SYSTEM_PRESET_SEEDS) {
        const preset: BattlefieldPreset = {
          ...seed,
          id: newId("bfp"),
          ownerUserId: null,
          isSystem: true,
          createdAt: t,
          updatedAt: t,
          baseCoefficients: seed.baseCoefficients ?? {},
        };
        insert.run(preset.id, JSON.stringify(preset), t, t);
      }
    });
    tx();
    return;
  }

  // Backfill missing system images / visual paths from seeds by category
  const byCategory = new Map(
    SYSTEM_PRESET_SEEDS.map((s) => [s.category, s] as const),
  );
  const rows = db
    .prepare(`SELECT id, sheet_json FROM battlefields WHERE is_system = 1`)
    .all() as { id: string; sheet_json: string }[];
  const update = db.prepare(
    `UPDATE battlefields SET sheet_json = ?, updated_at = ? WHERE id = ?`,
  );
  for (const r of rows) {
    const preset = BattlefieldPresetSchema.parse(JSON.parse(r.sheet_json));
    const seed = byCategory.get(preset.category);
    if (!seed?.appearance.imageUrl) continue;
    if (preset.appearance.imageUrl === seed.appearance.imageUrl) continue;
    if (preset.appearance.imageUrl && !preset.appearance.imageUrl.startsWith("/battlefields/")) {
      // keep custom overrides
      continue;
    }
    if (!preset.appearance.imageUrl || preset.appearance.imageUrl.startsWith("/battlefields/")) {
      const next: BattlefieldPreset = {
        ...preset,
        appearance: {
          ...preset.appearance,
          imageUrl: seed.appearance.imageUrl,
        },
        updatedAt: new Date().toISOString(),
      };
      update.run(JSON.stringify(next), next.updatedAt, r.id);
    }
  }
}

function parse(row: { sheet_json: string }): BattlefieldPreset {
  return BattlefieldPresetSchema.parse(JSON.parse(row.sheet_json));
}

export function listPresets(opts: {
  userId: string;
  q?: string;
  includeSystem?: boolean;
}): ReturnType<typeof toPublicPreset>[] {
  ensureSystemPresets();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT sheet_json FROM battlefields
       WHERE is_system = 1 OR owner_user_id = ?
       ORDER BY is_system DESC, updated_at DESC`,
    )
    .all(opts.userId) as { sheet_json: string }[];

  let presets = rows.map(parse);
  if (opts.includeSystem === false) {
    presets = presets.filter((p) => !p.isSystem);
  }
  if (opts.q?.trim()) {
    const needle = opts.q.trim().toLowerCase();
    presets = presets.filter(
      (p) =>
        p.displayName.toLowerCase().includes(needle) ||
        p.narrativeBlurb.toLowerCase().includes(needle) ||
        p.category.includes(needle) ||
        p.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }
  return presets.map(toPublicPreset);
}

export function getPreset(id: string): BattlefieldPreset | null {
  ensureSystemPresets();
  const row = getDb()
    .prepare(`SELECT sheet_json FROM battlefields WHERE id = ?`)
    .get(id) as { sheet_json: string } | undefined;
  if (!row) return null;
  return parse(row);
}

export function savePreset(preset: BattlefieldPreset): void {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM battlefields WHERE id = ?`)
    .get(preset.id);
  const json = JSON.stringify(preset);
  if (existing) {
    db.prepare(
      `UPDATE battlefields SET sheet_json = ?, updated_at = ?, owner_user_id = ?, is_system = ?
       WHERE id = ?`,
    ).run(
      json,
      preset.updatedAt,
      preset.ownerUserId,
      preset.isSystem ? 1 : 0,
      preset.id,
    );
  } else {
    db.prepare(
      `INSERT INTO battlefields (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      preset.id,
      preset.ownerUserId,
      preset.isSystem ? 1 : 0,
      json,
      preset.createdAt,
      preset.updatedAt,
    );
  }
}

export function deletePreset(id: string, ownerUserId: string): boolean {
  const r = getDb()
    .prepare(
      `DELETE FROM battlefields WHERE id = ? AND owner_user_id = ? AND is_system = 0`,
    )
    .run(id, ownerUserId);
  return r.changes > 0;
}

export function copyPreset(
  id: string,
  ownerUserId: string,
): BattlefieldPreset | null {
  const src = getPreset(id);
  if (!src) return null;
  // system or own
  if (!src.isSystem && src.ownerUserId !== ownerUserId) return null;
  const t = new Date().toISOString();
  const copy: BattlefieldPreset = {
    ...src,
    id: newId("bfp"),
    ownerUserId,
    isSystem: false,
    displayName: `${src.displayName} の写し`,
    tags: [...src.tags, "copy"],
    createdAt: t,
    updatedAt: t,
    baseCoefficients: { ...src.baseCoefficients },
    terrainHints: [...src.terrainHints],
    obstacleHints: [...src.obstacleHints],
    conditionHints: [...src.conditionHints],
  };
  savePreset(copy);
  return copy;
}

export function pickRandomSystemPreset(): BattlefieldPreset | null {
  ensureSystemPresets();
  const rows = getDb()
    .prepare(`SELECT sheet_json FROM battlefields WHERE is_system = 1`)
    .all() as { sheet_json: string }[];
  if (rows.length === 0) return null;
  return parse(rows[Math.floor(Math.random() * rows.length)]!);
}
