import { z } from "zod";
import type { BattleState, BattleTurnRecord } from "./battle.js";
import {
  deriveBattleSceneStateFacts,
  type BattleWorldEntity,
  type BattleWorldState,
} from "./battle-world.js";
import {
  ApparentIdentityBeliefSchema,
  BattleSideSchema,
  CurrentAccessSchema,
  IdentityKnowledgeSchema,
  PerceptSchema,
  QuantizedChangeSchema,
  ResourceReserveCueSchema,
  type CharacterPerceptionFrame,
  type PerceptionSlot,
} from "./perception.js";

/**
 * Hard safety ceilings for the BattleState-backed Projection PoC. Callers may
 * choose smaller limits per request, but cannot enlarge these ceilings.
 */
export const BATTLE_PROJECTION_HARD_LIMITS = {
  maxEntities: 128,
  maxFacts: 256,
  maxRules: 32,
  maxBytes: 64 * 1024,
  maxHistoryTurns: 20,
} as const;

export const BATTLE_PROJECTION_DEFAULT_LIMITS = {
  maxEntities: 32,
  maxFacts: 96,
  maxRules: 12,
  maxBytes: 32 * 1024,
  maxHistoryTurns: 4,
} as const;

export const ProjectionLimitsSchema = z.object({
  maxEntities: z.number().int().min(2)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities)
    .default(BATTLE_PROJECTION_DEFAULT_LIMITS.maxEntities),
  maxFacts: z.number().int().min(1)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts)
    .default(BATTLE_PROJECTION_DEFAULT_LIMITS.maxFacts),
  maxRules: z.number().int().min(1)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxRules)
    .default(BATTLE_PROJECTION_DEFAULT_LIMITS.maxRules),
  maxBytes: z.number().int().min(4096)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxBytes)
    .default(BATTLE_PROJECTION_DEFAULT_LIMITS.maxBytes),
  maxHistoryTurns: z.number().int().min(0)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxHistoryTurns)
    .default(BATTLE_PROJECTION_DEFAULT_LIMITS.maxHistoryTurns),
}).strict();
export type ProjectionLimits = z.infer<typeof ProjectionLimitsSchema>;

export const ProjectionPurposeSchema = z.enum([
  "character_decision",
  "character_reaction",
  "speech",
  "adjudication",
  "world_process",
  "perception",
  "narration",
  "patch_audit",
]);
export type ProjectionPurpose = z.infer<typeof ProjectionPurposeSchema>;

export const InteractionKindSchema = z.enum([
  "physical_contact",
  "movement_reachability",
  "line_of_sight",
  "audibility",
  "ownership_control",
  "containment",
  "support",
  "causal_dependency",
  "process_propagation",
  "remote_targeting",
  "communication",
  "rule_dependency",
  "identity_dependency",
]);
export type InteractionKind = z.infer<typeof InteractionKindSchema>;

export const TemporalWindowSchema = z.object({
  fromTurn: z.number().int().nonnegative(),
  toTurn: z.number().int().nonnegative(),
  phase: z.enum([
    "turn_start",
    "proposal",
    "execution",
    "commit",
    "post_commit",
  ]).optional(),
}).strict().superRefine((window, ctx) => {
  if (window.fromTurn > window.toTurn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromTurn"],
      message: "temporal window start must not exceed its end",
    });
  }
});
export type TemporalWindow = z.infer<typeof TemporalWindowSchema>;

const CanonicalRefSchema = z.string().min(1).max(200);
const FactRefSchema = z.string().min(1).max(240);
const RuleRefSchema = z.string().min(1).max(160);
const IssueRefSchema = z.string().min(1).max(160);
const ProposalRefSchema = z.string().min(1).max(160);

export const InteractionScopeSchema = z.object({
  anchorRefs: z.array(CanonicalRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  entityRefs: z.array(CanonicalRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  factRefs: z.array(FactRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts),
  processRefs: z.array(CanonicalRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  ruleRefs: z.array(RuleRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxRules),
  traversedKinds: z.array(InteractionKindSchema)
    .max(InteractionKindSchema.options.length),
  temporalWindow: TemporalWindowSchema.optional(),
  truncated: z.boolean(),
  omitted: z.object({
    entities: z.number().int().nonnegative(),
    facts: z.number().int().nonnegative(),
    rules: z.number().int().nonnegative(),
    historyTurns: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type InteractionScope = z.infer<typeof InteractionScopeSchema>;

export const CanonicalProjectionFactSchema = z.object({
  id: FactRefSchema,
  subjectRef: CanonicalRefSchema,
  predicate: z.string().min(1).max(120),
  objectRef: CanonicalRefSchema.optional(),
  value: z.unknown().optional(),
  validFromTurn: z.number().int().nonnegative(),
  validToTurn: z.number().int().nonnegative().optional(),
  source: z.enum([
    "mechanical",
    "world",
    "semantic",
    "temporal",
    "event",
  ]),
}).strict();
export type CanonicalProjectionFact = z.infer<
  typeof CanonicalProjectionFactSchema
>;

export const ProjectionCausalLinkSchema = z.object({
  sourceRef: CanonicalRefSchema,
  targetFactRef: FactRefSchema,
  relation: z.enum(["created", "ended", "modified", "triggered"]),
}).strict();
export type ProjectionCausalLink = z.infer<typeof ProjectionCausalLinkSchema>;

export const ObservationSliceRequestSchema = z.object({
  observerRef: z.enum(["character.a", "character.b"]),
  purpose: z.enum([
    "character_decision",
    "character_reaction",
    "speech",
  ]),
  limits: ProjectionLimitsSchema.partial().strict().optional(),
}).strict();
export type ObservationSliceRequest = z.infer<
  typeof ObservationSliceRequestSchema
>;

export const ObserverLocalRefSchema = z.string().regex(
  /^(self|counterpart|subject\.[1-9][0-9]*)$/,
);
export type ObserverLocalRef = z.infer<typeof ObserverLocalRefSchema>;

export const ObserverInteractionScopeSchema = z.object({
  localRefs: z.array(ObserverLocalRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  traversedKinds: z.array(InteractionKindSchema)
    .max(InteractionKindSchema.options.length),
  counts: z.object({
    subjects: z.number().int().nonnegative(),
    perceivedFacts: z.number().int().nonnegative(),
    historyTurns: z.number().int().nonnegative(),
  }).strict(),
  truncated: z.boolean(),
}).strict();
export type ObserverInteractionScope = z.infer<
  typeof ObserverInteractionScopeSchema
>;

export const ObserverLocalSubjectSchema = z.object({
  localRef: ObserverLocalRefSchema,
  role: z.enum(["self", "counterpart", "other", "ambient"]),
  currentAccess: CurrentAccessSchema,
  identityKnowledge: IdentityKnowledgeSchema,
  perceivedAs: z.string().min(1).max(240),
  apparentIdentity: ApparentIdentityBeliefSchema.optional(),
  percepts: z.array(PerceptSchema).max(32),
}).strict();
export type ObserverLocalSubject = z.infer<typeof ObserverLocalSubjectSchema>;

export const ObservationSliceSchema = z.object({
  schemaVersion: z.literal(1),
  observer: z.object({
    side: BattleSideSchema,
    selfRef: z.literal("self"),
  }).strict(),
  purpose: z.enum([
    "character_decision",
    "character_reaction",
    "speech",
  ]),
  turn: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  scope: ObserverInteractionScopeSchema,
  subjects: z.array(ObserverLocalSubjectSchema)
    .min(2)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  qualitativeChanges: z.array(QuantizedChangeSchema).max(32),
  reserveCues: z.array(ResourceReserveCueSchema).max(12),
  sceneFacts: z.array(z.object({
    itemLabel: z.string().min(1).max(120),
    statement: z.string().min(1).max(400),
  }).strict()).max(24),
  uncertainties: z.array(z.object({
    localRef: ObserverLocalRefSchema,
    kind: z.enum(["identity", "access"]),
  }).strict()).max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities * 2),
  localRefMap: z.record(ObserverLocalRefSchema, z.object({
    role: z.enum(["self", "counterpart", "other", "ambient"]),
    currentAccess: CurrentAccessSchema,
    identityKnowledge: IdentityKnowledgeSchema,
  }).strict()),
}).strict();
export type ObservationSlice = z.infer<typeof ObservationSliceSchema>;

export const AdjudicationSliceRequestSchema = z.object({
  proposalRefs: z.array(ProposalRefSchema).min(1).max(16),
  temporalWindow: TemporalWindowSchema,
  limits: ProjectionLimitsSchema.partial().strict().optional(),
}).strict();
export type AdjudicationSliceRequest = z.infer<
  typeof AdjudicationSliceRequestSchema
>;

export const AdjudicationSliceSchema = z.object({
  schemaVersion: z.literal(1),
  proposalRefs: z.array(ProposalRefSchema).min(1).max(16),
  temporalWindow: TemporalWindowSchema,
  scope: InteractionScopeSchema,
  facts: z.array(CanonicalProjectionFactSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts),
  applicableRuleRefs: z.array(RuleRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxRules),
  relatedIssueRefs: z.array(IssueRefSchema).max(64),
}).strict();
export type AdjudicationSlice = z.infer<typeof AdjudicationSliceSchema>;

/** Phase-1 preview only. Full CanonicalPatch is introduced by Phase 2. */
export const ProjectionPatchContextSchema = z.object({
  sourceRef: CanonicalRefSchema,
  touchedRefs: z.array(CanonicalRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  retractedFactRefs: z.array(FactRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts)
    .default([]),
}).strict();
export type ProjectionPatchContext = z.infer<
  typeof ProjectionPatchContextSchema
>;

export const ConsistencySliceRequestSchema = z.object({
  patch: ProjectionPatchContextSchema.optional(),
  anchorRefs: z.array(CanonicalRefSchema)
    .min(1)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxEntities),
  purpose: ProjectionPurposeSchema,
  temporalWindow: TemporalWindowSchema.optional(),
  limits: ProjectionLimitsSchema.partial().strict().optional(),
}).strict();
export type ConsistencySliceRequest = z.infer<
  typeof ConsistencySliceRequestSchema
>;

export const ConsistencyIssueViewSchema = z.object({
  id: IssueRefSchema,
  involvedFactRefs: z.array(FactRefSchema).max(64),
  involvedEntityRefs: z.array(CanonicalRefSchema).max(64),
  blocksPurposes: z.array(ProjectionPurposeSchema)
    .max(ProjectionPurposeSchema.options.length),
  status: z.enum(["open", "deferred", "resolved"]),
}).strict();
export type ConsistencyIssueView = z.infer<
  typeof ConsistencyIssueViewSchema
>;

export const ConsistencySliceSchema = z.object({
  schemaVersion: z.literal(1),
  purpose: ProjectionPurposeSchema,
  scope: InteractionScopeSchema,
  facts: z.array(CanonicalProjectionFactSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts),
  causalLinks: z.array(ProjectionCausalLinkSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts),
  issues: z.array(ConsistencyIssueViewSchema).max(64),
  applicableRuleRefs: z.array(RuleRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxRules),
}).strict();
export type ConsistencySlice = z.infer<typeof ConsistencySliceSchema>;

export const CanonicalReadConsistencySchema = z.object({
  level: z.enum([
    "unchecked",
    "locally_coherent",
    "conflicted",
    "repaired",
  ]),
  checkedFactRefs: z.array(FactRefSchema)
    .max(BATTLE_PROJECTION_HARD_LIMITS.maxFacts),
  unresolvedIssueRefs: z.array(IssueRefSchema).max(64),
}).strict();

export type CanonicalReadResult<T> = {
  value: T;
  consistency: z.infer<typeof CanonicalReadConsistencySchema>;
};

export function createCanonicalReadResultSchema<T extends z.ZodTypeAny>(
  valueSchema: T,
) {
  return z.object({
    value: valueSchema,
    consistency: CanonicalReadConsistencySchema,
  }).strict();
}

export interface CanonicalProjectionService {
  buildObservationSlice(
    request: ObservationSliceRequest,
  ): CanonicalReadResult<ObservationSlice>;

  buildAdjudicationSlice(
    request: AdjudicationSliceRequest,
  ): CanonicalReadResult<AdjudicationSlice>;

  buildConsistencySlice(
    request: ConsistencySliceRequest,
  ): CanonicalReadResult<ConsistencySlice>;
}

type InteractionEdge = {
  from: string;
  to: string;
  kind: InteractionKind;
};

type FactCollection = {
  facts: CanonicalProjectionFact[];
  causalLinks: ProjectionCausalLink[];
};

const RULE_REFS = [
  "battle.rule.action-feasibility-v1",
  "battle.rule.perception-observer-isolation-v1",
  "battle.rule.temporal-initiative-window-v1",
  "battle.rule.world-reference-integrity-v1",
  "battle.rule.world-process-propagation-v1",
] as const;

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function projectionLimits(
  requestLimits: Partial<ProjectionLimits> | undefined,
): ProjectionLimits {
  return ProjectionLimitsSchema.parse({
    ...BATTLE_PROJECTION_DEFAULT_LIMITS,
    ...requestLimits,
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function localRole(slot: PerceptionSlot): ObserverLocalSubject["role"] {
  if (slot.subject.kind === "self") return "self";
  if (slot.subject.kind === "counterpart") return "counterpart";
  if (slot.subject.kind === "ambient") return "ambient";
  return "other";
}

function localSubjects(
  frame: CharacterPerceptionFrame | undefined,
): ObserverLocalSubject[] {
  if (!frame) {
    return [
      {
        localRef: "self",
        role: "self",
        currentAccess: "clear",
        identityKnowledge: "identified",
        perceivedAs: "自分",
        percepts: [],
      },
      {
        localRef: "counterpart",
        role: "counterpart",
        currentAccess: "none",
        identityKnowledge: "unknown",
        perceivedAs: "相手",
        percepts: [],
      },
    ];
  }
  const slots = [frame.self, frame.counterpart, ...frame.others];
  return slots.map((slot, index) => {
    const localRef: ObserverLocalRef = index === 0
      ? "self"
      : index === 1
        ? "counterpart"
        : `subject.${index - 1}`;
    return ObserverLocalSubjectSchema.parse({
      localRef,
      role: localRole(slot),
      currentAccess: slot.currentAccess,
      identityKnowledge: slot.identityKnowledge,
      perceivedAs: slot.perceivedAs,
      ...(slot.apparentIdentity
        ? { apparentIdentity: clone(slot.apparentIdentity) }
        : {}),
      percepts: clone(slot.percepts),
    });
  });
}

function observableInteractionKinds(input: {
  state: BattleState;
  subjects: ObserverLocalSubject[];
}): InteractionKind[] {
  const kinds = new Set<InteractionKind>();
  if (input.subjects.some((subject) =>
    subject.identityKnowledge === "identified"
  )) {
    kinds.add("identity_dependency");
  }
  const modalities = new Set(input.subjects.flatMap((subject) =>
    subject.percepts.map((percept) => percept.modality)
  ));
  if (modalities.has("vision")) kinds.add("line_of_sight");
  if (modalities.has("sound")) {
    kinds.add("audibility");
    kinds.add("communication");
  }
  if (modalities.has("touch")) kinds.add("physical_contact");

  const counterpart = input.subjects.find((subject) =>
    subject.role === "counterpart"
  );
  if (counterpart && counterpart.currentAccess !== "none") {
    const relation = input.state.worldState?.pairRelations.find((candidate) =>
      candidate.firstEntityId === "character.a" &&
      candidate.secondEntityId === "character.b"
    );
    if (relation) {
      for (const kind of relationKinds(relation)) {
        if (kind === "remote_targeting") continue;
        if (kind === "line_of_sight" && counterpart.currentAccess === "trace") {
          continue;
        }
        kinds.add(kind);
      }
    }
  }
  return uniqueSorted(kinds);
}

function relationKinds(
  relation: BattleWorldState["pairRelations"][number],
): InteractionKind[] {
  const kinds: InteractionKind[] = [];
  if (relation.distance === "contact") kinds.push("physical_contact");
  if (!["separate_area", "out_of_scene"].includes(relation.distance)) {
    kinds.push("movement_reachability");
  }
  if (relation.sight !== "blocked") kinds.push("line_of_sight");
  if (relation.sound !== "blocked") kinds.push("audibility");
  if (["far", "separate_area"].includes(relation.distance)) {
    kinds.push("remote_targeting");
  }
  return kinds;
}

function placementParent(entity: BattleWorldEntity): string | null {
  if (entity.placement.type === "held") return entity.placement.holderId;
  if (entity.placement.type === "worn") return entity.placement.wearerId;
  if (entity.placement.type === "attached") return entity.placement.anchorId;
  return null;
}

function eventEntities(
  record: BattleTurnRecord,
  event: BattleTurnRecord["events"][number],
): string[] {
  const actor = event.actorSide ? [`character.${event.actorSide}`] : [];
  const targets = (event.targetSides ?? []).map((side) => `character.${side}`);
  if (actor.length > 0 || targets.length > 0) {
    return uniqueSorted([...actor, ...targets]);
  }
  const action = event.sourceActionId
    ? record.actions.find((candidate) => candidate.id === event.sourceActionId)
    : undefined;
  return action ? [`character.${action.actorSide}`] : [];
}

function buildInteractionEdges(
  state: BattleState,
  historyRecords: BattleTurnRecord[],
): InteractionEdge[] {
  const edges: InteractionEdge[] = [];
  const add = (from: string, to: string, kind: InteractionKind) => {
    edges.push({ from, to, kind }, { from: to, to: from, kind });
  };
  const world = state.worldState;
  if (world) {
    for (const relation of world.pairRelations) {
      for (const kind of relationKinds(relation)) {
        add(relation.firstEntityId, relation.secondEntityId, kind);
      }
    }
    for (const [entityId, entity] of Object.entries(world.entities)) {
      if (entity.placement.type === "scene") {
        add(entityId, entity.placement.areaId, "containment");
      }
      const parent = placementParent(entity);
      if (parent) {
        add(entityId, parent, "containment");
        if (["held", "worn"].includes(entity.placement.type)) {
          add(entityId, parent, "ownership_control");
        }
        if (entity.placement.type === "attached") {
          add(entityId, parent, "support");
        }
      }
      if (state.semanticState?.entities[entityId]) {
        edges.push({ from: entityId, to: entityId, kind: "identity_dependency" });
      }
      const objectState = entity.objectState;
      if (
        objectState &&
        (
          objectState.cover !== "none" ||
          objectState.blocksMovement ||
          objectState.visionEffect !== "none" ||
          objectState.hearingEffect !== "none" ||
          objectState.mobilityEffect !== "none"
        )
      ) {
        edges.push({ from: entityId, to: entityId, kind: "causal_dependency" });
      }
      if (entity.kind === "effect" && entity.active) {
        edges.push({ from: entityId, to: entityId, kind: "process_propagation" });
        if (entity.placement.type === "scene") {
          for (const [targetId, target] of Object.entries(world.entities)) {
            if (
              targetId !== entityId &&
              target.placement.type === "scene" &&
              target.placement.areaId === entity.placement.areaId
            ) {
              add(entityId, targetId, "process_propagation");
            }
          }
        }
      }
      edges.push({ from: entityId, to: entityId, kind: "rule_dependency" });
    }
  }
  for (const record of historyRecords) {
    for (const action of record.actions) {
      const actorRef = `character.${action.actorSide}`;
      edges.push({ from: actorRef, to: actorRef, kind: "causal_dependency" });
    }
    for (const event of record.events) {
      const entities = eventEntities(record, event);
      if (entities.length === 1) {
        edges.push({
          from: entities[0]!,
          to: entities[0]!,
          kind: event.type === "utterance" ? "communication" : "causal_dependency",
        });
      }
      for (let index = 1; index < entities.length; index += 1) {
        add(
          entities[0]!,
          entities[index]!,
          event.type === "utterance" ? "communication" : "causal_dependency",
        );
      }
    }
  }
  return edges.sort((left, right) =>
    `${left.from}\u0000${left.to}\u0000${left.kind}`.localeCompare(
      `${right.from}\u0000${right.to}\u0000${right.kind}`,
    )
  );
}

function allCanonicalEntityRefs(state: BattleState): Set<string> {
  return new Set([
    ...Object.keys(state.worldState?.entities ?? {}),
    ...Object.keys(state.worldState?.areas ?? {}),
    ...Object.keys(state.semanticState?.entities ?? {}),
    "battle.scene",
  ]);
}

function resolveProposalAnchors(
  state: BattleState,
  proposalRefs: string[],
): string[] {
  const anchors = new Set<string>();
  const entityRefs = allCanonicalEntityRefs(state);
  for (const proposalRef of proposalRefs) {
    if (proposalRef === "proposal.a") {
      anchors.add("character.a");
      anchors.add("character.b");
    } else if (proposalRef === "proposal.b") {
      anchors.add("character.b");
      anchors.add("character.a");
    } else if (entityRefs.has(proposalRef)) {
      anchors.add(proposalRef);
    }
  }
  if (anchors.size === 0) {
    anchors.add("character.a");
    anchors.add("character.b");
  }
  return uniqueSorted(anchors);
}

function historyRecords(
  state: BattleState,
  limits: ProjectionLimits,
): { selected: BattleTurnRecord[]; omitted: number } {
  const records = state.turnRecords ?? [];
  const selected = limits.maxHistoryTurns === 0
    ? []
    : records.slice(-limits.maxHistoryTurns);
  return {
    selected,
    omitted: Math.max(0, records.length - selected.length),
  };
}

function buildInteractionScope(input: {
  state: BattleState;
  anchors: string[];
  temporalWindow?: TemporalWindow;
  limits: ProjectionLimits;
  historyRecords: BattleTurnRecord[];
  omittedHistoryTurns: number;
}): InteractionScope {
  const knownRefs = allCanonicalEntityRefs(input.state);
  const anchors = uniqueSorted(input.anchors.filter((ref) => knownRefs.has(ref)));
  const edges = buildInteractionEdges(input.state, input.historyRecords);
  const selected = new Set<string>();
  const traversed = new Set<InteractionKind>();
  const queue = [...anchors];
  let omittedEntities = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (selected.has(current)) continue;
    if (selected.size >= input.limits.maxEntities) {
      omittedEntities += 1;
      continue;
    }
    selected.add(current);
    for (const edge of edges) {
      if (edge.from !== current) continue;
      traversed.add(edge.kind);
      if (!selected.has(edge.to) && !queue.includes(edge.to)) {
        queue.push(edge.to);
      }
    }
  }
  const processRefs = uniqueSorted([...selected].filter((ref) =>
    input.state.worldState?.entities[ref]?.kind === "effect" &&
    input.state.worldState.entities[ref]?.active
  ));
  const ruleRefs = RULE_REFS.slice(0, input.limits.maxRules);
  return InteractionScopeSchema.parse({
    anchorRefs: anchors,
    entityRefs: uniqueSorted(selected),
    factRefs: [],
    processRefs,
    ruleRefs,
    traversedKinds: uniqueSorted(traversed),
    ...(input.temporalWindow ? { temporalWindow: input.temporalWindow } : {}),
    truncated: omittedEntities > 0 ||
      input.omittedHistoryTurns > 0 ||
      ruleRefs.length < RULE_REFS.length,
    omitted: {
      entities: omittedEntities,
      facts: 0,
      rules: Math.max(0, RULE_REFS.length - ruleRefs.length),
      historyTurns: input.omittedHistoryTurns,
    },
  });
}

class FactBuilder {
  readonly facts: CanonicalProjectionFact[] = [];
  readonly causalLinks: ProjectionCausalLink[] = [];

  add(input: Omit<CanonicalProjectionFact, "id">): string {
    const id = `projection.fact.${String(this.facts.length + 1).padStart(4, "0")}`;
    this.facts.push(CanonicalProjectionFactSchema.parse({ id, ...input }));
    return id;
  }
}

function addWorldFacts(
  builder: FactBuilder,
  world: BattleWorldState | undefined,
): void {
  if (!world) return;
  for (const [areaId, area] of Object.entries(world.areas).sort()) {
    for (const [predicate, value] of Object.entries(area).sort()) {
      builder.add({
        subjectRef: areaId,
        predicate: `area.${predicate}`,
        value,
        validFromTurn: 0,
        source: "world",
      });
    }
  }
  for (const [entityId, entity] of Object.entries(world.entities).sort()) {
    for (const [predicate, value] of [
      ["entity.kind", entity.kind],
      ["entity.active", entity.active],
      ["entity.presence", entity.presence],
      ["entity.exposure", entity.exposure],
    ] as const) {
      builder.add({
        subjectRef: entityId,
        predicate,
        value,
        validFromTurn: entity.createdTurn,
        source: "world",
      });
    }
    const placement = entity.placement;
    if (placement.type === "scene") {
      builder.add({
        subjectRef: entityId,
        predicate: "located_in",
        objectRef: placement.areaId,
        validFromTurn: entity.updatedTurn,
        source: "world",
      });
    } else if (placement.type === "held") {
      builder.add({
        subjectRef: entityId,
        predicate: "held_by",
        objectRef: placement.holderId,
        validFromTurn: entity.updatedTurn,
        source: "world",
      });
    } else if (placement.type === "worn") {
      builder.add({
        subjectRef: entityId,
        predicate: "worn_by",
        objectRef: placement.wearerId,
        value: { slot: placement.slot },
        validFromTurn: entity.updatedTurn,
        source: "world",
      });
    } else if (placement.type === "attached") {
      builder.add({
        subjectRef: entityId,
        predicate: "attached_to",
        objectRef: placement.anchorId,
        validFromTurn: entity.updatedTurn,
        source: "world",
      });
    }
    for (const [predicate, value] of Object.entries(entity.actorState ?? {}).sort()) {
      builder.add({
        subjectRef: entityId,
        predicate: `actor.${predicate}`,
        value,
        validFromTurn: entity.updatedTurn,
        source: "world",
      });
    }
    for (const [predicate, value] of Object.entries(entity.objectState ?? {}).sort()) {
      builder.add({
        subjectRef: entityId,
        predicate: `object.${predicate}`,
        value: clone(value),
        validFromTurn: entity.updatedTurn,
        source: "world",
      });
    }
  }
  for (const relation of [...world.pairRelations].sort((left, right) =>
    `${left.firstEntityId}\u0000${left.secondEntityId}`.localeCompare(
      `${right.firstEntityId}\u0000${right.secondEntityId}`,
    )
  )) {
    for (const [predicate, value] of [
      ["relation.distance", relation.distance],
      ["relation.sight", relation.sight],
      ["relation.sound", relation.sound],
      ["relation.first_orientation", relation.firstOrientation],
      ["relation.second_orientation", relation.secondOrientation],
    ] as const) {
      builder.add({
        subjectRef: relation.firstEntityId,
        predicate,
        objectRef: relation.secondEntityId,
        value,
        validFromTurn: relation.updatedTurn,
        source: "world",
      });
    }
  }
}

function addMechanicalFacts(builder: FactBuilder, state: BattleState): void {
  for (const [side, combatant] of [
    ["a", state.sideA],
    ["b", state.sideB],
  ] as const) {
    const subjectRef = `character.${side}`;
    for (const [parameter, value] of Object.entries(combatant.parameters).sort()) {
      builder.add({
        subjectRef,
        predicate: `parameter.${parameter}`,
        value,
        validFromTurn: state.turn,
        source: "mechanical",
      });
    }
    builder.add({
      subjectRef,
      predicate: "combat.can_fight",
      value: combatant.canFight,
      validFromTurn: state.turn,
      source: "mechanical",
    });
    builder.add({
      subjectRef,
      predicate: "combat.defending",
      value: combatant.defending,
      validFromTurn: state.turn,
      source: "mechanical",
    });
  }
}

function addSemanticFacts(builder: FactBuilder, state: BattleState): void {
  const semantic = state.semanticState;
  if (!semantic) return;
  for (const [predicate, value] of Object.entries(semantic.scene.facts).sort()) {
    builder.add({
      subjectRef: "battle.scene",
      predicate: `scene.${predicate}`,
      value: clone(value),
      validFromTurn: 0,
      source: "semantic",
    });
  }
  for (const [entityId, entity] of Object.entries(semantic.entities).sort()) {
    builder.add({
      subjectRef: entityId,
      predicate: "semantic.label",
      value: entity.label,
      validFromTurn: entity.createdTurn,
      source: "semantic",
    });
    for (const [predicate, value] of Object.entries(entity.facts).sort()) {
      builder.add({
        subjectRef: entityId,
        predicate: `semantic.${predicate}`,
        value: clone(value),
        validFromTurn: entity.updatedTurn,
        source: "semantic",
      });
    }
  }
}

function addHistoryFacts(
  builder: FactBuilder,
  records: BattleTurnRecord[],
): void {
  for (const record of records) {
    for (const action of record.actions) {
      builder.add({
        subjectRef: `character.${action.actorSide}`,
        predicate: "action.resolution",
        value: {
          actionRef: action.id,
          kind: action.kind,
          executed: action.executed,
          outcome: action.resolution?.outcome ?? null,
        },
        validFromTurn: record.turn,
        validToTurn: record.turn,
        source: "temporal",
      });
    }
    for (const event of record.events) {
      const entities = eventEntities(record, event);
      const factId = builder.add({
        subjectRef: entities[0] ?? "battle.scene",
        predicate: `event.${event.type}`,
        ...(entities[1] ? { objectRef: entities[1] } : {}),
        value: { eventRef: event.id ?? null, summary: event.summary },
        validFromTurn: record.turn,
        validToTurn: record.turn,
        source: "event",
      });
      if (event.sourceActionId) {
        builder.causalLinks.push({
          sourceRef: event.sourceActionId,
          targetFactRef: factId,
          relation: "created",
        });
      }
    }
  }
}

function collectFacts(
  state: BattleState,
  records: BattleTurnRecord[],
): FactCollection {
  const builder = new FactBuilder();
  addMechanicalFacts(builder, state);
  addWorldFacts(builder, state.worldState);
  addSemanticFacts(builder, state);
  addHistoryFacts(builder, records);
  return { facts: builder.facts, causalLinks: builder.causalLinks };
}

function factWithinScope(
  fact: CanonicalProjectionFact,
  scopeRefs: Set<string>,
): boolean {
  return fact.subjectRef === "battle.scene" ||
    scopeRefs.has(fact.subjectRef) ||
    (fact.objectRef !== undefined && scopeRefs.has(fact.objectRef));
}

function boundedFacts(input: {
  facts: CanonicalProjectionFact[];
  scope: InteractionScope;
  limits: ProjectionLimits;
}): { facts: CanonicalProjectionFact[]; scope: InteractionScope } {
  const relevant = input.facts.filter((fact) =>
    factWithinScope(fact, new Set(input.scope.entityRefs))
  );
  const facts = relevant.slice(0, input.limits.maxFacts);
  const omittedFacts = Math.max(0, relevant.length - facts.length);
  return {
    facts,
    scope: {
      ...input.scope,
      factRefs: facts.map((fact) => fact.id),
      truncated: input.scope.truncated || omittedFacts > 0,
      omitted: {
        ...input.scope.omitted,
        facts: input.scope.omitted.facts + omittedFacts,
      },
    },
  };
}

function trimAdjudicationToBytes(
  slice: AdjudicationSlice,
  maxBytes: number,
): AdjudicationSlice {
  const value = clone(slice);
  while (utf8Bytes(value) > maxBytes && value.facts.length > 0) {
    value.facts.pop();
    value.scope.omitted.facts += 1;
    value.scope.truncated = true;
  }
  value.scope.factRefs = value.facts.map((fact) => fact.id);
  while (utf8Bytes(value) > maxBytes && value.scope.ruleRefs.length > 1) {
    value.scope.ruleRefs.pop();
    value.applicableRuleRefs = [...value.scope.ruleRefs];
    value.scope.omitted.rules += 1;
    value.scope.truncated = true;
  }
  if (utf8Bytes(value) > maxBytes) {
    throw new Error("projection byte limit is too small for adjudication envelope");
  }
  return AdjudicationSliceSchema.parse(value);
}

function trimConsistencyToBytes(
  slice: ConsistencySlice,
  maxBytes: number,
): ConsistencySlice {
  const value = clone(slice);
  while (utf8Bytes(value) > maxBytes && value.causalLinks.length > 0) {
    value.causalLinks.pop();
    value.scope.truncated = true;
  }
  while (utf8Bytes(value) > maxBytes && value.facts.length > 0) {
    const removed = value.facts.pop()!;
    value.causalLinks = value.causalLinks.filter((link) =>
      link.targetFactRef !== removed.id
    );
    value.scope.omitted.facts += 1;
    value.scope.truncated = true;
  }
  value.scope.factRefs = value.facts.map((fact) => fact.id);
  while (utf8Bytes(value) > maxBytes && value.scope.ruleRefs.length > 1) {
    value.scope.ruleRefs.pop();
    value.applicableRuleRefs = [...value.scope.ruleRefs];
    value.scope.omitted.rules += 1;
    value.scope.truncated = true;
  }
  if (utf8Bytes(value) > maxBytes) {
    throw new Error("projection byte limit is too small for consistency envelope");
  }
  return ConsistencySliceSchema.parse(value);
}

function trimObservationToBytes(
  slice: ObservationSlice,
  maxBytes: number,
): ObservationSlice {
  const value = clone(slice);
  const markTruncated = () => {
    value.scope.truncated = true;
  };
  while (utf8Bytes(value) > maxBytes && value.sceneFacts.length > 0) {
    value.sceneFacts.pop();
    markTruncated();
  }
  while (utf8Bytes(value) > maxBytes && value.subjects.length > 2) {
    const removed = value.subjects.pop()!;
    delete value.localRefMap[removed.localRef];
    value.uncertainties = value.uncertainties.filter((item) =>
      item.localRef !== removed.localRef
    );
    markTruncated();
  }
  for (const subject of [...value.subjects].reverse()) {
    while (utf8Bytes(value) > maxBytes && subject.percepts.length > 0) {
      subject.percepts.pop();
      markTruncated();
    }
  }
  while (utf8Bytes(value) > maxBytes && value.qualitativeChanges.length > 0) {
    value.qualitativeChanges.pop();
    markTruncated();
  }
  while (utf8Bytes(value) > maxBytes && value.reserveCues.length > 0) {
    value.reserveCues.pop();
    markTruncated();
  }
  value.scope.localRefs = value.subjects.map((subject) => subject.localRef);
  value.scope.counts.subjects = value.subjects.length;
  value.scope.counts.perceivedFacts = value.subjects.reduce(
    (sum, subject) => sum + subject.percepts.length,
    value.sceneFacts.length,
  );
  if (utf8Bytes(value) > maxBytes) {
    throw new Error("projection byte limit is too small for observation envelope");
  }
  return ObservationSliceSchema.parse(value);
}

function unchecked<T>(value: T): CanonicalReadResult<T> {
  return {
    value,
    consistency: {
      level: "unchecked",
      checkedFactRefs: [],
      unresolvedIssueRefs: [],
    },
  };
}

/**
 * Read-only adapter over the current BattleState. It snapshots input once and
 * never participates in resolution or commit, so merely reading a slice cannot
 * change a battle outcome.
 */
export class BattleStateProjectionAdapter implements CanonicalProjectionService {
  readonly #state: BattleState;

  constructor(state: BattleState) {
    this.#state = clone(state);
  }

  buildObservationSlice(
    rawRequest: ObservationSliceRequest,
  ): CanonicalReadResult<ObservationSlice> {
    const request = ObservationSliceRequestSchema.parse(rawRequest);
    const limits = projectionLimits(request.limits);
    const side = request.observerRef === "character.a" ? "a" : "b";
    const history = historyRecords(this.#state, limits);
    let subjects = localSubjects(
      side === "a" ? this.#state.perceptionFrameA : this.#state.perceptionFrameB,
    );
    const omittedSubjects = Math.max(0, subjects.length - limits.maxEntities);
    subjects = subjects.slice(0, limits.maxEntities);
    const frame = side === "a"
      ? this.#state.perceptionFrameA
      : this.#state.perceptionFrameB;
    const sceneFacts = deriveBattleSceneStateFacts({
      worldState: this.#state.worldState,
      observerSide: side,
    });
    const localRefMap = Object.fromEntries(subjects.map((subject) => [
      subject.localRef,
      {
        role: subject.role,
        currentAccess: subject.currentAccess,
        identityKnowledge: subject.identityKnowledge,
      },
    ]));
    const uncertainties = subjects.flatMap((subject) => [
      ...(subject.identityKnowledge === "identified"
        ? []
        : [{ localRef: subject.localRef, kind: "identity" as const }]),
      ...(subject.currentAccess === "clear"
        ? []
        : [{ localRef: subject.localRef, kind: "access" as const }]),
    ]);
    const observableKinds = observableInteractionKinds({
      state: this.#state,
      subjects,
    });
    const value = ObservationSliceSchema.parse({
      schemaVersion: 1,
      observer: { side, selfRef: "self" },
      purpose: request.purpose,
      turn: this.#state.turn,
      revision: frame?.revision ?? this.#state.semanticState?.revision ?? 0,
      scope: {
        localRefs: subjects.map((subject) => subject.localRef),
        traversedKinds: observableKinds,
        counts: {
          subjects: subjects.length,
          perceivedFacts: subjects.reduce(
            (sum, subject) => sum + subject.percepts.length,
            sceneFacts.length,
          ),
          historyTurns: history.selected.length,
        },
        truncated: omittedSubjects > 0,
      },
      subjects,
      qualitativeChanges: clone(frame?.qualitativeChanges ?? []),
      reserveCues: clone(frame?.reserveCues ?? []),
      sceneFacts,
      uncertainties,
      localRefMap,
    });
    return unchecked(trimObservationToBytes(value, limits.maxBytes));
  }

  buildAdjudicationSlice(
    rawRequest: AdjudicationSliceRequest,
  ): CanonicalReadResult<AdjudicationSlice> {
    const request = AdjudicationSliceRequestSchema.parse(rawRequest);
    const limits = projectionLimits(request.limits);
    const history = historyRecords(this.#state, limits);
    const scope = buildInteractionScope({
      state: this.#state,
      anchors: resolveProposalAnchors(this.#state, request.proposalRefs),
      temporalWindow: request.temporalWindow,
      limits,
      historyRecords: history.selected,
      omittedHistoryTurns: history.omitted,
    });
    const collection = collectFacts(this.#state, history.selected);
    const bounded = boundedFacts({ facts: collection.facts, scope, limits });
    const value = AdjudicationSliceSchema.parse({
      schemaVersion: 1,
      proposalRefs: request.proposalRefs,
      temporalWindow: request.temporalWindow,
      scope: bounded.scope,
      facts: bounded.facts,
      applicableRuleRefs: bounded.scope.ruleRefs,
      relatedIssueRefs: [],
    });
    return unchecked(trimAdjudicationToBytes(value, limits.maxBytes));
  }

  buildConsistencySlice(
    rawRequest: ConsistencySliceRequest,
  ): CanonicalReadResult<ConsistencySlice> {
    const request = ConsistencySliceRequestSchema.parse(rawRequest);
    const limits = projectionLimits(request.limits);
    const history = historyRecords(this.#state, limits);
    const anchors = uniqueSorted([
      ...request.anchorRefs,
      ...(request.patch?.touchedRefs ?? []),
    ]);
    const scope = buildInteractionScope({
      state: this.#state,
      anchors,
      temporalWindow: request.temporalWindow,
      limits,
      historyRecords: history.selected,
      omittedHistoryTurns: history.omitted,
    });
    const collection = collectFacts(this.#state, history.selected);
    const bounded = boundedFacts({ facts: collection.facts, scope, limits });
    const factRefs = new Set(bounded.facts.map((fact) => fact.id));
    const value = ConsistencySliceSchema.parse({
      schemaVersion: 1,
      purpose: request.purpose,
      scope: bounded.scope,
      facts: bounded.facts,
      causalLinks: collection.causalLinks
        .filter((link) => factRefs.has(link.targetFactRef))
        .slice(0, limits.maxFacts),
      issues: [],
      applicableRuleRefs: bounded.scope.ruleRefs,
    });
    return unchecked(trimConsistencyToBytes(value, limits.maxBytes));
  }
}

export function createBattleStateProjectionAdapter(
  state: BattleState,
): CanonicalProjectionService {
  return new BattleStateProjectionAdapter(state);
}
