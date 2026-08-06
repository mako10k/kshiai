import { z } from "zod";
import {
  BattleWorldTransitionSchema,
  readBattleWorldPair,
  type BattleWorldState,
  type BattleWorldTransition,
  type WorldPlacement,
} from "./battle-world.js";
import {
  FreeActionResolutionReceiptSchema,
  type FreeActionResolutionReceipt,
} from "./free-action.js";
import {
  CommittedMechanicalEvidenceSetSchema,
  type CommittedMechanicalEvidence,
} from "./perception.js";
import {
  SemanticValueSchema,
  TurnSemanticPatchSchema,
  type BattleSemanticState,
  type SemanticValue,
  type TurnSemanticPatch,
} from "./semantic-state.js";

export const CANONICAL_PATCH_POC_LIMITS = {
  maxAssertions: 96,
  maxRetractions: 96,
  maxCausalLinks: 192,
  maxTouchedRefs: 64,
  maxSourceRefs: 32,
  maxPatchBytes: 16 * 1024,
} as const;

const CanonicalRefSchema = z.string().min(1).max(200);
const FactRefSchema = z.string().min(1).max(240);

export const CanonicalFactAuthoritySchema = z.enum([
  "deterministic_resolver",
  "validated_semantic_transition",
  "validated_world_transition",
  "free_action_commit",
  "repair",
]);
export type CanonicalFactAuthority = z.infer<
  typeof CanonicalFactAuthoritySchema
>;

export const CanonicalFactSubsystemSchema = z.enum([
  "mechanical",
  "semantic",
  "world",
  "free_action",
  "repair",
]);
export type CanonicalFactSubsystem = z.infer<
  typeof CanonicalFactSubsystemSchema
>;

export const CanonicalTemporalPointSchema = z.object({
  turn: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative().optional(),
}).strict();
export type CanonicalTemporalPoint = z.infer<
  typeof CanonicalTemporalPointSchema
>;

export const CanonicalFactProvenanceSchema = z.object({
  subsystem: CanonicalFactSubsystemSchema,
  authority: CanonicalFactAuthoritySchema,
  sourceRef: CanonicalRefSchema,
  sourceEventRefs: z.array(CanonicalRefSchema)
    .max(CANONICAL_PATCH_POC_LIMITS.maxSourceRefs),
}).strict();
export type CanonicalFactProvenance = z.infer<
  typeof CanonicalFactProvenanceSchema
>;

export const ShadowCanonicalFactSchema = z.object({
  id: FactRefSchema,
  subjectRef: CanonicalRefSchema,
  predicate: z.string().min(1).max(160),
  objectRef: CanonicalRefSchema.optional(),
  value: SemanticValueSchema.optional(),
  validFrom: CanonicalTemporalPointSchema,
  validTo: CanonicalTemporalPointSchema.optional(),
  provenance: CanonicalFactProvenanceSchema,
}).strict().superRefine((fact, ctx) => {
  if (fact.validTo && fact.validTo.turn < fact.validFrom.turn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validTo"],
      message: "fact validity end precedes its start",
    });
  }
});
export type ShadowCanonicalFact = z.infer<typeof ShadowCanonicalFactSchema>;

export const ShadowCausalLinkSchema = z.object({
  sourceRef: CanonicalRefSchema,
  targetFactRef: FactRefSchema,
  relation: z.enum(["created", "ended", "modified", "triggered"]),
}).strict();
export type ShadowCausalLink = z.infer<typeof ShadowCausalLinkSchema>;

export const ShadowCanonicalPatchSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow"),
  sourceRef: CanonicalRefSchema,
  assertions: z.array(ShadowCanonicalFactSchema)
    .max(CANONICAL_PATCH_POC_LIMITS.maxAssertions),
  retractions: z.array(FactRefSchema)
    .max(CANONICAL_PATCH_POC_LIMITS.maxRetractions),
  causalLinks: z.array(ShadowCausalLinkSchema)
    .max(CANONICAL_PATCH_POC_LIMITS.maxCausalLinks),
  touchedRefs: z.array(CanonicalRefSchema)
    .max(CANONICAL_PATCH_POC_LIMITS.maxTouchedRefs),
}).strict().superRefine((patch, ctx) => {
  const assertionIds = patch.assertions.map((fact) => fact.id);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(assertionIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assertions"],
      message: "patch assertion fact IDs must be unique",
    });
  }
  if (!unique(patch.retractions)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retractions"],
      message: "patch retractions must be unique",
    });
  }
  if (!unique(patch.touchedRefs)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["touchedRefs"],
      message: "patch touched references must be unique",
    });
  }
  const retracted = new Set(patch.retractions);
  if (assertionIds.some((id) => retracted.has(id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retractions"],
      message: "a patch cannot assert and retract the same fact ID",
    });
  }
});
export type ShadowCanonicalPatch = z.infer<typeof ShadowCanonicalPatchSchema>;

export type CanonicalFactRefLookup = Record<string, string>;

export function canonicalFactSlotKey(input: {
  subjectRef: string;
  predicate: string;
  objectRef?: string;
}): string {
  return JSON.stringify([
    input.subjectRef,
    input.predicate,
    input.objectRef ?? null,
  ]);
}

export const ShadowPatchConversionResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("converted"),
      patch: ShadowCanonicalPatchSchema,
    }).strict(),
    z.object({
      status: z.literal("indeterminate"),
      reason: z.string().min(1).max(400),
      unsupportedOperationIndexes: z.array(z.number().int().nonnegative())
        .max(96),
    }).strict(),
  ],
);
export type ShadowPatchConversionResult = z.infer<
  typeof ShadowPatchConversionResultSchema
>;

const PatchAuditIssueCodeSchema = z.enum([
  "invalid_schema",
  "patch_too_large",
  "unknown_entity_reference",
  "missing_retraction",
  "direct_conflict",
  "forbidden_state",
  "missing_causal_link",
  "invalid_causal_target",
  "incomplete_touched_refs",
  "authority_mismatch",
  "incomplete_context",
]);
export type PatchAuditIssueCode = z.infer<typeof PatchAuditIssueCodeSchema>;

export const ShadowPatchAuditIssueSchema = z.object({
  code: PatchAuditIssueCodeSchema,
  factRefs: z.array(FactRefSchema).max(96),
  entityRefs: z.array(CanonicalRefSchema).max(64),
  explanation: z.string().min(1).max(500),
}).strict();
export type ShadowPatchAuditIssue = z.infer<
  typeof ShadowPatchAuditIssueSchema
>;

export const ShadowPatchAuditResultSchema = z.object({
  verdict: z.enum(["no_issue_found", "issue_found", "indeterminate"]),
  checkedScope: z.object({
    factRefs: z.array(FactRefSchema).max(512),
    entityRefs: z.array(CanonicalRefSchema).max(128),
    patchBytes: z.number().int().nonnegative(),
  }).strict(),
  issues: z.array(ShadowPatchAuditIssueSchema).max(512),
}).strict();
export type ShadowPatchAuditResult = z.infer<
  typeof ShadowPatchAuditResultSchema
>;

export type ShadowPatchAuditContext = {
  knownEntityRefs: readonly string[];
  existingFacts: readonly ShadowCanonicalFact[];
  maxPatchBytes?: number;
  contextComplete?: boolean;
};

type ConversionAuthority = {
  subsystem: CanonicalFactSubsystem;
  authority: CanonicalFactAuthority;
  sourceRef: string;
  sourceEventRefs: string[];
  turn: number;
  revision?: number;
};

type FactChange = {
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  value?: SemanticValue;
  priorFactRef?: string;
  causalSourceRef: string;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function factRef(input: {
  subsystem: CanonicalFactSubsystem;
  turn: number;
  index: number;
}): string {
  return `shadow.fact.${input.subsystem}.${input.turn}.${String(input.index + 1)
    .padStart(4, "0")}`;
}

function buildPatch(input: {
  sourceRef: string;
  authority: ConversionAuthority;
  changes: FactChange[];
  endedFactRefs?: Array<{
    factRef: string;
    subjectRef: string;
    causalSourceRef: string;
  }>;
}): ShadowCanonicalPatch {
  const assertions: ShadowCanonicalFact[] = input.changes.map((change, index) =>
    ShadowCanonicalFactSchema.parse({
      id: factRef({
        subsystem: input.authority.subsystem,
        turn: input.authority.turn,
        index,
      }),
      subjectRef: change.subjectRef,
      predicate: change.predicate,
      ...(change.objectRef ? { objectRef: change.objectRef } : {}),
      ...(Object.hasOwn(change, "value") ? { value: clone(change.value) } : {}),
      validFrom: {
        turn: input.authority.turn,
        ...(input.authority.revision === undefined
          ? {}
          : { revision: input.authority.revision }),
      },
      provenance: {
        subsystem: input.authority.subsystem,
        authority: input.authority.authority,
        sourceRef: input.authority.sourceRef,
        sourceEventRefs: uniqueSorted(input.authority.sourceEventRefs),
      },
    })
  );
  const ended = [
    ...input.changes.flatMap((change) => change.priorFactRef
      ? [{ factRef: change.priorFactRef, causalSourceRef: change.causalSourceRef }]
      : []),
    ...(input.endedFactRefs ?? []),
  ];
  const assertionLinks = assertions.map((assertion, index) => ({
    sourceRef: input.changes[index]!.causalSourceRef,
    targetFactRef: assertion.id,
    relation: input.changes[index]!.priorFactRef
      ? "modified" as const
      : "created" as const,
  }));
  return ShadowCanonicalPatchSchema.parse({
    schemaVersion: 1,
    mode: "shadow",
    sourceRef: input.sourceRef,
    assertions,
    retractions: uniqueSorted(ended.map((item) => item.factRef)),
    causalLinks: [
      ...assertionLinks,
      ...ended.map((item) => ({
        sourceRef: item.causalSourceRef,
        targetFactRef: item.factRef,
        relation: "ended" as const,
      })),
    ],
    touchedRefs: uniqueSorted([
      ...input.changes.map((change) => change.subjectRef),
      ...(input.endedFactRefs ?? []).map((item) => item.subjectRef),
    ]),
  });
}

function indeterminate(
  reason: string,
  unsupportedOperationIndexes: number[] = [],
): ShadowPatchConversionResult {
  return ShadowPatchConversionResultSchema.parse({
    status: "indeterminate",
    reason,
    unsupportedOperationIndexes,
  });
}

function converted(patch: ShadowCanonicalPatch): ShadowPatchConversionResult {
  return ShadowPatchConversionResultSchema.parse({ status: "converted", patch });
}

function priorFactRef(input: {
  lookup: CanonicalFactRefLookup;
  subjectRef: string;
  predicate: string;
  objectRef?: string;
}): string | undefined {
  return input.lookup[canonicalFactSlotKey(input)];
}

export function convertMechanicalEvidenceToShadowPatch(input: {
  evidence: readonly CommittedMechanicalEvidence[];
  existingFactRefs: CanonicalFactRefLookup;
}): ShadowPatchConversionResult {
  const evidence = CommittedMechanicalEvidenceSetSchema.parse(input.evidence);
  const changed = evidence.filter((item) => item.delta !== 0);
  const missing = changed.filter((item) => !priorFactRef({
    lookup: input.existingFactRefs,
    subjectRef: item.target.entityId,
    predicate: `parameter.${item.parameterKey}`,
  }));
  if (missing.length > 0) {
    return indeterminate(
      `mechanical conversion is missing ${missing.length} current fact reference(s)`,
    );
  }
  const turn = evidence[0]?.turn ?? 0;
  const sourceRef = `mechanical-turn:${turn}`;
  const changes: FactChange[] = changed.map((item) => ({
    subjectRef: item.target.entityId,
    predicate: `parameter.${item.parameterKey}`,
    value: item.afterValue,
    priorFactRef: priorFactRef({
      lookup: input.existingFactRefs,
      subjectRef: item.target.entityId,
      predicate: `parameter.${item.parameterKey}`,
    }),
    causalSourceRef: item.sourceActionId ?? item.basisEventIds[0] ?? item.evidenceId,
  }));
  return converted(buildPatch({
    sourceRef,
    authority: {
      subsystem: "mechanical",
      authority: "deterministic_resolver",
      sourceRef,
      sourceEventRefs: evidence.flatMap((item) => item.basisEventIds),
      turn,
    },
    changes,
  }));
}

function decodePointer(path: string): string[] | null {
  if (!path.startsWith("/") || path === "/") return null;
  const segments: string[] = [];
  for (const raw of path.slice(1).split("/")) {
    if (/~(?:[^01]|$)/u.test(raw)) return null;
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!segment || ["__proto__", "prototype", "constructor"].includes(segment)) {
      return null;
    }
    segments.push(segment);
  }
  return segments;
}

type SemanticSlot = {
  subjectRef: string;
  predicate: string;
};

function semanticSlot(segments: string[]): SemanticSlot | null {
  if (segments[0] === "scene" && segments[1] === "summary") {
    return { subjectRef: "battle.scene", predicate: "scene.summary" };
  }
  if (segments[0] === "scene" && segments[1] === "facts" && segments[2]) {
    return {
      subjectRef: "battle.scene",
      predicate: `scene.${segments[2]}`,
    };
  }
  if (segments[0] !== "entities" || !segments[1] || !segments[2]) return null;
  const subjectRef = segments[1];
  if (segments[2] === "facts" && segments[3]) {
    return { subjectRef, predicate: `semantic.${segments[3]}` };
  }
  const predicate = {
    label: "semantic.label",
    location: "semantic.location",
    active: "entity.active",
    visibleTo: "semantic.visible_to",
  }[segments[2]];
  return predicate ? { subjectRef, predicate } : null;
}

function semanticSlotValue(
  state: BattleSemanticState,
  slot: SemanticSlot,
): { present: boolean; value?: SemanticValue; objectRef?: string } {
  if (slot.subjectRef === "battle.scene") {
    if (slot.predicate === "scene.summary") {
      return { present: true, value: state.scene.summary };
    }
    const key = slot.predicate.slice("scene.".length);
    return Object.hasOwn(state.scene.facts, key)
      ? { present: true, value: clone(state.scene.facts[key]) }
      : { present: false };
  }
  const entity = state.entities[slot.subjectRef];
  if (!entity) return { present: false };
  if (slot.predicate === "semantic.label") {
    return { present: true, value: entity.label };
  }
  if (slot.predicate === "semantic.location") {
    return {
      present: true,
      value: clone(entity.location),
      ...(entity.location.type === "attached"
        ? { objectRef: entity.location.entityId }
        : {}),
    };
  }
  if (slot.predicate === "entity.active") {
    return { present: true, value: entity.active };
  }
  if (slot.predicate === "semantic.visible_to") {
    return { present: true, value: clone(entity.visibleTo ?? null) };
  }
  const key = slot.predicate.slice("semantic.".length);
  return Object.hasOwn(entity.facts, key)
    ? { present: true, value: clone(entity.facts[key]) }
    : { present: false };
}

export function convertSemanticTransitionToShadowPatch(input: {
  before: BattleSemanticState;
  after: BattleSemanticState;
  patch: TurnSemanticPatch;
  existingFactRefs: CanonicalFactRefLookup;
}): ShadowPatchConversionResult {
  const patch = TurnSemanticPatchSchema.parse(input.patch);
  if (input.after.revision < input.before.revision) {
    return indeterminate("semantic conversion received a reversed revision");
  }
  const slots = new Map<string, SemanticSlot>();
  const unsupported: number[] = [];
  for (const [index, operation] of patch.operations.entries()) {
    const segments = decodePointer(operation.path);
    const slot = segments ? semanticSlot(segments) : null;
    if (!slot) {
      unsupported.push(index);
      continue;
    }
    slots.set(canonicalFactSlotKey(slot), slot);
  }
  if (unsupported.length > 0) {
    return indeterminate(
      "semantic transition contains an unsupported shadow-conversion path",
      unsupported,
    );
  }
  const causalSourceRef = patch.sourceEventIds[0] ??
    `semantic-transition:${patch.turn}:${patch.baseRevision}`;
  const changes: FactChange[] = [];
  const endedFactRefs: Array<{
    factRef: string;
    subjectRef: string;
    causalSourceRef: string;
  }> = [];
  for (const slot of slots.values()) {
    const before = semanticSlotValue(input.before, slot);
    const after = semanticSlotValue(input.after, slot);
    const prior = priorFactRef({
      lookup: input.existingFactRefs,
      ...slot,
      objectRef: before.objectRef,
    });
    if (before.present && !prior) {
      return indeterminate(
        `semantic conversion is missing current fact reference for ${slot.subjectRef} ${slot.predicate}`,
      );
    }
    if (!after.present) {
      if (prior) {
        endedFactRefs.push({
          factRef: prior,
          subjectRef: slot.subjectRef,
          causalSourceRef,
        });
      }
      continue;
    }
    changes.push({
      ...slot,
      ...(after.objectRef ? { objectRef: after.objectRef } : {}),
      ...(Object.hasOwn(after, "value") ? { value: clone(after.value) } : {}),
      ...(prior ? { priorFactRef: prior } : {}),
      causalSourceRef,
    });
  }
  const sourceRef = `semantic-transition:${patch.turn}:${patch.baseRevision}`;
  return converted(buildPatch({
    sourceRef,
    authority: {
      subsystem: "semantic",
      authority: "validated_semantic_transition",
      sourceRef,
      sourceEventRefs: patch.sourceEventIds,
      turn: patch.turn,
      revision: input.after.revision,
    },
    changes,
    endedFactRefs,
  }));
}

type WorldSlot = {
  subjectRef: string;
  predicate: string;
  objectRef?: string;
};

function placementObjectRef(placement: WorldPlacement): string | undefined {
  if (placement.type === "scene") return placement.areaId;
  if (placement.type === "held") return placement.holderId;
  if (placement.type === "worn") return placement.wearerId;
  if (placement.type === "attached") return placement.anchorId;
  return undefined;
}

function worldOperationSlots(
  transition: BattleWorldTransition,
): { slots: WorldSlot[]; unsupported: number[] } {
  const slots: WorldSlot[] = [];
  const unsupported: number[] = [];
  for (const [index, operation] of transition.operations.entries()) {
    if (operation.op === "add_area" || operation.op === "add_entity") {
      unsupported.push(index);
    } else if (operation.op === "set_entity_active") {
      slots.push({ subjectRef: operation.entityId, predicate: "entity.active" });
    } else if (operation.op === "set_placement") {
      slots.push({ subjectRef: operation.entityId, predicate: "world.placement" });
    } else if (operation.op === "set_exposure") {
      slots.push({ subjectRef: operation.entityId, predicate: "entity.exposure" });
    } else if (operation.op === "set_actor_state") {
      for (const key of Object.keys(operation.changes)) {
        slots.push({ subjectRef: operation.entityId, predicate: `actor.${key}` });
      }
    } else if (operation.op === "set_object_state") {
      for (const key of Object.keys(operation.changes)) {
        slots.push({ subjectRef: operation.entityId, predicate: `object.${key}` });
      }
    } else if (operation.op === "concretize_object") {
      slots.push({
        subjectRef: operation.entityId,
        predicate: "object.profile",
      });
    } else if (operation.op === "set_area_state") {
      for (const key of Object.keys(operation.changes)) {
        slots.push({ subjectRef: operation.areaId, predicate: `area.${key}` });
      }
    } else {
      const relationPredicates = [
        "relation.distance",
        "relation.sight",
        "relation.sound",
        "relation.first_orientation",
        "relation.second_orientation",
      ];
      for (const predicate of relationPredicates) {
        slots.push({
          subjectRef: operation.entityAId,
          predicate,
          objectRef: operation.entityBId,
        });
      }
    }
  }
  return { slots, unsupported };
}

function worldSlotValue(
  state: BattleWorldState,
  slot: WorldSlot,
): { present: boolean; value?: SemanticValue; objectRef?: string } {
  if (slot.predicate.startsWith("area.")) {
    const area = state.areas[slot.subjectRef];
    const key = slot.predicate.slice("area.".length) as keyof typeof area;
    return area && Object.hasOwn(area, key)
      ? { present: true, value: clone(area[key]) as SemanticValue }
      : { present: false };
  }
  if (slot.predicate.startsWith("relation.") && slot.objectRef) {
    const pair = readBattleWorldPair(state, slot.subjectRef, slot.objectRef);
    if (!pair) return { present: false };
    const value = {
      "relation.distance": pair.distance,
      "relation.sight": pair.sight,
      "relation.sound": pair.sound,
      "relation.first_orientation": pair.orientationA,
      "relation.second_orientation": pair.orientationB,
    }[slot.predicate];
    return { present: value !== undefined, value, objectRef: slot.objectRef };
  }
  const entity = state.entities[slot.subjectRef];
  if (!entity) return { present: false };
  if (slot.predicate === "entity.active") {
    return { present: true, value: entity.active };
  }
  if (slot.predicate === "world.placement") {
    return {
      present: true,
      value: clone(entity.placement),
      ...(placementObjectRef(entity.placement)
        ? { objectRef: placementObjectRef(entity.placement) }
        : {}),
    };
  }
  if (slot.predicate === "entity.exposure") {
    return { present: true, value: entity.exposure };
  }
  if (slot.predicate === "object.profile") {
    return entity.objectProfile
      ? { present: true, value: clone(entity.objectProfile) as SemanticValue }
      : { present: false };
  }
  if (slot.predicate.startsWith("actor.")) {
    const key = slot.predicate.slice("actor.".length);
    return entity.actorState && Object.hasOwn(entity.actorState, key)
      ? {
          present: true,
          value: clone(
            entity.actorState[key as keyof typeof entity.actorState],
          ) as SemanticValue,
        }
      : { present: false };
  }
  if (slot.predicate.startsWith("object.")) {
    const key = slot.predicate.slice("object.".length);
    return entity.objectState && Object.hasOwn(entity.objectState, key)
      ? {
          present: true,
          value: clone(
            entity.objectState[key as keyof typeof entity.objectState],
          ) as SemanticValue,
        }
      : { present: false };
  }
  return { present: false };
}

function convertWorldTransition(input: {
  before: BattleWorldState;
  after: BattleWorldState;
  transition: BattleWorldTransition;
  existingFactRefs: CanonicalFactRefLookup;
  provenance?: {
    subsystem: "world" | "free_action";
    authority: "validated_world_transition" | "free_action_commit";
    sourceRef: string;
    causalSourceRef: string;
  };
}): ShadowPatchConversionResult {
  const transition = BattleWorldTransitionSchema.parse(input.transition);
  const operationSlots = worldOperationSlots(transition);
  if (operationSlots.unsupported.length > 0) {
    return indeterminate(
      "world transition creates a canonical identity that the Phase-2 shadow converter cannot declare",
      operationSlots.unsupported,
    );
  }
  const distinct = new Map<string, WorldSlot>();
  for (const slot of operationSlots.slots) {
    distinct.set(canonicalFactSlotKey(slot), slot);
  }
  const sourceRef = input.provenance?.sourceRef ??
    `world-transition:${transition.turn}:${transition.baseRevision}`;
  const causalSourceRef = input.provenance?.causalSourceRef ??
    transition.sourceEventIds[0] ?? sourceRef;
  const changes: FactChange[] = [];
  const endedFactRefs: Array<{
    factRef: string;
    subjectRef: string;
    causalSourceRef: string;
  }> = [];
  for (const slot of distinct.values()) {
    const before = worldSlotValue(input.before, slot);
    const after = worldSlotValue(input.after, slot);
    const lookupSlot = {
      ...slot,
      objectRef: before.objectRef ?? slot.objectRef,
    };
    const prior = priorFactRef({
      lookup: input.existingFactRefs,
      ...lookupSlot,
    });
    if (before.present && !prior) {
      return indeterminate(
        `world conversion is missing current fact reference for ${slot.subjectRef} ${slot.predicate}`,
      );
    }
    if (!after.present) {
      if (prior) {
        endedFactRefs.push({
          factRef: prior,
          subjectRef: slot.subjectRef,
          causalSourceRef,
        });
      }
      continue;
    }
    changes.push({
      subjectRef: slot.subjectRef,
      predicate: slot.predicate,
      ...(after.objectRef ?? slot.objectRef
        ? { objectRef: after.objectRef ?? slot.objectRef }
        : {}),
      ...(Object.hasOwn(after, "value") ? { value: clone(after.value) } : {}),
      ...(prior ? { priorFactRef: prior } : {}),
      causalSourceRef,
    });
  }
  const subsystem = input.provenance?.subsystem ?? "world";
  const authority = input.provenance?.authority ?? "validated_world_transition";
  return converted(buildPatch({
    sourceRef,
    authority: {
      subsystem,
      authority,
      sourceRef,
      sourceEventRefs: transition.sourceEventIds,
      turn: transition.turn,
      revision: input.after.revision,
    },
    changes,
    endedFactRefs,
  }));
}

export function convertWorldTransitionToShadowPatch(input: {
  before: BattleWorldState;
  after: BattleWorldState;
  transition: BattleWorldTransition;
  existingFactRefs: CanonicalFactRefLookup;
}): ShadowPatchConversionResult {
  return convertWorldTransition(input);
}

export function convertFreeActionToShadowPatch(input: {
  before: BattleWorldState;
  after: BattleWorldState;
  transition: BattleWorldTransition;
  receipt: FreeActionResolutionReceipt;
  existingFactRefs: CanonicalFactRefLookup;
}): ShadowPatchConversionResult {
  const receipt = FreeActionResolutionReceiptSchema.parse(input.receipt);
  if (![
    "accepted",
    "partial",
  ].includes(receipt.outcome)) {
    return indeterminate("free-action receipt did not commit a world change");
  }
  return convertWorldTransition({
    before: input.before,
    after: input.after,
    transition: input.transition,
    existingFactRefs: input.existingFactRefs,
    provenance: {
      subsystem: "free_action",
      authority: "free_action_commit",
      sourceRef: `free-action:${receipt.actionId}`,
      causalSourceRef: receipt.actionId,
    },
  });
}

const AUTHORITY_BY_SUBSYSTEM: Record<
  CanonicalFactSubsystem,
  CanonicalFactAuthority
> = {
  mechanical: "deterministic_resolver",
  semantic: "validated_semantic_transition",
  world: "validated_world_transition",
  free_action: "free_action_commit",
  repair: "repair",
};

function conflictKey(fact: ShadowCanonicalFact): string {
  return JSON.stringify([
    fact.subjectRef,
    fact.predicate,
    fact.predicate.startsWith("relation.") ? fact.objectRef ?? null : null,
  ]);
}

function claimValue(fact: ShadowCanonicalFact): string {
  return JSON.stringify([
    fact.objectRef ?? null,
    Object.hasOwn(fact, "value") ? ["present", fact.value] : ["absent"],
  ]);
}

function auditIssue(input: {
  code: PatchAuditIssueCode;
  explanation: string;
  factRefs?: string[];
  entityRefs?: string[];
}): ShadowPatchAuditIssue {
  return ShadowPatchAuditIssueSchema.parse({
    code: input.code,
    explanation: input.explanation,
    factRefs: uniqueSorted(input.factRefs ?? []),
    entityRefs: uniqueSorted(input.entityRefs ?? []),
  });
}

export function auditShadowCanonicalPatch(input: {
  patch: unknown;
  context: ShadowPatchAuditContext;
}): ShadowPatchAuditResult {
  const parsed = ShadowCanonicalPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return ShadowPatchAuditResultSchema.parse({
      verdict: "issue_found",
      checkedScope: {
        factRefs: [],
        entityRefs: uniqueSorted(input.context.knownEntityRefs),
        patchBytes: serializedBytes(input.patch),
      },
      issues: [auditIssue({
        code: "invalid_schema",
        explanation: parsed.error.issues[0]?.message ?? "invalid patch schema",
      })],
    });
  }
  const patch = parsed.data;
  const knownRefs = new Set(input.context.knownEntityRefs);
  const existingFacts = new Map(input.context.existingFacts.map((fact) => [
    fact.id,
    ShadowCanonicalFactSchema.parse(fact),
  ]));
  const issues: ShadowPatchAuditIssue[] = [];
  const patchBytes = serializedBytes(patch);
  const maxPatchBytes = input.context.maxPatchBytes ??
    CANONICAL_PATCH_POC_LIMITS.maxPatchBytes;
  if (patchBytes > maxPatchBytes) {
    issues.push(auditIssue({
      code: "patch_too_large",
      explanation: `patch is ${patchBytes} bytes; maximum is ${maxPatchBytes}`,
    }));
  }

  for (const assertion of patch.assertions) {
    const unknown = [assertion.subjectRef, assertion.objectRef]
      .filter((ref): ref is string =>
        typeof ref === "string" && !knownRefs.has(ref)
      );
    if (unknown.length > 0) {
      issues.push(auditIssue({
        code: "unknown_entity_reference",
        explanation: `assertion ${assertion.id} references an unknown entity`,
        factRefs: [assertion.id],
        entityRefs: unknown,
      }));
    }
    if (!patch.touchedRefs.includes(assertion.subjectRef)) {
      issues.push(auditIssue({
        code: "incomplete_touched_refs",
        explanation: `assertion ${assertion.id} subject is absent from touchedRefs`,
        factRefs: [assertion.id],
        entityRefs: [assertion.subjectRef],
      }));
    }
    if (
      assertion.provenance.authority !==
        AUTHORITY_BY_SUBSYSTEM[assertion.provenance.subsystem]
    ) {
      issues.push(auditIssue({
        code: "authority_mismatch",
        explanation: `assertion ${assertion.id} authority does not match its subsystem`,
        factRefs: [assertion.id],
        entityRefs: [assertion.subjectRef],
      }));
    }
    const value = assertion.value;
    if (
      assertion.subjectRef.startsWith("character.") &&
      assertion.predicate === "entity.active" &&
      value === false
    ) {
      issues.push(auditIssue({
        code: "forbidden_state",
        explanation: "required character entities cannot be deactivated by a patch",
        factRefs: [assertion.id],
        entityRefs: [assertion.subjectRef],
      }));
    }
    if (
      assertion.predicate.startsWith("parameter.") &&
      typeof value === "number" &&
      value < 0
    ) {
      issues.push(auditIssue({
        code: "forbidden_state",
        explanation: `mechanical parameter ${assertion.predicate} cannot be negative`,
        factRefs: [assertion.id],
        entityRefs: [assertion.subjectRef],
      }));
    }
  }

  for (const retraction of patch.retractions) {
    const fact = existingFacts.get(retraction);
    if (!fact) {
      issues.push(auditIssue({
        code: "missing_retraction",
        explanation: `retraction target ${retraction} is not in the checked fact set`,
        factRefs: [retraction],
      }));
    } else if (!patch.touchedRefs.includes(fact.subjectRef)) {
      issues.push(auditIssue({
        code: "incomplete_touched_refs",
        explanation: `retraction ${retraction} subject is absent from touchedRefs`,
        factRefs: [retraction],
        entityRefs: [fact.subjectRef],
      }));
    }
  }

  const assertionsBySlot = new Map<string, ShadowCanonicalFact[]>();
  for (const assertion of patch.assertions) {
    const key = conflictKey(assertion);
    assertionsBySlot.set(key, [
      ...(assertionsBySlot.get(key) ?? []),
      assertion,
    ]);
  }
  for (const slotFacts of assertionsBySlot.values()) {
    if (new Set(slotFacts.map(claimValue)).size > 1) {
      issues.push(auditIssue({
        code: "direct_conflict",
        explanation: "patch asserts incompatible values for one canonical slot",
        factRefs: slotFacts.map((fact) => fact.id),
        entityRefs: slotFacts.map((fact) => fact.subjectRef),
      }));
    }
  }

  const retractions = new Set(patch.retractions);
  for (const assertion of patch.assertions) {
    const conflicts = input.context.existingFacts.filter((fact) =>
      conflictKey(fact) === conflictKey(assertion) &&
      claimValue(fact) !== claimValue(assertion) &&
      !retractions.has(fact.id)
    );
    if (conflicts.length > 0) {
      issues.push(auditIssue({
        code: "direct_conflict",
        explanation: `assertion ${assertion.id} leaves a conflicting current fact active`,
        factRefs: [assertion.id, ...conflicts.map((fact) => fact.id)],
        entityRefs: [assertion.subjectRef],
      }));
    }
  }

  const asserted = new Set(patch.assertions.map((fact) => fact.id));
  const causalTargets = new Map<string, ShadowCausalLink[]>();
  for (const link of patch.causalLinks) {
    causalTargets.set(link.targetFactRef, [
      ...(causalTargets.get(link.targetFactRef) ?? []),
      link,
    ]);
    const validAssertion = asserted.has(link.targetFactRef) &&
      ["created", "modified", "triggered"].includes(link.relation);
    const validRetraction = retractions.has(link.targetFactRef) &&
      link.relation === "ended";
    if (!validAssertion && !validRetraction) {
      issues.push(auditIssue({
        code: "invalid_causal_target",
        explanation: `causal link target ${link.targetFactRef} does not match its relation`,
        factRefs: [link.targetFactRef],
      }));
    }
  }
  for (const factRef of [...asserted, ...retractions]) {
    if (!causalTargets.has(factRef)) {
      issues.push(auditIssue({
        code: "missing_causal_link",
        explanation: `changed fact ${factRef} has no causal link`,
        factRefs: [factRef],
      }));
    }
  }

  if (input.context.contextComplete === false) {
    issues.push(auditIssue({
      code: "incomplete_context",
      explanation: "the supplied audit context is explicitly incomplete",
    }));
  }
  const deterministicIssues = issues.filter((issue) =>
    issue.code !== "incomplete_context"
  );
  const verdict = deterministicIssues.length > 0
    ? "issue_found"
    : issues.length > 0
      ? "indeterminate"
      : "no_issue_found";
  return ShadowPatchAuditResultSchema.parse({
    verdict,
    checkedScope: {
      factRefs: uniqueSorted([
        ...input.context.existingFacts.map((fact) => fact.id),
        ...patch.assertions.map((fact) => fact.id),
        ...patch.retractions,
      ]),
      entityRefs: uniqueSorted(input.context.knownEntityRefs),
      patchBytes,
    },
    issues,
  });
}
