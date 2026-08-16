import { z } from "zod";
import {
  BattlefieldDefinitionV2Schema,
  type BattlefieldDefinitionV2,
  type BattlefieldDescriptionV2,
} from "./structured-battlefield.js";

export const BATTLEFIELD_DEFINITION_GAP_KEYS = [
  "atmosphere",
  "areaDetails",
  "objects",
  "effects",
  "evolutionAffordances",
] as const;
export type BattlefieldDefinitionGapKey =
  typeof BATTLEFIELD_DEFINITION_GAP_KEYS[number];

export type BattlefieldDefinitionSourceKind =
  | "create_instruction"
  | "revision_instruction"
  | "upgrade_description"
  | "import";

const LlmFillTextSchema = z.string().min(1).max(600);
const LlmOptionalTextSchema = z.string().max(600).nullable();
const LlmTerrainSchema = z.enum([
  "solid",
  "loose",
  "muddy",
  "water",
  "unstable",
  "elevated",
  "confined",
]);
const LlmMovementSchema = z.enum(["easy", "normal", "difficult", "impassable"]);
const LlmVisibilitySchema = z.enum(["open", "obscured", "blocked"]);
const LlmAudibilitySchema = z.enum(["clear", "muffled", "blocked"]);
const LlmCoverSchema = z.enum(["none", "partial", "full"]);
const LlmTriggerSchema = z.enum([
  "battle_start",
  "turn_start",
  "entered_area",
  "object_activated",
  "stagnation",
]);
const LlmDurationSchema = z.enum(["persistent", "short", "long"]);
const LlmTargetSchema = z.enum(["scene", "all_combatants", "area"]);
const LlmPressureSchema = z.enum([
  "weather_shift",
  "visibility_shift",
  "hazard_escalation",
  "structural_failure",
  "crowd_shift",
  "resource_emergence",
]);
const LlmScaleSchema = z.enum(["duel", "room", "site", "district", "expanse"]);

/**
 * Provider-facing battlefield fill. Descriptions are strings, duration/target
 * are flat enums, and area refs are names. Every key is required+nullable.
 */
export const BattlefieldDefinitionLlmFillV2Schema = z.object({
  atmosphere: z.array(z.string().min(1).max(120)).max(12).nullable(),
  scale: LlmScaleSchema.nullable(),
  genre: z.string().min(1).max(120).nullable(),
  areas: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    description: LlmFillTextSchema,
    terrain: LlmTerrainSchema,
    movement: LlmMovementSchema,
    visibility: LlmVisibilitySchema,
    audibility: LlmAudibilitySchema,
    surfaceConditions: z.array(z.string().min(1).max(120)).max(12),
  }).strict()).max(24).nullable(),
  objects: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    description: LlmFillTextSchema,
    area: z.string().min(1).max(120),
    portable: z.boolean(),
    usable: z.boolean(),
    cover: LlmCoverSchema,
    blocking: z.boolean(),
  }).strict()).max(48).nullable(),
  effects: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    description: LlmFillTextSchema,
    trigger: LlmTriggerSchema,
    duration: LlmDurationSchema,
    target: LlmTargetSchema,
    area: LlmOptionalTextSchema,
    observable: z.boolean(),
  }).strict()).max(24).nullable(),
  evolutionAffordances: z.array(z.object({
    id: z.string().min(1).max(80),
    pressure: LlmPressureSchema,
    description: LlmFillTextSchema,
  }).strict()).max(24).nullable(),
}).strict();
export type BattlefieldDefinitionLlmFillV2 = z.infer<
  typeof BattlefieldDefinitionLlmFillV2Schema
>;

function trimText(value: unknown, max: number): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text.slice(0, max) : null;
  }
  if (!value || typeof value !== "object") return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? trimText(text, max) : null;
}

function descriptionFromText(text: string, ref: string): BattlefieldDescriptionV2 {
  return { text: text.trim().slice(0, 600), sourceSupportRefs: [ref] };
}

function stableBattlefieldId(raw: unknown, prefix: string, index: number): string {
  const source = typeof raw === "string" ? raw : "";
  const cleaned = source.normalize("NFKC")
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^[^A-Za-z]+/, "")
    .replace(/-+$/g, "")
    .slice(0, 80);
  if (
    /^[A-Za-z][A-Za-z0-9._:-]*$/.test(cleaned) &&
    cleaned !== "character.a" &&
    cleaned !== "character.b"
  ) {
    return cleaned;
  }
  return `${prefix}.${index + 1}`;
}

function uniqueIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    let id = item.id;
    if (!id || seen.has(id) || id === "character.a" || id === "character.b") {
      id = `${prefix}.${index + 1}`;
    }
    if (seen.has(id)) id = `${id}-${seen.size + 1}`;
    seen.add(id);
    return { ...item, id: id.slice(0, 80) };
  });
}

function asEntryArray(value: unknown): Record<string, unknown>[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
}

function normalizeAreas(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const name = trimText(entry.name, 120);
    const description = trimText(entry.description, 600);
    const terrain = LlmTerrainSchema.safeParse(entry.terrain);
    if (!name || !description || !terrain.success) return [];
    const movement = LlmMovementSchema.safeParse(entry.movement);
    const visibility = LlmVisibilitySchema.safeParse(entry.visibility);
    const audibility = LlmAudibilitySchema.safeParse(entry.audibility);
    const surfaces = Array.isArray(entry.surfaceConditions)
      ? entry.surfaceConditions.flatMap((item) => {
        const text = trimText(item, 120);
        return text ? [text] : [];
      }).slice(0, 12)
      : [];
    return [{
      id: stableBattlefieldId(entry.id, "area", index),
      name,
      description,
      terrain: terrain.data,
      movement: movement.success ? movement.data : "normal",
      visibility: visibility.success ? visibility.data : "open",
      audibility: audibility.success ? audibility.data : "clear",
      surfaceConditions: surfaces,
    }];
  });
}

function normalizeObjects(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const label = trimText(entry.label, 120);
    const description = trimText(entry.description, 600);
    const area = trimText(entry.area, 120) ?? trimText(entry.areaId, 120);
    const cover = LlmCoverSchema.safeParse(entry.cover);
    if (!label || !description || !area || !cover.success) return [];
    return [{
      id: stableBattlefieldId(entry.id, "object", index),
      label,
      description,
      area,
      portable: entry.portable === true,
      usable: entry.usable !== false,
      cover: cover.data,
      blocking: entry.blocking === true,
    }];
  });
}

function normalizeEffects(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const label = trimText(entry.label, 120);
    const description = trimText(entry.description, 600);
    const trigger = LlmTriggerSchema.safeParse(entry.trigger);
    if (!label || !description || !trigger.success) return [];
    const duration = LlmDurationSchema.safeParse(entry.duration);
    const target = LlmTargetSchema.safeParse(entry.target);
    return [{
      id: stableBattlefieldId(entry.id, "effect", index),
      label,
      description,
      trigger: trigger.data,
      duration: duration.success ? duration.data : "persistent",
      target: target.success ? target.data : "scene",
      area: trimText(entry.area, 120),
      observable: entry.observable !== false,
    }];
  });
}

function normalizeEvolutions(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const description = trimText(entry.description, 600);
    const pressure = LlmPressureSchema.safeParse(entry.pressure);
    if (!description || !pressure.success) return [];
    return [{
      id: stableBattlefieldId(entry.id, "evolution", index),
      pressure: pressure.data,
      description,
    }];
  });
}

function normalizeLlmFillInput(raw: Record<string, unknown>) {
  const scale = LlmScaleSchema.safeParse(raw.scale);
  return {
    atmosphere: Array.isArray(raw.atmosphere)
      ? raw.atmosphere.flatMap((item) => {
        const text = trimText(item, 120);
        return text ? [text] : [];
      }).slice(0, 12)
      : raw.atmosphere == null ? null : raw.atmosphere,
    scale: scale.success ? scale.data : null,
    genre: trimText(raw.genre, 120),
    areas: normalizeAreas(raw.areas),
    objects: normalizeObjects(raw.objects),
    effects: normalizeEffects(raw.effects),
    evolutionAffordances: normalizeEvolutions(raw.evolutionAffordances),
  };
}

export function parseBattlefieldDefinitionGapFillV2(
  raw: unknown,
): BattlefieldDefinitionLlmFillV2 {
  const direct = BattlefieldDefinitionLlmFillV2Schema.safeParse(raw);
  if (direct.success) return direct.data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return BattlefieldDefinitionLlmFillV2Schema.parse(
      normalizeLlmFillInput(raw as Record<string, unknown>),
    );
  }
  return BattlefieldDefinitionLlmFillV2Schema.parse(raw);
}

export function listBattlefieldDefinitionGapsV2(
  definition: BattlefieldDefinitionV2,
): BattlefieldDefinitionGapKey[] {
  const gaps: BattlefieldDefinitionGapKey[] = [];
  if (definition.identity.atmosphere.length === 0) gaps.push("atmosphere");
  const defaultAreas = definition.areas.every((area) =>
    area.terrain === "solid" &&
    area.movement === "normal" &&
    area.visibility === "open" &&
    area.surfaceConditions.length === 0);
  if (defaultAreas) gaps.push("areaDetails");
  if (definition.objects.length === 0) gaps.push("objects");
  if (definition.effects.length === 0) gaps.push("effects");
  if (definition.evolutionAffordances.length === 0) {
    gaps.push("evolutionAffordances");
  }
  return gaps;
}

export function battlefieldDefinitionPreservedSnapshotV2(
  definition: BattlefieldDefinitionV2,
) {
  return {
    displayName: definition.identity.displayName,
    category: definition.identity.category,
    scale: definition.identity.scale,
    areas: definition.areas.map((area) => ({ id: area.id, name: area.name })),
    objects: definition.objects.map((object) => ({
      id: object.id,
      label: object.label,
    })),
    effects: definition.effects.map((effect) => ({
      id: effect.id,
      label: effect.label,
    })),
  };
}

function resolveAreaId(
  hint: string | null | undefined,
  areas: BattlefieldDefinitionV2["areas"],
): string {
  if (!hint) return areas[0]!.id;
  const exact = areas.find((area) => area.id === hint || area.name === hint);
  if (exact) return exact.id;
  const lowered = hint.toLowerCase();
  const fuzzy = areas.find((area) =>
    area.id.toLowerCase() === lowered || area.name.toLowerCase() === lowered);
  return fuzzy?.id ?? areas[0]!.id;
}

function linearTopology(
  areas: BattlefieldDefinitionV2["areas"],
): BattlefieldDefinitionV2["topology"] {
  return areas.slice(0, -1).flatMap((area, index) => {
    const next = areas[index + 1]!;
    return [
      {
        id: `edge.${index + 1}.forward`,
        fromAreaId: area.id,
        toAreaId: next.id,
        movement: "open" as const,
        sight: "clear" as const,
        sound: "clear" as const,
      },
      {
        id: `edge.${index + 1}.back`,
        fromAreaId: next.id,
        toAreaId: area.id,
        movement: "open" as const,
        sight: "clear" as const,
        sound: "clear" as const,
      },
    ];
  });
}

function mapDuration(value: "persistent" | "short" | "long") {
  if (value === "short") return { kind: "turns" as const, turns: 2 };
  if (value === "long") return { kind: "turns" as const, turns: 6 };
  return { kind: "persistent" as const };
}

function applyAreas(
  base: BattlefieldDefinitionV2,
  fill: BattlefieldDefinitionLlmFillV2,
  replace: boolean,
): BattlefieldDefinitionV2 {
  if (!fill.areas || fill.areas.length === 0) return base;
  if (replace) {
    const areas = uniqueIds(fill.areas.map((area, index) => ({
      id: stableBattlefieldId(area.id, "area", index),
      name: area.name,
      description: descriptionFromText(area.description, `fill.areas.${area.id}`),
      terrain: area.terrain,
      movement: area.movement,
      visibility: area.visibility,
      audibility: area.audibility,
      surfaceConditions: area.surfaceConditions,
    })), "area");
    return {
      ...base,
      areas,
      topology: linearTopology(areas),
      entryAreas: { a: areas[0]!.id, b: areas.at(-1)!.id },
    };
  }
  const areas = base.areas.map((area) => {
    const patch = fill.areas?.find((item) =>
      item.id === area.id || item.name === area.name);
    if (!patch) return area;
    return {
      ...area,
      description: descriptionFromText(patch.description, `fill.areas.${area.id}`),
      terrain: patch.terrain,
      movement: patch.movement,
      visibility: patch.visibility,
      audibility: patch.audibility,
      surfaceConditions: patch.surfaceConditions,
    };
  });
  return { ...base, areas };
}

function applyObjectsAndEffects(
  base: BattlefieldDefinitionV2,
  fill: BattlefieldDefinitionLlmFillV2,
  allow: (key: BattlefieldDefinitionGapKey) => boolean,
): BattlefieldDefinitionV2 {
  const next = { ...base };
  if (fill.objects && allow("objects")) {
    next.objects = uniqueIds(fill.objects.map((object, index) => ({
      id: stableBattlefieldId(object.id, "object", index),
      label: object.label,
      description: descriptionFromText(object.description, `fill.objects.${object.id}`),
      areaId: resolveAreaId(object.area, next.areas),
      presence: "present" as const,
      exposure: "public" as const,
      portable: object.portable,
      usable: object.usable,
      cover: object.cover,
      blocking: object.blocking,
      durability: "stable" as const,
    })), "object");
  }
  if (fill.effects && allow("effects")) {
    next.effects = uniqueIds(fill.effects.map((effect, index) => ({
      id: stableBattlefieldId(effect.id, "effect", index),
      label: effect.label,
      description: descriptionFromText(effect.description, `fill.effects.${effect.id}`),
      trigger: effect.trigger,
      duration: mapDuration(effect.duration),
      target: effect.target === "all_combatants"
        ? { kind: "all_combatants" as const }
        : effect.target === "area"
          ? { kind: "area" as const, areaId: resolveAreaId(effect.area, next.areas) }
          : { kind: "scene" as const },
      cancellation: "none" as const,
      observable: effect.observable,
      coefficientModifiers: {},
    })), "effect");
  }
  if (fill.evolutionAffordances && allow("evolutionAffordances")) {
    next.evolutionAffordances = uniqueIds(
      fill.evolutionAffordances.map((item, index) => ({
        id: stableBattlefieldId(item.id, "evolution", index),
        pressure: item.pressure,
        areaRefs: next.areas.map((area) => area.id),
        objectRefs: next.objects.slice(0, 12).map((object) => object.id),
        description: descriptionFromText(
          item.description,
          `fill.evolution.${item.id}`,
        ),
      })),
      "evolution",
    );
  }
  return next;
}

export function applyBattlefieldDefinitionGapFillV2(
  base: BattlefieldDefinitionV2,
  fill: BattlefieldDefinitionLlmFillV2,
  sourceKind: BattlefieldDefinitionSourceKind,
): BattlefieldDefinitionV2 {
  const gaps = new Set(listBattlefieldDefinitionGapsV2(base));
  const upgrade = sourceKind === "upgrade_description";
  const allow = (key: BattlefieldDefinitionGapKey) => !upgrade || gaps.has(key);
  let next = structuredClone(base);
  if (fill.atmosphere && allow("atmosphere")) {
    next = {
      ...next,
      identity: { ...next.identity, atmosphere: fill.atmosphere.slice(0, 12) },
    };
  }
  if (!upgrade && fill.scale) {
    next = { ...next, identity: { ...next.identity, scale: fill.scale } };
  }
  if (!upgrade && fill.genre) {
    next = { ...next, identity: { ...next.identity, genre: fill.genre } };
  }
  next = applyAreas(next, fill, !upgrade);
  next = applyObjectsAndEffects(next, fill, allow);
  return BattlefieldDefinitionV2Schema.parse(next);
}

export function restoreAuthoritativeBattlefieldDefinitionV2(
  base: BattlefieldDefinitionV2,
  candidate: BattlefieldDefinitionV2,
  sourceKind: BattlefieldDefinitionSourceKind,
): BattlefieldDefinitionV2 {
  const next: BattlefieldDefinitionV2 = {
    ...candidate,
    appearance: structuredClone(base.appearance),
    baseCoefficients: structuredClone(base.baseCoefficients),
    forbiddenDiscontinuities: base.forbiddenDiscontinuities.length > 0
      ? structuredClone(base.forbiddenDiscontinuities)
      : candidate.forbiddenDiscontinuities,
  };
  if (sourceKind === "upgrade_description") {
    next.identity = {
      ...structuredClone(base.identity),
      atmosphere: candidate.identity.atmosphere.length > 0
        ? candidate.identity.atmosphere
        : base.identity.atmosphere,
    };
  }
  return BattlefieldDefinitionV2Schema.parse(next);
}

export function deterministicBattlefieldSceneV2(
  projection: {
    displayName: string;
    facts: Array<{ supportRef: string; text: string }>;
  },
  preferredDescription?: string,
) {
  const facts = projection.facts.slice(0, 6);
  const text = (preferredDescription?.trim() ||
    facts.map((fact) => fact.text).join("。") ||
    projection.displayName).slice(0, 1200);
  const supportRefs = facts.map((fact) => fact.supportRef).slice(0, 12);
  return {
    description: text,
    segments: [{
      id: "scene-main",
      text,
      kind: "fact" as const,
      supportRefs: supportRefs.length > 0 ? supportRefs : ["identity.displayName"],
    }],
  };
}
