import { z } from "zod";
import { cacheBustMediaUrl } from "./media.js";
import { BattlefieldSemanticSeedSchema } from "./semantic-state.js";

const COEFF_MIN = 0.25;
const COEFF_MAX = 2.5;

function clampCoeff(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(COEFF_MAX, Math.max(COEFF_MIN, value));
}

/** High-level preset categories (examples, not exhaustive). */
export const BattlefieldCategorySchema = z.enum([
  "forest",
  "arena",
  "sea",
  "urban",
  "school",
  "mountain",
  "ruins",
  "custom",
]);
export type BattlefieldCategory = z.infer<typeof BattlefieldCategorySchema>;

export const CATEGORY_LABELS: Record<BattlefieldCategory, string> = {
  forest: "森",
  arena: "闘技場",
  sea: "海",
  urban: "市街地",
  school: "学校",
  mountain: "山岳",
  ruins: "廃墟",
  custom: "その他",
};

export const BattlefieldAppearanceSchema = z.object({
  summary: z.string(),
  visualPrompt: z.string(),
  imageUrl: z.string().nullable().optional(),
});
export type BattlefieldAppearance = z.infer<typeof BattlefieldAppearanceSchema>;

/**
 * User-managed battlefield preset (template).
 * Internal coefficients are not shown in normal UI.
 */
export const BattlefieldPresetSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable(),
  isSystem: z.boolean().default(false),
  displayName: z.string().min(1),
  category: BattlefieldCategorySchema.default("custom"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  appearance: BattlefieldAppearanceSchema,
  /** High-level terrain vocabulary for LLM concretization. */
  terrainHints: z.array(z.string()).default([]),
  /** Typical obstacles (trees, desks, wreckage…). */
  obstacleHints: z.array(z.string()).default([]),
  /** Ambient conditions (rain, night, crowd…). */
  conditionHints: z.array(z.string()).default([]),
  /** Hidden base multipliers for the engine. */
  baseCoefficients: z.record(z.string(), z.number()).default({}),
  narrativeBlurb: z.string(),
});
export type BattlefieldPreset = z.infer<typeof BattlefieldPresetSchema>;

/** Client-safe preset card (no raw coefficients). */
export const BattlefieldPresetPublicSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable(),
  isSystem: z.boolean(),
  displayName: z.string(),
  category: BattlefieldCategorySchema,
  categoryLabel: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  appearance: z.object({
    summary: z.string(),
    imageUrl: z.string().nullable().optional(),
  }),
  terrainHints: z.array(z.string()),
  obstacleHints: z.array(z.string()),
  conditionHints: z.array(z.string()),
  narrativeBlurb: z.string(),
  compatibility: z.object({
    status: z.enum(["unsupported", "upgrading", "upgrade_failed", "ready"]),
    schemaVersion: z.number().int().positive().nullable(),
    currentGenerationId: z.string().nullable(),
    reasonCode: z.string().nullable(),
  }).strict().optional(),
  selectable: z.boolean().optional(),
  upgradeAction: z.object({
    label: z.string(),
    targetSchemaVersion: z.number().int().positive(),
  }).strict().nullable().optional(),
});
export type BattlefieldPresetPublic = z.infer<typeof BattlefieldPresetPublicSchema>;

/**
 * Concrete battlefield for one match — terrain/obstacles/conditions fixed at start.
 */
export const BattlefieldInstanceSchema = z.object({
  sourcePresetId: z.string().nullable().default(null),
  displayName: z.string(),
  category: BattlefieldCategorySchema.default("custom"),
  scene: z.string(),
  terrain: z.string(),
  obstacles: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  /** Hidden engine multipliers. */
  coefficients: z.record(z.string(), z.number()).default({}),
  narrativeSetup: z.string(),
  /** Structured, immutable seed for the match's mutable semantic state. */
  semanticSeed: BattlefieldSemanticSeedSchema.optional(),
  appearance: BattlefieldAppearanceSchema.optional(),
  /** Present for deterministic structured preset compilation. */
  compilerContract: z.string().min(1).max(120).optional(),
  areas: z.array(z.object({
    id: z.string(),
    name: z.string(),
  }).strict()).max(24).optional(),
  entryAreas: z.object({ a: z.string(), b: z.string() }).strict().optional(),
  topology: z.array(z.object({
    id: z.string(),
    fromAreaId: z.string(),
    toAreaId: z.string(),
    movement: z.enum(["open", "difficult", "blocked"]),
    sight: z.enum(["clear", "obscured", "blocked"]),
    sound: z.enum(["clear", "muffled", "blocked"]),
  }).strict()).max(64).optional(),
  evolutionAffordances: z.array(z.object({
    id: z.string(),
    pressure: z.enum([
      "weather_shift",
      "visibility_shift",
      "hazard_escalation",
      "structural_failure",
      "crowd_shift",
      "resource_emergence",
    ]),
    areaRefs: z.array(z.string()).max(12),
    objectRefs: z.array(z.string()).max(12),
    description: z.object({
      text: z.string(),
      sourceSupportRefs: z.array(z.string()),
    }).strict(),
  }).strict()).max(24).optional(),
  forbiddenDiscontinuities: z.array(z.string()).max(24).optional(),
});
export type BattlefieldInstance = z.infer<typeof BattlefieldInstanceSchema>;

export const BattlefieldInstancePublicSchema = z.object({
  sourcePresetId: z.string().nullable(),
  displayName: z.string(),
  category: BattlefieldCategorySchema,
  categoryLabel: z.string(),
  scene: z.string(),
  terrain: z.string(),
  obstacles: z.array(z.string()),
  conditions: z.array(z.string()),
  narrativeSetup: z.string(),
  imageUrl: z.string().nullable().optional(),
});
export type BattlefieldInstancePublic = z.infer<typeof BattlefieldInstancePublicSchema>;

export function toPublicPreset(p: BattlefieldPreset): BattlefieldPresetPublic {
  return {
    id: p.id,
    ownerUserId: p.ownerUserId,
    isSystem: p.isSystem,
    displayName: p.displayName,
    category: p.category,
    categoryLabel: CATEGORY_LABELS[p.category] ?? p.category,
    tags: p.tags,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    appearance: {
      summary: p.appearance.summary,
      imageUrl: cacheBustMediaUrl(
        p.appearance.imageUrl ?? null,
        p.updatedAt,
      ),
    },
    terrainHints: p.terrainHints,
    obstacleHints: p.obstacleHints,
    conditionHints: p.conditionHints,
    narrativeBlurb: p.narrativeBlurb,
  };
}

/** Static art for system categories under frontend/public/battlefields/. */
export function battlefieldCategoryImageUrl(
  category: string | undefined | null,
): string | null {
  switch (category) {
    case "forest":
      return "/battlefields/forest.jpg";
    case "arena":
      return "/battlefields/arena.jpg";
    case "sea":
      return "/battlefields/sea.jpg";
    case "urban":
      return "/battlefields/urban.jpg";
    case "school":
      return "/battlefields/school.jpg";
    default:
      return null;
  }
}

export function resolveBattlefieldImageUrl(
  inst: Pick<BattlefieldInstance, "category" | "appearance" | "narrativeSetup">,
): string | null {
  const raw =
    inst.appearance?.imageUrl ??
    battlefieldCategoryImageUrl(inst.category);
  return cacheBustMediaUrl(
    raw,
    inst.narrativeSetup?.slice(0, 24) || Date.now(),
  );
}

export function toPublicInstance(inst: BattlefieldInstance): BattlefieldInstancePublic {
  return {
    sourcePresetId: inst.sourcePresetId,
    displayName: inst.displayName,
    category: inst.category,
    categoryLabel: CATEGORY_LABELS[inst.category] ?? inst.category,
    scene: inst.scene,
    terrain: inst.terrain,
    obstacles: inst.obstacles,
    conditions: inst.conditions,
    narrativeSetup: inst.narrativeSetup,
    imageUrl: resolveBattlefieldImageUrl(inst),
  };
}

export function clampCoefficientMap(
  coeffs: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!coeffs) return out;
  for (const [k, v] of Object.entries(coeffs)) {
    out[k] = clampCoeff(v);
  }
  return out;
}

export function mergeCoefficients(
  base: Record<string, number>,
  overlay: Record<string, number> | undefined,
): Record<string, number> {
  return clampCoefficientMap({ ...base, ...(overlay ?? {}) });
}

/** Built-in system preset templates (ids assigned at seed time). */
export const SYSTEM_PRESET_SEEDS: Array<
  Omit<BattlefieldPreset, "id" | "ownerUserId" | "createdAt" | "updatedAt" | "isSystem">
> = [
  {
    displayName: "深い森",
    category: "forest",
    tags: ["自然", "遮蔽"],
    appearance: {
      summary: "樹々が空を覆う湿った森",
      visualPrompt: "dense misty forest battlefield, roots and undergrowth, anime landscape",
      imageUrl: "/battlefields/forest.jpg",
    },
    terrainHints: ["ぬかるみ", "木陰", "急な斜面"],
    obstacleHints: ["倒木", "太い幹", "茂み"],
    conditionHints: ["霧", "鳥の鳴き声"],
    baseCoefficients: { damage: 0.95, wind: 0.9, focus: 0.85, spd: 0.9 },
    narrativeBlurb: "視界が悪く、足場の悪い森。奇襲と機動が鍵になる。",
  },
  {
    displayName: "石造りの闘技場",
    category: "arena",
    tags: ["観客", "平坦"],
    appearance: {
      summary: "円形の闘技場と熱狂する観客",
      visualPrompt: "stone colosseum arena, cheering crowd, dramatic lighting, anime",
      imageUrl: "/battlefields/arena.jpg",
    },
    terrainHints: ["砂地", "石畳", "中央広場"],
    obstacleHints: ["壊れた柱", "落ちた盾"],
    conditionHints: ["歓声", "まばゆい陽光"],
    baseCoefficients: { damage: 1.05, focus: 1.1, luck: 1.05 },
    narrativeBlurb: "正面から向き合うための舞台。観客の視線が両者を奮い立たせる。",
  },
  {
    displayName: "荒れ狂う海辺",
    category: "sea",
    tags: ["水辺", "強風"],
    appearance: {
      summary: "岩礁と砕ける波の海岸",
      visualPrompt: "stormy rocky seashore battlefield, waves crashing, spray, anime",
      imageUrl: "/battlefields/sea.jpg",
    },
    terrainHints: ["滑る岩", "浅瀬", "潮溜まり"],
    obstacleHints: ["流木", "破船の破片"],
    conditionHints: ["強風", "飛沫", "潮の満ち引き"],
    baseCoefficients: { damage: 1.0, wind: 1.3, fire: 0.7, water: 1.2, spd: 0.85 },
    narrativeBlurb: "足元は絶えず揺れ、炎は吹き消えやすい。水と風が支配する。",
  },
  {
    displayName: "夜の市街地",
    category: "urban",
    tags: ["路地", "人工物"],
    appearance: {
      summary: "ネオンと路地が交錯する夜の街",
      visualPrompt: "night city street battlefield, neon alleys, wet asphalt, anime urban",
      imageUrl: "/battlefields/urban.jpg",
    },
    terrainHints: ["アスファルト", "路地", "屋上への階段"],
    obstacleHints: ["車", "ゴミ箱", "看板", "消火栓"],
    conditionHints: ["ネオン", "遠くのサイレン", "人通りの残響"],
    baseCoefficients: { damage: 1.0, spd: 1.1, focus: 0.95, luck: 1.1 },
    narrativeBlurb: "遮蔽物が多く機動戦向き。思わぬ障害が攻防を狂わせる。",
  },
  {
    displayName: "放課後の学校",
    category: "school",
    tags: ["屋内", "日常の異化"],
    appearance: {
      summary: "静まり返った校舎と広い運動場",
      visualPrompt: "after-school empty campus battlefield, classroom corridor and yard, anime",
      imageUrl: "/battlefields/school.jpg",
    },
    terrainHints: ["廊下", "階段", "校庭の砂"],
    obstacleHints: ["机と椅子", "ロッカー", "鉄棒"],
    conditionHints: ["鐘の残響", "西日", "無人の静けさ"],
    baseCoefficients: { damage: 0.9, focus: 1.05, mag: 1.05 },
    narrativeBlurb: "日常の場所が戦場に変わる違和感。狭い通路では大技が使いづらい。",
  },
];
