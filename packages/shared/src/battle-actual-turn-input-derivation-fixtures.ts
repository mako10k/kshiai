import { z } from "zod";
import {
  AdaptiveAdjudicationBatchResultSchema,
  DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
} from "./battle-adaptive-adjudication.js";
import {
  ACTUAL_TURN_INPUT_DERIVATION_FIELDS,
  ActualTurnInputDerivationFieldSchema,
  ActualTurnInputDerivationProxyKindSchema,
  ApplicabilityDerivationArtifactSchema,
  ApplicabilityDerivationSourceBundleSchema,
  sha256ApplicabilityDerivationValue,
  type ActualTurnInputDerivationArtifactKind,
  type ApplicabilityDerivationArtifact,
  type ApplicabilityDerivationSourceBundle,
} from "./battle-actual-turn-input-derivation.js";
import {
  checkPurposeScopedConsistencySlice,
} from "./battle-read-coherence.js";
import {
  ConsistencyIssueViewSchema,
  ConsistencySliceSchema,
  type ConsistencyIssueView,
} from "./battle-projection.js";

export const ACTUAL_TURN_INPUT_DERIVATION_FIXTURE_VERSION =
  "actual-turn-input-derivability-fixtures-v1" as const;

export const ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS = [
  "X01_complete_nonempty",
  "X02_complete_empty",
  "X03_all_duplicate_kinds",
  "X04_wrong_turn",
  "X05_digest_mismatch",
  "F01_policy_direct",
  "F02_policy_missing",
  "F03_policy_proxy_only",
  "P01_proposals_direct",
  "P02_proposals_missing",
  "P03_resolved_actions_proxy",
  "A01_adaptive_executed",
  "A02_adaptive_skipped",
  "A03_adaptive_absent",
  "R01_reads_direct",
  "R02_reads_missing",
  "R03_slice_or_event_proxy",
  "I01_issues_direct",
  "I02_issues_missing",
  "I03_dangling_blocking_issue",
] as const;

export const ActualTurnInputDerivationCaseRefSchema = z.enum(
  ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS,
);
export type ActualTurnInputDerivationCaseRef = z.infer<
  typeof ActualTurnInputDerivationCaseRefSchema
>;

const FieldArraySchema = z.array(ActualTurnInputDerivationFieldSchema)
  .max(ACTUAL_TURN_INPUT_DERIVATION_FIELDS.length);

const ExpectedResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("complete"),
  }).strict(),
  z.object({
    status: z.literal("insufficient_source"),
    missingFields: FieldArraySchema,
    ambiguousFields: FieldArraySchema,
    forbiddenProxyKinds: z.array(ActualTurnInputDerivationProxyKindSchema),
  }).strict(),
  z.object({
    status: z.literal("invalid_source"),
    reasonPrefixes: z.array(z.string().min(1).max(240)).min(1),
  }).strict(),
]);
export type ActualTurnInputDerivationExpectedResult = z.infer<
  typeof ExpectedResultSchema
>;

export const ActualTurnInputDerivationFixtureSchema = z.object({
  caseRef: ActualTurnInputDerivationCaseRefSchema,
  source: ApplicabilityDerivationSourceBundleSchema,
  expected: ExpectedResultSchema,
}).strict();
export type ActualTurnInputDerivationFixture = z.infer<
  typeof ActualTurnInputDerivationFixtureSchema
>;

export const ActualTurnInputDerivationFixtureCorpusSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureVersion: z.literal(ACTUAL_TURN_INPUT_DERIVATION_FIXTURE_VERSION),
  cases: z.array(ActualTurnInputDerivationFixtureSchema).length(
    ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS.length,
  ),
  boundaries: z.object({
    syntheticDataOnly: z.literal(true),
    runtimeHooks: z.literal(0),
    repositoryReads: z.literal(0),
    databaseQueries: z.literal(0),
    networkCalls: z.literal(0),
    providerCalls: z.literal(0),
    externalLlmCalls: z.literal(0),
    xaiCalls: z.literal(0),
    canonicalWrites: z.literal(0),
    persistenceWrites: z.literal(0),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const caseRefs = value.cases.map((fixture) => fixture.caseRef);
  if (
    caseRefs.length !== ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS.length ||
    caseRefs.some(
      (caseRef, index) =>
        caseRef !== ACTUAL_TURN_INPUT_DERIVATION_CASE_REFS[index],
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cases"],
      message: "fixture cases must match the frozen order and identifiers",
    });
  }
});
export type ActualTurnInputDerivationFixtureCorpus = z.infer<
  typeof ActualTurnInputDerivationFixtureCorpusSchema
>;

const TURN = 12;

function opaqueRef(
  kind: "proposal" | "claim" | "slice" | "issue" | "fact",
  ordinal: number,
): string {
  return `${kind}:${ordinal.toString(16).padStart(64, "0")}`;
}

const REFS = {
  proposalCharacter: opaqueRef("proposal", 1),
  proposalWorld: opaqueRef("proposal", 2),
  claimObject: opaqueRef("claim", 3),
  sliceCoherent: opaqueRef("slice", 4),
  sliceConflicted: opaqueRef("slice", 5),
  issueOpen: opaqueRef("issue", 6),
  issueDeferred: opaqueRef("issue", 7),
  issueResolved: opaqueRef("issue", 8),
  fallbackFact: opaqueRef("fact", 9),
} as const;

function issueViews(): ConsistencyIssueView[] {
  return [
    ConsistencyIssueViewSchema.parse({
      id: REFS.issueOpen,
      involvedFactRefs: [],
      involvedEntityRefs: ["entity.synthetic.anchor"],
      blocksPurposes: ["adjudication"],
      status: "open",
    }),
    ConsistencyIssueViewSchema.parse({
      id: REFS.issueDeferred,
      involvedFactRefs: [],
      involvedEntityRefs: ["entity.synthetic.remote"],
      blocksPurposes: ["narration"],
      status: "deferred",
    }),
    ConsistencyIssueViewSchema.parse({
      id: REFS.issueResolved,
      involvedFactRefs: [],
      involvedEntityRefs: ["entity.synthetic.anchor"],
      blocksPurposes: ["adjudication"],
      status: "resolved",
    }),
  ];
}

function consistencySlice(issues: ConsistencyIssueView[]) {
  return ConsistencySliceSchema.parse({
    schemaVersion: 2,
    purpose: "adjudication",
    scope: {
      anchorRefs: ["entity.synthetic.anchor"],
      entityRefs: ["entity.synthetic.anchor"],
      processRefs: [],
      traversedKinds: ["causal_dependency"],
      temporalWindow: { fromTurn: TURN, toTurn: TURN },
      truncated: false,
      omitted: {
        entities: 0,
        facts: 0,
        rules: 0,
        historyTurns: 0,
      },
    },
    factGroups: [],
    causalLinks: [],
    issues,
    applicableRuleRefs: [],
  });
}

function adaptiveResult() {
  const zeroUsage = {
    coarseAdjudications: 0,
    planningExpansions: 0,
    worldExpansions: 0,
    factsRead: 0,
    externalLlmCalls: 0,
  } as const;
  return AdaptiveAdjudicationBatchResultSchema.parse({
    schemaVersion: 1,
    mode: "shadow_adaptive_adjudication",
    receipts: [{
      proposalRef: REFS.proposalCharacter,
      level: 2,
      resolution: "degraded",
      outcome: "indeterminate",
      completedSteps: [],
      failureReason: "simultaneous_conflict",
      effects: [],
      costs: [],
      refinedFacts: [],
      rejectedWorldExpansionRefs: [],
      fallbackFact: {
        id: REFS.fallbackFact,
        subjectRef: "entity.synthetic.anchor",
        predicate: "state.uncertain",
        value: "unknown",
        strength: "unknown",
        provenance: "unknown_fallback",
      },
      expansionReasons: ["simultaneous_conflict"],
      budgetUsage: zeroUsage,
      sourceMutated: false,
      canonicalCommitPerformed: false,
    }],
    budget: DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
    budgetUsage: zeroUsage,
    contestedClaimRefs: [REFS.claimObject],
    externalLlmCalls: 0,
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
}

async function artifact(input: {
  caseRef: ActualTurnInputDerivationCaseRef;
  kind: ActualTurnInputDerivationArtifactKind;
  payload: unknown;
}): Promise<ApplicabilityDerivationArtifact> {
  return ApplicabilityDerivationArtifactSchema.parse({
    artifactRef: `artifact:${input.caseRef}:${input.kind}`,
    kind: input.kind,
    sourceStage: input.kind,
    turn: TURN,
    complete: true,
    payloadSha256: await sha256ApplicabilityDerivationValue(input.payload),
    payload: input.payload,
  });
}

async function baseSource(
  caseRef: ActualTurnInputDerivationCaseRef,
  options?: { empty?: boolean; adaptiveSkipped?: boolean },
): Promise<ApplicabilityDerivationSourceBundle> {
  const empty = options?.empty ?? false;
  const issues = empty ? [] : issueViews();
  const coherent = checkPurposeScopedConsistencySlice(consistencySlice([]));
  const conflicted = checkPurposeScopedConsistencySlice(
    consistencySlice(issues),
  );
  const artifacts = await Promise.all([
    artifact({
      caseRef,
      kind: "turn_fallback_policy",
      payload: {
        allowedFallbacks: empty ? [] : ["intermediate", "unknown"],
      },
    }),
    artifact({
      caseRef,
      kind: "coarse_proposal_registry",
      payload: {
        proposals: empty
          ? []
          : [
              {
                proposalRef: REFS.proposalCharacter,
                actionKind: "free_action",
              },
              {
                proposalRef: REFS.proposalWorld,
                actionKind: "world_process",
              },
            ],
      },
    }),
    artifact({
      caseRef,
      kind: "adaptive_stage_receipt",
      payload: empty || options?.adaptiveSkipped
        ? {
            status: "skipped",
            reason: "explicit synthetic fixture stage skip",
          }
        : { status: "executed", result: adaptiveResult() },
    }),
    artifact({
      caseRef,
      kind: "purpose_read_set",
      payload: {
        reads: empty
          ? []
          : [
              { sliceRef: REFS.sliceCoherent, check: coherent },
              { sliceRef: REFS.sliceConflicted, check: conflicted },
            ],
      },
    }),
    artifact({
      caseRef,
      kind: "consistency_issue_snapshot",
      payload: { issues },
    }),
  ]);
  return ApplicabilityDerivationSourceBundleSchema.parse({
    schemaVersion: 1,
    caseRef,
    turn: TURN,
    artifacts,
    observedProxyKinds: [],
  });
}

function removeArtifact(
  source: ApplicabilityDerivationSourceBundle,
  kind: ActualTurnInputDerivationArtifactKind,
): void {
  source.artifacts = source.artifacts.filter((artifact) =>
    artifact.kind !== kind
  );
}

function expectedMissing(
  field: (typeof ACTUAL_TURN_INPUT_DERIVATION_FIELDS)[number],
  forbiddenProxyKinds: z.infer<
    typeof ActualTurnInputDerivationProxyKindSchema
  >[] = [],
): ActualTurnInputDerivationExpectedResult {
  return {
    status: "insufficient_source",
    missingFields: [field],
    ambiguousFields: [],
    forbiddenProxyKinds,
  };
}

async function fixture(
  caseRef: ActualTurnInputDerivationCaseRef,
  expected: ActualTurnInputDerivationExpectedResult,
  edit?: (
    source: ApplicabilityDerivationSourceBundle,
  ) => void | Promise<void>,
  options?: { empty?: boolean; adaptiveSkipped?: boolean },
): Promise<ActualTurnInputDerivationFixture> {
  const source = await baseSource(caseRef, options);
  await edit?.(source);
  return ActualTurnInputDerivationFixtureSchema.parse({
    caseRef,
    source,
    expected,
  });
}

export async function buildActualTurnInputDerivationFixtureCorpus(): Promise<
  ActualTurnInputDerivationFixtureCorpus
> {
  const cases = await Promise.all([
    fixture("X01_complete_nonempty", { status: "complete" }),
    fixture(
      "X02_complete_empty",
      { status: "complete" },
      undefined,
      { empty: true },
    ),
    fixture(
      "X03_all_duplicate_kinds",
      {
        status: "insufficient_source",
        missingFields: [],
        ambiguousFields: [...ACTUAL_TURN_INPUT_DERIVATION_FIELDS],
        forbiddenProxyKinds: [],
      },
      (source) => {
        source.artifacts.push(...source.artifacts.map((item) => ({
          ...structuredClone(item),
          artifactRef: `${item.artifactRef}:duplicate`,
        })));
      },
    ),
    fixture(
      "X04_wrong_turn",
      {
        status: "invalid_source",
        reasonPrefixes: ["artifact_turn_mismatch:"],
      },
      (source) => {
        source.artifacts[0]!.turn += 1;
      },
    ),
    fixture(
      "X05_digest_mismatch",
      {
        status: "invalid_source",
        reasonPrefixes: ["payload_digest_mismatch:"],
      },
      (source) => {
        const policy = source.artifacts.find((item) =>
          item.kind === "turn_fallback_policy"
        );
        if (policy?.kind !== "turn_fallback_policy") return;
        policy.payload.allowedFallbacks = ["defense"];
      },
    ),
    fixture("F01_policy_direct", { status: "complete" }),
    fixture(
      "F02_policy_missing",
      expectedMissing("allowedFallbacks"),
      (source) => removeArtifact(source, "turn_fallback_policy"),
    ),
    fixture(
      "F03_policy_proxy_only",
      expectedMissing("allowedFallbacks", ["fallback_outcome_proxy"]),
      (source) => {
        removeArtifact(source, "turn_fallback_policy");
        source.observedProxyKinds = ["fallback_outcome_proxy"];
      },
    ),
    fixture("P01_proposals_direct", { status: "complete" }),
    fixture(
      "P02_proposals_missing",
      expectedMissing("proposals"),
      (source) => removeArtifact(source, "coarse_proposal_registry"),
    ),
    fixture(
      "P03_resolved_actions_proxy",
      expectedMissing("proposals", ["resolved_actions"]),
      (source) => {
        removeArtifact(source, "coarse_proposal_registry");
        source.observedProxyKinds = ["resolved_actions"];
      },
    ),
    fixture("A01_adaptive_executed", { status: "complete" }),
    fixture(
      "A02_adaptive_skipped",
      { status: "complete" },
      undefined,
      { adaptiveSkipped: true },
    ),
    fixture(
      "A03_adaptive_absent",
      expectedMissing("adaptive"),
      (source) => removeArtifact(source, "adaptive_stage_receipt"),
    ),
    fixture("R01_reads_direct", { status: "complete" }),
    fixture(
      "R02_reads_missing",
      expectedMissing("reads"),
      (source) => removeArtifact(source, "purpose_read_set"),
    ),
    fixture(
      "R03_slice_or_event_proxy",
      expectedMissing("reads", ["slice_without_read_check"]),
      (source) => {
        removeArtifact(source, "purpose_read_set");
        source.observedProxyKinds = ["slice_without_read_check"];
      },
    ),
    fixture("I01_issues_direct", { status: "complete" }),
    fixture(
      "I02_issues_missing",
      expectedMissing("issues"),
      (source) => removeArtifact(source, "consistency_issue_snapshot"),
    ),
    fixture(
      "I03_dangling_blocking_issue",
      {
        status: "invalid_source",
        reasonPrefixes: ["blocking_issue_missing:"],
      },
      async (source) => {
        const snapshot = source.artifacts.find((item) =>
          item.kind === "consistency_issue_snapshot"
        );
        if (snapshot?.kind !== "consistency_issue_snapshot") return;
        snapshot.payload.issues = snapshot.payload.issues.filter((issue) =>
          issue.id !== REFS.issueOpen
        );
        snapshot.payloadSha256 = await sha256ApplicabilityDerivationValue(
          snapshot.payload,
        );
      },
    ),
  ]);
  return ActualTurnInputDerivationFixtureCorpusSchema.parse({
    schemaVersion: 1,
    fixtureVersion: ACTUAL_TURN_INPUT_DERIVATION_FIXTURE_VERSION,
    cases,
    boundaries: {
      syntheticDataOnly: true,
      runtimeHooks: 0,
      repositoryReads: 0,
      databaseQueries: 0,
      networkCalls: 0,
      providerCalls: 0,
      externalLlmCalls: 0,
      xaiCalls: 0,
      canonicalWrites: 0,
      persistenceWrites: 0,
    },
  });
}
