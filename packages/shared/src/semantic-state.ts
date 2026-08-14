import { z } from "zod";

export const SEMANTIC_STATE_LIMITS = {
  maxPatchOperations: 24,
  maxActiveEntities: 64,
  maxTotalEntities: 128,
  maxFactsPerEntity: 32,
  maxFactDepth: 3,
  maxPatchBytes: 16 * 1024,
  maxStateBytes: 16 * 1024,
  maxObservationBytes: 48 * 1024,
  maxObservedEntities: 32,
} as const;

export const SemanticIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const SemanticFactKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/);

const SemanticObjectKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/)
  .refine(
    (key) => key !== "__proto__" && key !== "prototype" && key !== "constructor",
    "unsafe semantic object key",
  );

export type SemanticScalar = string | number | boolean | null;
export type SemanticValue =
  | SemanticScalar
  | SemanticValue[]
  | { [key: string]: SemanticValue };

export const SemanticValueSchema: z.ZodType<SemanticValue> = z.lazy(() =>
  z.union([
    z.string().max(2000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(SemanticValueSchema).max(64),
    z.record(SemanticObjectKeySchema, SemanticValueSchema),
  ]),
);

export const SemanticLocationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scene"),
    area: z.string().min(1).max(240),
  }),
  z.object({
    type: z.literal("held"),
    side: z.enum(["a", "b"]),
  }),
  z.object({
    type: z.literal("attached"),
    entityId: SemanticIdSchema,
  }),
  z.object({
    type: z.literal("absent"),
  }),
]);
export type SemanticLocation = z.infer<typeof SemanticLocationSchema>;

export const SemanticVisibilitySchema = z
  .array(z.enum(["a", "b"]))
  .min(1)
  .max(2)
  .refine((sides) => new Set(sides).size === sides.length, "duplicate visible side");

export const BattleSemanticEntitySchema = z.object({
  kind: z.enum(["character", "object", "terrain", "effect", "other"]),
  label: z.string().min(1).max(240),
  location: SemanticLocationSchema,
  active: z.boolean(),
  createdTurn: z.number().int().nonnegative(),
  updatedTurn: z.number().int().nonnegative(),
  facts: z.record(SemanticFactKeySchema, SemanticValueSchema),
  /** Structured observability. Omitted means visible to both sides. */
  visibleTo: SemanticVisibilitySchema.optional(),
});
export type BattleSemanticEntity = z.infer<
  typeof BattleSemanticEntitySchema
>;

export const BattlefieldSemanticSeedEntitySchema = z.object({
  kind: z.enum(["object", "terrain", "effect", "other"]),
  label: z.string().min(1).max(240),
  location: SemanticLocationSchema,
  active: z.boolean().default(true),
  facts: z.record(SemanticFactKeySchema, SemanticValueSchema).default({}),
});
export type BattlefieldSemanticSeedEntity = z.infer<
  typeof BattlefieldSemanticSeedEntitySchema
>;

export const BattlefieldSemanticSeedSchema = z.object({
  sceneFacts: z.record(SemanticFactKeySchema, SemanticValueSchema).default({}),
  entities: z
    .record(SemanticIdSchema, BattlefieldSemanticSeedEntitySchema)
    .default({}),
});
export type BattlefieldSemanticSeed = z.infer<
  typeof BattlefieldSemanticSeedSchema
>;

export const BattleSemanticSceneSchema = z.object({
  summary: z.string().max(2000),
  facts: z.record(SemanticFactKeySchema, SemanticValueSchema),
});

function semanticReferenceIssue(state: {
  entities: Record<string, BattleSemanticEntity>;
}): { id: string; message: string } | null {
  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.location.type !== "attached") continue;
    const visited = new Set([id]);
    let targetId = entity.location.entityId;
    while (true) {
      const target = state.entities[targetId];
      if (!target) {
        return {
          id,
          message: `${id} has a missing attachment target ${targetId}`,
        };
      }
      if (visited.has(targetId)) {
        return { id, message: `${id} has a cyclic attachment chain` };
      }
      const sourceVisibility = entity.visibleTo ?? ["a", "b"];
      const targetVisibility = target.visibleTo ?? ["a", "b"];
      if (sourceVisibility.some((side) => !targetVisibility.includes(side))) {
        return {
          id,
          message: `${id} is visible outside its attachment target scope`,
        };
      }
      visited.add(targetId);
      if (target.location.type !== "attached") break;
      targetId = target.location.entityId;
    }
  }
  return null;
}

export const BattleSemanticStateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  scene: BattleSemanticSceneSchema,
  entities: z.record(SemanticIdSchema, BattleSemanticEntitySchema),
}).superRefine((state, ctx) => {
  if (utf8Bytes(state) > SEMANTIC_STATE_LIMITS.maxStateBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "semantic state exceeds byte limit",
    });
  }
  for (const id of ["character.a", "character.b"] as const) {
    const entity = state.entities[id];
    if (!entity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id],
        message: `required character entity ${id} is missing`,
      });
      continue;
    }
    if (entity.kind !== "character") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "kind"],
        message: `${id} must have kind character`,
      });
    }
    if (
      entity.visibleTo &&
      (!entity.visibleTo.includes("a") || !entity.visibleTo.includes("b"))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "visibleTo"],
        message: `${id} must remain observable to both sides`,
      });
    }
    if (entity.location.type !== "scene") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "location"],
        message: `${id} must use a scene location`,
      });
    }
  }
  const referenceIssue = semanticReferenceIssue(state);
  if (referenceIssue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entities", referenceIssue.id, "location", "entityId"],
      message: referenceIssue.message,
    });
  }
});
export type BattleSemanticState = z.infer<typeof BattleSemanticStateSchema>;

export const BattleSemanticObservedEntitySchema = BattleSemanticEntitySchema.omit({
  visibleTo: true,
});
export type BattleSemanticObservedEntity = z.infer<
  typeof BattleSemanticObservedEntitySchema
>;

export const SemanticObservationSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  scene: BattleSemanticSceneSchema,
  entities: z
    .record(SemanticIdSchema, BattleSemanticObservedEntitySchema)
    .refine(
      (entities) =>
        Object.keys(entities).length <= SEMANTIC_STATE_LIMITS.maxObservedEntities,
      "observation entity count exceeds limit",
    ),
}).superRefine((snapshot, ctx) => {
  for (const [id, entity] of Object.entries(snapshot.entities)) {
    if (
      entity.location.type === "attached" &&
      !snapshot.entities[entity.location.entityId]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", id, "location", "entityId"],
        message: "observed attachment target must be present",
      });
    }
  }
});
export type SemanticObservationSnapshot = z.infer<
  typeof SemanticObservationSnapshotSchema
>;

const AddOperationSchema = z.object({
  op: z.literal("add"),
  path: z.string().min(1).max(500),
  value: SemanticValueSchema,
});
const ReplaceOperationSchema = z.object({
  op: z.literal("replace"),
  path: z.string().min(1).max(500),
  value: SemanticValueSchema,
});
const RemoveOperationSchema = z.object({
  op: z.literal("remove"),
  path: z.string().min(1).max(500),
});

export const SemanticPatchOperationSchema = z.discriminatedUnion("op", [
  AddOperationSchema,
  ReplaceOperationSchema,
  RemoveOperationSchema,
]);
export type SemanticPatchOperation = z.infer<
  typeof SemanticPatchOperationSchema
>;

export const TurnSemanticPatchSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  turn: z.number().int().nonnegative(),
  sourceEventIds: z.array(SemanticIdSchema).max(32).default([]),
  operations: z
    .array(SemanticPatchOperationSchema)
    .max(SEMANTIC_STATE_LIMITS.maxPatchOperations),
});
export type TurnSemanticPatch = z.infer<typeof TurnSemanticPatchSchema>;

export const SemanticObservationStateSchema = z.object({
  snapshot: SemanticObservationSnapshotSchema,
  latestDiff: z.object({
    fromRevision: z.number().int().nonnegative(),
    toRevision: z.number().int().nonnegative(),
    operations: z.array(SemanticPatchOperationSchema).max(64),
  }),
}).superRefine((observation, ctx) => {
  if (utf8Bytes(observation) > SEMANTIC_STATE_LIMITS.maxObservationBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "semantic observation exceeds byte limit",
    });
  }
  if (observation.latestDiff.toRevision !== observation.snapshot.revision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latestDiff", "toRevision"],
      message: "observation diff must end at snapshot revision",
    });
  }
  if (observation.latestDiff.fromRevision > observation.latestDiff.toRevision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latestDiff", "fromRevision"],
      message: "observation diff revision order is invalid",
    });
  }
});
export type SemanticObservationState = z.infer<
  typeof SemanticObservationStateSchema
>;

export type SemanticStateValidationError = {
  code:
    | "invalid_patch"
    | "stale_revision"
    | "wrong_turn"
    | "patch_too_large"
    | "invalid_path"
    | "protected_path"
    | "missing_path"
    | "existing_path"
    | "invalid_state"
    | "state_limit";
  message: string;
  operationIndex?: number;
};

export type ApplySemanticPatchResult =
  | {
      ok: true;
      state: BattleSemanticState;
      changed: boolean;
    }
  | {
      ok: false;
      state: BattleSemanticState;
      error: SemanticStateValidationError;
    };

const PROTECTED_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function semanticDepth(value: SemanticValue, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;
  let maximum = depth + 1;
  if (Array.isArray(value)) {
    for (const item of value) {
      maximum = Math.max(maximum, semanticDepth(item, depth + 1));
    }
    return maximum;
  }
  for (const item of Object.values(value)) {
    maximum = Math.max(maximum, semanticDepth(item, depth + 1));
  }
  return maximum;
}

function validateStateLimits(
  state: BattleSemanticState,
): SemanticStateValidationError | null {
  const entities = Object.values(state.entities);
  if (entities.length > SEMANTIC_STATE_LIMITS.maxTotalEntities) {
    return {
      code: "state_limit",
      message: `semantic entity count exceeds ${SEMANTIC_STATE_LIMITS.maxTotalEntities}`,
    };
  }
  if (
    entities.filter((entity) => entity.active).length >
    SEMANTIC_STATE_LIMITS.maxActiveEntities
  ) {
    return {
      code: "state_limit",
      message: `active semantic entity count exceeds ${SEMANTIC_STATE_LIMITS.maxActiveEntities}`,
    };
  }
  for (const [id, entity] of Object.entries(state.entities)) {
    if (
      Object.keys(entity.facts).length >
      SEMANTIC_STATE_LIMITS.maxFactsPerEntity
    ) {
      return {
        code: "state_limit",
        message: `${id} has too many semantic facts`,
      };
    }
    if (semanticDepth(entity.facts) > SEMANTIC_STATE_LIMITS.maxFactDepth) {
      return {
        code: "state_limit",
        message: `${id} semantic facts exceed maximum depth`,
      };
    }
  }
  if (semanticDepth(state.scene.facts) > SEMANTIC_STATE_LIMITS.maxFactDepth) {
    return {
      code: "state_limit",
      message: "scene semantic facts exceed maximum depth",
    };
  }
  return null;
}

export function validateBattleSemanticState(
  input: unknown,
): { success: true; data: BattleSemanticState } | {
  success: false;
  error: SemanticStateValidationError;
} {
  const parsed = BattleSemanticStateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "invalid_state",
        message: parsed.error.issues[0]?.message ?? "invalid semantic state",
      },
    };
  }
  const limitError = validateStateLimits(parsed.data);
  if (limitError) return { success: false, error: limitError };
  return { success: true, data: parsed.data };
}

function boundedText(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function fallbackFieldEntities(input: {
  scene: string;
  obstacles?: string[];
}): Record<string, BattlefieldSemanticSeedEntity> {
  const area = boundedText(input.scene, 240) || "scene";
  return Object.fromEntries(
    (input.obstacles ?? []).slice(0, 32).map((label, index) => [
      `obstacle.${index + 1}`,
      {
        kind: "object" as const,
        label: boundedText(label, 240) || `obstacle ${index + 1}`,
        location: { type: "scene" as const, area },
        active: true,
        facts: {
          source: "battlefield_obstacle",
        },
      },
    ]),
  );
}

export function createBattleSemanticState(input: {
  scene: string;
  notes?: string;
  terrain?: string;
  obstacles?: string[];
  conditions?: string[];
  seed?: BattlefieldSemanticSeed | null;
  sideA: {
    displayName: string;
    appearanceSummary?: string;
    initialArea?: string;
  };
  sideB: {
    displayName: string;
    appearanceSummary?: string;
    initialArea?: string;
  };
}): BattleSemanticState {
  const parsedSeed = BattlefieldSemanticSeedSchema.safeParse(input.seed ?? {});
  const seed = parsedSeed.success ? parsedSeed.data : null;
  const seedEntities = seed && Object.keys(seed.entities).length > 0
    ? seed.entities
    : fallbackFieldEntities(input);
  const area = boundedText(input.scene, 240) || "scene";
  const areaA = boundedText(input.sideA.initialArea, 240) || area;
  const areaB = boundedText(input.sideB.initialArea, 240) || area;
  const conditions = input.conditions ?? [];
  const sceneFacts: Record<string, SemanticValue> = {
    ...(boundedText(input.notes, 2000)
      ? { notes: boundedText(input.notes, 2000) }
      : {}),
    ...(boundedText(input.terrain, 1000)
      ? { terrain: boundedText(input.terrain, 1000) }
      : {}),
    ...(conditions.length > 0
      ? { conditions: conditions.slice(0, 32).map((item) => boundedText(item, 240)) }
      : {}),
    ...(seed?.sceneFacts ?? {}),
  };
  const fieldEntities = Object.fromEntries(
    Object.entries(seedEntities)
      .filter(([id]) => id !== "character.a" && id !== "character.b")
      .slice(0, SEMANTIC_STATE_LIMITS.maxTotalEntities - 2)
      .map(([id, entity]) => [
        id,
        {
          ...cloneJson(entity),
          createdTurn: 0,
          updatedTurn: 0,
        },
      ]),
  );
  const candidate: BattleSemanticState = {
    schemaVersion: 1,
    revision: 0,
    scene: {
      summary: boundedText(input.scene, 2000),
      facts: sceneFacts,
    },
    entities: {
      ...fieldEntities,
      "character.a": {
        kind: "character",
        label: boundedText(input.sideA.displayName, 240) || "side A",
        location: { type: "scene", area: areaA },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {
          baseline_appearance: boundedText(input.sideA.appearanceSummary, 2000),
          visible_conditions: {},
          appearance_changes: {},
        },
      },
      "character.b": {
        kind: "character",
        label: boundedText(input.sideB.displayName, 240) || "side B",
        location: { type: "scene", area: areaB },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {
          baseline_appearance: boundedText(input.sideB.appearanceSummary, 2000),
          visible_conditions: {},
          appearance_changes: {},
        },
      },
    },
  };
  const validated = validateBattleSemanticState(candidate);
  if (validated.success) return validated.data;
  return {
    schemaVersion: 1,
    revision: 0,
    scene: {
      summary: boundedText(input.scene, 2000),
      facts: {},
    },
    entities: {
      "character.a": {
        kind: "character",
        label: boundedText(input.sideA.displayName, 240) || "side A",
        location: { type: "scene", area: areaA },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {},
      },
      "character.b": {
        kind: "character",
        label: boundedText(input.sideB.displayName, 240) || "side B",
        location: { type: "scene", area: areaB },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {},
      },
    },
  };
}

export function escapeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function parseJsonPointer(path: string): string[] | null {
  if (!path.startsWith("/") || path === "/") return null;
  const raw = path.slice(1).split("/");
  const segments: string[] = [];
  for (const part of raw) {
    if (/~(?:[^01]|$)/.test(part)) return null;
    const decoded = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!decoded || PROTECTED_SEGMENTS.has(decoded)) return null;
    segments.push(decoded);
  }
  return segments;
}

function pathPolicy(
  segments: string[],
  operation: SemanticPatchOperation,
): SemanticStateValidationError | null {
  const [root, id, field] = segments;
  if (root === "scene") {
    if (id === "summary" && segments.length === 2 && operation.op !== "remove") {
      return null;
    }
    if (id === "facts" && segments.length >= 3) return null;
    return {
      code: "protected_path",
      message: "only scene.summary and scene.facts leaves are patchable",
    };
  }
  if (root !== "entities" || !id) {
    return {
      code: "protected_path",
      message: "semantic patches may only edit scene or entities",
    };
  }
  if (segments.length === 2) {
    if (operation.op !== "add") {
      return {
        code: "protected_path",
        message: "entities are tombstoned and cannot be replaced or removed",
      };
    }
    if (id === "character.a" || id === "character.b") {
      return {
        code: "protected_path",
        message: "required character entities cannot be added by a turn patch",
      };
    }
    return null;
  }
  if (field === "kind" || field === "createdTurn" || field === "updatedTurn") {
    return {
      code: "protected_path",
      message: `${field} is server-owned`,
    };
  }
  if (
    (id === "character.a" || id === "character.b") &&
    (field === "active" || field === "label")
  ) {
    return {
      code: "protected_path",
      message: "required character identity and lifecycle are protected",
    };
  }
  if (operation.op === "remove" && field !== "facts") {
    return {
      code: "protected_path",
      message: "remove is permitted only for disposable fact leaves",
    };
  }
  if (field === "facts" && segments.length >= 4) return null;
  if (
    (field === "label" ||
      field === "location" ||
      field === "active" ||
      field === "visibleTo") &&
    segments.length === 3 &&
    operation.op !== "remove"
  ) {
    return null;
  }
  return {
    code: "protected_path",
    message: "entity patch path is not permitted",
  };
}

function locateParent(
  document: Record<string, unknown>,
  segments: string[],
): { parent: Record<string, unknown>; key: string } | null {
  let cursor: unknown = document;
  for (const segment of segments.slice(0, -1)) {
    if (
      !cursor ||
      typeof cursor !== "object" ||
      Array.isArray(cursor) ||
      !Object.hasOwn(cursor, segment)
    ) {
      return null;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    return null;
  }
  return {
    parent: cursor as Record<string, unknown>,
    key: segments.at(-1)!,
  };
}

function touchEntity(
  state: BattleSemanticState,
  segments: string[],
  turn: number,
): void {
  if (segments[0] !== "entities" || !segments[1]) return;
  const entity = state.entities[segments[1]];
  if (entity) entity.updatedTurn = turn;
}

export function applyTurnSemanticPatch(input: {
  state: BattleSemanticState;
  patch: unknown;
  turn: number;
  allowedSourceEventIds?: ReadonlySet<string>;
}): ApplySemanticPatchResult {
  const original = input.state;
  const parsedPatch = TurnSemanticPatchSchema.safeParse(input.patch);
  if (!parsedPatch.success) {
    return {
      ok: false,
      state: original,
      error: {
        code: "invalid_patch",
        message: parsedPatch.error.issues[0]?.message ?? "invalid semantic patch",
      },
    };
  }
  const patch = parsedPatch.data;
  if (utf8Bytes(patch) > SEMANTIC_STATE_LIMITS.maxPatchBytes) {
    return {
      ok: false,
      state: original,
      error: {
        code: "patch_too_large",
        message: "semantic patch payload exceeds byte limit",
      },
    };
  }
  if (patch.baseRevision !== original.revision) {
    return {
      ok: false,
      state: original,
      error: {
        code: "stale_revision",
        message: `expected revision ${original.revision}, received ${patch.baseRevision}`,
      },
    };
  }
  if (patch.turn !== input.turn) {
    return {
      ok: false,
      state: original,
      error: {
        code: "wrong_turn",
        message: `expected turn ${input.turn}, received ${patch.turn}`,
      },
    };
  }
  if (
    input.allowedSourceEventIds &&
    patch.sourceEventIds.some((id) => !input.allowedSourceEventIds!.has(id))
  ) {
    return {
      ok: false,
      state: original,
      error: {
        code: "invalid_patch",
        message: "semantic patch references an unknown source event",
      },
    };
  }
  if (patch.operations.length === 0) {
    return { ok: true, state: original, changed: false };
  }

  const candidate = cloneJson(original);
  const document = candidate as unknown as Record<string, unknown>;
  for (const [operationIndex, operation] of patch.operations.entries()) {
    const segments = parseJsonPointer(operation.path);
    if (!segments) {
      return {
        ok: false,
        state: original,
        error: {
          code: "invalid_path",
          message: `invalid JSON Pointer ${operation.path}`,
          operationIndex,
        },
      };
    }
    const policyError = pathPolicy(segments, operation);
    if (policyError) {
      return {
        ok: false,
        state: original,
        error: { ...policyError, operationIndex },
      };
    }
    if (
      segments[0] === "entities" &&
      segments[2] === "active" &&
      candidate.entities[segments[1]!]?.active === false &&
      operation.op !== "remove" &&
      operation.value === true
    ) {
      return {
        ok: false,
        state: original,
        error: {
          code: "protected_path",
          message: "inactive entity tombstones cannot be reactivated",
          operationIndex,
        },
      };
    }
    const located = locateParent(document, segments);
    if (!located) {
      return {
        ok: false,
        state: original,
        error: {
          code: "missing_path",
          message: `parent path does not exist for ${operation.path}`,
          operationIndex,
        },
      };
    }
    const exists = Object.hasOwn(located.parent, located.key);
    if (operation.op === "add") {
      if (exists) {
        return {
          ok: false,
          state: original,
          error: {
            code: "existing_path",
            message: `add target already exists at ${operation.path}`,
            operationIndex,
          },
        };
      }
      located.parent[located.key] = cloneJson(operation.value);
      if (segments[0] === "entities" && segments.length === 2) {
        const raw = located.parent[located.key];
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          (raw as Record<string, unknown>).createdTurn = input.turn;
          (raw as Record<string, unknown>).updatedTurn = input.turn;
        }
      }
    } else if (operation.op === "replace") {
      if (!exists) {
        return {
          ok: false,
          state: original,
          error: {
            code: "missing_path",
            message: `replace target does not exist at ${operation.path}`,
            operationIndex,
          },
        };
      }
      located.parent[located.key] = cloneJson(operation.value);
    } else {
      if (!exists) {
        return {
          ok: false,
          state: original,
          error: {
            code: "missing_path",
            message: `remove target does not exist at ${operation.path}`,
            operationIndex,
          },
        };
      }
      delete located.parent[located.key];
    }
    touchEntity(candidate, segments, input.turn);
  }
  candidate.revision += 1;
  const validated = validateBattleSemanticState(candidate);
  if (!validated.success) {
    return {
      ok: false,
      state: original,
      error: validated.error,
    };
  }
  for (const [id, entity] of Object.entries(validated.data.entities)) {
    if (
      entity.location.type === "attached" &&
      (!validated.data.entities[entity.location.entityId] ||
        entity.location.entityId === id)
    ) {
      return {
        ok: false,
        state: original,
        error: {
          code: "invalid_state",
          message: `${id} has an invalid attached location`,
        },
      };
    }
  }
  return { ok: true, state: validated.data, changed: true };
}

export function semanticValueAtPointer(
  state: BattleSemanticState,
  path: string,
): unknown {
  const segments = parseJsonPointer(path);
  if (!segments) return undefined;
  let cursor: unknown = state;
  for (const segment of segments) {
    if (
      !cursor ||
      typeof cursor !== "object" ||
      Array.isArray(cursor) ||
      !Object.hasOwn(cursor, segment)
    ) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cloneJson(cursor);
}

function diffValues(
  before: unknown,
  after: unknown,
  path: string,
  operations: SemanticPatchOperation[],
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const beforeObject = before && typeof before === "object" && !Array.isArray(before);
  const afterObject = after && typeof after === "object" && !Array.isArray(after);
  if (!beforeObject || !afterObject) {
    operations.push({
      op: "replace",
      path,
      value: cloneJson(after) as SemanticValue,
    });
    return;
  }
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  for (const key of [...keys].sort()) {
    const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
    if (!Object.hasOwn(afterRecord, key)) {
      operations.push({ op: "remove", path: childPath });
    } else if (!Object.hasOwn(beforeRecord, key)) {
      operations.push({
        op: "add",
        path: childPath,
        value: cloneJson(afterRecord[key]) as SemanticValue,
      });
    } else {
      diffValues(beforeRecord[key], afterRecord[key], childPath, operations);
    }
  }
}

export function diffBattleSemanticStates(
  before: BattleSemanticState,
  after: BattleSemanticState,
): SemanticPatchOperation[] {
  const operations: SemanticPatchOperation[] = [];
  diffValues(before.scene, after.scene, "/scene", operations);
  diffValues(before.entities, after.entities, "/entities", operations);
  return operations;
}

export type SemanticObserver = "a" | "b" | "public";

function isVisibleTo(
  entity: BattleSemanticEntity,
  observer: SemanticObserver,
): boolean {
  const visibleTo = entity.visibleTo ?? ["a", "b"];
  return observer === "public"
    ? visibleTo.includes("a") && visibleTo.includes("b")
    : visibleTo.includes(observer);
}

/** Deterministic projection from structured visibility; never interprets prose. */
export function projectSemanticObservationSnapshot(
  state: BattleSemanticState,
  observer: SemanticObserver,
  priorityEntityIds: ReadonlySet<string> = new Set(),
): SemanticObservationSnapshot {
  const visible = new Map(
    Object.entries(state.entities)
      .filter(([, entity]) => isVisibleTo(entity, observer)),
  );
  const ranked = [...visible.entries()]
    .sort(([idA, a], [idB, b]) => {
      const rank = (id: string, entity: BattleSemanticEntity) => {
        if (id === "character.a" || id === "character.b") return 0;
        if (priorityEntityIds.has(id)) return 1;
        if (entity.location.type === "held") return 2;
        if (entity.location.type === "attached") return 3;
        return entity.active ? 4 : 5;
      };
      const rankDelta = rank(idA, a) - rank(idB, b);
      if (rankDelta !== 0) return rankDelta;
      const turnDelta = b.updatedTurn - a.updatedTurn;
      return turnDelta !== 0 ? turnDelta : idA < idB ? -1 : idA > idB ? 1 : 0;
    });
  const selected = new Map<string, BattleSemanticEntity>();
  for (const [id] of ranked) {
    const chain: string[] = [];
    const seen = new Set<string>();
    let validChain = true;
    let cursor: string | undefined = id;
    while (cursor && !selected.has(cursor)) {
      if (seen.has(cursor)) {
        validChain = false;
        break;
      }
      seen.add(cursor);
      const entity = visible.get(cursor);
      if (!entity) {
        validChain = false;
        break;
      }
      chain.unshift(cursor);
      cursor = entity.location.type === "attached"
        ? entity.location.entityId
        : undefined;
    }
    if (!validChain) continue;
    const additions = chain.filter((entityId) => !selected.has(entityId));
    if (
      selected.size + additions.length >
      SEMANTIC_STATE_LIMITS.maxObservedEntities
    ) {
      continue;
    }
    for (const entityId of additions) {
      selected.set(entityId, visible.get(entityId)!);
    }
    if (selected.size === SEMANTIC_STATE_LIMITS.maxObservedEntities) break;
  }
  const entities = Object.fromEntries([...selected].map(([id, entity]) => {
    const { visibleTo: _visibleTo, ...observed } = entity;
    return [id, observed];
  }));
  return SemanticObservationSnapshotSchema.parse({
    revision: state.revision,
    scene: state.scene,
    entities,
  });
}

export function buildSemanticObservationState(input: {
  before: BattleSemanticState;
  after: BattleSemanticState;
  observer: SemanticObserver;
  previousSnapshot?: SemanticObservationSnapshot;
}): SemanticObservationState {
  const canonicalDiff = diffBattleSemanticStates(input.before, input.after);
  const priorityEntityIds = new Set(canonicalDiff.flatMap((operation) => {
    const segments = parseJsonPointer(operation.path);
    return segments?.[0] === "entities" && segments[1] ? [segments[1]] : [];
  }));
  const before = input.previousSnapshot?.revision === input.before.revision
    ? SemanticObservationSnapshotSchema.parse(input.previousSnapshot)
    : projectSemanticObservationSnapshot(
        input.before,
        input.observer,
        priorityEntityIds,
      );
  const snapshot = input.after.revision === input.before.revision &&
      input.previousSnapshot?.revision === input.before.revision
    ? before
    : projectSemanticObservationSnapshot(
        input.after,
        input.observer,
        priorityEntityIds,
      );
  const operations: SemanticPatchOperation[] = [];
  diffValues(before.scene, snapshot.scene, "/scene", operations);
  diffValues(before.entities, snapshot.entities, "/entities", operations);
  return SemanticObservationStateSchema.parse({
    snapshot,
    latestDiff: {
      fromRevision: before.revision,
      toRevision: snapshot.revision,
      operations,
    },
  });
}
