import { z } from "zod";
import type { BattleState } from "./battle.js";
import {
  ShadowCanonicalPatchSchema,
  type ShadowCanonicalPatch,
} from "./battle-canonical-patch.js";
import {
  ConsistencyIssuePocEnvelopeSchema,
  projectConsistencyIssueViews,
  type ConsistencyIssuePocEnvelope,
} from "./battle-consistency-issue.js";
import {
  BattleStateProjectionAdapter,
  CanonicalProjectionFactSchema,
  ConsistencyIssueViewSchema,
  InteractionKindSchema,
  ProjectionCausalLinkSchema,
  ProjectionPurposeSchema,
  TemporalWindowSchema,
  buildBattleStateProjectionGraphSnapshot,
  type BattleProjectionReadSource,
  type CanonicalProjectionFact,
  type CanonicalProjectionFactCollection,
  type CanonicalProjectionService,
  type ConsistencyIssueView,
  type ProjectionCausalLink,
  type ProjectionInteractionEdge,
  type ProjectionPurpose,
  type TemporalWindow,
} from "./battle-projection.js";

export const CANONICAL_GRAPH_POC_LIMITS = {
  maxEntities: 512,
  maxFacts: 4096,
  maxCausalLinks: 4096,
  maxInteractionEdges: 8192,
  maxIssues: 128,
  maxRules: 64,
  maxSnapshotBytes: 4 * 1024 * 1024,
  maxQueryEntities: 128,
  maxQueryFacts: 512,
  maxQueryDepth: 4,
} as const;

const CanonicalRefSchema = z.string().min(1).max(240);
const FactRefSchema = z.string().min(1).max(240);
const RuleRefSchema = z.string().min(1).max(160);

export const CanonicalGraphEntitySchema = z.object({
  id: CanonicalRefSchema,
  kind: z.enum([
    "character",
    "object",
    "location",
    "terrain",
    "process",
  ]),
  type: z.string().min(1).max(160),
  stableAttributes: z.record(z.unknown()),
}).strict();
export type CanonicalGraphEntity = z.infer<typeof CanonicalGraphEntitySchema>;

export const CanonicalGraphInteractionEdgeSchema = z.object({
  from: CanonicalRefSchema,
  to: CanonicalRefSchema,
  kind: InteractionKindSchema,
  historyTurn: z.number().int().nonnegative().optional(),
}).strict();

const GraphSourceSchema = z.object({
  battleRef: CanonicalRefSchema,
  battleTurn: z.number().int().nonnegative(),
  semanticRevision: z.number().int().nonnegative().nullable(),
  worldRevision: z.number().int().nonnegative().nullable(),
  issueRevision: z.number().int().nonnegative().nullable(),
  turnRecordCount: z.number().int().nonnegative(),
}).strict();

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export const CanonicalGraphSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("battle_state_graph_view"),
  source: GraphSourceSchema,
  entities: z.array(CanonicalGraphEntitySchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxEntities),
  facts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxFacts),
  causalLinks: z.array(ProjectionCausalLinkSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxCausalLinks),
  interactionEdges: z.array(CanonicalGraphInteractionEdgeSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxInteractionEdges),
  worldProcessRefs: z.array(CanonicalRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxEntities),
  issues: z.array(ConsistencyIssueViewSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxIssues),
  ruleRefs: z.array(RuleRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxRules),
}).strict().superRefine((snapshot, ctx) => {
  const entityRefs = snapshot.entities.map((entity) => entity.id);
  const factRefs = snapshot.facts.map((fact) => fact.id);
  if (!unique(entityRefs)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entities"],
      message: "canonical graph entity IDs must be unique",
    });
  }
  if (!unique(factRefs)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["facts"],
      message: "canonical graph fact IDs must be unique",
    });
  }
  if (!unique(snapshot.ruleRefs)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ruleRefs"],
      message: "canonical graph rule references must be unique",
    });
  }
  const entityRefSet = new Set(entityRefs);
  const factRefSet = new Set(factRefs);
  for (const [index, fact] of snapshot.facts.entries()) {
    if (!entityRefSet.has(fact.subjectRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facts", index, "subjectRef"],
        message: "canonical graph fact subject is missing",
      });
    }
    if (fact.objectRef && !entityRefSet.has(fact.objectRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facts", index, "objectRef"],
        message: "canonical graph fact object is missing",
      });
    }
  }
  for (const [index, link] of snapshot.causalLinks.entries()) {
    if (!factRefSet.has(link.targetFactRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["causalLinks", index, "targetFactRef"],
        message: "canonical graph causal target is missing",
      });
    }
  }
  for (const [index, edge] of snapshot.interactionEdges.entries()) {
    if (!entityRefSet.has(edge.from) || !entityRefSet.has(edge.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interactionEdges", index],
        message: "canonical graph interaction edge endpoint is missing",
      });
    }
  }
  for (const [index, processRef] of snapshot.worldProcessRefs.entries()) {
    if (!entityRefSet.has(processRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["worldProcessRefs", index],
        message: "canonical graph world process is missing",
      });
    }
  }
  if (serializedBytes(snapshot) > CANONICAL_GRAPH_POC_LIMITS.maxSnapshotBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "canonical graph snapshot exceeds the PoC byte limit",
    });
  }
});
export type CanonicalGraphSnapshot = z.infer<
  typeof CanonicalGraphSnapshotSchema
>;

export const CanonicalGraphQueryRequestSchema = z.object({
  anchorRefs: z.array(CanonicalRefSchema)
    .min(1)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities),
  purpose: ProjectionPurposeSchema,
  temporalWindow: TemporalWindowSchema.optional(),
  maxDepth: z.number().int().min(0)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryDepth)
    .default(2),
  maxEntities: z.number().int().min(1)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities)
    .default(32),
  maxFacts: z.number().int().min(1)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts)
    .default(128),
}).strict();
export type CanonicalGraphQueryRequest = z.input<
  typeof CanonicalGraphQueryRequestSchema
>;

export const CanonicalGraphQueryResultSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("server_only_graph_query"),
  purpose: ProjectionPurposeSchema,
  anchorRefs: z.array(CanonicalRefSchema),
  missingAnchorRefs: z.array(CanonicalRefSchema),
  entityRefs: z.array(CanonicalRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities),
  traversedKinds: z.array(InteractionKindSchema)
    .max(InteractionKindSchema.options.length),
  facts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  causalLinks: z.array(ProjectionCausalLinkSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  worldProcessRefs: z.array(CanonicalRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities),
  issues: z.array(ConsistencyIssueViewSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxIssues),
  ruleRefs: z.array(RuleRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxRules),
  truncated: z.boolean(),
  omitted: z.object({
    entities: z.number().int().nonnegative(),
    facts: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type CanonicalGraphQueryResult = z.infer<
  typeof CanonicalGraphQueryResultSchema
>;

export const CanonicalGraphPatchReadSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow_patch_graph_read"),
  patchSourceRef: CanonicalRefSchema,
  anchorRefs: z.array(CanonicalRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities),
  directFacts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  inverseFacts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  retractionFacts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  assertionSlotFacts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  recentCausalFacts: z.array(CanonicalProjectionFactSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  causalLinks: z.array(ProjectionCausalLinkSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts),
  issues: z.array(ConsistencyIssueViewSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxIssues),
  ruleRefs: z.array(RuleRefSchema)
    .max(CANONICAL_GRAPH_POC_LIMITS.maxRules),
  missingRetractionFactRefs: z.array(FactRefSchema),
  truncated: z.boolean(),
  sourceMutated: z.literal(false),
}).strict();
export type CanonicalGraphPatchRead = z.infer<
  typeof CanonicalGraphPatchReadSchema
>;

export const CanonicalGraphIndexStatsSchema = z.object({
  entities: z.number().int().nonnegative(),
  facts: z.number().int().nonnegative(),
  factSubjectBuckets: z.number().int().nonnegative(),
  factObjectBuckets: z.number().int().nonnegative(),
  temporalTurnBuckets: z.number().int().nonnegative(),
  causalSourceBuckets: z.number().int().nonnegative(),
  causalTargetBuckets: z.number().int().nonnegative(),
  interactionSourceBuckets: z.number().int().nonnegative(),
  worldProcesses: z.number().int().nonnegative(),
  issues: z.number().int().nonnegative(),
  rules: z.number().int().nonnegative(),
}).strict();
export type CanonicalGraphIndexStats = z.infer<
  typeof CanonicalGraphIndexStatsSchema
>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function edgeKey(edge: ProjectionInteractionEdge): string {
  return [
    edge.from,
    edge.to,
    edge.kind,
    edge.historyTurn ?? -1,
  ].join("\u0000");
}

function factKey(fact: CanonicalProjectionFact): string {
  return [fact.id, fact.subjectRef, fact.predicate, fact.objectRef ?? ""]
    .join("\u0000");
}

function causalKey(link: ProjectionCausalLink): string {
  return [link.sourceRef, link.targetFactRef, link.relation].join("\u0000");
}

function graphEntityKind(
  kind: "character" | "object" | "terrain" | "effect" | "other",
): CanonicalGraphEntity["kind"] {
  if (kind === "effect") return "process";
  if (kind === "other") return "object";
  return kind;
}

function buildGraphEntities(state: BattleState): CanonicalGraphEntity[] {
  const entities = new Map<string, CanonicalGraphEntity>();
  entities.set("battle.scene", {
    id: "battle.scene",
    kind: "location",
    type: "battle_scene",
    stableAttributes: { sourceKinds: ["battle"] },
  });
  for (const characterRef of ["character.a", "character.b"] as const) {
    entities.set(characterRef, {
      id: characterRef,
      kind: "character",
      type: "legacy_character",
      stableAttributes: { sourceKinds: ["battle"] },
    });
  }
  for (const [areaId, area] of Object.entries(state.worldState?.areas ?? {})) {
    entities.set(areaId, {
      id: areaId,
      kind: "location",
      type: "world_area",
      stableAttributes: {
        sourceKinds: ["world"],
        canonicalLabel: area.label,
      },
    });
  }
  const entityRefs = uniqueSorted([
    ...Object.keys(state.worldState?.entities ?? {}),
    ...Object.keys(state.semanticState?.entities ?? {}),
  ]);
  for (const entityRef of entityRefs) {
    const world = state.worldState?.entities[entityRef];
    const semantic = state.semanticState?.entities[entityRef];
    const kind = world?.kind ?? semantic?.kind ?? "other";
    const sourceKinds = [
      ...(world ? ["world"] : []),
      ...(semantic ? ["semantic"] : []),
    ];
    const canonicalLabel = world?.objectProfile?.canonicalLabel ??
      semantic?.label ?? null;
    entities.set(entityRef, {
      id: entityRef,
      kind: graphEntityKind(kind),
      type: `legacy_${kind}`,
      stableAttributes: {
        sourceKinds,
        legacyKinds: uniqueSorted([
          ...(world ? [world.kind] : []),
          ...(semantic ? [semantic.kind] : []),
        ]),
        ...(canonicalLabel ? { canonicalLabel } : {}),
      },
    });
  }
  return [...entities.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

function overlapsWindow(
  fact: CanonicalProjectionFact,
  window: TemporalWindow | undefined,
): boolean {
  if (!window) return true;
  const factTo = fact.validToTurn ?? Number.POSITIVE_INFINITY;
  return fact.validFromTurn <= window.toTurn && factTo >= window.fromTurn;
}

function validAtTurn(fact: CanonicalProjectionFact, turn: number): boolean {
  return fact.validFromTurn <= turn &&
    (fact.validToTurn === undefined || fact.validToTurn >= turn);
}

function assertionSlotKey(input: {
  subjectRef: string;
  predicate: string;
  objectRef?: string;
}): string {
  return JSON.stringify([
    input.subjectRef,
    input.predicate,
    input.predicate.startsWith("relation.") ? input.objectRef ?? null : null,
  ]);
}

function issueApplies(input: {
  issue: ConsistencyIssueView;
  entityRefs: Set<string>;
  factRefs: Set<string>;
  purpose: ProjectionPurpose;
}): boolean {
  if (!input.issue.blocksPurposes.includes(input.purpose)) return false;
  if (
    input.issue.involvedEntityRefs.length === 0 &&
    input.issue.involvedFactRefs.length === 0
  ) return true;
  return input.issue.involvedEntityRefs.some((ref) =>
    input.entityRefs.has(ref)
  ) || input.issue.involvedFactRefs.some((ref) => input.factRefs.has(ref));
}

function addToIndex<T>(
  index: Map<string, T[]>,
  key: string,
  value: T,
): void {
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}

/**
 * Immutable, indexed view over a legacy BattleState. It implements the
 * projection read-source boundary but has no commit or persistence authority.
 */
export class BattleStateCanonicalGraphView implements BattleProjectionReadSource {
  readonly #state: BattleState;
  readonly #snapshot: CanonicalGraphSnapshot;
  readonly #entitiesById = new Map<string, CanonicalGraphEntity>();
  readonly #factsById = new Map<string, CanonicalProjectionFact>();
  readonly #factsBySubject = new Map<string, CanonicalProjectionFact[]>();
  readonly #factsByObject = new Map<string, CanonicalProjectionFact[]>();
  readonly #factsByTurn = new Map<string, CanonicalProjectionFact[]>();
  readonly #causalBySource = new Map<string, ProjectionCausalLink[]>();
  readonly #causalByTarget = new Map<string, ProjectionCausalLink[]>();
  readonly #edgesBySource = new Map<string, ProjectionInteractionEdge[]>();

  constructor(input: {
    state: BattleState;
    issueEnvelope?: ConsistencyIssuePocEnvelope;
  }) {
    this.#state = clone(input.state);
    const projection = buildBattleStateProjectionGraphSnapshot(this.#state);
    const issueEnvelope = input.issueEnvelope
      ? ConsistencyIssuePocEnvelopeSchema.parse(clone(input.issueEnvelope))
      : null;
    this.#snapshot = CanonicalGraphSnapshotSchema.parse({
      schemaVersion: 1,
      mode: "battle_state_graph_view",
      source: {
        battleRef: this.#state.id,
        battleTurn: this.#state.turn,
        semanticRevision: this.#state.semanticState?.revision ?? null,
        worldRevision: this.#state.worldState?.revision ?? null,
        issueRevision: issueEnvelope?.revision ?? null,
        turnRecordCount: this.#state.turnRecords.length,
      },
      entities: buildGraphEntities(this.#state),
      facts: [...projection.facts].sort((left, right) =>
        factKey(left).localeCompare(factKey(right))
      ),
      causalLinks: [...projection.causalLinks].sort((left, right) =>
        causalKey(left).localeCompare(causalKey(right))
      ),
      interactionEdges: [...projection.interactionEdges].sort((left, right) =>
        edgeKey(left).localeCompare(edgeKey(right))
      ),
      worldProcessRefs: uniqueSorted(projection.processRefs),
      issues: issueEnvelope
        ? projectConsistencyIssueViews(issueEnvelope).sort((left, right) =>
            left.id.localeCompare(right.id)
          )
        : [],
      ruleRefs: uniqueSorted(projection.ruleRefs),
    });
    for (const entity of this.#snapshot.entities) {
      this.#entitiesById.set(entity.id, entity);
    }
    for (const fact of this.#snapshot.facts) {
      this.#factsById.set(fact.id, fact);
      addToIndex(this.#factsBySubject, fact.subjectRef, fact);
      if (fact.objectRef) addToIndex(this.#factsByObject, fact.objectRef, fact);
      for (
        let turn = fact.validFromTurn;
        turn <= (fact.validToTurn ?? fact.validFromTurn);
        turn += 1
      ) {
        addToIndex(this.#factsByTurn, String(turn), fact);
      }
    }
    for (const link of this.#snapshot.causalLinks) {
      addToIndex(this.#causalBySource, link.sourceRef, link);
      addToIndex(this.#causalByTarget, link.targetFactRef, link);
    }
    for (const edge of this.#snapshot.interactionEdges) {
      addToIndex(this.#edgesBySource, edge.from, edge);
    }
  }

  snapshot(): CanonicalGraphSnapshot {
    return clone(this.#snapshot);
  }

  legacyStateSnapshot(): BattleState {
    return clone(this.#state);
  }

  entity(ref: string): CanonicalGraphEntity | null {
    const entity = this.#entitiesById.get(ref);
    return entity ? clone(entity) : null;
  }

  entityRefs(): string[] {
    return this.#snapshot.entities.map((entity) => entity.id);
  }

  processRefs(): string[] {
    return [...this.#snapshot.worldProcessRefs];
  }

  ruleRefs(): string[] {
    return [...this.#snapshot.ruleRefs];
  }

  factsForEntity(ref: string, includeInverse = true): CanonicalProjectionFact[] {
    return clone([...new Map([
      ...(this.#factsBySubject.get(ref) ?? []),
      ...(includeInverse ? this.#factsByObject.get(ref) ?? [] : []),
    ].map((fact) => [fact.id, fact] as const)).values()]
      .sort((left, right) => factKey(left).localeCompare(factKey(right))));
  }

  factsAtTurn(turn: number): CanonicalProjectionFact[] {
    return clone(this.#snapshot.facts.filter((fact) =>
      fact.validFromTurn <= turn &&
      (fact.validToTurn === undefined || fact.validToTurn >= turn)
    ).sort((left, right) => factKey(left).localeCompare(factKey(right))));
  }

  causalLinksForSource(sourceRef: string): ProjectionCausalLink[] {
    return clone(this.#causalBySource.get(sourceRef) ?? []);
  }

  causalLinksForFact(factRef: string): ProjectionCausalLink[] {
    return clone(this.#causalByTarget.get(factRef) ?? []);
  }

  factsForHistoryTurns(historyTurns: number[]): CanonicalProjectionFactCollection {
    const selectedTurns = new Set(historyTurns);
    const facts = this.#snapshot.facts.filter((fact) =>
      !["temporal", "event"].includes(fact.source) ||
      selectedTurns.has(fact.validFromTurn)
    );
    const factRefs = new Set(facts.map((fact) => fact.id));
    return {
      facts: clone(facts),
      causalLinks: clone(this.#snapshot.causalLinks.filter((link) =>
        factRefs.has(link.targetFactRef)
      )),
    };
  }

  interactionEdgesForHistoryTurns(
    historyTurns: number[],
  ): ProjectionInteractionEdge[] {
    const selectedTurns = new Set(historyTurns);
    return clone(this.#snapshot.interactionEdges.filter((edge) =>
      edge.historyTurn === undefined || selectedTurns.has(edge.historyTurn)
    ));
  }

  issueViews(input: {
    entityRefs: string[];
    factRefs: string[];
    purpose: ProjectionPurpose;
  }): ConsistencyIssueView[] {
    const entityRefs = new Set(input.entityRefs);
    const factRefs = new Set(input.factRefs);
    return clone(this.#snapshot.issues.filter((issue) => issueApplies({
      issue,
      entityRefs,
      factRefs,
      purpose: input.purpose,
    })));
  }

  query(rawRequest: CanonicalGraphQueryRequest): CanonicalGraphQueryResult {
    const request = CanonicalGraphQueryRequestSchema.parse(rawRequest);
    const anchors = uniqueSorted(request.anchorRefs.filter((ref) =>
      this.#entitiesById.has(ref)
    ));
    const missingAnchorRefs = uniqueSorted(request.anchorRefs.filter((ref) =>
      !this.#entitiesById.has(ref)
    ));
    const selected = new Set<string>();
    const traversedKinds = new Set<z.infer<typeof InteractionKindSchema>>();
    const queue = anchors.map((ref) => ({ ref, depth: 0 }));
    const queued = new Set(anchors);
    let omittedEntities = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (selected.has(current.ref)) continue;
      if (selected.size >= request.maxEntities) {
        omittedEntities += 1;
        continue;
      }
      selected.add(current.ref);
      if (current.depth >= request.maxDepth) continue;
      for (const edge of this.#edgesBySource.get(current.ref) ?? []) {
        if (
          edge.historyTurn !== undefined &&
          request.temporalWindow &&
          (
            edge.historyTurn < request.temporalWindow.fromTurn ||
            edge.historyTurn > request.temporalWindow.toTurn
          )
        ) continue;
        traversedKinds.add(edge.kind);
        if (!selected.has(edge.to) && !queued.has(edge.to)) {
          queue.push({ ref: edge.to, depth: current.depth + 1 });
          queued.add(edge.to);
        }
      }
    }
    const candidateFacts = [...new Map([...selected].flatMap((ref) =>
      this.factsForEntity(ref).map((fact) => [fact.id, fact] as const)
    )).values()].filter((fact) => overlapsWindow(fact, request.temporalWindow))
      .sort((left, right) => factKey(left).localeCompare(factKey(right)));
    const facts = candidateFacts.slice(0, request.maxFacts);
    const factRefs = new Set(facts.map((fact) => fact.id));
    const entityRefs = uniqueSorted(selected);
    return CanonicalGraphQueryResultSchema.parse({
      schemaVersion: 1,
      mode: "server_only_graph_query",
      purpose: request.purpose,
      anchorRefs: anchors,
      missingAnchorRefs,
      entityRefs,
      traversedKinds: uniqueSorted(traversedKinds),
      facts,
      causalLinks: this.#snapshot.causalLinks.filter((link) =>
        factRefs.has(link.targetFactRef)
      ).slice(0, request.maxFacts),
      worldProcessRefs: this.#snapshot.worldProcessRefs.filter((ref) =>
        selected.has(ref)
      ),
      issues: this.issueViews({
        entityRefs,
        factRefs: [...factRefs],
        purpose: request.purpose,
      }),
      ruleRefs: this.#snapshot.ruleRefs,
      truncated: omittedEntities > 0 || candidateFacts.length > facts.length,
      omitted: {
        entities: omittedEntities,
        facts: Math.max(0, candidateFacts.length - facts.length),
      },
    });
  }

  readPatch(rawPatch: ShadowCanonicalPatch): CanonicalGraphPatchRead {
    const patch = ShadowCanonicalPatchSchema.parse(clone(rawPatch));
    const anchors = uniqueSorted([
      ...patch.touchedRefs,
      ...patch.assertions.flatMap((fact) => [
        fact.subjectRef,
        ...(fact.objectRef ? [fact.objectRef] : []),
      ]),
    ]);
    const directCandidates = uniqueSorted(anchors).flatMap((ref) =>
      this.#factsBySubject.get(ref) ?? []
    );
    const inverseCandidates = uniqueSorted(anchors).flatMap((ref) =>
      this.#factsByObject.get(ref) ?? []
    );
    const currentTurn = this.#snapshot.source.battleTurn;
    const directFacts = [...new Map(directCandidates.filter((fact) =>
      validAtTurn(fact, currentTurn)
    ).map((fact) =>
      [fact.id, fact] as const
    )).values()].sort((left, right) => factKey(left).localeCompare(factKey(right)));
    const inverseFacts = [...new Map(inverseCandidates.filter((fact) =>
      validAtTurn(fact, currentTurn)
    ).map((fact) =>
      [fact.id, fact] as const
    )).values()].sort((left, right) => factKey(left).localeCompare(factKey(right)));
    const retractionFacts = patch.retractions.flatMap((factRef) => {
      const fact = this.#factsById.get(factRef);
      return fact ? [fact] : [];
    });
    const missingRetractionFactRefs = patch.retractions.filter((factRef) =>
      !this.#factsById.has(factRef)
    );
    const slotKeys = new Set(patch.assertions.map(assertionSlotKey));
    const assertionSlotFacts = this.#snapshot.facts.filter((fact) =>
      validAtTurn(fact, currentTurn) && slotKeys.has(assertionSlotKey(fact))
    );
    const recentCausalCandidates = [...new Map([
      ...directCandidates,
      ...inverseCandidates,
    ].filter((fact) => ["temporal", "event"].includes(fact.source))
      .map((fact) => [fact.id, fact] as const)).values()]
      .sort((left, right) =>
        right.validFromTurn - left.validFromTurn ||
        factKey(left).localeCompare(factKey(right))
      );
    const recentCausalFacts = recentCausalCandidates
      .slice(0, CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts)
      .sort((left, right) => factKey(left).localeCompare(factKey(right)));
    const allFacts = [...new Map([
      ...directFacts,
      ...inverseFacts,
      ...retractionFacts,
      ...assertionSlotFacts,
      ...recentCausalFacts,
    ].map((fact) => [fact.id, fact] as const)).values()];
    const factRefs = new Set(allFacts.map((fact) => fact.id));
    const entityRefs = new Set(anchors);
    const maxFacts = CANONICAL_GRAPH_POC_LIMITS.maxQueryFacts;
    const truncated = anchors.length > CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities ||
      directFacts.length > maxFacts || inverseFacts.length > maxFacts ||
      assertionSlotFacts.length > maxFacts ||
      recentCausalCandidates.length > maxFacts;
    return CanonicalGraphPatchReadSchema.parse({
      schemaVersion: 1,
      mode: "shadow_patch_graph_read",
      patchSourceRef: patch.sourceRef,
      anchorRefs: anchors.slice(0, CANONICAL_GRAPH_POC_LIMITS.maxQueryEntities),
      directFacts: directFacts.slice(0, maxFacts),
      inverseFacts: inverseFacts.slice(0, maxFacts),
      retractionFacts: retractionFacts.slice(0, maxFacts),
      assertionSlotFacts: assertionSlotFacts.slice(0, maxFacts),
      recentCausalFacts,
      causalLinks: this.#snapshot.causalLinks.filter((link) =>
        factRefs.has(link.targetFactRef)
      ).slice(0, maxFacts),
      issues: this.issueViews({
        entityRefs: [...entityRefs],
        factRefs: [...factRefs],
        purpose: "patch_audit",
      }),
      ruleRefs: this.#snapshot.ruleRefs,
      missingRetractionFactRefs,
      truncated,
      sourceMutated: false,
    });
  }

  indexStats(): CanonicalGraphIndexStats {
    return CanonicalGraphIndexStatsSchema.parse({
      entities: this.#entitiesById.size,
      facts: this.#factsById.size,
      factSubjectBuckets: this.#factsBySubject.size,
      factObjectBuckets: this.#factsByObject.size,
      temporalTurnBuckets: this.#factsByTurn.size,
      causalSourceBuckets: this.#causalBySource.size,
      causalTargetBuckets: this.#causalByTarget.size,
      interactionSourceBuckets: this.#edgesBySource.size,
      worldProcesses: this.#snapshot.worldProcessRefs.length,
      issues: this.#snapshot.issues.length,
      rules: this.#snapshot.ruleRefs.length,
    });
  }
}

export function createBattleStateCanonicalGraphView(input: {
  state: BattleState;
  issueEnvelope?: ConsistencyIssuePocEnvelope;
}): BattleStateCanonicalGraphView {
  return new BattleStateCanonicalGraphView(input);
}

export function createCanonicalGraphProjectionAdapter(
  graph: BattleStateCanonicalGraphView,
): CanonicalProjectionService {
  return new BattleStateProjectionAdapter(graph.legacyStateSnapshot(), graph);
}
