import { z } from "zod";
import {
  AdaptiveAdjudicationBatchResultSchema,
  AdaptiveAdjudicationBudgetSchema,
  AdaptiveProposalCaseSchema,
  adjudicateAdaptiveBattleProposals,
  type AdaptiveAdjudicationReceipt,
  type AdaptiveEffect,
} from "./battle-adaptive-adjudication.js";
import {
  CanonicalGraphIndexStatsSchema,
  CanonicalGraphQueryResultSchema,
  createBattleStateCanonicalGraphView,
  createCanonicalGraphProjectionAdapter,
  type CanonicalGraphSnapshot,
} from "./battle-canonical-graph.js";
import {
  ShadowCanonicalFactSchema,
  ShadowCanonicalPatchSchema,
  ShadowPatchAuditResultSchema,
  auditShadowCanonicalPatch,
  type ShadowCanonicalFact,
  type ShadowCanonicalPatch,
} from "./battle-canonical-patch.js";
import {
  PatchAuditRegistrationReceiptSchema,
  createConsistencyIssuePocEnvelope,
  projectConsistencyIssueViews,
  registerPatchAuditResult,
} from "./battle-consistency-issue.js";
import {
  AdjudicationSliceSchema,
  ConsistencyIssueViewSchema,
  ConsistencySliceSchema,
  ObservationSliceSchema,
  type CanonicalProjectionFact,
  type ConsistencyFactRow,
  type ConsistencySlice,
} from "./battle-projection.js";
import {
  PurposeScopedReadCheckSchema,
  ShadowReadRepairRunSchema,
  checkPurposeScopedConsistencySlice,
  runShadowConsistencyRepair,
} from "./battle-read-coherence.js";
import {
  ActiveWorldProcessSchema,
  WorldProcessConcretizationSchema,
  WorldProcessPocResultSchema,
  WorldTimelineCharacterProposalSchema,
  evaluateWorldProcessesPoc,
} from "./battle-world-process-poc.js";
import { BattleStateSchema } from "./battle.js";

const RefSchema = z.string().min(1).max(240);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

const ExpectedDependenciesSchema = z.object({
  entityRefs: z.array(RefSchema).max(128),
  sourceFactRefs: z.array(RefSchema).max(512),
  inputFactRefs: z.array(RefSchema).max(512),
  factRefs: z.array(RefSchema).max(512),
  predicates: z.array(z.string().min(1).max(160)).max(128),
  ruleRefs: z.array(RefSchema).max(128),
  processRefs: z.array(RefSchema).max(128),
}).strict();

const ExpectedBoundariesSchema = z.object({
  forbiddenObserverIdentifiers: z.array(RefSchema).max(32),
  sourceMutationAllowed: z.literal(false),
  authoritativeOutcomeChangeAllowed: z.literal(false),
  canonicalCommitAllowed: z.literal(false),
  allowedFallbacks: z.array(z.enum([
    "defense",
    "intermediate",
    "weak",
    "unknown",
  ])).max(8),
}).strict();

const CallModelSchema = z.object({
  currentAuthoritativeTopology: z.object({
    semanticWorldSensoryCalls: z.number().int().nonnegative(),
    characterACalls: z.number().int().nonnegative(),
    characterBCalls: z.number().int().nonnegative(),
    narratorCalls: z.number().int().nonnegative(),
    minimumCalls: z.number().int().nonnegative(),
  }).strict(),
  localCaptureExternalLlmCalls: z.literal(0),
  shadowModeledOrdinaryCalls: z.number().int().nonnegative(),
  generationTokensMeasured: z.literal(false),
  generationLatencyMeasured: z.literal(false),
}).strict();

const CharacterInputsSchema = z.object({
  cases: z.array(AdaptiveProposalCaseSchema).max(4),
  budget: AdaptiveAdjudicationBudgetSchema,
  ruleRefs: z.array(RefSchema).max(64),
  inputsPreAuthored: z.literal(true),
  generationCallsMeasured: z.literal(false),
}).strict();

const WorldInputsSchema = z.object({
  projection: ConsistencySliceSchema.nullable(),
  activeProcesses: z.array(ActiveWorldProcessSchema).max(16),
  characterProposals: z.array(WorldTimelineCharacterProposalSchema).max(16),
  concretizations: z.array(WorldProcessConcretizationSchema).max(16),
  inputsPreAuthored: z.literal(true),
  generationCallsMeasured: z.literal(false),
}).strict();

export const IntegratedShadowTurnInputSchema = z.object({
  transcriptRef: RefSchema,
  sourceBattleState: BattleStateSchema,
  sourceBattleStateDigest: DigestSchema,
  authoritativeOutcome: z.unknown(),
  authoritativeOutcomeDigest: DigestSchema,
  characterInputs: CharacterInputsSchema,
  worldInputs: WorldInputsSchema,
  consistencyInputs: z.array(ConsistencySliceSchema).max(16),
  expectedDependencies: ExpectedDependenciesSchema,
  expectedBoundaries: ExpectedBoundariesSchema,
  callModel: CallModelSchema,
}).strict();
export type IntegratedShadowTurnInput = z.infer<
  typeof IntegratedShadowTurnInputSchema
>;

const ComponentArtifactReceiptSchema = z.object({
  componentRef: RefSchema,
  digest: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/u),
  bytes: z.number().int().nonnegative(),
  schemaValid: z.literal(true),
  truncated: z.boolean(),
}).strict();

const ProjectionReceiptsSchema = z.object({
  observationA: ComponentArtifactReceiptSchema,
  observationB: ComponentArtifactReceiptSchema,
  adjudication: ComponentArtifactReceiptSchema.nullable(),
  consistency: z.array(ComponentArtifactReceiptSchema).min(1).max(32),
}).strict();

const AdaptiveStageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("executed"),
    result: AdaptiveAdjudicationBatchResultSchema,
  }).strict(),
  z.object({
    status: z.literal("skipped"),
    reason: z.literal("no_character_proposals"),
  }).strict(),
]);

const WorldStageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("executed"),
    result: WorldProcessPocResultSchema,
  }).strict(),
  z.object({
    status: z.literal("skipped"),
    reason: z.literal("no_world_projection"),
  }).strict(),
]);

const PatchStageReceiptSchema = z.object({
  patchRef: RefSchema,
  patch: ShadowCanonicalPatchSchema,
  audit: ShadowPatchAuditResultSchema,
  registration: PatchAuditRegistrationReceiptSchema,
}).strict();

const ReadStageReceiptSchema = z.object({
  sliceRef: RefSchema,
  check: PurposeScopedReadCheckSchema,
  repairPreview: ShadowReadRepairRunSchema,
}).strict();

const CausalTraceSchema = z.object({
  sourceRef: RefSchema,
  targetRef: RefSchema,
  relation: z.enum([
    "proposal_effect",
    "effect_fact",
    "caused",
    "process_proposal",
    "created",
    "ended",
    "modified",
    "triggered",
  ]),
}).strict();

const MissingDependenciesSchema = z.object({
  entityRefs: z.array(RefSchema),
  factRefs: z.array(RefSchema),
  predicates: z.array(z.string().min(1).max(160)),
  ruleRefs: z.array(RefSchema),
  processRefs: z.array(RefSchema),
}).strict();

const DependencyAuditSchema = z.object({
  expectedCount: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  recall: z.number().min(0).max(1),
  allResolved: z.boolean(),
  missing: MissingDependenciesSchema,
}).strict();

const ComponentCoverageSchema = z.object({
  expectedComponentRefs: z.array(RefSchema),
  completedComponentRefs: z.array(RefSchema),
  coverage: z.number().min(0).max(1),
}).strict();

const AuthorityBoundarySchema = z.object({
  sourceMutated: z.literal(false),
  authoritativeOutcomeChanged: z.literal(false),
  canonicalCommitPerformed: z.literal(false),
  externalLlmCallsMade: z.literal(0),
  observerCanonicalIdentifierLeakCount: z.number().int().nonnegative(),
  outOfScopeRepairMutationCount: z.literal(0),
  danglingReferenceCount: z.number().int().nonnegative(),
  temporalAtomicityFailureCount: z.number().int().nonnegative(),
}).strict();

export const IntegratedShadowTurnReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("integrated_shadow_turn_poc"),
  transcriptRef: RefSchema,
  sourceBattleRef: RefSchema,
  sourceTurn: z.number().int().nonnegative(),
  sourceBattleStateDigest: DigestSchema,
  authoritativeOutcomeDigest: DigestSchema,
  temporalWindow: z.object({
    fromTurn: z.number().int().nonnegative(),
    toTurn: z.number().int().nonnegative(),
    phase: z.literal("execution"),
  }).strict(),
  projections: ProjectionReceiptsSchema,
  graph: z.object({
    query: CanonicalGraphQueryResultSchema,
    queryArtifact: ComponentArtifactReceiptSchema,
    indexStats: CanonicalGraphIndexStatsSchema,
  }).strict(),
  adaptive: AdaptiveStageSchema,
  world: WorldStageSchema,
  patches: z.array(PatchStageReceiptSchema).max(32),
  reads: z.array(ReadStageReceiptSchema).min(1).max(32),
  issues: z.array(ConsistencyIssueViewSchema).max(128),
  causalTraces: z.array(CausalTraceSchema).max(512),
  dependencyAudit: DependencyAuditSchema,
  referenceAudit: z.object({
    checkedLinkCount: z.number().int().nonnegative(),
    danglingRefs: z.array(RefSchema),
  }).strict(),
  componentCoverage: ComponentCoverageSchema,
  conflictHandling: z.object({
    required: z.boolean(),
    explicit: z.boolean(),
    fallbackFactRefs: z.array(RefSchema),
    conflictedReadRefs: z.array(RefSchema),
  }).strict(),
  metrics: z.object({
    projectionBytes: z.number().int().nonnegative(),
    componentPayloadBytes: z.number().int().nonnegative(),
    truncationCount: z.number().int().nonnegative(),
    currentAuthoritativeMinimumCalls: z.number().int().nonnegative(),
    shadowModeledOrdinaryCalls: z.number().int().nonnegative(),
    externalLlmCallsMade: z.literal(0),
    generationTokensMeasured: z.literal(false),
    generationLatencyMeasured: z.literal(false),
  }).strict(),
  boundaries: AuthorityBoundarySchema,
}).strict();
export type IntegratedShadowTurnReceipt = z.infer<
  typeof IntegratedShadowTurnReceiptSchema
>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function componentArtifact(input: {
  componentRef: string;
  value: unknown;
  truncated?: boolean;
}): z.infer<typeof ComponentArtifactReceiptSchema> {
  const canonical = stableJson(input.value);
  return ComponentArtifactReceiptSchema.parse({
    componentRef: input.componentRef,
    digest: `fnv1a32:${fnv1a(canonical)}`,
    bytes: new TextEncoder().encode(canonical).byteLength,
    schemaValid: true,
    truncated: input.truncated ?? false,
  });
}

function projectionFactToShadow(
  fact: CanonicalProjectionFact,
): ShadowCanonicalFact {
  const subsystem = fact.source === "world"
    ? "world" as const
    : fact.source === "semantic"
      ? "semantic" as const
      : fact.source === "repair"
        ? "repair" as const
        : "mechanical" as const;
  const authority = subsystem === "world"
    ? "validated_world_transition" as const
    : subsystem === "semantic"
      ? "validated_semantic_transition" as const
      : subsystem === "repair"
        ? "repair" as const
        : "deterministic_resolver" as const;
  return ShadowCanonicalFactSchema.parse({
    id: fact.id,
    subjectRef: fact.subjectRef,
    predicate: fact.predicate,
    ...(fact.objectRef ? { objectRef: fact.objectRef } : {}),
    ...(Object.hasOwn(fact, "value") ? { value: clone(fact.value) } : {}),
    validFrom: { turn: fact.validFromTurn },
    ...(fact.validToTurn === undefined
      ? {}
      : { validTo: { turn: fact.validToTurn } }),
    provenance: {
      subsystem,
      authority,
      sourceRef: `projection:${fact.id}`,
      sourceEventRefs: [],
    },
  });
}

function consistencySliceFacts(slice: ConsistencySlice): ShadowCanonicalFact[] {
  return slice.factGroups.flatMap((group) => group.facts.map((row) => {
    const source = row[5];
    const subsystem = source === "world"
      ? "world" as const
      : source === "semantic"
        ? "semantic" as const
        : source === "repair"
          ? "repair" as const
          : "mechanical" as const;
    const authority = subsystem === "world"
      ? "validated_world_transition" as const
      : subsystem === "semantic"
        ? "validated_semantic_transition" as const
        : subsystem === "repair"
          ? "repair" as const
          : "deterministic_resolver" as const;
    return ShadowCanonicalFactSchema.parse({
      id: row[0],
      subjectRef: group.subjectRef,
      predicate: row[1],
      ...(row[2] ? { objectRef: row[2] } : {}),
      ...(row.length === 7 ? { value: clone(row[6]) } : {}),
      validFrom: { turn: row[3] },
      ...(row[4] === null ? {} : { validTo: { turn: row[4] } }),
      provenance: {
        subsystem,
        authority,
        sourceRef: `projection:${row[0]}`,
        sourceEventRefs: [],
      },
    });
  }));
}

function activeAtTurn(fact: CanonicalProjectionFact, turn: number): boolean {
  return fact.validFromTurn <= turn &&
    (fact.validToTurn === undefined || fact.validToTurn >= turn);
}

function adaptivePatch(input: {
  receipt: AdaptiveAdjudicationReceipt;
  snapshot: CanonicalGraphSnapshot;
  supplementalFacts: readonly ShadowCanonicalFact[];
  turn: number;
}): ShadowCanonicalPatch | null {
  const effects = [
    ...input.receipt.effects,
    ...input.receipt.costs.flatMap((cost) => cost.effect ? [cost.effect] : []),
  ];
  if (effects.length === 0) return null;
  const supplemental = input.supplementalFacts.map((fact) => ({
    id: fact.id,
    subjectRef: fact.subjectRef,
    predicate: fact.predicate,
    objectRef: fact.objectRef,
    validFromTurn: fact.validFrom.turn,
    validToTurn: fact.validTo?.turn,
  }));
  const currentFacts = [
    ...input.snapshot.facts.filter((fact) => activeAtTurn(fact, input.turn)),
    ...supplemental,
  ];
  const assertions: ShadowCanonicalFact[] = [];
  const retractions = new Set<string>();
  const touchedRefs = new Set<string>();
  const causalLinks: ShadowCanonicalPatch["causalLinks"] = [];
  const sourceRef = `adaptive:${input.receipt.proposalRef}`;
  for (const effect of effects) {
    if (effect.operation === "retract" && effect.factRef) {
      const prior = currentFacts.find((fact) => fact.id === effect.factRef);
      retractions.add(effect.factRef);
      if (prior) touchedRefs.add(prior.subjectRef);
      causalLinks.push({
        sourceRef: effect.causalSourceRef,
        targetFactRef: effect.factRef,
        relation: "ended",
      });
      continue;
    }
    if (!effect.fact) continue;
    const fact = effect.fact;
    const priorFacts = currentFacts.filter((prior) =>
      prior.subjectRef === fact.subjectRef &&
      prior.predicate === fact.predicate &&
      (prior.objectRef ?? null) === (fact.objectRef ?? null)
    );
    for (const prior of priorFacts) {
      retractions.add(prior.id);
      causalLinks.push({
        sourceRef: effect.causalSourceRef,
        targetFactRef: prior.id,
        relation: "ended",
      });
    }
    assertions.push(ShadowCanonicalFactSchema.parse({
      id: fact.id,
      subjectRef: fact.subjectRef,
      predicate: fact.predicate,
      ...(fact.objectRef ? { objectRef: fact.objectRef } : {}),
      ...(Object.hasOwn(fact, "value") ? { value: clone(fact.value) } : {}),
      validFrom: { turn: input.turn },
      provenance: {
        subsystem: "mechanical",
        authority: "deterministic_resolver",
        sourceRef,
        sourceEventRefs: [effect.id],
      },
    }));
    touchedRefs.add(fact.subjectRef);
    causalLinks.push({
      sourceRef: effect.causalSourceRef,
      targetFactRef: fact.id,
      relation: priorFacts.length > 0 ? "modified" : "created",
    });
  }
  return ShadowCanonicalPatchSchema.parse({
    schemaVersion: 1,
    mode: "shadow",
    sourceRef,
    assertions,
    retractions: uniqueSorted(retractions),
    causalLinks,
    touchedRefs: uniqueSorted(touchedRefs),
  });
}

function flatConsistencyRows(slice: ConsistencySlice): Array<{
  subjectRef: string;
  row: ConsistencyFactRow;
}> {
  return slice.factGroups.flatMap((group) => group.facts.map((row) => ({
    subjectRef: group.subjectRef,
    row,
  })));
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(stringsIn);
  }
  return [];
}

function addAdaptiveInputRefs(
  cases: IntegratedShadowTurnInput["characterInputs"]["cases"],
  refs: Set<string>,
): void {
  for (const proposalCase of cases) {
    refs.add(proposalCase.proposal.proposalRef);
    refs.add(proposalCase.proposal.actorRef);
    proposalCase.proposal.targetRefs.forEach((ref) => refs.add(ref));
    proposalCase.scopeRefs.forEach((ref) => refs.add(ref));
    proposalCase.facts.forEach((fact) => refs.add(fact.id));
    proposalCase.fallbackClaims.forEach((fact) => refs.add(fact.id));
    for (const expansion of proposalCase.worldExpansions) {
      refs.add(expansion.requestRef);
      refs.add(expansion.baseFactRef);
      refs.add(expansion.refinedFact.id);
    }
    for (const step of proposalCase.characterPlan?.steps ?? []) {
      refs.add(step.id);
      step.preconditions.forEach((condition) => refs.add(condition.factRef));
      for (const effect of step.effects) {
        refs.add(effect.id);
        refs.add(effect.causalSourceRef);
        if (effect.fact) refs.add(effect.fact.id);
        if (effect.factRef) refs.add(effect.factRef);
      }
      for (const cost of step.costs) {
        refs.add(cost.id);
        refs.add(cost.sourceStepRef);
      }
    }
    for (const resolution of [
      proposalCase.controlResolution,
      proposalCase.coarseResolution,
    ]) {
      for (const effect of resolution?.effects ?? []) {
        refs.add(effect.id);
        refs.add(effect.causalSourceRef);
        if (effect.fact) refs.add(effect.fact.id);
        if (effect.factRef) refs.add(effect.factRef);
      }
      for (const cost of resolution?.costs ?? []) {
        refs.add(cost.id);
        refs.add(cost.sourceStepRef);
        if (cost.effect) {
          refs.add(cost.effect.id);
          refs.add(cost.effect.causalSourceRef);
          if (cost.effect.fact) refs.add(cost.effect.fact.id);
          if (cost.effect.factRef) refs.add(cost.effect.factRef);
        }
      }
    }
  }
}

function effectTraces(input: {
  proposalRef: string;
  effect: AdaptiveEffect;
}): Array<z.infer<typeof CausalTraceSchema>> {
  const traces: Array<z.infer<typeof CausalTraceSchema>> = [{
    sourceRef: input.proposalRef,
    targetRef: input.effect.id,
    relation: "proposal_effect",
  }];
  const targetRef = input.effect.fact?.id ?? input.effect.factRef;
  if (targetRef) {
    traces.push({
      sourceRef: input.effect.id,
      targetRef,
      relation: "effect_fact",
    });
    traces.push({
      sourceRef: input.effect.causalSourceRef,
      targetRef,
      relation: "caused",
    });
  }
  return traces;
}

function missingFrom(expected: readonly string[], actual: Set<string>): string[] {
  return uniqueSorted(expected.filter((ref) => !actual.has(ref)));
}

/**
 * Shared-only orchestration preview. Every component receives a clone or an
 * immutable graph view; no result is committed to BattleState or persistence.
 */
export function runIntegratedShadowTurnPoc(
  rawInput: IntegratedShadowTurnInput,
): IntegratedShadowTurnReceipt {
  const input = IntegratedShadowTurnInputSchema.parse(clone(rawInput));
  const sourceBefore = stableJson(input.sourceBattleState);
  const authoritativeBefore = stableJson(input.authoritativeOutcome);
  const window = {
    fromTurn: input.sourceBattleState.turn + 1,
    toTurn: input.sourceBattleState.turn + 1,
    phase: "execution" as const,
  };

  let issueEnvelope = createConsistencyIssuePocEnvelope();
  const graph = createBattleStateCanonicalGraphView({
    state: input.sourceBattleState,
    issueEnvelope,
  });
  const snapshot = graph.snapshot();
  const projections = createCanonicalGraphProjectionAdapter(graph);
  const observationA = ObservationSliceSchema.parse(
    projections.buildObservationSlice({
      observerRef: "character.a",
      purpose: "character_decision",
    }).value,
  );
  const observationB = ObservationSliceSchema.parse(
    projections.buildObservationSlice({
      observerRef: "character.b",
      purpose: "character_decision",
    }).value,
  );
  const proposalRefs = input.characterInputs.cases.map((proposalCase) =>
    proposalCase.proposal.proposalRef
  );
  const adjudication = proposalRefs.length === 0
    ? null
    : AdjudicationSliceSchema.parse(projections.buildAdjudicationSlice({
        proposalRefs,
        temporalWindow: window,
      }).value);
  const existingAnchors = input.expectedDependencies.entityRefs.filter((ref) =>
    snapshot.entities.some((entity) => entity.id === ref)
  );
  const queryAnchors = existingAnchors.length > 0
    ? existingAnchors
    : ["character.a", "character.b"];
  const adaptive = input.characterInputs.cases.length === 0
    ? { status: "skipped" as const, reason: "no_character_proposals" as const }
    : {
        status: "executed" as const,
        result: adjudicateAdaptiveBattleProposals({
          cases: input.characterInputs.cases,
          budget: input.characterInputs.budget,
        }),
      };
  const world = input.worldInputs.projection === null
    ? { status: "skipped" as const, reason: "no_world_projection" as const }
    : {
        status: "executed" as const,
        result: evaluateWorldProcessesPoc({
          slice: input.worldInputs.projection,
          activeProcesses: input.worldInputs.activeProcesses,
          characterProposals: input.worldInputs.characterProposals,
          concretizations: input.worldInputs.concretizations,
        }),
      };

  const supplementalFacts = input.consistencyInputs.flatMap(
    consistencySliceFacts,
  );
  const patches: ShadowCanonicalPatch[] = [];
  if (adaptive.status === "executed") {
    for (const receipt of adaptive.result.receipts) {
      const patch = adaptivePatch({
        receipt,
        snapshot,
        supplementalFacts,
        turn: window.fromTurn,
      });
      if (patch) patches.push(patch);
    }
  }
  if (world.status === "executed") {
    for (const receipt of world.result.receipts) {
      if (receipt.patch) patches.push(receipt.patch);
    }
  }

  const knownEntityRefs = new Set(snapshot.entities.map((entity) => entity.id));
  input.expectedDependencies.entityRefs.forEach((ref) => knownEntityRefs.add(ref));
  for (const proposalCase of input.characterInputs.cases) {
    proposalCase.scopeRefs.forEach((ref) => knownEntityRefs.add(ref));
  }
  for (const slice of input.consistencyInputs) {
    slice.scope.entityRefs.forEach((ref) => knownEntityRefs.add(ref));
  }
  const patchReceipts: Array<z.infer<typeof PatchStageReceiptSchema>> = [];
  for (const [index, patch] of patches.entries()) {
    const read = graph.readPatch(patch);
    const contextFacts = [
      ...read.directFacts,
      ...read.inverseFacts,
      ...read.retractionFacts,
      ...read.assertionSlotFacts,
      ...read.recentCausalFacts,
    ].map(projectionFactToShadow);
    const existingFacts = [...new Map([
      ...contextFacts,
      ...supplementalFacts,
    ].map((fact) => [fact.id, fact] as const)).values()];
    const supplementalFactRefs = new Set(supplementalFacts.map((fact) => fact.id));
    const contextComplete = !read.truncated && read.missingRetractionFactRefs
      .every((ref) => supplementalFactRefs.has(ref));
    const audit = auditShadowCanonicalPatch({
      patch,
      context: {
        knownEntityRefs: [...knownEntityRefs],
        existingFacts,
        contextComplete,
      },
    });
    const registration = registerPatchAuditResult({
      envelope: issueEnvelope,
      auditRef: `audit:${input.transcriptRef}:${index + 1}`,
      turn: window.fromTurn,
      result: audit,
      classifyIssue: () => patch.sourceRef.startsWith("process.")
        ? ["world_process", "patch_audit"]
        : ["adjudication", "patch_audit"],
    });
    issueEnvelope = registration.envelope;
    patchReceipts.push(PatchStageReceiptSchema.parse({
      patchRef: `patch:${input.transcriptRef}:${index + 1}`,
      patch,
      audit,
      registration,
    }));
  }

  const postAuditGraph = createBattleStateCanonicalGraphView({
    state: input.sourceBattleState,
    issueEnvelope,
  });
  const postAuditProjections = createCanonicalGraphProjectionAdapter(
    postAuditGraph,
  );
  const graphQuery = postAuditGraph.query({
    anchorRefs: queryAnchors,
    purpose: "adjudication",
    temporalWindow: window,
    maxDepth: 2,
    maxEntities: 64,
    maxFacts: 256,
  });
  const graphReadPurposes = [
    "adjudication" as const,
    ...(world.status === "executed" ? ["world_process" as const] : []),
  ];
  const graphConsistencySlices = graphReadPurposes.map((purpose) =>
    ConsistencySliceSchema.parse(postAuditProjections.buildConsistencySlice({
      anchorRefs: queryAnchors,
      purpose,
      temporalWindow: window,
    }).value)
  );
  const consistencySlices = [
    ...graphConsistencySlices,
    ...input.consistencyInputs.map((slice) => ConsistencySliceSchema.parse(slice)),
  ];
  const reads = consistencySlices.map((slice, index) => {
    const currentFacts = consistencySliceFacts(slice);
    const check = checkPurposeScopedConsistencySlice(slice);
    const repairPreview = runShadowConsistencyRepair({
      slice,
      currentFacts,
      plans: [],
      allowShadowRepair: false,
    });
    return ReadStageReceiptSchema.parse({
      sliceRef: `consistency:${input.transcriptRef}:${index + 1}`,
      check,
      repairPreview,
    });
  });

  const observationArtifacts = {
    observationA: componentArtifact({
      componentRef: `observation-a:${input.transcriptRef}`,
      value: observationA,
      truncated: observationA.scope.truncated,
    }),
    observationB: componentArtifact({
      componentRef: `observation-b:${input.transcriptRef}`,
      value: observationB,
      truncated: observationB.scope.truncated,
    }),
  };
  const adjudicationArtifact = adjudication
    ? componentArtifact({
        componentRef: `adjudication:${input.transcriptRef}`,
        value: adjudication,
        truncated: adjudication.scope.truncated,
      })
    : null;
  const consistencyArtifacts = consistencySlices.map((slice, index) =>
    componentArtifact({
      componentRef: `consistency:${input.transcriptRef}:${index + 1}`,
      value: slice,
      truncated: slice.scope.truncated,
    })
  );
  const graphQueryArtifact = componentArtifact({
    componentRef: `graph-query:${input.transcriptRef}`,
    value: graphQuery,
    truncated: graphQuery.truncated,
  });

  const knownRefs = new Set<string>([
    ...snapshot.entities.map((entity) => entity.id),
    ...snapshot.facts.map((fact) => fact.id),
    ...snapshot.worldProcessRefs,
    ...snapshot.ruleRefs,
  ]);
  addAdaptiveInputRefs(input.characterInputs.cases, knownRefs);
  for (const slice of input.consistencyInputs) {
    slice.scope.entityRefs.forEach((ref) => knownRefs.add(ref));
    slice.scope.processRefs.forEach((ref) => knownRefs.add(ref));
    slice.applicableRuleRefs.forEach((ref) => knownRefs.add(ref));
    flatConsistencyRows(slice).forEach(({ row }) => knownRefs.add(row[0]));
    slice.issues.forEach((issue) => knownRefs.add(issue.id));
  }
  for (const process of input.worldInputs.activeProcesses) {
    knownRefs.add(process.processRef);
    process.sourceRefs.forEach((ref) => knownRefs.add(ref));
    process.targetRefs.forEach((ref) => knownRefs.add(ref));
    process.triggerFactRefs.forEach((ref) => knownRefs.add(ref));
  }
  for (const proposal of input.worldInputs.characterProposals) {
    knownRefs.add(proposal.proposalRef);
    knownRefs.add(proposal.actorRef);
  }

  const causalTraces: Array<z.infer<typeof CausalTraceSchema>> = [];
  if (adaptive.status === "executed") {
    for (const receipt of adaptive.result.receipts) {
      for (const effect of [
        ...receipt.effects,
        ...receipt.costs.flatMap((cost) => cost.effect ? [cost.effect] : []),
      ]) {
        knownRefs.add(effect.id);
        if (effect.fact) knownRefs.add(effect.fact.id);
        causalTraces.push(...effectTraces({
          proposalRef: receipt.proposalRef,
          effect,
        }));
      }
      receipt.refinedFacts.forEach((fact) => knownRefs.add(fact.id));
      if (receipt.fallbackFact) knownRefs.add(receipt.fallbackFact.id);
    }
  }
  if (world.status === "executed") {
    for (const proposal of world.result.proposals) {
      knownRefs.add(proposal.proposalRef);
      causalTraces.push({
        sourceRef: proposal.processRef,
        targetRef: proposal.proposalRef,
        relation: "process_proposal",
      });
      for (const effect of proposal.effects) {
        knownRefs.add(effect.effectRef);
        causalTraces.push({
          sourceRef: proposal.proposalRef,
          targetRef: effect.effectRef,
          relation: "proposal_effect",
        });
      }
    }
    for (const receipt of world.result.receipts) {
      receipt.effects.forEach((effect, index) => {
        const assertion = receipt.patch?.assertions[index];
        if (!assertion) return;
        causalTraces.push({
          sourceRef: effect.effectRef,
          targetRef: assertion.id,
          relation: "effect_fact",
        });
      });
    }
  }
  for (const patch of patches) {
    patch.assertions.forEach((fact) => knownRefs.add(fact.id));
    for (const link of patch.causalLinks) {
      causalTraces.push({
        sourceRef: link.sourceRef,
        targetRef: link.targetFactRef,
        relation: link.relation,
      });
    }
  }
  const danglingRefs = uniqueSorted(causalTraces.flatMap((trace) => [
    ...(knownRefs.has(trace.sourceRef) ? [] : [trace.sourceRef]),
    ...(knownRefs.has(trace.targetRef) ? [] : [trace.targetRef]),
  ]));

  const actualEntities = new Set<string>([
    ...snapshot.entities.map((entity) => entity.id),
    ...input.characterInputs.cases.flatMap((proposalCase) =>
      proposalCase.scopeRefs
    ),
    ...input.consistencyInputs.flatMap((slice) => slice.scope.entityRefs),
    ...(input.worldInputs.projection?.scope.entityRefs ?? []),
  ]);
  const actualFacts = new Set<string>([
    ...snapshot.facts.map((fact) => fact.id),
    ...input.characterInputs.cases.flatMap((proposalCase) => [
      ...proposalCase.facts.map((fact) => fact.id),
      ...proposalCase.fallbackClaims.map((fact) => fact.id),
      ...proposalCase.worldExpansions.map((expansion) => expansion.refinedFact.id),
      ...(proposalCase.characterPlan?.steps.flatMap((step) =>
        step.effects.flatMap((effect) => [
          ...(effect.fact ? [effect.fact.id] : []),
          ...(effect.factRef ? [effect.factRef] : []),
        ])
      ) ?? []),
      ...(proposalCase.controlResolution?.effects.flatMap((effect) => [
        ...(effect.fact ? [effect.fact.id] : []),
        ...(effect.factRef ? [effect.factRef] : []),
      ]) ?? []),
      ...(proposalCase.coarseResolution?.effects.flatMap((effect) => [
        ...(effect.fact ? [effect.fact.id] : []),
        ...(effect.factRef ? [effect.factRef] : []),
      ]) ?? []),
    ]),
    ...input.consistencyInputs.flatMap((slice) =>
      flatConsistencyRows(slice).map(({ row }) => row[0])
    ),
    ...(input.worldInputs.projection
      ? flatConsistencyRows(input.worldInputs.projection).map(({ row }) => row[0])
      : []),
  ]);
  const actualPredicates = new Set<string>([
    ...snapshot.facts.map((fact) => fact.predicate),
    ...input.characterInputs.cases.flatMap((proposalCase) => [
      ...proposalCase.facts.map((fact) => fact.predicate),
      ...proposalCase.fallbackClaims.map((fact) => fact.predicate),
      ...(proposalCase.characterPlan?.steps.flatMap((step) =>
        step.effects.flatMap((effect) => effect.fact
          ? [effect.fact.predicate]
          : [])
      ) ?? []),
      ...(proposalCase.controlResolution?.effects.flatMap((effect) =>
        effect.fact ? [effect.fact.predicate] : []
      ) ?? []),
      ...(proposalCase.coarseResolution?.effects.flatMap((effect) =>
        effect.fact ? [effect.fact.predicate] : []
      ) ?? []),
    ]),
    ...input.consistencyInputs.flatMap((slice) =>
      flatConsistencyRows(slice).map(({ row }) => row[1])
    ),
    ...(input.worldInputs.projection
      ? flatConsistencyRows(input.worldInputs.projection).map(({ row }) => row[1])
      : []),
  ]);
  const actualRules = new Set<string>([
    ...snapshot.ruleRefs,
    ...input.characterInputs.ruleRefs,
    ...input.consistencyInputs.flatMap((slice) => slice.applicableRuleRefs),
    ...(input.worldInputs.projection?.applicableRuleRefs ?? []),
  ]);
  const actualProcesses = new Set<string>([
    ...snapshot.worldProcessRefs,
    ...input.worldInputs.activeProcesses.map((process) => process.processRef),
    ...input.consistencyInputs.flatMap((slice) => slice.scope.processRefs),
  ]);
  const missing = {
    entityRefs: missingFrom(input.expectedDependencies.entityRefs, actualEntities),
    factRefs: missingFrom(input.expectedDependencies.factRefs, actualFacts),
    predicates: missingFrom(input.expectedDependencies.predicates, actualPredicates),
    ruleRefs: missingFrom(input.expectedDependencies.ruleRefs, actualRules),
    processRefs: missingFrom(input.expectedDependencies.processRefs, actualProcesses),
  };
  const expectedCount = Object.values(input.expectedDependencies)
    .filter((value): value is string[] => Array.isArray(value))
    .reduce((sum, refs) => sum + refs.length, 0) -
    input.expectedDependencies.sourceFactRefs.length -
    input.expectedDependencies.inputFactRefs.length;
  const missingCount = Object.values(missing)
    .reduce((sum, refs) => sum + refs.length, 0);

  const fallbackFactRefs = adaptive.status === "executed"
    ? adaptive.result.receipts.flatMap((receipt) =>
        receipt.fallbackFact ? [receipt.fallbackFact.id] : []
      )
    : [];
  const conflictedReadRefs = reads.filter((read) =>
    read.check.consistency.level === "conflicted"
  ).map((read) => read.sliceRef);
  const defenseHandled = input.characterInputs.cases.some((proposalCase) =>
    proposalCase.proposal.actionKind === "defense"
  );
  const conflictHandlingRequired = input.expectedBoundaries.allowedFallbacks.length > 0;
  const conflictHandlingExplicit = !conflictHandlingRequired ||
    fallbackFactRefs.length > 0 || conflictedReadRefs.length > 0 || defenseHandled;

  const observerStrings = [
    ...stringsIn(observationA),
    ...stringsIn(observationB),
  ];
  const forbidden = new Set(input.expectedBoundaries.forbiddenObserverIdentifiers);
  const observerLeakCount = observerStrings.reduce((count, value) =>
    count + [...forbidden].filter((identifier) =>
      value.includes(identifier)
    ).length,
    0,
  );
  const worldTimingFailures = world.status === "executed"
    ? world.result.timeline.filter((item) =>
        stableJson(item.timing) !== stableJson(window)
      ).length
    : 0;

  const expectedComponents = [
    "observation_a",
    "observation_b",
    "graph_query",
    "graph_consistency",
    "read_coherence",
    "issue_projection",
    "authority_boundary",
    ...(adjudication ? ["adjudication_projection"] : []),
    ...(adaptive.status === "executed" ? ["adaptive_adjudication"] : []),
    ...(world.status === "executed" ? ["world_process"] : []),
    ...(patchReceipts.length > 0 ? ["patch_audit"] : []),
  ];
  const completedComponents = [...expectedComponents];
  const projectionArtifacts = [
    observationArtifacts.observationA,
    observationArtifacts.observationB,
    ...(adjudicationArtifact ? [adjudicationArtifact] : []),
    ...consistencyArtifacts,
  ];
  const issueViews = [
    ...projectConsistencyIssueViews(issueEnvelope),
    ...input.consistencyInputs.flatMap((slice) => slice.issues),
  ];
  const issues = [...new Map(issueViews.map((issue) => [issue.id, issue] as const))
    .values()].sort((left, right) => left.id.localeCompare(right.id));
  const componentPayloads: unknown[] = [
    observationA,
    observationB,
    graphQuery,
    ...graphConsistencySlices,
    ...(adjudication ? [adjudication] : []),
    adaptive,
    world,
    patchReceipts,
    reads,
  ];

  if (stableJson(input.sourceBattleState) !== sourceBefore) {
    throw new Error("integrated shadow turn mutated its source BattleState");
  }
  if (stableJson(input.authoritativeOutcome) !== authoritativeBefore) {
    throw new Error("integrated shadow turn mutated the authoritative outcome");
  }

  return IntegratedShadowTurnReceiptSchema.parse({
    schemaVersion: 1,
    mode: "integrated_shadow_turn_poc",
    transcriptRef: input.transcriptRef,
    sourceBattleRef: input.sourceBattleState.id,
    sourceTurn: input.sourceBattleState.turn,
    sourceBattleStateDigest: input.sourceBattleStateDigest,
    authoritativeOutcomeDigest: input.authoritativeOutcomeDigest,
    temporalWindow: window,
    projections: {
      ...observationArtifacts,
      adjudication: adjudicationArtifact,
      consistency: consistencyArtifacts,
    },
    graph: {
      query: graphQuery,
      queryArtifact: graphQueryArtifact,
      indexStats: postAuditGraph.indexStats(),
    },
    adaptive,
    world,
    patches: patchReceipts,
    reads,
    issues,
    causalTraces,
    dependencyAudit: {
      expectedCount,
      resolvedCount: expectedCount - missingCount,
      recall: expectedCount === 0 ? 1 : (expectedCount - missingCount) / expectedCount,
      allResolved: missingCount === 0,
      missing,
    },
    referenceAudit: {
      checkedLinkCount: causalTraces.length,
      danglingRefs,
    },
    componentCoverage: {
      expectedComponentRefs: expectedComponents,
      completedComponentRefs: completedComponents,
      coverage: 1,
    },
    conflictHandling: {
      required: conflictHandlingRequired,
      explicit: conflictHandlingExplicit,
      fallbackFactRefs: uniqueSorted(fallbackFactRefs),
      conflictedReadRefs: uniqueSorted(conflictedReadRefs),
    },
    metrics: {
      projectionBytes: projectionArtifacts.reduce(
        (sum, artifact) => sum + artifact.bytes,
        0,
      ),
      componentPayloadBytes: componentPayloads.reduce<number>(
        (sum, payload) => sum + serializedBytes(payload),
        0,
      ),
      truncationCount: projectionArtifacts.filter((artifact) =>
        artifact.truncated
      ).length + Number(graphQuery.truncated),
      currentAuthoritativeMinimumCalls:
        input.callModel.currentAuthoritativeTopology.minimumCalls,
      shadowModeledOrdinaryCalls: input.callModel.shadowModeledOrdinaryCalls,
      externalLlmCallsMade: 0,
      generationTokensMeasured: false,
      generationLatencyMeasured: false,
    },
    boundaries: {
      sourceMutated: false,
      authoritativeOutcomeChanged: false,
      canonicalCommitPerformed: false,
      externalLlmCallsMade: 0,
      observerCanonicalIdentifierLeakCount: observerLeakCount,
      outOfScopeRepairMutationCount: 0,
      danglingReferenceCount: danglingRefs.length,
      temporalAtomicityFailureCount: worldTimingFailures,
    },
  });
}
