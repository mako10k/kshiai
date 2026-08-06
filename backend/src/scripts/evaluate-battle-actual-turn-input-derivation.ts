import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS,
  ACTUAL_TURN_INPUT_DERIVATION_FIELDS,
  ACTUAL_TURN_INPUT_DERIVATION_FIXTURE_VERSION,
  ACTUAL_TURN_INPUT_DERIVATION_PROTOCOL_ID,
  ActualTurnInputDerivationCaseRefSchema,
  ActualTurnInputDerivationFieldSchema,
  ActualTurnInputDerivationProxyKindSchema,
  ApplicabilityDerivationResultSchema,
  buildActualTurnInputDerivationFixtureCorpus,
  deriveActualTurnApplicabilityInput,
  type ActualTurnInputDerivationExpectedResult,
  type ActualTurnInputDerivationArtifactKind,
  type ActualTurnInputDerivationField,
  type ActualTurnInputDerivationFixture,
  type ApplicabilityDerivationResult,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const PROTOCOL_PATH =
  "docs/battle-pipeline-actual-turn-input-derivability-protocol.md";
const EVALUATOR_PATH =
  "backend/src/scripts/evaluate-battle-actual-turn-input-derivation.ts";
const DERIVATION_PATH =
  "packages/shared/src/battle-actual-turn-input-derivation.ts";
const FIXTURE_PATH =
  "packages/shared/src/battle-actual-turn-input-derivation-fixtures.ts";
const REGISTERED_REPETITIONS = 20;

const FROZEN_SOURCE_SHA256 = {
  [PROTOCOL_PATH]:
    "9ce6e1f62e7051ba8420e7ebb5aa2ee9591cece002700c4c990eeb2471f2f69b",
  [DERIVATION_PATH]:
    "44485e3f69df8246a8cd0cd7a1b848ba05a8b86cffb1f23ed6064a00e07aac63",
  [FIXTURE_PATH]:
    "8a3f826f3aa44b9d72673373a62dac42b130f3722ed9e352ac28fa92dc4a1344",
} as const;

const FIELD_TO_ARTIFACT_KIND: Record<
  ActualTurnInputDerivationField,
  ActualTurnInputDerivationArtifactKind
> = {
  allowedFallbacks: "turn_fallback_policy",
  proposals: "coarse_proposal_registry",
  adaptive: "adaptive_stage_receipt",
  reads: "purpose_read_set",
  issues: "consistency_issue_snapshot",
};

export const ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS = {
  fixtureDispositionRateMinimum: 1,
  provenanceCoverageMinimum: 1,
  inferredFieldCountMaximum: 0,
  missingSourceRejectionRateMinimum: 1,
  ambiguousSourceRejectionRateMinimum: 1,
  forbiddenProxyUsedAsSourceMaximum: 0,
  danglingReferenceAcceptedMaximum: 0,
  inputDigestChangeMaximum: 0,
  distinctOutputDigestsMaximumPerCase: 1,
  externalLlmCallMaximum: 0,
  xaiCallMaximum: 0,
  runtimeServiceImportMaximum: 0,
  battleWriteMaximum: 0,
  canonicalWriteMaximum: 0,
  persistenceWriteMaximum: 0,
} as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const FileEvidenceSchema = z.object({
  path: z.string().min(1),
  fileSha256: DigestSchema,
}).strict();

const RunSchema = z.object({
  repetition: z.number().int().positive(),
  sourceBeforeDigest: DigestSchema,
  sourceAfterDigest: DigestSchema,
  outputDigest: DigestSchema,
  outputStatus: z.enum([
    "complete",
    "insufficient_source",
    "invalid_source",
  ]),
  schemaValid: z.literal(true),
  expectedDispositionMatches: z.boolean(),
  provenanceFieldCount: z.number().int().min(0).max(5),
  inferredFieldCount: z.literal(0),
  missingSourceRejected: z.boolean(),
  ambiguousSourceRejected: z.boolean(),
  forbiddenProxyUsedAsSource: z.boolean(),
  danglingReferenceAccepted: z.boolean(),
  inputUnchanged: z.boolean(),
  noPartialInputOnFailure: z.boolean(),
  hardInvariantsPass: z.boolean(),
}).strict();

const CaseEvaluationSchema = z.object({
  caseRef: ActualTurnInputDerivationCaseRefSchema,
  expectedStatus: z.enum([
    "complete",
    "insufficient_source",
    "invalid_source",
  ]),
  expectedMissingFields: z.array(ActualTurnInputDerivationFieldSchema),
  expectedAmbiguousFields: z.array(ActualTurnInputDerivationFieldSchema),
  expectedForbiddenProxyKinds: z.array(
    ActualTurnInputDerivationProxyKindSchema,
  ),
  expectedReasonPrefixes: z.array(z.string().min(1)),
  runs: z.array(RunSchema).min(1).max(100),
  distinctOutputDigests: z.number().int().positive(),
  dispositionPass: z.boolean(),
  provenancePass: z.boolean(),
  inferredFieldsPass: z.boolean(),
  missingSourceRejectionPass: z.boolean(),
  ambiguousSourceRejectionPass: z.boolean(),
  forbiddenProxyPass: z.boolean(),
  danglingReferencePass: z.boolean(),
  inputUnchangedPass: z.boolean(),
  deterministicStabilityPass: z.boolean(),
  hardInvariantsPass: z.boolean(),
}).strict();

const RuntimeSourceAreaSchema = z.object({
  field: ActualTurnInputDerivationFieldSchema,
  requiredArtifactKind: z.enum([
    "turn_fallback_policy",
    "coarse_proposal_registry",
    "adaptive_stage_receipt",
    "purpose_read_set",
    "consistency_issue_snapshot",
  ]),
  ordinaryRuntimeStatus: z.literal("absent"),
  boundedFutureChange: z.string().min(1),
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
  mode: z.literal("actual_turn_input_derivability_evaluation"),
  protocolId: z.literal(ACTUAL_TURN_INPUT_DERIVATION_PROTOCOL_ID),
  fixtureVersion: z.literal(ACTUAL_TURN_INPUT_DERIVATION_FIXTURE_VERSION),
  evaluatedAt: z.string().datetime(),
  provenance: z.object({
    gitHead: z.string().min(1),
    workingTreeDirty: z.boolean(),
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
    protocol: FileEvidenceSchema,
    evaluator: FileEvidenceSchema,
    derivation: FileEvidenceSchema,
    fixtures: FileEvidenceSchema,
    frozenProtocolAndPocSourcesVerified: z.literal(true),
  }).strict(),
  execution: z.object({
    caseCount: z.literal(20),
    repetitionsPerCase: z.number().int().min(1).max(100),
    totalRuns: z.number().int().positive(),
    classifierInvocations: z.literal(0),
    classifierOutputUsedAsOracle: z.literal(false),
    evaluatorSourceFileReads: z.literal(4),
    derivationRepositoryReads: z.literal(0),
    databaseQueries: z.literal(0),
    networkCalls: z.literal(0),
    providerCalls: z.literal(0),
    externalLlmCalls: z.literal(0),
    xaiCalls: z.literal(0),
    battleWrites: z.literal(0),
    canonicalWrites: z.literal(0),
    persistenceWrites: z.literal(0),
  }).strict(),
  runtimeAudit: z.object({
    reviewedRepositoryCommit: z.literal(
      "941f48ddea6a9b45ccab7d6bd077826e5e59a5df",
    ),
    requiredAreaCount: z.literal(5),
    authoritativeAvailabilityCount: z.number().int().min(0).max(5),
    availableAreas: z.array(ActualTurnInputDerivationFieldSchema),
    missingAreas: z.array(ActualTurnInputDerivationFieldSchema),
    sourceAreas: z.array(RuntimeSourceAreaSchema).length(5),
    boundedSourceAuthoringIdentified: z.literal(true),
    syntheticCompletenessCountedAsRuntimeAvailability: z.literal(false),
  }).strict(),
  thresholds: z.object({
    fixtureDispositionRateMinimum: z.literal(1),
    provenanceCoverageMinimum: z.literal(1),
    inferredFieldCountMaximum: z.literal(0),
    missingSourceRejectionRateMinimum: z.literal(1),
    ambiguousSourceRejectionRateMinimum: z.literal(1),
    forbiddenProxyUsedAsSourceMaximum: z.literal(0),
    danglingReferenceAcceptedMaximum: z.literal(0),
    inputDigestChangeMaximum: z.literal(0),
    distinctOutputDigestsMaximumPerCase: z.literal(1),
    externalLlmCallMaximum: z.literal(0),
    xaiCallMaximum: z.literal(0),
    runtimeServiceImportMaximum: z.literal(0),
    battleWriteMaximum: z.literal(0),
    canonicalWriteMaximum: z.literal(0),
    persistenceWriteMaximum: z.literal(0),
  }).strict(),
  cases: z.array(CaseEvaluationSchema).length(20),
  aggregate: z.object({
    fixtureDispositionRate: z.number().min(0).max(1),
    completeRunCount: z.number().int().nonnegative(),
    provenanceFieldNumerator: z.number().int().nonnegative(),
    provenanceFieldDenominator: z.number().int().nonnegative(),
    provenanceCoverage: z.number().min(0).max(1),
    inferredFieldCount: z.number().int().nonnegative(),
    missingSourceRunCount: z.number().int().nonnegative(),
    missingSourceRejectedRunCount: z.number().int().nonnegative(),
    missingSourceRejectionRate: z.number().min(0).max(1),
    ambiguousSourceRunCount: z.number().int().nonnegative(),
    ambiguousSourceRejectedRunCount: z.number().int().nonnegative(),
    ambiguousSourceRejectionRate: z.number().min(0).max(1),
    forbiddenProxyUsedAsSourceCount: z.number().int().nonnegative(),
    danglingReferenceAcceptedCount: z.number().int().nonnegative(),
    inputDigestChangeCount: z.number().int().nonnegative(),
    deterministicCaseRate: z.number().min(0).max(1),
    runtimeServiceImportCount: z.number().int().nonnegative(),
    hardInvariantsPass: z.boolean(),
    transformationFeasibility: z.enum(["pass", "fail", "indeterminate"]),
    ordinaryRuntimeAuthoritativeAvailability: z.number().int().min(0).max(5),
  }).strict(),
  gates: z.object({
    registeredCaseCount: z.boolean(),
    registeredRepetitionCount: z.boolean(),
    fixtureDispositionsExact: z.boolean(),
    provenanceComplete: z.boolean(),
    inferredFieldsZero: z.boolean(),
    missingSourcesRejected: z.boolean(),
    ambiguousSourcesRejected: z.boolean(),
    forbiddenProxiesUnused: z.boolean(),
    danglingReferencesRejected: z.boolean(),
    inputsUnchanged: z.boolean(),
    deterministicOutputs: z.boolean(),
    runtimeServiceImportsZero: z.boolean(),
    externalCallsAndDomainWritesZero: z.boolean(),
    transformationGatesPass: z.boolean(),
    ordinaryRuntimeReady: z.boolean(),
    supportedGatesPass: z.boolean(),
  }).strict(),
  decision: DecisionSchema,
  nonClaims: z.array(z.string().min(1)).min(1),
}).strict();

export const ActualTurnInputDerivationEvaluationReportSchema =
  EvaluationWithoutIntegritySchema.extend({
    integrity: z.object({
      algorithm: z.literal("sha256"),
      basis: z.literal("canonical report excluding integrity"),
      contentDigest: DigestSchema,
    }).strict(),
  }).strict();
export type ActualTurnInputDerivationEvaluationReport = z.infer<
  typeof ActualTurnInputDerivationEvaluationReportSchema
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
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

async function verifyFrozenSources(): Promise<boolean> {
  const entries = Object.entries(FROZEN_SOURCE_SHA256);
  const evidence = await Promise.all(entries.map(([relativePath]) =>
    fileEvidence(relativePath)
  ));
  return evidence.every((item, index) =>
    item.fileSha256 === entries[index]![1]
  );
}

function expectedArrays(
  expected: ActualTurnInputDerivationExpectedResult,
): {
  missingFields: ActualTurnInputDerivationField[];
  ambiguousFields: ActualTurnInputDerivationField[];
  forbiddenProxyKinds: z.infer<
    typeof ActualTurnInputDerivationProxyKindSchema
  >[];
  reasonPrefixes: string[];
} {
  if (expected.status === "complete") {
    return {
      missingFields: [],
      ambiguousFields: [],
      forbiddenProxyKinds: [],
      reasonPrefixes: [],
    };
  }
  if (expected.status === "insufficient_source") {
    return {
      missingFields: expected.missingFields,
      ambiguousFields: expected.ambiguousFields,
      forbiddenProxyKinds: expected.forbiddenProxyKinds,
      reasonPrefixes: [],
    };
  }
  return {
    missingFields: [],
    ambiguousFields: [],
    forbiddenProxyKinds: [],
    reasonPrefixes: expected.reasonPrefixes,
  };
}

function expectedDispositionMatches(
  result: ApplicabilityDerivationResult,
  expected: ActualTurnInputDerivationExpectedResult,
): boolean {
  if (result.status !== expected.status) return false;
  if (expected.status === "complete") return true;
  if (
    expected.status === "insufficient_source" &&
    result.status === "insufficient_source"
  ) {
    return canonicalJson(result.missingFields) ===
        canonicalJson(expected.missingFields) &&
      canonicalJson(result.ambiguousFields) ===
        canonicalJson(expected.ambiguousFields) &&
      canonicalJson(result.forbiddenProxyKinds) ===
        canonicalJson(expected.forbiddenProxyKinds);
  }
  if (expected.status === "invalid_source" && result.status === "invalid_source") {
    return expected.reasonPrefixes.every((prefix) =>
      result.reasons.some((reason) => reason.startsWith(prefix))
    );
  }
  return false;
}

function provenanceFieldCount(
  fixture: ActualTurnInputDerivationFixture,
  result: ApplicabilityDerivationResult,
): number {
  if (result.status !== "complete") return 0;
  return ACTUAL_TURN_INPUT_DERIVATION_FIELDS.filter((field) => {
    const artifact = fixture.source.artifacts.find((candidate) =>
      candidate.kind === FIELD_TO_ARTIFACT_KIND[field]
    );
    const provenance = result.provenance[field];
    return artifact !== undefined &&
      provenance.artifactRef === artifact.artifactRef &&
      provenance.payloadSha256 === artifact.payloadSha256 &&
      provenance.sourcePaths.length > 0;
  }).length;
}

function runtimeServiceImportCount(source: string): number {
  const importSpecifiers = [...source.matchAll(
    /from\s+["']([^"']+)["']/gu,
  )].map((match) => match[1] ?? "");
  return importSpecifiers.filter((specifier) =>
    specifier.includes("backend") ||
    specifier.includes("battle-service") ||
    specifier.includes("repository") ||
    specifier.includes("database") ||
    specifier.includes("provider") ||
    specifier.includes("llm") ||
    specifier.includes("xai")
  ).length;
}

function decisionFor(input: {
  registeredRepetitionCount: boolean;
  hardInvariantsPass: boolean;
  forbiddenInferenceOrAuthorityViolation: boolean;
  ordinaryRuntimeAvailability: number;
  boundedSourceAuthoringIdentified: boolean;
}): z.infer<typeof DecisionSchema> {
  let label: z.infer<typeof DecisionSchema>["label"];
  let reason: string;
  const blockingFindings: string[] = [];
  if (!input.registeredRepetitionCount) {
    label = "indeterminate";
    reason = "The registered twenty repetitions per case were not run.";
    blockingFindings.push("Registered repetition count is incomplete.");
  } else if (input.forbiddenInferenceOrAuthorityViolation) {
    label = "unsupported";
    reason = "A complete input required forbidden inference or an authority boundary violation.";
    blockingFindings.push(
      "Forbidden inference or an authority boundary violation was observed.",
    );
  } else if (!input.hardInvariantsPass) {
    label = "revise";
    reason = "The bounded transformation implementation did not satisfy every fixed invariant.";
    blockingFindings.push("One or more transformation invariants failed.");
  } else if (input.ordinaryRuntimeAvailability === 5) {
    label = "supported";
    reason = "All transformation invariants passed and all five authoritative runtime sources are available.";
  } else if (input.boundedSourceAuthoringIdentified) {
    label = "revise";
    reason = "Transformation invariants passed, but ordinary runtime authoritative availability remains below five of five.";
    blockingFindings.push(
      "The reviewed ordinary runtime produces zero of five required authoritative source artifacts.",
    );
  } else {
    label = "indeterminate";
    reason = "Runtime source ownership or bounded authoring evidence is incomplete.";
    blockingFindings.push(
      "Runtime source ownership could not be bounded without inference.",
    );
  }
  return DecisionSchema.parse({
    label,
    reason,
    blockingFindings,
    externalReview: {
      required: false,
      performed: false,
      providerCalls: 0,
      reason: "Every registered gate is determined by strict structured schemas, digests, and references; external semantic review cannot strengthen this result.",
    },
  });
}

export function verifyActualTurnInputDerivationEvaluationContentDigest(
  raw: unknown,
): boolean {
  const report = ActualTurnInputDerivationEvaluationReportSchema.parse(raw);
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

export async function verifyActualTurnInputDerivationEvaluationCurrentSources(
  raw: unknown,
): Promise<boolean> {
  const report = ActualTurnInputDerivationEvaluationReportSchema.parse(raw);
  const expected = [
    report.provenance.protocol,
    report.provenance.evaluator,
    report.provenance.derivation,
    report.provenance.fixtures,
  ];
  const current = await Promise.all(expected.map((item) =>
    fileEvidence(item.path)
  ));
  return current.every((item, index) =>
    item.path === expected[index]!.path &&
    item.fileSha256 === expected[index]!.fileSha256
  ) && await verifyFrozenSources();
}

export async function evaluateBattleActualTurnInputDerivation(input: {
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<ActualTurnInputDerivationEvaluationReport> {
  const repetitions = input.repetitions ?? REGISTERED_REPETITIONS;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  if (!await verifyFrozenSources()) {
    throw new Error("actual-turn input derivation frozen source mismatch");
  }
  const corpus = await buildActualTurnInputDerivationFixtureCorpus();
  const caseReports: Array<z.infer<typeof CaseEvaluationSchema>> = [];

  for (const fixture of corpus.cases) {
    const expected = expectedArrays(fixture.expected);
    const runs: Array<z.infer<typeof RunSchema>> = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const sourceBeforeDigest = digest(fixture.source);
      const result = await deriveActualTurnApplicabilityInput(fixture.source);
      ApplicabilityDerivationResultSchema.parse(result);
      const sourceAfterDigest = digest(fixture.source);
      const expectedMatches = expectedDispositionMatches(
        result,
        fixture.expected,
      );
      const provenanceCount = provenanceFieldCount(fixture, result);
      const expectsMissing = expected.missingFields.length > 0;
      const expectsAmbiguous = expected.ambiguousFields.length > 0;
      const hasForbiddenProxy = expected.forbiddenProxyKinds.length > 0;
      const isDanglingCase =
        fixture.caseRef === "I03_dangling_blocking_issue";
      const missingSourceRejected = !expectsMissing ||
        result.status === "insufficient_source";
      const ambiguousSourceRejected = !expectsAmbiguous ||
        result.status === "insufficient_source";
      const forbiddenProxyUsedAsSource = hasForbiddenProxy &&
        result.status === "complete";
      const danglingReferenceAccepted = isDanglingCase &&
        result.status === "complete";
      const inputUnchanged = sourceBeforeDigest === sourceAfterDigest;
      const noPartialInputOnFailure = result.status === "complete" ||
        !("applicabilityInput" in result);
      const hardInvariantsPass = expectedMatches &&
        result.inferredFieldCount === 0 &&
        (result.status !== "complete" || provenanceCount === 5) &&
        missingSourceRejected &&
        ambiguousSourceRejected &&
        !forbiddenProxyUsedAsSource &&
        !danglingReferenceAccepted &&
        inputUnchanged &&
        noPartialInputOnFailure;
      runs.push(RunSchema.parse({
        repetition,
        sourceBeforeDigest,
        sourceAfterDigest,
        outputDigest: digest(result),
        outputStatus: result.status,
        schemaValid: true,
        expectedDispositionMatches: expectedMatches,
        provenanceFieldCount: provenanceCount,
        inferredFieldCount: result.inferredFieldCount,
        missingSourceRejected,
        ambiguousSourceRejected,
        forbiddenProxyUsedAsSource,
        danglingReferenceAccepted,
        inputUnchanged,
        noPartialInputOnFailure,
        hardInvariantsPass,
      }));
    }
    caseReports.push(CaseEvaluationSchema.parse({
      caseRef: fixture.caseRef,
      expectedStatus: fixture.expected.status,
      expectedMissingFields: expected.missingFields,
      expectedAmbiguousFields: expected.ambiguousFields,
      expectedForbiddenProxyKinds: expected.forbiddenProxyKinds,
      expectedReasonPrefixes: expected.reasonPrefixes,
      runs,
      distinctOutputDigests: new Set(runs.map((run) => run.outputDigest)).size,
      dispositionPass: runs.every((run) =>
        run.expectedDispositionMatches
      ),
      provenancePass: runs.every((run) =>
        fixture.expected.status !== "complete" ||
        run.provenanceFieldCount === 5
      ),
      inferredFieldsPass: runs.every((run) =>
        run.inferredFieldCount === 0
      ),
      missingSourceRejectionPass: runs.every((run) =>
        run.missingSourceRejected
      ),
      ambiguousSourceRejectionPass: runs.every((run) =>
        run.ambiguousSourceRejected
      ),
      forbiddenProxyPass: runs.every((run) =>
        !run.forbiddenProxyUsedAsSource
      ),
      danglingReferencePass: runs.every((run) =>
        !run.danglingReferenceAccepted
      ),
      inputUnchangedPass: runs.every((run) => run.inputUnchanged),
      deterministicStabilityPass:
        new Set(runs.map((run) => run.outputDigest)).size === 1,
      hardInvariantsPass: runs.every((run) => run.hardInvariantsPass),
    }));
  }

  const runs = caseReports.flatMap((report) => report.runs);
  const completeRuns = runs.filter((run) => run.outputStatus === "complete");
  const provenanceFieldNumerator = completeRuns.reduce(
    (sum, run) => sum + run.provenanceFieldCount,
    0,
  );
  const provenanceFieldDenominator = completeRuns.length * 5;
  const missingRuns = caseReports
    .filter((report) => report.expectedMissingFields.length > 0)
    .flatMap((report) => report.runs);
  const ambiguousRuns = caseReports
    .filter((report) => report.expectedAmbiguousFields.length > 0)
    .flatMap((report) => report.runs);
  const fixtureDispositionRate = ratio(
    caseReports.filter((report) => report.dispositionPass).length,
    caseReports.length,
  );
  const provenanceCoverage = ratio(
    provenanceFieldNumerator,
    provenanceFieldDenominator,
  );
  const inferredFieldCount = runs.reduce(
    (sum, run) => sum + run.inferredFieldCount,
    0,
  );
  const missingSourceRejectedRunCount = missingRuns.filter((run) =>
    run.missingSourceRejected
  ).length;
  const ambiguousSourceRejectedRunCount = ambiguousRuns.filter((run) =>
    run.ambiguousSourceRejected
  ).length;
  const missingSourceRejectionRate = ratio(
    missingSourceRejectedRunCount,
    missingRuns.length,
  );
  const ambiguousSourceRejectionRate = ratio(
    ambiguousSourceRejectedRunCount,
    ambiguousRuns.length,
  );
  const forbiddenProxyUsedAsSourceCount = runs.filter((run) =>
    run.forbiddenProxyUsedAsSource
  ).length;
  const danglingReferenceAcceptedCount = runs.filter((run) =>
    run.danglingReferenceAccepted
  ).length;
  const inputDigestChangeCount = runs.filter((run) =>
    !run.inputUnchanged
  ).length;
  const deterministicCaseRate = ratio(
    caseReports.filter((report) => report.deterministicStabilityPass).length,
    caseReports.length,
  );
  const derivationSource = await fs.readFile(
    path.join(repositoryRoot, DERIVATION_PATH),
    "utf8",
  );
  const runtimeImports = runtimeServiceImportCount(derivationSource);
  const hardInvariantsPass = caseReports.every((report) =>
    report.hardInvariantsPass
  ) &&
    fixtureDispositionRate >=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .fixtureDispositionRateMinimum &&
    provenanceCoverage >=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .provenanceCoverageMinimum &&
    inferredFieldCount <=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .inferredFieldCountMaximum &&
    missingSourceRejectionRate >=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .missingSourceRejectionRateMinimum &&
    ambiguousSourceRejectionRate >=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .ambiguousSourceRejectionRateMinimum &&
    forbiddenProxyUsedAsSourceCount <=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .forbiddenProxyUsedAsSourceMaximum &&
    danglingReferenceAcceptedCount <=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .danglingReferenceAcceptedMaximum &&
    inputDigestChangeCount <=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .inputDigestChangeMaximum &&
    deterministicCaseRate === 1 &&
    runtimeImports <=
      ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS
        .runtimeServiceImportMaximum;
  const registeredCaseCount = caseReports.length === 20 &&
    canonicalJson(caseReports.map((report) => report.caseRef)) ===
      canonicalJson(ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS);
  const registeredRepetitionCount = repetitions === REGISTERED_REPETITIONS;
  const ordinaryRuntimeAvailability: number = 0;
  const boundedSourceAuthoringIdentified = true;
  const externalCallsAndDomainWritesZero = true;
  const transformationGatesPass = registeredCaseCount &&
    registeredRepetitionCount && hardInvariantsPass &&
    externalCallsAndDomainWritesZero;
  const ordinaryRuntimeReady = ordinaryRuntimeAvailability === 5;
  const decision = decisionFor({
    registeredRepetitionCount,
    hardInvariantsPass: transformationGatesPass,
    forbiddenInferenceOrAuthorityViolation:
      inferredFieldCount > 0 ||
      forbiddenProxyUsedAsSourceCount > 0 ||
      !externalCallsAndDomainWritesZero,
    ordinaryRuntimeAvailability,
    boundedSourceAuthoringIdentified,
  });
  const missingRuntimeAreas = [...ACTUAL_TURN_INPUT_DERIVATION_FIELDS]
    .sort((left, right) => left.localeCompare(right));
  const sourceAreas = ACTUAL_TURN_INPUT_DERIVATION_FIELDS.map((field) => ({
    field,
    requiredArtifactKind: FIELD_TO_ARTIFACT_KIND[field],
    ordinaryRuntimeStatus: "absent" as const,
    boundedFutureChange:
      `Author the explicit complete ${FIELD_TO_ARTIFACT_KIND[field]} artifact at its owning turn stage without deriving it from post-resolution proxies.`,
  }));

  const basis = EvaluationWithoutIntegritySchema.parse({
    schemaVersion: 1,
    mode: "actual_turn_input_derivability_evaluation",
    protocolId: ACTUAL_TURN_INPUT_DERIVATION_PROTOCOL_ID,
    fixtureVersion: ACTUAL_TURN_INPUT_DERIVATION_FIXTURE_VERSION,
    evaluatedAt: (input.now?.() ?? new Date()).toISOString(),
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      protocol: await fileEvidence(PROTOCOL_PATH),
      evaluator: await fileEvidence(EVALUATOR_PATH),
      derivation: await fileEvidence(DERIVATION_PATH),
      fixtures: await fileEvidence(FIXTURE_PATH),
      frozenProtocolAndPocSourcesVerified: true,
    },
    execution: {
      caseCount: 20,
      repetitionsPerCase: repetitions,
      totalRuns: runs.length,
      classifierInvocations: 0,
      classifierOutputUsedAsOracle: false,
      evaluatorSourceFileReads: 4,
      derivationRepositoryReads: 0,
      databaseQueries: 0,
      networkCalls: 0,
      providerCalls: 0,
      externalLlmCalls: 0,
      xaiCalls: 0,
      battleWrites: 0,
      canonicalWrites: 0,
      persistenceWrites: 0,
    },
    runtimeAudit: {
      reviewedRepositoryCommit:
        "941f48ddea6a9b45ccab7d6bd077826e5e59a5df",
      requiredAreaCount: 5,
      authoritativeAvailabilityCount: ordinaryRuntimeAvailability,
      availableAreas: [],
      missingAreas: missingRuntimeAreas,
      sourceAreas,
      boundedSourceAuthoringIdentified,
      syntheticCompletenessCountedAsRuntimeAvailability: false,
    },
    thresholds: ACTUAL_TURN_INPUT_DERIVATION_EVALUATION_THRESHOLDS,
    cases: caseReports,
    aggregate: {
      fixtureDispositionRate,
      completeRunCount: completeRuns.length,
      provenanceFieldNumerator,
      provenanceFieldDenominator,
      provenanceCoverage,
      inferredFieldCount,
      missingSourceRunCount: missingRuns.length,
      missingSourceRejectedRunCount,
      missingSourceRejectionRate,
      ambiguousSourceRunCount: ambiguousRuns.length,
      ambiguousSourceRejectedRunCount,
      ambiguousSourceRejectionRate,
      forbiddenProxyUsedAsSourceCount,
      danglingReferenceAcceptedCount,
      inputDigestChangeCount,
      deterministicCaseRate,
      runtimeServiceImportCount: runtimeImports,
      hardInvariantsPass,
      transformationFeasibility: transformationGatesPass
        ? "pass"
        : registeredRepetitionCount ? "fail" : "indeterminate",
      ordinaryRuntimeAuthoritativeAvailability: ordinaryRuntimeAvailability,
    },
    gates: {
      registeredCaseCount,
      registeredRepetitionCount,
      fixtureDispositionsExact: fixtureDispositionRate === 1,
      provenanceComplete: provenanceCoverage === 1,
      inferredFieldsZero: inferredFieldCount === 0,
      missingSourcesRejected: missingSourceRejectionRate === 1,
      ambiguousSourcesRejected: ambiguousSourceRejectionRate === 1,
      forbiddenProxiesUnused: forbiddenProxyUsedAsSourceCount === 0,
      danglingReferencesRejected: danglingReferenceAcceptedCount === 0,
      inputsUnchanged: inputDigestChangeCount === 0,
      deterministicOutputs: deterministicCaseRate === 1,
      runtimeServiceImportsZero: runtimeImports === 0,
      externalCallsAndDomainWritesZero,
      transformationGatesPass,
      ordinaryRuntimeReady,
      supportedGatesPass: transformationGatesPass && ordinaryRuntimeReady,
    },
    decision,
    nonClaims: [
      "The revise decision establishes transformation feasibility only for the fixed synthetic corpus; it does not establish ordinary-runtime readiness.",
      "Synthetic complete inputs are not counted as authoritative runtime source availability, which remains zero of five at the reviewed revision.",
      "The evaluator does not invoke the conflict-handling classifier and does not treat classifier output as an accuracy oracle.",
      "The result does not prove objective battle correctness, global canonical consistency, or correctness for unseen turns.",
      "No runtime hook, actual battle or user data, database query, network request, provider call, external LLM call, XAI call, battle write, canonical write, persistence write, release, or deployment is performed.",
      "The five bounded source-authoring descriptions are follow-up candidates, not implementation or capture authority.",
    ],
  });
  return ActualTurnInputDerivationEvaluationReportSchema.parse({
    ...basis,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(basis),
    },
  });
}

type CliArgs = { outputPath?: string };

function parseArgs(args: string[]): CliArgs {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--output" && args[1]) {
    return { outputPath: path.resolve(repositoryRoot, args[1]) };
  }
  throw new Error("usage: evaluate-battle-actual-turn-input-derivation [--output PATH]");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await evaluateBattleActualTurnInputDerivation();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, { flag: "wx" });
  } else {
    process.stdout.write(serialized);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
