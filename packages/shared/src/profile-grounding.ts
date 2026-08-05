import { z } from "zod";
import {
  CharacterIdentitySchema,
  defaultBasicAttack,
  defaultCharacterIdentity,
  type CharacterSheet,
} from "./character.js";
import type { BattleWorldState, WorldPlacement } from "./battle-world.js";
import type {
  NarrationFocus,
  NarrationPerspective,
} from "./narration-perspective.js";

const NamedDescriptionSchema = z.object({
  name: z.string(),
  description: z.string(),
});

/**
 * Ephemeral battle-time correction to one immutable profile field.
 * The engine supplies natural-language current state so open-ended objects do
 * not require an exhaustive item/status taxonomy.
 */
export const BattleProfileStateOverrideSchema = z.object({
  profileField: z.enum(["appearance", "weapon", "armor"]),
  itemLabel: z.string().min(1).max(120),
  statement: z.string().min(1).max(400),
}).strict();
export type BattleProfileStateOverride = z.infer<
  typeof BattleProfileStateOverrideSchema
>;

/**
 * Immutable, mechanics-free own-profile source for one character agent.
 * Canonical non-null fields outrank continuity text produced in earlier turns.
 */
export const CharacterSelfProfileAnchorSchema = z.object({
  schemaVersion: z.literal(1),
  displayName: z.string().min(1),
  identity: CharacterIdentitySchema,
  tags: z.array(z.string()),
  appearanceSummary: z.string(),
  traits: z.array(z.string()),
  narrativeBlurb: z.string(),
  basicAction: NamedDescriptionSchema,
  skills: z.array(NamedDescriptionSchema),
  equipment: z.object({
    weapon: NamedDescriptionSchema.nullable(),
    armor: NamedDescriptionSchema.nullable(),
  }),
  currentStateOverrides: z.array(BattleProfileStateOverrideSchema).max(16)
    .optional(),
});
export type CharacterSelfProfileAnchor = z.infer<
  typeof CharacterSelfProfileAnchorSchema
>;

/**
 * Minimal identity hints for presentation-only narration. They are not
 * observations and must never be written into character cognition or world state.
 */
export const NarratorRenderingProfileAnchorSchema = z.object({
  schemaVersion: z.literal(1),
  side: z.enum(["a", "b"]),
  displayName: z.string().min(1),
  selfNames: z.array(z.string().min(1)),
  gender: z.string().min(1).nullable(),
  age: z.string().min(1).nullable(),
  appearanceSummary: z.string(),
  currentStateOverrides: z.array(BattleProfileStateOverrideSchema).max(16)
    .optional(),
});
export type NarratorRenderingProfileAnchor = z.infer<
  typeof NarratorRenderingProfileAnchorSchema
>;

export type NarratorRenderingProfileAnchors = Readonly<{
  a?: NarratorRenderingProfileAnchor;
  b?: NarratorRenderingProfileAnchor;
}>;

export type NarratorProfileAccessMode =
  | "self"
  | "opponent"
  | "omniscient"
  | "external";

export function narratorProfileAccessMode(input: {
  perspective: NarrationPerspective;
  focus: NarrationFocus;
}): NarratorProfileAccessMode {
  const resolved = input.perspective === "fluid"
    ? input.focus
    : input.perspective;
  return resolved === "foe"
    ? "opponent"
    : resolved === "both"
      ? "omniscient"
      : resolved;
}

function deepFreezeProfile<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreezeProfile(child);
  }
  return value;
}

export function buildCharacterSelfProfileAnchor(
  sheet: CharacterSheet,
  currentStateOverrides: readonly BattleProfileStateOverride[] = [],
): CharacterSelfProfileAnchor {
  const basicAction = sheet.basicAttack ?? defaultBasicAttack();
  return deepFreezeProfile(CharacterSelfProfileAnchorSchema.parse({
    schemaVersion: 1,
    displayName: sheet.displayName,
    identity: sheet.identity ?? defaultCharacterIdentity(),
    tags: sheet.tags,
    appearanceSummary: sheet.appearance.summary,
    traits: sheet.traits,
    narrativeBlurb: sheet.narrativeBlurb,
    basicAction: {
      name: basicAction.name,
      description: basicAction.description,
    },
    skills: sheet.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
    })),
    equipment: {
      weapon: sheet.weapon
        ? { name: sheet.weapon.name, description: sheet.weapon.description }
        : null,
      armor: sheet.armor
        ? { name: sheet.armor.name, description: sheet.armor.description }
        : null,
    },
    ...(currentStateOverrides.length > 0
      ? { currentStateOverrides: [...currentStateOverrides] }
      : {}),
  }));
}

export function canonicalSelfReference(
  profile: CharacterSelfProfileAnchor,
): string | null {
  return profile.identity.selfNames[0] ?? null;
}

export function buildNarratorRenderingProfileAnchor(input: {
  sheet: CharacterSheet;
  side: "a" | "b";
  currentStateOverrides?: readonly BattleProfileStateOverride[];
}): NarratorRenderingProfileAnchor {
  const identity = input.sheet.identity ?? defaultCharacterIdentity();
  return deepFreezeProfile(NarratorRenderingProfileAnchorSchema.parse({
    schemaVersion: 1,
    side: input.side,
    displayName: input.sheet.displayName,
    selfNames: identity.selfNames,
    gender: identity.gender,
    age: identity.age,
    appearanceSummary: input.sheet.appearance.summary,
    ...(input.currentStateOverrides?.length
      ? { currentStateOverrides: [...input.currentStateOverrides] }
      : {}),
  }));
}

function profileSource(
  sourceRef: string,
): { side: "a" | "b"; profileField: BattleProfileStateOverride["profileField"] } |
  null {
  const match = /^profile:(a|b):(appearance|weapon|armor)$/.exec(sourceRef);
  if (!match) return null;
  return {
    side: match[1] as "a" | "b",
    profileField: match[2] as BattleProfileStateOverride["profileField"],
  };
}

function profileItemLabel(input: {
  side: "a" | "b";
  canonicalLabel: string | null;
  observerLabels: { a?: string; b?: string };
  description: string;
}): string {
  const descriptionHead = input.description
    .split(/[。\n]/u)[0]
    ?.trim()
    .slice(0, 120);
  return input.canonicalLabel ??
    input.observerLabels[input.side]?.trim().slice(0, 120) ??
    (descriptionHead || "プロフィール由来の物");
}

function isBaselinePlacement(input: {
  placement: WorldPlacement;
  profileField: BattleProfileStateOverride["profileField"];
  ownerId: string;
}): boolean {
  if (input.profileField === "weapon") {
    return input.placement.type === "held" &&
      input.placement.holderId === input.ownerId;
  }
  return input.placement.type === "worn" &&
    input.placement.wearerId === input.ownerId;
}

function currentProfileItemStatement(input: {
  worldState: BattleWorldState;
  side: "a" | "b";
  profileField: BattleProfileStateOverride["profileField"];
  itemLabel: string;
  placement: WorldPlacement;
}): string {
  const ownerId = `character.${input.side}`;
  const counterpartId = input.side === "a" ? "character.b" : "character.a";
  const baseline = input.profileField === "appearance"
    ? "身につけて"
    : "装備して";
  const suffix = `現在は元のプロフィールどおりに${baseline}いない。`;
  if (input.placement.type === "held") {
    const holder = input.placement.holderId === ownerId
      ? "自分が手に持っている"
      : input.placement.holderId === counterpartId
        ? "相手が手に持っている"
        : "別の者が保持している";
    return `${input.itemLabel}は${holder}。${suffix}`;
  }
  if (input.placement.type === "worn") {
    const wearer = input.placement.wearerId === ownerId
      ? "自分が別の形で身につけている"
      : input.placement.wearerId === counterpartId
        ? "相手が身につけている"
        : "別の者が身につけている";
    return `${input.itemLabel}は${wearer}。${suffix}`;
  }
  if (input.placement.type === "scene") {
    const area = input.worldState.areas[input.placement.areaId]?.label ?? "場面内";
    return `${input.itemLabel}は${area}にある。${suffix}`;
  }
  if (input.placement.type === "attached") {
    return `${input.itemLabel}は別の対象に取り付けられている。${suffix}`;
  }
  return `${input.itemLabel}は現在その場に存在しない。${suffix}`;
}

/**
 * Derive current battle presentation from canonical world facts without
 * mutating the persisted CharacterSheet. Restoring the baseline placement
 * automatically removes the override.
 */
export function deriveBattleProfileStateOverrides(input: {
  worldState?: BattleWorldState | null;
  side: "a" | "b";
}): BattleProfileStateOverride[] {
  if (!input.worldState) return [];
  const ownerId = `character.${input.side}`;
  return Object.entries(input.worldState.entities)
    .flatMap(([entityId, entity]) => {
      const source = entity.objectProfile
        ? profileSource(entity.objectProfile.sourceRef)
        : null;
      if (!source || source.side !== input.side ||
          isBaselinePlacement({
            placement: entity.placement,
            profileField: source.profileField,
            ownerId,
          })) {
        return [];
      }
      const itemLabel = profileItemLabel({
        side: input.side,
        canonicalLabel: entity.objectProfile!.canonicalLabel,
        observerLabels: entity.objectProfile!.observerLabels,
        description: entity.objectProfile!.description,
      });
      return [{
        entityId,
        value: BattleProfileStateOverrideSchema.parse({
          profileField: source.profileField,
          itemLabel,
          statement: currentProfileItemStatement({
            worldState: input.worldState!,
            side: input.side,
            profileField: source.profileField,
            itemLabel,
            placement: entity.placement,
          }),
        }),
      }];
    })
    .sort((a, b) => a.value.profileField.localeCompare(b.value.profileField) ||
      a.entityId.localeCompare(b.entityId))
    .slice(0, 16)
    .map((entry) => entry.value);
}

/**
 * Character-limited narration gets only its viewpoint character's anchor.
 * External and omniscient renderers may use both anchors, but only as wording
 * constraints; the provider contract forbids announcing an anchor-only fact.
 */
export function selectNarratorRenderingProfileAnchors(input: {
  mode: NarratorProfileAccessMode;
  sideA: NarratorRenderingProfileAnchor;
  sideB: NarratorRenderingProfileAnchor;
}): NarratorRenderingProfileAnchors {
  const selected = input.mode === "self"
    ? { a: input.sideA }
    : input.mode === "opponent"
      ? { b: input.sideB }
      : { a: input.sideA, b: input.sideB };
  return deepFreezeProfile(structuredClone(selected));
}
