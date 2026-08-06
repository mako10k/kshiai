import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IntegratedShadowTurnReceiptV2Schema,
  auditConflictHandlingV2References,
  buildIntegratedShadowTurnReceiptV2,
  projectLegacyIntegratedShadowTurnReceipt,
  runIntegratedShadowTurnPoc,
} from "@kshiai/shared";
import {
  buildBattleConflictHandlingApplicabilityReceipts,
  verifyConflictHandlingApplicabilityParent,
} from "./build-battle-conflict-handling-applicability-receipts.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const PROTOCOL_PATH = "docs/battle-pipeline-conflict-applicability-protocol.md";
const CLASSIFIER_PATH =
  "packages/shared/src/battle-conflict-handling-applicability.ts";
const CONSTRUCTION_WRAPPER_PATH =
  "backend/src/scripts/build-battle-conflict-handling-applicability-receipts.ts";
const FROZEN_EVALUATION_PATH =
  "docs/evidence/battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json";
const REGISTERED_REPETITIONS = 20;

export const CONFLICT_HANDLING_APPLICABILITY_THRESHOLDS = {
  schemaValidityMinimum: 1,
  sourceMutationMaximum: 0,
  authoritativeOutcomeChangeMaximum: 0,
  canonicalCommitMaximum: 0,
  observerCanonicalIdentifierLeakMaximum: 0,
  outOfScopeRepairMutationMaximum: 0,
  danglingReferenceMaximum: 0,
  temporalAtomicityFailureMaximum: 0,
  externalLlmCallMaximum: 0,
  xaiCallMaximum: 0,
  classificationAccuracyMinimum: 1,
  applicableStratumCount: 3,
  applicableHandlingRateMinimum: 1,
  dispositionAccuracyMinimum: 1,
  legacyReceiptParityMinimum: 1,
  registeredBattleBehaviorMinimum: 1,
  distinctReceiptDigestsMaximumPerScenario: 1,
  integratedLocalP95MsMaximum: 50,
} as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const StratumSchema = z.enum([
  "ordinary_fast_action",
  "remote_rejection",
  "simultaneous_terminal_action",
  "interrupted_expanded_action",
  "active_world_process",
  "blocking_local_conflict",
  "exhausted_budget",
]);
type Stratum = z.infer<typeof StratumSchema>;

const FileEvidenceSchema = z.object({
  path: z.string().min(1),
  fileSha256: DigestSchema,
}).strict();

const ExpectedClassificationSchema = z.object({
  availability: z.enum(["unavailable", "available"]),
  disposition: z.enum([
    "unavailable",
    "not_needed",
    "used",
    "available_unhandled",
  ]),
  applicability: z.enum(["not_applicable", "required"]),
  handling: z.enum(["not_applicable", "handled", "missing"]),
}).strict();
type ExpectedClassification = z.infer<typeof ExpectedClassificationSchema>;

const RunSchema = z.object({
  repetition: z.number().int().positive(),
  receiptDigest: DigestSchema,
  legacyReceiptDigest: DigestSchema,
  latencyMs: z.number().nonnegative(),
  receiptBytes: z.number().int().positive(),
  schemaValid: z.literal(true),
  classificationMatches: z.boolean(),
  dispositionMatches: z.boolean(),
  legacyReceiptParity: z.boolean(),
  registeredBattleBehaviorPass: z.boolean(),
  applicabilityCheckedRefCount: z.number().int().nonnegative(),
  applicabilityDanglingReferenceCount: z.number().int().nonnegative(),
  hardInvariantsPass: z.boolean(),
}).strict();

const ScenarioEvaluationSchema = z.object({
  scenarioId: z.string().min(1),
  stratum: StratumSchema,
  expected: ExpectedClassificationSchema,
  representativeReceipt: IntegratedShadowTurnReceiptV2Schema,
  runs: z.array(RunSchema).min(1).max(100),
  distinctReceiptDigests: z.number().int().positive(),
  p95LatencyMs: z.number().nonnegative(),
  classificationPass: z.boolean(),
  dispositionPass: z.boolean(),
  applicableRunCount: z.number().int().nonnegative(),
  handledApplicableRunCount: z.number().int().nonnegative(),
  legacyReceiptParityPass: z.boolean(),
  registeredBattleBehaviorPass: z.boolean(),
  deterministicStabilityPass: z.boolean(),
  hardInvariantsPass: z.boolean(),
}).strict();

const DecisionSchema = z.object({
  label: z.enum(["supported", "revise", "unsupported", "indeterminate"]),
  reason: z.string().min(1),
  blockingFindings: z.array(z.string().min(1)),
  externalReview: z.object({
    required: z.literal(false),
    performed: z.literal(false),
    providerCalls: z.literal(0),
    reason: z.string().min(1),
  }).strict(),
}).strict();

const EvaluationWithoutIntegritySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("conflict_handling_applicability_evaluation"),
  evaluatedAt: z.string().datetime(),
  fixtureVersion: z.literal(
    "battle-pipeline-integrated-shadow-transcripts-v2",
  ),
  provenance: z.object({
    gitHead: z.string().min(1),
    workingTreeDirty: z.boolean(),
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
    protocol: FileEvidenceSchema,
    evaluator: FileEvidenceSchema,
    classifier: FileEvidenceSchema,
    constructionWrapper: FileEvidenceSchema,
    frozenEvaluation: FileEvidenceSchema.extend({
      contentDigest: DigestSchema,
    }).strict(),
    frozenParentVerified: z.literal(true),
  }).strict(),
  execution: z.object({
    scenarioCount: z.literal(7),
    repetitionsPerScenario: z.number().int().min(1).max(100),
    totalRuns: z.number().int().positive(),
    derivedTranscriptPersisted: z.literal(false),
    evaluatorExternalLlmCalls: z.literal(0),
    evaluatorXaiCalls: z.literal(0),
    canonicalCommitCount: z.number().int().nonnegative(),
  }).strict(),
  thresholds: z.object({
    schemaValidityMinimum: z.literal(1),
    sourceMutationMaximum: z.literal(0),
    authoritativeOutcomeChangeMaximum: z.literal(0),
    canonicalCommitMaximum: z.literal(0),
    observerCanonicalIdentifierLeakMaximum: z.literal(0),
    outOfScopeRepairMutationMaximum: z.literal(0),
    danglingReferenceMaximum: z.literal(0),
    temporalAtomicityFailureMaximum: z.literal(0),
    externalLlmCallMaximum: z.literal(0),
    xaiCallMaximum: z.literal(0),
    classificationAccuracyMinimum: z.literal(1),
    applicableStratumCount: z.literal(3),
    applicableHandlingRateMinimum: z.literal(1),
    dispositionAccuracyMinimum: z.literal(1),
    legacyReceiptParityMinimum: z.literal(1),
    registeredBattleBehaviorMinimum: z.literal(1),
    distinctReceiptDigestsMaximumPerScenario: z.literal(1),
    integratedLocalP95MsMaximum: z.literal(50),
  }).strict(),
  scenarios: z.array(ScenarioEvaluationSchema).length(7),
  aggregate: z.object({
    schemaValidityRate: z.number().min(0).max(1),
    sourceMutationCount: z.number().int().nonnegative(),
    authoritativeOutcomeChangeCount: z.number().int().nonnegative(),
    canonicalCommitCount: z.number().int().nonnegative(),
    observerCanonicalIdentifierLeakCount: z.number().int().nonnegative(),
    outOfScopeRepairMutationCount: z.number().int().nonnegative(),
    legacyCausalOrComponentDanglingReferenceCount:
      z.number().int().nonnegative(),
    applicabilityDanglingReferenceCount: z.number().int().nonnegative(),
    danglingReferenceCount: z.number().int().nonnegative(),
    temporalAtomicityFailureCount: z.number().int().nonnegative(),
    externalLlmCalls: z.number().int().nonnegative(),
    xaiCalls: z.number().int().nonnegative(),
    classificationAccuracy: z.number().min(0).max(1),
    applicableStratumCount: z.number().int().nonnegative(),
    applicableRunCount: z.number().int().nonnegative(),
    handledApplicableRunCount: z.number().int().nonnegative(),
    applicableHandlingRate: z.number().min(0).max(1),
    dispositionAccuracy: z.number().min(0).max(1),
    legacyReceiptParity: z.number().min(0).max(1),
    registeredBattleBehavior: z.number().min(0).max(1),
    deterministicDigestStabilityRate: z.number().min(0).max(1),
    integratedLocalP95Ms: z.number().nonnegative(),
    legacyExplicitConflictOrUnknownHandlingRate: z.number().min(0).max(1),
    minReceiptBytes: z.number().int().positive(),
    maxReceiptBytes: z.number().int().positive(),
    minProjectionBytes: z.number().int().nonnegative(),
    maxProjectionBytes: z.number().int().nonnegative(),
    minComponentPayloadBytes: z.number().int().nonnegative(),
    maxComponentPayloadBytes: z.number().int().nonnegative(),
    generationTokensMeasured: z.literal(false),
    generationLatencyMeasured: z.literal(false),
    hardInvariantsPass: z.boolean(),
    primaryProxiesPass: z.boolean(),
  }).strict(),
  gates: z.object({
    registeredRepetitionCount: z.boolean(),
    exactSevenClassifications: z.boolean(),
    exactThreeApplicableStrata: z.boolean(),
    applicableHandlingComplete: z.boolean(),
    exactSevenDispositions: z.boolean(),
    legacyParitySevenOfSeven: z.boolean(),
    registeredBattleBehaviorSevenOfSeven: z.boolean(),
    deterministicStability: z.boolean(),
    localP95WithinBudget: z.boolean(),
    hardInvariantsPass: z.boolean(),
    externalLlmAndXaiCallsZero: z.boolean(),
    allRequiredGatesPass: z.boolean(),
  }).strict(),
  decision: DecisionSchema,
  nonClaims: z.array(z.string().min(1)).min(1),
}).strict();

export const ConflictHandlingApplicabilityEvaluationReportSchema =
  EvaluationWithoutIntegritySchema.extend({
    integrity: z.object({
      algorithm: z.literal("sha256"),
      basis: z.literal("canonical report excluding integrity"),
      contentDigest: DigestSchema,
    }).strict(),
  }).strict();
export type ConflictHandlingApplicabilityEvaluationReport = z.infer<
  typeof ConflictHandlingApplicabilityEvaluationReportSchema
>;

const expectedByStratum: Record<Stratum, ExpectedClassification> = {
  ordinary_fast_action: {
    availability: "unavailable",
    disposition: "unavailable",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  remote_rejection: {
    availability: "available",
    disposition: "used",
    applicability: "required",
    handling: "handled",
  },
  simultaneous_terminal_action: {
    availability: "unavailable",
    disposition: "unavailable",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  interrupted_expanded_action: {
    availability: "available",
    disposition: "not_needed",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  active_world_process: {
    availability: "unavailable",
    disposition: "unavailable",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  blocking_local_conflict: {
    availability: "available",
    disposition: "used",
    applicability: "required",
    handling: "handled",
  },
  exhausted_budget: {
    availability: "available",
    disposition: "used",
    applicability: "required",
    handling: "handled",
  },
};

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

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: readonly number[], target: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil((target / 100) * sorted.length) - 1,
  );
  return sorted[index] ?? 0;
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

async function fileEvidence(
  relativePath: string,
): Promise<z.infer<typeof FileEvidenceSchema>> {
  const source = await fs.readFile(path.join(repositoryRoot, relativePath));
  return FileEvidenceSchema.parse({
    path: relativePath,
    fileSha256: sha256(source),
  });
}

function classificationMatches(
  actual: z.infer<typeof IntegratedShadowTurnReceiptV2Schema>["conflictHandlingV2"],
  expected: ExpectedClassification,
): boolean {
  return actual.capability.availability === expected.availability &&
    actual.capability.disposition === expected.disposition &&
    actual.applicability.status === expected.applicability &&
    actual.handling.status === expected.handling;
}

function decisionFor(input: {
  registeredRepetitionCount: boolean;
  hardInvariantsPass: boolean;
  primaryProxiesPass: boolean;
}): z.infer<typeof DecisionSchema> {
  const blockingFindings: string[] = [];
  let label: z.infer<typeof DecisionSchema>["label"];
  let reason: string;
  if (!input.registeredRepetitionCount) {
    label = "indeterminate";
    reason = "The registered twenty repetitions per stratum were not run.";
    blockingFindings.push("Registered repetition count is incomplete.");
  } else if (!input.hardInvariantsPass) {
    label = "unsupported";
    reason = "An authority, privacy, causal-reference, or mutation invariant failed.";
    blockingFindings.push("One or more hard invariants failed.");
  } else if (!input.primaryProxiesPass) {
    label = "revise";
    reason = "Hard boundaries passed, but a fixed applicability proxy failed.";
    blockingFindings.push("One or more primary applicability proxies failed.");
  } else {
    label = "supported";
    reason = "All hard invariants and fixed applicability proxies passed over seven strata and 140 runs.";
  }
  return DecisionSchema.parse({
    label,
    reason,
    blockingFindings,
    externalReview: {
      required: false,
      performed: false,
      providerCalls: 0,
      reason: "All registered gates use strict structured fields, so XAI or external semantic review cannot strengthen this result.",
    },
  });
}

export function verifyConflictHandlingApplicabilityEvaluationContentDigest(
  raw: unknown,
): boolean {
  const report = ConflictHandlingApplicabilityEvaluationReportSchema.parse(raw);
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

export async function verifyConflictHandlingApplicabilityEvaluationCurrentSources(
  raw: unknown,
): Promise<boolean> {
  const report = ConflictHandlingApplicabilityEvaluationReportSchema.parse(raw);
  const expected = [
    report.provenance.protocol,
    report.provenance.evaluator,
    report.provenance.classifier,
    report.provenance.constructionWrapper,
    report.provenance.frozenEvaluation,
  ];
  const current = await Promise.all(expected.map((item) =>
    fileEvidence(item.path)
  ));
  return current.every((item, index) =>
    item.path === expected[index]!.path &&
    item.fileSha256 === expected[index]!.fileSha256
  );
}

export async function evaluateBattleConflictHandlingApplicability(input: {
  repetitions?: number;
  now?: () => Date;
  clock?: () => number;
} = {}): Promise<ConflictHandlingApplicabilityEvaluationReport> {
  const repetitions = input.repetitions ?? REGISTERED_REPETITIONS;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  if (!await verifyConflictHandlingApplicabilityParent()) {
    throw new Error("frozen conflict-handling applicability parent mismatch");
  }
  const construction = await buildBattleConflictHandlingApplicabilityReceipts();
  const clock = input.clock ?? performance.now.bind(performance);
  const scenarioReports: Array<z.infer<typeof ScenarioEvaluationSchema>> = [];
  let sourceMutationCount = 0;
  let authoritativeOutcomeChangeCount = 0;
  let canonicalCommitCount = 0;
  let observerLeakCount = 0;
  let repairMutationCount = 0;
  let legacyDanglingCount = 0;
  let applicabilityDanglingCount = 0;
  let temporalFailureCount = 0;
  let externalLlmCalls = 0;
  let legacyExplicitCount = 0;
  const allLatencies: number[] = [];
  const allReceiptBytes: number[] = [];

  for (const receiptCase of construction.cases) {
    const stratum = StratumSchema.parse(receiptCase.stratum);
    const expected = expectedByStratum[stratum];
    const baselineLegacyDigest = digest(receiptCase.legacyReceipt);
    const runs: Array<z.infer<typeof RunSchema>> = [];
    let representativeReceipt: z.infer<
      typeof IntegratedShadowTurnReceiptV2Schema
    > | undefined;

    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const sourceBefore = digest(receiptCase.turnInput.sourceBattleState);
      const authoritativeBefore = digest(
        receiptCase.turnInput.authoritativeOutcome,
      );
      const startedAt = clock();
      const legacyReceipt = runIntegratedShadowTurnPoc(receiptCase.turnInput);
      const receipt = IntegratedShadowTurnReceiptV2Schema.parse(
        buildIntegratedShadowTurnReceiptV2({
          turnInput: receiptCase.turnInput,
          receipt: legacyReceipt,
        }),
      );
      const projectedLegacy = projectLegacyIntegratedShadowTurnReceipt(receipt);
      const referenceAudit = auditConflictHandlingV2References({
        turnInput: receiptCase.turnInput,
        receipt,
      });
      const latencyMs = Math.max(0, clock() - startedAt);
      const receiptDigest = digest(receipt);
      const legacyReceiptDigest = digest(legacyReceipt);
      const receiptBytes = Buffer.byteLength(JSON.stringify(receipt));
      const completedComponents = new Set(
        legacyReceipt.componentCoverage.completedComponentRefs,
      );
      const missingComponentRefCount =
        legacyReceipt.componentCoverage.expectedComponentRefs.filter((ref) =>
          !completedComponents.has(ref)
        ).length;
      const legacyRunDanglingCount =
        legacyReceipt.boundaries.danglingReferenceCount +
        missingComponentRefCount;
      const sourceMutated = legacyReceipt.boundaries.sourceMutated ||
        digest(receiptCase.turnInput.sourceBattleState) !== sourceBefore;
      const authoritativeChanged =
        legacyReceipt.boundaries.authoritativeOutcomeChanged ||
        digest(receiptCase.turnInput.authoritativeOutcome) !==
          authoritativeBefore;
      const runHardPass = !sourceMutated && !authoritativeChanged &&
        !legacyReceipt.boundaries.canonicalCommitPerformed &&
        legacyReceipt.boundaries.observerCanonicalIdentifierLeakCount === 0 &&
        legacyReceipt.boundaries.outOfScopeRepairMutationCount === 0 &&
        legacyRunDanglingCount === 0 &&
        referenceAudit.danglingRefs.length === 0 &&
        legacyReceipt.boundaries.temporalAtomicityFailureCount === 0 &&
        legacyReceipt.boundaries.externalLlmCallsMade === 0;
      const matches = classificationMatches(
        receipt.conflictHandlingV2,
        expected,
      );
      const dispositionMatches =
        receipt.conflictHandlingV2.capability.disposition ===
          expected.disposition;
      const legacyParity = digest(projectedLegacy) === legacyReceiptDigest;
      const registeredBehaviorPass =
        legacyReceiptDigest === baselineLegacyDigest;

      sourceMutationCount += Number(sourceMutated);
      authoritativeOutcomeChangeCount += Number(authoritativeChanged);
      canonicalCommitCount += Number(
        legacyReceipt.boundaries.canonicalCommitPerformed,
      );
      observerLeakCount +=
        legacyReceipt.boundaries.observerCanonicalIdentifierLeakCount;
      repairMutationCount +=
        legacyReceipt.boundaries.outOfScopeRepairMutationCount;
      legacyDanglingCount += legacyRunDanglingCount;
      applicabilityDanglingCount += referenceAudit.danglingRefs.length;
      temporalFailureCount +=
        legacyReceipt.boundaries.temporalAtomicityFailureCount;
      externalLlmCalls += legacyReceipt.boundaries.externalLlmCallsMade;
      legacyExplicitCount += Number(legacyReceipt.conflictHandling.explicit);
      allLatencies.push(latencyMs);
      allReceiptBytes.push(receiptBytes);
      representativeReceipt ??= receipt;
      runs.push(RunSchema.parse({
        repetition,
        receiptDigest,
        legacyReceiptDigest,
        latencyMs,
        receiptBytes,
        schemaValid: true,
        classificationMatches: matches,
        dispositionMatches,
        legacyReceiptParity: legacyParity,
        registeredBattleBehaviorPass: registeredBehaviorPass,
        applicabilityCheckedRefCount: referenceAudit.checkedRefCount,
        applicabilityDanglingReferenceCount:
          referenceAudit.danglingRefs.length,
        hardInvariantsPass: runHardPass,
      }));
    }

    if (!representativeReceipt) throw new Error("scenario produced no receipt");
    const applicableRuns = runs.filter(() =>
      representativeReceipt!.conflictHandlingV2.applicability.status ===
        "required"
    ).length;
    const handledApplicableRuns = runs.filter(() =>
      representativeReceipt!.conflictHandlingV2.applicability.status ===
        "required" &&
      representativeReceipt!.conflictHandlingV2.handling.status === "handled"
    ).length;
    scenarioReports.push(ScenarioEvaluationSchema.parse({
      scenarioId: receiptCase.scenarioId,
      stratum,
      expected,
      representativeReceipt,
      runs,
      distinctReceiptDigests: new Set(runs.map((run) => run.receiptDigest)).size,
      p95LatencyMs: percentile(runs.map((run) => run.latencyMs), 95),
      classificationPass: runs.every((run) => run.classificationMatches),
      dispositionPass: runs.every((run) => run.dispositionMatches),
      applicableRunCount: applicableRuns,
      handledApplicableRunCount: handledApplicableRuns,
      legacyReceiptParityPass: runs.every((run) => run.legacyReceiptParity),
      registeredBattleBehaviorPass: runs.every((run) =>
        run.registeredBattleBehaviorPass
      ),
      deterministicStabilityPass:
        new Set(runs.map((run) => run.receiptDigest)).size === 1,
      hardInvariantsPass: runs.every((run) => run.hardInvariantsPass),
    }));
  }

  const totalRuns = scenarioReports.flatMap((scenario) => scenario.runs).length;
  const schemaValidityRate = ratio(
    scenarioReports.flatMap((scenario) => scenario.runs)
      .filter((run) => run.schemaValid).length,
    totalRuns,
  );
  const classificationAccuracy = ratio(
    scenarioReports.filter((scenario) => scenario.classificationPass).length,
    scenarioReports.length,
  );
  const applicableStratumCount = scenarioReports.filter((scenario) =>
    scenario.representativeReceipt.conflictHandlingV2.applicability.status ===
      "required"
  ).length;
  const applicableRunCount = scenarioReports.reduce(
    (sum, scenario) => sum + scenario.applicableRunCount,
    0,
  );
  const handledApplicableRunCount = scenarioReports.reduce(
    (sum, scenario) => sum + scenario.handledApplicableRunCount,
    0,
  );
  const applicableHandlingRate = ratio(
    handledApplicableRunCount,
    applicableRunCount,
  );
  const dispositionAccuracy = ratio(
    scenarioReports.filter((scenario) => scenario.dispositionPass).length,
    scenarioReports.length,
  );
  const legacyReceiptParity = ratio(
    scenarioReports.filter((scenario) => scenario.legacyReceiptParityPass)
      .length,
    scenarioReports.length,
  );
  const registeredBattleBehavior = ratio(
    scenarioReports.filter((scenario) => scenario.registeredBattleBehaviorPass)
      .length,
    scenarioReports.length,
  );
  const deterministicDigestStabilityRate = ratio(
    scenarioReports.filter((scenario) => scenario.deterministicStabilityPass)
      .length,
    scenarioReports.length,
  );
  const integratedLocalP95Ms = percentile(allLatencies, 95);
  const danglingReferenceCount = legacyDanglingCount +
    applicabilityDanglingCount;
  const hardInvariantsPass =
    schemaValidityRate === 1 && sourceMutationCount === 0 &&
    authoritativeOutcomeChangeCount === 0 && canonicalCommitCount === 0 &&
    observerLeakCount === 0 && repairMutationCount === 0 &&
    danglingReferenceCount === 0 && temporalFailureCount === 0 &&
    externalLlmCalls === 0;
  const primaryProxiesPass = classificationAccuracy === 1 &&
    applicableStratumCount === 3 && applicableHandlingRate === 1 &&
    dispositionAccuracy === 1 && legacyReceiptParity === 1 &&
    registeredBattleBehavior === 1 &&
    deterministicDigestStabilityRate === 1 && integratedLocalP95Ms <= 50;
  const registeredRepetitionCount = repetitions === REGISTERED_REPETITIONS &&
    totalRuns === 7 * REGISTERED_REPETITIONS;
  const allRequiredGatesPass = registeredRepetitionCount &&
    hardInvariantsPass && primaryProxiesPass;
  const decision = decisionFor({
    registeredRepetitionCount,
    hardInvariantsPass,
    primaryProxiesPass,
  });
  if ((decision.label === "supported") !== allRequiredGatesPass) {
    throw new Error("applicability decision disagrees with registered gates");
  }

  const evaluatorPath = path.relative(
    repositoryRoot,
    fileURLToPath(import.meta.url),
  );
  const [
    protocol,
    evaluator,
    classifier,
    constructionWrapper,
    frozenEvaluation,
  ] = await Promise.all([
    fileEvidence(PROTOCOL_PATH),
    fileEvidence(evaluatorPath),
    fileEvidence(CLASSIFIER_PATH),
    fileEvidence(CONSTRUCTION_WRAPPER_PATH),
    fileEvidence(FROZEN_EVALUATION_PATH),
  ]);
  const frozenEvaluationRaw = JSON.parse(await fs.readFile(
    path.join(repositoryRoot, FROZEN_EVALUATION_PATH),
    "utf8",
  )) as { integrity?: { contentDigest?: string } };
  const frozenContentDigest = DigestSchema.parse(
    frozenEvaluationRaw.integrity?.contentDigest,
  );
  const projectionBytes = scenarioReports.map((scenario) =>
    scenario.representativeReceipt.metrics.projectionBytes
  );
  const componentBytes = scenarioReports.map((scenario) =>
    scenario.representativeReceipt.metrics.componentPayloadBytes
  );
  const reportWithoutIntegrity = EvaluationWithoutIntegritySchema.parse({
    schemaVersion: 1,
    mode: "conflict_handling_applicability_evaluation",
    evaluatedAt: (input.now?.() ?? new Date()).toISOString(),
    fixtureVersion: construction.fixtureVersion,
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      protocol,
      evaluator,
      classifier,
      constructionWrapper,
      frozenEvaluation: {
        ...frozenEvaluation,
        contentDigest: frozenContentDigest,
      },
      frozenParentVerified: true,
    },
    execution: {
      scenarioCount: 7,
      repetitionsPerScenario: repetitions,
      totalRuns,
      derivedTranscriptPersisted: false,
      evaluatorExternalLlmCalls: 0,
      evaluatorXaiCalls: 0,
      canonicalCommitCount,
    },
    thresholds: CONFLICT_HANDLING_APPLICABILITY_THRESHOLDS,
    scenarios: scenarioReports,
    aggregate: {
      schemaValidityRate,
      sourceMutationCount,
      authoritativeOutcomeChangeCount,
      canonicalCommitCount,
      observerCanonicalIdentifierLeakCount: observerLeakCount,
      outOfScopeRepairMutationCount: repairMutationCount,
      legacyCausalOrComponentDanglingReferenceCount: legacyDanglingCount,
      applicabilityDanglingReferenceCount: applicabilityDanglingCount,
      danglingReferenceCount,
      temporalAtomicityFailureCount: temporalFailureCount,
      externalLlmCalls,
      xaiCalls: 0,
      classificationAccuracy,
      applicableStratumCount,
      applicableRunCount,
      handledApplicableRunCount,
      applicableHandlingRate,
      dispositionAccuracy,
      legacyReceiptParity,
      registeredBattleBehavior,
      deterministicDigestStabilityRate,
      integratedLocalP95Ms,
      legacyExplicitConflictOrUnknownHandlingRate: ratio(
        legacyExplicitCount,
        totalRuns,
      ),
      minReceiptBytes: Math.min(...allReceiptBytes),
      maxReceiptBytes: Math.max(...allReceiptBytes),
      minProjectionBytes: Math.min(...projectionBytes),
      maxProjectionBytes: Math.max(...projectionBytes),
      minComponentPayloadBytes: Math.min(...componentBytes),
      maxComponentPayloadBytes: Math.max(...componentBytes),
      generationTokensMeasured: false,
      generationLatencyMeasured: false,
      hardInvariantsPass,
      primaryProxiesPass,
    },
    gates: {
      registeredRepetitionCount,
      exactSevenClassifications: classificationAccuracy === 1,
      exactThreeApplicableStrata: applicableStratumCount === 3,
      applicableHandlingComplete: applicableHandlingRate === 1,
      exactSevenDispositions: dispositionAccuracy === 1,
      legacyParitySevenOfSeven: legacyReceiptParity === 1,
      registeredBattleBehaviorSevenOfSeven: registeredBattleBehavior === 1,
      deterministicStability: deterministicDigestStabilityRate === 1,
      localP95WithinBudget: integratedLocalP95Ms <= 50,
      hardInvariantsPass,
      externalLlmAndXaiCallsZero: externalLlmCalls === 0,
      allRequiredGatesPass,
    },
    decision,
    nonClaims: [
      "Supported means only that the additive applicability contract passed this frozen seven-stratum corpus and fixed rubric; it does not prove objective battle correctness.",
      "The result does not establish classification quality for unseen turns or global canonical consistency.",
      "The prior corrective replay revise decision remains unchanged; its legacy diagnostic is not reinterpreted retroactively.",
      "Character and world inputs remain pre-authored, so generation tokens and generation latency remain unmeasured.",
      "Local latency excludes provider, persistence, concurrency, network, release, and deployment behavior.",
      "This evaluation performs no runtime wiring, BattleState mutation, canonical commit, database change, provider call, XAI call, release, or deployment.",
    ],
  });
  const report = ConflictHandlingApplicabilityEvaluationReportSchema.parse({
    ...reportWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(reportWithoutIntegrity),
    },
  });
  if (!verifyConflictHandlingApplicabilityEvaluationContentDigest(report)) {
    throw new Error("applicability evaluation content digest mismatch");
  }
  return report;
}

function parseArgs(args: string[]): {
  repetitions?: number;
  outputPath?: string;
} {
  const parsed: { repetitions?: number; outputPath?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--repetitions") {
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
  const report = await evaluateBattleConflictHandlingApplicability({
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[conflict-handling-applicability] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
