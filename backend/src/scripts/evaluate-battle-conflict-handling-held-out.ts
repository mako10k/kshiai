import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ConflictHandlingTriggerKindSchema,
  ConflictHandlingV2Schema,
  IntegratedShadowTurnInputSchema,
  IntegratedShadowTurnReceiptV2Schema,
  auditConflictHandlingV2References,
  buildIntegratedShadowTurnReceiptV2,
  classifyConflictHandlingApplicability,
  projectLegacyIntegratedShadowTurnReceipt,
} from "@kshiai/shared";
import {
  ConflictHandlingHeldOutCorpusSchema,
  verifyConflictHandlingHeldOutCorpusContentDigest,
  verifyConflictHandlingHeldOutCorpusCurrentSources,
  verifyConflictHandlingHeldOutFrozenLineage,
} from "./build-battle-conflict-handling-held-out-corpus.js";
import {
  buildBattleConflictHandlingApplicabilityReceipts,
} from "./build-battle-conflict-handling-applicability-receipts.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const PROTOCOL_PATH =
  "docs/battle-pipeline-conflict-handling-generalization-protocol.md";
const CORPUS_PATH =
  "docs/evidence/battle-pipeline-conflict-handling-held-out-fixtures-v1.json";
const CORPUS_BUILDER_PATH =
  "backend/src/scripts/build-battle-conflict-handling-held-out-corpus.ts";
const CLASSIFIER_PATH =
  "packages/shared/src/battle-conflict-handling-applicability.ts";
const RECEIPT_BUILDER_PATH =
  "backend/src/scripts/build-battle-conflict-handling-applicability-receipts.ts";
const REGISTERED_REPETITIONS = 20;

export const CONFLICT_HANDLING_HELD_OUT_THRESHOLDS = {
  schemaValidityMinimum: 1,
  frozenLineageSourceMatchMinimum: 1,
  sourceMutationMaximum: 0,
  authoritativeOutcomeChangeMaximum: 0,
  legacyReceiptMutationMaximum: 0,
  canonicalCommitMaximum: 0,
  externalLlmCallMaximum: 0,
  xaiCallMaximum: 0,
  integrationDanglingReferenceMaximum: 0,
  exactClassifierLabelCaseMinimum: 30,
  exactTriggerKindSetCaseMinimum: 30,
  triggerKindRecallMinimum: 1,
  noTriggerSpecificityCaseMinimum: 4,
  missingRecallCaseMinimum: 8,
  handledAccuracyCaseMinimum: 18,
  dispositionAccuracyCaseMinimum: 30,
  multiTriggerInterferenceCaseMinimum: 6,
  integrationControlMinimum: 6,
  integrationLegacyParityMinimum: 6,
  deterministicStableCaseMinimum: 36,
  classifierLocalP95MsMaximum: 5,
  integrationLocalP95MsMaximum: 50,
  unsupportedTriggerFalseNegativeRateMinimum: 0.2,
} as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const FileEvidenceSchema = z.object({
  path: z.string().min(1),
  fileSha256: DigestSchema,
}).strict();
const ExpectedSchema = z.object({
  triggerKinds: z.array(ConflictHandlingTriggerKindSchema).max(5),
  applicability: z.enum(["not_applicable", "required"]),
  handling: z.enum(["not_applicable", "handled", "missing"]),
  availability: z.enum(["unavailable", "available"]),
  disposition: z.enum([
    "unavailable",
    "not_needed",
    "used",
    "available_unhandled",
  ]),
}).strict();
const FamilySchema = z.enum([
  "no_trigger",
  "selected_fallback",
  "contested_claim",
  "conflicted_read",
  "degraded",
  "exhausted",
  "interference",
]);

const ClassifierRunSchema = z.object({
  repetition: z.number().int().positive(),
  outputDigest: DigestSchema,
  latencyMs: z.number().nonnegative(),
  outputBytes: z.number().int().positive(),
  schemaValid: z.literal(true),
  inputUnchanged: z.boolean(),
  actualTriggerKinds: z.array(ConflictHandlingTriggerKindSchema).max(5),
  labelMatches: z.boolean(),
  triggerKindsMatch: z.boolean(),
  expectedTriggersPresent: z.boolean(),
  dispositionMatches: z.boolean(),
}).strict();

const ClassifierCaseEvaluationSchema = z.object({
  caseId: z.string().min(1),
  family: FamilySchema,
  expected: ExpectedSchema,
  representativeOutput: ConflictHandlingV2Schema,
  runs: z.array(ClassifierRunSchema).min(1).max(100),
  distinctOutputDigests: z.number().int().positive(),
  p95LatencyMs: z.number().nonnegative(),
  labelPass: z.boolean(),
  triggerKindsPass: z.boolean(),
  expectedTriggerRecallPass: z.boolean(),
  dispositionPass: z.boolean(),
  deterministicStabilityPass: z.boolean(),
}).strict();

const IntegrationRunSchema = z.object({
  repetition: z.number().int().positive(),
  receiptDigest: DigestSchema,
  legacyProjectionDigest: DigestSchema,
  latencyMs: z.number().nonnegative(),
  receiptBytes: z.number().int().positive(),
  schemaValid: z.literal(true),
  labelMatches: z.boolean(),
  triggerKindsMatch: z.boolean(),
  legacyProjectionParity: z.boolean(),
  sourceUnchanged: z.boolean(),
  authoritativeOutcomeUnchanged: z.boolean(),
  legacyReceiptUnchanged: z.boolean(),
  transformOnlyAllowedFallbacks: z.boolean(),
  danglingReferenceCount: z.number().int().nonnegative(),
  canonicalCommitCount: z.number().int().nonnegative(),
  externalLlmCallCount: z.number().int().nonnegative(),
  hardInvariantsPass: z.boolean(),
}).strict();

const IntegrationEvaluationSchema = z.object({
  controlId: z.string().min(1),
  baseScenarioId: z.string().min(1),
  allowedFallbacks: z.array(z.enum([
    "defense",
    "intermediate",
    "weak",
    "unknown",
  ])).max(4),
  expected: ExpectedSchema,
  representativeReceipt: IntegratedShadowTurnReceiptV2Schema,
  runs: z.array(IntegrationRunSchema).min(1).max(100),
  distinctReceiptDigests: z.number().int().positive(),
  p95LatencyMs: z.number().nonnegative(),
  classificationPass: z.boolean(),
  legacyProjectionParityPass: z.boolean(),
  deterministicStabilityPass: z.boolean(),
  hardInvariantsPass: z.boolean(),
}).strict();

const TriggerRecallSchema = z.object({
  triggerKind: ConflictHandlingTriggerKindSchema,
  registeredCaseCount: z.number().int().positive(),
  expectedRunCount: z.number().int().positive(),
  matchedRunCount: z.number().int().nonnegative(),
  recall: z.number().min(0).max(1),
}).strict();

const DistributionSchema = z.object({
  total: z.number().int().nonnegative(),
  notApplicable: z.number().int().nonnegative(),
  required: z.number().int().nonnegative(),
  handled: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  handlingNotApplicable: z.number().int().nonnegative(),
  dispositionUnavailable: z.number().int().nonnegative(),
  dispositionNotNeeded: z.number().int().nonnegative(),
  dispositionUsed: z.number().int().nonnegative(),
  dispositionAvailableUnhandled: z.number().int().nonnegative(),
  multiTriggerInterference: z.number().int().nonnegative(),
  integrationControls: z.number().int().nonnegative(),
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
  mode: z.literal("conflict_handling_held_out_generalization_evaluation"),
  evaluatedAt: z.string().datetime(),
  fixtureVersion: z.literal(
    "battle-pipeline-conflict-handling-held-out-v1",
  ),
  provenance: z.object({
    gitHead: z.string().min(1),
    workingTreeDirty: z.boolean(),
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
    protocol: FileEvidenceSchema,
    evaluator: FileEvidenceSchema,
    corpus: FileEvidenceSchema.extend({
      contentDigest: DigestSchema,
    }).strict(),
    corpusBuilder: FileEvidenceSchema,
    classifier: FileEvidenceSchema,
    receiptBuilder: FileEvidenceSchema,
    frozenLineageVerified: z.literal(true),
    corpusContentDigestVerified: z.literal(true),
    corpusCurrentSourcesVerified: z.literal(true),
  }).strict(),
  execution: z.object({
    classifierCaseCount: z.literal(30),
    integrationControlCount: z.literal(6),
    repetitionsPerCase: z.number().int().min(1).max(100),
    classifierRuns: z.number().int().positive(),
    integrationRuns: z.number().int().positive(),
    totalRuns: z.number().int().positive(),
    evaluatorExternalLlmCalls: z.literal(0),
    evaluatorXaiCalls: z.literal(0),
    generationTokensMeasured: z.literal(false),
    generationLatencyMeasured: z.literal(false),
  }).strict(),
  thresholds: z.object({
    schemaValidityMinimum: z.literal(1),
    frozenLineageSourceMatchMinimum: z.literal(1),
    sourceMutationMaximum: z.literal(0),
    authoritativeOutcomeChangeMaximum: z.literal(0),
    legacyReceiptMutationMaximum: z.literal(0),
    canonicalCommitMaximum: z.literal(0),
    externalLlmCallMaximum: z.literal(0),
    xaiCallMaximum: z.literal(0),
    integrationDanglingReferenceMaximum: z.literal(0),
    exactClassifierLabelCaseMinimum: z.literal(30),
    exactTriggerKindSetCaseMinimum: z.literal(30),
    triggerKindRecallMinimum: z.literal(1),
    noTriggerSpecificityCaseMinimum: z.literal(4),
    missingRecallCaseMinimum: z.literal(8),
    handledAccuracyCaseMinimum: z.literal(18),
    dispositionAccuracyCaseMinimum: z.literal(30),
    multiTriggerInterferenceCaseMinimum: z.literal(6),
    integrationControlMinimum: z.literal(6),
    integrationLegacyParityMinimum: z.literal(6),
    deterministicStableCaseMinimum: z.literal(36),
    classifierLocalP95MsMaximum: z.literal(5),
    integrationLocalP95MsMaximum: z.literal(50),
    unsupportedTriggerFalseNegativeRateMinimum: z.literal(0.2),
  }).strict(),
  classifierCases: z.array(ClassifierCaseEvaluationSchema).length(30),
  integrationControls: z.array(IntegrationEvaluationSchema).length(6),
  aggregate: z.object({
    schemaValidityRate: z.number().min(0).max(1),
    frozenLineageSourceMatchRate: z.number().min(0).max(1),
    classifierInputMutationCount: z.number().int().nonnegative(),
    sourceMutationCount: z.number().int().nonnegative(),
    authoritativeOutcomeChangeCount: z.number().int().nonnegative(),
    legacyReceiptMutationCount: z.number().int().nonnegative(),
    canonicalCommitCount: z.number().int().nonnegative(),
    externalLlmCalls: z.number().int().nonnegative(),
    xaiCalls: z.number().int().nonnegative(),
    integrationDanglingReferenceCount: z.number().int().nonnegative(),
    exactClassifierLabelCorrectCases: z.number().int().nonnegative(),
    exactTriggerKindSetCorrectCases: z.number().int().nonnegative(),
    triggerKindRecall: z.array(TriggerRecallSchema).length(5),
    triggerFalseNegativeCount: z.number().int().nonnegative(),
    expectedTriggerRunCount: z.number().int().nonnegative(),
    triggerFalseNegativeRate: z.number().min(0).max(1),
    noTriggerSpecificityCorrectCases: z.number().int().nonnegative(),
    missingRecallCorrectCases: z.number().int().nonnegative(),
    handledAccuracyCorrectCases: z.number().int().nonnegative(),
    dispositionAccuracyCorrectCases: z.number().int().nonnegative(),
    expectedDistribution: DistributionSchema,
    actualDistribution: DistributionSchema,
    expectedDistributionParity: z.boolean(),
    multiTriggerInterferenceCorrectCases: z.number().int().nonnegative(),
    integrationExtractionCorrectControls: z.number().int().nonnegative(),
    integrationLegacyParityControls: z.number().int().nonnegative(),
    deterministicStableCases: z.number().int().nonnegative(),
    classifierLocalP95Ms: z.number().nonnegative(),
    integrationLocalP95Ms: z.number().nonnegative(),
    fixtureBytes: z.number().int().positive(),
    minClassifierOutputBytes: z.number().int().positive(),
    maxClassifierOutputBytes: z.number().int().positive(),
    minIntegrationReceiptBytes: z.number().int().positive(),
    maxIntegrationReceiptBytes: z.number().int().positive(),
    hardInvariantsPass: z.boolean(),
    primaryProxiesPass: z.boolean(),
  }).strict(),
  gates: z.object({
    registeredRepetitionCount: z.boolean(),
    schemaValidityComplete: z.boolean(),
    frozenLineageAndSourcesMatch: z.boolean(),
    mutationAndAuthorityBoundariesClean: z.boolean(),
    externalLlmAndXaiCallsZero: z.boolean(),
    integrationReferencesComplete: z.boolean(),
    exactThirtyClassifierLabels: z.boolean(),
    exactThirtyTriggerKindSets: z.boolean(),
    everyTriggerKindRecallComplete: z.boolean(),
    exactFourNoTriggerControls: z.boolean(),
    exactEightMissingCases: z.boolean(),
    exactEighteenHandledCases: z.boolean(),
    exactThirtyDispositions: z.boolean(),
    expectedDistributionParity: z.boolean(),
    exactSixInterferenceCases: z.boolean(),
    exactSixIntegrationControls: z.boolean(),
    legacyProjectionParitySixOfSix: z.boolean(),
    deterministicStability: z.boolean(),
    classifierLocalP95WithinBudget: z.boolean(),
    integrationLocalP95WithinBudget: z.boolean(),
    hardInvariantsPass: z.boolean(),
    primaryProxiesPass: z.boolean(),
    allRequiredGatesPass: z.boolean(),
  }).strict(),
  decision: DecisionSchema,
  nonClaims: z.array(z.string().min(1)).min(1),
}).strict();

export const ConflictHandlingHeldOutEvaluationReportSchema =
  EvaluationWithoutIntegritySchema.extend({
    integrity: z.object({
      algorithm: z.literal("sha256"),
      basis: z.literal("canonical report excluding integrity"),
      contentDigest: DigestSchema,
    }).strict(),
  }).strict();
export type ConflictHandlingHeldOutEvaluationReport = z.infer<
  typeof ConflictHandlingHeldOutEvaluationReportSchema
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

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: readonly number[], target: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(target / 100 * sorted.length) - 1);
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

function actualLabels(
  output: z.infer<typeof ConflictHandlingV2Schema>,
): Omit<z.infer<typeof ExpectedSchema>, "triggerKinds"> {
  return {
    applicability: output.applicability.status,
    handling: output.handling.status,
    availability: output.capability.availability,
    disposition: output.capability.disposition,
  };
}

function labelsMatch(
  output: z.infer<typeof ConflictHandlingV2Schema>,
  expected: z.infer<typeof ExpectedSchema>,
): boolean {
  const actual = actualLabels(output);
  return actual.applicability === expected.applicability &&
    actual.handling === expected.handling &&
    actual.availability === expected.availability &&
    actual.disposition === expected.disposition;
}

function triggerKindsMatch(
  output: z.infer<typeof ConflictHandlingV2Schema>,
  expected: z.infer<typeof ExpectedSchema>,
): boolean {
  return canonicalJson(output.applicability.triggerKinds) ===
    canonicalJson(expected.triggerKinds);
}

function distributionFor(input: {
  outputs: Array<z.infer<typeof ConflictHandlingV2Schema>>;
  interferenceCount: number;
  integrationControlCount: number;
}): z.infer<typeof DistributionSchema> {
  const count = (
    predicate: (output: z.infer<typeof ConflictHandlingV2Schema>) => boolean,
  ) => input.outputs.filter(predicate).length;
  return DistributionSchema.parse({
    total: input.outputs.length,
    notApplicable: count((output) =>
      output.applicability.status === "not_applicable"
    ),
    required: count((output) => output.applicability.status === "required"),
    handled: count((output) => output.handling.status === "handled"),
    missing: count((output) => output.handling.status === "missing"),
    handlingNotApplicable: count((output) =>
      output.handling.status === "not_applicable"
    ),
    dispositionUnavailable: count((output) =>
      output.capability.disposition === "unavailable"
    ),
    dispositionNotNeeded: count((output) =>
      output.capability.disposition === "not_needed"
    ),
    dispositionUsed: count((output) =>
      output.capability.disposition === "used"
    ),
    dispositionAvailableUnhandled: count((output) =>
      output.capability.disposition === "available_unhandled"
    ),
    multiTriggerInterference: input.interferenceCount,
    integrationControls: input.integrationControlCount,
  });
}

function decisionFor(input: {
  registeredRepetitionCount: boolean;
  frozenLineageAndSourcesMatch: boolean;
  hardInvariantsPass: boolean;
  primaryProxiesPass: boolean;
  triggerFalseNegativeRate: number;
}): z.infer<typeof DecisionSchema> {
  const blockingFindings: string[] = [];
  let label: z.infer<typeof DecisionSchema>["label"];
  let reason: string;
  if (!input.registeredRepetitionCount) {
    label = "indeterminate";
    reason = "The registered twenty repetitions for all thirty-six inputs were not run.";
    blockingFindings.push("Registered repetition count is incomplete.");
  } else if (!input.frozenLineageAndSourcesMatch) {
    label = "indeterminate";
    reason = "Frozen fixture lineage or current source identity is incomplete.";
    blockingFindings.push("Frozen lineage or source identity did not match.");
  } else if (
    !input.hardInvariantsPass ||
    input.triggerFalseNegativeRate >=
      CONFLICT_HANDLING_HELD_OUT_THRESHOLDS
        .unsupportedTriggerFalseNegativeRateMinimum
  ) {
    label = "unsupported";
    reason = "An authority boundary failed or trigger false negatives reached the fixed unsupported threshold.";
    if (!input.hardInvariantsPass) {
      blockingFindings.push("One or more hard invariants failed.");
    }
    if (
      input.triggerFalseNegativeRate >=
        CONFLICT_HANDLING_HELD_OUT_THRESHOLDS
          .unsupportedTriggerFalseNegativeRateMinimum
    ) {
      blockingFindings.push(
        "Trigger false negatives reached at least twenty percent.",
      );
    }
  } else if (!input.primaryProxiesPass) {
    label = "revise";
    reason = "Hard boundaries passed, but one or more fixed held-out effectiveness proxies failed.";
    blockingFindings.push(
      "One or more primary held-out effectiveness proxies failed.",
    );
  } else {
    label = "supported";
    reason = "All hard invariants and fixed effectiveness proxies passed over thirty-six inputs and 720 runs.";
  }
  return DecisionSchema.parse({
    label,
    reason,
    blockingFindings,
    externalReview: {
      required: false,
      performed: false,
      providerCalls: 0,
      reason: "Every registered gate is a strict structured comparison, so external LLM or XAI review cannot strengthen this result.",
    },
  });
}

export function verifyConflictHandlingHeldOutEvaluationContentDigest(
  raw: unknown,
): boolean {
  const report = ConflictHandlingHeldOutEvaluationReportSchema.parse(raw);
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

export async function verifyConflictHandlingHeldOutEvaluationCurrentSources(
  raw: unknown,
): Promise<boolean> {
  const report = ConflictHandlingHeldOutEvaluationReportSchema.parse(raw);
  const expected = [
    report.provenance.protocol,
    report.provenance.evaluator,
    report.provenance.corpus,
    report.provenance.corpusBuilder,
    report.provenance.classifier,
    report.provenance.receiptBuilder,
  ];
  const current = await Promise.all(expected.map((item) =>
    fileEvidence(item.path)
  ));
  return current.every((item, index) =>
    item.path === expected[index]!.path &&
    item.fileSha256 === expected[index]!.fileSha256
  );
}

export async function evaluateBattleConflictHandlingHeldOut(input: {
  repetitions?: number;
  now?: () => Date;
  clock?: () => number;
} = {}): Promise<ConflictHandlingHeldOutEvaluationReport> {
  const repetitions = input.repetitions ?? REGISTERED_REPETITIONS;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const corpusText = await fs.readFile(
    path.join(repositoryRoot, CORPUS_PATH),
    "utf8",
  );
  const corpusRaw = JSON.parse(corpusText) as unknown;
  const corpus = ConflictHandlingHeldOutCorpusSchema.parse(corpusRaw);
  const corpusContentDigestVerified =
    verifyConflictHandlingHeldOutCorpusContentDigest(corpusRaw);
  const frozenLineageVerified =
    await verifyConflictHandlingHeldOutFrozenLineage();
  const corpusCurrentSourcesVerified =
    await verifyConflictHandlingHeldOutCorpusCurrentSources(corpusRaw);
  if (
    !corpusContentDigestVerified ||
    !frozenLineageVerified ||
    !corpusCurrentSourcesVerified
  ) {
    throw new Error("frozen held-out corpus lineage or integrity mismatch");
  }

  const baseReceipts =
    await buildBattleConflictHandlingApplicabilityReceipts();
  const baseByScenario = new Map(baseReceipts.cases.map((receiptCase) => [
    receiptCase.scenarioId,
    receiptCase,
  ]));
  const clock = input.clock ?? performance.now.bind(performance);
  const classifierCases: Array<z.infer<
    typeof ClassifierCaseEvaluationSchema
  >> = [];
  const integrationControls: Array<z.infer<
    typeof IntegrationEvaluationSchema
  >> = [];
  const classifierLatencies: number[] = [];
  const classifierOutputBytes: number[] = [];
  const integrationLatencies: number[] = [];
  const integrationReceiptBytes: number[] = [];

  for (const fixture of corpus.cases) {
    const inputDigest = digest(fixture.input);
    const runs: Array<z.infer<typeof ClassifierRunSchema>> = [];
    let representativeOutput: z.infer<typeof ConflictHandlingV2Schema> |
      undefined;
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const startedAt = clock();
      const output = ConflictHandlingV2Schema.parse(
        classifyConflictHandlingApplicability(fixture.input),
      );
      const latencyMs = Math.max(0, clock() - startedAt);
      const outputBytes = Buffer.byteLength(JSON.stringify(output));
      const expectedTriggersPresent = fixture.expected.triggerKinds.every(
        (kind) => output.applicability.triggerKinds.includes(kind),
      );
      representativeOutput ??= output;
      classifierLatencies.push(latencyMs);
      classifierOutputBytes.push(outputBytes);
      runs.push(ClassifierRunSchema.parse({
        repetition,
        outputDigest: digest(output),
        latencyMs,
        outputBytes,
        schemaValid: true,
        inputUnchanged: digest(fixture.input) === inputDigest,
        actualTriggerKinds: output.applicability.triggerKinds,
        labelMatches: labelsMatch(output, fixture.expected),
        triggerKindsMatch: triggerKindsMatch(output, fixture.expected),
        expectedTriggersPresent,
        dispositionMatches:
          output.capability.disposition === fixture.expected.disposition,
      }));
    }
    if (!representativeOutput) throw new Error("classifier case has no output");
    classifierCases.push(ClassifierCaseEvaluationSchema.parse({
      caseId: fixture.caseId,
      family: fixture.family,
      expected: fixture.expected,
      representativeOutput,
      runs,
      distinctOutputDigests:
        new Set(runs.map((run) => run.outputDigest)).size,
      p95LatencyMs: percentile(runs.map((run) => run.latencyMs), 95),
      labelPass: runs.every((run) => run.labelMatches),
      triggerKindsPass: runs.every((run) => run.triggerKindsMatch),
      expectedTriggerRecallPass: runs.every((run) =>
        run.expectedTriggersPresent
      ),
      dispositionPass: runs.every((run) => run.dispositionMatches),
      deterministicStabilityPass:
        new Set(runs.map((run) => run.outputDigest)).size === 1,
    }));
  }

  for (const control of corpus.integrationControls) {
    const base = baseByScenario.get(control.baseScenarioId);
    if (!base) {
      throw new Error(`integration base ${control.baseScenarioId} is absent`);
    }
    const transformedRaw = structuredClone(base.turnInput);
    transformedRaw.expectedBoundaries.allowedFallbacks =
      [...control.allowedFallbacks];
    const transformedInput = IntegratedShadowTurnInputSchema.parse(
      transformedRaw,
    );
    const normalizedTransform = structuredClone(transformedInput);
    normalizedTransform.expectedBoundaries.allowedFallbacks =
      [...base.turnInput.expectedBoundaries.allowedFallbacks];
    const transformOnlyAllowedFallbacks =
      digest(normalizedTransform) === digest(base.turnInput);
    const sourceDigest = digest(base.turnInput.sourceBattleState);
    const authoritativeDigest = digest(base.turnInput.authoritativeOutcome);
    const legacyReceiptDigest = digest(base.legacyReceipt);
    const runs: Array<z.infer<typeof IntegrationRunSchema>> = [];
    let representativeReceipt: z.infer<
      typeof IntegratedShadowTurnReceiptV2Schema
    > | undefined;
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const startedAt = clock();
      const receipt = IntegratedShadowTurnReceiptV2Schema.parse(
        buildIntegratedShadowTurnReceiptV2({
          turnInput: transformedInput,
          receipt: base.legacyReceipt,
        }),
      );
      const latencyMs = Math.max(0, clock() - startedAt);
      const projectedLegacy = projectLegacyIntegratedShadowTurnReceipt(
        receipt,
      );
      const referenceAudit = auditConflictHandlingV2References({
        turnInput: transformedInput,
        receipt,
      });
      const sourceUnchanged =
        !base.legacyReceipt.boundaries.sourceMutated &&
        digest(base.turnInput.sourceBattleState) === sourceDigest;
      const authoritativeOutcomeUnchanged =
        !base.legacyReceipt.boundaries.authoritativeOutcomeChanged &&
        digest(base.turnInput.authoritativeOutcome) === authoritativeDigest;
      const legacyReceiptUnchanged =
        digest(base.legacyReceipt) === legacyReceiptDigest;
      const legacyProjectionParity =
        digest(projectedLegacy) === legacyReceiptDigest;
      const canonicalCommitCount = Number(
        base.legacyReceipt.boundaries.canonicalCommitPerformed,
      );
      const externalLlmCallCount =
        base.legacyReceipt.boundaries.externalLlmCallsMade;
      const hardInvariantsPass = sourceUnchanged &&
        authoritativeOutcomeUnchanged && legacyReceiptUnchanged &&
        transformOnlyAllowedFallbacks && legacyProjectionParity &&
        canonicalCommitCount === 0 && externalLlmCallCount === 0 &&
        referenceAudit.danglingRefs.length === 0;
      const receiptBytes = Buffer.byteLength(JSON.stringify(receipt));
      representativeReceipt ??= receipt;
      integrationLatencies.push(latencyMs);
      integrationReceiptBytes.push(receiptBytes);
      runs.push(IntegrationRunSchema.parse({
        repetition,
        receiptDigest: digest(receipt),
        legacyProjectionDigest: digest(projectedLegacy),
        latencyMs,
        receiptBytes,
        schemaValid: true,
        labelMatches: labelsMatch(
          receipt.conflictHandlingV2,
          control.expected,
        ),
        triggerKindsMatch: triggerKindsMatch(
          receipt.conflictHandlingV2,
          control.expected,
        ),
        legacyProjectionParity,
        sourceUnchanged,
        authoritativeOutcomeUnchanged,
        legacyReceiptUnchanged,
        transformOnlyAllowedFallbacks,
        danglingReferenceCount: referenceAudit.danglingRefs.length,
        canonicalCommitCount,
        externalLlmCallCount,
        hardInvariantsPass,
      }));
    }
    if (!representativeReceipt) {
      throw new Error("integration control has no receipt");
    }
    integrationControls.push(IntegrationEvaluationSchema.parse({
      controlId: control.controlId,
      baseScenarioId: control.baseScenarioId,
      allowedFallbacks: control.allowedFallbacks,
      expected: control.expected,
      representativeReceipt,
      runs,
      distinctReceiptDigests:
        new Set(runs.map((run) => run.receiptDigest)).size,
      p95LatencyMs: percentile(runs.map((run) => run.latencyMs), 95),
      classificationPass: runs.every((run) =>
        run.labelMatches && run.triggerKindsMatch
      ),
      legacyProjectionParityPass: runs.every((run) =>
        run.legacyProjectionParity
      ),
      deterministicStabilityPass:
        new Set(runs.map((run) => run.receiptDigest)).size === 1,
      hardInvariantsPass: runs.every((run) => run.hardInvariantsPass),
    }));
  }

  const classifierRuns = classifierCases.flatMap((fixture) => fixture.runs);
  const integrationRuns = integrationControls.flatMap((control) =>
    control.runs
  );
  const allRuns = [...classifierRuns, ...integrationRuns];
  const triggerKinds = ConflictHandlingTriggerKindSchema.options;
  const triggerKindRecall = triggerKinds.map((triggerKind) => {
    const registeredCases = classifierCases.filter((fixture) =>
      fixture.expected.triggerKinds.includes(triggerKind)
    );
    const expectedRuns = registeredCases.flatMap((fixture) => fixture.runs);
    const matchedRunCount = expectedRuns.filter((run) =>
      run.actualTriggerKinds.includes(triggerKind)
    ).length;
    return TriggerRecallSchema.parse({
      triggerKind,
      registeredCaseCount: registeredCases.length,
      expectedRunCount: expectedRuns.length,
      matchedRunCount,
      recall: ratio(matchedRunCount, expectedRuns.length),
    });
  });
  const expectedTriggerRunCount = triggerKindRecall.reduce(
    (sum, item) => sum + item.expectedRunCount,
    0,
  );
  const matchedTriggerRunCount = triggerKindRecall.reduce(
    (sum, item) => sum + item.matchedRunCount,
    0,
  );
  const triggerFalseNegativeCount =
    expectedTriggerRunCount - matchedTriggerRunCount;
  const triggerFalseNegativeRate = ratio(
    triggerFalseNegativeCount,
    expectedTriggerRunCount,
  );
  const exactClassifierLabelCorrectCases = classifierCases.filter(
    (fixture) => fixture.labelPass,
  ).length;
  const exactTriggerKindSetCorrectCases = classifierCases.filter(
    (fixture) => fixture.triggerKindsPass,
  ).length;
  const noTriggerSpecificityCorrectCases = classifierCases.filter(
    (fixture) =>
      fixture.expected.triggerKinds.length === 0 &&
      fixture.triggerKindsPass &&
      fixture.representativeOutput.applicability.status === "not_applicable"
  ).length;
  const missingRecallCorrectCases = classifierCases.filter((fixture) =>
    fixture.expected.handling === "missing" &&
    fixture.representativeOutput.handling.status === "missing"
  ).length;
  const handledAccuracyCorrectCases = classifierCases.filter((fixture) =>
    fixture.expected.handling === "handled" &&
    fixture.representativeOutput.handling.status === "handled"
  ).length;
  const dispositionAccuracyCorrectCases = classifierCases.filter(
    (fixture) => fixture.dispositionPass,
  ).length;
  const multiTriggerInterferenceCorrectCases = classifierCases.filter(
    (fixture) =>
      fixture.family === "interference" && fixture.labelPass &&
      fixture.triggerKindsPass,
  ).length;
  const integrationExtractionCorrectControls = integrationControls.filter(
    (control) => control.classificationPass,
  ).length;
  const integrationLegacyParityControls = integrationControls.filter(
    (control) => control.legacyProjectionParityPass,
  ).length;
  const deterministicStableCases = classifierCases.filter((fixture) =>
    fixture.deterministicStabilityPass
  ).length + integrationControls.filter((control) =>
    control.deterministicStabilityPass
  ).length;
  const classifierInputMutationCount = classifierRuns.filter((run) =>
    !run.inputUnchanged
  ).length;
  const sourceMutationCount = integrationRuns.filter((run) =>
    !run.sourceUnchanged
  ).length;
  const authoritativeOutcomeChangeCount = integrationRuns.filter((run) =>
    !run.authoritativeOutcomeUnchanged
  ).length;
  const legacyReceiptMutationCount = integrationRuns.filter((run) =>
    !run.legacyReceiptUnchanged || !run.legacyProjectionParity ||
    !run.transformOnlyAllowedFallbacks
  ).length;
  const canonicalCommitCount = integrationRuns.reduce(
    (sum, run) => sum + run.canonicalCommitCount,
    0,
  );
  const externalLlmCalls = integrationRuns.reduce(
    (sum, run) => sum + run.externalLlmCallCount,
    0,
  );
  const integrationDanglingReferenceCount = integrationRuns.reduce(
    (sum, run) => sum + run.danglingReferenceCount,
    0,
  );
  const schemaValidityRate = ratio(
    allRuns.filter((run) => run.schemaValid).length,
    allRuns.length,
  );
  const frozenLineageSourceMatchRate = Number(
    frozenLineageVerified && corpusContentDigestVerified &&
      corpusCurrentSourcesVerified,
  );
  const expectedDistribution = DistributionSchema.parse(
    corpus.registeredDistribution,
  );
  const actualDistribution = distributionFor({
    outputs: classifierCases.map((fixture) => fixture.representativeOutput),
    interferenceCount: classifierCases.filter((fixture) =>
      fixture.family === "interference"
    ).length,
    integrationControlCount: integrationControls.length,
  });
  const expectedDistributionParity =
    canonicalJson(expectedDistribution) === canonicalJson(actualDistribution);
  const classifierLocalP95Ms = percentile(classifierLatencies, 95);
  const integrationLocalP95Ms = percentile(integrationLatencies, 95);
  const hardInvariantsPass = schemaValidityRate === 1 &&
    frozenLineageSourceMatchRate === 1 && classifierInputMutationCount === 0 &&
    sourceMutationCount === 0 && authoritativeOutcomeChangeCount === 0 &&
    legacyReceiptMutationCount === 0 && canonicalCommitCount === 0 &&
    externalLlmCalls === 0 && integrationDanglingReferenceCount === 0;
  const primaryProxiesPass = exactClassifierLabelCorrectCases === 30 &&
    exactTriggerKindSetCorrectCases === 30 &&
    triggerKindRecall.every((item) => item.recall === 1) &&
    noTriggerSpecificityCorrectCases === 4 &&
    missingRecallCorrectCases === 8 && handledAccuracyCorrectCases === 18 &&
    dispositionAccuracyCorrectCases === 30 && expectedDistributionParity &&
    multiTriggerInterferenceCorrectCases === 6 &&
    integrationExtractionCorrectControls === 6 &&
    integrationLegacyParityControls === 6 &&
    deterministicStableCases === 36 && classifierLocalP95Ms <= 5 &&
    integrationLocalP95Ms <= 50;
  const totalRuns = allRuns.length;
  const registeredRepetitionCount = repetitions === REGISTERED_REPETITIONS &&
    classifierRuns.length === 600 && integrationRuns.length === 120 &&
    totalRuns === 720;
  const allRequiredGatesPass = registeredRepetitionCount &&
    hardInvariantsPass && primaryProxiesPass;
  const decision = decisionFor({
    registeredRepetitionCount,
    frozenLineageAndSourcesMatch: frozenLineageSourceMatchRate === 1,
    hardInvariantsPass,
    primaryProxiesPass,
    triggerFalseNegativeRate,
  });
  if ((decision.label === "supported") !== allRequiredGatesPass) {
    throw new Error("held-out decision disagrees with registered gates");
  }

  const evaluatorPath = path.relative(
    repositoryRoot,
    fileURLToPath(import.meta.url),
  );
  const [protocol, evaluator, corpusEvidence, corpusBuilder, classifier,
    receiptBuilder] = await Promise.all([
    fileEvidence(PROTOCOL_PATH),
    fileEvidence(evaluatorPath),
    fileEvidence(CORPUS_PATH),
    fileEvidence(CORPUS_BUILDER_PATH),
    fileEvidence(CLASSIFIER_PATH),
    fileEvidence(RECEIPT_BUILDER_PATH),
  ]);
  const reportWithoutIntegrity = EvaluationWithoutIntegritySchema.parse({
    schemaVersion: 1,
    mode: "conflict_handling_held_out_generalization_evaluation",
    evaluatedAt: (input.now?.() ?? new Date()).toISOString(),
    fixtureVersion: corpus.fixtureVersion,
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      protocol,
      evaluator,
      corpus: {
        ...corpusEvidence,
        contentDigest: corpus.integrity.contentDigest,
      },
      corpusBuilder,
      classifier,
      receiptBuilder,
      frozenLineageVerified: true,
      corpusContentDigestVerified: true,
      corpusCurrentSourcesVerified: true,
    },
    execution: {
      classifierCaseCount: 30,
      integrationControlCount: 6,
      repetitionsPerCase: repetitions,
      classifierRuns: classifierRuns.length,
      integrationRuns: integrationRuns.length,
      totalRuns,
      evaluatorExternalLlmCalls: 0,
      evaluatorXaiCalls: 0,
      generationTokensMeasured: false,
      generationLatencyMeasured: false,
    },
    thresholds: CONFLICT_HANDLING_HELD_OUT_THRESHOLDS,
    classifierCases,
    integrationControls,
    aggregate: {
      schemaValidityRate,
      frozenLineageSourceMatchRate,
      classifierInputMutationCount,
      sourceMutationCount,
      authoritativeOutcomeChangeCount,
      legacyReceiptMutationCount,
      canonicalCommitCount,
      externalLlmCalls,
      xaiCalls: 0,
      integrationDanglingReferenceCount,
      exactClassifierLabelCorrectCases,
      exactTriggerKindSetCorrectCases,
      triggerKindRecall,
      triggerFalseNegativeCount,
      expectedTriggerRunCount,
      triggerFalseNegativeRate,
      noTriggerSpecificityCorrectCases,
      missingRecallCorrectCases,
      handledAccuracyCorrectCases,
      dispositionAccuracyCorrectCases,
      expectedDistribution,
      actualDistribution,
      expectedDistributionParity,
      multiTriggerInterferenceCorrectCases,
      integrationExtractionCorrectControls,
      integrationLegacyParityControls,
      deterministicStableCases,
      classifierLocalP95Ms,
      integrationLocalP95Ms,
      fixtureBytes: Buffer.byteLength(corpusText),
      minClassifierOutputBytes: Math.min(...classifierOutputBytes),
      maxClassifierOutputBytes: Math.max(...classifierOutputBytes),
      minIntegrationReceiptBytes: Math.min(...integrationReceiptBytes),
      maxIntegrationReceiptBytes: Math.max(...integrationReceiptBytes),
      hardInvariantsPass,
      primaryProxiesPass,
    },
    gates: {
      registeredRepetitionCount,
      schemaValidityComplete: schemaValidityRate === 1,
      frozenLineageAndSourcesMatch: frozenLineageSourceMatchRate === 1,
      mutationAndAuthorityBoundariesClean:
        classifierInputMutationCount === 0 && sourceMutationCount === 0 &&
        authoritativeOutcomeChangeCount === 0 &&
        legacyReceiptMutationCount === 0 && canonicalCommitCount === 0,
      externalLlmAndXaiCallsZero: externalLlmCalls === 0,
      integrationReferencesComplete:
        integrationDanglingReferenceCount === 0,
      exactThirtyClassifierLabels: exactClassifierLabelCorrectCases === 30,
      exactThirtyTriggerKindSets: exactTriggerKindSetCorrectCases === 30,
      everyTriggerKindRecallComplete:
        triggerKindRecall.every((item) => item.recall === 1),
      exactFourNoTriggerControls: noTriggerSpecificityCorrectCases === 4,
      exactEightMissingCases: missingRecallCorrectCases === 8,
      exactEighteenHandledCases: handledAccuracyCorrectCases === 18,
      exactThirtyDispositions: dispositionAccuracyCorrectCases === 30,
      expectedDistributionParity,
      exactSixInterferenceCases: multiTriggerInterferenceCorrectCases === 6,
      exactSixIntegrationControls:
        integrationExtractionCorrectControls === 6,
      legacyProjectionParitySixOfSix:
        integrationLegacyParityControls === 6,
      deterministicStability: deterministicStableCases === 36,
      classifierLocalP95WithinBudget: classifierLocalP95Ms <= 5,
      integrationLocalP95WithinBudget: integrationLocalP95Ms <= 50,
      hardInvariantsPass,
      primaryProxiesPass,
      allRequiredGatesPass,
    },
    decision,
    nonClaims: [
      "Held-out means thirty independently frozen envelopes beyond the prior seven strata, not blind real-world turns or a deployment distribution.",
      "Supported does not prove objective battle correctness, complete conflict detection, or global canonical consistency.",
      "The corpus does not measure psychology, experience, intent, world-process, or narration semantic quality.",
      "Generation tokens and generation latency are unmeasured because all inputs and gates are deterministic structured data.",
      "Local latency excludes provider, persistence, concurrency, network, production, release, and deployment behavior.",
      "This evaluation performs no runtime wiring, BattleState mutation, canonical commit, database change, external LLM call, XAI call, release, or deployment.",
    ],
  });
  const report = ConflictHandlingHeldOutEvaluationReportSchema.parse({
    ...reportWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(reportWithoutIntegrity),
    },
  });
  if (!verifyConflictHandlingHeldOutEvaluationContentDigest(report)) {
    throw new Error("held-out evaluation content digest mismatch");
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
  const report = await evaluateBattleConflictHandlingHeldOut({
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[conflict-handling-held-out] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
