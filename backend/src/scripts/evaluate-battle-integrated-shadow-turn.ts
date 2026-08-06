import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IntegratedShadowTurnInputSchema,
  IntegratedShadowTurnReceiptSchema,
  runIntegratedShadowTurnPoc,
  type IntegratedShadowTurnInput,
  type IntegratedShadowTurnReceipt,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultTranscriptPath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json",
);
const protocolPath = path.join(
  repositoryRoot,
  "docs/battle-pipeline-integrated-shadow-protocol.md",
);
const integratedSourcePath = path.join(
  repositoryRoot,
  "packages/shared/src/battle-integrated-shadow-turn.ts",
);
const worldSourcePath = path.join(
  repositoryRoot,
  "packages/shared/src/battle-world-process-poc.ts",
);

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export const INTEGRATED_SHADOW_EVALUATION_THRESHOLDS = {
  schemaValidityMinimum: 1,
  sourceMutationMaximum: 0,
  authoritativeOutcomeChangeMaximum: 0,
  canonicalCommitMaximum: 0,
  observerCanonicalIdentifierLeakMaximum: 0,
  outOfScopeRepairMutationMaximum: 0,
  danglingReferenceMaximum: 0,
  temporalAtomicityFailureMaximum: 0,
  expectedDependencyRecallMinimum: 1,
  componentReceiptCoverageMinimum: 1,
  explicitConflictOrUnknownHandlingMinimum: 1,
  distinctReceiptDigestsMaximumPerScenario: 1,
  integratedLocalP95MsMaximum: 50,
} as const;

const ThresholdsSchema = z.object({
  schemaValidityMinimum: z.literal(1),
  sourceMutationMaximum: z.literal(0),
  authoritativeOutcomeChangeMaximum: z.literal(0),
  canonicalCommitMaximum: z.literal(0),
  observerCanonicalIdentifierLeakMaximum: z.literal(0),
  outOfScopeRepairMutationMaximum: z.literal(0),
  danglingReferenceMaximum: z.literal(0),
  temporalAtomicityFailureMaximum: z.literal(0),
  expectedDependencyRecallMinimum: z.literal(1),
  componentReceiptCoverageMinimum: z.literal(1),
  explicitConflictOrUnknownHandlingMinimum: z.literal(1),
  distinctReceiptDigestsMaximumPerScenario: z.literal(1),
  integratedLocalP95MsMaximum: z.literal(50),
}).strict();

const AuthoritativeResultSchema = z.object({
  normalizedOutcome: z.unknown(),
  normalizedOutcomeDigest: DigestSchema,
}).passthrough();

const TranscriptScenarioSchema = z.object({
  id: z.string().min(1).max(120),
  stratum: z.enum([
    "ordinary_fast_action",
    "remote_rejection",
    "simultaneous_terminal_action",
    "interrupted_expanded_action",
    "active_world_process",
    "blocking_local_conflict",
    "exhausted_budget",
  ]),
  hypothesis: z.string().min(1),
  sourceBattleState: IntegratedShadowTurnInputSchema.shape.sourceBattleState,
  sourceBattleStateDigest:
    IntegratedShadowTurnInputSchema.shape.sourceBattleStateDigest,
  authoritativeResult: AuthoritativeResultSchema,
  characterInputs: IntegratedShadowTurnInputSchema.shape.characterInputs,
  worldInputs: IntegratedShadowTurnInputSchema.shape.worldInputs,
  consistencyInputs: IntegratedShadowTurnInputSchema.shape.consistencyInputs,
  expectedDependencies:
    IntegratedShadowTurnInputSchema.shape.expectedDependencies,
  expectedBoundaries: IntegratedShadowTurnInputSchema.shape.expectedBoundaries,
  callModel: IntegratedShadowTurnInputSchema.shape.callModel,
}).passthrough();
type TranscriptScenario = z.infer<typeof TranscriptScenarioSchema>;

const TranscriptReportSchema = z.object({
  fixtureVersion: z.string().min(1),
  scenarios: z.array(TranscriptScenarioSchema).length(7),
  integrity: z.object({
    algorithm: z.literal("sha256"),
    basis: z.literal("canonical report excluding integrity"),
    contentDigest: DigestSchema,
  }).strict(),
}).passthrough();

const StratumCheckSchema = z.object({
  id: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().min(1),
}).strict();

const RunEvidenceSchema = z.object({
  repetition: z.number().int().positive(),
  latencyMs: z.number().nonnegative(),
  receiptBytes: z.number().int().nonnegative(),
  receiptDigest: DigestSchema,
  schemaValid: z.boolean(),
  dependencyRecall: z.number().min(0).max(1),
  componentCoverage: z.number().min(0).max(1),
  conflictHandlingExplicit: z.boolean(),
  sourceMutated: z.boolean(),
  authoritativeOutcomeChanged: z.boolean(),
  canonicalCommitPerformed: z.boolean(),
  observerLeakCount: z.number().int().nonnegative(),
  outOfScopeRepairMutationCount: z.number().int().nonnegative(),
  danglingReferenceCount: z.number().int().nonnegative(),
  temporalAtomicityFailureCount: z.number().int().nonnegative(),
  externalLlmCallsMade: z.number().int().nonnegative(),
}).strict();

const ScenarioEvaluationSchema = z.object({
  id: z.string().min(1),
  stratum: TranscriptScenarioSchema.shape.stratum,
  hypothesis: z.string().min(1),
  runs: z.array(RunEvidenceSchema).min(1).max(100),
  representativeReceipt: IntegratedShadowTurnReceiptSchema,
  distinctReceiptDigests: z.number().int().positive(),
  p95LatencyMs: z.number().nonnegative(),
  minReceiptBytes: z.number().int().nonnegative(),
  maxReceiptBytes: z.number().int().nonnegative(),
  behaviorChecks: z.array(StratumCheckSchema).min(1),
  registeredBehaviorPass: z.boolean(),
}).strict();

const AggregateSchema = z.object({
  schemaValidityRate: z.number().min(0).max(1),
  sourceMutationCount: z.number().int().nonnegative(),
  authoritativeOutcomeChangeCount: z.number().int().nonnegative(),
  canonicalCommitCount: z.number().int().nonnegative(),
  observerCanonicalIdentifierLeakCount: z.number().int().nonnegative(),
  outOfScopeRepairMutationCount: z.number().int().nonnegative(),
  danglingReferenceCount: z.number().int().nonnegative(),
  temporalAtomicityFailureCount: z.number().int().nonnegative(),
  minimumExpectedDependencyRecall: z.number().min(0).max(1),
  minimumComponentReceiptCoverage: z.number().min(0).max(1),
  explicitConflictOrUnknownHandlingRate: z.number().min(0).max(1),
  deterministicDigestStabilityRate: z.number().min(0).max(1),
  integratedLocalP95Ms: z.number().nonnegative(),
  minReceiptBytes: z.number().int().nonnegative(),
  maxReceiptBytes: z.number().int().nonnegative(),
  minProjectionBytes: z.number().int().nonnegative(),
  maxProjectionBytes: z.number().int().nonnegative(),
  minComponentPayloadBytes: z.number().int().nonnegative(),
  maxComponentPayloadBytes: z.number().int().nonnegative(),
  currentAuthoritativeMinimumCalls: z.number().int().nonnegative(),
  shadowModeledOrdinaryCalls: z.number().int().nonnegative(),
  shadowExternalLlmCalls: z.literal(0),
  generationTokensMeasured: z.literal(false),
  generationLatencyMeasured: z.literal(false),
  runtimeIntegrationRefCount: z.number().int().nonnegative(),
  hardInvariantsPass: z.boolean(),
  primaryProxiesPass: z.boolean(),
  registeredScenarioBehaviorCoverage: z.number().min(0).max(1),
  registeredScenarioBehaviorPass: z.boolean(),
  failedStrata: z.array(TranscriptScenarioSchema.shape.stratum),
}).strict();

const DecisionSchema = z.object({
  label: z.enum(["supported", "revise", "unsupported", "indeterminate"]),
  reason: z.string().min(1),
  blockingFindings: z.array(z.string().min(1)),
  blindReview: z.object({
    required: z.literal(false),
    performed: z.literal(false),
    providerCalls: z.literal(0),
    reason: z.string().min(1),
  }).strict(),
  nonClaims: z.array(z.string().min(1)).min(1),
}).strict();

const EvaluationReportWithoutIntegritySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("integrated_shadow_turn_evaluation"),
  evaluatedAt: z.string().datetime(),
  transcriptVersion: z.string().min(1),
  provenance: z.object({
    gitHead: z.string().min(1),
    workingTreeDirty: z.boolean(),
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
    evaluatorPath: z.string().min(1),
    evaluatorSha256: DigestSchema,
    transcriptPath: z.string().min(1),
    transcriptSha256: DigestSchema,
    transcriptContentDigest: DigestSchema,
    protocolPath: z.string().min(1),
    protocolSha256: DigestSchema,
    integratedSourcePath: z.string().min(1),
    integratedSourceSha256: DigestSchema,
    worldSourcePath: z.string().min(1),
    worldSourceSha256: DigestSchema,
  }).strict(),
  execution: z.object({
    scenarioCount: z.literal(7),
    deterministicRepetitions: z.number().int().min(1).max(100),
    totalRuns: z.number().int().positive(),
    evaluatorExternalLlmCalls: z.literal(0),
    canonicalCommitCount: z.number().int().nonnegative(),
  }).strict(),
  thresholds: ThresholdsSchema,
  scenarios: z.array(ScenarioEvaluationSchema).length(7),
  aggregate: AggregateSchema,
  decision: DecisionSchema,
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

const EvaluationReportSchema = EvaluationReportWithoutIntegritySchema.extend({
  integrity: z.object({
    algorithm: z.literal("sha256"),
    basis: z.literal("canonical report excluding integrity"),
    contentDigest: DigestSchema,
  }).strict(),
}).strict();
export const IntegratedShadowTurnEvaluationReportSchema =
  EvaluationReportSchema;
export type IntegratedShadowTurnEvaluationReport = z.infer<
  typeof EvaluationReportSchema
>;

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

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value: unknown): string {
  return sha256(canonicalJson(value));
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : round(numerator / denominator, 6);
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(
      sorted.length - 1,
      Math.ceil(sorted.length * percentileValue / 100) - 1,
    ),
  );
  return round(sorted[index]!);
}

function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

function runtimeIntegrationRefCount(): number {
  return ["backend/src/services", "frontend/src", "infra"].reduce(
    (sum, target) => {
      try {
        const output = execFileSync(
          "rg",
          ["-l", "runIntegratedShadowTurnPoc", target],
          { cwd: repositoryRoot, encoding: "utf8" },
        ).trim();
        return sum + (output ? output.split("\n").length : 0);
      } catch {
        return sum;
      }
    },
    0,
  );
}

function transcriptContentDigest(report: Record<string, unknown>): string {
  const { integrity: _integrity, ...basis } = report;
  return digest(basis);
}

function integratedInput(input: {
  transcriptVersion: string;
  scenario: TranscriptScenario;
}): IntegratedShadowTurnInput {
  const scenario = input.scenario;
  return IntegratedShadowTurnInputSchema.parse({
    transcriptRef: `transcript:${input.transcriptVersion}:${scenario.id}`,
    sourceBattleState: scenario.sourceBattleState,
    sourceBattleStateDigest: scenario.sourceBattleStateDigest,
    authoritativeOutcome: scenario.authoritativeResult.normalizedOutcome,
    authoritativeOutcomeDigest:
      scenario.authoritativeResult.normalizedOutcomeDigest,
    characterInputs: scenario.characterInputs,
    worldInputs: scenario.worldInputs,
    consistencyInputs: scenario.consistencyInputs,
    expectedDependencies: scenario.expectedDependencies,
    expectedBoundaries: scenario.expectedBoundaries,
    callModel: scenario.callModel,
  });
}

function stratumChecks(input: {
  scenario: TranscriptScenario;
  receipt: IntegratedShadowTurnReceipt;
}): z.infer<typeof StratumCheckSchema>[] {
  const { scenario, receipt } = input;
  const checks: z.infer<typeof StratumCheckSchema>[] = [];
  const add = (id: string, passed: boolean, detail: string): void => {
    checks.push(StratumCheckSchema.parse({ id, passed, detail }));
  };
  if (scenario.stratum === "ordinary_fast_action") {
    const adaptive = receipt.adaptive.status === "executed"
      ? receipt.adaptive.result.receipts
      : [];
    add(
      "ordinary_fast_path",
      adaptive.length === 1 && adaptive[0]?.resolution === "fast" &&
        adaptive[0]?.outcome === "completed" && receipt.patches.length === 1,
      "ordinary action must complete on the fast path and emit one audited patch",
    );
  } else if (scenario.stratum === "remote_rejection") {
    const adaptive = receipt.adaptive.status === "executed"
      ? receipt.adaptive.result.receipts
      : [];
    add(
      "remote_defense_fallback",
      scenario.characterInputs.cases[0]?.proposal.actionKind === "defense" &&
        adaptive[0]?.outcome === "completed" &&
        adaptive[0]?.effects.length === 0 && receipt.patches.length === 0,
      "remote request must remain a no-damage defense fallback",
    );
  } else if (scenario.stratum === "simultaneous_terminal_action") {
    const adaptive = receipt.adaptive.status === "executed"
      ? receipt.adaptive.result.receipts
      : [];
    add(
      "simultaneous_atomic_pair",
      adaptive.length === 2 && adaptive.every((candidate) =>
        candidate.resolution === "fast" && candidate.outcome === "completed"
      ) && receipt.patches.length === 2 &&
        receipt.boundaries.temporalAtomicityFailureCount === 0,
      "both side-neutral terminal proposals must remain in one atomic window",
    );
  } else if (scenario.stratum === "interrupted_expanded_action") {
    const adaptive = receipt.adaptive.status === "executed"
      ? receipt.adaptive.result.receipts[0]
      : null;
    add(
      "interrupted_longest_prefix",
      adaptive?.resolution === "expanded" && adaptive.outcome === "partial" &&
        adaptive.completedSteps.includes("step.interrupted.approach") &&
        adaptive.failedStep === "step.interrupted.strike" &&
        adaptive.effects.some((effect) =>
          effect.id === "effect.interrupted.approached"
        ) && receipt.patches.length === 1,
      "the valid approach prefix must remain while the interrupted strike stays unexecuted",
    );
  } else if (scenario.stratum === "active_world_process") {
    const completed = receipt.world.status === "executed" &&
      receipt.world.result.receipts.some((candidate) =>
        candidate.outcome === "completed" && Boolean(candidate.patch)
      );
    add(
      "world_shared_window_and_cause",
      completed && receipt.patches.every((patch) =>
        patch.audit.verdict === "no_issue_found"
      ) && receipt.causalTraces.some((trace) =>
        trace.relation === "effect_fact"
      ) && receipt.boundaries.temporalAtomicityFailureCount === 0,
      "active process must complete in the shared window with an audited effect-to-fact trace",
    );
  } else if (scenario.stratum === "blocking_local_conflict") {
    const contested = receipt.adaptive.status === "executed"
      ? receipt.adaptive.result.contestedClaimRefs.includes("claim:object.token")
      : false;
    add(
      "blocking_conflict_exposed",
      contested && receipt.issues.some((issue) => issue.status !== "resolved") &&
        receipt.conflictHandling.conflictedReadRefs.length > 0 &&
        receipt.conflictHandling.fallbackFactRefs.length > 0,
      "same-window claim and holder conflict must remain explicit and unresolved",
    );
  } else {
    const adaptive = receipt.adaptive.status === "executed"
      ? receipt.adaptive.result.receipts[0]
      : null;
    add(
      "budget_degrades_without_forced_outcome",
      adaptive?.resolution === "degraded" &&
        adaptive.failureReason === "budget_exhausted" &&
        adaptive.outcome === "indeterminate" &&
        ["intermediate", "weak", "unknown"].includes(
          adaptive.fallbackFact?.strength ?? "",
        ) && receipt.patches.length === 0,
      "exhausted planning budget must preserve a weak fallback without forcing success",
    );
  }
  add(
    "patch_audits_bounded",
    receipt.patches.every((patch) =>
      patch.audit.verdict === "no_issue_found" ||
      patch.registration.outcome !== "rejected"
    ),
    "every emitted patch must have a bounded non-rejected audit receipt",
  );
  return checks;
}

function decisionFor(input: {
  hardPass: boolean;
  primaryPass: boolean;
  scenarioBehaviorPass: boolean;
  failedStrata: string[];
}): z.infer<typeof DecisionSchema> {
  const blockingFindings = input.failedStrata.map((stratum) =>
    stratum === "interrupted_expanded_action"
      ? "The frozen interrupted plan omits psychology and experience basis refs, so Adaptive validation degrades to unknown instead of preserving the valid execution prefix."
      : `Registered stratum behavior failed: ${stratum}`
  );
  const label = !input.hardPass
    ? "unsupported" as const
    : !input.primaryPass || !input.scenarioBehaviorPass
      ? "revise" as const
      : "supported" as const;
  const reason = label === "supported"
    ? "All hard invariants, primary proxies, and registered stratum behaviors passed."
    : label === "unsupported"
      ? "At least one authority, privacy, mutation, causal-reference, or temporal hard invariant failed."
      : !input.primaryPass
        ? "Hard invariants are clean, but a pre-registered primary proxy requires correction and replay."
        : "Hard invariants and primary proxies are clean, but a registered stratum behavior requires a bounded correction and replay.";
  return DecisionSchema.parse({
    label,
    reason,
    blockingFindings,
    blindReview: {
      required: false,
      performed: false,
      providerCalls: 0,
      reason: "Strict receipt fields deterministically identify the failed stage and missing plan basis; semantic preference review cannot resolve this contract mismatch.",
    },
    nonClaims: [
      "The evaluation does not prove objective battle correctness or global consistency.",
      "The modeled three-call topology is not a measured live call reduction.",
      "No production latency, persistence concurrency, provider failure, release, or deployment claim is made.",
    ],
  });
}

export function verifyIntegratedShadowEvaluationContentDigest(
  report: IntegratedShadowTurnEvaluationReport,
): boolean {
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

export async function evaluateBattleIntegratedShadowTurn(input: {
  transcriptPath?: string;
  transcriptReport?: unknown;
  transcriptPathLabel?: string;
  repetitions?: number;
  now?: () => Date;
  clock?: () => number;
} = {}): Promise<IntegratedShadowTurnEvaluationReport> {
  if (input.transcriptPath && input.transcriptReport !== undefined) {
    throw new Error("transcriptPath and transcriptReport are mutually exclusive");
  }
  const transcriptPath = input.transcriptReport === undefined
    ? path.resolve(input.transcriptPath ?? defaultTranscriptPath)
    : null;
  const transcriptText = input.transcriptReport === undefined
    ? await fs.readFile(transcriptPath!, "utf8")
    : `${JSON.stringify(input.transcriptReport, null, 2)}\n`;
  const rawTranscript = input.transcriptReport === undefined
    ? JSON.parse(transcriptText) as Record<string, unknown>
    : structuredClone(input.transcriptReport) as Record<string, unknown>;
  const transcriptPathForReport = transcriptPath
    ? path.relative(repositoryRoot, transcriptPath)
    : input.transcriptPathLabel ?? "in-memory:integrated-shadow-transcript";
  const transcript = TranscriptReportSchema.parse(rawTranscript);
  if (transcriptContentDigest(rawTranscript) !== transcript.integrity.contentDigest) {
    throw new Error("frozen transcript content digest mismatch");
  }
  const repetitions = input.repetitions ?? 20;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const clock = input.clock ?? performance.now.bind(performance);
  const scenarioReports: z.infer<typeof ScenarioEvaluationSchema>[] = [];
  const allLatencies: number[] = [];
  for (const scenario of transcript.scenarios) {
    const request = integratedInput({
      transcriptVersion: transcript.fixtureVersion,
      scenario,
    });
    const runs: z.infer<typeof RunEvidenceSchema>[] = [];
    let representativeReceipt: IntegratedShadowTurnReceipt | null = null;
    let representativeChecks: z.infer<typeof StratumCheckSchema>[] = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const sourceBefore = digest(request.sourceBattleState);
      const authoritativeBefore = digest(request.authoritativeOutcome);
      const started = clock();
      const receipt = runIntegratedShadowTurnPoc(request);
      const latencyMs = round(Math.max(0, clock() - started));
      const parsed = IntegratedShadowTurnReceiptSchema.safeParse(receipt);
      if (!parsed.success) {
        throw new Error(`integrated receipt schema failed for ${scenario.id}`);
      }
      const sourceMutated = receipt.boundaries.sourceMutated ||
        digest(request.sourceBattleState) !== sourceBefore ||
        receipt.sourceBattleStateDigest !== scenario.sourceBattleStateDigest;
      const authoritativeOutcomeChanged =
        receipt.boundaries.authoritativeOutcomeChanged ||
        digest(request.authoritativeOutcome) !== authoritativeBefore ||
        receipt.authoritativeOutcomeDigest !==
          scenario.authoritativeResult.normalizedOutcomeDigest;
      if (!representativeReceipt) {
        representativeReceipt = receipt;
        representativeChecks = stratumChecks({ scenario, receipt });
      }
      allLatencies.push(latencyMs);
      runs.push(RunEvidenceSchema.parse({
        repetition,
        latencyMs,
        receiptBytes: bytes(receipt),
        receiptDigest: digest(receipt),
        schemaValid: true,
        dependencyRecall: receipt.dependencyAudit.recall,
        componentCoverage: receipt.componentCoverage.coverage,
        conflictHandlingExplicit: receipt.conflictHandling.explicit,
        sourceMutated,
        authoritativeOutcomeChanged,
        canonicalCommitPerformed:
          receipt.boundaries.canonicalCommitPerformed,
        observerLeakCount:
          receipt.boundaries.observerCanonicalIdentifierLeakCount,
        outOfScopeRepairMutationCount:
          receipt.boundaries.outOfScopeRepairMutationCount,
        danglingReferenceCount: receipt.boundaries.danglingReferenceCount,
        temporalAtomicityFailureCount:
          receipt.boundaries.temporalAtomicityFailureCount,
        externalLlmCallsMade: receipt.boundaries.externalLlmCallsMade,
      }));
    }
    const receiptSizes = runs.map((run) => run.receiptBytes);
    scenarioReports.push(ScenarioEvaluationSchema.parse({
      id: scenario.id,
      stratum: scenario.stratum,
      hypothesis: scenario.hypothesis,
      runs,
      representativeReceipt,
      distinctReceiptDigests: new Set(runs.map((run) => run.receiptDigest)).size,
      p95LatencyMs: percentile(runs.map((run) => run.latencyMs), 95),
      minReceiptBytes: Math.min(...receiptSizes),
      maxReceiptBytes: Math.max(...receiptSizes),
      behaviorChecks: representativeChecks,
      registeredBehaviorPass: representativeChecks.every((check) =>
        check.passed
      ),
    }));
  }

  const allRuns = scenarioReports.flatMap((scenario) => scenario.runs);
  const representativeReceipts = scenarioReports.map((scenario) =>
    scenario.representativeReceipt
  );
  const schemaValidityRate = ratio(
    allRuns.filter((run) => run.schemaValid).length,
    allRuns.length,
  );
  const sourceMutationCount = allRuns.filter((run) => run.sourceMutated).length;
  const authoritativeOutcomeChangeCount = allRuns.filter((run) =>
    run.authoritativeOutcomeChanged
  ).length;
  const canonicalCommitCount = allRuns.filter((run) =>
    run.canonicalCommitPerformed
  ).length;
  const observerLeakCount = allRuns.reduce(
    (sum, run) => sum + run.observerLeakCount,
    0,
  );
  const repairMutationCount = allRuns.reduce(
    (sum, run) => sum + run.outOfScopeRepairMutationCount,
    0,
  );
  const danglingReferenceCount = allRuns.reduce(
    (sum, run) => sum + run.danglingReferenceCount,
    0,
  );
  const temporalFailureCount = allRuns.reduce(
    (sum, run) => sum + run.temporalAtomicityFailureCount,
    0,
  );
  const minimumDependencyRecall = Math.min(...allRuns.map((run) =>
    run.dependencyRecall
  ));
  const minimumComponentCoverage = Math.min(...allRuns.map((run) =>
    run.componentCoverage
  ));
  const conflictHandlingRate = ratio(
    allRuns.filter((run) => run.conflictHandlingExplicit).length,
    allRuns.length,
  );
  const digestStabilityRate = ratio(
    scenarioReports.filter((scenario) =>
      scenario.distinctReceiptDigests <=
        INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
          .distinctReceiptDigestsMaximumPerScenario
    ).length,
    scenarioReports.length,
  );
  const localP95 = percentile(allLatencies, 95);
  const runtimeRefs = runtimeIntegrationRefCount();
  const hardPass =
    schemaValidityRate >= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .schemaValidityMinimum &&
    sourceMutationCount <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .sourceMutationMaximum &&
    authoritativeOutcomeChangeCount <=
      INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
        .authoritativeOutcomeChangeMaximum &&
    canonicalCommitCount <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .canonicalCommitMaximum &&
    observerLeakCount <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .observerCanonicalIdentifierLeakMaximum &&
    repairMutationCount <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .outOfScopeRepairMutationMaximum &&
    danglingReferenceCount <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .danglingReferenceMaximum &&
    temporalFailureCount <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .temporalAtomicityFailureMaximum && runtimeRefs === 0;
  const primaryPass = minimumDependencyRecall >=
      INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
        .expectedDependencyRecallMinimum &&
    minimumComponentCoverage >= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .componentReceiptCoverageMinimum &&
    conflictHandlingRate >= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .explicitConflictOrUnknownHandlingMinimum &&
    digestStabilityRate === 1 &&
    localP95 <= INTEGRATED_SHADOW_EVALUATION_THRESHOLDS
      .integratedLocalP95MsMaximum;
  const failedStrata = scenarioReports.filter((scenario) =>
    !scenario.registeredBehaviorPass
  ).map((scenario) => scenario.stratum);
  const scenarioBehaviorCoverage = ratio(
    scenarioReports.length - failedStrata.length,
    scenarioReports.length,
  );
  const decision = decisionFor({
    hardPass,
    primaryPass,
    scenarioBehaviorPass: failedStrata.length === 0,
    failedStrata,
  });

  const evaluatorPath = fileURLToPath(import.meta.url);
  const [
    evaluatorText,
    protocolText,
    integratedSourceText,
    worldSourceText,
  ] = await Promise.all([
    fs.readFile(evaluatorPath, "utf8"),
    fs.readFile(protocolPath, "utf8"),
    fs.readFile(integratedSourcePath, "utf8"),
    fs.readFile(worldSourcePath, "utf8"),
  ]);
  const receiptSizes = allRuns.map((run) => run.receiptBytes);
  const projectionBytes = representativeReceipts.map((receipt) =>
    receipt.metrics.projectionBytes
  );
  const componentBytes = representativeReceipts.map((receipt) =>
    receipt.metrics.componentPayloadBytes
  );
  const reportWithoutIntegrity = EvaluationReportWithoutIntegritySchema.parse({
    schemaVersion: 1,
    mode: "integrated_shadow_turn_evaluation",
    evaluatedAt: (input.now?.() ?? new Date()).toISOString(),
    transcriptVersion: transcript.fixtureVersion,
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
      transcriptPath: transcriptPathForReport,
      transcriptSha256: sha256(transcriptText),
      transcriptContentDigest: transcript.integrity.contentDigest,
      protocolPath: path.relative(repositoryRoot, protocolPath),
      protocolSha256: sha256(protocolText),
      integratedSourcePath: path.relative(repositoryRoot, integratedSourcePath),
      integratedSourceSha256: sha256(integratedSourceText),
      worldSourcePath: path.relative(repositoryRoot, worldSourcePath),
      worldSourceSha256: sha256(worldSourceText),
    },
    execution: {
      scenarioCount: 7,
      deterministicRepetitions: repetitions,
      totalRuns: repetitions * transcript.scenarios.length,
      evaluatorExternalLlmCalls: 0,
      canonicalCommitCount: 0,
    },
    thresholds: INTEGRATED_SHADOW_EVALUATION_THRESHOLDS,
    scenarios: scenarioReports,
    aggregate: {
      schemaValidityRate,
      sourceMutationCount,
      authoritativeOutcomeChangeCount,
      canonicalCommitCount,
      observerCanonicalIdentifierLeakCount: observerLeakCount,
      outOfScopeRepairMutationCount: repairMutationCount,
      danglingReferenceCount,
      temporalAtomicityFailureCount: temporalFailureCount,
      minimumExpectedDependencyRecall: minimumDependencyRecall,
      minimumComponentReceiptCoverage: minimumComponentCoverage,
      explicitConflictOrUnknownHandlingRate: conflictHandlingRate,
      deterministicDigestStabilityRate: digestStabilityRate,
      integratedLocalP95Ms: localP95,
      minReceiptBytes: Math.min(...receiptSizes),
      maxReceiptBytes: Math.max(...receiptSizes),
      minProjectionBytes: Math.min(...projectionBytes),
      maxProjectionBytes: Math.max(...projectionBytes),
      minComponentPayloadBytes: Math.min(...componentBytes),
      maxComponentPayloadBytes: Math.max(...componentBytes),
      currentAuthoritativeMinimumCalls:
        representativeReceipts[0]?.metrics.currentAuthoritativeMinimumCalls ?? 0,
      shadowModeledOrdinaryCalls:
        representativeReceipts[0]?.metrics.shadowModeledOrdinaryCalls ?? 0,
      shadowExternalLlmCalls: 0,
      generationTokensMeasured: false,
      generationLatencyMeasured: false,
      runtimeIntegrationRefCount: runtimeRefs,
      hardInvariantsPass: hardPass,
      primaryProxiesPass: primaryPass,
      registeredScenarioBehaviorCoverage: scenarioBehaviorCoverage,
      registeredScenarioBehaviorPass: failedStrata.length === 0,
      failedStrata,
    },
    decision,
    limitations: [
      "The seven transcripts are fixed local cases and do not establish recall for unseen turns.",
      "Character plans and world inputs are pre-authored; generation quality, generation tokens, and generation latency remain unmeasured.",
      "Local receipt latency excludes provider, persistence, concurrency, network, and deployment overhead.",
      "The evaluator does not mutate BattleState, authoritative outcome, canonical storage, runtime services, database state, or provider order.",
      "Passing hard invariants and proxies cannot prove objective battle correctness or global consistency.",
    ],
  });
  const report = EvaluationReportSchema.parse({
    ...reportWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(reportWithoutIntegrity),
    },
  });
  if (!verifyIntegratedShadowEvaluationContentDigest(report)) {
    throw new Error("integrated shadow evaluation content digest mismatch");
  }
  return report;
}

function parseArgs(args: string[]): {
  transcriptPath?: string;
  repetitions?: number;
  outputPath?: string;
} {
  const parsed: {
    transcriptPath?: string;
    repetitions?: number;
    outputPath?: string;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--transcript") {
      parsed.transcriptPath = path.resolve(repositoryRoot, value);
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
  const report = await evaluateBattleIntegratedShadowTurn({
    transcriptPath: args.transcriptPath,
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[integrated-shadow-evaluation] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
