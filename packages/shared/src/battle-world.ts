import { z } from "zod";
import {
  SemanticIdSchema,
  type BattleSemanticEntity,
  type BattleSemanticState,
} from "./semantic-state.js";

export const BATTLE_WORLD_LIMITS = {
  maxAreas: 32,
  maxEntities: 128,
  maxPairRelations: 256,
  maxTransitionOperations: 24,
  maxTransitionSourceEvents: 32,
  maxStateBytes: 48 * 1024,
  maxTransitionBytes: 16 * 1024,
} as const;

export const WorldPresenceSchema = z.enum(["present", "absent"]);
export type WorldPresence = z.infer<typeof WorldPresenceSchema>;

export const WorldExposureSchema = z.enum([
  "exposed",
  "partially_concealed",
  "hidden",
  "invisible",
]);
export type WorldExposure = z.infer<typeof WorldExposureSchema>;

export const WorldDistanceSchema = z.enum([
  "contact",
  "near",
  "medium",
  "far",
  "separate_area",
  "out_of_scene",
]);
export type WorldDistance = z.infer<typeof WorldDistanceSchema>;

export const WorldOcclusionSchema = z.enum(["clear", "partial", "blocked"]);
export type WorldOcclusion = z.infer<typeof WorldOcclusionSchema>;

export const WorldOrientationSchema = z.enum([
  "facing",
  "side_on",
  "away",
  "indeterminate",
]);
export type WorldOrientation = z.infer<typeof WorldOrientationSchema>;

export const WorldPlacementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scene"),
    areaId: SemanticIdSchema,
  }).strict(),
  z.object({
    type: z.literal("held"),
    holderId: SemanticIdSchema,
  }).strict(),
  z.object({
    type: z.literal("worn"),
    wearerId: SemanticIdSchema,
    slot: z.string().min(1).max(80),
  }).strict(),
  z.object({
    type: z.literal("attached"),
    anchorId: SemanticIdSchema,
  }).strict(),
  z.object({
    type: z.literal("absent"),
  }).strict(),
]);
export type WorldPlacement = z.infer<typeof WorldPlacementSchema>;

export const WorldActorStateSchema = z.object({
  consciousness: z.enum(["alert", "dazed", "unconscious", "incapacitated"]),
  mobility: z.enum(["mobile", "hindered", "immobilized"]),
  restraint: z.enum(["free", "partially_restrained", "restrained"]),
  posture: z.enum(["standing", "crouched", "prone", "airborne", "other"]),
  vision: z.enum(["normal", "impaired", "blocked", "absent"]),
  hearing: z.enum(["normal", "impaired", "blocked", "absent"]),
  /** Missing legacy values are interpreted as normal speech capability. */
  speech: z.enum(["normal", "impaired", "blocked", "absent"]).optional(),
  /** Coarse comprehension of the battle's shared spoken language. */
  languageUnderstanding: z.enum(["fluent", "partial", "none"]).optional(),
  mentalClarity: z.enum(["clear", "confused", "delirious"]),
  agency: z.enum(["self_directed", "compelled", "uncontrolled"]),
}).strict();
export type WorldActorState = z.infer<typeof WorldActorStateSchema>;

/** Small engine-owned envelope for improvised object effects. */
export const WorldCausalBandSchema = z.enum(["none", "minor", "moderate"]);
export type WorldCausalBand = z.infer<typeof WorldCausalBandSchema>;

export const WorldCausalEnvelopeSchema = z.object({
  damage: WorldCausalBandSchema.optional(),
  defense: WorldCausalBandSchema.optional(),
  reach: WorldCausalBandSchema.optional(),
  control: WorldCausalBandSchema.optional(),
  mobility: WorldCausalBandSchema.optional(),
  vision: WorldCausalBandSchema.optional(),
  hearing: WorldCausalBandSchema.optional(),
  cover: WorldCausalBandSchema.optional(),
}).strict();
export type WorldCausalEnvelope = z.infer<typeof WorldCausalEnvelopeSchema>;

export const WorldObjectConcretizationRecordSchema = z.object({
  turn: z.number().int().nonnegative(),
  statement: z.string().min(1).max(400),
  resolvedAspects: z.array(z.string().min(1).max(80)).max(8).default([]),
  evidenceRefs: z.array(SemanticIdSchema).max(8).default([]),
}).strict();
export type WorldObjectConcretizationRecord = z.infer<
  typeof WorldObjectConcretizationRecordSchema
>;

/**
 * Canonical identity remains server-owned. Observer-local labels live in
 * perception/affordance projections and may disagree with canonicalLabel.
 */
export const WorldObjectProfileSchema = z.object({
  canonicalLabel: z.string().min(1).max(120).nullable(),
  description: z.string().min(1).max(600),
  sourceRef: z.string().min(1).max(160),
  candidateKey: z.string().min(1).max(80),
  provenance: z.enum([
    "profile_appearance",
    "profile_equipment",
    "battlefield",
    "semantic_entity",
    "committed_event",
    "operation_result",
  ]),
  knownOpenAspects: z.array(z.string().min(1).max(80)).max(8).default([]),
  observerRefs: z.object({
    a: z.string().min(1).max(120).optional(),
    b: z.string().min(1).max(120).optional(),
  }).strict().default({}),
  /** Cached observer belief labels; never mechanical or canonical authority. */
  observerLabels: z.object({
    a: z.string().min(1).max(240).optional(),
    b: z.string().min(1).max(240).optional(),
  }).strict().default({}),
  concretizations: z
    .array(WorldObjectConcretizationRecordSchema)
    .max(8)
    .default([]),
}).strict();
export type WorldObjectProfile = z.infer<typeof WorldObjectProfileSchema>;

export const WorldObjectStateSchema = z.object({
  portable: z.boolean(),
  usable: z.boolean(),
  exclusiveUse: z.boolean(),
  usableBy: z
    .array(SemanticIdSchema)
    .max(2)
    .refine((ids) => new Set(ids).size === ids.length, "duplicate usable entity"),
  cover: z.enum(["none", "partial", "full"]),
  blocksMovement: z.boolean(),
  visionEffect: z.enum(["none", "impair", "block"]),
  hearingEffect: z.enum(["none", "impair", "block"]),
  mobilityEffect: z.enum(["none", "hinder", "immobilize"]),
  causalEnvelope: WorldCausalEnvelopeSchema.optional(),
}).strict();
export type WorldObjectState = z.infer<typeof WorldObjectStateSchema>;

export const BattleWorldAreaSchema = z.object({
  label: z.string().min(1).max(240),
  illumination: z.enum(["bright", "normal", "dim", "dark"]),
  noise: z.enum(["quiet", "normal", "loud", "overwhelming"]),
  space: z.enum(["open", "confined", "crowded"]),
  movement: z.enum(["open", "restricted", "blocked"]),
}).strict();
export type BattleWorldArea = z.infer<typeof BattleWorldAreaSchema>;

export const BattleWorldEntitySchema = z.object({
  kind: z.enum(["character", "object", "terrain", "effect", "other"]),
  active: z.boolean(),
  presence: WorldPresenceSchema,
  placement: WorldPlacementSchema,
  exposure: WorldExposureSchema,
  actorState: WorldActorStateSchema.nullable(),
  objectState: WorldObjectStateSchema.nullable(),
  objectProfile: WorldObjectProfileSchema.optional(),
  createdTurn: z.number().int().nonnegative(),
  updatedTurn: z.number().int().nonnegative(),
}).strict();
export type BattleWorldEntity = z.infer<typeof BattleWorldEntitySchema>;

export const BattleWorldPairRelationSchema = z.object({
  firstEntityId: SemanticIdSchema,
  secondEntityId: SemanticIdSchema,
  distance: WorldDistanceSchema,
  sight: WorldOcclusionSchema,
  sound: WorldOcclusionSchema,
  firstOrientation: WorldOrientationSchema,
  secondOrientation: WorldOrientationSchema,
  updatedTurn: z.number().int().nonnegative(),
}).strict().superRefine((relation, ctx) => {
  if (relation.firstEntityId >= relation.secondEntityId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["firstEntityId"],
      message: "pair relation entity IDs must use canonical lexical order",
    });
  }
});
export type BattleWorldPairRelation = z.infer<
  typeof BattleWorldPairRelationSchema
>;

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function placementParentId(placement: WorldPlacement): string | null {
  if (placement.type === "held") return placement.holderId;
  if (placement.type === "worn") return placement.wearerId;
  if (placement.type === "attached") return placement.anchorId;
  return null;
}

function canonicalPairKey(firstEntityId: string, secondEntityId: string): string {
  return firstEntityId < secondEntityId
    ? `${firstEntityId}\u0000${secondEntityId}`
    : `${secondEntityId}\u0000${firstEntityId}`;
}

function validateWorldReferences(
  state: {
    areas: Record<string, BattleWorldArea>;
    entities: Record<string, BattleWorldEntity>;
    pairRelations: BattleWorldPairRelation[];
  },
  ctx: z.RefinementCtx,
): void {
  for (const requiredId of ["character.a", "character.b"] as const) {
    const entity = state.entities[requiredId];
    if (!entity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", requiredId],
        message: `required world entity ${requiredId} is missing`,
      });
      continue;
    }
    if (entity.kind !== "character" || !entity.active || !entity.actorState) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", requiredId],
        message: `${requiredId} must be an active character with actor state`,
      });
    }
  }

  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.presence === "absent" && entity.placement.type !== "absent") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "placement"],
        message: "absent entities must use absent placement",
      });
    }
    if (entity.presence === "present" && entity.placement.type === "absent") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "placement"],
        message: "present entities cannot use absent placement",
      });
    }
    if (!entity.active && entity.presence !== "absent") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "presence"],
        message: "inactive entity tombstones must be absent",
      });
    }
    if (entity.kind === "character") {
      if (!entity.actorState || entity.objectState || entity.objectProfile) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", id],
          message: "characters require actor state and cannot have object state",
        });
      }
      if (entity.placement.type !== "scene" && entity.placement.type !== "absent") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", id, "placement"],
          message: "characters must be in a scene area or absent",
        });
      }
    } else if (entity.actorState) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "actorState"],
        message: "non-character entities cannot have actor state",
      });
    }
    if (
      ["object", "terrain", "other"].includes(entity.kind) &&
      !entity.objectState
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "objectState"],
        message: `${entity.kind} entities require object state`,
      });
    }
    if (entity.placement.type === "scene") {
      if (!state.areas[entity.placement.areaId]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", id, "placement", "areaId"],
          message: `missing world area ${entity.placement.areaId}`,
        });
      }
      continue;
    }
    const parentId = placementParentId(entity.placement);
    if (!parentId) continue;
    const parent = state.entities[parentId];
    if (!parent || !parent.active || parent.presence === "absent") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "placement"],
        message: `${id} has a missing or absent placement parent ${parentId}`,
      });
      continue;
    }
    if (
      (entity.placement.type === "held" || entity.placement.type === "worn") &&
      parent.kind !== "character"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "placement"],
        message: "held and worn entities require a character parent",
      });
    }
    if (
      (entity.placement.type === "held" || entity.placement.type === "worn") &&
      !entity.objectState?.portable
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "objectState", "portable"],
        message: "held and worn entities must be portable",
      });
    }
  }

  for (const id of Object.keys(state.entities)) {
    const visited = new Set([id]);
    let cursor = placementParentId(state.entities[id]!.placement);
    while (cursor) {
      if (visited.has(cursor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", id, "placement"],
          message: `${id} has a cyclic placement chain`,
        });
        break;
      }
      visited.add(cursor);
      const parent = state.entities[cursor];
      cursor = parent ? placementParentId(parent.placement) : null;
    }
  }

  const pairKeys = new Set<string>();
  for (const [index, relation] of state.pairRelations.entries()) {
    const key = canonicalPairKey(
      relation.firstEntityId,
      relation.secondEntityId,
    );
    if (pairKeys.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pairRelations", index],
        message: "duplicate world pair relation",
      });
    }
    pairKeys.add(key);
    const first = state.entities[relation.firstEntityId];
    const second = state.entities[relation.secondEntityId];
    if (!first || !second) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pairRelations", index],
        message: "pair relation references a missing entity",
      });
      continue;
    }
    const outOfScene = !first.active || !second.active ||
      first.presence === "absent" || second.presence === "absent";
    if (outOfScene) {
      if (
        relation.distance !== "out_of_scene" ||
        relation.sight !== "blocked" ||
        relation.sound !== "blocked"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pairRelations", index],
          message: "absent pair members require out-of-scene blocked relation",
        });
      }
      continue;
    }
    if (relation.distance === "out_of_scene") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pairRelations", index, "distance"],
        message: "present pair members cannot be out of scene",
      });
    }
    if (
      first.placement.type === "scene" &&
      second.placement.type === "scene"
    ) {
      const sameArea = first.placement.areaId === second.placement.areaId;
      if (sameArea && relation.distance === "separate_area") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pairRelations", index, "distance"],
          message: "entities in the same area cannot be separate-area",
        });
      }
      if (!sameArea && relation.distance !== "separate_area") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pairRelations", index, "distance"],
          message: "entities in different areas require separate-area distance",
        });
      }
    }
  }
  if (!pairKeys.has(canonicalPairKey("character.a", "character.b"))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pairRelations"],
      message: "character pair relation is required",
    });
  }

  for (const [id, entity] of Object.entries(state.entities)) {
    for (const usableById of entity.objectState?.usableBy ?? []) {
      if (state.entities[usableById]?.kind !== "character") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", id, "objectState", "usableBy"],
          message: `usableBy reference ${usableById} must be a character`,
        });
      }
    }
  }
}

export const BattleWorldStateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  areas: z.record(SemanticIdSchema, BattleWorldAreaSchema),
  entities: z.record(SemanticIdSchema, BattleWorldEntitySchema),
  pairRelations: z.array(BattleWorldPairRelationSchema),
}).strict().superRefine((state, ctx) => {
  if (Object.keys(state.areas).length > BATTLE_WORLD_LIMITS.maxAreas) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["areas"],
      message: "world area count exceeds limit",
    });
  }
  if (Object.keys(state.entities).length > BATTLE_WORLD_LIMITS.maxEntities) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entities"],
      message: "world entity count exceeds limit",
    });
  }
  if (state.pairRelations.length > BATTLE_WORLD_LIMITS.maxPairRelations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pairRelations"],
      message: "world pair relation count exceeds limit",
    });
  }
  if (utf8Bytes(state) > BATTLE_WORLD_LIMITS.maxStateBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "world state exceeds byte limit",
    });
  }
  validateWorldReferences(state, ctx);
});
export type BattleWorldState = z.infer<typeof BattleWorldStateSchema>;

/** Observer-safe, ID-free rendering of a canonical object placement. */
export const BattleSceneStateFactSchema = z.object({
  itemLabel: z.string().min(1).max(120),
  statement: z.string().min(1).max(400),
}).strict();
export type BattleSceneStateFact = z.infer<typeof BattleSceneStateFactSchema>;

/**
 * Public non-position object/area state for battlefield UI.
 * Placement text is separate; this holds retained mechanical object state.
 */
export const BattleObjectStatePublicSchema = z.object({
  label: z.string().min(1).max(120),
  kind: z.enum(["character", "object", "terrain", "effect", "other"]),
  active: z.boolean(),
  presence: z.enum(["present", "absent"]),
  /** Human-readable non-position states retained from canonical world. */
  states: z.array(z.string().min(1).max(120)).max(16),
  /** Optional placement summary (kept separate from states). */
  placementSummary: z.string().max(200).optional(),
}).strict();
export type BattleObjectStatePublic = z.infer<
  typeof BattleObjectStatePublicSchema
>;

function objectStateLines(
  objectState: WorldObjectState | null | undefined,
): string[] {
  if (!objectState) return [];
  const lines: string[] = [];
  if (objectState.portable) lines.push("持ち運び可");
  if (objectState.usable) lines.push("使用可");
  if (objectState.exclusiveUse) lines.push("独占使用");
  if (objectState.cover !== "none") {
    lines.push(
      objectState.cover === "full" ? "完全遮蔽" : "部分遮蔽",
    );
  }
  if (objectState.blocksMovement) lines.push("移動阻害");
  if (objectState.visionEffect !== "none") {
    lines.push(
      objectState.visionEffect === "block" ? "視界遮断" : "視界低下",
    );
  }
  if (objectState.hearingEffect !== "none") {
    lines.push(
      objectState.hearingEffect === "block" ? "聴覚遮断" : "聴覚低下",
    );
  }
  if (objectState.mobilityEffect !== "none") {
    lines.push(
      objectState.mobilityEffect === "immobilize" ? "拘束" : "移動妨害",
    );
  }
  return lines;
}

function actorStateLines(
  actorState: WorldActorState | null | undefined,
): string[] {
  if (!actorState) return [];
  const lines: string[] = [];
  if (actorState.consciousness !== "alert") {
    lines.push(
      actorState.consciousness === "unconscious"
        ? "意識なし"
        : actorState.consciousness === "incapacitated"
          ? "行動不能"
          : actorState.consciousness === "dazed"
            ? "朦朧"
            : actorState.consciousness,
    );
  }
  if (actorState.mobility !== "mobile") {
    lines.push(
      actorState.mobility === "immobilized" ? "移動不能" : "移動困難",
    );
  }
  if (actorState.restraint !== "free") {
    lines.push(
      actorState.restraint === "restrained" ? "拘束" : "部分拘束",
    );
  }
  if (actorState.posture !== "standing") {
    const postureJa: Record<string, string> = {
      crouched: "しゃがみ",
      prone: "伏せ",
      airborne: "空中",
      other: "特殊姿勢",
    };
    lines.push(postureJa[actorState.posture] ?? actorState.posture);
  }
  if (actorState.vision !== "normal") {
    lines.push(
      actorState.vision === "absent"
        ? "視覚なし"
        : actorState.vision === "blocked"
          ? "視界遮断"
          : "視界低下",
    );
  }
  if (actorState.hearing !== "normal") {
    lines.push(
      actorState.hearing === "absent"
        ? "聴覚なし"
        : actorState.hearing === "blocked"
          ? "聴覚遮断"
          : "聴覚低下",
    );
  }
  if (actorState.mentalClarity !== "clear") {
    lines.push(
      actorState.mentalClarity === "delirious" ? "錯乱" : "混乱",
    );
  }
  if (actorState.agency !== "self_directed") {
    lines.push(
      actorState.agency === "compelled" ? "強制" : "制御不能",
    );
  }
  return lines;
}

function placementSummaryJa(
  entity: BattleWorldEntity,
  areas: BattleWorldState["areas"],
  labels: Partial<Record<"a" | "b", string>>,
): string {
  if (entity.placement.type === "scene") {
    return areas[entity.placement.areaId]?.label ?? "場面内";
  }
  if (entity.placement.type === "held") {
    const who = placementActorSide(entity.placement.holderId);
    return `${who ? (labels[who] ?? (who === "a" ? "A" : "B")) : "誰か"}が所持`;
  }
  if (entity.placement.type === "worn") {
    const who = placementActorSide(entity.placement.wearerId);
    return `${who ? (labels[who] ?? (who === "a" ? "A" : "B")) : "誰か"}が着用`;
  }
  if (entity.placement.type === "attached") return "付着";
  return "場外";
}

/**
 * Project canonical world entities into public non-position state cards.
 * Ensures object/actor state is retained for UI even when semantic facts omit it.
 */
export function projectPublicObjectStates(input: {
  worldState?: BattleWorldState | null;
  participantLabels?: Partial<Record<"a" | "b", string>>;
}): BattleObjectStatePublic[] {
  if (!input.worldState) return [];
  const labels = input.participantLabels ?? {};
  const rows: BattleObjectStatePublic[] = [];
  for (const [id, entity] of Object.entries(input.worldState.entities)) {
    const profileLabel = entity.objectProfile?.canonicalLabel?.trim();
    const descriptionLabel = entity.objectProfile?.description
      ?.split(/[。\n]/u)[0]
      ?.trim()
      .slice(0, 40);
    const kindJa: Record<BattleWorldEntity["kind"], string> = {
      character: "人物",
      object: "物体",
      terrain: "地形",
      effect: "効果",
      other: "対象",
    };
    const label =
      profileLabel ||
      (id === "character.a"
        ? labels.a ?? "A"
        : id === "character.b"
          ? labels.b ?? "B"
          : descriptionLabel ||
            // Never surface raw enum keys like "object" as the primary name.
            `${kindJa[entity.kind] ?? "対象"}`);
    const states = [
      ...objectStateLines(entity.objectState),
      ...actorStateLines(entity.actorState),
    ];
    // Always retain at least presence/active so state is never empty for present objects.
    if (entity.presence === "absent") states.unshift("場にいない");
    if (!entity.active) states.unshift("非アクティブ");
    if (states.length === 0 && entity.kind === "character") continue;
    rows.push({
      label: label.slice(0, 120),
      kind: entity.kind,
      active: entity.active,
      presence: entity.presence,
      states: states.slice(0, 16),
      placementSummary: placementSummaryJa(entity, input.worldState.areas, labels),
    });
  }
  // Prefer objects/terrain/effects, then characters with non-default states.
  return rows
    .sort((a, b) => {
      const rank = (row: BattleObjectStatePublic) =>
        row.kind === "object"
          ? 0
          : row.kind === "terrain"
            ? 1
            : row.kind === "effect"
              ? 2
              : 3;
      return rank(a) - rank(b) || a.label.localeCompare(b.label, "ja");
    })
    .slice(0, 24);
}


function sceneFactActorLabel(input: {
  actorSide: "a" | "b" | null;
  observerSide?: "a" | "b";
  participantLabels?: Partial<Record<"a" | "b", string>>;
}): string {
  if (!input.actorSide) return "別の対象";
  if (input.observerSide) {
    return input.actorSide === input.observerSide ? "自分" : "相手";
  }
  return input.participantLabels?.[input.actorSide] ??
    (input.actorSide === "a" ? "A側の人物" : "B側の人物");
}

function placementActorSide(
  entityId: string,
): "a" | "b" | null {
  return entityId === "character.a"
    ? "a"
    : entityId === "character.b"
      ? "b"
      : null;
}

/**
 * Project promoted/concretized world objects into bounded natural-language
 * scene facts. An observer-limited projection uses that observer's cached
 * belief label and omits objects never exposed to that observer.
 */
export function deriveBattleSceneStateFacts(input: {
  worldState?: BattleWorldState | null;
  observerSide?: "a" | "b";
  participantLabels?: Partial<Record<"a" | "b", string>>;
}): BattleSceneStateFact[] {
  if (!input.worldState) return [];
  return Object.entries(input.worldState.entities)
    .flatMap(([entityId, entity]) => {
      const profile = entity.objectProfile;
      if (!profile) return [];
      const observerLabel = input.observerSide
        ? profile.observerLabels[input.observerSide]
        : undefined;
      if (input.observerSide && !observerLabel) return [];
      const itemLabel = (
        observerLabel ??
        profile.canonicalLabel ??
        profile.description.split(/[。\n]/u)[0] ??
        "場面内の物"
      ).trim().slice(0, 120) || "場面内の物";
      let statement: string;
      if (entity.placement.type === "scene") {
        const area = input.worldState!.areas[entity.placement.areaId]?.label ??
          "場面内";
        statement = `${itemLabel}は${area}にある。`;
      } else if (entity.placement.type === "held") {
        const holder = sceneFactActorLabel({
          actorSide: placementActorSide(entity.placement.holderId),
          observerSide: input.observerSide,
          participantLabels: input.participantLabels,
        });
        statement = `${itemLabel}は${holder}が手に持っている。`;
      } else if (entity.placement.type === "worn") {
        const wearer = sceneFactActorLabel({
          actorSide: placementActorSide(entity.placement.wearerId),
          observerSide: input.observerSide,
          participantLabels: input.participantLabels,
        });
        statement = `${itemLabel}は${wearer}が身につけている。`;
      } else if (entity.placement.type === "attached") {
        statement = `${itemLabel}は別の対象に取り付けられている。`;
      } else {
        statement = `${itemLabel}は現在この場にない。`;
      }
      return [{
        entityId,
        value: BattleSceneStateFactSchema.parse({ itemLabel, statement }),
      }];
    })
    .sort((a, b) => a.entityId.localeCompare(b.entityId))
    .slice(0, 24)
    .map((entry) => entry.value);
}

export type BattleWorldPairView = {
  entityAId: string;
  entityBId: string;
  distance: WorldDistance;
  sight: WorldOcclusion;
  sound: WorldOcclusion;
  orientationA: WorldOrientation;
  orientationB: WorldOrientation;
  updatedTurn: number;
};

/** Reads a canonical pair without exposing lexical storage order as priority. */
export function readBattleWorldPair(
  state: BattleWorldState,
  entityAId: string,
  entityBId: string,
): BattleWorldPairView | null {
  if (entityAId === entityBId) return null;
  const key = canonicalPairKey(entityAId, entityBId);
  const relation = state.pairRelations.find((item) =>
    canonicalPairKey(item.firstEntityId, item.secondEntityId) === key
  );
  if (!relation) return null;
  const firstIsA = relation.firstEntityId === entityAId;
  return {
    entityAId,
    entityBId,
    distance: relation.distance,
    sight: relation.sight,
    sound: relation.sound,
    orientationA: firstIsA
      ? relation.firstOrientation
      : relation.secondOrientation,
    orientationB: firstIsA
      ? relation.secondOrientation
      : relation.firstOrientation,
    updatedTurn: relation.updatedTurn,
  };
}

const WorldActorStateChangeSchema = WorldActorStateSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "actor state change is empty");
const WorldObjectStateChangeSchema = WorldObjectStateSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "object state change is empty");
const WorldAreaChangeSchema = BattleWorldAreaSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "area state change is empty");

const AddWorldAreaOperationSchema = z.object({
  op: z.literal("add_area"),
  areaId: SemanticIdSchema,
  area: BattleWorldAreaSchema,
}).strict();
const AddWorldEntityOperationSchema = z.object({
  op: z.literal("add_entity"),
  entityId: SemanticIdSchema,
  entity: BattleWorldEntitySchema.omit({
    createdTurn: true,
    updatedTurn: true,
  }),
}).strict();
const SetWorldEntityActiveOperationSchema = z.object({
  op: z.literal("set_entity_active"),
  entityId: SemanticIdSchema,
  active: z.boolean(),
}).strict();
const SetWorldPlacementOperationSchema = z.object({
  op: z.literal("set_placement"),
  entityId: SemanticIdSchema,
  placement: WorldPlacementSchema,
}).strict();
const SetWorldExposureOperationSchema = z.object({
  op: z.literal("set_exposure"),
  entityId: SemanticIdSchema,
  exposure: WorldExposureSchema,
}).strict();
const SetWorldActorStateOperationSchema = z.object({
  op: z.literal("set_actor_state"),
  entityId: SemanticIdSchema,
  changes: WorldActorStateChangeSchema,
}).strict();
const SetWorldObjectStateOperationSchema = z.object({
  op: z.literal("set_object_state"),
  entityId: SemanticIdSchema,
  changes: WorldObjectStateChangeSchema,
}).strict();
const ConcretizeWorldObjectOperationSchema = z.object({
  op: z.literal("concretize_object"),
  entityId: SemanticIdSchema,
  canonicalLabel: z.string().min(1).max(120).optional(),
  statement: z.string().min(1).max(400),
  resolvedAspects: z.array(z.string().min(1).max(80)).max(8).default([]),
  remainingOpenAspects: z.array(z.string().min(1).max(80)).max(8),
  evidenceRefs: z.array(SemanticIdSchema).max(8).default([]),
}).strict();
const SetWorldAreaStateOperationSchema = z.object({
  op: z.literal("set_area_state"),
  areaId: SemanticIdSchema,
  changes: WorldAreaChangeSchema,
}).strict();
const SetWorldPairRelationOperationSchema = z.object({
  op: z.literal("set_pair_relation"),
  entityAId: SemanticIdSchema,
  entityBId: SemanticIdSchema,
  distance: WorldDistanceSchema,
  sight: WorldOcclusionSchema,
  sound: WorldOcclusionSchema,
  orientationA: WorldOrientationSchema,
  orientationB: WorldOrientationSchema,
}).strict();
const RemoveWorldPairRelationOperationSchema = z.object({
  op: z.literal("remove_pair_relation"),
  entityAId: SemanticIdSchema,
  entityBId: SemanticIdSchema,
}).strict();

export const BattleWorldOperationSchema = z.discriminatedUnion("op", [
  AddWorldAreaOperationSchema,
  AddWorldEntityOperationSchema,
  SetWorldEntityActiveOperationSchema,
  SetWorldPlacementOperationSchema,
  SetWorldExposureOperationSchema,
  SetWorldActorStateOperationSchema,
  SetWorldObjectStateOperationSchema,
  ConcretizeWorldObjectOperationSchema,
  SetWorldAreaStateOperationSchema,
  SetWorldPairRelationOperationSchema,
  RemoveWorldPairRelationOperationSchema,
]);
export type BattleWorldOperation = z.infer<typeof BattleWorldOperationSchema>;

export const BattleWorldTransitionSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  turn: z.number().int().nonnegative(),
  sourceEventIds: z
    .array(SemanticIdSchema)
    .max(BATTLE_WORLD_LIMITS.maxTransitionSourceEvents)
    .default([]),
  operations: z
    .array(BattleWorldOperationSchema)
    .max(BATTLE_WORLD_LIMITS.maxTransitionOperations),
}).strict().superRefine((transition, ctx) => {
  for (const [index, operation] of transition.operations.entries()) {
    if (
      (operation.op === "set_pair_relation" ||
        operation.op === "remove_pair_relation") &&
      operation.entityAId === operation.entityBId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations", index],
        message: "pair relation requires two different entities",
      });
    }
  }
});
export type BattleWorldTransition = z.infer<typeof BattleWorldTransitionSchema>;

export type BattleWorldTransitionError = {
  code:
    | "invalid_transition"
    | "stale_revision"
    | "wrong_turn"
    | "unknown_source_event"
    | "missing_target"
    | "existing_target"
    | "protected_entity"
    | "invalid_state"
    | "state_limit";
  message: string;
  operationIndex?: number;
};

export type ApplyBattleWorldTransitionResult =
  | { ok: true; state: BattleWorldState; changed: boolean }
  | { ok: false; state: BattleWorldState; error: BattleWorldTransitionError };

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultActorState(): WorldActorState {
  return {
    consciousness: "alert",
    mobility: "mobile",
    restraint: "free",
    posture: "standing",
    vision: "normal",
    hearing: "normal",
    speech: "normal",
    languageUnderstanding: "fluent",
    mentalClarity: "clear",
    agency: "self_directed",
  };
}

function defaultObjectState(input: {
  kind: BattleSemanticEntity["kind"];
  portable: boolean;
}): WorldObjectState | null {
  if (input.kind === "character") return null;
  return {
    portable: input.portable,
    usable: false,
    exclusiveUse: false,
    usableBy: [],
    cover: "none",
    blocksMovement: false,
    visionEffect: "none",
    hearingEffect: "none",
    mobilityEffect: "none",
  };
}

function boundedAreaLabel(value: string): string {
  return value.trim().slice(0, 240) || "対決の場";
}

function buildAreaMapping(semanticState: BattleSemanticState): {
  areas: Record<string, BattleWorldArea>;
  areaIdFor: (label: string) => string;
} {
  const labels = [...new Set(Object.values(semanticState.entities)
    .flatMap((entity) => entity.location.type === "scene"
      ? [boundedAreaLabel(entity.location.area)]
      : []))].sort();
  if (labels.length === 0) labels.push(boundedAreaLabel(semanticState.scene.summary));
  const retained = labels.slice(0, BATTLE_WORLD_LIMITS.maxAreas - 1);
  const overflow = labels.length > retained.length;
  const labelToId = new Map(
    retained.map((label, index) => [label, `area.${index + 1}`]),
  );
  const overflowId = "area.other";
  const areas = Object.fromEntries(retained.map((label, index) => [
    `area.${index + 1}`,
    {
      label,
      illumination: "normal" as const,
      noise: "normal" as const,
      space: "open" as const,
      movement: "open" as const,
    },
  ]));
  if (overflow) {
    areas[overflowId] = {
      label: "その他の場所",
      illumination: "normal",
      noise: "normal",
      space: "open",
      movement: "open",
    };
  }
  return {
    areas,
    areaIdFor: (label) => labelToId.get(boundedAreaLabel(label)) ?? overflowId,
  };
}

function worldPlacementFromSemantic(
  entity: BattleSemanticEntity,
  areaIdFor: (label: string) => string,
): WorldPlacement {
  if (entity.location.type === "scene") {
    return { type: "scene", areaId: areaIdFor(entity.location.area) };
  }
  if (entity.location.type === "held") {
    return { type: "held", holderId: `character.${entity.location.side}` };
  }
  if (entity.location.type === "attached") {
    return { type: "attached", anchorId: entity.location.entityId };
  }
  return { type: "absent" };
}

export function createBattleWorldState(input: {
  semanticState: BattleSemanticState;
}): BattleWorldState {
  const { areas, areaIdFor } = buildAreaMapping(input.semanticState);
  const entities: Record<string, BattleWorldEntity> = Object.fromEntries(
    Object.entries(input.semanticState.entities).map(([id, semanticEntity]) => {
      const requiredCharacter = id === "character.a" || id === "character.b";
      const semanticPlacement = worldPlacementFromSemantic(
        semanticEntity,
        areaIdFor,
      );
      const placement = semanticEntity.kind === "character" &&
          semanticPlacement.type !== "scene" &&
          semanticPlacement.type !== "absent"
        ? { type: "absent" as const }
        : semanticPlacement;
      const present = placement.type !== "absent" && semanticEntity.active;
      const portable = placement.type === "held" || placement.type === "worn";
      return [id, {
        kind: semanticEntity.kind,
        active: requiredCharacter ? true : semanticEntity.active,
        presence: present ? "present" as const : "absent" as const,
        placement: present ? placement : { type: "absent" as const },
        exposure: "exposed" as const,
        actorState: semanticEntity.kind === "character" ? defaultActorState() : null,
        objectState: defaultObjectState({ kind: semanticEntity.kind, portable }),
        createdTurn: semanticEntity.createdTurn,
        updatedTurn: semanticEntity.updatedTurn,
      }];
    }),
  );
  let normalizedDependent = true;
  while (normalizedDependent) {
    normalizedDependent = false;
    for (const entity of Object.values(entities)) {
      const parentId = placementParentId(entity.placement);
      if (!parentId) continue;
      const parent = entities[parentId];
      if (parent?.active && parent.presence === "present") continue;
      entity.presence = "absent";
      entity.placement = { type: "absent" };
      normalizedDependent = true;
    }
  }
  const sideA = entities["character.a"]!;
  const sideB = entities["character.b"]!;
  const bothPresent = sideA.presence === "present" && sideB.presence === "present";
  const sameArea = bothPresent && sideA.placement.type === "scene" &&
    sideB.placement.type === "scene" &&
    sideA.placement.areaId === sideB.placement.areaId;
  return BattleWorldStateSchema.parse({
    schemaVersion: 1,
    revision: 0,
    areas,
    entities,
    pairRelations: [{
      firstEntityId: "character.a",
      secondEntityId: "character.b",
      distance: !bothPresent
        ? "out_of_scene"
        : sameArea
          ? "near"
          : "separate_area",
      sight: !bothPresent || !sameArea ? "blocked" : "clear",
      sound: !bothPresent ? "blocked" : sameArea ? "clear" : "partial",
      firstOrientation: bothPresent ? "facing" : "indeterminate",
      secondOrientation: bothPresent ? "facing" : "indeterminate",
      updatedTurn: 0,
    }],
  });
}

export type DeriveBattleWorldTransitionResult =
  | { ok: true; transition: BattleWorldTransition }
  | { ok: false; error: string };

function placementEquals(a: WorldPlacement, b: WorldPlacement): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Converts only structured semantic presence/location changes into a mechanical
 * world transition. Semantic facts and prose are intentionally ignored.
 */
export function deriveBattleWorldTransitionFromSemanticState(input: {
  worldState: BattleWorldState;
  semanticState: BattleSemanticState;
  turn: number;
  sourceEventIds: string[];
}): DeriveBattleWorldTransitionResult {
  const operations: BattleWorldOperation[] = [];
  const areaLabels = new Map(
    Object.entries(input.worldState.areas).map(([id, area]) => [area.label, id]),
  );
  let nextAreaSequence = 1;
  const areaIdFor = (label: string): string | null => {
    const bounded = boundedAreaLabel(label);
    const current = areaLabels.get(bounded);
    if (current) return current;
    if (areaLabels.size >= BATTLE_WORLD_LIMITS.maxAreas) return null;
    let areaId = `area.turn-${input.turn}.${nextAreaSequence}`;
    while (input.worldState.areas[areaId] || [...areaLabels.values()].includes(areaId)) {
      nextAreaSequence += 1;
      areaId = `area.turn-${input.turn}.${nextAreaSequence}`;
    }
    nextAreaSequence += 1;
    areaLabels.set(bounded, areaId);
    operations.push({
      op: "add_area",
      areaId,
      area: {
        label: bounded,
        illumination: "normal",
        noise: "normal",
        space: "open",
        movement: "open",
      },
    });
    return areaId;
  };

  for (const entity of Object.values(input.semanticState.entities)) {
    if (entity.active && entity.location.type === "scene") {
      if (!areaIdFor(entity.location.area)) {
        return { ok: false, error: "world area limit prevents semantic synchronization" };
      }
    }
  }

  const desiredPlacement = new Map<string, WorldPlacement>();
  const resolvePlacement = (entityId: string, seen = new Set<string>()): WorldPlacement => {
    const cached = desiredPlacement.get(entityId);
    if (cached) return cached;
    const semantic = input.semanticState.entities[entityId];
    if (!semantic || !semantic.active || seen.has(entityId)) {
      return { type: "absent" };
    }
    const nextSeen = new Set(seen).add(entityId);
    let placement: WorldPlacement;
    if (semantic.location.type === "scene") {
      const areaId = areaIdFor(semantic.location.area);
      placement = areaId
        ? { type: "scene", areaId }
        : { type: "absent" };
    } else if (semantic.location.type === "held") {
      placement = {
        type: "held",
        holderId: `character.${semantic.location.side}`,
      };
    } else if (semantic.location.type === "attached") {
      const parentPlacement = resolvePlacement(
        semantic.location.entityId,
        nextSeen,
      );
      placement = parentPlacement.type === "absent"
        ? { type: "absent" }
        : { type: "attached", anchorId: semantic.location.entityId };
    } else {
      placement = { type: "absent" };
    }
    desiredPlacement.set(entityId, placement);
    return placement;
  };
  for (const id of Object.keys(input.semanticState.entities)) resolvePlacement(id);

  const placementDepth = (entityId: string): number => {
    let depth = 0;
    let cursor = input.semanticState.entities[entityId];
    const seen = new Set<string>();
    while (cursor?.location.type === "attached" && !seen.has(cursor.location.entityId)) {
      seen.add(cursor.location.entityId);
      depth += 1;
      cursor = input.semanticState.entities[cursor.location.entityId];
    }
    return depth;
  };
  const orderedEntities = Object.entries(input.semanticState.entities).sort(
    ([idA], [idB]) => placementDepth(idA) - placementDepth(idB) || idA.localeCompare(idB),
  );

  for (const [entityId, semantic] of orderedEntities) {
    const current = input.worldState.entities[entityId];
    const placement = desiredPlacement.get(entityId) ?? { type: "absent" as const };
    if (!current) {
      const portable = placement.type === "held" || placement.type === "worn";
      operations.push({
        op: "add_entity",
        entityId,
        entity: {
          kind: semantic.kind,
          active: semantic.active,
          presence: semantic.active && placement.type !== "absent"
            ? "present"
            : "absent",
          placement: semantic.active ? placement : { type: "absent" },
          exposure: "exposed",
          actorState: semantic.kind === "character" ? defaultActorState() : null,
          objectState: defaultObjectState({ kind: semantic.kind, portable }),
        },
      });
      continue;
    }
    if (current.kind !== semantic.kind) {
      return { ok: false, error: `world entity kind mismatch for ${entityId}` };
    }
    if (!current.active && semantic.active) {
      return { ok: false, error: `inactive world tombstone ${entityId} cannot reactivate` };
    }
    if (!semantic.active) continue;
    if (
      (placement.type === "held" || placement.type === "worn") &&
      current.objectState &&
      !current.objectState.portable
    ) {
      operations.push({
        op: "set_object_state",
        entityId,
        changes: { portable: true },
      });
    }
    if (!placementEquals(current.placement, placement)) {
      operations.push({ op: "set_placement", entityId, placement });
    }
  }

  for (const [entityId, semantic] of orderedEntities.reverse()) {
    const current = input.worldState.entities[entityId];
    if (current?.active && !semantic.active) {
      operations.push({ op: "set_entity_active", entityId, active: false });
    }
  }

  const pair = readBattleWorldPair(
    input.worldState,
    "character.a",
    "character.b",
  );
  const placementA = desiredPlacement.get("character.a");
  const placementB = desiredPlacement.get("character.b");
  if (pair && placementA && placementB) {
    const bothPresent = placementA.type !== "absent" && placementB.type !== "absent";
    const sameArea = bothPresent &&
      placementA.type === "scene" &&
      placementB.type === "scene" &&
      placementA.areaId === placementB.areaId;
    const desired = {
      distance: !bothPresent
        ? "out_of_scene" as const
        : sameArea
          ? "near" as const
          : "separate_area" as const,
      sight: !bothPresent || !sameArea ? "blocked" as const : "clear" as const,
      sound: !bothPresent
        ? "blocked" as const
        : sameArea
          ? "clear" as const
          : "partial" as const,
      orientationA: bothPresent ? "facing" as const : "indeterminate" as const,
      orientationB: bothPresent ? "facing" as const : "indeterminate" as const,
    };
    if (
      pair.distance !== desired.distance ||
      pair.sight !== desired.sight ||
      pair.sound !== desired.sound ||
      pair.orientationA !== desired.orientationA ||
      pair.orientationB !== desired.orientationB
    ) {
      operations.push({
        op: "set_pair_relation",
        entityAId: "character.a",
        entityBId: "character.b",
        ...desired,
      });
    }
  }

  const parsed = BattleWorldTransitionSchema.safeParse({
    baseRevision: input.worldState.revision,
    turn: input.turn,
    sourceEventIds: [...new Set(input.sourceEventIds)].sort(),
    operations,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid derived world transition",
    };
  }
  return { ok: true, transition: parsed.data };
}

function transitionFailure(
  state: BattleWorldState,
  code: BattleWorldTransitionError["code"],
  message: string,
  operationIndex?: number,
): ApplyBattleWorldTransitionResult {
  return {
    ok: false,
    state,
    error: { code, message, ...(operationIndex === undefined ? {} : { operationIndex }) },
  };
}

function touchWorldEntity(
  state: BattleWorldState,
  entityId: string,
  turn: number,
): BattleWorldEntity | null {
  const entity = state.entities[entityId];
  if (!entity) return null;
  entity.updatedTurn = turn;
  return entity;
}

export function applyBattleWorldTransition(input: {
  state: BattleWorldState;
  transition: unknown;
  turn: number;
  allowedSourceEventIds?: ReadonlySet<string>;
}): ApplyBattleWorldTransitionResult {
  const parsed = BattleWorldTransitionSchema.safeParse(input.transition);
  if (!parsed.success) {
    return transitionFailure(
      input.state,
      "invalid_transition",
      parsed.error.issues[0]?.message ?? "invalid world transition",
    );
  }
  const transition = parsed.data;
  if (utf8Bytes(transition) > BATTLE_WORLD_LIMITS.maxTransitionBytes) {
    return transitionFailure(
      input.state,
      "state_limit",
      "world transition exceeds byte limit",
    );
  }
  if (transition.baseRevision !== input.state.revision) {
    return transitionFailure(
      input.state,
      "stale_revision",
      `expected revision ${input.state.revision}, received ${transition.baseRevision}`,
    );
  }
  if (transition.turn !== input.turn) {
    return transitionFailure(
      input.state,
      "wrong_turn",
      `expected turn ${input.turn}, received ${transition.turn}`,
    );
  }
  if (
    input.allowedSourceEventIds &&
    transition.sourceEventIds.some((id) => !input.allowedSourceEventIds!.has(id))
  ) {
    return transitionFailure(
      input.state,
      "unknown_source_event",
      "world transition references an unknown source event",
    );
  }
  if (transition.operations.length === 0) {
    return { ok: true, state: input.state, changed: false };
  }

  const candidate = cloneJson(input.state);
  for (const [operationIndex, operation] of transition.operations.entries()) {
    if (operation.op === "add_area") {
      if (candidate.areas[operation.areaId]) {
        return transitionFailure(
          input.state,
          "existing_target",
          `world area ${operation.areaId} already exists`,
          operationIndex,
        );
      }
      candidate.areas[operation.areaId] = cloneJson(operation.area);
      continue;
    }
    if (operation.op === "add_entity") {
      if (candidate.entities[operation.entityId]) {
        return transitionFailure(
          input.state,
          "existing_target",
          `world entity ${operation.entityId} already exists`,
          operationIndex,
        );
      }
      candidate.entities[operation.entityId] = {
        ...cloneJson(operation.entity),
        createdTurn: input.turn,
        updatedTurn: input.turn,
      };
      continue;
    }
    if (operation.op === "set_area_state") {
      const area = candidate.areas[operation.areaId];
      if (!area) {
        return transitionFailure(
          input.state,
          "missing_target",
          `world area ${operation.areaId} does not exist`,
          operationIndex,
        );
      }
      Object.assign(area, cloneJson(operation.changes));
      continue;
    }
    if (operation.op === "concretize_object") {
      const entity = touchWorldEntity(
        candidate,
        operation.entityId,
        input.turn,
      );
      if (!entity?.objectState || !entity.objectProfile) {
        return transitionFailure(
          input.state,
          "missing_target",
          `world object ${operation.entityId} is not concretizable`,
          operationIndex,
        );
      }
      if (
        operation.canonicalLabel &&
        entity.objectProfile.canonicalLabel &&
        operation.canonicalLabel !== entity.objectProfile.canonicalLabel
      ) {
        return transitionFailure(
          input.state,
          "protected_entity",
          "concretization cannot replace an established canonical label",
          operationIndex,
        );
      }
      entity.objectProfile.canonicalLabel ??= operation.canonicalLabel ?? null;
      entity.objectProfile.knownOpenAspects = [
        ...new Set(operation.remainingOpenAspects),
      ];
      entity.objectProfile.concretizations = [
        ...entity.objectProfile.concretizations,
        {
          turn: input.turn,
          statement: operation.statement,
          resolvedAspects: [...new Set(operation.resolvedAspects)],
          evidenceRefs: [...new Set(operation.evidenceRefs)],
        },
      ].slice(-8);
      continue;
    }
    if (operation.op === "set_pair_relation") {
      const firstIsA = operation.entityAId < operation.entityBId;
      const firstEntityId = firstIsA ? operation.entityAId : operation.entityBId;
      const secondEntityId = firstIsA ? operation.entityBId : operation.entityAId;
      if (!candidate.entities[firstEntityId] || !candidate.entities[secondEntityId]) {
        return transitionFailure(
          input.state,
          "missing_target",
          "world pair relation references a missing entity",
          operationIndex,
        );
      }
      const relation: BattleWorldPairRelation = {
        firstEntityId,
        secondEntityId,
        distance: operation.distance,
        sight: operation.sight,
        sound: operation.sound,
        firstOrientation: firstIsA
          ? operation.orientationA
          : operation.orientationB,
        secondOrientation: firstIsA
          ? operation.orientationB
          : operation.orientationA,
        updatedTurn: input.turn,
      };
      const key = canonicalPairKey(firstEntityId, secondEntityId);
      const index = candidate.pairRelations.findIndex((item) =>
        canonicalPairKey(item.firstEntityId, item.secondEntityId) === key
      );
      if (index >= 0) candidate.pairRelations[index] = relation;
      else candidate.pairRelations.push(relation);
      continue;
    }
    if (operation.op === "remove_pair_relation") {
      const key = canonicalPairKey(operation.entityAId, operation.entityBId);
      const index = candidate.pairRelations.findIndex((item) =>
        canonicalPairKey(item.firstEntityId, item.secondEntityId) === key
      );
      if (index < 0) {
        return transitionFailure(
          input.state,
          "missing_target",
          "world pair relation does not exist",
          operationIndex,
        );
      }
      candidate.pairRelations.splice(index, 1);
      continue;
    }

    const entity = touchWorldEntity(candidate, operation.entityId, input.turn);
    if (!entity) {
      return transitionFailure(
        input.state,
        "missing_target",
        `world entity ${operation.entityId} does not exist`,
        operationIndex,
      );
    }
    if (operation.op === "set_entity_active") {
      if (operation.entityId === "character.a" || operation.entityId === "character.b") {
        return transitionFailure(
          input.state,
          "protected_entity",
          "required character world entities cannot be deactivated",
          operationIndex,
        );
      }
      if (!entity.active && operation.active) {
        return transitionFailure(
          input.state,
          "protected_entity",
          "inactive world entity tombstones cannot be reactivated",
          operationIndex,
        );
      }
      entity.active = operation.active;
      if (!operation.active) {
        entity.presence = "absent";
        entity.placement = { type: "absent" };
      }
    } else if (operation.op === "set_placement") {
      entity.placement = cloneJson(operation.placement);
      entity.presence = operation.placement.type === "absent" ? "absent" : "present";
    } else if (operation.op === "set_exposure") {
      entity.exposure = operation.exposure;
    } else if (operation.op === "set_actor_state") {
      if (!entity.actorState) {
        return transitionFailure(
          input.state,
          "protected_entity",
          `${operation.entityId} does not have actor state`,
          operationIndex,
        );
      }
      Object.assign(entity.actorState, cloneJson(operation.changes));
    } else if (operation.op === "set_object_state") {
      if (!entity.objectState) {
        return transitionFailure(
          input.state,
          "protected_entity",
          `${operation.entityId} does not have object state`,
          operationIndex,
        );
      }
      Object.assign(entity.objectState, cloneJson(operation.changes));
    }
  }

  const unchanged = JSON.stringify(candidate) === JSON.stringify(input.state);
  if (unchanged) return { ok: true, state: input.state, changed: false };
  candidate.revision += 1;
  const validated = BattleWorldStateSchema.safeParse(candidate);
  if (!validated.success) {
    return transitionFailure(
      input.state,
      "invalid_state",
      validated.error.issues[0]?.message ?? "invalid world state",
    );
  }
  return { ok: true, state: validated.data, changed: true };
}
