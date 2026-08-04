import { z } from "zod";
import {
  DEFAULT_RATING,
  isProvisional,
  normalizeRecord,
  ratingForDisplay,
  type CharacterRecord,
  type RatingDisplayContext,
} from "./rating.js";
import { cacheBustMediaUrl } from "./media.js";
import {
  CharacterImprovementMemoSchema,
  type CharacterImprovementMemo,
} from "./character-improvement.js";

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

/** A temporary parameter change; battle state drifts back toward the sheet value. */
export const ParameterDeltaSchema = z.object({
  parameter: ParamKeySchema,
  delta: z.number(),
});
export type ParameterDelta = z.infer<typeof ParameterDeltaSchema>;

export const SkillEffectSchema = ParameterDeltaSchema.extend({
  target: z.enum(["self", "foe"]).default("foe"),
});
export type SkillEffect = z.infer<typeof SkillEffectSchema>;

/** Character-specific fallback attack; HP damage is only the default profile. */
export const BasicAttackProfileSchema = z.object({
  name: z.string().default("基本アクション"),
  description: z.string().default("消耗時にも使える、そのキャラクターらしい基本行動。"),
  targetParameter: ParamKeySchema.default("hp"),
  scalingParameter: ParamKeySchema.default("atk"),
  resistanceParameter: ParamKeySchema.default("def"),
  power: z.number().default(0.75),
  element: z.string().optional(),
});
export type BasicAttackProfile = z.infer<typeof BasicAttackProfileSchema>;

export function defaultBasicAttack(): BasicAttackProfile {
  return BasicAttackProfileSchema.parse({});
}

/**
 * Prefer a non-empty patch list; otherwise keep the current list.
 * Prevents LLM partial updates from wiping skills/traits with `[]`.
 */
export function coalesceNonEmptyList<T>(
  patch: T[] | null | undefined,
  current: T[],
): T[] {
  return Array.isArray(patch) && patch.length > 0 ? patch : current;
}

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  costMp: z.number().int().nonnegative().default(0),
  costStamina: z.number().int().nonnegative().default(0),
  /** Relative power used by the engine (hidden from UI). */
  power: z.number().default(1),
  kind: z
    .enum(["attack", "magic", "defend", "support", "special", "status"])
    .default("attack"),
  element: z.string().optional(),
  /** Temporary changes applied after the skill resolves. */
  effects: z.array(SkillEffectSchema).max(4).optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const EquipmentSchema = z.object({
  name: z.string(),
  description: z.string(),
  atkBonus: z.number().default(0),
  defBonus: z.number().default(0),
  magBonus: z.number().default(0),
  /** Battle-start temporary changes. Positive effects require a tradeoff. */
  effects: z.array(ParameterDeltaSchema).max(4).optional(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const AppearanceSchema = z.object({
  summary: z.string(),
  visualPrompt: z.string(),
  /** Currently selected portrait (public). */
  imageUrl: z.string().nullable().optional(),
  /**
   * Previous portrait after a re-generation (owner toggle / undo).
   * Not required for battle; optional on legacy sheets.
   */
  previousImageUrl: z.string().nullable().optional(),
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

/** Private identity/profile context used by character-generation LLMs. */
export const CharacterIdentitySchema = z.object({
  /** Legal or birth name. Keep null when the source does not establish one. */
  realName: z.string().min(1).nullable().default(null),
  /** Nicknames and commonly used names. */
  nicknames: z.array(z.string().min(1)).default([]),
  /** Names/pronouns the character uses to refer to themself. */
  selfNames: z.array(z.string().min(1)).default([]),
  /** Titles, aliases, and epithets. */
  epithets: z.array(z.string().min(1)).default([]),
  /** Free-form so fictional identities and unknown values remain representable. */
  gender: z.string().min(1).nullable().default(null),
  /** Free-form for apparent ages, ranges, and non-human lifespans. */
  age: z.string().min(1).nullable().default(null),
});
export type CharacterIdentity = z.infer<typeof CharacterIdentitySchema>;

export function defaultCharacterIdentity(): CharacterIdentity {
  return CharacterIdentitySchema.parse({});
}

/**
 * Owner-only one-step undo buffer for chat / improvement adjustments.
 * Stores mutable profile fields only (not records, ids, or memos).
 */
export const CharacterRevisionSnapshotSchema = z.object({
  savedAt: z.string(),
  /** Short Japanese UI label, e.g. 会話調整前. */
  label: z.string().max(40).default("調整前"),
  displayName: z.string().min(1),
  identity: CharacterIdentitySchema.optional(),
  tags: z.array(z.string()).default([]),
  appearance: AppearanceSchema,
  traits: z.array(z.string()).default([]),
  parameters: ParametersSchema,
  basicAttack: BasicAttackProfileSchema.optional(),
  skills: z.array(SkillSchema).default([]),
  weapon: EquipmentSchema.nullable(),
  armor: EquipmentSchema.nullable(),
  combatFlags: CombatFlagsSchema,
  narrativeBlurb: z.string(),
});
export type CharacterRevisionSnapshot = z.infer<
  typeof CharacterRevisionSnapshotSchema
>;

/** Full server-side character sheet. */
export const CharacterSheetSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  displayName: z.string().min(1),
  /** Separate from the public display name and omitted from public DTOs. */
  identity: CharacterIdentitySchema.optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Soft-delete timestamp; excluded from play lists when set. */
  deletedAt: z.string().nullable().optional(),
  appearance: AppearanceSchema,
  traits: z.array(z.string()).default([]),
  parameters: ParametersSchema,
  basicAttack: BasicAttackProfileSchema.optional(),
  skills: z.array(SkillSchema).default([]),
  weapon: EquipmentSchema.nullable(),
  armor: EquipmentSchema.nullable(),
  combatFlags: CombatFlagsSchema,
  narrativeBlurb: z.string(),
  /**
   * Public ranked record: cross-account matches only.
   * Shown to everyone.
   */
  record: CharacterRecordSchema.optional(),
  /**
   * Overall record including same-account sparring.
   * Visible only to the character owner.
   */
  recordOverall: CharacterRecordSchema.optional(),
  /**
   * Owner-only coaching memo from battle-history analysis.
   * Never included in public character DTOs.
   */
  improvementMemo: CharacterImprovementMemoSchema.optional(),
  /**
   * Last pre-adjustment profile snapshot for one-step restore.
   * Owner-only; not exposed on public combat DTOs beyond restore flags.
   */
  revisionSnapshot: CharacterRevisionSnapshotSchema.optional().nullable(),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;
export type { CharacterImprovementMemo };

/** Capture mutable profile fields before a chat/improvement apply. */
export function captureRevisionSnapshot(
  sheet: CharacterSheet,
  label = "調整前",
): CharacterRevisionSnapshot {
  const hydrated = ensureCharacterCombatProperties(
    ensureCharacterIdentityProperties(sheet),
  );
  return CharacterRevisionSnapshotSchema.parse({
    savedAt: new Date().toISOString(),
    label,
    displayName: hydrated.displayName,
    identity: hydrated.identity,
    tags: [...hydrated.tags],
    appearance: { ...hydrated.appearance },
    traits: [...hydrated.traits],
    parameters: { ...hydrated.parameters },
    basicAttack: hydrated.basicAttack
      ? { ...hydrated.basicAttack }
      : undefined,
    skills: hydrated.skills.map((skill) => ({
      ...skill,
      effects: skill.effects ? skill.effects.map((e) => ({ ...e })) : [],
    })),
    weapon: hydrated.weapon
      ? {
          ...hydrated.weapon,
          effects: hydrated.weapon.effects
            ? hydrated.weapon.effects.map((e) => ({ ...e }))
            : [],
        }
      : null,
    armor: hydrated.armor
      ? {
          ...hydrated.armor,
          effects: hydrated.armor.effects
            ? hydrated.armor.effects.map((e) => ({ ...e }))
            : [],
        }
      : null,
    combatFlags: { ...hydrated.combatFlags },
    narrativeBlurb: hydrated.narrativeBlurb,
  });
}

/** Apply a revision snapshot; clears the undo buffer. */
export function restoreRevisionSnapshot(
  sheet: CharacterSheet,
  snapshot: CharacterRevisionSnapshot,
): CharacterSheet {
  return ensureCharacterCombatProperties(
    ensureCharacterIdentityProperties({
      ...sheet,
      displayName: snapshot.displayName,
      identity: snapshot.identity,
      tags: snapshot.tags,
      appearance: snapshot.appearance,
      traits: snapshot.traits,
      parameters: snapshot.parameters,
      basicAttack: snapshot.basicAttack,
      skills: snapshot.skills,
      weapon: snapshot.weapon,
      armor: snapshot.armor,
      combatFlags: snapshot.combatFlags,
      narrativeBlurb: snapshot.narrativeBlurb,
      revisionSnapshot: null,
      updatedAt: new Date().toISOString(),
    }),
  );
}

/** Fill combat fields introduced after a character was originally saved. */
export function ensureCharacterCombatProperties(
  sheet: CharacterSheet,
): CharacterSheet {
  const equipment = (value: Equipment | null): Equipment | null =>
    value ? { ...value, effects: value.effects ?? [] } : null;
  return {
    ...sheet,
    basicAttack: sheet.basicAttack ?? defaultBasicAttack(),
    skills: sheet.skills.map((skill) => ({
      ...skill,
      effects: skill.effects ?? [],
    })),
    weapon: equipment(sheet.weapon),
    armor: equipment(sheet.armor),
  };
}

/** Fill private profile fields introduced after a character was saved. */
export function ensureCharacterIdentityProperties(
  sheet: CharacterSheet,
): CharacterSheet {
  return {
    ...sheet,
    identity: CharacterIdentitySchema.parse(sheet.identity ?? {}),
  };
}

const RecordPublicSchema = z.object({
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  gamesPlayed: z.number(),
  rating: z.number(),
  provisional: z.boolean(),
});

/** Client-safe character card (no combat parameters). */
export const CharacterPublicSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  displayName: z.string(),
  /** Public name classifications; gender and age remain private. */
  names: z.object({
    realName: z.string().nullable(),
    nicknames: z.array(z.string()),
    selfNames: z.array(z.string()),
    epithets: z.array(z.string()),
  }),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  appearance: z.object({
    summary: z.string(),
    imageUrl: z.string().nullable().optional(),
    /**
     * Owner-only: previous portrait for side-by-side preview / toggle.
     * Omitted for non-owners.
     */
    previousImageUrl: z.string().nullable().optional(),
  }),
  traits: z.array(z.string()),
  basicAttackName: z.string(),
  basicAttackDescription: z.string(),
  skillNames: z.array(z.string()),
  skillSummaries: z.array(z.object({ name: z.string(), description: z.string() })),
  weaponName: z.string().nullable(),
  weaponDescription: z.string().nullable(),
  armorName: z.string().nullable(),
  armorDescription: z.string().nullable(),
  narrativeBlurb: z.string(),
  /** Public ranked record (other accounts only). Always present. */
  record: RecordPublicSchema,
  /**
   * Overall record including self-account matches.
   * Only set when the viewer is the owner.
   */
  recordOverall: RecordPublicSchema.optional(),
  /**
   * Owner-only: one-step undo is available after a chat/improvement apply.
   */
  canRestoreRevision: z.boolean().optional(),
  /** Owner-only ISO timestamp of the saved pre-adjust snapshot. */
  revisionSavedAt: z.string().nullable().optional(),
  /** Owner-only short label for the undo button. */
  revisionLabel: z.string().nullable().optional(),
  /** Owner-only: can toggle between current and previous portrait. */
  canToggleImage: z.boolean().optional(),
});
export type CharacterPublic = z.infer<typeof CharacterPublicSchema>;

export function ensureRecord(sheet: CharacterSheet): CharacterRecord {
  return normalizeRecord(sheet.record);
}

export function ensureRecordOverall(sheet: CharacterSheet): CharacterRecord {
  // Legacy sheets only had `record` (often same-owner heavy) — seed overall from it.
  return normalizeRecord(sheet.recordOverall ?? sheet.record);
}

function toRecordDto(
  record: CharacterRecord,
  population?: RatingDisplayContext["public"],
) {
  return {
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    gamesPlayed: record.gamesPlayed,
    rating: ratingForDisplay(record.rating, population),
    provisional: isProvisional(record.gamesPlayed),
  };
}

/**
 * @param viewerUserId When equal to owner, include private overall stats.
 */
export function toPublicCharacter(
  sheet: CharacterSheet,
  viewerUserId?: string | null,
  ratingDisplay?: RatingDisplayContext,
): CharacterPublic {
  sheet = ensureCharacterIdentityProperties(
    ensureCharacterCombatProperties(sheet),
  );
  const record = ensureRecord(sheet);
  const isOwner = Boolean(viewerUserId && viewerUserId === sheet.ownerUserId);
  return {
    id: sheet.id,
    ownerUserId: sheet.ownerUserId,
    displayName: sheet.displayName,
    names: {
      realName: sheet.identity?.realName ?? null,
      nicknames: sheet.identity?.nicknames ?? [],
      selfNames: sheet.identity?.selfNames ?? [],
      epithets: sheet.identity?.epithets ?? [],
    },
    tags: sheet.tags,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    appearance: {
      summary: sheet.appearance.summary,
      imageUrl: cacheBustMediaUrl(
        sheet.appearance.imageUrl ?? null,
        sheet.updatedAt,
      ),
      previousImageUrl: isOwner
        ? cacheBustMediaUrl(
            sheet.appearance.previousImageUrl ?? null,
            // Separate bust key so primary/previous don't share a stale cache.
            `${sheet.updatedAt}:prev`,
          )
        : undefined,
    },
    traits: sheet.traits,
    basicAttackName: sheet.basicAttack?.name ?? defaultBasicAttack().name,
    basicAttackDescription:
      sheet.basicAttack?.description ?? defaultBasicAttack().description,
    skillNames: sheet.skills.map((s) => s.name),
    skillSummaries: sheet.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
    })),
    weaponName: sheet.weapon?.name ?? null,
    weaponDescription: sheet.weapon?.description ?? null,
    armorName: sheet.armor?.name ?? null,
    armorDescription: sheet.armor?.description ?? null,
    narrativeBlurb: sheet.narrativeBlurb,
    record: toRecordDto(record, ratingDisplay?.public),
    recordOverall: isOwner
      ? toRecordDto(ensureRecordOverall(sheet), ratingDisplay?.overall)
      : undefined,
    canRestoreRevision: isOwner
      ? Boolean(sheet.revisionSnapshot)
      : undefined,
    revisionSavedAt: isOwner
      ? (sheet.revisionSnapshot?.savedAt ?? null)
      : undefined,
    revisionLabel: isOwner
      ? (sheet.revisionSnapshot?.label ?? null)
      : undefined,
    canToggleImage: isOwner
      ? Boolean(
          sheet.appearance.imageUrl && sheet.appearance.previousImageUrl,
        )
      : undefined,
  };
}

/**
 * Swap the active portrait with the previous one (toggle).
 * Returns null when either side is missing.
 */
export function toggleCharacterPortrait(
  sheet: CharacterSheet,
): CharacterSheet | null {
  const current = sheet.appearance.imageUrl ?? null;
  const previous = sheet.appearance.previousImageUrl ?? null;
  if (!current || !previous) return null;
  return {
    ...sheet,
    appearance: {
      ...sheet.appearance,
      imageUrl: previous,
      previousImageUrl: current,
    },
    updatedAt: new Date().toISOString(),
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
