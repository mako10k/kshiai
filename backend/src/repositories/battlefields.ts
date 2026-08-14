import {
  BattlefieldPresetSchema,
  SYSTEM_PRESET_SEEDS,
  toPublicPreset,
  BattlefieldGenerationEnvelopeV2Schema,
  assertBattlefieldGenerationReadyV2,
  type BattlefieldPreset,
} from "@kshiai/shared";
import { query, withTransaction } from "../db.js";
import { newId } from "../id.js";
import {
  canAccessSharedAsset,
  getUserAccessProfile,
  normalizeAccountKind,
} from "../account-access.js";
import type { AssetGeneration } from "./asset-generations.js";
import * as battlefieldAssetRepo from "./battlefield-assets-v2.js";
import { buildImportedBattlefieldEnvelopeV2 } from "../services/battlefield-authoring-service.js";

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
  } else {
    // Backfill missing system images / visual paths from seeds by category.
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
      if (preset.appearance.imageUrl &&
          !preset.appearance.imageUrl.startsWith("/battlefields/")) {
        continue;
      }
      const next: BattlefieldPreset = {
        ...preset,
        appearance: { ...preset.appearance, imageUrl: seed.appearance.imageUrl },
        updatedAt: new Date().toISOString(),
      };
      await query(
        `UPDATE battlefields SET sheet_json = $1, updated_at = $2 WHERE id = $3`,
        [JSON.stringify(next), next.updatedAt, r.id],
      );
    }
  }

  const systemRows = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM battlefields WHERE is_system = TRUE`,
  );
  for (const row of systemRows.rows) {
    const preset = parse(row);
    if (await battlefieldAssetRepo.getReadyBattlefieldGeneration(preset.id)) continue;
    await battlefieldAssetRepo.activateImportedBattlefield({
      preset,
      envelope: buildImportedBattlefieldEnvelopeV2({
        preset,
        attemptId: `system-import:${preset.id}`,
      }),
    });
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
  selectable?: boolean;
}): Promise<ReturnType<typeof toPublicPreset>[]> {
  await ensureSystemPresets();
  const viewer = await getUserAccessProfile(opts.userId);
  const { rows } = await query<{
    sheet_json: unknown;
    owner_user_id: string | null;
    is_system: boolean | number;
    account_kind: string | null;
  }>(
    `SELECT b.sheet_json, b.owner_user_id, b.is_system, u.account_kind
     FROM battlefields b
     LEFT JOIN users u ON u.id = b.owner_user_id
     ORDER BY b.is_system DESC, b.updated_at DESC`,
  );

  let presets = rows
    .filter((row) => canAccessSharedAsset({
      viewer,
      ownerUserId: row.owner_user_id,
      ownerKind: normalizeAccountKind(row.account_kind),
      isSystem: Boolean(row.is_system),
    }))
    .map(parse);
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
  const readyIds = await battlefieldAssetRepo.listReadyBattlefieldIds(
    presets.map((preset) => preset.id),
  );
  if (opts.selectable) {
    presets = presets.filter((preset) => readyIds.has(preset.id));
  }
  return Promise.all(presets.map(async (preset) => {
    const compatibility = await battlefieldAssetRepo.getBattlefieldCompatibility(
      preset.id,
    );
    return {
      ...toPublicPreset(preset),
      compatibility,
      selectable: readyIds.has(preset.id),
      upgradeAction: !preset.isSystem && preset.ownerUserId === opts.userId &&
          compatibility.status !== "ready"
        ? { label: "この戦場を最新版に更新", targetSchemaVersion: 2 }
        : null,
    };
  }));
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

export async function getPresetForUser(
  id: string,
  userId: string,
): Promise<BattlefieldPreset | null> {
  await ensureSystemPresets();
  const viewer = await getUserAccessProfile(userId);
  const { rows } = await query<{
    sheet_json: unknown;
    owner_user_id: string | null;
    is_system: boolean | number;
    account_kind: string | null;
  }>(
    `SELECT b.sheet_json, b.owner_user_id, b.is_system, u.account_kind
     FROM battlefields b
     LEFT JOIN users u ON u.id = b.owner_user_id
     WHERE b.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row || !canAccessSharedAsset({
    viewer,
    ownerUserId: row.owner_user_id,
    ownerKind: normalizeAccountKind(row.account_kind),
    isSystem: Boolean(row.is_system),
  })) return null;
  return parse(row);
}

export async function importPreset(preset: BattlefieldPreset): Promise<void> {
  await battlefieldAssetRepo.activateImportedBattlefield({
    preset,
    envelope: buildImportedBattlefieldEnvelopeV2({
      preset,
      attemptId: `explicit-import:${preset.id}`,
    }),
  });
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
  await importPreset(copy);
  return copy;
}

export type ReadyBattlefieldPreset = {
  preset: BattlefieldPreset;
  generation: AssetGeneration;
  envelope: ReturnType<typeof assertBattlefieldGenerationReadyV2>;
};

export async function getReadyPresetForUser(
  id: string,
  userId: string,
): Promise<ReadyBattlefieldPreset | null> {
  const preset = await getPresetForUser(id, userId);
  if (!preset) return null;
  const generation = await battlefieldAssetRepo.getReadyBattlefieldGeneration(id);
  if (!generation) return null;
  return {
    preset,
    generation,
    envelope: assertBattlefieldGenerationReadyV2(
      BattlefieldGenerationEnvelopeV2Schema.parse(generation.content),
    ),
  };
}

export async function pickRandomSystemPreset(): Promise<ReadyBattlefieldPreset | null> {
  await ensureSystemPresets();
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM battlefields WHERE is_system = TRUE`,
  );
  const ready: ReadyBattlefieldPreset[] = [];
  for (const row of rows) {
    const preset = parse(row);
    const generation = await battlefieldAssetRepo.getReadyBattlefieldGeneration(preset.id);
    if (!generation) continue;
    ready.push({
      preset,
      generation,
      envelope: assertBattlefieldGenerationReadyV2(
        BattlefieldGenerationEnvelopeV2Schema.parse(generation.content),
      ),
    });
  }
  if (ready.length === 0) return null;
  return ready[Math.floor(Math.random() * ready.length)]!;
}
