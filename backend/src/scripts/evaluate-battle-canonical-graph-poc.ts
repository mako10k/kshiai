import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BattleStateCanonicalGraphView,
  BattleStateProjectionAdapter,
  BattleStateSchema,
  CanonicalGraphPatchReadSchema,
  CanonicalGraphQueryResultSchema,
  CanonicalGraphSnapshotSchema,
  buildBattleStateProjectionGraphSnapshot,
  buildBattleTurnRecord,
  createBattleState,
  createCanonicalGraphProjectionAdapter,
  createConsistencyIssuePocEnvelope,
  defaultParameters,
  expandAdjudicationFacts,
  expandConsistencyCausalLinks,
  expandConsistencyFacts,
  registerConsistencyAlert,
  resolveTurn,
  type BattleState,
  type BattleWorldEntity,
  type CharacterSheet,
  type ConsistencyIssuePocEnvelope,
  type InteractionKind,
  type ProjectionPurpose,
  type ShadowCanonicalPatch,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-canonical-graph-fixtures-v1.json",
);
const fixedTime = "2026-08-06T00:00:00.000Z";

type Thresholds = {
  projectionFactEqualityMinimum: number;
  projectionScopeEqualityMinimum: number;
  projectionCausalEqualityMinimum: number;
  queryClaimRecallMinimum: number;
  orderIndependenceMinimum: number;
  restartParityMinimum: number;
  committedOutcomeParityMinimum: number;
  rollbackSuccessMinimum: number;
  patchContextRecallMinimum: number;
  dualRepresentationSerializedGrowthRatioMaximum: number;
  p95QueryLatencyMsMaximum: number;
  p95ReconstructionLatencyMsMaximum: number;
  p95RestartLatencyMsMaximum: number;
  p95FullRebuildMaintenanceLatencyMsMaximum: number;
  graphSourceLinesMaximum: number;
  graphExportedDeclarationsMaximum: number;
};

type GraphFixture = {
  id: string;
  runner: string;
  anchorRefs: string[];
  purpose: ProjectionPurpose;
  expectedEntityRefs: string[];
  expectedPredicates: string[];
  expectedInteractionKinds: InteractionKind[];
  expectedProcessRefs: string[];
  minimumIssueCount: number;
  minimumRuleCount: number;
  requiresCausalLink: boolean;
  requiredIndexKeys: Array<keyof ReturnType<
    BattleStateCanonicalGraphView["indexStats"]
  >>;
  patchContext: boolean;
};

type FixtureFile = {
  schemaVersion: 1;
  fixtureVersion: string;
  frozenAt: string;
  repetitions: number;
  thresholds: Thresholds;
  fixtures: GraphFixture[];
};

type Scenario = {
  state: BattleState;
  issueEnvelope?: ConsistencyIssuePocEnvelope;
  patch?: ShadowCanonicalPatch;
};

type Counts = {
  matched: number;
  total: number;
};

type LatencySummary = {
  mean: number;
  p95: number;
  minimum: number;
  maximum: number;
};

type FixtureAggregate = {
  id: string;
  repetitions: number;
  queryClaims: Counts & { recall: number };
  parity: {
    facts: Counts & { rate: number };
    scopes: Counts & { rate: number };
    causalLinks: Counts & { rate: number };
  };
  reconstruction: {
    orderIndependent: Counts & { rate: number };
    restartParity: Counts & { rate: number };
    committedOutcomeParity: Counts & { rate: number };
    rollbackSuccess: Counts & { rate: number };
  };
  patchContext: Counts & { recall: number };
  cost: {
    battleStateBytes: number;
    graphSnapshotBytes: number;
    dualRepresentationSerializedGrowthRatio: number;
    retainedHeapDeltaBytesPerGraph: number;
    queryLatencyMs: LatencySummary;
    reconstructionLatencyMs: LatencySummary;
    restartLatencyMs: LatencySummary;
    fullRebuildMaintenanceLatencyMs: LatencySummary;
  };
  indexCoverage: Record<string, boolean>;
  failures: {
    schema: number;
    sourceMutation: number;
    committedOutcomeMismatch: number;
  };
};

export type CanonicalGraphEvaluationReport = {
  schemaVersion: 1;
  fixtureVersion: string;
  generatedAt: string;
  mode: "canonical_graph_poc_evaluation";
  provenance: {
    gitHead: string;
    workingTreeDirty: boolean;
    nodeVersion: string;
    fixturePath: string;
    fixtureSha256: string;
    evaluatorPath: string;
    evaluatorSha256: string;
    graphSourcePath: string;
    graphSourceSha256: string;
    projectionSourcePath: string;
    projectionSourceSha256: string;
  };
  execution: {
    repetitionsPerFixture: number;
    fixtureCount: number;
    graphConstructions: number;
    graphQueries: number;
    projectionComparisons: number;
    externalLlmCallsMade: 0;
    xaiUsed: false;
    xaiReason: string;
    indexMaintenanceMode: "discard_and_full_rebuild";
  };
  thresholds: Thresholds;
  fixtures: FixtureAggregate[];
  implementationComplexity: {
    graphSourceLines: number;
    graphExportedDeclarations: number;
    runtimeIntegrationRefCount: number;
    exportedMutationAuthorityCount: number;
  };
  aggregate: {
    schemaFailureCount: number;
    sourceMutationCount: number;
    runtimeIntegrationRefCount: number;
    exportedMutationAuthorityCount: number;
    committedOutcomeMismatchCount: number;
    projectionFactEquality: number;
    projectionScopeEquality: number;
    projectionCausalEquality: number;
    queryClaimRecall: number;
    orderIndependence: number;
    restartParity: number;
    committedOutcomeParity: number;
    rollbackSuccess: number;
    patchContextRecall: number;
    maximumDualRepresentationSerializedGrowthRatio: number;
    p95QueryLatencyMs: number;
    p95ReconstructionLatencyMs: number;
    p95RestartLatencyMs: number;
    p95FullRebuildMaintenanceLatencyMs: number;
    hardInvariantsPass: boolean;
    effectivenessPass: boolean;
    costAndComplexityPass: boolean;
  };
  componentAssessment: {
    boundedValueObserved: string[];
    remainDerived: string[];
    incrementalMaintenanceAvailable: false;
    independentPersistenceSupported: false;
  };
  decision: {
    label: "supported" | "revise" | "unsupported" | "indeterminate";
    reasons: string[];
    boundedRevisionHypotheses: string[];
  };
  limitations: string[];
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function sameValue(left: unknown, right: unknown): boolean {
  return digest(left) === digest(right);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function rate(counts: Counts): number {
  return counts.total === 0 ? 1 : round(counts.matched / counts.total);
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );
  return sorted[index]!;
}

function latencySummary(values: number[]): LatencySummary {
  return {
    mean: round(mean(values)),
    p95: round(percentile(values, 95)),
    minimum: round(Math.min(...values)),
    maximum: round(Math.max(...values)),
  };
}

function gitOutput(args: string[], allowFailure = false): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function sheet(id: string, displayName: string): CharacterSheet {
  return {
    id,
    ownerUserId: "canonical-graph-eval-owner",
    displayName,
    tags: ["canonical-graph-eval"],
    createdAt: fixedTime,
    updatedAt: fixedTime,
    appearance: {
      summary: `${displayName}の固定fixture外見`,
      visualPrompt: "canonical graph evaluation fixture",
    },
    traits: [],
    parameters: defaultParameters({
      hp: 100,
      maxHp: 100,
      mp: 40,
      maxMp: 40,
      stamina: 50,
      maxStamina: 50,
      atk: 12,
      def: 10,
      spd: 10,
    }),
    basicAttack: {
      name: "固定攻撃",
      description: "近距離の相手へ働きかける。",
      targetParameter: "hp",
      scalingParameter: "atk",
      resistanceParameter: "def",
      power: 0.75,
      constraints: {
        reach: "near",
        requiresSight: false,
        mobility: "limited",
        requiresSpeech: false,
        requiresUsableHeldObject: false,
      },
    },
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: {
      canFight: true,
      irreversibleIncapacitated: false,
    },
    narrativeBlurb: `${displayName}のgraph評価fixture`,
  };
}

function baseState(id: string): BattleState {
  return createBattleState({
    id,
    sideA: sheet(`${id}-a`, "シロ"),
    sideB: sheet(`${id}-b`, "クロ"),
    turnLimit: 20,
    prologuePending: false,
  });
}

function objectEntity(
  placement: BattleWorldEntity["placement"],
): BattleWorldEntity {
  return {
    kind: "object",
    active: true,
    presence: "present",
    placement,
    exposure: "exposed",
    actorState: null,
    objectState: {
      portable: placement.type === "held" || placement.type === "worn",
      usable: true,
      exclusiveUse: false,
      usableBy: [],
      cover: "none",
      blocksMovement: false,
      visionEffect: "none",
      hearingEffect: "none",
      mobilityEffect: "none",
    },
    objectProfile: {
      canonicalLabel: "検証用の杖",
      description: "保持と逆参照を検証するための杖。",
      sourceRef: "fixture.graph-tool",
      candidateKey: "graph-tool",
      provenance: "committed_event",
      knownOpenAspects: [],
      observerRefs: {},
      observerLabels: {},
      concretizations: [],
    },
    createdTurn: 1,
    updatedTurn: 1,
  };
}

function effectEntity(areaId: string): BattleWorldEntity {
  return {
    kind: "effect",
    active: true,
    presence: "present",
    placement: { type: "scene", areaId },
    exposure: "exposed",
    actorState: null,
    objectState: null,
    createdTurn: 1,
    updatedTurn: 1,
  };
}

function resolveAndRecord(
  state: BattleState,
  kind: "basic_attack" | "wait",
): BattleState {
  const before = structuredClone(state);
  const resolved = resolveTurn({
    state: before,
    playerAction: { actorSide: "a", kind },
    sideASkills: [],
    sideBSkills: [],
  });
  const record = buildBattleTurnRecord({
    before,
    after: resolved.state,
    events: resolved.events,
    actions: resolved.actions,
  });
  resolved.state.turnRecords = [...state.turnRecords, record];
  return resolved.state;
}

function legacyMinimal(): Scenario {
  const state = baseState("graph-eval-legacy-minimal");
  state.worldState = undefined;
  state.semanticState = undefined;
  return { state };
}

function connectedProcessAndIssue(): Scenario {
  const state = resolveAndRecord(
    baseState("graph-eval-connected"),
    "basic_attack",
  );
  const world = structuredClone(state.worldState!);
  const areaId = world.entities["character.a"]?.placement.type === "scene"
    ? world.entities["character.a"].placement.areaId
    : "area.1";
  world.entities["object.graph-tool"] = objectEntity({
    type: "held",
    holderId: "character.a",
  });
  world.entities["effect.graph-smoke"] = effectEntity(areaId);
  state.worldState = world;
  const heldFact = buildBattleStateProjectionGraphSnapshot(state).facts
    .filter((fact) => fact.subjectRef === "object.graph-tool")
    .find((fact) => fact.predicate === "held_by");
  if (!heldFact) throw new Error("connected fixture lacks held fact");
  const receipt = registerConsistencyAlert({
    envelope: createConsistencyIssuePocEnvelope(),
    alert: {
      schemaVersion: 1,
      alertRef: "alert:graph-eval-held-state",
      reporter: "adjudicator",
      turn: state.turn,
      involvedRefs: ["object.graph-tool", "character.a"],
      conflictingClaims: [heldFact.id],
      blocking: true,
      explanation: "保持状態をpatch監査で確認する固定issue。",
    },
    discoveredAtStage: "adjudication",
    classifiedBlocksPurposes: ["adjudication", "patch_audit"],
  });
  const patch: ShadowCanonicalPatch = {
    schemaVersion: 1,
    mode: "shadow",
    sourceRef: "action:graph-eval-transfer",
    assertions: [{
      id: "fact:graph-eval-held-by-b",
      subjectRef: "object.graph-tool",
      predicate: "held_by",
      objectRef: "character.b",
      validFrom: { turn: state.turn },
      provenance: {
        subsystem: "world",
        authority: "validated_world_transition",
        sourceRef: "action:graph-eval-transfer",
        sourceEventRefs: [],
      },
    }],
    retractions: [heldFact.id],
    causalLinks: [],
    touchedRefs: ["object.graph-tool", "character.a", "character.b"],
  };
  return { state, issueEnvelope: receipt.envelope, patch };
}

function remoteTargeting(): Scenario {
  const state = baseState("graph-eval-remote");
  const world = structuredClone(state.worldState!);
  world.areas["area.remote"] = {
    label: "遠隔区画",
    illumination: "normal",
    noise: "normal",
    space: "open",
    movement: "open",
  };
  world.entities["character.b"] = {
    ...world.entities["character.b"]!,
    placement: { type: "scene", areaId: "area.remote" },
    updatedTurn: 1,
  };
  world.pairRelations[0] = {
    ...world.pairRelations[0]!,
    distance: "separate_area",
    sight: "blocked",
    sound: "partial",
    updatedTurn: 1,
  };
  state.worldState = world;
  return { state };
}

function committedHistory(): Scenario {
  let state = baseState("graph-eval-history");
  state = resolveAndRecord(state, "basic_attack");
  state = resolveAndRecord(state, "wait");
  state = resolveAndRecord(state, "basic_attack");
  return { state };
}

const scenarioRunners: Record<string, () => Scenario> = {
  legacy_minimal: legacyMinimal,
  connected_process_and_issue: connectedProcessAndIssue,
  remote_targeting: remoteTargeting,
  committed_history: committedHistory,
};

function validateFixtureFile(raw: unknown): FixtureFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("canonical graph fixture must be an object");
  }
  const fixture = raw as FixtureFile;
  if (fixture.schemaVersion !== 1 || !fixture.fixtureVersion) {
    throw new Error("unsupported canonical graph fixture schema");
  }
  if (!Array.isArray(fixture.fixtures) || fixture.fixtures.length === 0) {
    throw new Error("canonical graph fixture file has no fixtures");
  }
  const ids = new Set<string>();
  for (const item of fixture.fixtures) {
    if (!item.id || ids.has(item.id)) {
      throw new Error(`duplicate or missing fixture ID: ${item.id}`);
    }
    ids.add(item.id);
    if (!scenarioRunners[item.runner]) {
      throw new Error(`unknown canonical graph runner: ${item.runner}`);
    }
  }
  return fixture;
}

function reorderedState(state: BattleState): BattleState {
  const reordered = structuredClone(state);
  if (reordered.worldState) {
    reordered.worldState.areas = Object.fromEntries(
      Object.entries(reordered.worldState.areas).reverse(),
    );
    reordered.worldState.entities = Object.fromEntries(
      Object.entries(reordered.worldState.entities).reverse(),
    );
    reordered.worldState.pairRelations.reverse();
  }
  if (reordered.semanticState) {
    reordered.semanticState.entities = Object.fromEntries(
      Object.entries(reordered.semanticState.entities).reverse(),
    );
    reordered.semanticState.scene.facts = Object.fromEntries(
      Object.entries(reordered.semanticState.scene.facts).reverse(),
    );
  }
  return reordered;
}

function factSemantics(facts: ReturnType<typeof expandConsistencyFacts>) {
  return facts.map(({ id: _id, ...fact }) => fact);
}

function normalizedCausalSemantics(
  slice: Parameters<typeof expandConsistencyCausalLinks>[0],
): unknown[] {
  const facts = new Map(expandConsistencyFacts(slice).map((fact) => [
    fact.id,
    factSemantics([fact])[0],
  ]));
  return expandConsistencyCausalLinks(slice).map((link) => ({
    sourceRef: link.sourceRef,
    relation: link.relation,
    target: facts.get(link.targetFactRef) ?? null,
  }));
}

function normalizedOutcome(state: BattleState): unknown {
  const resolved = resolveTurn({
    state: structuredClone(state),
    playerAction: { actorSide: "a", kind: "basic_attack" },
    sideASkills: [],
    sideBSkills: [],
  });
  return {
    actions: resolved.actions,
    events: resolved.events,
    mechanicalEvidence: resolved.mechanicalEvidence,
    status: resolved.state.status,
    winnerSide: resolved.state.winnerSide,
    finishReason: resolved.state.finishReason,
    sideA: resolved.state.sideA,
    sideB: resolved.state.sideB,
    worldState: resolved.state.worldState,
  };
}

function compareProjections(state: BattleState, graph: BattleStateCanonicalGraphView) {
  const direct = new BattleStateProjectionAdapter(state);
  const indexed = createCanonicalGraphProjectionAdapter(graph);
  const observationRequest = {
    observerRef: "character.a" as const,
    purpose: "character_decision" as const,
  };
  const adjudicationRequest = {
    proposalRefs: ["proposal.a", "proposal.b"],
    temporalWindow: {
      fromTurn: 0,
      toTurn: state.turn + 1,
      phase: "proposal" as const,
    },
  };
  const consistencyRequest = {
    anchorRefs: ["character.a", "character.b"],
    purpose: "adjudication" as const,
    temporalWindow: {
      fromTurn: 0,
      toTurn: state.turn + 1,
      phase: "post_commit" as const,
    },
  };
  const directObservation = direct.buildObservationSlice(observationRequest);
  const indexedObservation = indexed.buildObservationSlice(observationRequest);
  const directAdjudication = direct.buildAdjudicationSlice(adjudicationRequest);
  const indexedAdjudication = indexed.buildAdjudicationSlice(adjudicationRequest);
  const directConsistency = direct.buildConsistencySlice(consistencyRequest);
  const indexedConsistency = indexed.buildConsistencySlice(consistencyRequest);
  return {
    facts: [
      sameValue(directObservation, indexedObservation),
      sameValue(
        expandAdjudicationFacts(directAdjudication.value),
        expandAdjudicationFacts(indexedAdjudication.value),
      ),
      sameValue(
        factSemantics(expandConsistencyFacts(directConsistency.value)),
        factSemantics(expandConsistencyFacts(indexedConsistency.value)),
      ),
    ],
    scopes: [
      sameValue(
        directAdjudication.value.scope,
        indexedAdjudication.value.scope,
      ),
      sameValue(
        directConsistency.value.scope,
        indexedConsistency.value.scope,
      ),
    ],
    causalLinks: [sameValue(
      normalizedCausalSemantics(directConsistency.value),
      normalizedCausalSemantics(indexedConsistency.value),
    )],
    directDigest: digest({
      observation: directObservation,
      adjudication: directAdjudication,
      consistency: directConsistency,
    }),
  };
}

function countMatches(values: boolean[]): Counts {
  return {
    matched: values.filter(Boolean).length,
    total: values.length,
  };
}

function queryClaimMatches(
  fixture: GraphFixture,
  query: ReturnType<BattleStateCanonicalGraphView["query"]>,
): boolean[] {
  return [
    ...fixture.expectedEntityRefs.map((ref) => query.entityRefs.includes(ref)),
    ...fixture.expectedPredicates.map((predicate) =>
      query.facts.some((fact) => fact.predicate === predicate)
    ),
    ...fixture.expectedInteractionKinds.map((kind) =>
      query.traversedKinds.includes(kind)
    ),
    ...fixture.expectedProcessRefs.map((ref) =>
      query.worldProcessRefs.includes(ref)
    ),
    query.issues.length >= fixture.minimumIssueCount,
    query.ruleRefs.length >= fixture.minimumRuleCount,
    !fixture.requiresCausalLink || query.causalLinks.length > 0,
  ];
}

function patchContextMatches(
  graph: BattleStateCanonicalGraphView,
  scenario: Scenario,
): boolean[] {
  if (!scenario.patch) return [];
  const read = graph.readPatch(scenario.patch);
  CanonicalGraphPatchReadSchema.parse(read);
  const retracted = new Set(scenario.patch.retractions);
  return [
    read.directFacts.some((fact) => retracted.has(fact.id)),
    read.inverseFacts.some((fact) => retracted.has(fact.id)),
    read.retractionFacts.some((fact) => retracted.has(fact.id)),
    read.assertionSlotFacts.some((fact) => fact.predicate === "held_by"),
    read.causalLinks.length > 0,
    read.issues.length > 0,
    read.ruleRefs.length > 0,
    read.missingRetractionFactRefs.length === 0,
    read.sourceMutated === false,
  ];
}

function measureFixture(input: {
  fixture: GraphFixture;
  repetitions: number;
}): FixtureAggregate & {
  samples: {
    query: number[];
    reconstruction: number[];
    restart: number[];
    maintenance: number[];
  };
} {
  const queryMatches: boolean[] = [];
  const factParity: boolean[] = [];
  const scopeParity: boolean[] = [];
  const causalParity: boolean[] = [];
  const orderParity: boolean[] = [];
  const restartParity: boolean[] = [];
  const outcomeParity: boolean[] = [];
  const rollbackParity: boolean[] = [];
  const patchMatches: boolean[] = [];
  const queryLatencies: number[] = [];
  const reconstructionLatencies: number[] = [];
  const restartLatencies: number[] = [];
  const maintenanceLatencies: number[] = [];
  const stateSizes: number[] = [];
  const graphSizes: number[] = [];
  const heapDeltas: number[] = [];
  const indexCoverage: Record<string, boolean> = Object.fromEntries(
    input.fixture.requiredIndexKeys.map((key) => [key, false]),
  );
  const failures = {
    schema: 0,
    sourceMutation: 0,
    committedOutcomeMismatch: 0,
  };

  for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
    const scenario = scenarioRunners[input.fixture.runner]!();
    BattleStateSchema.parse(scenario.state);
    const original = structuredClone(scenario.state);
    const heapBefore = process.memoryUsage().heapUsed;
    const reconstructionStart = performance.now();
    const graph = new BattleStateCanonicalGraphView({
      state: scenario.state,
      issueEnvelope: scenario.issueEnvelope,
    });
    reconstructionLatencies.push(performance.now() - reconstructionStart);
    heapDeltas.push(Math.max(0, process.memoryUsage().heapUsed - heapBefore));
    const snapshot = graph.snapshot();
    try {
      CanonicalGraphSnapshotSchema.parse(snapshot);
    } catch {
      failures.schema += 1;
    }
    stateSizes.push(serializedBytes(scenario.state));
    graphSizes.push(serializedBytes(snapshot));
    if (!sameValue(scenario.state, original)) failures.sourceMutation += 1;

    const queryStart = performance.now();
    const query = graph.query({
      anchorRefs: input.fixture.anchorRefs,
      purpose: input.fixture.purpose,
      temporalWindow: { fromTurn: 0, toTurn: scenario.state.turn + 1 },
      maxDepth: 4,
      maxEntities: 128,
      maxFacts: 512,
    });
    queryLatencies.push(performance.now() - queryStart);
    try {
      CanonicalGraphQueryResultSchema.parse(query);
    } catch {
      failures.schema += 1;
    }
    queryMatches.push(...queryClaimMatches(input.fixture, query));

    const projections = compareProjections(scenario.state, graph);
    factParity.push(...projections.facts);
    scopeParity.push(...projections.scopes);
    causalParity.push(...projections.causalLinks);
    patchMatches.push(...patchContextMatches(graph, scenario));

    const reordered = new BattleStateCanonicalGraphView({
      state: reorderedState(scenario.state),
      issueEnvelope: scenario.issueEnvelope,
    });
    orderParity.push(sameValue(reordered.snapshot(), snapshot));

    const restartStart = performance.now();
    const restartedState = BattleStateSchema.parse(
      JSON.parse(JSON.stringify(scenario.state)) as unknown,
    );
    const restarted = new BattleStateCanonicalGraphView({
      state: restartedState,
      issueEnvelope: scenario.issueEnvelope,
    });
    restartLatencies.push(performance.now() - restartStart);
    restartParity.push(sameValue(restarted.snapshot(), snapshot));

    const baselineOutcome = normalizedOutcome(scenario.state);
    const graphOutcome = normalizedOutcome(graph.legacyStateSnapshot());
    const outcomeMatches = sameValue(baselineOutcome, graphOutcome);
    outcomeParity.push(outcomeMatches);
    if (!outcomeMatches) failures.committedOutcomeMismatch += 1;

    const directAfterGraph = new BattleStateProjectionAdapter(scenario.state);
    const rollbackDigest = digest({
      observation: directAfterGraph.buildObservationSlice({
        observerRef: "character.a",
        purpose: "character_decision",
      }),
      adjudication: directAfterGraph.buildAdjudicationSlice({
        proposalRefs: ["proposal.a", "proposal.b"],
        temporalWindow: {
          fromTurn: 0,
          toTurn: scenario.state.turn + 1,
          phase: "proposal",
        },
      }),
      consistency: directAfterGraph.buildConsistencySlice({
        anchorRefs: ["character.a", "character.b"],
        purpose: "adjudication",
        temporalWindow: {
          fromTurn: 0,
          toTurn: scenario.state.turn + 1,
          phase: "post_commit",
        },
      }),
    });
    rollbackParity.push(rollbackDigest === projections.directDigest);

    const maintainedState = structuredClone(scenario.state);
    maintainedState.sideA.parameters.hp = Math.max(
      0,
      (maintainedState.sideA.parameters.hp ?? 0) - 1,
    );
    const maintenanceStart = performance.now();
    const maintained = new BattleStateCanonicalGraphView({
      state: maintainedState,
      issueEnvelope: scenario.issueEnvelope,
    });
    maintenanceLatencies.push(performance.now() - maintenanceStart);
    const maintainedHp = maintained.factsForEntity("character.a", false)
      .find((fact) => fact.predicate === "parameter.hp");
    if (maintainedHp?.value !== maintainedState.sideA.parameters.hp) {
      failures.schema += 1;
    }

    const stats = graph.indexStats();
    for (const key of input.fixture.requiredIndexKeys) {
      indexCoverage[key] ||= stats[key] > 0;
    }
  }

  const queryCounts = countMatches(queryMatches);
  const factCounts = countMatches(factParity);
  const scopeCounts = countMatches(scopeParity);
  const causalCounts = countMatches(causalParity);
  const orderCounts = countMatches(orderParity);
  const restartCounts = countMatches(restartParity);
  const outcomeCounts = countMatches(outcomeParity);
  const rollbackCounts = countMatches(rollbackParity);
  const patchCounts = countMatches(patchMatches);
  const stateBytes = mean(stateSizes);
  const snapshotBytes = mean(graphSizes);
  return {
    id: input.fixture.id,
    repetitions: input.repetitions,
    queryClaims: { ...queryCounts, recall: rate(queryCounts) },
    parity: {
      facts: { ...factCounts, rate: rate(factCounts) },
      scopes: { ...scopeCounts, rate: rate(scopeCounts) },
      causalLinks: { ...causalCounts, rate: rate(causalCounts) },
    },
    reconstruction: {
      orderIndependent: { ...orderCounts, rate: rate(orderCounts) },
      restartParity: { ...restartCounts, rate: rate(restartCounts) },
      committedOutcomeParity: { ...outcomeCounts, rate: rate(outcomeCounts) },
      rollbackSuccess: { ...rollbackCounts, rate: rate(rollbackCounts) },
    },
    patchContext: { ...patchCounts, recall: rate(patchCounts) },
    cost: {
      battleStateBytes: round(stateBytes),
      graphSnapshotBytes: round(snapshotBytes),
      dualRepresentationSerializedGrowthRatio: round(
        (stateBytes + snapshotBytes) / stateBytes,
      ),
      retainedHeapDeltaBytesPerGraph: round(mean(heapDeltas)),
      queryLatencyMs: latencySummary(queryLatencies),
      reconstructionLatencyMs: latencySummary(reconstructionLatencies),
      restartLatencyMs: latencySummary(restartLatencies),
      fullRebuildMaintenanceLatencyMs: latencySummary(maintenanceLatencies),
    },
    indexCoverage,
    failures,
    samples: {
      query: queryLatencies,
      reconstruction: reconstructionLatencies,
      restart: restartLatencies,
      maintenance: maintenanceLatencies,
    },
  };
}

function sumCounts(
  fixtures: FixtureAggregate[],
  select: (fixture: FixtureAggregate) => Counts,
): number {
  const counts = fixtures.reduce(
    (total, fixture) => {
      const selected = select(fixture);
      total.matched += selected.matched;
      total.total += selected.total;
      return total;
    },
    { matched: 0, total: 0 },
  );
  return rate(counts);
}

function decisionFor(input: {
  aggregate: CanonicalGraphEvaluationReport["aggregate"];
  corpusComplete: boolean;
}): CanonicalGraphEvaluationReport["decision"] {
  if (!input.corpusComplete) {
    return {
      label: "indeterminate",
      reasons: ["The frozen corpus did not exercise every required graph component."],
      boundedRevisionHypotheses: [],
    };
  }
  if (!input.aggregate.hardInvariantsPass) {
    return {
      label: "unsupported",
      reasons: ["One or more non-tradeable graph parity or authority invariants failed."],
      boundedRevisionHypotheses: [],
    };
  }
  const reasons: string[] = [];
  const hypotheses: string[] = [];
  if (!input.aggregate.effectivenessPass) {
    reasons.push("At least one graph query, reconstruction, restart, or patch-read effectiveness threshold failed.");
    hypotheses.push("Narrow graph traversal and fact normalization to the failed frozen scenario before adding runtime consumers.");
  }
  if (!input.aggregate.costAndComplexityPass) {
    reasons.push("At least one serialized-growth, latency, rebuild, or complexity ceiling failed.");
    hypotheses.push("Retain only measured-value indexes and derive temporal, process, and rule views on demand.");
  }
  if (reasons.length > 0) {
    return { label: "revise", reasons, boundedRevisionHypotheses: hypotheses };
  }
  return {
    label: "supported",
    reasons: [
      "Every frozen invariant and effectiveness/cost threshold passed for a discardable in-memory derived graph.",
      "Independent graph persistence remains unsupported by this evidence.",
    ],
    boundedRevisionHypotheses: [],
  };
}

export async function evaluateBattleCanonicalGraphPoc(input: {
  fixturePath?: string;
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<CanonicalGraphEvaluationReport> {
  const fixturePath = path.resolve(input.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = validateFixtureFile(JSON.parse(fixtureText) as unknown);
  const repetitions = input.repetitions ?? fixture.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }

  const measurements = fixture.fixtures.map((item) => measureFixture({
    fixture: item,
    repetitions,
  }));
  const fixtures: FixtureAggregate[] = measurements.map((measurement) => {
    const { samples: _samples, ...report } = measurement;
    return report;
  });
  const allQueryLatencies = measurements.flatMap((item) => item.samples.query);
  const allReconstructionLatencies = measurements.flatMap((item) =>
    item.samples.reconstruction
  );
  const allRestartLatencies = measurements.flatMap((item) => item.samples.restart);
  const allMaintenanceLatencies = measurements.flatMap((item) =>
    item.samples.maintenance
  );

  const evaluatorPath = fileURLToPath(import.meta.url);
  const graphSourcePath = path.join(
    repositoryRoot,
    "packages/shared/src/battle-canonical-graph.ts",
  );
  const projectionSourcePath = path.join(
    repositoryRoot,
    "packages/shared/src/battle-projection.ts",
  );
  const [evaluatorText, graphSourceText, projectionSourceText] = await Promise.all([
    fs.readFile(evaluatorPath, "utf8"),
    fs.readFile(graphSourcePath, "utf8"),
    fs.readFile(projectionSourcePath, "utf8"),
  ]);
  const runtimeRefs = gitOutput([
    "grep",
    "-l",
    "-E",
    "BattleStateCanonicalGraphView|createCanonicalGraphProjectionAdapter",
    "--",
    "backend/src",
    "frontend/src",
    "infra",
  ], true).split("\n").filter((file) =>
    file && !file.includes("/scripts/") && !file.endsWith(".test.ts")
  );
  const exportedNames = [...graphSourceText.matchAll(
    /^export\s+(?:const|class|function|type|interface)\s+([A-Za-z0-9_]+)/gmu,
  )].map((match) => match[1]!);
  const exportedMutationAuthorityCount = exportedNames.filter((name) =>
    /(commit|persist|save|write|delete|mutate|applyPatch|updateGraph)/iu.test(name)
  ).length;
  const implementationComplexity = {
    graphSourceLines: graphSourceText.split("\n").length,
    graphExportedDeclarations: exportedNames.length,
    runtimeIntegrationRefCount: runtimeRefs.length,
    exportedMutationAuthorityCount,
  };
  const schemaFailureCount = fixtures.reduce(
    (sum, item) => sum + item.failures.schema,
    0,
  );
  const sourceMutationCount = fixtures.reduce(
    (sum, item) => sum + item.failures.sourceMutation,
    0,
  );
  const committedOutcomeMismatchCount = fixtures.reduce(
    (sum, item) => sum + item.failures.committedOutcomeMismatch,
    0,
  );
  const aggregateBase = {
    schemaFailureCount,
    sourceMutationCount,
    runtimeIntegrationRefCount: runtimeRefs.length,
    exportedMutationAuthorityCount,
    committedOutcomeMismatchCount,
    projectionFactEquality: sumCounts(fixtures, (item) => item.parity.facts),
    projectionScopeEquality: sumCounts(fixtures, (item) => item.parity.scopes),
    projectionCausalEquality: sumCounts(fixtures, (item) => item.parity.causalLinks),
    queryClaimRecall: sumCounts(fixtures, (item) => item.queryClaims),
    orderIndependence: sumCounts(
      fixtures,
      (item) => item.reconstruction.orderIndependent,
    ),
    restartParity: sumCounts(fixtures, (item) => item.reconstruction.restartParity),
    committedOutcomeParity: sumCounts(
      fixtures,
      (item) => item.reconstruction.committedOutcomeParity,
    ),
    rollbackSuccess: sumCounts(
      fixtures,
      (item) => item.reconstruction.rollbackSuccess,
    ),
    patchContextRecall: sumCounts(
      fixtures.filter((item) => item.patchContext.total > 0),
      (item) => item.patchContext,
    ),
    maximumDualRepresentationSerializedGrowthRatio: Math.max(
      ...fixtures.map((item) => item.cost.dualRepresentationSerializedGrowthRatio),
    ),
    p95QueryLatencyMs: round(percentile(allQueryLatencies, 95)),
    p95ReconstructionLatencyMs: round(
      percentile(allReconstructionLatencies, 95),
    ),
    p95RestartLatencyMs: round(percentile(allRestartLatencies, 95)),
    p95FullRebuildMaintenanceLatencyMs: round(
      percentile(allMaintenanceLatencies, 95),
    ),
  };
  const hardInvariantsPass = schemaFailureCount === 0 &&
    sourceMutationCount === 0 && runtimeRefs.length === 0 &&
    exportedMutationAuthorityCount === 0 && committedOutcomeMismatchCount === 0 &&
    aggregateBase.projectionFactEquality >=
      fixture.thresholds.projectionFactEqualityMinimum &&
    aggregateBase.projectionScopeEquality >=
      fixture.thresholds.projectionScopeEqualityMinimum &&
    aggregateBase.projectionCausalEquality >=
      fixture.thresholds.projectionCausalEqualityMinimum &&
    aggregateBase.committedOutcomeParity >=
      fixture.thresholds.committedOutcomeParityMinimum &&
    aggregateBase.rollbackSuccess >= fixture.thresholds.rollbackSuccessMinimum;
  const effectivenessPass = aggregateBase.queryClaimRecall >=
      fixture.thresholds.queryClaimRecallMinimum &&
    aggregateBase.orderIndependence >=
      fixture.thresholds.orderIndependenceMinimum &&
    aggregateBase.restartParity >= fixture.thresholds.restartParityMinimum &&
    aggregateBase.patchContextRecall >=
      fixture.thresholds.patchContextRecallMinimum;
  const costAndComplexityPass =
    aggregateBase.maximumDualRepresentationSerializedGrowthRatio <=
      fixture.thresholds.dualRepresentationSerializedGrowthRatioMaximum &&
    aggregateBase.p95QueryLatencyMs <=
      fixture.thresholds.p95QueryLatencyMsMaximum &&
    aggregateBase.p95ReconstructionLatencyMs <=
      fixture.thresholds.p95ReconstructionLatencyMsMaximum &&
    aggregateBase.p95RestartLatencyMs <=
      fixture.thresholds.p95RestartLatencyMsMaximum &&
    aggregateBase.p95FullRebuildMaintenanceLatencyMs <=
      fixture.thresholds.p95FullRebuildMaintenanceLatencyMsMaximum &&
    implementationComplexity.graphSourceLines <=
      fixture.thresholds.graphSourceLinesMaximum &&
    implementationComplexity.graphExportedDeclarations <=
      fixture.thresholds.graphExportedDeclarationsMaximum;
  const aggregate = {
    ...aggregateBase,
    hardInvariantsPass,
    effectivenessPass,
    costAndComplexityPass,
  };
  const allCoveredIndexKeys = new Set(fixtures.flatMap((item) =>
    Object.entries(item.indexCoverage)
      .filter(([, covered]) => covered)
      .map(([key]) => key)
  ));
  const corpusComplete = [
    "entities",
    "facts",
    "factSubjectBuckets",
    "factObjectBuckets",
    "temporalTurnBuckets",
    "causalSourceBuckets",
    "causalTargetBuckets",
    "interactionSourceBuckets",
    "worldProcesses",
    "issues",
    "rules",
  ].every((key) => allCoveredIndexKeys.has(key)) &&
    fixtures.some((item) => item.patchContext.total > 0);

  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "canonical_graph_poc_evaluation",
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: sha256(fixtureText),
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
      graphSourcePath: path.relative(repositoryRoot, graphSourcePath),
      graphSourceSha256: sha256(graphSourceText),
      projectionSourcePath: path.relative(repositoryRoot, projectionSourcePath),
      projectionSourceSha256: sha256(projectionSourceText),
    },
    execution: {
      repetitionsPerFixture: repetitions,
      fixtureCount: fixture.fixtures.length,
      graphConstructions: repetitions * fixture.fixtures.length * 4,
      graphQueries: repetitions * fixture.fixtures.length,
      projectionComparisons: repetitions * fixture.fixtures.length * 6,
      externalLlmCallsMade: 0,
      xaiUsed: false,
      xaiReason:
        "Every frozen claim is a structured equality, reachability, cost, or authority assertion; semantic judging would add noise.",
      indexMaintenanceMode: "discard_and_full_rebuild",
    },
    thresholds: fixture.thresholds,
    fixtures,
    implementationComplexity,
    aggregate,
    componentAssessment: {
      boundedValueObserved: [
        "entity identity and subject/inverse fact lookup",
        "causal source and target lookup",
        "interaction adjacency traversal",
        "purpose-scoped issue lookup",
        "bounded patch read context",
      ],
      remainDerived: [
        "temporal turn views",
        "active world-process reference list",
        "rule-reference list",
        "serialized graph snapshot",
      ],
      incrementalMaintenanceAvailable: false,
      independentPersistenceSupported: false,
    },
    decision: decisionFor({
      aggregate,
      corpusComplete,
    }),
    limitations: [
      "Parity is measured on four frozen structured scenarios, not arbitrary future BattleState shapes.",
      "Committed-outcome equality proves only that constructing and discarding the view does not change deterministic resolution for this corpus.",
      "Heap delta is diagnostic because process allocation and garbage collection are not isolated; serialized growth is the stable proxy.",
      "Full reconstruction is the only index-maintenance strategy in this PoC; no incremental mutation cost is claimed.",
      "A supported result applies to an ephemeral derived view and does not authorize persistence, runtime wiring, or migration.",
      "No XAI call was needed because the evaluation has no competing semantic or narrative outputs.",
      "Passing proxies cannot guarantee a globally consistent or objectively correct final battle result.",
    ],
  };
}

function parseArgs(args: string[]): {
  fixturePath?: string;
  repetitions?: number;
  outputPath?: string;
} {
  const parsed: {
    fixturePath?: string;
    repetitions?: number;
    outputPath?: string;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--fixtures") {
      parsed.fixturePath = path.resolve(repositoryRoot, value);
    } else if (arg === "--repetitions") {
      parsed.repetitions = Number(value);
    } else if (arg === "--output") {
      parsed.outputPath = path.resolve(repositoryRoot, value);
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
    index += 1;
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await evaluateBattleCanonicalGraphPoc({
    fixturePath: args.fixturePath,
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[battle-canonical-graph-poc] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
