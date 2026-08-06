import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IntegratedShadowTurnInputSchema,
  IntegratedShadowTurnReceiptSchema,
  runIntegratedShadowTurnPoc,
  type IntegratedShadowTurnReceipt,
} from "@kshiai/shared";
import {
  IntegratedShadowTranscriptReportSchema,
  verifyIntegratedShadowTranscriptContentDigest,
} from "./capture-battle-integrated-shadow-transcripts.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const PARENT_PATH =
  "docs/evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json";
const DELTA_PATH =
  "docs/evidence/battle-pipeline-integrated-shadow-plan-basis-delta-v2.json";
const PROTOCOL_PATH = "docs/battle-pipeline-plan-basis-replay-protocol.md";
const PARENT_FIXTURE_VERSION =
  "battle-pipeline-integrated-shadow-transcripts-v1";
const TARGET_FIXTURE_VERSION =
  "battle-pipeline-integrated-shadow-transcripts-v2";
const NORMALIZED_FIXTURE_VERSION =
  "battle-pipeline-integrated-shadow-transcripts-vN";
const DELTA_VERSION =
  "battle-pipeline-integrated-shadow-plan-basis-delta-v2";
const PARENT_FILE_SHA256 =
  "1b9c9e3b502b9e32bc96e5848ab5228f9f0d1c44ab4310a7b21dd268c6ed689a";
const PARENT_CONTENT_DIGEST =
  "bd047d71f4bee6736aa645a5fea690cede67b1c147654630c4f8ad63b7abd882";
const INTERRUPTED_SCENARIO_ID = "interrupted_expanded_action";
const INTERRUPTED_PROPOSAL_REF = "proposal.interrupted.a";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const RefSchema = z.string().min(1).max(240);

const PlanBasisAppendOperationSchema = z.object({
  operation: z.literal("append_basis_ref"),
  scenarioId: z.literal(INTERRUPTED_SCENARIO_ID),
  proposalRef: z.literal(INTERRUPTED_PROPOSAL_REF),
  stepId: RefSchema,
  basisCategory: z.enum(["psychology", "experience"]),
  expectedBefore: z.array(RefSchema).min(1).max(16),
  addedRef: RefSchema,
  expectedAfter: z.array(RefSchema).min(2).max(16),
}).strict();

export const PlanBasisReplayDeltaSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("integrated_shadow_plan_basis_delta"),
  deltaVersion: z.literal(DELTA_VERSION),
  parent: z.object({
    path: z.literal(PARENT_PATH),
    fixtureVersion: z.literal(PARENT_FIXTURE_VERSION),
    fileSha256: DigestSchema,
    contentDigest: DigestSchema,
  }).strict(),
  targetFixtureVersion: z.literal(TARGET_FIXTURE_VERSION),
  operations: z.array(PlanBasisAppendOperationSchema).length(2),
  unchangedScenarioIds: z.array(z.enum([
    "ordinary_fast_action",
    "remote_rejection",
    "simultaneous_terminal_action",
    "active_world_process",
    "blocking_local_conflict",
    "exhausted_budget",
  ])).length(6),
  provenance: z.object({
    protocolPath: z.literal(PROTOCOL_PATH),
    fixedAt: z.string().datetime(),
    constructionMethod: z.literal("strict_in_memory_derivation"),
    externalLlmCallsMade: z.literal(0),
    canonicalCommitCount: z.literal(0),
  }).strict(),
  integrity: z.object({
    algorithm: z.literal("sha256"),
    basis: z.literal("canonical delta excluding integrity"),
    contentDigest: DigestSchema,
  }).strict(),
}).strict().superRefine((delta, ctx) => {
  const operationKeys = delta.operations.map((operation) =>
    [operation.scenarioId, operation.proposalRef, operation.stepId].join("\u0000")
  );
  if (new Set(operationKeys).size !== operationKeys.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["operations"],
      message: "delta operations must target unique steps",
    });
  }
  if (new Set(delta.unchangedScenarioIds).size !== 6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unchangedScenarioIds"],
      message: "unchanged scenario IDs must be unique",
    });
  }
  for (const [index, operation] of delta.operations.entries()) {
    if (
      operation.expectedAfter.length !== operation.expectedBefore.length + 1 ||
      !operation.expectedBefore.every((ref, refIndex) =>
        operation.expectedAfter[refIndex] === ref
      ) ||
      operation.expectedAfter.at(-1) !== operation.addedRef ||
      operation.expectedBefore.includes(operation.addedRef)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations", index],
        message: "operation must append exactly one previously absent basis ref",
      });
    }
  }
});
export type PlanBasisReplayDelta = z.infer<
  typeof PlanBasisReplayDeltaSchema
>;

const FieldDifferenceSchema = z.object({
  path: z.string().startsWith("/"),
  before: z.unknown(),
  after: z.unknown(),
}).strict();

const ControlComparisonSchema = z.object({
  scenarioId: z.string().min(1),
  parentInputDigest: DigestSchema,
  targetInputDigest: DigestSchema,
  inputIdentical: z.literal(true),
  parentNormalizedReceiptDigest: DigestSchema,
  targetNormalizedReceiptDigest: DigestSchema,
  normalizedReceiptIdentical: z.literal(true),
}).strict();

const InterruptedReplaySchema = z.object({
  parentReceiptDigest: DigestSchema,
  targetReceiptDigest: DigestSchema,
  adaptiveStatus: z.literal("executed"),
  resolution: z.literal("expanded"),
  outcome: z.literal("partial"),
  completedSteps: z.tuple([z.literal("step.interrupted.approach")]),
  failedStep: z.literal("step.interrupted.strike"),
  failureReason: z.literal("precondition_failed"),
  effectIds: z.tuple([z.literal("effect.interrupted.approached")]),
  costIds: z.tuple([z.literal("cost.interrupted.exposure")]),
  fallbackFactPresent: z.literal(false),
  patchCount: z.literal(1),
  assertedFactIds: z.tuple([z.literal("input-fact.interrupted.approached")]),
  retractionCount: z.literal(0),
  allPatchAuditsNoIssueFound: z.literal(true),
  strikeEffectPresent: z.literal(false),
  causalCreatedLinkPresent: z.literal(true),
  passed: z.literal(true),
}).strict();

const ConstructionReportWithoutIntegritySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("integrated_shadow_plan_basis_replay_construction"),
  builtAt: z.string().datetime(),
  parent: z.object({
    path: z.literal(PARENT_PATH),
    fixtureVersion: z.literal(PARENT_FIXTURE_VERSION),
    fileSha256: DigestSchema,
    contentDigest: DigestSchema,
  }).strict(),
  delta: z.object({
    path: z.string().min(1),
    deltaVersion: z.literal(DELTA_VERSION),
    fileSha256: DigestSchema,
    contentDigest: DigestSchema,
  }).strict(),
  target: z.object({
    fixtureVersion: z.literal(TARGET_FIXTURE_VERSION),
    contentDigest: DigestSchema,
    persisted: z.literal(false),
  }).strict(),
  fieldDifferences: z.array(FieldDifferenceSchema).length(4),
  unexpectedFieldDifferenceCount: z.literal(0),
  controlComparisons: z.array(ControlComparisonSchema).length(6),
  interruptedReplay: InterruptedReplaySchema,
  execution: z.object({
    scenarioCount: z.literal(7),
    constructionReplayRuns: z.literal(14),
    deterministicRepetitions: z.literal(1),
    externalLlmCallsMade: z.literal(0),
    canonicalCommitCount: z.literal(0),
    authoritativeOutcomeChangeCount: z.literal(0),
    sourceMutationCount: z.literal(0),
  }).strict(),
  assertions: z.object({
    parentIntegrityValid: z.literal(true),
    deltaIntegrityValid: z.literal(true),
    exactTwoOperationContract: z.literal(true),
    derivedIntegrityValid: z.literal(true),
    unchangedControlInputs: z.literal(true),
    normalizedControlReceiptParity: z.literal(true),
    registeredInterruptedBehavior: z.literal(true),
  }).strict(),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

export const PlanBasisReplayConstructionReportSchema =
  ConstructionReportWithoutIntegritySchema.extend({
    integrity: z.object({
      algorithm: z.literal("sha256"),
      basis: z.literal("canonical report excluding integrity"),
      contentDigest: DigestSchema,
    }).strict(),
  }).strict();
export type PlanBasisReplayConstructionReport = z.infer<
  typeof PlanBasisReplayConstructionReportSchema
>;

type TranscriptReport = z.infer<
  typeof IntegratedShadowTranscriptReportSchema
>;
type TranscriptScenario = TranscriptReport["scenarios"][number];

export type PlanBasisCorrectiveReplay = {
  parentTranscript: TranscriptReport;
  targetTranscript: TranscriptReport;
  delta: PlanBasisReplayDelta;
  report: PlanBasisReplayConstructionReport;
};

const expectedOperations = [
  {
    operation: "append_basis_ref",
    scenarioId: INTERRUPTED_SCENARIO_ID,
    proposalRef: INTERRUPTED_PROPOSAL_REF,
    stepId: "step.interrupted.approach",
    basisCategory: "psychology",
    expectedBefore: ["observation:proposal.interrupted.a"],
    addedRef: "psychology:character.a",
    expectedAfter: [
      "observation:proposal.interrupted.a",
      "psychology:character.a",
    ],
  },
  {
    operation: "append_basis_ref",
    scenarioId: INTERRUPTED_SCENARIO_ID,
    proposalRef: INTERRUPTED_PROPOSAL_REF,
    stepId: "step.interrupted.strike",
    basisCategory: "experience",
    expectedBefore: ["observation:proposal.interrupted.a"],
    addedRef: "experience:character.a",
    expectedAfter: [
      "observation:proposal.interrupted.a",
      "experience:character.a",
    ],
  },
] as const;

const expectedUnchangedScenarioIds = [
  "ordinary_fast_action",
  "remote_rejection",
  "simultaneous_terminal_action",
  "active_world_process",
  "blocking_local_conflict",
  "exhausted_budget",
] as const;

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

export function planBasisReplayDigest(value: unknown): string {
  return digest(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function verifyPlanBasisReplayDeltaContentDigest(raw: unknown): boolean {
  const delta = PlanBasisReplayDeltaSchema.parse(raw);
  const { integrity, ...basis } = delta;
  return digest(basis) === integrity.contentDigest;
}

export function verifyPlanBasisReplayConstructionReportContentDigest(
  raw: unknown,
): boolean {
  const report = PlanBasisReplayConstructionReportSchema.parse(raw);
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

function assertExactContract(delta: PlanBasisReplayDelta): void {
  if (
    delta.parent.fileSha256 !== PARENT_FILE_SHA256 ||
    delta.parent.contentDigest !== PARENT_CONTENT_DIGEST
  ) {
    throw new Error("delta does not identify the immutable protocol parent");
  }
  if (!sameValue(delta.operations, expectedOperations)) {
    throw new Error("delta does not match the fixed two-operation contract");
  }
  if (!sameValue(delta.unchangedScenarioIds, expectedUnchangedScenarioIds)) {
    throw new Error("delta does not preserve the fixed six control scenarios");
  }
}

function normalizeFixtureVersion(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll(PARENT_FIXTURE_VERSION, NORMALIZED_FIXTURE_VERSION)
      .replaceAll(TARGET_FIXTURE_VERSION, NORMALIZED_FIXTURE_VERSION);
  }
  if (Array.isArray(value)) return value.map(normalizeFixtureVersion);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        normalizeFixtureVersion(child),
      ]),
    );
  }
  return value;
}

export function normalizedPlanBasisReceiptDigest(value: unknown): string {
  return digest(normalizeFixtureVersion(value));
}

function integratedInput(
  fixtureVersion: string,
  scenario: TranscriptScenario,
) {
  return IntegratedShadowTurnInputSchema.parse({
    transcriptRef: `transcript:${fixtureVersion}:${scenario.id}`,
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

function replay(
  fixtureVersion: string,
  scenario: TranscriptScenario,
): IntegratedShadowTurnReceipt {
  const receipt = runIntegratedShadowTurnPoc(
    integratedInput(fixtureVersion, scenario),
  );
  return IntegratedShadowTurnReceiptSchema.parse(receipt);
}

function resolveSingle<T>(values: T[], description: string): T {
  if (values.length !== 1) {
    throw new Error(`${description} must resolve exactly once; got ${values.length}`);
  }
  return values[0]!;
}

function collectDifferences(
  before: unknown,
  after: unknown,
  currentPath = "",
): z.infer<typeof FieldDifferenceSchema>[] {
  if (sameValue(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const differences: z.infer<typeof FieldDifferenceSchema>[] = [];
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      differences.push(...collectDifferences(
        index < before.length ? before[index] : null,
        index < after.length ? after[index] : null,
        `${currentPath}/${index}`,
      ));
    }
    return differences;
  }
  if (
    before && typeof before === "object" &&
    after && typeof after === "object" &&
    !Array.isArray(before) && !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort((a, b) => a.localeCompare(b));
    return keys.flatMap((key) => collectDifferences(
      Object.hasOwn(left, key) ? left[key] : null,
      Object.hasOwn(right, key) ? right[key] : null,
      `${currentPath}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
    ));
  }
  return [FieldDifferenceSchema.parse({
    path: currentPath || "/",
    before,
    after,
  })];
}

function applyOperations(input: {
  parent: TranscriptReport;
  delta: PlanBasisReplayDelta;
}): {
  target: TranscriptReport;
  allowedOperationPaths: string[];
} {
  const target = structuredClone(input.parent);
  const allowedOperationPaths: string[] = [];
  for (const operation of input.delta.operations) {
    const scenarioIndexes = target.scenarios.flatMap((scenario, index) =>
      scenario.id === operation.scenarioId ? [index] : []
    );
    const scenarioIndex = resolveSingle(
      scenarioIndexes,
      `scenario ${operation.scenarioId}`,
    );
    const scenario = target.scenarios[scenarioIndex]!;
    const caseIndexes = scenario.characterInputs.cases.flatMap((candidate, index) =>
      candidate.proposal.proposalRef === operation.proposalRef ? [index] : []
    );
    const caseIndex = resolveSingle(
      caseIndexes,
      `proposal ${operation.proposalRef}`,
    );
    const proposalCase = scenario.characterInputs.cases[caseIndex]!;
    if (!proposalCase.characterPlan) {
      throw new Error(`proposal ${operation.proposalRef} has no character plan`);
    }
    const stepIndexes = proposalCase.characterPlan.steps.flatMap((step, index) =>
      step.id === operation.stepId ? [index] : []
    );
    const stepIndex = resolveSingle(stepIndexes, `step ${operation.stepId}`);
    const step = proposalCase.characterPlan.steps[stepIndex]!;
    if (!sameValue(step.basisRefs, operation.expectedBefore)) {
      throw new Error(`step ${operation.stepId} basis does not match expectedBefore`);
    }
    const categoryRefs = operation.basisCategory === "psychology"
      ? proposalCase.proposal.characterBasis.psychologyRefs
      : proposalCase.proposal.characterBasis.experienceRefs;
    if (!categoryRefs.includes(operation.addedRef)) {
      throw new Error(
        `step ${operation.stepId} ref is absent from ${operation.basisCategory} basis`,
      );
    }
    step.basisRefs.push(operation.addedRef);
    if (!sameValue(step.basisRefs, operation.expectedAfter)) {
      throw new Error(`step ${operation.stepId} basis does not match expectedAfter`);
    }
    allowedOperationPaths.push(
      `/scenarios/${scenarioIndex}/characterInputs/cases/${caseIndex}` +
        `/characterPlan/steps/${stepIndex}/basisRefs/${operation.expectedBefore.length}`,
    );
  }
  target.fixtureVersion = input.delta.targetFixtureVersion;
  const { integrity: _integrity, ...basis } = target;
  target.integrity = {
    algorithm: "sha256",
    basis: "canonical report excluding integrity",
    contentDigest: digest(basis),
  };
  return {
    target: IntegratedShadowTranscriptReportSchema.parse(target),
    allowedOperationPaths,
  };
}

function interruptedReplaySummary(input: {
  parentReceipt: IntegratedShadowTurnReceipt;
  targetReceipt: IntegratedShadowTurnReceipt;
}) {
  if (input.targetReceipt.adaptive.status !== "executed") {
    throw new Error("interrupted target adaptive stage was not executed");
  }
  const adaptive = input.targetReceipt.adaptive.result.receipts[0];
  if (!adaptive) throw new Error("interrupted target receipt is absent");
  const assertedFactIds = input.targetReceipt.patches.flatMap((patch) =>
    patch.patch.assertions.map((fact) => fact.id)
  );
  const retractionCount = input.targetReceipt.patches.reduce(
    (sum, patch) => sum + patch.patch.retractions.length,
    0,
  );
  return InterruptedReplaySchema.parse({
    parentReceiptDigest: digest(input.parentReceipt),
    targetReceiptDigest: digest(input.targetReceipt),
    adaptiveStatus: input.targetReceipt.adaptive.status,
    resolution: adaptive.resolution,
    outcome: adaptive.outcome,
    completedSteps: adaptive.completedSteps,
    failedStep: adaptive.failedStep,
    failureReason: adaptive.failureReason,
    effectIds: adaptive.effects.map((effect) => effect.id),
    costIds: adaptive.costs.map((cost) => cost.id),
    fallbackFactPresent: adaptive.fallbackFact !== undefined,
    patchCount: input.targetReceipt.patches.length,
    assertedFactIds,
    retractionCount,
    allPatchAuditsNoIssueFound: input.targetReceipt.patches.every((patch) =>
      patch.audit.verdict === "no_issue_found"
    ),
    strikeEffectPresent: adaptive.effects.some((effect) =>
      effect.id === "effect.interrupted.strike"
    ),
    causalCreatedLinkPresent: input.targetReceipt.causalTraces.some((trace) =>
      trace.sourceRef === "step.interrupted.approach" &&
      trace.targetRef === "input-fact.interrupted.approached" &&
      trace.relation === "created"
    ),
    passed: true,
  });
}

export async function buildPlanBasisCorrectiveReplay(input: {
  deltaPath?: string;
  now?: () => Date;
} = {}): Promise<PlanBasisCorrectiveReplay> {
  const deltaPath = path.resolve(
    input.deltaPath ?? path.join(repositoryRoot, DELTA_PATH),
  );
  const deltaText = await fs.readFile(deltaPath, "utf8");
  const deltaRaw = JSON.parse(deltaText) as unknown;
  const delta = PlanBasisReplayDeltaSchema.parse(deltaRaw);
  if (!verifyPlanBasisReplayDeltaContentDigest(deltaRaw)) {
    throw new Error("plan-basis delta content digest mismatch");
  }
  assertExactContract(delta);

  const parentPath = path.resolve(repositoryRoot, delta.parent.path);
  if (parentPath !== path.resolve(repositoryRoot, PARENT_PATH)) {
    throw new Error("plan-basis parent path does not match the fixed protocol");
  }
  const parentText = await fs.readFile(parentPath, "utf8");
  if (sha256(parentText) !== delta.parent.fileSha256) {
    throw new Error("plan-basis parent file SHA-256 mismatch");
  }
  const parentRaw = JSON.parse(parentText) as unknown;
  const parent = IntegratedShadowTranscriptReportSchema.parse(parentRaw);
  if (!verifyIntegratedShadowTranscriptContentDigest(parentRaw)) {
    throw new Error("plan-basis parent content digest mismatch");
  }
  if (
    parent.fixtureVersion !== delta.parent.fixtureVersion ||
    parent.integrity.contentDigest !== delta.parent.contentDigest
  ) {
    throw new Error("plan-basis parent identity does not match the delta");
  }

  const parentBefore = canonicalJson(parent);
  const { target, allowedOperationPaths } = applyOperations({ parent, delta });
  if (canonicalJson(parent) !== parentBefore) {
    throw new Error("plan-basis derivation mutated the parent transcript");
  }
  if (!verifyIntegratedShadowTranscriptContentDigest(target)) {
    throw new Error("derived plan-basis transcript content digest mismatch");
  }

  const fieldDifferences = collectDifferences(parent, target)
    .sort((left, right) => left.path.localeCompare(right.path));
  const allowedPaths = new Set([
    "/fixtureVersion",
    "/integrity/contentDigest",
    ...allowedOperationPaths,
  ]);
  const unexpected = fieldDifferences.filter((difference) =>
    !allowedPaths.has(difference.path)
  );
  if (
    unexpected.length > 0 || fieldDifferences.length !== allowedPaths.size ||
    fieldDifferences.some((difference) => !allowedPaths.has(difference.path))
  ) {
    throw new Error("derived transcript contains an unexpected field delta");
  }

  const parentById = new Map(parent.scenarios.map((scenario) => [
    scenario.id,
    scenario,
  ]));
  const targetById = new Map(target.scenarios.map((scenario) => [
    scenario.id,
    scenario,
  ]));
  const constructionReceipts: IntegratedShadowTurnReceipt[] = [];
  const controlComparisons = delta.unchangedScenarioIds.map((scenarioId) => {
    const parentScenario = parentById.get(scenarioId);
    const targetScenario = targetById.get(scenarioId);
    if (!parentScenario || !targetScenario) {
      throw new Error(`control scenario ${scenarioId} is absent`);
    }
    const parentReceipt = replay(parent.fixtureVersion, parentScenario);
    const targetReceipt = replay(target.fixtureVersion, targetScenario);
    constructionReceipts.push(parentReceipt, targetReceipt);
    return ControlComparisonSchema.parse({
      scenarioId,
      parentInputDigest: digest(parentScenario),
      targetInputDigest: digest(targetScenario),
      inputIdentical: sameValue(parentScenario, targetScenario),
      parentNormalizedReceiptDigest: digest(
        normalizeFixtureVersion(parentReceipt),
      ),
      targetNormalizedReceiptDigest: digest(
        normalizeFixtureVersion(targetReceipt),
      ),
      normalizedReceiptIdentical: sameValue(
        normalizeFixtureVersion(parentReceipt),
        normalizeFixtureVersion(targetReceipt),
      ),
    });
  });

  const parentInterrupted = parentById.get(INTERRUPTED_SCENARIO_ID);
  const targetInterrupted = targetById.get(INTERRUPTED_SCENARIO_ID);
  if (!parentInterrupted || !targetInterrupted) {
    throw new Error("interrupted scenario is absent");
  }
  const parentInterruptedReceipt = replay(
    parent.fixtureVersion,
    parentInterrupted,
  );
  const targetInterruptedReceipt = replay(
    target.fixtureVersion,
    targetInterrupted,
  );
  constructionReceipts.push(
    parentInterruptedReceipt,
    targetInterruptedReceipt,
  );
  const interruptedReplay = interruptedReplaySummary({
    parentReceipt: parentInterruptedReceipt,
    targetReceipt: targetInterruptedReceipt,
  });
  const externalLlmCallsMade = constructionReceipts.reduce(
    (sum, receipt) => sum + receipt.boundaries.externalLlmCallsMade,
    0,
  );
  const canonicalCommitCount = constructionReceipts.filter((receipt) =>
    receipt.boundaries.canonicalCommitPerformed
  ).length;
  const authoritativeOutcomeChangeCount = constructionReceipts.filter(
    (receipt) => receipt.boundaries.authoritativeOutcomeChanged,
  ).length;
  const sourceMutationCount = constructionReceipts.filter((receipt) =>
    receipt.boundaries.sourceMutated
  ).length;

  const reportWithoutIntegrity = ConstructionReportWithoutIntegritySchema.parse({
    schemaVersion: 1,
    mode: "integrated_shadow_plan_basis_replay_construction",
    builtAt: (input.now?.() ?? new Date()).toISOString(),
    parent: {
      path: delta.parent.path,
      fixtureVersion: parent.fixtureVersion,
      fileSha256: delta.parent.fileSha256,
      contentDigest: parent.integrity.contentDigest,
    },
    delta: {
      path: path.relative(repositoryRoot, deltaPath),
      deltaVersion: delta.deltaVersion,
      fileSha256: sha256(deltaText),
      contentDigest: delta.integrity.contentDigest,
    },
    target: {
      fixtureVersion: target.fixtureVersion,
      contentDigest: target.integrity.contentDigest,
      persisted: false,
    },
    fieldDifferences,
    unexpectedFieldDifferenceCount: 0,
    controlComparisons,
    interruptedReplay,
    execution: {
      scenarioCount: 7,
      constructionReplayRuns: 14,
      deterministicRepetitions: 1,
      externalLlmCallsMade,
      canonicalCommitCount,
      authoritativeOutcomeChangeCount,
      sourceMutationCount,
    },
    assertions: {
      parentIntegrityValid: true,
      deltaIntegrityValid: true,
      exactTwoOperationContract: true,
      derivedIntegrityValid: true,
      unchangedControlInputs: true,
      normalizedControlReceiptParity: true,
      registeredInterruptedBehavior: true,
    },
    limitations: [
      "This construction replay runs each frozen scenario once and is not the registered 20-repetition evaluation.",
      "The two added refs establish structural category coverage, not semantic psychology or experience grounding.",
      "The derived v2 transcript remains in memory and is not a replacement for the immutable v1 artifact.",
      "No runtime, BattleState, canonical storage, database, provider, release, or deployment change is authorized.",
    ],
  });
  const report = PlanBasisReplayConstructionReportSchema.parse({
    ...reportWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(reportWithoutIntegrity),
    },
  });
  if (!verifyPlanBasisReplayConstructionReportContentDigest(report)) {
    throw new Error("plan-basis construction report content digest mismatch");
  }
  return {
    parentTranscript: parent,
    targetTranscript: target,
    delta,
    report,
  };
}

function parseArgs(args: string[]): {
  deltaPath?: string;
  outputPath?: string;
} {
  const parsed: { deltaPath?: string; outputPath?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--delta") {
      parsed.deltaPath = path.resolve(repositoryRoot, value);
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
  const result = await buildPlanBasisCorrectiveReplay({
    deltaPath: args.deltaPath,
  });
  const serialized = `${JSON.stringify(result.report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[plan-basis-corrective-replay] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
