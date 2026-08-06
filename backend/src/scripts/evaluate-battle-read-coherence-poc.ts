import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  ConsistencyRepairPlanSchema,
  ConsistencySliceSchema,
  ShadowCanonicalFactSchema,
  checkPurposeScopedConsistencySlice,
  runShadowConsistencyRepair,
  type ConsistencyRepairPlan,
  type ConsistencySlice,
  type ReadCoherenceLimits,
  type ShadowCanonicalFact,
  type ShadowReadRepairRun,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-read-coherence-fixtures-v1.json",
);

type ReadLevel = "unchecked" | "locally_coherent" | "conflicted" | "repaired";
type RunOutcome = ShadowReadRepairRun["outcome"];

type Thresholds = {
  conflictDetectionRecallMinimum: number;
  falseConflictRateMaximum: number;
  blockingConflictReductionMinimum: number;
  usableReadSuccessMinimum: number;
  correctSelectionRateMinimum: number;
  incorrectFactSelectionCountMaximum: number;
  causalRegressionCountMaximum: number;
  unnecessaryRepairRateMaximum: number;
  unknownFallbackRateMaximum: number;
  outOfScopeMutationCountMaximum: number;
  publicHistoryRewriteCountMaximum: number;
  sourceMutationCountMaximum: number;
  authorityRegressionCountMaximum: number;
  repeatedRepairLoopCountMaximum: number;
  limitViolationCountMaximum: number;
  externalLlmCallCountMaximum: number;
  p95LatencyMsMaximum: number;
};

type ScenarioFixture = {
  id: string;
  runner: string;
  expectedInitialLevel: ReadLevel;
  expectedOutcome: RunOutcome;
  expectedFinalLevel: ReadLevel;
  expectedRetainedFactRef?: string;
  expectedUnknownFallback: boolean;
  expectedRepair: boolean;
  expectedUsable: boolean;
};

type FixtureFile = {
  schemaVersion: 1;
  fixtureVersion: string;
  frozenAt: string;
  repetitions: number;
  thresholds: Thresholds;
  scenarios: ScenarioFixture[];
};

type ScenarioInput = {
  slice: ConsistencySlice;
  facts: ShadowCanonicalFact[];
  plans: ConsistencyRepairPlan[];
  limits?: Partial<ReadCoherenceLimits>;
};

type ScenarioObservation = {
  initialLevel: ReadLevel;
  outcome: RunOutcome;
  finalLevel: ReadLevel;
  initialBlockingConflicts: number;
  finalBlockingConflicts: number;
  detectedExpectedConflict: number;
  falseConflict: number;
  usableReadSuccess: number;
  usableReadExpected: number;
  selectionCorrect: number;
  selectionExpected: number;
  incorrectFactSelections: number;
  causalRegressions: number;
  unnecessaryRepairs: number;
  unnecessaryRepairOpportunities: number;
  unknownFallbacks: number;
  successfulRepairs: number;
  outOfScopeMutations: number;
  publicHistoryRewrites: number;
  sourceMutations: number;
  authorityRegressions: number;
  repeatedRepairLoops: number;
  limitViolations: number;
  externalLlmCalls: number;
  attemptsUsed: number;
  appliedPatchCount: number;
  touchedFactCount: number;
  retainedFactRefs: string[];
  latencyMs: number;
};

type ScenarioAggregate = {
  id: string;
  repetitions: number;
  initialLevelAccuracy: number;
  outcomeAccuracy: number;
  finalLevelAccuracy: number;
  conflictDetectionRecall: number | null;
  falseConflictRate: number | null;
  blockingConflictReduction: number | null;
  usableReadSuccess: number | null;
  correctSelectionRate: number | null;
  incorrectFactSelectionCount: number;
  causalRegressionCount: number;
  unnecessaryRepairRate: number | null;
  unknownFallbackRate: number | null;
  outOfScopeMutationCount: number;
  publicHistoryRewriteCount: number;
  sourceMutationCount: number;
  authorityRegressionCount: number;
  repeatedRepairLoopCount: number;
  limitViolationCount: number;
  externalLlmCallCount: number;
  latencyMs: { mean: number; p95: number; maximum: number };
  attemptsUsed: number;
  appliedPatchCount: number;
  touchedFactCount: number;
  retainedFactRefs: string[];
};

export type ReadCoherenceEvaluationReport = {
  schemaVersion: 1;
  fixtureVersion: string;
  generatedAt: string;
  mode: "read_coherence_poc_evaluation";
  provenance: {
    gitHead: string;
    workingTreeDirty: boolean;
    nodeVersion: string;
    fixturePath: string;
    fixtureSha256: string;
    evaluatorPath: string;
    evaluatorSha256: string;
    readSourcePath: string;
    readSourceSha256: string;
  };
  execution: {
    repetitionsPerScenario: number;
    scenarioCount: number;
    scenarioRuns: number;
    externalLlmCallsMade: 0;
    xaiUsed: false;
    xaiReason: string;
  };
  thresholds: Thresholds;
  scenarios: ScenarioAggregate[];
  staticAuthorityCheck: {
    runtimeIntegrationFileRefs: string[];
    exportedCanonicalWriteFunctionCount: number;
  };
  aggregate: Omit<ScenarioAggregate, "id" | "repetitions" | "latencyMs" |
    "initialLevelAccuracy" | "outcomeAccuracy" | "finalLevelAccuracy" |
    "attemptsUsed" | "appliedPatchCount" | "touchedFactCount" |
    "retainedFactRefs"> & {
      latencyP95Ms: number;
      hardInvariantsPass: boolean;
      effectivenessThresholdsPass: boolean;
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

function round(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function optionalRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : ratio(numerator, denominator);
}

function percentile(values: number[], proportion: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)]!;
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

function gitLines(args: string[]): string[] {
  try {
    const output = gitOutput(args);
    return output ? output.split("\n") : [];
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 1) {
      return [];
    }
    throw error;
  }
}

function fact(input: {
  id: string;
  predicate?: string;
  objectRef: string;
  turn: number;
  sourceRef: string;
  subsystem?: "semantic" | "world" | "repair";
  authority?:
    | "validated_semantic_transition"
    | "validated_world_transition"
    | "repair";
}): ShadowCanonicalFact {
  return ShadowCanonicalFactSchema.parse({
    id: input.id,
    subjectRef: "object.anchor",
    predicate: input.predicate ?? "state.location",
    objectRef: input.objectRef,
    validFrom: { turn: input.turn },
    provenance: {
      subsystem: input.subsystem ?? "semantic",
      authority: input.authority ?? "validated_semantic_transition",
      sourceRef: input.sourceRef,
      sourceEventRefs: [input.sourceRef],
    },
  });
}

function projectionSource(fact: ShadowCanonicalFact): string {
  if (fact.provenance.subsystem === "free_action") return "event";
  return fact.provenance.subsystem;
}

function plan(input: {
  repairRef: string;
  strategy: ConsistencyRepairPlan["strategy"];
  factRefs: string[];
  issueRef?: string;
  replacement?: { subjectRef: string; predicate: string; objectRef?: string };
}): ConsistencyRepairPlan {
  return ConsistencyRepairPlanSchema.parse({
    repairRef: input.repairRef,
    issueRef: input.issueRef,
    turn: 5,
    conflictFactRefs: input.factRefs,
    strategy: input.strategy,
    ...(input.strategy === "reinterpret"
      ? { replacement: input.replacement }
      : {}),
  });
}

function slice(input: {
  facts: ShadowCanonicalFact[];
  causalRelations: Record<string, "created" | "modified" | "triggered">;
  truncated?: boolean;
  includeConflictIssue?: boolean;
  issueRef?: string;
}): ConsistencySlice {
  const entityRefs = [
    "object.anchor",
    ...input.facts.flatMap((item) => item.objectRef ? [item.objectRef] : []),
    "location.between",
  ];
  const factRefs = input.facts.map((item) => item.id);
  return ConsistencySliceSchema.parse({
    schemaVersion: 2,
    purpose: "adjudication",
    scope: {
      anchorRefs: ["object.anchor"],
      entityRefs: [...new Set(entityRefs)],
      processRefs: [],
      traversedKinds: ["containment", "causal_dependency"],
      temporalWindow: { fromTurn: 0, toTurn: 5 },
      truncated: input.truncated ?? false,
      omitted: {
        entities: input.truncated ? 1 : 0,
        facts: 0,
        rules: 0,
        historyTurns: 0,
      },
    },
    factGroups: [{
      subjectRef: "object.anchor",
      facts: input.facts.map((item) => [
        item.id,
        item.predicate,
        item.objectRef ?? null,
        item.validFrom.turn,
        item.validTo?.turn ?? null,
        projectionSource(item),
      ]),
    }],
    causalLinks: input.facts.map((item) => [
      item.provenance.sourceRef,
      item.id,
      input.causalRelations[item.id] ?? "created",
    ]),
    issues: input.includeConflictIssue === false
      ? [{
          id: "issue.unrelated",
          involvedFactRefs: ["fact.remote"],
          involvedEntityRefs: ["location.remote"],
          blocksPurposes: ["adjudication"],
          status: "open",
        }]
      : [{
          id: input.issueRef ?? "issue.conflict",
          involvedFactRefs: factRefs,
          involvedEntityRefs: ["object.anchor"],
          blocksPurposes: ["adjudication"],
          status: "open",
        }],
    applicableRuleRefs: ["battle.rule.world-reference-integrity-v1"],
  });
}

function directConflict(input?: {
  firstId?: string;
  secondId?: string;
  firstTurn?: number;
  secondTurn?: number;
  firstRelation?: "created" | "modified" | "triggered";
  secondRelation?: "created" | "modified" | "triggered";
  firstAuthority?: "validated_semantic_transition" | "repair";
  secondAuthority?: "validated_semantic_transition" | "repair";
}): { facts: ShadowCanonicalFact[]; slice: ConsistencySlice; refs: string[] } {
  const first = fact({
    id: input?.firstId ?? "fact.location.held",
    objectRef: "character.a",
    turn: input?.firstTurn ?? 1,
    sourceRef: "event.first",
    subsystem: input?.firstAuthority === "repair" ? "repair" : "semantic",
    authority: input?.firstAuthority ?? "validated_semantic_transition",
  });
  const second = fact({
    id: input?.secondId ?? "fact.location.floor",
    objectRef: "location.floor",
    turn: input?.secondTurn ?? 2,
    sourceRef: "event.second",
    subsystem: input?.secondAuthority === "repair" ? "repair" : "semantic",
    authority: input?.secondAuthority ?? "validated_semantic_transition",
  });
  const facts = [first, second];
  return {
    facts,
    refs: facts.map((item) => item.id),
    slice: slice({
      facts,
      causalRelations: {
        [first.id]: input?.firstRelation ?? "created",
        [second.id]: input?.secondRelation ?? "modified",
      },
    }),
  };
}

function scenarioInput(runner: string): ScenarioInput {
  if (runner === "already_coherent_noop") {
    const facts = [fact({
      id: "fact.location.single",
      objectRef: "location.floor",
      turn: 1,
      sourceRef: "event.single",
    })];
    return {
      facts,
      slice: slice({
        facts,
        causalRelations: { "fact.location.single": "created" },
        includeConflictIssue: false,
      }),
      plans: [],
    };
  }
  if (runner === "causal_strength_recency_trap") {
    const base = directConflict({
      firstId: "fact.position.causally-supported",
      secondId: "fact.position.recent-weak",
      firstTurn: 2,
      secondTurn: 3,
      firstRelation: "modified",
      secondRelation: "created",
      secondAuthority: "repair",
    });
    return {
      ...base,
      plans: [plan({
        repairRef: "repair:eval.recency-trap.select",
        strategy: "select",
        factRefs: base.refs,
        issueRef: "issue.conflict",
      })],
    };
  }
  const base = runner === "ambiguous_selection_to_unknown"
    ? directConflict({ secondTurn: 1, secondRelation: "created" })
    : directConflict();
  if (runner === "later_causal_selection") {
    return {
      ...base,
      plans: [plan({
        repairRef: "repair:eval.later.select",
        strategy: "select",
        factRefs: base.refs,
        issueRef: "issue.conflict",
      })],
    };
  }
  if (runner === "ambiguous_selection_to_unknown") {
    return {
      ...base,
      plans: [
        plan({
          repairRef: "repair:eval.ambiguous.select",
          strategy: "select",
          factRefs: base.refs,
          issueRef: "issue.conflict",
        }),
        plan({
          repairRef: "repair:eval.ambiguous.unknown",
          strategy: "reset_unknown",
          factRefs: base.refs,
          issueRef: "issue.conflict",
        }),
      ],
    };
  }
  if (runner === "truncated_slice_fail_closed") {
    return {
      ...base,
      slice: ConsistencySliceSchema.parse({
        ...base.slice,
        scope: {
          ...base.slice.scope,
          truncated: true,
          omitted: { ...base.slice.scope.omitted, entities: 1 },
        },
      }),
      plans: [plan({
        repairRef: "repair:eval.truncated.unknown",
        strategy: "reset_unknown",
        factRefs: base.refs,
        issueRef: "issue.conflict",
      })],
    };
  }
  const invalid = plan({
    repairRef: `repair:eval.${runner}.outside`,
    strategy: "reinterpret",
    factRefs: base.refs,
    issueRef: "issue.conflict",
    replacement: {
      subjectRef: "object.anchor",
      predicate: "state.location",
      objectRef: "location.outside-scope",
    },
  });
  const unknown = plan({
    repairRef: `repair:eval.${runner}.unknown`,
    strategy: "reset_unknown",
    factRefs: base.refs,
    issueRef: "issue.conflict",
  });
  if (runner === "scope_expansion_to_unknown") {
    return { ...base, plans: [invalid, unknown] };
  }
  if (runner === "attempt_cap_preserves_conflict") {
    return {
      ...base,
      plans: [invalid, unknown],
      limits: { maxAttempts: 1, maxRepairCalls: 1, maxTouchedFacts: 8 },
    };
  }
  throw new Error(`unknown read-coherence scenario runner: ${runner}`);
}

function blockingConflictCount(check: ReturnType<
  typeof checkPurposeScopedConsistencySlice
>): number {
  const conflictFactRefs = new Set(
    check.conflicts.flatMap((conflict) => conflict.factRefs),
  );
  const additionalIssues = check.value.issues.filter((issue) =>
    check.blockingIssueRefs.includes(issue.id) &&
    !issue.involvedFactRefs.some((ref) => conflictFactRefs.has(ref))
  ).length;
  return check.conflicts.length + additionalIssues;
}

function hasUnknownFallback(run: ShadowReadRepairRun): boolean {
  return run.appliedPatches.some((patch) => patch.assertions.some((assertion) =>
    assertion.value !== null &&
    typeof assertion.value === "object" &&
    !Array.isArray(assertion.value) &&
    assertion.value.repairState === "unknown"
  ));
}

function scopeMutationCount(input: ScenarioInput, run: ShadowReadRepairRun): number {
  const checkedFacts = new Set(
    input.slice.factGroups.flatMap((group) => group.facts.map((row) => row[0])),
  );
  const checkedEntities = new Set(input.slice.scope.entityRefs);
  return run.appliedPatches.reduce((count, patch) => count +
    patch.retractions.filter((ref) => !checkedFacts.has(ref)).length +
    patch.assertions.filter((assertion) =>
      !checkedEntities.has(assertion.subjectRef) ||
      (assertion.objectRef !== undefined && !checkedEntities.has(assertion.objectRef))
    ).length +
    patch.touchedRefs.filter((ref) => !checkedEntities.has(ref)).length, 0);
}

function authorityRegressionCount(run: ShadowReadRepairRun): number {
  return run.appliedPatches.reduce((count, patch) => count +
    (patch.sourceRef.startsWith("repair:") ? 0 : 1) +
    patch.assertions.filter((assertion) =>
      assertion.provenance.subsystem !== "repair" ||
      assertion.provenance.authority !== "repair" ||
      assertion.provenance.sourceRef !== patch.sourceRef
    ).length, 0);
}

function repeatedLoopCount(run: ShadowReadRepairRun): number {
  const patchDigests = run.appliedPatches.map(digest);
  return patchDigests.length - new Set(patchDigests).size;
}

function limitViolationCount(
  input: ScenarioInput,
  run: ShadowReadRepairRun,
): number {
  const limits = {
    maxAttempts: input.limits?.maxAttempts ?? 3,
    maxRepairCalls: input.limits?.maxRepairCalls ?? 3,
    maxTouchedFacts: input.limits?.maxTouchedFacts ?? 8,
  };
  return Number(run.attemptsUsed > limits.maxAttempts) +
    Number(run.repairCallsUsed > limits.maxRepairCalls) +
    Number(run.totalTouchedFacts > limits.maxTouchedFacts) +
    run.attempts.reduce((count, attempt) => count +
      (attempt.status === "proposed" &&
          attempt.patch.retractions.length + attempt.patch.assertions.length >
            limits.maxTouchedFacts
        ? 1
        : 0), 0);
}

function observeScenario(fixture: ScenarioFixture): ScenarioObservation {
  const input = scenarioInput(fixture.runner);
  const beforeSlice = digest(input.slice);
  const beforeFacts = digest(input.facts);
  const initial = checkPurposeScopedConsistencySlice(input.slice);
  const started = performance.now();
  const run = runShadowConsistencyRepair({
    slice: input.slice,
    currentFacts: input.facts,
    plans: input.plans,
    allowShadowRepair: true,
    limits: input.limits,
  });
  const latencyMs = performance.now() - started;
  const retainedFactRefs = run.attempts.flatMap((attempt) =>
    attempt.status === "proposed" && attempt.strategy === "select"
      ? attempt.retainedFactRefs
      : []
  );
  const selectionExpected = fixture.expectedRetainedFactRef ? 1 : 0;
  const selectionCorrect = fixture.expectedRetainedFactRef &&
      retainedFactRefs.includes(fixture.expectedRetainedFactRef)
    ? 1
    : 0;
  const selectedWrong = selectionExpected === 1 && selectionCorrect === 0 ? 1 : 0;
  const unknown = hasUnknownFallback(run);
  const expectedCompleteConflict = fixture.expectedInitialLevel === "conflicted";
  const expectedCoherent = fixture.expectedInitialLevel === "locally_coherent";
  const usable = run.final.consistency.level === "locally_coherent" ||
    run.final.consistency.level === "repaired";
  const successfulRepair = run.appliedPatches.length > 0 && usable;
  const publicHistoryRewrites = digest(input.facts) === beforeFacts
    ? run.appliedPatches.reduce((count, patch) => count +
        patch.assertions.filter((assertion) => assertion.validTo !== undefined).length, 0)
    : 1;
  return {
    initialLevel: initial.consistency.level,
    outcome: run.outcome,
    finalLevel: run.final.consistency.level,
    initialBlockingConflicts: expectedCompleteConflict
      ? blockingConflictCount(initial)
      : 0,
    finalBlockingConflicts: expectedCompleteConflict
      ? blockingConflictCount(run.final)
      : 0,
    detectedExpectedConflict: expectedCompleteConflict && initial.conflicts.length > 0
      ? 1
      : 0,
    falseConflict: expectedCoherent && initial.conflicts.length > 0 ? 1 : 0,
    usableReadSuccess: fixture.expectedUsable && usable ? 1 : 0,
    usableReadExpected: fixture.expectedUsable ? 1 : 0,
    selectionCorrect,
    selectionExpected,
    incorrectFactSelections: selectedWrong,
    causalRegressions: selectedWrong,
    unnecessaryRepairs: expectedCoherent && run.appliedPatches.length > 0 ? 1 : 0,
    unnecessaryRepairOpportunities: expectedCoherent ? 1 : 0,
    unknownFallbacks: successfulRepair && unknown ? 1 : 0,
    successfulRepairs: successfulRepair ? 1 : 0,
    outOfScopeMutations: scopeMutationCount(input, run),
    publicHistoryRewrites,
    sourceMutations: Number(
      digest(input.slice) !== beforeSlice || digest(input.facts) !== beforeFacts,
    ),
    authorityRegressions: authorityRegressionCount(run),
    repeatedRepairLoops: repeatedLoopCount(run),
    limitViolations: limitViolationCount(input, run),
    externalLlmCalls: run.externalLlmCallsMade,
    attemptsUsed: run.attemptsUsed,
    appliedPatchCount: run.appliedPatches.length,
    touchedFactCount: run.totalTouchedFacts,
    retainedFactRefs,
    latencyMs,
  };
}

function aggregateScenario(
  fixture: ScenarioFixture,
  observations: ScenarioObservation[],
): ScenarioAggregate {
  const sum = (read: (item: ScenarioObservation) => number) =>
    observations.reduce((total, item) => total + read(item), 0);
  const initialBlockers = sum((item) => item.initialBlockingConflicts);
  const finalBlockers = sum((item) => item.finalBlockingConflicts);
  const expectedConflicts = fixture.expectedInitialLevel === "conflicted"
    ? observations.length
    : 0;
  const expectedCoherent = fixture.expectedInitialLevel === "locally_coherent"
    ? observations.length
    : 0;
  const successfulRepairs = sum((item) => item.successfulRepairs);
  const latencies = observations.map((item) => item.latencyMs);
  return {
    id: fixture.id,
    repetitions: observations.length,
    initialLevelAccuracy: ratio(
      observations.filter((item) => item.initialLevel === fixture.expectedInitialLevel).length,
      observations.length,
    ),
    outcomeAccuracy: ratio(
      observations.filter((item) => item.outcome === fixture.expectedOutcome).length,
      observations.length,
    ),
    finalLevelAccuracy: ratio(
      observations.filter((item) => item.finalLevel === fixture.expectedFinalLevel).length,
      observations.length,
    ),
    conflictDetectionRecall: optionalRatio(
      sum((item) => item.detectedExpectedConflict),
      expectedConflicts,
    ),
    falseConflictRate: optionalRatio(sum((item) => item.falseConflict), expectedCoherent),
    blockingConflictReduction: initialBlockers === 0
      ? null
      : round((initialBlockers - finalBlockers) / initialBlockers),
    usableReadSuccess: optionalRatio(
      sum((item) => item.usableReadSuccess),
      sum((item) => item.usableReadExpected),
    ),
    correctSelectionRate: optionalRatio(
      sum((item) => item.selectionCorrect),
      sum((item) => item.selectionExpected),
    ),
    incorrectFactSelectionCount: sum((item) => item.incorrectFactSelections),
    causalRegressionCount: sum((item) => item.causalRegressions),
    unnecessaryRepairRate: optionalRatio(
      sum((item) => item.unnecessaryRepairs),
      sum((item) => item.unnecessaryRepairOpportunities),
    ),
    unknownFallbackRate: optionalRatio(
      sum((item) => item.unknownFallbacks),
      successfulRepairs,
    ),
    outOfScopeMutationCount: sum((item) => item.outOfScopeMutations),
    publicHistoryRewriteCount: sum((item) => item.publicHistoryRewrites),
    sourceMutationCount: sum((item) => item.sourceMutations),
    authorityRegressionCount: sum((item) => item.authorityRegressions),
    repeatedRepairLoopCount: sum((item) => item.repeatedRepairLoops),
    limitViolationCount: sum((item) => item.limitViolations),
    externalLlmCallCount: sum((item) => item.externalLlmCalls),
    latencyMs: {
      mean: round(mean(latencies)),
      p95: round(percentile(latencies, 0.95)),
      maximum: round(Math.max(...latencies)),
    },
    attemptsUsed: sum((item) => item.attemptsUsed),
    appliedPatchCount: sum((item) => item.appliedPatchCount),
    touchedFactCount: sum((item) => item.touchedFactCount),
    retainedFactRefs: [...new Set(observations.flatMap((item) => item.retainedFactRefs))]
      .sort((left, right) => left.localeCompare(right)),
  };
}

function staticAuthorityCheck(): ReadCoherenceEvaluationReport["staticAuthorityCheck"] {
  const allowed = new Set([
    "backend/src/scripts/evaluate-battle-read-coherence-poc.test.ts",
    "backend/src/scripts/evaluate-battle-read-coherence-poc.ts",
    "packages/shared/src/battle-read-coherence.test.ts",
    "packages/shared/src/battle-read-coherence.ts",
    "packages/shared/src/index.ts",
  ]);
  const refs = gitLines([
    "grep",
    "-l",
    "runShadowConsistencyRepair\\|proposeShadowConsistencyRepair",
    "--",
    "*.ts",
  ]).filter((file) => !allowed.has(file));
  const source = execFileSync("git", ["show", "HEAD:packages/shared/src/battle-read-coherence.ts"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const exportedWrites = source.match(
    /export function\s+(?:commit|persist|writeCanonical|applyCanonical)[A-Za-z0-9_]*/gu,
  ) ?? [];
  return {
    runtimeIntegrationFileRefs: refs,
    exportedCanonicalWriteFunctionCount: exportedWrites.length,
  };
}

function passThreshold(value: number, threshold: number, direction: "min" | "max"): boolean {
  return direction === "min" ? value >= threshold : value <= threshold;
}

export async function evaluateReadCoherencePoc(input?: {
  fixturePath?: string;
  repetitions?: number;
}): Promise<ReadCoherenceEvaluationReport> {
  const fixturePath = path.resolve(input?.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = JSON.parse(fixtureText) as FixtureFile;
  if (fixture.schemaVersion !== 1 || fixture.scenarios.length === 0) {
    throw new Error("invalid or empty read-coherence fixture");
  }
  const repetitions = input?.repetitions ?? fixture.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const scenarioObservations = fixture.scenarios.map((scenario) => ({
    fixture: scenario,
    observations: Array.from({ length: repetitions }, () => observeScenario(scenario)),
  }));
  const scenarios = scenarioObservations.map(({ fixture: scenario, observations }) =>
    aggregateScenario(scenario, observations)
  );
  const observations = scenarioObservations.flatMap((item) => item.observations);
  const sum = (read: (item: ScenarioObservation) => number) =>
    observations.reduce((total, item) => total + read(item), 0);
  const expectedConflictCount = fixture.scenarios.filter((scenario) =>
    scenario.expectedInitialLevel === "conflicted"
  ).length * repetitions;
  const coherentCount = fixture.scenarios.filter((scenario) =>
    scenario.expectedInitialLevel === "locally_coherent"
  ).length * repetitions;
  const selectionCount = sum((item) => item.selectionExpected);
  const successfulRepairs = sum((item) => item.successfulRepairs);
  const initialBlockers = sum((item) => item.initialBlockingConflicts);
  const finalBlockers = sum((item) => item.finalBlockingConflicts);
  const latencies = observations.map((item) => item.latencyMs);
  const aggregateBase = {
    conflictDetectionRecall: ratio(
      sum((item) => item.detectedExpectedConflict),
      expectedConflictCount,
    ),
    falseConflictRate: ratio(sum((item) => item.falseConflict), coherentCount),
    blockingConflictReduction: ratio(
      initialBlockers - finalBlockers,
      initialBlockers,
    ),
    usableReadSuccess: ratio(
      sum((item) => item.usableReadSuccess),
      sum((item) => item.usableReadExpected),
    ),
    correctSelectionRate: ratio(sum((item) => item.selectionCorrect), selectionCount),
    incorrectFactSelectionCount: sum((item) => item.incorrectFactSelections),
    causalRegressionCount: sum((item) => item.causalRegressions),
    unnecessaryRepairRate: ratio(
      sum((item) => item.unnecessaryRepairs),
      sum((item) => item.unnecessaryRepairOpportunities),
    ),
    unknownFallbackRate: ratio(sum((item) => item.unknownFallbacks), successfulRepairs),
    outOfScopeMutationCount: sum((item) => item.outOfScopeMutations),
    publicHistoryRewriteCount: sum((item) => item.publicHistoryRewrites),
    sourceMutationCount: sum((item) => item.sourceMutations),
    authorityRegressionCount: sum((item) => item.authorityRegressions),
    repeatedRepairLoopCount: sum((item) => item.repeatedRepairLoops),
    limitViolationCount: sum((item) => item.limitViolations),
    externalLlmCallCount: sum((item) => item.externalLlmCalls),
  };
  const authority = staticAuthorityCheck();
  const hardInvariantsPass =
    passThreshold(aggregateBase.outOfScopeMutationCount, fixture.thresholds.outOfScopeMutationCountMaximum, "max") &&
    passThreshold(aggregateBase.publicHistoryRewriteCount, fixture.thresholds.publicHistoryRewriteCountMaximum, "max") &&
    passThreshold(aggregateBase.sourceMutationCount, fixture.thresholds.sourceMutationCountMaximum, "max") &&
    passThreshold(aggregateBase.authorityRegressionCount, fixture.thresholds.authorityRegressionCountMaximum, "max") &&
    passThreshold(aggregateBase.limitViolationCount, fixture.thresholds.limitViolationCountMaximum, "max") &&
    passThreshold(aggregateBase.externalLlmCallCount, fixture.thresholds.externalLlmCallCountMaximum, "max") &&
    authority.runtimeIntegrationFileRefs.length === 0 &&
    authority.exportedCanonicalWriteFunctionCount === 0;
  const latencyP95Ms = round(percentile(latencies, 0.95));
  const effectivenessThresholdsPass =
    passThreshold(aggregateBase.conflictDetectionRecall, fixture.thresholds.conflictDetectionRecallMinimum, "min") &&
    passThreshold(aggregateBase.falseConflictRate, fixture.thresholds.falseConflictRateMaximum, "max") &&
    passThreshold(aggregateBase.blockingConflictReduction, fixture.thresholds.blockingConflictReductionMinimum, "min") &&
    passThreshold(aggregateBase.usableReadSuccess, fixture.thresholds.usableReadSuccessMinimum, "min") &&
    passThreshold(aggregateBase.correctSelectionRate, fixture.thresholds.correctSelectionRateMinimum, "min") &&
    passThreshold(aggregateBase.incorrectFactSelectionCount, fixture.thresholds.incorrectFactSelectionCountMaximum, "max") &&
    passThreshold(aggregateBase.causalRegressionCount, fixture.thresholds.causalRegressionCountMaximum, "max") &&
    passThreshold(aggregateBase.unnecessaryRepairRate, fixture.thresholds.unnecessaryRepairRateMaximum, "max") &&
    passThreshold(aggregateBase.unknownFallbackRate, fixture.thresholds.unknownFallbackRateMaximum, "max") &&
    passThreshold(aggregateBase.repeatedRepairLoopCount, fixture.thresholds.repeatedRepairLoopCountMaximum, "max") &&
    passThreshold(latencyP95Ms, fixture.thresholds.p95LatencyMsMaximum, "max");
  const hasCoverage = expectedConflictCount > 0 && coherentCount > 0 &&
    selectionCount > 0 &&
    fixture.scenarios.some((scenario) => scenario.expectedUnknownFallback) &&
    fixture.scenarios.some((scenario) => scenario.expectedInitialLevel === "unchecked");
  const label = !hardInvariantsPass
    ? "unsupported"
    : !hasCoverage
      ? "indeterminate"
      : effectivenessThresholdsPass
        ? "supported"
        : "revise";
  const reasons = label === "supported"
    ? ["Every frozen read-coherence invariant and effectiveness threshold passed."]
    : label === "revise"
      ? ["Hard invariants passed, but at least one causal or effectiveness threshold failed."]
      : label === "unsupported"
        ? ["At least one scope, history, authority, immutability, or limit invariant failed."]
        : ["The frozen corpus lacks required decision coverage."];
  const boundedRevisionHypotheses: string[] = [];
  if (aggregateBase.correctSelectionRate < fixture.thresholds.correctSelectionRateMinimum) {
    boundedRevisionHypotheses.push(
      "Rank causal-link strength before bare validFrom recency, and reject selection when causal order remains incomparable.",
    );
  }
  if (aggregateBase.causalRegressionCount > fixture.thresholds.causalRegressionCountMaximum) {
    boundedRevisionHypotheses.push(
      "Add an explicit causally-weaker selection guard before a select patch can be proposed.",
    );
  }
  const evaluatorPath = "backend/src/scripts/evaluate-battle-read-coherence-poc.ts";
  const readSourcePath = "packages/shared/src/battle-read-coherence.ts";
  const gitHead = gitOutput(["rev-parse", "HEAD"]);
  const workingTreeDirty = gitOutput(["status", "--porcelain"]).length > 0;
  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: new Date().toISOString(),
    mode: "read_coherence_poc_evaluation",
    provenance: {
      gitHead,
      workingTreeDirty,
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: sha256(fixtureText),
      evaluatorPath,
      evaluatorSha256: sha256(await fs.readFile(path.join(repositoryRoot, evaluatorPath))),
      readSourcePath,
      readSourceSha256: sha256(await fs.readFile(path.join(repositoryRoot, readSourcePath))),
    },
    execution: {
      repetitionsPerScenario: repetitions,
      scenarioCount: fixture.scenarios.length,
      scenarioRuns: repetitions * fixture.scenarios.length,
      externalLlmCallsMade: 0,
      xaiUsed: false,
      xaiReason: "Conflict membership, causal preference, expected selection, and fallback states are frozen structured ground truth.",
    },
    thresholds: fixture.thresholds,
    scenarios,
    staticAuthorityCheck: authority,
    aggregate: {
      ...aggregateBase,
      latencyP95Ms,
      hardInvariantsPass,
      effectivenessThresholdsPass,
    },
    decision: { label, reasons, boundedRevisionHypotheses },
    limitations: [
      "The corpus covers direct structured slot conflicts, not arbitrary semantic contradictions.",
      "Frozen causal preference is explicit evaluator ground truth and does not generalize to every world rule.",
      "A locally coherent preview is a proxy and is counted as harm when it retains the frozen weaker fact.",
      "Latency is local process time on one host and excludes database, network, and production contention.",
      "Unknown and weakened PoC markers have no runtime consumer semantics.",
      "Static authority scanning is not a whole-program capability proof.",
      "No result proves global consistency or correct final battle outcomes.",
    ],
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let fixturePath = defaultFixturePath;
  let repetitions: number | undefined;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--fixtures") {
      fixturePath = path.resolve(repositoryRoot, args[++index]!);
    }
    else if (value === "--repetitions") repetitions = Number(args[++index]!);
    else if (value === "--output") {
      outputPath = path.resolve(repositoryRoot, args[++index]!);
    }
    else throw new Error(`unknown argument: ${value}`);
  }
  const report = await evaluateReadCoherencePoc({ fixturePath, repetitions });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    await fs.writeFile(outputPath, text, { flag: "wx" });
    process.stdout.write(`[battle-read-coherence-poc] wrote ${outputPath}\n`);
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
