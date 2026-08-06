import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  PlanBasisReplayConstructionReportSchema,
  buildPlanBasisCorrectiveReplay,
  normalizedPlanBasisReceiptDigest,
  planBasisReplayDigest,
  verifyPlanBasisReplayConstructionReportContentDigest,
} from "./build-battle-plan-basis-corrective-replay.js";
import {
  INTEGRATED_SHADOW_EVALUATION_THRESHOLDS,
  IntegratedShadowTurnEvaluationReportSchema,
  evaluateBattleIntegratedShadowTurn,
  verifyIntegratedShadowEvaluationContentDigest,
} from "./evaluate-battle-integrated-shadow-turn.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const CONSTRUCTION_EVIDENCE_PATH =
  "docs/evidence/battle-pipeline-plan-basis-corrective-replay-construction-v2-2026-08-06.json";
const PROTOCOL_PATH = "docs/battle-pipeline-plan-basis-replay-protocol.md";
const EVALUATOR_PATH =
  "backend/src/scripts/evaluate-battle-integrated-shadow-turn.ts";
const BUILDER_PATH =
  "backend/src/scripts/build-battle-plan-basis-corrective-replay.ts";
const TARGET_FIXTURE_VERSION =
  "battle-pipeline-integrated-shadow-transcripts-v2";
const REGISTERED_REPETITIONS = 20;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

const CurrentFileEvidenceSchema = z.object({
  path: z.string().min(1),
  fileSha256: DigestSchema,
}).strict();

const ControlEvaluationSchema = z.object({
  scenarioId: z.string().min(1),
  constructionNormalizedReceiptDigest: DigestSchema,
  evaluationNormalizedReceiptDigest: DigestSchema,
  normalizedReceiptIdentical: z.boolean(),
  distinctEvaluationReceiptDigests: z.number().int().positive(),
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

const CorrectiveReplayEvaluationWithoutIntegritySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("integrated_shadow_plan_basis_corrective_evaluation"),
  evaluatedAt: z.string().datetime(),
  provenance: z.object({
    gitHead: z.string().min(1),
    workingTreeDirty: z.boolean(),
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
    protocol: CurrentFileEvidenceSchema,
    constructionEvidence: CurrentFileEvidenceSchema.extend({
      contentDigest: DigestSchema,
    }).strict(),
    wrapper: CurrentFileEvidenceSchema,
    integratedEvaluator: CurrentFileEvidenceSchema,
    replayBuilder: CurrentFileEvidenceSchema,
  }).strict(),
  lineage: z.object({
    parent: PlanBasisReplayConstructionReportSchema.shape.parent,
    delta: PlanBasisReplayConstructionReportSchema.shape.delta,
    target: PlanBasisReplayConstructionReportSchema.shape.target,
    fieldDifferences:
      PlanBasisReplayConstructionReportSchema.shape.fieldDifferences,
    unexpectedFieldDifferenceCount: z.literal(0),
  }).strict(),
  construction: PlanBasisReplayConstructionReportSchema,
  execution: z.object({
    scenarioCount: z.literal(7),
    repetitionsPerScenario: z.number().int().min(1).max(100),
    totalRuns: z.number().int().positive(),
    derivedTranscriptPersisted: z.literal(false),
    evaluatorExternalLlmCalls: z.literal(0),
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
    expectedDependencyRecallMinimum: z.literal(1),
    componentReceiptCoverageMinimum: z.literal(1),
    explicitConflictOrUnknownHandlingMinimum: z.literal(1),
    distinctReceiptDigestsMaximumPerScenario: z.literal(1),
    integratedLocalP95MsMaximum: z.literal(50),
  }).strict(),
  integratedEvaluation: IntegratedShadowTurnEvaluationReportSchema,
  controlEvaluation: z.array(ControlEvaluationSchema).length(6),
  gates: z.object({
    registeredRepetitionCount: z.boolean(),
    exactTwoOperationContract: z.boolean(),
    derivedIntegrityValid: z.boolean(),
    unexpectedFieldDifferenceCountZero: z.boolean(),
    unchangedControlInputs: z.boolean(),
    normalizedControlReceiptParity: z.boolean(),
    hardInvariantsPass: z.boolean(),
    primaryProxiesPass: z.boolean(),
    registeredBehaviorSevenOfSeven: z.boolean(),
    registeredInterruptedBehaviorStable: z.boolean(),
    externalLlmCallsZero: z.boolean(),
    canonicalCommitCountZero: z.boolean(),
    allRequiredGatesPass: z.boolean(),
  }).strict(),
  decision: DecisionSchema,
  nonClaims: z.array(z.string().min(1)).min(1),
}).strict();

export const CorrectiveReplayEvaluationReportSchema =
  CorrectiveReplayEvaluationWithoutIntegritySchema.extend({
    integrity: z.object({
      algorithm: z.literal("sha256"),
      basis: z.literal("canonical report excluding integrity"),
      contentDigest: DigestSchema,
    }).strict(),
  }).strict();
export type CorrectiveReplayEvaluationReport = z.infer<
  typeof CorrectiveReplayEvaluationReportSchema
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
): Promise<z.infer<typeof CurrentFileEvidenceSchema>> {
  const text = await fs.readFile(path.join(repositoryRoot, relativePath), "utf8");
  return CurrentFileEvidenceSchema.parse({
    path: relativePath,
    fileSha256: sha256(text),
  });
}

export function verifyCorrectiveReplayEvaluationContentDigest(
  raw: unknown,
): boolean {
  const report = CorrectiveReplayEvaluationReportSchema.parse(raw);
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

export async function verifyCorrectiveReplayEvaluationCurrentSources(
  raw: unknown,
): Promise<boolean> {
  const report = CorrectiveReplayEvaluationReportSchema.parse(raw);
  const checks = await Promise.all([
    fileEvidence(report.provenance.protocol.path),
    fileEvidence(report.provenance.constructionEvidence.path),
    fileEvidence(report.provenance.wrapper.path),
    fileEvidence(report.provenance.integratedEvaluator.path),
    fileEvidence(report.provenance.replayBuilder.path),
  ]);
  return checks.every((current, index) => {
    const expected = [
      report.provenance.protocol,
      report.provenance.constructionEvidence,
      report.provenance.wrapper,
      report.provenance.integratedEvaluator,
      report.provenance.replayBuilder,
    ][index]!;
    return current.path === expected.path &&
      current.fileSha256 === expected.fileSha256;
  });
}

function decisionFor(input: {
  registeredRepetitionCount: boolean;
  hardInvariantsPass: boolean;
  primaryProxiesPass: boolean;
  exactCorrectionPass: boolean;
  behaviorPass: boolean;
}): z.infer<typeof DecisionSchema> {
  let label: z.infer<typeof DecisionSchema>["label"];
  let reason: string;
  const blockingFindings: string[] = [];
  if (!input.registeredRepetitionCount) {
    label = "indeterminate";
    reason = "The registered twenty repetitions per scenario were not run.";
    blockingFindings.push("Registered repetition count is incomplete.");
  } else if (!input.hardInvariantsPass || !input.exactCorrectionPass) {
    label = "unsupported";
    reason = "An authority invariant or the bounded correction contract failed.";
    if (!input.hardInvariantsPass) {
      blockingFindings.push("One or more hard invariants failed.");
    }
    if (!input.exactCorrectionPass) {
      blockingFindings.push(
        "The exact delta, control parity, or interrupted receipt contract failed.",
      );
    }
  } else if (!input.primaryProxiesPass || !input.behaviorPass) {
    label = "revise";
    reason = "Hard boundaries passed, but a primary proxy or registered behavior needs another bounded revision.";
    if (!input.primaryProxiesPass) {
      blockingFindings.push("One or more primary proxies failed.");
    }
    if (!input.behaviorPass) {
      blockingFindings.push("One or more registered behaviors failed.");
    }
  } else {
    label = "supported";
    reason = "All unchanged hard invariants, primary proxies, seven registered behaviors, six control comparisons, and the exact interrupted receipt passed.";
  }
  return DecisionSchema.parse({
    label,
    reason,
    blockingFindings,
    externalReview: {
      required: false,
      performed: false,
      providerCalls: 0,
      reason: "All registered gates are strict structured fields; external semantic preference review cannot strengthen this structural result.",
    },
  });
}

export async function evaluateBattlePlanBasisCorrectiveReplay(input: {
  repetitions?: number;
  now?: () => Date;
  clock?: () => number;
} = {}): Promise<CorrectiveReplayEvaluationReport> {
  const repetitions = input.repetitions ?? REGISTERED_REPETITIONS;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const constructionEvidencePath = path.join(
    repositoryRoot,
    CONSTRUCTION_EVIDENCE_PATH,
  );
  const constructionEvidenceText = await fs.readFile(
    constructionEvidencePath,
    "utf8",
  );
  const constructionEvidenceRaw = JSON.parse(
    constructionEvidenceText,
  ) as unknown;
  const constructionEvidence = PlanBasisReplayConstructionReportSchema.parse(
    constructionEvidenceRaw,
  );
  if (!verifyPlanBasisReplayConstructionReportContentDigest(
    constructionEvidenceRaw,
  )) {
    throw new Error("frozen construction evidence content digest mismatch");
  }

  const construction = await buildPlanBasisCorrectiveReplay({
    now: () => new Date(constructionEvidence.builtAt),
  });
  if (canonicalJson(construction.report) !== canonicalJson(constructionEvidence)) {
    throw new Error("current corrective construction does not match frozen evidence");
  }
  if (construction.targetTranscript.fixtureVersion !== TARGET_FIXTURE_VERSION) {
    throw new Error("derived transcript version does not match the v2 protocol");
  }

  const integratedEvaluation = await evaluateBattleIntegratedShadowTurn({
    transcriptReport: construction.targetTranscript,
    transcriptPathLabel: `in-memory:${TARGET_FIXTURE_VERSION}`,
    repetitions,
    now: input.now,
    clock: input.clock ?? performance.now.bind(performance),
  });
  if (!verifyIntegratedShadowEvaluationContentDigest(integratedEvaluation)) {
    throw new Error("embedded integrated evaluation content digest mismatch");
  }

  const integratedById = new Map(integratedEvaluation.scenarios.map((scenario) => [
    scenario.id,
    scenario,
  ]));
  const controlEvaluation = construction.report.controlComparisons.map(
    (comparison) => {
      const evaluated = integratedById.get(comparison.scenarioId);
      if (!evaluated) {
        throw new Error(`evaluated control ${comparison.scenarioId} is absent`);
      }
      const evaluationDigest = normalizedPlanBasisReceiptDigest(
        evaluated.representativeReceipt,
      );
      return ControlEvaluationSchema.parse({
        scenarioId: comparison.scenarioId,
        constructionNormalizedReceiptDigest:
          comparison.targetNormalizedReceiptDigest,
        evaluationNormalizedReceiptDigest: evaluationDigest,
        normalizedReceiptIdentical:
          comparison.targetNormalizedReceiptDigest === evaluationDigest,
        distinctEvaluationReceiptDigests: evaluated.distinctReceiptDigests,
      });
    },
  );

  const interrupted = integratedById.get("interrupted_expanded_action");
  if (!interrupted) throw new Error("evaluated interrupted scenario is absent");
  const interruptedReceiptStable = interrupted.runs.every((run) =>
    run.receiptDigest === construction.report.interruptedReplay.targetReceiptDigest
  ) && planBasisReplayDigest(interrupted.representativeReceipt) ===
    construction.report.interruptedReplay.targetReceiptDigest;

  const registeredRepetitionCount = repetitions === REGISTERED_REPETITIONS &&
    integratedEvaluation.execution.totalRuns === 7 * REGISTERED_REPETITIONS;
  const exactTwoOperationContract =
    construction.report.assertions.exactTwoOperationContract;
  const derivedIntegrityValid =
    construction.report.assertions.derivedIntegrityValid;
  const unexpectedFieldDifferenceCountZero =
    construction.report.unexpectedFieldDifferenceCount === 0;
  const unchangedControlInputs =
    construction.report.assertions.unchangedControlInputs;
  const normalizedControlReceiptParity = controlEvaluation.every((control) =>
    control.normalizedReceiptIdentical &&
    control.distinctEvaluationReceiptDigests === 1
  );
  const hardInvariantsPass = integratedEvaluation.aggregate.hardInvariantsPass;
  const primaryProxiesPass = integratedEvaluation.aggregate.primaryProxiesPass;
  const registeredBehaviorSevenOfSeven =
    integratedEvaluation.aggregate.registeredScenarioBehaviorPass &&
    integratedEvaluation.aggregate.registeredScenarioBehaviorCoverage === 1 &&
    integratedEvaluation.aggregate.failedStrata.length === 0;
  const registeredInterruptedBehaviorStable =
    construction.report.interruptedReplay.passed &&
    interrupted.registeredBehaviorPass && interruptedReceiptStable;
  const externalLlmCallsZero =
    integratedEvaluation.execution.evaluatorExternalLlmCalls === 0 &&
    integratedEvaluation.aggregate.shadowExternalLlmCalls === 0;
  const canonicalCommitCountZero =
    integratedEvaluation.execution.canonicalCommitCount === 0 &&
    integratedEvaluation.aggregate.canonicalCommitCount === 0;
  const exactCorrectionPass = exactTwoOperationContract &&
    derivedIntegrityValid && unexpectedFieldDifferenceCountZero &&
    unchangedControlInputs && normalizedControlReceiptParity &&
    registeredInterruptedBehaviorStable;
  const behaviorPass = registeredBehaviorSevenOfSeven &&
    registeredInterruptedBehaviorStable;
  const allRequiredGatesPass = registeredRepetitionCount &&
    exactCorrectionPass && hardInvariantsPass && primaryProxiesPass &&
    behaviorPass && externalLlmCallsZero && canonicalCommitCountZero;
  const decision = decisionFor({
    registeredRepetitionCount,
    hardInvariantsPass,
    primaryProxiesPass,
    exactCorrectionPass,
    behaviorPass,
  });
  if ((decision.label === "supported") !== allRequiredGatesPass) {
    throw new Error("corrective decision label disagrees with registered gates");
  }

  const wrapperPath = path.relative(repositoryRoot, fileURLToPath(import.meta.url));
  const [
    protocol,
    wrapper,
    integratedEvaluator,
    replayBuilder,
  ] = await Promise.all([
    fileEvidence(PROTOCOL_PATH),
    fileEvidence(wrapperPath),
    fileEvidence(EVALUATOR_PATH),
    fileEvidence(BUILDER_PATH),
  ]);
  const reportWithoutIntegrity =
    CorrectiveReplayEvaluationWithoutIntegritySchema.parse({
      schemaVersion: 1,
      mode: "integrated_shadow_plan_basis_corrective_evaluation",
      evaluatedAt: (input.now?.() ?? new Date()).toISOString(),
      provenance: {
        gitHead: gitOutput(["rev-parse", "HEAD"]),
        workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        protocol,
        constructionEvidence: {
          path: CONSTRUCTION_EVIDENCE_PATH,
          fileSha256: sha256(constructionEvidenceText),
          contentDigest: constructionEvidence.integrity.contentDigest,
        },
        wrapper,
        integratedEvaluator,
        replayBuilder,
      },
      lineage: {
        parent: construction.report.parent,
        delta: construction.report.delta,
        target: construction.report.target,
        fieldDifferences: construction.report.fieldDifferences,
        unexpectedFieldDifferenceCount:
          construction.report.unexpectedFieldDifferenceCount,
      },
      construction: construction.report,
      execution: {
        scenarioCount: 7,
        repetitionsPerScenario: repetitions,
        totalRuns: integratedEvaluation.execution.totalRuns,
        derivedTranscriptPersisted: false,
        evaluatorExternalLlmCalls:
          integratedEvaluation.execution.evaluatorExternalLlmCalls,
        canonicalCommitCount:
          integratedEvaluation.execution.canonicalCommitCount,
      },
      thresholds: INTEGRATED_SHADOW_EVALUATION_THRESHOLDS,
      integratedEvaluation,
      controlEvaluation,
      gates: {
        registeredRepetitionCount,
        exactTwoOperationContract,
        derivedIntegrityValid,
        unexpectedFieldDifferenceCountZero,
        unchangedControlInputs,
        normalizedControlReceiptParity,
        hardInvariantsPass,
        primaryProxiesPass,
        registeredBehaviorSevenOfSeven,
        registeredInterruptedBehaviorStable,
        externalLlmCallsZero,
        canonicalCommitCountZero,
        allRequiredGatesPass,
      },
      decision,
      nonClaims: [
        "Supported means the bounded structural plan-basis correction passed this frozen corpus and rubric; it does not prove objective battle correctness.",
        "Psychology and experience refs satisfy category coverage, but their semantic grounding remains unmeasured.",
        "The fixed local transcripts do not establish behavior for unseen turns or global canonical consistency.",
        "The modeled three-call topology is not a measured live call reduction.",
        "Local latency excludes provider, persistence, concurrency, network, release, and deployment behavior.",
        "This evaluation performs no runtime wiring, BattleState mutation, canonical commit, database change, provider change, release, or deployment.",
      ],
    });
  const report = CorrectiveReplayEvaluationReportSchema.parse({
    ...reportWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(reportWithoutIntegrity),
    },
  });
  if (!verifyCorrectiveReplayEvaluationContentDigest(report)) {
    throw new Error("corrective replay evaluation content digest mismatch");
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
  const report = await evaluateBattlePlanBasisCorrectiveReplay({
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[plan-basis-corrective-evaluation] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
