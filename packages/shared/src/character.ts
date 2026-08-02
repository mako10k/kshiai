import { z } from "zod";
import {
  DEFAULT_RATING,
  isProvisional,
  normalizeRecord,
  type CharacterRecord,
} from "./rating.js";
import { cacheBustMediaUrl } from "./media.js";

/** Internal combat parameters — never sent to normal clients. */
export const ParamKeySchema = z.enum([
  "hp",
  "maxHp",
  "mp",
  "maxMp",
  "stamina",
  "maxStamina",
  "atk",
  "def",
  "spd",
  "mag",
  "res",
  "focus",
  "luck",
]);
export type ParamKey = z.infer<typeof ParamKeySchema>;

export const ParametersSchema = z.record(ParamKeySchema, z.number());
export type Parameters = z.infer<typeof ParametersSchema>;

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  costMp: z.number().int().nonnegative().default(0),
  costStamina: z.number().int().nonnegative().default(0),
  /** Relative power used by the engine (hidden from UI). */
  power: z.number().default(1),
  kind: z.enum(["attack", "magic", "defend", "support", "special"]).default("attack"),
  element: z.string().optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const EquipmentSchema = z.object({
  name: z.string(),
  description: z.string(),
  atkBonus: z.number().default(0),
  defBonus: z.number().default(0),
  magBonus: z.number().default(0),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const AppearanceSchema = z.object({
  summary: z.string(),
  visualPrompt: z.string(),
  imageUrl: z.string().nullable().optional(),
});
export type Appearance = z.infer<typeof AppearanceSchema>;

export const CombatFlagsSchema = z.object({
  canFight: z.boolean().default(true),
  irreversibleIncapacitated: z.boolean().default(false),
});
export type CombatFlags = z.infer<typeof CombatFlagsSchema>;

export const CharacterRecordSchema = z.object({
  wins: z.number().int().nonnegative().default(0),
  losses: z.number().int().nonnegative().default(0),
  draws: z.number().int().nonnegative().default(0),
  gamesPlayed: z.number().int().nonnegative().default(0),
  rating: z.number().default(DEFAULT_RATING),
  provisional: z.boolean().default(true),
});

/** Full server-side character sheet. */
export const CharacterSheetSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  displayName: z.string().min(1),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Soft-delete timestamp; excluded from play lists when set. */
  deletedAt: z.string().nullable().optional(),
  appearance: AppearanceSchema,
  traits: z.array(z.string()).default([]),
  parameters: ParametersSchema,
  skills: z.array(SkillSchema).default([]),
  weapon: EquipmentSchema.nullable(),
  armor: EquipmentSchema.nullable(),
  combatFlags: CombatFlagsSchema,
  narrativeBlurb: z.string(),
  record: CharacterRecordSchema.optional(),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

/** Client-safe character card (no combat parameters). */
export const CharacterPublicSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  displayName: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  appearance: z.object({
    summary: z.string(),
    imageUrl: z.string().nullable().optional(),
  }),
  traits: z.array(z.string()),
  skillNames: z.array(z.string()),
  weaponName: z.string().nullable(),
  armorName: z.string().nullable(),
  narrativeBlurb: z.string(),
  /** Public match record / rating (provisional flagged). */
  record: z.object({
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    gamesPlayed: z.number(),
    rating: z.number(),
    provisional: z.boolean(),
  }),
});
export type CharacterPublic = z.infer<typeof CharacterPublicSchema>;

export function ensureRecord(sheet: CharacterSheet): CharacterRecord {
  return normalizeRecord(sheet.record);
}

export function toPublicCharacter(sheet: CharacterSheet): CharacterPublic {
  const record = ensureRecord(sheet);
  return {
    id: sheet.id,
    ownerUserId: sheet.ownerUserId,
    displayName: sheet.displayName,
    tags: sheet.tags,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    appearance: {
      summary: sheet.appearance.summary,
      imageUrl: cacheBustMediaUrl(
        sheet.appearance.imageUrl ?? null,
        sheet.updatedAt,
      ),
    },
    traits: sheet.traits,
    skillNames: sheet.skills.map((s) => s.name),
    weaponName: sheet.weapon?.name ?? null,
    armorName: sheet.armor?.name ?? null,
    narrativeBlurb: sheet.narrativeBlurb,
    record: {
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
      gamesPlayed: record.gamesPlayed,
      rating: record.rating,
      provisional: isProvisional(record.gamesPlayed),
    },
  };
}

export function defaultParameters(overrides: Partial<Parameters> = {}): Parameters {
  return {
    hp: 100,
    maxHp: 100,
    mp: 40,
    maxMp: 40,
    stamina: 50,
    maxStamina: 50,
    atk: 12,
    def: 10,
    spd: 10,
    mag: 10,
    res: 10,
    focus: 10,
    luck: 10,
    ...overrides,
  };
}
