import {
  BattlefieldPresetSchema,
  SYSTEM_PRESET_SEEDS,
  toPublicPreset,
  type BattlefieldPreset,
} from "@kshiai/shared";
import { query, withTransaction } from "../db.js";
import { newId } from "../id.js";

let seedPromise: Promise<void> | null = null;

export function ensureSystemPresets(): Promise<void> {
  seedPromise ??= seedSystemPresets().catch((error) => {
    seedPromise = null;
    throw error;
  });
  return seedPromise;
}

async function seedSystemPresets(): Promise<void> {
  const count = await query<{ c: number | string }>(
    `SELECT COUNT(*) AS c FROM battlefields WHERE is_system = TRUE`,
  );
  const row = count.rows[0];

  if (Number(row?.c ?? 0) === 0) {
    const t = new Date().toISOString();
    await withTransaction(async (connection) => {
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
        await connection.query(
          `INSERT INTO battlefields
            (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
           VALUES ($1, NULL, TRUE, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [preset.id, JSON.stringify(preset), t, t],
        );
      }
    });
    return;
  }

  // Backfill missing system images / visual paths from seeds by category
  const byCategory = new Map(
    SYSTEM_PRESET_SEEDS.map((s) => [s.category, s] as const),
  );
  const { rows } = await query<{ id: string; sheet_json: unknown }>(
    `SELECT id, sheet_json FROM battlefields WHERE is_system = TRUE`,
  );
  for (const r of rows) {
    const preset = BattlefieldPresetSchema.parse(
      typeof r.sheet_json === "string" ? JSON.parse(r.sheet_json) : r.sheet_json,
    );
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
      await query(
        `UPDATE battlefields SET sheet_json = $1, updated_at = $2 WHERE id = $3`,
        [JSON.stringify(next), next.updatedAt, r.id],
      );
    }
  }
}

function parse(row: { sheet_json: unknown }): BattlefieldPreset {
  return BattlefieldPresetSchema.parse(
    typeof row.sheet_json === "string" ? JSON.parse(row.sheet_json) : row.sheet_json,
  );
}

export async function listPresets(opts: {
  userId: string;
  q?: string;
  includeSystem?: boolean;
}): Promise<ReturnType<typeof toPublicPreset>[]> {
  await ensureSystemPresets();
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM battlefields
     WHERE is_system = TRUE OR owner_user_id = $1
     ORDER BY is_system DESC, updated_at DESC`,
    [opts.userId],
  );

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

export async function getPreset(id: string): Promise<BattlefieldPreset | null> {
  await ensureSystemPresets();
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM battlefields WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return parse(row);
}

export async function savePreset(preset: BattlefieldPreset): Promise<void> {
  const json = JSON.stringify(preset);
  await query(
    `INSERT INTO battlefields
      (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           is_system = EXCLUDED.is_system,
           sheet_json = EXCLUDED.sheet_json,
           updated_at = EXCLUDED.updated_at`,
    [
      preset.id,
      preset.ownerUserId,
      preset.isSystem,
      json,
      preset.createdAt,
      preset.updatedAt,
    ],
  );
}

export async function deletePreset(id: string, ownerUserId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM battlefields
     WHERE id = $1 AND owner_user_id = $2 AND is_system = FALSE`,
    [id, ownerUserId],
  );
  return result.rowCount > 0;
}

export async function copyPreset(
  id: string,
  ownerUserId: string,
): Promise<BattlefieldPreset | null> {
  const src = await getPreset(id);
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
  await savePreset(copy);
  return copy;
}

export async function pickRandomSystemPreset(): Promise<BattlefieldPreset | null> {
  await ensureSystemPresets();
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM battlefields WHERE is_system = TRUE`,
  );
  if (rows.length === 0) return null;
  return parse(rows[Math.floor(Math.random() * rows.length)]!);
}
