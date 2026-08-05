import { z } from "zod";
import {
  CharacterIdentitySchema,
  defaultBasicAttack,
  defaultCharacterIdentity,
  type CharacterSheet,
} from "./character.js";
import type {
  NarrationFocus,
  NarrationPerspective,
} from "./narration-perspective.js";

const NamedDescriptionSchema = z.object({
  name: z.string(),
  description: z.string(),
});

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
  }));
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
