import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AdjudicationSliceSchema,
  BattleStateProjectionAdapter,
  BattleStateSchema,
  BATTLE_PROJECTION_DEFAULT_LIMITS,
  ConsistencySliceSchema,
  ObservationSliceSchema,
  buildBattleTurnRecord,
  createBattleState,
  defaultParameters,
  resolveTurn,
  type AdjudicationSlice,
  type BattleState,
  type BattleWorldEntity,
  type CanonicalReadResult,
  type CharacterSheet,
  type ConsistencySlice,
  type InteractionKind,
  type ObservationSlice,
} from "@kshiai/shared";
import { evaluateBattlePipelineBaseline } from "./evaluate-battle-pipeline-baseline.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-projection-fixtures-v1.json",
);
const fixedTime = "2026-08-06T00:00:00.000Z";

type FactExpectation = {
  kind: "fact";
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  value?: unknown;
};

type InteractionExpectation = {
  kind: "interaction";
  interactionKind: InteractionKind;
};

type ProcessExpectation = {
  kind: "process";
  processRef: string;
};

type CausalLinkExpectation = {
  kind: "causal_link";
  sourceRef: string;
  relation: "created" | "ended" | "modified" | "triggered";
};

type ObserverSubjectExpectation = {
  kind: "observer_subject";
  localRef: string;
  role: string;
  identityKnowledge: string;
  currentAccess: string;
};

type DecisiveExpectation =
  | FactExpectation
  | InteractionExpectation
  | ProcessExpectation
  | CausalLinkExpectation
  | ObserverSubjectExpectation;

type ProjectionFixture = {
  id: string;
  runner: string;
  sliceKind: "observation" | "adjudication" | "consistency";
  purpose: string;
  expectedDecisiveClaims: DecisiveExpectation[];
};

type FixtureFile = {
  schemaVersion: 1;
  fixtureVersion: string;
  frozenAt: string;
  baseline: {
    corpusPath: string;
    corpusSha256: string;
    reportPath: string;
    reportSha256: string;
  };
  repetitions: number;
  projectionLimits: "adapter_defaults";
  byteComparison: Record<string, string>;
  thresholds: {
    identityLeakageCount: number;
    observerIsolationViolationCount: number;
    baselineOutcomeMismatchCount: number;
    decisiveFactRecallMinimum: number;
    irrelevantFactByteReductionMinimum: number;
    p95ProjectionLatencyMsMaximum: number;
  };
  fixtures: ProjectionFixture[];
};

type ProjectionValue = ObservationSlice | AdjudicationSlice | ConsistencySlice;

type FixtureRun = {
  state: BattleState;
  canonicalRefsForbiddenInObservation: string[];
  project: (
    adapter: BattleStateProjectionAdapter,
  ) => CanonicalReadResult<ProjectionValue>;
  isolationProbe?: (
    adapter: BattleStateProjectionAdapter,
  ) => ObservationSlice;
};

type FixtureAggregate = {
  id: string;
  sliceKind: ProjectionFixture["sliceKind"];
  purpose: string;
  repetitions: number;
  expectedDecisiveClaimCount: number;
  matchedDecisiveClaimCount: number;
  decisiveFactRecall: number;
  missedDecisiveClaims: DecisiveExpectation[];
  fullInputBytes: number;
  projectionBytes: {
    mean: number;
    minimum: number;
    maximum: number;
  };
  byteReductionRate: number;
  latencyMs: {
    mean: number;
    p95: number;
    minimum: number;
    maximum: number;
  };
  hardFailures: {
    schema: number;
    sourceMutation: number;
    identityLeakage: number;
    observerIsolation: number;
    limitViolation: number;
    outcomeMismatch: number;
  };
};

export type ProjectionEvaluationReport = {
  schemaVersion: 1;
  fixtureVersion: string;
  generatedAt: string;
  mode: "projection_poc_evaluation";
  provenance: {
    gitHead: string;
    workingTreeDirty: boolean;
    nodeVersion: string;
    fixturePath: string;
    fixtureSha256: string;
    corpusPath: string;
    corpusExpectedSha256: string;
    corpusActualSha256: string;
    baselineReportPath: string;
    baselineExpectedSha256: string;
    baselineActualSha256: string;
    evaluatorPath: string;
    evaluatorSha256: string;
    projectionSourcePath: string;
    projectionSourceSha256: string;
  };
  execution: {
    repetitionsPerFixture: number;
    fixtureCount: number;
    projectionReads: number;
    externalLlmCallsMade: 0;
    xaiUsed: false;
    xaiReason: string;
    projectionLimits: typeof BATTLE_PROJECTION_DEFAULT_LIMITS;
  };
  thresholds: FixtureFile["thresholds"];
  baselineOutcomeComparison: {
    scenarioCount: number;
    mismatchCount: number;
    mismatchedScenarioIds: string[];
  };
  fixtures: FixtureAggregate[];
  aggregate: {
    schemaFailureCount: number;
    sourceMutationCount: number;
    identityLeakageCount: number;
    observerIsolationViolationCount: number;
    limitViolationCount: number;
    baselineOutcomeMismatchCount: number;
    decisiveFactRecall: number;
    irrelevantFactByteReduction: number;
    p95ProjectionLatencyMs: number;
    hardInvariantsPass: boolean;
    decisiveFactRecallPass: boolean;
    irrelevantFactByteReductionPass: boolean;
    projectionLatencyPass: boolean;
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

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
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

function round(value: number): number {
  return Number(value.toFixed(6));
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function makeSheet(id: string, displayName: string): CharacterSheet {
  return {
    id,
    ownerUserId: "projection-eval-owner",
    displayName,
    tags: ["projection-eval"],
    createdAt: fixedTime,
    updatedAt: fixedTime,
    appearance: {
      summary: `${displayName}の固定fixture外見`,
      visualPrompt: "projection evaluation fixture",
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
    narrativeBlurb: `${displayName}のprojection評価fixture`,
  };
}

function makeState(id: string): BattleState {
  return createBattleState({
    id,
    sideA: makeSheet(`${id}-a`, "シロ"),
    sideB: makeSheet(`${id}-b`, "クロ"),
    turnLimit: 20,
    prologuePending: false,
  });
}

function objectEntity(input: {
  placement: BattleWorldEntity["placement"];
  cover?: "none" | "partial" | "full";
}): BattleWorldEntity {
  return {
    kind: "object",
    active: true,
    presence: "present",
    placement: input.placement,
    exposure: "exposed",
    actorState: null,
    objectState: {
      portable: ["held", "worn"].includes(input.placement.type),
      usable: true,
      exclusiveUse: false,
      usableBy: [],
      cover: input.cover ?? "none",
      blocksMovement: false,
      visionEffect: "none",
      hearingEffect: "none",
      mobilityEffect: "none",
    },
    createdTurn: 0,
    updatedTurn: 0,
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
    createdTurn: 0,
    updatedTurn: 0,
  };
}

function ordinaryAdjudication(): FixtureRun {
  const state = makeState("projection-ordinary");
  return {
    state,
    canonicalRefsForbiddenInObservation: [],
    project: (adapter) => adapter.buildAdjudicationSlice({
      proposalRefs: ["proposal.a", "proposal.b"],
      temporalWindow: { fromTurn: 0, toTurn: 1, phase: "proposal" },
    }),
  };
}

function remoteTargeting(): FixtureRun {
  const state = makeState("projection-remote");
  const world = structuredClone(state.worldState!);
  world.areas["area.remote"] = {
    label: "遠隔区画",
    illumination: "normal",
    noise: "normal",
    space: "open",
    movement: "open",
  };
  world.entities["character.b"]!.placement = {
    type: "scene",
    areaId: "area.remote",
  };
  world.entities["character.b"]!.updatedTurn = 1;
  world.pairRelations[0] = {
    ...world.pairRelations[0]!,
    distance: "separate_area",
    sight: "blocked",
    sound: "partial",
    updatedTurn: 1,
  };
  state.worldState = world;
  return {
    state,
    canonicalRefsForbiddenInObservation: [],
    project: (adapter) => adapter.buildAdjudicationSlice({
      proposalRefs: ["proposal.a", "proposal.b"],
      temporalWindow: { fromTurn: 1, toTurn: 1, phase: "proposal" },
    }),
  };
}

function supportPropagation(): FixtureRun {
  const state = makeState("projection-support");
  const world = structuredClone(state.worldState!);
  world.entities["object.tool"] = objectEntity({
    placement: { type: "held", holderId: "character.a" },
    cover: "partial",
  });
  world.entities["terrain.support"] = objectEntity({
    placement: { type: "attached", anchorId: "object.tool" },
  });
  state.worldState = world;
  return {
    state,
    canonicalRefsForbiddenInObservation: [],
    project: (adapter) => adapter.buildConsistencySlice({
      anchorRefs: ["object.tool"],
      purpose: "adjudication",
      temporalWindow: { fromTurn: 0, toTurn: 1 },
    }),
  };
}

function committedCommunication(): FixtureRun {
  const initial = makeState("projection-communication");
  const resolved = resolveTurn({
    state: initial,
    playerAction: { actorSide: "a", kind: "wait" },
    sideASkills: [],
    sideBSkills: [],
  });
  const utterance = {
    id: "turn-1-utterance-a",
    type: "utterance" as const,
    actorName: "シロ",
    actorSide: "a" as const,
    targetName: "クロ",
    targetSides: ["b" as const],
    sourceActionId: "turn-1-action-a",
    utterance: {
      text: "そこで待て",
      delivery: "spoken" as const,
      volume: "normal" as const,
      articulation: "clear" as const,
      language: "ja",
    },
    summary: "シロがクロへ呼びかけた。",
  };
  resolved.state.turnRecords = [buildBattleTurnRecord({
    before: initial,
    after: resolved.state,
    events: [...resolved.events, utterance],
    actions: resolved.actions,
  })];
  return {
    state: resolved.state,
    canonicalRefsForbiddenInObservation: [],
    project: (adapter) => adapter.buildConsistencySlice({
      anchorRefs: ["character.a", "character.b"],
      purpose: "perception",
      temporalWindow: { fromTurn: 1, toTurn: 1, phase: "post_commit" },
    }),
  };
}

function activeWorldProcess(): FixtureRun {
  const state = makeState("projection-process");
  const world = structuredClone(state.worldState!);
  world.entities["effect.smoke"] = effectEntity("area.1");
  state.worldState = world;
  return {
    state,
    canonicalRefsForbiddenInObservation: [],
    project: (adapter) => adapter.buildAdjudicationSlice({
      proposalRefs: ["proposal.a", "proposal.b"],
      temporalWindow: { fromTurn: 0, toTurn: 1, phase: "proposal" },
    }),
  };
}

function observerIdentityIsolation(): FixtureRun {
  const state = makeState("projection-identity");
  state.perceptionFrameA = structuredClone(state.perceptionFrameA!);
  state.perceptionFrameA.others.push({
    subject: {
      kind: "identified",
      perceptionRef: "object.secret-canonical",
    },
    currentAccess: "clear",
    identityKnowledge: "identified",
    perceivedAs: "A_ONLY_VISIBLE_MARKER",
    percepts: [{
      perceptId: "percept.a.local-secret",
      modality: "vision",
      phenomenon: "固有の輪郭を捉えた",
      direction: "front",
      distance: "near",
      salience: "noticeable",
      occurrenceCertainty: "certain",
      attributionCertainty: "probable",
    }],
  });
  state.agentStateA = {
    ...state.agentStateA!,
    privateMemory: "A_PRIVATE_MARKER",
  };
  state.agentStateB = {
    ...state.agentStateB!,
    privateMemory: "B_PRIVATE_MARKER",
  };
  return {
    state,
    canonicalRefsForbiddenInObservation: [
      "character.a",
      "character.b",
      "object.secret-canonical",
    ],
    project: (adapter) => adapter.buildObservationSlice({
      observerRef: "character.a",
      purpose: "character_decision",
    }),
    isolationProbe: (adapter) => adapter.buildObservationSlice({
      observerRef: "character.b",
      purpose: "character_decision",
    }).value,
  };
}

const fixtureRunners: Record<string, () => FixtureRun> = {
  ordinary_adjudication: ordinaryAdjudication,
  remote_targeting: remoteTargeting,
  support_propagation: supportPropagation,
  committed_communication: committedCommunication,
  active_world_process: activeWorldProcess,
  observer_identity_isolation: observerIdentityIsolation,
};

function validateFixtureFile(raw: unknown): FixtureFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("projection fixture must be an object");
  }
  const fixture = raw as FixtureFile;
  if (fixture.schemaVersion !== 1 || !fixture.fixtureVersion) {
    throw new Error("unsupported projection fixture schema");
  }
  if (!Array.isArray(fixture.fixtures) || fixture.fixtures.length === 0) {
    throw new Error("projection fixture file has no fixtures");
  }
  const ids = new Set<string>();
  for (const item of fixture.fixtures) {
    if (!item.id || ids.has(item.id)) {
      throw new Error(`duplicate or missing fixture ID: ${item.id}`);
    }
    ids.add(item.id);
    if (!fixtureRunners[item.runner]) {
      throw new Error(`unknown projection fixture runner: ${item.runner}`);
    }
    if (item.expectedDecisiveClaims.length === 0) {
      throw new Error(`fixture ${item.id} has no decisive claims`);
    }
  }
  return fixture;
}

function factsOf(value: ProjectionValue) {
  return "facts" in value ? value.facts : [];
}

function interactionsOf(value: ProjectionValue): InteractionKind[] {
  return value.scope.traversedKinds;
}

function expectationMatches(
  expectation: DecisiveExpectation,
  value: ProjectionValue,
): boolean {
  if (expectation.kind === "fact") {
    return factsOf(value).some((fact) =>
      fact.subjectRef === expectation.subjectRef &&
      fact.predicate === expectation.predicate &&
      (expectation.objectRef === undefined ||
        fact.objectRef === expectation.objectRef) &&
      (!("value" in expectation) || sameValue(fact.value, expectation.value))
    );
  }
  if (expectation.kind === "interaction") {
    return interactionsOf(value).includes(expectation.interactionKind);
  }
  if (expectation.kind === "process") {
    return "processRefs" in value.scope &&
      value.scope.processRefs.includes(expectation.processRef);
  }
  if (expectation.kind === "causal_link") {
    return "causalLinks" in value && value.causalLinks.some((link) =>
      link.sourceRef === expectation.sourceRef &&
      link.relation === expectation.relation
    );
  }
  return "subjects" in value && value.subjects.some((subject) =>
    subject.localRef === expectation.localRef &&
    subject.role === expectation.role &&
    subject.identityKnowledge === expectation.identityKnowledge &&
    subject.currentAccess === expectation.currentAccess
  );
}

function parseProjectionValue(
  kind: ProjectionFixture["sliceKind"],
  value: ProjectionValue,
): void {
  if (kind === "observation") {
    ObservationSliceSchema.parse(value);
  } else if (kind === "adjudication") {
    AdjudicationSliceSchema.parse(value);
  } else {
    ConsistencySliceSchema.parse(value);
  }
}

function limitViolationCount(value: ProjectionValue): number {
  let violations = serializedBytes(value) > BATTLE_PROJECTION_DEFAULT_LIMITS.maxBytes
    ? 1
    : 0;
  if ("facts" in value &&
    value.facts.length > BATTLE_PROJECTION_DEFAULT_LIMITS.maxFacts) {
    violations += 1;
  }
  if ("entityRefs" in value.scope &&
    value.scope.entityRefs.length > BATTLE_PROJECTION_DEFAULT_LIMITS.maxEntities) {
    violations += 1;
  }
  if ("ruleRefs" in value.scope &&
    value.scope.ruleRefs.length > BATTLE_PROJECTION_DEFAULT_LIMITS.maxRules) {
    violations += 1;
  }
  return violations;
}

function normalizedTurnOutcome(state: BattleState): unknown {
  const resolved = resolveTurn({
    state: structuredClone(state),
    playerAction: { actorSide: "a", kind: "wait" },
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
    worldRevision: resolved.state.worldState?.revision ?? null,
  };
}

function aggregateFixture(input: {
  fixture: ProjectionFixture;
  repetitions: number;
}): FixtureAggregate {
  const latencies: number[] = [];
  const projectionSizes: number[] = [];
  const missed = new Map<string, DecisiveExpectation>();
  let matchedDecisiveClaimCount = 0;
  let fullInputBytes = 0;
  const hardFailures = {
    schema: 0,
    sourceMutation: 0,
    identityLeakage: 0,
    observerIsolation: 0,
    limitViolation: 0,
    outcomeMismatch: 0,
  };

  for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
    const built = fixtureRunners[input.fixture.runner]!();
    BattleStateSchema.parse(built.state);
    const beforeProjection = structuredClone(built.state);
    const outcomeBefore = normalizedTurnOutcome(built.state);
    fullInputBytes += serializedBytes(built.state);
    const start = performance.now();
    const adapter = new BattleStateProjectionAdapter(built.state);
    const result = built.project(adapter);
    latencies.push(performance.now() - start);
    projectionSizes.push(serializedBytes(result.value));

    try {
      parseProjectionValue(input.fixture.sliceKind, result.value);
    } catch {
      hardFailures.schema += 1;
    }
    if (!sameValue(built.state, beforeProjection)) {
      hardFailures.sourceMutation += 1;
    }
    hardFailures.limitViolation += limitViolationCount(result.value);

    if (input.fixture.sliceKind === "observation") {
      const serialized = JSON.stringify(result.value);
      hardFailures.identityLeakage += built.canonicalRefsForbiddenInObservation
        .filter((ref) => serialized.includes(ref)).length;
      if (/perceptionRef|observerRef|entityRef/u.test(serialized)) {
        hardFailures.identityLeakage += 1;
      }
      if (serialized.includes("B_PRIVATE_MARKER")) {
        hardFailures.observerIsolation += 1;
      }
      const sideB = built.isolationProbe?.(adapter);
      if (sideB) {
        const sideBSerialized = JSON.stringify(sideB);
        if (
          sideBSerialized.includes("A_ONLY_VISIBLE_MARKER") ||
          sideBSerialized.includes("A_PRIVATE_MARKER")
        ) {
          hardFailures.observerIsolation += 1;
        }
      }
    }

    for (const expectation of input.fixture.expectedDecisiveClaims) {
      if (expectationMatches(expectation, result.value)) {
        matchedDecisiveClaimCount += 1;
      } else {
        missed.set(JSON.stringify(canonicalize(expectation)), expectation);
      }
    }

    const outcomeAfter = normalizedTurnOutcome(built.state);
    if (digest(outcomeAfter) !== digest(outcomeBefore)) {
      hardFailures.outcomeMismatch += 1;
    }
  }

  const expectedTotal = input.fixture.expectedDecisiveClaims.length *
    input.repetitions;
  const totalProjectionBytes = projectionSizes.reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    id: input.fixture.id,
    sliceKind: input.fixture.sliceKind,
    purpose: input.fixture.purpose,
    repetitions: input.repetitions,
    expectedDecisiveClaimCount: expectedTotal,
    matchedDecisiveClaimCount,
    decisiveFactRecall: expectedTotal === 0
      ? 0
      : round(matchedDecisiveClaimCount / expectedTotal),
    missedDecisiveClaims: [...missed.values()],
    fullInputBytes: Math.round(fullInputBytes / input.repetitions),
    projectionBytes: {
      mean: round(mean(projectionSizes)),
      minimum: Math.min(...projectionSizes),
      maximum: Math.max(...projectionSizes),
    },
    byteReductionRate: fullInputBytes === 0
      ? 0
      : round(1 - totalProjectionBytes / fullInputBytes),
    latencyMs: {
      mean: round(mean(latencies)),
      p95: round(percentile(latencies, 95)),
      minimum: round(Math.min(...latencies)),
      maximum: round(Math.max(...latencies)),
    },
    hardFailures,
  };
}

function decisionFor(input: {
  aggregate: ProjectionEvaluationReport["aggregate"];
}): ProjectionEvaluationReport["decision"] {
  const reasons: string[] = [];
  const hypotheses: string[] = [];
  if (!input.aggregate.hardInvariantsPass) {
    reasons.push("One or more non-tradeable projection hard invariants failed.");
    return {
      label: "unsupported",
      reasons,
      boundedRevisionHypotheses: [],
    };
  }
  if (!input.aggregate.decisiveFactRecallPass) {
    reasons.push(
      `Decisive-fact recall ${input.aggregate.decisiveFactRecall} is below the frozen minimum.`,
    );
    hypotheses.push(
      "Prioritize purpose- and anchor-critical world, relation, process, and recent-causal facts before bulk mechanical and semantic facts when applying count or byte limits.",
    );
  }
  if (!input.aggregate.irrelevantFactByteReductionPass) {
    reasons.push(
      `Weighted byte reduction ${input.aggregate.irrelevantFactByteReduction} is below the frozen minimum.`,
    );
    hypotheses.push(
      "Deduplicate overlapping world and semantic representations and replace repeated fact envelopes with compact purpose-specific DTOs.",
    );
  }
  if (!input.aggregate.projectionLatencyPass) {
    reasons.push(
      `Projection p95 ${input.aggregate.p95ProjectionLatencyMs}ms exceeds the frozen ceiling.`,
    );
    hypotheses.push(
      "Pre-index interaction edges and reusable fact views once per canonical revision instead of rebuilding them for every projection request.",
    );
  }
  if (reasons.length === 0) {
    reasons.push("Every hard invariant, primary proxy, and cost ceiling passed.");
    return {
      label: "supported",
      reasons,
      boundedRevisionHypotheses: [],
    };
  }
  return {
    label: "revise",
    reasons,
    boundedRevisionHypotheses: hypotheses,
  };
}

export async function evaluateBattleProjectionPoc(input: {
  fixturePath?: string;
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<ProjectionEvaluationReport> {
  const fixturePath = path.resolve(input.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = validateFixtureFile(JSON.parse(fixtureText) as unknown);
  const repetitions = input.repetitions ?? fixture.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }

  const corpusPath = path.resolve(repositoryRoot, fixture.baseline.corpusPath);
  const baselinePath = path.resolve(repositoryRoot, fixture.baseline.reportPath);
  const [corpusText, baselineText] = await Promise.all([
    fs.readFile(corpusPath, "utf8"),
    fs.readFile(baselinePath, "utf8"),
  ]);
  const corpusActualSha256 = sha256(corpusText);
  const baselineActualSha256 = sha256(baselineText);
  if (corpusActualSha256 !== fixture.baseline.corpusSha256) {
    throw new Error("frozen projection corpus hash mismatch");
  }
  if (baselineActualSha256 !== fixture.baseline.reportSha256) {
    throw new Error("frozen projection baseline report hash mismatch");
  }

  const baseline = JSON.parse(baselineText) as {
    localScenarios: Array<{ id: string; outcomeDigest: string }>;
  };
  const currentBaseline = await evaluateBattlePipelineBaseline({
    corpusPath,
    repetitions,
    now: () => new Date(fixture.frozenAt),
  });
  const frozenDigests = new Map(baseline.localScenarios.map((scenario) => [
    scenario.id,
    scenario.outcomeDigest,
  ]));
  const mismatchedScenarioIds = currentBaseline.localScenarios
    .filter((scenario) => frozenDigests.get(scenario.id) !== scenario.outcomeDigest)
    .map((scenario) => scenario.id);

  const aggregates = fixture.fixtures.map((projectionFixture) =>
    aggregateFixture({
      fixture: projectionFixture,
      repetitions,
    })
  );
  const allLatencies = aggregates.flatMap((aggregate) =>
    Array.from({ length: aggregate.repetitions }, () => aggregate.latencyMs.p95)
  );
  const expectedClaims = aggregates.reduce(
    (sum, aggregate) => sum + aggregate.expectedDecisiveClaimCount,
    0,
  );
  const matchedClaims = aggregates.reduce(
    (sum, aggregate) => sum + aggregate.matchedDecisiveClaimCount,
    0,
  );
  const fullBytes = aggregates.reduce(
    (sum, aggregate) => sum + aggregate.fullInputBytes * aggregate.repetitions,
    0,
  );
  const projectionBytes = aggregates.reduce(
    (sum, aggregate) => sum + aggregate.projectionBytes.mean * aggregate.repetitions,
    0,
  );
  const countHard = (key: keyof FixtureAggregate["hardFailures"]) =>
    aggregates.reduce((sum, aggregate) => sum + aggregate.hardFailures[key], 0);
  const schemaFailureCount = countHard("schema");
  const sourceMutationCount = countHard("sourceMutation");
  const identityLeakageCount = countHard("identityLeakage");
  const observerIsolationViolationCount = countHard("observerIsolation");
  const limitViolationCount = countHard("limitViolation");
  const baselineOutcomeMismatchCount = mismatchedScenarioIds.length +
    countHard("outcomeMismatch");
  const decisiveFactRecall = expectedClaims === 0
    ? 0
    : round(matchedClaims / expectedClaims);
  const irrelevantFactByteReduction = fullBytes === 0
    ? 0
    : round(1 - projectionBytes / fullBytes);
  const p95ProjectionLatencyMs = round(percentile(allLatencies, 95));
  const hardInvariantsPass = schemaFailureCount === 0 &&
    sourceMutationCount === 0 &&
    identityLeakageCount === fixture.thresholds.identityLeakageCount &&
    observerIsolationViolationCount ===
      fixture.thresholds.observerIsolationViolationCount &&
    limitViolationCount === 0 &&
    baselineOutcomeMismatchCount ===
      fixture.thresholds.baselineOutcomeMismatchCount;
  const aggregate: ProjectionEvaluationReport["aggregate"] = {
    schemaFailureCount,
    sourceMutationCount,
    identityLeakageCount,
    observerIsolationViolationCount,
    limitViolationCount,
    baselineOutcomeMismatchCount,
    decisiveFactRecall,
    irrelevantFactByteReduction,
    p95ProjectionLatencyMs,
    hardInvariantsPass,
    decisiveFactRecallPass:
      decisiveFactRecall >= fixture.thresholds.decisiveFactRecallMinimum,
    irrelevantFactByteReductionPass:
      irrelevantFactByteReduction >=
        fixture.thresholds.irrelevantFactByteReductionMinimum,
    projectionLatencyPass:
      p95ProjectionLatencyMs <=
        fixture.thresholds.p95ProjectionLatencyMsMaximum,
  };

  const evaluatorPath = fileURLToPath(import.meta.url);
  const projectionSourcePath = path.join(
    repositoryRoot,
    "packages/shared/src/battle-projection.ts",
  );
  const [evaluatorText, projectionSourceText] = await Promise.all([
    fs.readFile(evaluatorPath, "utf8"),
    fs.readFile(projectionSourcePath, "utf8"),
  ]);
  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "projection_poc_evaluation",
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: sha256(fixtureText),
      corpusPath: fixture.baseline.corpusPath,
      corpusExpectedSha256: fixture.baseline.corpusSha256,
      corpusActualSha256,
      baselineReportPath: fixture.baseline.reportPath,
      baselineExpectedSha256: fixture.baseline.reportSha256,
      baselineActualSha256,
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
      projectionSourcePath: path.relative(repositoryRoot, projectionSourcePath),
      projectionSourceSha256: sha256(projectionSourceText),
    },
    execution: {
      repetitionsPerFixture: repetitions,
      fixtureCount: fixture.fixtures.length,
      projectionReads: repetitions * fixture.fixtures.length,
      externalLlmCallsMade: 0,
      xaiUsed: false,
      xaiReason:
        "The frozen projection thresholds are fully measurable from explicit structured ground truth; an LLM judgment would add noise rather than resolve an unmeasured semantic output.",
      projectionLimits: BATTLE_PROJECTION_DEFAULT_LIMITS,
    },
    thresholds: fixture.thresholds,
    baselineOutcomeComparison: {
      scenarioCount: currentBaseline.localScenarios.length,
      mismatchCount: mismatchedScenarioIds.length,
      mismatchedScenarioIds,
    },
    fixtures: aggregates,
    aggregate,
    decision: decisionFor({ aggregate }),
    limitations: [
      "Decisive-fact recall is measured against explicit seeded claims, not every implicit dependency in arbitrary prose.",
      "Byte reduction compares a slice with serialized BattleState and is a context-size proxy, not proof that every omitted byte is irrelevant.",
      "Projection latency is machine-specific and is meaningful only against the frozen local ceiling on this environment.",
      "The PoC is read-only and not wired into live LLM prompts, so this evaluation does not measure end-to-end narrative plausibility.",
      "No XAI call was needed because this intervention produces structured slices rather than competing semantic or narrative outputs.",
      "A supported proxy result would not prove an objectively correct final battle result.",
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
  const report = await evaluateBattleProjectionPoc({
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
    console.error(`[battle-projection-poc] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
