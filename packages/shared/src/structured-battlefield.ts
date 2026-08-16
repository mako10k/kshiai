import { z } from "zod";
import {
  BattlefieldCategorySchema,
  BattlefieldInstanceSchema,
  BattlefieldPresetSchema,
  clampCoefficientMap,
  type BattlefieldInstance,
  type BattlefieldPreset,
} from "./battlefield.js";
import {
  AssetClaimValidationReceiptV1Schema,
  AssetDisclosurePolicyV1Schema,
  AssetPublicPresentationV2Schema,
  assetGenerationEnvelopeV2Schema,
  type AssetClaimValidationReceiptV1,
  type AssetDisclosurePolicyV1,
  type AssetPublicPresentationV2,
} from "./structured-assets.js";

export const BATTLEFIELD_DEFINITION_SCHEMA_VERSION = 2 as const;
export const BATTLEFIELD_SCENE_PROJECTION_VERSION = 2 as const;
export const BATTLEFIELD_INSTANCE_COMPILER_V2 = "battlefield-instance-v2" as const;
export const BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT =
  "battlefield-scene-claim-validator-v1" as const;
export const REQUIRED_BATTLEFIELD_COMPILERS_V2 = [
  { consumer: "battlefield-legacy-read-model", version: 2 },
  { consumer: "battlefield-scene-card", version: 2 },
  { consumer: "battlefield-scene-claim-validator", version: 1 },
  { consumer: "battlefield-instance", version: 2 },
  { consumer: "battlefield-semantic-seed", version: 2 },
  { consumer: "battlefield-image-brief", version: 2 },
] as const;

const StableBattlefieldIdSchema = z.string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/)
  .refine(
    (value) => value !== "character.a" && value !== "character.b",
    "character entity ids are reserved",
  );

export const BattlefieldCoefficientKeySchema = z.enum([
  "damage",
  "heal",
  "spd",
  "neutral",
  "fire",
  "water",
  "wind",
  "earth",
  "light",
  "dark",
]);
export type BattlefieldCoefficientKey = z.infer<
  typeof BattlefieldCoefficientKeySchema
>;

export const BattlefieldDescriptionV2Schema = z.object({
  text: z.string().min(1).max(600),
  sourceSupportRefs: z.array(z.string().min(1).max(160)).max(8),
}).strict();
export type BattlefieldDescriptionV2 = z.infer<
  typeof BattlefieldDescriptionV2Schema
>;

export const BattlefieldAreaV2Schema = z.object({
  id: StableBattlefieldIdSchema,
  name: z.string().min(1).max(120),
  description: BattlefieldDescriptionV2Schema,
  terrain: z.enum([
    "solid",
    "loose",
    "muddy",
    "water",
    "unstable",
    "elevated",
    "confined",
  ]),
  movement: z.enum(["easy", "normal", "difficult", "impassable"]),
  visibility: z.enum(["open", "obscured", "blocked"]),
  audibility: z.enum(["clear", "muffled", "blocked"]),
  surfaceConditions: z.array(z.string().min(1).max(120)).max(12),
}).strict();
export type BattlefieldAreaV2 = z.infer<typeof BattlefieldAreaV2Schema>;

export const BattlefieldTopologyEdgeV2Schema = z.object({
  id: StableBattlefieldIdSchema,
  fromAreaId: StableBattlefieldIdSchema,
  toAreaId: StableBattlefieldIdSchema,
  movement: z.enum(["open", "difficult", "blocked"]),
  sight: z.enum(["clear", "obscured", "blocked"]),
  sound: z.enum(["clear", "muffled", "blocked"]),
}).strict();
export type BattlefieldTopologyEdgeV2 = z.infer<
  typeof BattlefieldTopologyEdgeV2Schema
>;

export const BattlefieldEffectV2Schema = z.object({
  id: StableBattlefieldIdSchema,
  label: z.string().min(1).max(120),
  description: BattlefieldDescriptionV2Schema,
  trigger: z.enum([
    "battle_start",
    "turn_start",
    "entered_area",
    "object_activated",
    "stagnation",
  ]),
  duration: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("persistent") }).strict(),
    z.object({
      kind: z.literal("turns"),
      turns: z.number().int().min(1).max(20),
    }).strict(),
  ]),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("scene") }).strict(),
    z.object({
      kind: z.literal("area"),
      areaId: StableBattlefieldIdSchema,
    }).strict(),
    z.object({ kind: z.literal("all_combatants") }).strict(),
    z.object({
      kind: z.literal("area_occupants"),
      areaId: StableBattlefieldIdSchema,
    }).strict(),
  ]),
  cancellation: z.enum([
    "none",
    "source_removed",
    "object_disabled",
    "area_left",
  ]),
  observable: z.boolean(),
  coefficientModifiers: z.record(
    BattlefieldCoefficientKeySchema,
    z.number().min(0.25).max(2.5),
  ),
}).strict();
export type BattlefieldEffectV2 = z.infer<typeof BattlefieldEffectV2Schema>;

export const BattlefieldObjectV2Schema = z.object({
  id: StableBattlefieldIdSchema,
  label: z.string().min(1).max(120),
  description: BattlefieldDescriptionV2Schema,
  areaId: StableBattlefieldIdSchema,
  presence: z.enum(["present", "latent"]),
  exposure: z.enum(["public", "hidden"]),
  portable: z.boolean(),
  usable: z.boolean(),
  cover: z.enum(["none", "partial", "full"]),
  blocking: z.boolean(),
  durability: z.enum(["fragile", "stable", "indestructible"]),
}).strict();
export type BattlefieldObjectV2 = z.infer<typeof BattlefieldObjectV2Schema>;

export const BattlefieldEvolutionAffordanceV2Schema = z.object({
  id: StableBattlefieldIdSchema,
  pressure: z.enum([
    "weather_shift",
    "visibility_shift",
    "hazard_escalation",
    "structural_failure",
    "crowd_shift",
    "resource_emergence",
  ]),
  areaRefs: z.array(StableBattlefieldIdSchema).max(12),
  objectRefs: z.array(StableBattlefieldIdSchema).max(12),
  description: BattlefieldDescriptionV2Schema,
}).strict();
export type BattlefieldEvolutionAffordanceV2 = z.infer<
  typeof BattlefieldEvolutionAffordanceV2Schema
>;

export const BattlefieldDefinitionV2Schema = z.object({
  identity: z.object({
    displayName: z.string().min(1).max(120),
    category: BattlefieldCategorySchema,
    tags: z.array(z.string().min(1).max(80)).max(16),
    scale: z.enum(["duel", "room", "site", "district", "expanse"]),
    genre: z.string().min(1).max(120),
    atmosphere: z.array(z.string().min(1).max(120)).max(12),
  }).strict(),
  appearance: z.object({
    publicSummary: z.string().min(1).max(600),
    visualPrompt: z.string().min(1).max(1600),
    image: z.object({
      mediaId: z.string().min(1).max(1000),
      revisionId: z.string().min(1).max(160),
    }).strict().nullable(),
  }).strict(),
  areas: z.array(BattlefieldAreaV2Schema).min(1).max(24),
  topology: z.array(BattlefieldTopologyEdgeV2Schema).max(64),
  effects: z.array(BattlefieldEffectV2Schema).max(24),
  objects: z.array(BattlefieldObjectV2Schema).max(48),
  entryAreas: z.object({
    a: StableBattlefieldIdSchema,
    b: StableBattlefieldIdSchema,
  }).strict(),
  baseCoefficients: z.record(
    BattlefieldCoefficientKeySchema,
    z.number().min(0.25).max(2.5),
  ),
  evolutionAffordances: z.array(BattlefieldEvolutionAffordanceV2Schema).max(24),
  forbiddenDiscontinuities: z.array(z.string().min(1).max(120)).max(24),
}).strict().superRefine((definition, context) => {
  const all = [
    ...definition.areas.map((item) => [item.id, "areas"] as const),
    ...definition.topology.map((item) => [item.id, "topology"] as const),
    ...definition.effects.map((item) => [item.id, "effects"] as const),
    ...definition.objects.map((item) => [item.id, "objects"] as const),
    ...definition.evolutionAffordances.map((item) =>
      [item.id, "evolutionAffordances"] as const),
  ];
  const seen = new Set<string>();
  for (const [id, section] of all) {
    if (seen.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [section],
        message: `duplicate battlefield stable id: ${id}`,
      });
    }
    seen.add(id);
  }
  const areaIds = new Set(definition.areas.map((area) => area.id));
  const objectIds = new Set(definition.objects.map((object) => object.id));
  const requireArea = (areaId: string, path: Array<string | number>) => {
    if (!areaIds.has(areaId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `unknown battlefield area: ${areaId}`,
      });
    }
  };
  requireArea(definition.entryAreas.a, ["entryAreas", "a"]);
  requireArea(definition.entryAreas.b, ["entryAreas", "b"]);
  definition.topology.forEach((edge, index) => {
    requireArea(edge.fromAreaId, ["topology", index, "fromAreaId"]);
    requireArea(edge.toAreaId, ["topology", index, "toAreaId"]);
    if (edge.fromAreaId === edge.toAreaId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topology", index],
        message: "topology self edges are not allowed",
      });
    }
  });
  definition.objects.forEach((object, index) =>
    requireArea(object.areaId, ["objects", index, "areaId"]));
  definition.effects.forEach((effect, index) => {
    if ("areaId" in effect.target) {
      requireArea(effect.target.areaId, ["effects", index, "target", "areaId"]);
    }
  });
  definition.evolutionAffordances.forEach((affordance, index) => {
    affordance.areaRefs.forEach((areaId, refIndex) =>
      requireArea(areaId, ["evolutionAffordances", index, "areaRefs", refIndex]));
    affordance.objectRefs.forEach((objectId, refIndex) => {
      if (!objectIds.has(objectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evolutionAffordances", index, "objectRefs", refIndex],
          message: `unknown battlefield object: ${objectId}`,
        });
      }
    });
  });
});
export type BattlefieldDefinitionV2 = z.infer<typeof BattlefieldDefinitionV2Schema>;

export const BattlefieldGenerationEnvelopeV2Schema = assetGenerationEnvelopeV2Schema(
  BattlefieldDefinitionV2Schema,
).superRefine((envelope, context) => {
  if (
    envelope.definitionSchema.family !== "battlefield-preset" ||
    envelope.definitionSchema.version !== BATTLEFIELD_DEFINITION_SCHEMA_VERSION
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "battlefield envelope requires battlefield definition schema v2",
      path: ["definitionSchema"],
    });
  }
});
export type BattlefieldGenerationEnvelopeV2 = z.infer<
  typeof BattlefieldGenerationEnvelopeV2Schema
>;

export type BattlefieldSceneSourceFactV2 = {
  supportRef: string;
  valuePath: string;
  text: string;
};

export type BattlefieldSceneSourceProjectionV2 = {
  contractVersion: 2;
  displayName: string;
  facts: BattlefieldSceneSourceFactV2[];
};

export const BattlefieldImageBriefV2Schema = z.object({
  contractVersion: z.literal(2),
  displayName: z.string().min(1).max(120),
  publicSummary: z.string().min(1).max(600),
  atmosphere: z.array(z.string().min(1).max(120)).max(12),
  visibleAreas: z.array(z.string().min(1).max(600)).max(24),
  visibleObjects: z.array(z.string().min(1).max(600)).max(48),
  visualPrompt: z.string().min(1).max(1600),
}).strict();
export type BattlefieldImageBriefV2 = z.infer<
  typeof BattlefieldImageBriefV2Schema
>;

function publicProfilePaths(policy: AssetDisclosurePolicyV1): Set<string> {
  return new Set(policy.rules
    .filter((rule) => rule.channel === "profile" && rule.target.kind === "public")
    .map((rule) => rule.valuePath));
}

export function defaultBattlefieldDisclosurePolicyV2(
  _definition: BattlefieldDefinitionV2,
): AssetDisclosurePolicyV1 {
  return AssetDisclosurePolicyV1Schema.parse({
    version: 1,
    rules: [
      "identity.displayName",
      "identity.category",
      "identity.tags.*",
      "identity.scale",
      "identity.genre",
      "identity.atmosphere.*",
      "appearance.publicSummary",
      "areas.*.name/description/terrain/surfaceConditions",
      "objects.public.*.label/description",
      "effects.observable.*.label/description",
    ].map((valuePath) => ({
      valuePath,
      channel: "profile",
      target: { kind: "public" },
      prerequisites: [],
    })),
  });
}

export function projectBattlefieldSceneSourceV2(
  definition: BattlefieldDefinitionV2,
  policy: AssetDisclosurePolicyV1,
): BattlefieldSceneSourceProjectionV2 {
  const paths = publicProfilePaths(policy);
  const facts: BattlefieldSceneSourceFactV2[] = [];
  const add = (supportRef: string, valuePath: string, text: string) => {
    if (paths.has(valuePath) && text.trim()) {
      facts.push({ supportRef, valuePath, text: text.trim() });
    }
  };
  add("identity.displayName", "identity.displayName", definition.identity.displayName);
  add("identity.category", "identity.category", definition.identity.category);
  add("identity.scale", "identity.scale", definition.identity.scale);
  add("identity.genre", "identity.genre", definition.identity.genre);
  definition.identity.tags.forEach((tag, index) =>
    add(`identity.tags.${index}`, "identity.tags.*", tag));
  definition.identity.atmosphere.forEach((item, index) =>
    add(`identity.atmosphere.${index}`, "identity.atmosphere.*", item));
  add(
    "appearance.publicSummary",
    "appearance.publicSummary",
    definition.appearance.publicSummary,
  );
  definition.areas.forEach((area) =>
    add(
      `areas.${area.id}`,
      "areas.*.name/description/terrain/surfaceConditions",
      `${area.name}: ${area.description.text}。地形 ${area.terrain}${
        area.surfaceConditions.length ? `、${area.surfaceConditions.join("、")}` : ""
      }`,
    ));
  definition.objects.filter((object) => object.exposure === "public")
    .forEach((object) =>
      add(
        `objects.${object.id}`,
        "objects.public.*.label/description",
        `${object.label}: ${object.description.text}`,
      ));
  definition.effects.filter((effect) => effect.observable)
    .forEach((effect) =>
      add(
        `effects.${effect.id}`,
        "effects.observable.*.label/description",
        `${effect.label}: ${effect.description.text}`,
      ));
  return {
    contractVersion: 2,
    displayName: definition.identity.displayName,
    facts: facts.slice(0, 96),
  };
}

export function validateBattlefieldPublicPresentationV2(
  projection: BattlefieldSceneSourceProjectionV2,
  presentation: AssetPublicPresentationV2,
): AssetPublicPresentationV2 {
  const parsed = AssetPublicPresentationV2Schema.parse(presentation);
  const allowed = new Set(projection.facts.map((fact) => fact.supportRef));
  for (const segment of parsed.segments) {
    for (const supportRef of segment.supportRefs) {
      if (!allowed.has(supportRef)) {
        throw new Error(`BATTLEFIELD_SCENE_UNKNOWN_SUPPORT:${supportRef}`);
      }
    }
    if (segment.kind === "fact" && segment.supportRefs.length === 0) {
      throw new Error(`BATTLEFIELD_SCENE_FACT_WITHOUT_SUPPORT:${segment.id}`);
    }
    if (segment.kind === "flavor" && segment.supportRefs.length > 0) {
      throw new Error(`BATTLEFIELD_SCENE_FLAVOR_HAS_SUPPORT:${segment.id}`);
    }
  }
  return parsed;
}

export function validateBattlefieldSceneClaimAssessmentV2(
  projection: BattlefieldSceneSourceProjectionV2,
  presentation: AssetPublicPresentationV2,
  receipt: AssetClaimValidationReceiptV1,
): AssetPublicPresentationV2 {
  const parsed = validateBattlefieldPublicPresentationV2(projection, presentation);
  const validated = AssetClaimValidationReceiptV1Schema.parse(receipt);
  const projectionRefs = new Set(projection.facts.map((fact) => fact.supportRef));
  if (validated.projectionDigest !== parsed.projectionDigest) {
    throw new Error("BATTLEFIELD_SCENE_CLAIM_PROJECTION_DRIFT");
  }
  const candidates = new Map(parsed.segments.map((segment) => [segment.id, segment]));
  const seen = new Set<string>();
  for (const result of validated.segments) {
    const candidate = candidates.get(result.segmentId);
    if (!candidate || seen.has(result.segmentId)) {
      throw new Error(`BATTLEFIELD_SCENE_CLAIM_UNKNOWN_SEGMENT:${result.segmentId}`);
    }
    seen.add(result.segmentId);
    if (result.supportRefs.some((ref) => !projectionRefs.has(ref))) {
      throw new Error(`BATTLEFIELD_SCENE_CLAIM_UNKNOWN_SUPPORT:${result.segmentId}`);
    }
    if (result.riskCodes.some((risk) =>
      risk === "mechanics" || risk === "control_metadata" ||
      risk === "contradiction")) {
      throw new Error(`BATTLEFIELD_SCENE_CLAIM_RISK:${result.segmentId}`);
    }
    if (candidate.kind === "fact" &&
        (result.verdict !== "supported" || result.supportRefs.length === 0)) {
      throw new Error(`BATTLEFIELD_SCENE_FACT_NOT_VALIDATED:${result.segmentId}`);
    }
    if (result.verdict === "flavor_only" &&
        (candidate.kind !== "flavor" || result.supportRefs.length > 0)) {
      throw new Error(`BATTLEFIELD_SCENE_INVALID_FLAVOR:${result.segmentId}`);
    }
  }
  if (seen.size !== parsed.segments.length) {
    throw new Error("BATTLEFIELD_SCENE_CLAIM_MISSING_SEGMENT");
  }
  return AssetPublicPresentationV2Schema.parse({
    ...parsed,
    claimValidation: validated,
  });
}

export function assertBattlefieldGenerationReadyV2(
  envelope: BattlefieldGenerationEnvelopeV2,
): BattlefieldGenerationEnvelopeV2 {
  const parsed = BattlefieldGenerationEnvelopeV2Schema.parse(envelope);
  for (const required of REQUIRED_BATTLEFIELD_COMPILERS_V2) {
    if (!parsed.compilerCompatibility.some((compiler) =>
      compiler.consumer === required.consumer &&
      compiler.version === required.version)) {
      throw new Error(`BATTLEFIELD_REQUIRED_COMPILER_MISSING:${required.consumer}`);
    }
  }
  if (!parsed.publicPresentation.claimValidation) {
    throw new Error("BATTLEFIELD_SCENE_CLAIM_RECEIPT_MISSING");
  }
  const projection = projectBattlefieldSceneSourceV2(
    parsed.definition,
    parsed.disclosurePolicy,
  );
  validateBattlefieldSceneClaimAssessmentV2(
    projection,
    parsed.publicPresentation,
    parsed.publicPresentation.claimValidation,
  );
  return parsed;
}

function legacyId(prefix: string, value: string, index: number): string {
  const normalized = value.normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${prefix}.${normalized || index + 1}`;
}

function legacyDescription(text: string, supportRef: string): BattlefieldDescriptionV2 {
  return BattlefieldDescriptionV2Schema.parse({
    text: text.trim().slice(0, 600) || "詳細未設定",
    sourceSupportRefs: [supportRef],
  });
}

export function legacyBattlefieldPresetToDefinitionV2(
  preset: BattlefieldPreset,
): BattlefieldDefinitionV2 {
  const terrainHints = [...new Set(preset.terrainHints.map((item) => item.trim())
    .filter(Boolean))].slice(0, 24);
  const terrain = terrainHints.length > 0 ? terrainHints : [preset.appearance.summary];
  const areas = terrain.map((item, index) => ({
    id: legacyId("area", item, index),
    name: item.slice(0, 120),
    description: legacyDescription(item, `legacy.terrainHints.${index}`),
    terrain: "solid" as const,
    movement: "normal" as const,
    visibility: "open" as const,
    audibility: "clear" as const,
    surfaceConditions: [],
  }));
  const topology = areas.slice(0, -1).flatMap((area, index) => {
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
  const objects = [...new Set(preset.obstacleHints.map((item) => item.trim())
    .filter(Boolean))].slice(0, 48).map((item, index) => ({
      id: legacyId("object", item, index),
      label: item.slice(0, 120),
      description: legacyDescription(item, `legacy.obstacleHints.${index}`),
      areaId: areas[0]!.id,
      presence: "present" as const,
      exposure: "public" as const,
      portable: false,
      usable: true,
      cover: "partial" as const,
      blocking: true,
      durability: "stable" as const,
    }));
  const effects = [...new Set(preset.conditionHints.map((item) => item.trim())
    .filter(Boolean))].slice(0, 24).map((item, index) => ({
      id: legacyId("effect", item, index),
      label: item.slice(0, 120),
      description: legacyDescription(item, `legacy.conditionHints.${index}`),
      trigger: "battle_start" as const,
      duration: { kind: "persistent" as const },
      target: { kind: "scene" as const },
      cancellation: "none" as const,
      observable: true,
      coefficientModifiers: {},
    }));
  const coefficients = Object.fromEntries(
    Object.entries(clampCoefficientMap(preset.baseCoefficients))
      .filter(([key]) => BattlefieldCoefficientKeySchema.safeParse(key).success),
  );
  return BattlefieldDefinitionV2Schema.parse({
    identity: {
      displayName: preset.displayName,
      category: preset.category,
      tags: preset.tags.slice(0, 16),
      scale: "site",
      genre: preset.category,
      atmosphere: preset.conditionHints.slice(0, 12),
    },
    appearance: {
      publicSummary: preset.appearance.summary,
      visualPrompt: preset.appearance.visualPrompt,
      image: preset.appearance.imageUrl
        ? { mediaId: preset.appearance.imageUrl, revisionId: "legacy-import" }
        : null,
    },
    areas,
    topology,
    effects,
    objects,
    entryAreas: { a: areas[0]!.id, b: areas.at(-1)!.id },
    baseCoefficients: coefficients,
    evolutionAffordances: [],
    forbiddenDiscontinuities: [
      "unregistered_topology",
      "unregistered_object",
      "unregistered_effect",
    ],
  });
}

export function projectBattlefieldImageBriefV2(
  definition: BattlefieldDefinitionV2,
): BattlefieldImageBriefV2 {
  return BattlefieldImageBriefV2Schema.parse({
    contractVersion: 2,
    displayName: definition.identity.displayName,
    publicSummary: definition.appearance.publicSummary,
    atmosphere: definition.identity.atmosphere,
    visibleAreas: definition.areas.map((area) =>
      `${area.name}: ${area.description.text}`),
    visibleObjects: definition.objects
      .filter((object) => object.exposure === "public" && object.presence === "present")
      .map((object) => `${object.label}: ${object.description.text}`),
    visualPrompt: definition.appearance.visualPrompt,
  });
}

export function battlefieldDefinitionV2ToLegacyPreset(input: {
  battlefieldId: string;
  ownerUserId: string | null;
  isSystem: boolean;
  definition: BattlefieldDefinitionV2;
  publicPresentation: AssetPublicPresentationV2;
  createdAt: string;
  updatedAt: string;
  visibility?: BattlefieldPreset["visibility"];
}): BattlefieldPreset {
  return BattlefieldPresetSchema.parse({
    id: input.battlefieldId,
    ownerUserId: input.ownerUserId,
    isSystem: input.isSystem,
    visibility: input.visibility ?? "public",
    displayName: input.definition.identity.displayName,
    category: input.definition.identity.category,
    tags: input.definition.identity.tags,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    appearance: {
      summary: input.definition.appearance.publicSummary,
      visualPrompt: input.definition.appearance.visualPrompt,
      imageUrl: input.definition.appearance.image?.mediaId ?? null,
    },
    terrainHints: input.definition.areas.map((area) => area.name),
    obstacleHints: input.definition.objects
      .filter((object) => object.exposure === "public")
      .map((object) => object.label),
    conditionHints: input.definition.effects
      .filter((effect) => effect.observable)
      .map((effect) => effect.label),
    baseCoefficients: input.definition.baseCoefficients,
    narrativeBlurb: input.publicPresentation.description,
  });
}

export function compileBattlefieldInstanceV2(
  definition: BattlefieldDefinitionV2,
  sourcePresetId: string,
): BattlefieldInstance {
  const parsed = BattlefieldDefinitionV2Schema.parse(definition);
  const areaById = new Map(parsed.areas.map((area) => [area.id, area]));
  const terrain = parsed.areas
    .map((area) => `${area.name}（${area.terrain}）`)
    .join(" / ");
  const publicObjects = parsed.objects
    .filter((object) => object.presence === "present" && object.exposure === "public");
  const observableEffects = parsed.effects.filter((effect) => effect.observable);
  const semanticEntities = Object.fromEntries([
    ...parsed.areas.map((area) => [area.id, {
      kind: "terrain" as const,
      label: area.name,
      location: { type: "scene" as const, area: area.name },
      active: true,
      facts: {
        terrain: area.terrain,
        movement: area.movement,
        visibility: area.visibility,
        audibility: area.audibility,
        surface_conditions: area.surfaceConditions,
      },
    }] as const),
    ...parsed.objects.filter((object) => object.presence === "present")
      .map((object) => [object.id, {
        kind: "object" as const,
        label: object.label,
        location: {
          type: "scene" as const,
          area: areaById.get(object.areaId)!.name,
        },
        active: true,
        facts: {
          portable: object.portable,
          usable: object.usable,
          cover: object.cover,
          blocking: object.blocking,
          durability: object.durability,
          exposure: object.exposure,
        },
      }] as const),
    ...parsed.effects.map((effect) => [effect.id, {
      kind: "effect" as const,
      label: effect.label,
      location: effect.target.kind === "area" || effect.target.kind === "area_occupants"
        ? {
            type: "scene" as const,
            area: areaById.get(effect.target.areaId)!.name,
          }
        : {
            type: "scene" as const,
            area: areaById.get(parsed.entryAreas.a)!.name,
          },
      active: effect.trigger === "battle_start",
      facts: {
        trigger: effect.trigger,
        duration: effect.duration.kind === "persistent"
          ? "persistent"
          : effect.duration.turns,
        target: effect.target.kind,
        cancellation: effect.cancellation,
        observable: effect.observable,
        coefficient_modifiers: effect.coefficientModifiers,
      },
    }] as const),
  ]);
  const sceneFacts = {
    category: parsed.identity.category,
    scale: parsed.identity.scale,
    atmosphere: parsed.identity.atmosphere,
    entry_area_a: parsed.entryAreas.a,
    entry_area_b: parsed.entryAreas.b,
    topology: parsed.topology.map((edge) => ({
      id: edge.id,
      from: edge.fromAreaId,
      to: edge.toAreaId,
      movement: edge.movement,
      sight: edge.sight,
      sound: edge.sound,
    })),
  };
  return BattlefieldInstanceSchema.parse({
    sourcePresetId,
    displayName: parsed.identity.displayName,
    category: parsed.identity.category,
    scene: parsed.identity.displayName,
    terrain,
    obstacles: publicObjects.map((object) => object.label),
    conditions: observableEffects.map((effect) => effect.label),
    coefficients: parsed.baseCoefficients,
    narrativeSetup: [
      parsed.appearance.publicSummary,
      parsed.identity.atmosphere.join("、"),
    ].filter(Boolean).join("。"),
    semanticSeed: { sceneFacts, entities: semanticEntities },
    appearance: {
      summary: parsed.appearance.publicSummary,
      visualPrompt: parsed.appearance.visualPrompt,
      imageUrl: parsed.appearance.image?.mediaId ?? null,
    },
    compilerContract: BATTLEFIELD_INSTANCE_COMPILER_V2,
    areas: parsed.areas.map((area) => ({ id: area.id, name: area.name })),
    entryAreas: parsed.entryAreas,
    topology: parsed.topology,
    evolutionAffordances: parsed.evolutionAffordances,
    forbiddenDiscontinuities: parsed.forbiddenDiscontinuities,
  });
}

/** Select one authored evolution permission without reading prose or using randomness. */
export function selectBattlefieldEvolutionAffordanceV2(
  instance: BattlefieldInstance,
  upcomingTurn: number,
  priorAcceptedHappenings: number,
): BattlefieldEvolutionAffordanceV2 | null {
  if (instance.compilerContract !== BATTLEFIELD_INSTANCE_COMPILER_V2) return null;
  const affordances = (instance.evolutionAffordances ?? []).map((affordance) =>
    BattlefieldEvolutionAffordanceV2Schema.parse(affordance));
  if (affordances.length === 0) return null;
  const turn = Number.isInteger(upcomingTurn) && upcomingTurn > 0
    ? upcomingTurn
    : 1;
  const prior = Number.isInteger(priorAcceptedHappenings) &&
      priorAcceptedHappenings >= 0
    ? priorAcceptedHappenings
    : 0;
  return affordances[(turn - 1 + prior) % affordances.length]!;
}
