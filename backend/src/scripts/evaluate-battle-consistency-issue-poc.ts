import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ProjectionPurposeSchema,
  ShadowPatchAuditResultSchema,
  blockingConsistencyIssueRefs,
  createConsistencyIssuePocEnvelope,
  deferConsistencyIssue,
  projectConsistencyIssueViews,
  registerConsistencyAlert,
  registerPatchAuditResult,
  resolveConsistencyIssue,
  type ConsistencyAlert,
  type ConsistencyDiscoveryStage,
  type ConsistencyIssueMutationReceipt,
  type ConsistencyIssuePocEnvelope,
  type PatchAuditRegistrationReceipt,
  type ProjectionPurpose,
  type ShadowPatchAuditResult,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-consistency-issue-fixtures-v1.json",
);

type LifecycleKind = "registered" | "deduplicated" | "deferred" | "resolved";

type Thresholds = {
  issueDetectionRecallMinimum: number;
  falsePositiveRateMaximum: number;
  deduplicationRecallMinimum: number;
  distinctIssuePreservationMinimum: number;
  staleReplayNoOpAccuracyMinimum: number;
  purposeBlockingAccuracyMinimum: number;
  lifecycleTraceabilityMinimum: number;
  actionableIssueRateMinimum: number;
  storageBytesPerUniqueIssueMaximum: number;
  operatorReviewInflationMaximum: number;
  sourceMutationCountMaximum: number;
  authorityRegressionCountMaximum: number;
  globalCoherenceClaimCountMaximum: number;
};

type ScenarioFixture = {
  id: string;
  runner: string;
  expectedIssueObservations: number;
  expectedFalsePositiveInputs: number;
  expectedDuplicateObservations: number;
  expectedDistinctObservations: number;
  expectedStaleReplays: number;
  expectedFinalUnresolvedReviewItems: number;
  expectedLifecycleKinds: LifecycleKind[];
  expectedFinalBlocks: Record<ProjectionPurpose, string[]>;
};

type FixtureFile = {
  schemaVersion: 1;
  fixtureVersion: string;
  frozenAt: string;
  repetitions: number;
  thresholds: Thresholds;
  scenarios: ScenarioFixture[];
};

type ScenarioRun = {
  envelope: ConsistencyIssuePocEnvelope;
  matchedIssueObservations: number;
  falsePositiveRegistrations: number;
  correctDuplicateObservations: number;
  correctDistinctObservations: number;
  correctStaleReplayNoOps: number;
  correctPurposeChecks: number;
  purposeChecks: number;
  correctLifecycleChecks: number;
  lifecycleChecks: number;
  actionableIssues: number;
  uniqueIssues: number;
  unresolvedReviewItems: number;
  envelopeBytes: number;
  sourceMutationCount: number;
  authorityRegressionCount: number;
  globalCoherenceClaimCount: number;
};

type ScenarioAggregate = {
  id: string;
  repetitions: number;
  issueObservationRecall: number;
  falsePositiveRate: number | null;
  deduplicationRecall: number | null;
  distinctIssuePreservation: number;
  staleReplayNoOpAccuracy: number | null;
  purposeBlockingAccuracy: number;
  lifecycleTraceability: number;
  actionableIssueRate: number;
  storageBytesPerUniqueIssue: number;
  operatorReviewInflation: number;
  finalUniqueIssueCount: number;
  finalUnresolvedReviewItems: number;
  envelopeBytes: {
    mean: number;
    minimum: number;
    maximum: number;
  };
  sourceMutationCount: number;
  authorityRegressionCount: number;
  globalCoherenceClaimCount: number;
  observedLifecycleKinds: LifecycleKind[];
};

export type ConsistencyIssueEvaluationReport = {
  schemaVersion: 1;
  fixtureVersion: string;
  generatedAt: string;
  mode: "consistency_issue_poc_evaluation";
  provenance: {
    gitHead: string;
    workingTreeDirty: boolean;
    nodeVersion: string;
    fixturePath: string;
    fixtureSha256: string;
    evaluatorPath: string;
    evaluatorSha256: string;
    issueSourcePath: string;
    issueSourceSha256: string;
  };
  execution: {
    repetitionsPerScenario: number;
    scenarioCount: number;
    scenarioRuns: number;
    trueIssueObservations: number;
    falsePositiveBoundaryInputs: number;
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
  aggregate: {
    issueDetectionRecall: number;
    falsePositiveRate: number;
    deduplicationRecall: number;
    distinctIssuePreservation: number;
    staleReplayNoOpAccuracy: number;
    purposeBlockingAccuracy: number;
    lifecycleTraceability: number;
    actionableIssueRate: number;
    storageBytesPerUniqueIssue: number;
    operatorReviewInflation: number;
    sourceMutationCount: number;
    authorityRegressionCount: number;
    globalCoherenceClaimCount: number;
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

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function optionalRatio(
  numerator: number,
  denominator: number,
): number | null {
  return denominator === 0 ? null : round(numerator / denominator);
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
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 1
    ) {
      return [];
    }
    throw error;
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeAlert(input: {
  alertRef: string;
  reporter: ConsistencyAlert["reporter"];
  turn: number;
  entityRefs: string[];
  factRefs: string[];
  blocking?: boolean;
  explanation: string;
}): ConsistencyAlert {
  return {
    schemaVersion: 1,
    alertRef: input.alertRef,
    reporter: input.reporter,
    turn: input.turn,
    involvedRefs: input.entityRefs,
    conflictingClaims: input.factRefs,
    blocking: input.blocking ?? true,
    explanation: input.explanation,
  };
}

function auditResult(input: {
  verdict: "no_issue_found" | "issue_found" | "indeterminate";
  factRefs?: string[];
  entityRefs?: string[];
  issues?: Array<{
    code:
      | "invalid_schema"
      | "direct_conflict"
      | "incomplete_context";
    factRefs: string[];
    entityRefs: string[];
    explanation: string;
  }>;
}): ShadowPatchAuditResult {
  return ShadowPatchAuditResultSchema.parse({
    verdict: input.verdict,
    checkedScope: {
      factRefs: input.factRefs ?? [],
      entityRefs: input.entityRefs ?? [],
      patchBytes: 512,
    },
    issues: input.issues ?? [],
  });
}

type ScenarioRecorder = {
  envelope: ConsistencyIssuePocEnvelope;
  canonicalGuard: {
    facts: string[];
    revision: number;
  };
  canonicalGuardDigest: string;
  matchedIssueObservations: number;
  falsePositiveRegistrations: number;
  correctDuplicateObservations: number;
  correctDistinctObservations: number;
  correctStaleReplayNoOps: number;
  sourceMutationCount: number;
};

function createRecorder(id: string): ScenarioRecorder {
  const canonicalGuard = {
    facts: [`canonical.guard.${id}`],
    revision: 7,
  };
  return {
    envelope: createConsistencyIssuePocEnvelope(),
    canonicalGuard,
    canonicalGuardDigest: digest(canonicalGuard),
    matchedIssueObservations: 0,
    falsePositiveRegistrations: 0,
    correctDuplicateObservations: 0,
    correctDistinctObservations: 0,
    correctStaleReplayNoOps: 0,
    sourceMutationCount: 0,
  };
}

function applyMutation<T extends {
  envelope: ConsistencyIssuePocEnvelope;
}>(
  recorder: ScenarioRecorder,
  mutate: (envelope: ConsistencyIssuePocEnvelope) => T,
): T {
  const before = digest(recorder.envelope);
  const result = mutate(recorder.envelope);
  if (digest(recorder.envelope) !== before) recorder.sourceMutationCount += 1;
  recorder.envelope = result.envelope;
  return result;
}

function observeAlert(input: {
  recorder: ScenarioRecorder;
  alert: ConsistencyAlert;
  stage: Exclude<ConsistencyDiscoveryStage, "patch_audit">;
  blocksPurposes: ProjectionPurpose[];
  expectedOutcome: "registered" | "deduplicated";
}): ConsistencyIssueMutationReceipt {
  const result = applyMutation(input.recorder, (envelope) =>
    registerConsistencyAlert({
      envelope,
      alert: input.alert,
      discoveredAtStage: input.stage,
      classifiedBlocksPurposes: input.blocksPurposes,
    })
  );
  if (result.outcome === input.expectedOutcome) {
    input.recorder.matchedIssueObservations += 1;
    if (input.expectedOutcome === "registered") {
      input.recorder.correctDistinctObservations += 1;
    } else {
      input.recorder.correctDuplicateObservations += 1;
    }
  }
  return result;
}

function replayAlert(input: {
  recorder: ScenarioRecorder;
  alert: ConsistencyAlert;
  stage: Exclude<ConsistencyDiscoveryStage, "patch_audit">;
  blocksPurposes: ProjectionPurpose[];
}): void {
  const before = digest(input.recorder.envelope);
  const result = applyMutation(input.recorder, (envelope) =>
    registerConsistencyAlert({
      envelope,
      alert: input.alert,
      discoveredAtStage: input.stage,
      classifiedBlocksPurposes: input.blocksPurposes,
    })
  );
  if (result.outcome === "unchanged" && digest(result.envelope) === before) {
    input.recorder.correctStaleReplayNoOps += 1;
  }
}

function observeAudit(input: {
  recorder: ScenarioRecorder;
  auditRef: string;
  turn: number;
  result: ShadowPatchAuditResult;
  expectedOutcome: "registered" | "deduplicated";
  classify: Parameters<typeof registerPatchAuditResult>[0]["classifyIssue"];
}): PatchAuditRegistrationReceipt {
  const registered = applyMutation(input.recorder, (envelope) =>
    registerPatchAuditResult({
      envelope,
      auditRef: input.auditRef,
      turn: input.turn,
      result: input.result,
      classifyIssue: input.classify,
    })
  );
  if (registered.outcome === input.expectedOutcome) {
    input.recorder.matchedIssueObservations += 1;
    if (input.expectedOutcome === "registered") {
      input.recorder.correctDistinctObservations += 1;
    } else {
      input.recorder.correctDuplicateObservations += 1;
    }
  }
  return registered;
}

function replayAudit(input: {
  recorder: ScenarioRecorder;
  auditRef: string;
  turn: number;
  result: ShadowPatchAuditResult;
  classify: Parameters<typeof registerPatchAuditResult>[0]["classifyIssue"];
}): void {
  const before = digest(input.recorder.envelope);
  const receipt = applyMutation(input.recorder, (envelope) =>
    registerPatchAuditResult({
      envelope,
      auditRef: input.auditRef,
      turn: input.turn,
      result: input.result,
      classifyIssue: input.classify,
    })
  );
  if (receipt.outcome === "deduplicated" && digest(receipt.envelope) === before) {
    input.recorder.correctStaleReplayNoOps += 1;
  }
}

function falsePositiveBoundary(input: {
  recorder: ScenarioRecorder;
  auditRef: string;
  result: ShadowPatchAuditResult;
  expectedOutcome: "no_issue_found" | "indeterminate";
}): void {
  const issueCount = input.recorder.envelope.issues.length;
  const revision = input.recorder.envelope.revision;
  const receipt = applyMutation(input.recorder, (envelope) =>
    registerPatchAuditResult({
      envelope,
      auditRef: input.auditRef,
      turn: 1,
      result: input.result,
      classifyIssue: () => ["patch_audit"],
    })
  );
  if (
    receipt.outcome !== input.expectedOutcome ||
    receipt.envelope.issues.length !== issueCount ||
    receipt.envelope.revision !== revision
  ) {
    input.recorder.falsePositiveRegistrations += 1;
  }
}

function mixedAlertLifecycle(): ScenarioRecorder {
  const recorder = createRecorder("mixed-alert-lifecycle");
  const direct = makeAlert({
    alertRef: "alert.direct.1",
    reporter: "character_agent",
    turn: 2,
    entityRefs: ["character.a", "object.sword"],
    factRefs: ["fact.sword-held", "fact.sword-floor"],
    explanation: "剣が保持中かつ床上として入力された。",
  });
  const first = observeAlert({
    recorder,
    alert: direct,
    stage: "planning",
    blocksPurposes: ["adjudication"],
    expectedOutcome: "registered",
  });
  const duplicate = makeAlert({
    alertRef: "alert.direct.2",
    reporter: "narrator",
    turn: 3,
    entityRefs: ["object.sword", "character.a"],
    factRefs: ["fact.sword-floor", "fact.sword-held"],
    explanation: "同じ剣の位置と保持が衝突している。",
  });
  observeAlert({
    recorder,
    alert: duplicate,
    stage: "narration",
    blocksPurposes: ["narration"],
    expectedOutcome: "deduplicated",
  });
  replayAlert({
    recorder,
    alert: duplicate,
    stage: "narration",
    blocksPurposes: ["narration"],
  });
  observeAlert({
    recorder,
    alert: makeAlert({
      alertRef: "alert.subtle.1",
      reporter: "adjudicator",
      turn: 3,
      entityRefs: ["character.a", "object.sword"],
      factRefs: ["fact.sword-held", "fact.hand-empty"],
      explanation: "保持factと空手factが同時に成立している。",
    }),
    stage: "adjudication",
    blocksPurposes: ["adjudication"],
    expectedOutcome: "registered",
  });
  observeAlert({
    recorder,
    alert: makeAlert({
      alertRef: "alert.unrelated.1",
      reporter: "world_evaluator",
      turn: 3,
      entityRefs: ["effect.smoke", "area.remote"],
      factRefs: ["fact.smoke-area-a", "fact.smoke-area-b"],
      explanation: "遠隔区画の煙伝播先が衝突している。",
    }),
    stage: "world_process",
    blocksPurposes: ["world_process"],
    expectedOutcome: "registered",
  });
  if (!first.issueRef) throw new Error("mixed scenario did not register first issue");
  applyMutation(recorder, (envelope) => deferConsistencyIssue({
    envelope,
    issueRef: first.issueRef!,
    decisionRef: "decision.defer.direct",
    turn: 3,
    reason: "現在のworld processには無関係なので修復を後続へ送る。",
  }));
  applyMutation(recorder, (envelope) => resolveConsistencyIssue({
    envelope,
    issueRef: first.issueRef!,
    resolutionRef: "repair.direct.1",
    turn: 4,
    summary: "後続因果により保持factを選択した。",
  }));
  observeAlert({
    recorder,
    alert: makeAlert({
      alertRef: "alert.direct.recurrence",
      reporter: "adjudicator",
      turn: 5,
      entityRefs: ["character.a", "object.sword"],
      factRefs: ["fact.sword-held", "fact.sword-floor"],
      explanation: "解決後の新しいturnで同じ衝突が再発した。",
    }),
    stage: "adjudication",
    blocksPurposes: ["adjudication"],
    expectedOutcome: "registered",
  });
  return recorder;
}

function auditBoundariesAndRefLessFindings(): ScenarioRecorder {
  const recorder = createRecorder("audit-boundaries");
  falsePositiveBoundary({
    recorder,
    auditRef: "audit.clean",
    expectedOutcome: "no_issue_found",
    result: auditResult({
      verdict: "no_issue_found",
      factRefs: ["fact.checked"],
      entityRefs: ["character.a"],
    }),
  });
  falsePositiveBoundary({
    recorder,
    auditRef: "audit.indeterminate",
    expectedOutcome: "indeterminate",
    result: auditResult({
      verdict: "indeterminate",
      factRefs: ["fact.checked"],
      entityRefs: ["character.a"],
      issues: [{
        code: "incomplete_context",
        factRefs: [],
        entityRefs: [],
        explanation: "inverse relation was not loaded",
      }],
    }),
  });
  const conflict = auditResult({
    verdict: "issue_found",
    factRefs: ["fact.old", "fact.new"],
    entityRefs: ["character.a"],
    issues: [{
      code: "direct_conflict",
      factRefs: ["fact.old", "fact.new"],
      entityRefs: ["character.a"],
      explanation: "two current values occupy one slot",
    }, {
      code: "incomplete_context",
      factRefs: [],
      entityRefs: [],
      explanation: "unrelated inverse relation was not loaded",
    }],
  });
  observeAudit({
    recorder,
    auditRef: "audit.conflict.1",
    turn: 2,
    result: conflict,
    expectedOutcome: "registered",
    classify: () => ["adjudication", "patch_audit"],
  });
  replayAudit({
    recorder,
    auditRef: "audit.conflict.1",
    turn: 2,
    result: conflict,
    classify: () => ["adjudication", "patch_audit"],
  });
  observeAudit({
    recorder,
    auditRef: "audit.conflict.2",
    turn: 3,
    result: conflict,
    expectedOutcome: "deduplicated",
    classify: () => ["adjudication", "patch_audit"],
  });
  const invalidSchema = auditResult({
    verdict: "issue_found",
    issues: [{
      code: "invalid_schema",
      factRefs: [],
      entityRefs: [],
      explanation: "patch schema is invalid",
    }],
  });
  observeAudit({
    recorder,
    auditRef: "audit.schema.1",
    turn: 3,
    result: invalidSchema,
    expectedOutcome: "registered",
    classify: () => ["patch_audit"],
  });
  observeAudit({
    recorder,
    auditRef: "audit.schema.2",
    turn: 3,
    result: invalidSchema,
    expectedOutcome: "registered",
    classify: () => ["patch_audit"],
  });
  return recorder;
}

function purposeIsolationAndStaleStatus(): ScenarioRecorder {
  const recorder = createRecorder("purpose-isolation");
  const adjudication = observeAlert({
    recorder,
    alert: makeAlert({
      alertRef: "alert.door",
      reporter: "adjudicator",
      turn: 2,
      entityRefs: ["object.door"],
      factRefs: ["fact.door-open", "fact.door-closed"],
      explanation: "扉の開閉状態が衝突している。",
    }),
    stage: "adjudication",
    blocksPurposes: ["adjudication"],
    expectedOutcome: "registered",
  });
  const narration = observeAlert({
    recorder,
    alert: makeAlert({
      alertRef: "alert.identity",
      reporter: "narrator",
      turn: 2,
      entityRefs: ["character.unknown"],
      factRefs: ["fact.identity-a", "fact.identity-b"],
      explanation: "公開名の識別が衝突している。",
    }),
    stage: "narration",
    blocksPurposes: ["narration"],
    expectedOutcome: "registered",
  });
  observeAlert({
    recorder,
    alert: makeAlert({
      alertRef: "alert.smoke",
      reporter: "world_evaluator",
      turn: 2,
      entityRefs: ["effect.smoke"],
      factRefs: ["fact.smoke-active", "fact.smoke-ended"],
      explanation: "煙過程のactive状態が衝突している。",
    }),
    stage: "world_process",
    blocksPurposes: ["world_process"],
    expectedOutcome: "registered",
  });
  if (!adjudication.issueRef || !narration.issueRef) {
    throw new Error("purpose scenario did not register required issues");
  }
  applyMutation(recorder, (envelope) => deferConsistencyIssue({
    envelope,
    issueRef: narration.issueRef!,
    decisionRef: "decision.defer.identity",
    turn: 3,
    reason: "narration直前まで解決を延期する。",
  }));
  applyMutation(recorder, (envelope) => resolveConsistencyIssue({
    envelope,
    issueRef: adjudication.issueRef!,
    resolutionRef: "repair.door",
    turn: 3,
    summary: "扉の後続状態を選択した。",
  }));
  return recorder;
}

const scenarioRunners: Record<string, () => ScenarioRecorder> = {
  mixed_alert_lifecycle: mixedAlertLifecycle,
  audit_boundaries_and_ref_less_findings: auditBoundariesAndRefLessFindings,
  purpose_isolation_and_stale_status: purposeIsolationAndStaleStatus,
};

function validateFixtureFile(raw: unknown): FixtureFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("consistency issue fixture must be an object");
  }
  const fixture = raw as FixtureFile;
  if (fixture.schemaVersion !== 1 || !fixture.fixtureVersion) {
    throw new Error("unsupported consistency issue fixture schema");
  }
  if (!Array.isArray(fixture.scenarios) || fixture.scenarios.length === 0) {
    throw new Error("consistency issue fixture has no scenarios");
  }
  const ids = new Set<string>();
  for (const scenario of fixture.scenarios) {
    if (!scenario.id || ids.has(scenario.id) || !scenarioRunners[scenario.runner]) {
      throw new Error(`invalid consistency issue scenario: ${scenario.id}`);
    }
    ids.add(scenario.id);
    for (const purpose of ProjectionPurposeSchema.options) {
      if (!Array.isArray(scenario.expectedFinalBlocks[purpose])) {
        throw new Error(`scenario ${scenario.id} omits purpose ${purpose}`);
      }
    }
  }
  for (const [key, value] of Object.entries(fixture.thresholds)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`invalid consistency issue threshold: ${key}`);
    }
  }
  return fixture;
}

function finishScenario(
  recorder: ScenarioRecorder,
  fixture: ScenarioFixture,
): ScenarioRun {
  const purposeChecks = ProjectionPurposeSchema.options.length;
  let correctPurposeChecks = 0;
  for (const purpose of ProjectionPurposeSchema.options) {
    const actual = blockingConsistencyIssueRefs({
      envelope: recorder.envelope,
      purpose,
    });
    if (sameStrings(actual, fixture.expectedFinalBlocks[purpose])) {
      correctPurposeChecks += 1;
    }
  }
  const lifecycleKinds = recorder.envelope.lifecycleEvents.map((event) =>
    event.kind
  );
  const issueRefs = new Set(recorder.envelope.issues.map((issue) => issue.id));
  const lifecycleChecks = 4;
  let correctLifecycleChecks = 0;
  if (sameStrings(lifecycleKinds, fixture.expectedLifecycleKinds)) {
    correctLifecycleChecks += 1;
  }
  if (recorder.envelope.lifecycleEvents.every((event) =>
    issueRefs.has(event.issueRef) && event.sourceRef.length > 0
  )) {
    correctLifecycleChecks += 1;
  }
  if (recorder.envelope.issues.every((issue) =>
    recorder.envelope.lifecycleEvents.some((event) =>
      event.issueRef === issue.id && event.kind === "registered"
    )
  )) {
    correctLifecycleChecks += 1;
  }
  if (recorder.envelope.lifecycleEvents.every((event, index) =>
    event.id === `issue-event.${String(index + 1).padStart(6, "0")}`
  )) {
    correctLifecycleChecks += 1;
  }

  const actionableIssues = recorder.envelope.issues.filter((issue) =>
    issue.kind.length > 0 &&
    issue.sourceRefs.length > 0 &&
    Array.isArray(issue.blocksPurposes) &&
    recorder.envelope.lifecycleEvents.some((event) =>
      event.issueRef === issue.id && event.kind === "registered"
    ) &&
    (issue.status !== "resolved" || Boolean(issue.resolution))
  ).length;
  const views = projectConsistencyIssueViews(recorder.envelope);
  const serializedRegistry = JSON.stringify({
    envelope: recorder.envelope,
    views,
  });
  const globalCoherenceClaimCount = [
    ...serializedRegistry.matchAll(/globally_coherent|global_coherence/giu),
  ].length;
  const authorityRegressionCount = recorder.envelope.mode ===
      "shadow_issue_registry"
    ? 0
    : 1;
  if (digest(recorder.canonicalGuard) !== recorder.canonicalGuardDigest) {
    recorder.sourceMutationCount += 1;
  }
  return {
    envelope: recorder.envelope,
    matchedIssueObservations: recorder.matchedIssueObservations,
    falsePositiveRegistrations: recorder.falsePositiveRegistrations,
    correctDuplicateObservations: recorder.correctDuplicateObservations,
    correctDistinctObservations: recorder.correctDistinctObservations,
    correctStaleReplayNoOps: recorder.correctStaleReplayNoOps,
    correctPurposeChecks,
    purposeChecks,
    correctLifecycleChecks,
    lifecycleChecks,
    actionableIssues,
    uniqueIssues: recorder.envelope.issues.length,
    unresolvedReviewItems: recorder.envelope.issues.filter((issue) =>
      issue.status !== "resolved"
    ).length,
    envelopeBytes: serializedBytes(recorder.envelope),
    sourceMutationCount: recorder.sourceMutationCount,
    authorityRegressionCount,
    globalCoherenceClaimCount,
  };
}

function aggregateScenario(input: {
  fixture: ScenarioFixture;
  repetitions: number;
}): ScenarioAggregate {
  const runs = Array.from({ length: input.repetitions }, () =>
    finishScenario(scenarioRunners[input.fixture.runner]!(), input.fixture)
  );
  const sum = (key: keyof ScenarioRun) => runs.reduce(
    (total, run) => total + (typeof run[key] === "number" ? run[key] : 0),
    0,
  );
  const envelopeBytes = runs.map((run) => run.envelopeBytes);
  const uniqueIssues = sum("uniqueIssues");
  const expectedReviewItems =
    input.fixture.expectedFinalUnresolvedReviewItems * input.repetitions;
  return {
    id: input.fixture.id,
    repetitions: input.repetitions,
    issueObservationRecall: ratio(
      sum("matchedIssueObservations"),
      input.fixture.expectedIssueObservations * input.repetitions,
    ),
    falsePositiveRate: optionalRatio(
      sum("falsePositiveRegistrations"),
      input.fixture.expectedFalsePositiveInputs * input.repetitions,
    ),
    deduplicationRecall: optionalRatio(
      sum("correctDuplicateObservations"),
      input.fixture.expectedDuplicateObservations * input.repetitions,
    ),
    distinctIssuePreservation: ratio(
      sum("correctDistinctObservations"),
      input.fixture.expectedDistinctObservations * input.repetitions,
    ),
    staleReplayNoOpAccuracy: optionalRatio(
      sum("correctStaleReplayNoOps"),
      input.fixture.expectedStaleReplays * input.repetitions,
    ),
    purposeBlockingAccuracy: ratio(
      sum("correctPurposeChecks"),
      sum("purposeChecks"),
    ),
    lifecycleTraceability: ratio(
      sum("correctLifecycleChecks"),
      sum("lifecycleChecks"),
    ),
    actionableIssueRate: ratio(sum("actionableIssues"), uniqueIssues),
    storageBytesPerUniqueIssue: ratio(sum("envelopeBytes"), uniqueIssues),
    operatorReviewInflation: ratio(
      sum("unresolvedReviewItems"),
      expectedReviewItems,
    ),
    finalUniqueIssueCount: Math.round(uniqueIssues / input.repetitions),
    finalUnresolvedReviewItems: Math.round(
      sum("unresolvedReviewItems") / input.repetitions,
    ),
    envelopeBytes: {
      mean: round(mean(envelopeBytes)),
      minimum: Math.min(...envelopeBytes),
      maximum: Math.max(...envelopeBytes),
    },
    sourceMutationCount: sum("sourceMutationCount"),
    authorityRegressionCount: sum("authorityRegressionCount"),
    globalCoherenceClaimCount: sum("globalCoherenceClaimCount"),
    observedLifecycleKinds: runs[0]?.envelope.lifecycleEvents.map((event) =>
      event.kind
    ) ?? [],
  };
}

function staticAuthorityCheck(issueSourceText: string): {
  runtimeIntegrationFileRefs: string[];
  exportedCanonicalWriteFunctionCount: number;
} {
  const references = gitLines([
    "grep",
    "-l",
    "-E",
    "registerConsistencyAlert|registerPatchAuditResult|deferConsistencyIssue|resolveConsistencyIssue",
    "--",
    "*.ts",
  ]);
  const allowedSourceFiles = new Set([
    "packages/shared/src/battle-consistency-issue.ts",
    "packages/shared/src/battle-integrated-shadow-turn.ts",
    "backend/src/scripts/evaluate-battle-canonical-graph-poc.ts",
    "backend/src/scripts/evaluate-battle-consistency-issue-poc.ts",
  ]);
  const runtimeIntegrationFileRefs = references.filter((file) =>
    !allowedSourceFiles.has(file) && !file.endsWith(".test.ts")
  );
  const exportedCanonicalWriteFunctionCount = [
    ...issueSourceText.matchAll(
      /export\s+(?:async\s+)?function\s+(?:commit|persist|writeCanonical|repairCanonical)\w*/giu,
    ),
  ].length;
  return {
    runtimeIntegrationFileRefs,
    exportedCanonicalWriteFunctionCount,
  };
}

function decisionFor(input: {
  aggregate: ConsistencyIssueEvaluationReport["aggregate"];
  trueIssueObservations: number;
  falsePositiveBoundaryInputs: number;
}): ConsistencyIssueEvaluationReport["decision"] {
  if (
    input.trueIssueObservations === 0 ||
    input.falsePositiveBoundaryInputs === 0
  ) {
    return {
      label: "indeterminate",
      reasons: [
        "The frozen corpus lacks true-conflict or non-conflict boundary inputs.",
      ],
      boundedRevisionHypotheses: [],
    };
  }
  if (!input.aggregate.hardInvariantsPass) {
    return {
      label: "unsupported",
      reasons: [
        "One or more non-tradeable purpose, lifecycle, immutability, authority, or no-global-coherence invariants failed.",
      ],
      boundedRevisionHypotheses: [],
    };
  }
  if (!input.aggregate.effectivenessThresholdsPass) {
    const reasons: string[] = [];
    const hypotheses: string[] = [];
    if (input.aggregate.issueDetectionRecall < 1) {
      reasons.push("Issue-observation recall missed the frozen minimum.");
      hypotheses.push("Separate unsupported observation shapes from registry failures before extending matching rules.");
    }
    if (input.aggregate.falsePositiveRate > 0) {
      reasons.push("A no-issue or indeterminate boundary produced review noise.");
      hypotheses.push("Keep uncertainty receipts outside the conflict registry until a deterministic conflicting claim is present.");
    }
    if (
      input.aggregate.deduplicationRecall < 1 ||
      input.aggregate.distinctIssuePreservation < 1
    ) {
      reasons.push("Deduplication merged a distinct issue or split a duplicate.");
      hypotheses.push("Revise only the structured fingerprint fields and rerun the frozen stream.");
    }
    if (input.aggregate.storageBytesPerUniqueIssue > 4096) {
      reasons.push("Issue envelope storage per unique issue exceeded the ceiling.");
      hypotheses.push("Compact repeated lifecycle provenance without dropping source or transition identity.");
    }
    if (input.aggregate.operatorReviewInflation > 1) {
      reasons.push("Unresolved review items exceeded current unique conflicts.");
      hypotheses.push("Collapse exact unresolved duplicates before exposing operator review views.");
    }
    return {
      label: "revise",
      reasons,
      boundedRevisionHypotheses: hypotheses,
    };
  }
  return {
    label: "supported",
    reasons: ["Every frozen lifecycle invariant and effectiveness threshold passed."],
    boundedRevisionHypotheses: [],
  };
}

export async function evaluateBattleConsistencyIssuePoc(input: {
  fixturePath?: string;
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<ConsistencyIssueEvaluationReport> {
  const fixturePath = path.resolve(input.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = validateFixtureFile(JSON.parse(fixtureText) as unknown);
  const repetitions = input.repetitions ?? fixture.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const scenarios = fixture.scenarios.map((scenario) => aggregateScenario({
    fixture: scenario,
    repetitions,
  }));
  const evaluatorPath = fileURLToPath(import.meta.url);
  const issueSourcePath = path.join(
    repositoryRoot,
    "packages/shared/src/battle-consistency-issue.ts",
  );
  const [evaluatorText, issueSourceText] = await Promise.all([
    fs.readFile(evaluatorPath, "utf8"),
    fs.readFile(issueSourcePath, "utf8"),
  ]);
  const authorityCheck = staticAuthorityCheck(issueSourceText);
  const sumScenario = (key: keyof ScenarioAggregate) => scenarios.reduce(
    (sum, scenario) =>
      sum + (typeof scenario[key] === "number" ? scenario[key] : 0),
    0,
  );
  const expectedIssueObservations = fixture.scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedIssueObservations,
    0,
  ) * repetitions;
  const falsePositiveBoundaryInputs = fixture.scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedFalsePositiveInputs,
    0,
  ) * repetitions;
  const expectedDuplicates = fixture.scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedDuplicateObservations,
    0,
  ) * repetitions;
  const expectedDistinct = fixture.scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedDistinctObservations,
    0,
  ) * repetitions;
  const expectedStale = fixture.scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedStaleReplays,
    0,
  ) * repetitions;
  const expectedReviewItems = fixture.scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedFinalUnresolvedReviewItems,
    0,
  ) * repetitions;
  const totalUniqueIssues = scenarios.reduce(
    (sum, scenario) => sum + scenario.finalUniqueIssueCount * repetitions,
    0,
  );
  const matchedIssueObservations = scenarios.reduce(
    (sum, scenario, index) =>
      sum + scenario.issueObservationRecall *
        fixture.scenarios[index]!.expectedIssueObservations * repetitions,
    0,
  );
  const falsePositiveRegistrations = scenarios.reduce(
    (sum, scenario, index) =>
      sum + (scenario.falsePositiveRate ?? 0) *
        fixture.scenarios[index]!.expectedFalsePositiveInputs * repetitions,
    0,
  );
  const correctDuplicates = scenarios.reduce(
    (sum, scenario, index) =>
      sum + (scenario.deduplicationRecall ?? 0) *
        fixture.scenarios[index]!.expectedDuplicateObservations * repetitions,
    0,
  );
  const correctDistinct = scenarios.reduce(
    (sum, scenario, index) =>
      sum + scenario.distinctIssuePreservation *
        fixture.scenarios[index]!.expectedDistinctObservations * repetitions,
    0,
  );
  const correctStale = scenarios.reduce(
    (sum, scenario, index) =>
      sum + (scenario.staleReplayNoOpAccuracy ?? 0) *
        fixture.scenarios[index]!.expectedStaleReplays * repetitions,
    0,
  );
  const totalPurposeChecks =
    ProjectionPurposeSchema.options.length * scenarios.length * repetitions;
  const correctPurposeChecks = scenarios.reduce(
    (sum, scenario) =>
      sum + scenario.purposeBlockingAccuracy *
        ProjectionPurposeSchema.options.length * repetitions,
    0,
  );
  const totalLifecycleChecks = 4 * scenarios.length * repetitions;
  const correctLifecycleChecks = scenarios.reduce(
    (sum, scenario) =>
      sum + scenario.lifecycleTraceability * 4 * repetitions,
    0,
  );
  const totalEnvelopeBytes = scenarios.reduce(
    (sum, scenario) => sum + scenario.envelopeBytes.mean * repetitions,
    0,
  );
  const actionableIssues = scenarios.reduce(
    (sum, scenario) =>
      sum + scenario.actionableIssueRate *
        scenario.finalUniqueIssueCount * repetitions,
    0,
  );
  const actualReviewItems = scenarios.reduce(
    (sum, scenario) =>
      sum + scenario.finalUnresolvedReviewItems * repetitions,
    0,
  );
  const authorityRegressionCount = sumScenario("authorityRegressionCount") +
    authorityCheck.runtimeIntegrationFileRefs.length +
    authorityCheck.exportedCanonicalWriteFunctionCount;
  const aggregateBase = {
    issueDetectionRecall: ratio(
      matchedIssueObservations,
      expectedIssueObservations,
    ),
    falsePositiveRate: ratio(
      falsePositiveRegistrations,
      falsePositiveBoundaryInputs,
    ),
    deduplicationRecall: ratio(correctDuplicates, expectedDuplicates),
    distinctIssuePreservation: ratio(correctDistinct, expectedDistinct),
    staleReplayNoOpAccuracy: ratio(correctStale, expectedStale),
    purposeBlockingAccuracy: ratio(correctPurposeChecks, totalPurposeChecks),
    lifecycleTraceability: ratio(
      correctLifecycleChecks,
      totalLifecycleChecks,
    ),
    actionableIssueRate: ratio(actionableIssues, totalUniqueIssues),
    storageBytesPerUniqueIssue: ratio(totalEnvelopeBytes, totalUniqueIssues),
    operatorReviewInflation: ratio(actualReviewItems, expectedReviewItems),
    sourceMutationCount: sumScenario("sourceMutationCount"),
    authorityRegressionCount,
    globalCoherenceClaimCount: sumScenario("globalCoherenceClaimCount"),
  };
  const hardInvariantsPass =
    aggregateBase.purposeBlockingAccuracy >=
      fixture.thresholds.purposeBlockingAccuracyMinimum &&
    aggregateBase.lifecycleTraceability >=
      fixture.thresholds.lifecycleTraceabilityMinimum &&
    aggregateBase.staleReplayNoOpAccuracy >=
      fixture.thresholds.staleReplayNoOpAccuracyMinimum &&
    aggregateBase.sourceMutationCount <=
      fixture.thresholds.sourceMutationCountMaximum &&
    aggregateBase.authorityRegressionCount <=
      fixture.thresholds.authorityRegressionCountMaximum &&
    aggregateBase.globalCoherenceClaimCount <=
      fixture.thresholds.globalCoherenceClaimCountMaximum;
  const effectivenessThresholdsPass =
    aggregateBase.issueDetectionRecall >=
      fixture.thresholds.issueDetectionRecallMinimum &&
    aggregateBase.falsePositiveRate <=
      fixture.thresholds.falsePositiveRateMaximum &&
    aggregateBase.deduplicationRecall >=
      fixture.thresholds.deduplicationRecallMinimum &&
    aggregateBase.distinctIssuePreservation >=
      fixture.thresholds.distinctIssuePreservationMinimum &&
    aggregateBase.actionableIssueRate >=
      fixture.thresholds.actionableIssueRateMinimum &&
    aggregateBase.storageBytesPerUniqueIssue <=
      fixture.thresholds.storageBytesPerUniqueIssueMaximum &&
    aggregateBase.operatorReviewInflation <=
      fixture.thresholds.operatorReviewInflationMaximum;
  const aggregate: ConsistencyIssueEvaluationReport["aggregate"] = {
    ...aggregateBase,
    hardInvariantsPass,
    effectivenessThresholdsPass,
  };

  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "consistency_issue_poc_evaluation",
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: sha256(fixtureText),
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
      issueSourcePath: path.relative(repositoryRoot, issueSourcePath),
      issueSourceSha256: sha256(issueSourceText),
    },
    execution: {
      repetitionsPerScenario: repetitions,
      scenarioCount: scenarios.length,
      scenarioRuns: scenarios.length * repetitions,
      trueIssueObservations: expectedIssueObservations,
      falsePositiveBoundaryInputs,
      externalLlmCallsMade: 0,
      xaiUsed: false,
      xaiReason:
        "Every conflict, duplicate, lifecycle transition, and purpose classification has explicit structured ground truth; XAI would add judgment noise rather than resolve an unmeasured semantic output.",
    },
    thresholds: fixture.thresholds,
    scenarios,
    staticAuthorityCheck: authorityCheck,
    aggregate,
    decision: decisionFor({
      aggregate,
      trueIssueObservations: expectedIssueObservations,
      falsePositiveBoundaryInputs,
    }),
    limitations: [
      "The frozen stream exercises explicit issue kinds and references; it does not discover contradictions from arbitrary prose.",
      "Purpose classifications are frozen server-side ground truth for these scenarios, not evidence that an unimplemented classifier generalizes.",
      "Storage per issue is measured on small in-memory envelopes and does not predict database index or retention cost.",
      "Operator-review inflation counts unresolved issue views, not human comprehension time or decision quality.",
      "Static authority scanning checks tracked TypeScript references and exported write-like functions, not every possible dynamic capability.",
      "No XAI call was needed because the evaluated lifecycle outputs are structured and deterministic.",
      "A supported result would not prove global consistency or guarantee correct final battle results.",
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
  const report = await evaluateBattleConsistencyIssuePoc({
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
    console.error(`[battle-consistency-issue-poc] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
