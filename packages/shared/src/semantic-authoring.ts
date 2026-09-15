import { z } from "zod";

export type SemanticAuthoringModeV1 = "create" | "revise" | "migrate";

export type SemanticAuthoringFamilyV1 =
  | "character"
  | "battlefield-preset"
  | "narration-style";

export type SemanticAuthoringRunV1 = Readonly<{
  runId: string;
  attemptId: string;
  family: SemanticAuthoringFamilyV1;
  mode: SemanticAuthoringModeV1;
  ownerUserId: string;
  sourceIdentity: Readonly<{
    assetId: string;
    generationId: string | null;
    contentDigest: string;
  }>;
  targetContract: Readonly<{
    family: SemanticAuthoringFamilyV1;
    version: number;
  }>;
  adapterIdentity: string;
  policyIdentity: string;
  pricingIdentity: string;
  tokenEstimatorIdentity: string;
  expectedCurrentGenerationId: string | null;
  executionFence: Readonly<{
    ownerId: string;
    fencingToken: number;
    runVersion: number;
  }>;
}>;

export type SemanticAuthoringPolicyV1 = Readonly<{
  identity: "semantic_authoring_policy_v1";
  maxConcurrentProviderRequests: 1;
  maxLlmCalls: 8;
  maxCountedSteps: 48;
  maxInputTokensPerCall: 6_000;
  maxInputBytesPerCall: 24_576;
  maxOutputTokensPerCall: 1_500;
  maxOutputBytesPerCall: 6_144;
  maxCumulativeInputTokens: 32_000;
  maxCumulativeOutputTokens: 8_000;
  maxCostMicroUsd: 500_000;
  maxProgressObservations: 8;
  maxRecoveryStrategyChanges: 2;
  pricingIdentity: string;
  tokenEstimatorIdentity: string;
}>;

export type ProviderTransportPolicyV1 = Readonly<{
  identity: string;
  routeIdentity: string;
  timeoutMs: number;
  maxRecoveriesPerWorkItem: 0 | 1;
}>;

export type WorkerExecutionPolicyV1 = Readonly<{
  identity: string;
  platformIdentity: string;
  leaseDurationMs: number;
}>;

export type SemanticAuthoringAccountingV1 = Readonly<{
  llmCalls: number;
  countedSteps: number;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}>;

export type SemanticAuthoringReservationV1 = Readonly<{
  requestId: string;
  inputTokens: number;
  inputBytes: number;
  outputTokens: number;
  outputBytes: number;
  costMicroUsd: number;
  elapsedMs: number;
}>;

export type ProposalProvenanceMethodV1 =
  | "preserved"
  | "derived"
  | "generated"
  | "reconciled"
  | "owner-clarified";

export type ProposalProvenanceV1 = Readonly<{
  targetClaimId: string;
  sourceClaimIds: readonly string[];
  method: ProposalProvenanceMethodV1;
}>;

export type ProposalUncertaintyKindV1 =
  | "missing-source"
  | "ambiguous-source"
  | "generated-detail"
  | "semantic-tension"
  | "deferred-resolution";

export type ProposalUncertaintyV1 = Readonly<{
  claimId: string;
  kind: ProposalUncertaintyKindV1;
  explanation: string;
}>;

export type SemanticProposalV1<P> = Readonly<{
  proposalId: string;
  runId: string;
  workItemId: string;
  baseCandidateRevision: number;
  capabilitySessionId: string;
  proposalSchemaIdentity: string;
  sourceClaimIds: readonly string[];
  affectedObligationIds: readonly string[];
  declaredSemanticDependantIds: readonly string[];
  provenance: readonly ProposalProvenanceV1[];
  ownerExplanation: string;
  uncertainty: readonly ProposalUncertaintyV1[];
  payload: P;
}>;

export type AdapterProgressObservationV1 = Readonly<{
  phase: string;
  resolvedRequiredObligationCount: number;
  coveredMaterialClaimCount: number;
  unresolvedMaterialFindingKeys: readonly string[];
  relevantStateDigest: string;
  activeSemanticClusterKey: string;
  materialProgress: boolean;
}>;

export type SemanticAuthoringRunStatusV1 =
  | "pending"
  | "claimed"
  | "ready_for_review"
  | "needs_owner_answer"
  | "failed"
  | "cancelled"
  | "expired";

const terminalSemanticAuthoringStatuses: ReadonlySet<SemanticAuthoringRunStatusV1> = new Set([
  "ready_for_review",
  "needs_owner_answer",
  "failed",
  "cancelled",
  "expired",
]);

export function isTerminalSemanticAuthoringStatusV1(
  status: SemanticAuthoringRunStatusV1,
): boolean {
  return terminalSemanticAuthoringStatuses.has(status);
}

export type SemanticAuthoringCapabilityRoleV1 =
  | "query-context"
  | "propose-change"
  | "submit-review";

export type SemanticAuthoringSkillV1 = Readonly<{
  identity: string;
  objective: string;
  phase: string;
  legalCapabilityRoles: readonly SemanticAuthoringCapabilityRoleV1[];
  capabilityRequestGuidance: string;
  resourceReminder: string;
  disclosureReminder: string;
}>;

export type SemanticAuthoringCapabilitySessionV1 = Readonly<{
  runId: string;
  workItemId: string;
  capabilitySessionId: string;
  mutationRole: Exclude<SemanticAuthoringCapabilityRoleV1, "query-context">;
  allowedSelectors: readonly string[];
  proposalSchemaIdentity: string;
  writeClosure: readonly string[];
  expiresAtMs: number;
  queryInvocationCount: number;
  mutationInvocationCount: number;
  mutationSucceeded: boolean;
  revoked: boolean;
}>;

export type SourceDispositionKindV1 =
  | "preserve"
  | "transform"
  | "split"
  | "merge"
  | "supersede"
  | "discard-as-nonmaterial"
  | "preserve-in-capsule";

export type SourceDispositionDecisionV1 = Readonly<{
  sourceClaimId: string;
  disposition: SourceDispositionKindV1;
  targetClaimIds: readonly string[];
  rationale: string;
}>;

export type SemanticAuthoringDecodeResultV1<Value> =
  | Readonly<{ accepted: true; value: Value }>
  | Readonly<{ accepted: false }>;

export type SemanticAuthoringBaselineV1<Candidate, Obligation> = Readonly<{
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  provenance?: ReadonlyMap<string, readonly ProposalProvenanceV1[]>;
  sourceDispositions?: ReadonlyMap<string, SourceDispositionDecisionV1>;
}>;

export type SemanticAuthoringAdapterStateViewV1<Candidate, Obligation, Finding> = Readonly<{
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  findings: ReadonlyMap<string, Finding>;
  provenance?: ReadonlyMap<string, readonly ProposalProvenanceV1[]>;
  sourceDispositions?: ReadonlyMap<string, SourceDispositionDecisionV1>;
}>;

export type SemanticAuthoringWorkSelectionV1<WorkItem> =
  | Readonly<{ selected: true; workItem: WorkItem }>
  | Readonly<{ selected: false }>;

export type SemanticAuthoringCapabilityDescriptorV1 = Readonly<{
  skill: SemanticAuthoringSkillV1;
  allowedSelectors: readonly string[];
  proposalSchemaIdentity: string;
  writeClosure: readonly string[];
}>;

export type SemanticAuthoringStageProposalInputV1<
  Candidate,
  Obligation,
  Finding,
  Proposal,
> = Readonly<{
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  findings: ReadonlyMap<string, Finding>;
  provenance?: ReadonlyMap<string, readonly ProposalProvenanceV1[]>;
  sourceDispositions?: ReadonlyMap<string, SourceDispositionDecisionV1>;
  proposal: Proposal;
}>;

export type SemanticAuthoringStageProposalResultV1<Candidate, Obligation, Finding> =
  | Readonly<{
      accepted: true;
      candidate: Candidate;
      obligations: ReadonlyMap<string, Obligation>;
      findings: ReadonlyMap<string, Finding>;
      sourceDispositions?: ReadonlyMap<string, SourceDispositionDecisionV1>;
    }>
  | Readonly<{
      accepted: false;
      findingKey: string;
      finding: Finding;
    }>;

export type SemanticAuthoringAffectedReconciliationInputV1<
  Candidate,
  Obligation,
  Finding,
> = Readonly<{
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  findings: ReadonlyMap<string, Finding>;
  affectedObligationIds: readonly string[];
  declaredSemanticDependantIds: readonly string[];
}>;

export type SemanticAuthoringReconciliationResultV1<Finding> = Readonly<{
  findings: ReadonlyMap<string, Finding>;
}>;

export type SemanticAuthoringProgressInputV1<Candidate, Obligation, Finding> = Readonly<{
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  findings: ReadonlyMap<string, Finding>;
  phase: string;
  previous?: AdapterProgressObservationV1;
}>;

export type SemanticAuthoringOwnerQuestionEvidenceV1 = Readonly<{
  explicitProblemClaimIds: readonly string[];
  materialProtectedImpactClaimIds: readonly string[];
  materiallyDifferentOutcomeClaimIds: readonly string[];
  exhaustedRecoveryFindingKeys: readonly string[];
  unsafeAutomaticResolutionClaimIds: readonly string[];
}>;

export type SemanticAuthoringQuestionAssessmentInputV1<
  Candidate,
  Obligation,
  Finding,
> = SemanticAuthoringAdapterStateViewV1<Candidate, Obligation, Finding>;

export type SemanticAuthoringQuestionAssessmentV1<Question> =
  | Readonly<{
      ask: true;
      question: Question;
      evidence: SemanticAuthoringOwnerQuestionEvidenceV1;
    }>
  | Readonly<{ ask: false }>;

export type SemanticAuthoringSourceClarificationV1 = Readonly<{
  questionId: string;
  affectedClaimIds: readonly string[];
}>;

export type SemanticAuthoringObligationCoverageV1 = Readonly<{
  resolvedRequiredObligationCount: number;
  requiredObligationCount: number;
}>;

export type SemanticAuthoringFinalizationInputV1<Candidate, Obligation, Finding> =
  SemanticAuthoringAdapterStateViewV1<Candidate, Obligation, Finding>;

export type SemanticAuthoringFinalizationResultV1<FinalCandidate, Finding> =
  | Readonly<{
      accepted: true;
      finalCandidate: FinalCandidate;
      finalCandidateDigest: string;
      obligationCoverage: SemanticAuthoringObligationCoverageV1;
      reconciliationReceiptIdentity: string;
      compilerReceiptIdentity: string;
      disclosureReceiptIdentity: string;
    }>
  | Readonly<{
      accepted: false;
      findings: ReadonlyMap<string, Finding>;
    }>;

export interface SemanticAuthoringAdapterV1<
  Source,
  Candidate,
  Obligation,
  WorkItem,
  Proposal,
  Finding,
  Question,
  Answer,
  FinalCandidate,
> {
  readonly identity: string;
  decodeFrozenSource(value: unknown): SemanticAuthoringDecodeResultV1<Source>;
  buildBaseline(
    source: Source,
    mode: SemanticAuthoringModeV1,
  ): SemanticAuthoringBaselineV1<Candidate, Obligation>;
  selectWork(
    state: SemanticAuthoringAdapterStateViewV1<Candidate, Obligation, Finding>,
  ): SemanticAuthoringWorkSelectionV1<WorkItem>;
  describeCapabilities(work: WorkItem): SemanticAuthoringCapabilityDescriptorV1;
  decodeProposal(
    work: WorkItem,
    value: unknown,
  ): SemanticAuthoringDecodeResultV1<Proposal>;
  stageProposal(
    input: SemanticAuthoringStageProposalInputV1<Candidate, Obligation, Finding, Proposal>,
  ): SemanticAuthoringStageProposalResultV1<Candidate, Obligation, Finding>;
  reconcileAffected(
    input: SemanticAuthoringAffectedReconciliationInputV1<Candidate, Obligation, Finding>,
  ): SemanticAuthoringReconciliationResultV1<Finding>;
  observeProgress(
    input: SemanticAuthoringProgressInputV1<Candidate, Obligation, Finding>,
  ): AdapterProgressObservationV1;
  assessQuestion(
    input: SemanticAuthoringQuestionAssessmentInputV1<Candidate, Obligation, Finding>,
  ): SemanticAuthoringQuestionAssessmentV1<Question>;
  applyAnswer(
    source: Source,
    question: Question,
    answer: Answer,
  ): SemanticAuthoringSourceClarificationV1;
  finalize(
    input: SemanticAuthoringFinalizationInputV1<Candidate, Obligation, Finding>,
  ): SemanticAuthoringFinalizationResultV1<FinalCandidate, Finding>;
}

export type SemanticAuthoringResultIdentityV1 = Readonly<{
  runId: string;
  attemptId: string;
  sourceIdentity: SemanticAuthoringRunV1["sourceIdentity"];
  policyIdentity: string;
  adapterIdentity: string;
  accounting: SemanticAuthoringAccountingV1;
  sourceLedger?: Readonly<{
    provenance: readonly ProposalProvenanceV1[];
    sourceDispositions: readonly SourceDispositionDecisionV1[];
  }>;
}>;

export type SemanticAuthoringFailureCategoryV1 =
  | "stalled_without_progress"
  | "repeated_state_cycle"
  | "resource_exhausted"
  | "trusted_state_corrupt"
  | "process_or_lease_lost"
  | "technical_failure"
  | "bounded_semantic_failure";

export type SemanticAuthoringFailureReceiptV1 = Readonly<{
  category: SemanticAuthoringFailureCategoryV1;
  accounting: SemanticAuthoringAccountingV1;
  relevantFindingKeys: readonly string[];
  sourceIdentity: SemanticAuthoringRunV1["sourceIdentity"];
}>;

export type SemanticAuthoringResumptionRecipeV1 = Readonly<{
  predecessorRunId: string;
  predecessorAttemptId: string;
  questionId: string;
}>;

export type SemanticAuthoringResolverResultV1<FinalCandidate, Question> =
  | Readonly<SemanticAuthoringResultIdentityV1 & {
      kind: "ready_for_review";
      finalCandidate: FinalCandidate;
      finalCandidateDigest: string;
      obligationCoverage: SemanticAuthoringObligationCoverageV1;
      reconciliationReceiptIdentity: string;
      compilerReceiptIdentity: string;
      disclosureReceiptIdentity: string;
      expectedCurrentGenerationId: string | null;
    }>
  | Readonly<SemanticAuthoringResultIdentityV1 & {
      kind: "needs_owner_answer";
      question: Question;
      evidence: SemanticAuthoringOwnerQuestionEvidenceV1;
      resumption: SemanticAuthoringResumptionRecipeV1;
    }>
  | Readonly<SemanticAuthoringResultIdentityV1 & {
      kind: "failed";
      receipt: SemanticAuthoringFailureReceiptV1;
    }>;

export type SemanticAuthoringResolverKindV1 =
  SemanticAuthoringResolverResultV1<never, never>["kind"];

export function isSemanticAuthoringResolverKindV1(
  value: string,
): value is SemanticAuthoringResolverKindV1 {
  return (
    value === "ready_for_review" ||
    value === "needs_owner_answer" ||
    value === "failed"
  );
}

export type SemanticAuthoringStateV1<
  Candidate,
  Obligation,
  Finding,
  WorkItem,
  Question,
  FinalCandidate,
> = Readonly<{
  run: SemanticAuthoringRunV1;
  policy: SemanticAuthoringPolicyV1;
  candidateRevision: number;
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  findings: ReadonlyMap<string, Finding>;
  provenance: ReadonlyMap<string, readonly ProposalProvenanceV1[]>;
  sourceDispositions: ReadonlyMap<string, SourceDispositionDecisionV1>;
  accounting: SemanticAuthoringAccountingV1;
  outstandingReservation: SemanticAuthoringReservationV1 | null;
  phase: string;
  progressHistory: readonly AdapterProgressObservationV1[];
  recoveryStrategyChanges: number;
  cycleRecoveryAlreadyUsed: boolean;
  activeWorkItem: WorkItem | null;
  capabilitySession: SemanticAuthoringCapabilitySessionV1 | null;
  terminalResult: SemanticAuthoringResolverResultV1<FinalCandidate, Question> | null;
}>;

const SemanticAuthoringIdV1Schema = z.string().min(1).max(160);

function uniqueArray<Element extends z.ZodTypeAny>(
  element: Element,
  minimum: number,
  maximum: number,
) {
  return z.array(element).min(minimum).max(maximum).superRefine((items, context) => {
    if (new Set(items).size !== items.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Array members must be unique",
      });
    }
  });
}

export const ProposalProvenanceMethodV1Schema = z.enum([
  "preserved",
  "derived",
  "generated",
  "reconciled",
  "owner-clarified",
]);

export const ProposalProvenanceV1Schema = z.object({
  targetClaimId: SemanticAuthoringIdV1Schema,
  sourceClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 12),
  method: ProposalProvenanceMethodV1Schema,
}).strict();

export const ProposalUncertaintyKindV1Schema = z.enum([
  "missing-source",
  "ambiguous-source",
  "generated-detail",
  "semantic-tension",
  "deferred-resolution",
]);

export const ProposalUncertaintyV1Schema = z.object({
  claimId: SemanticAuthoringIdV1Schema,
  kind: ProposalUncertaintyKindV1Schema,
  explanation: z.string().min(1).max(400),
}).strict();

export function createSemanticProposalV1Schema<PayloadSchema extends z.ZodTypeAny>(
  proposalSchemaIdentity: string,
  payloadSchema: PayloadSchema,
) {
  return z.object({
    proposalId: SemanticAuthoringIdV1Schema,
    runId: SemanticAuthoringIdV1Schema,
    workItemId: SemanticAuthoringIdV1Schema,
    baseCandidateRevision: z.number().int().min(0).max(2_147_483_647),
    capabilitySessionId: SemanticAuthoringIdV1Schema,
    proposalSchemaIdentity: z.literal(proposalSchemaIdentity),
    sourceClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
    affectedObligationIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
    declaredSemanticDependantIds: uniqueArray(SemanticAuthoringIdV1Schema, 0, 24),
    provenance: z.array(ProposalProvenanceV1Schema).min(1).max(24),
    ownerExplanation: z.string().min(1).max(800),
    uncertainty: z.array(ProposalUncertaintyV1Schema).max(8),
    payload: payloadSchema,
  }).strict();
}

export const SemanticAuthoringContextRoleV1Schema = z.enum([
  "source",
  "candidate",
  "obligation",
  "finding",
  "mechanic",
  "preservation",
]);

export const SemanticAuthoringContextSegmentV1Schema = z.object({
  segmentId: SemanticAuthoringIdV1Schema,
  claimId: SemanticAuthoringIdV1Schema,
  role: SemanticAuthoringContextRoleV1Schema,
  text: z.string().min(1).max(1_200),
  referenceIds: uniqueArray(SemanticAuthoringIdV1Schema, 0, 8),
}).strict();

export function createSemanticAuthoringQueryInputV1Schema<
  SelectorSchema extends z.ZodTypeAny,
>(selectorSchema: SelectorSchema) {
  return z.object({
    runId: SemanticAuthoringIdV1Schema,
    workItemId: SemanticAuthoringIdV1Schema,
    capabilitySessionId: SemanticAuthoringIdV1Schema,
    selector: selectorSchema,
    claimIds: uniqueArray(SemanticAuthoringIdV1Schema, 0, 8),
  }).strict();
}

export function createSemanticAuthoringQueryResultV1Schema<
  SelectorSchema extends z.ZodTypeAny,
>(selectorSchema: SelectorSchema) {
  return z.object({
    selector: selectorSchema,
    segments: z.array(SemanticAuthoringContextSegmentV1Schema).min(1).max(8),
  }).strict();
}

export function createSemanticAuthoringSubmissionIssueV1Schema<
  CodeSchema extends z.ZodTypeAny,
>(codeSchema: CodeSchema) {
  return z.object({
    code: codeSchema,
    operationIndex: z.number().int().min(0).max(7).nullable(),
    message: z.string().min(1).max(400),
    affectedClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 0, 8),
  }).strict();
}

export const SemanticAuthoringAccountingV1Schema = z.object({
  llmCalls: z.number().int().nonnegative(),
  countedSteps: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
}).strict();

export const SemanticAuthoringReservationV1Schema = z.object({
  requestId: SemanticAuthoringIdV1Schema,
  inputTokens: z.number().int().nonnegative(),
  inputBytes: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  outputBytes: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
}).strict();

export const SemanticAuthoringFailureReceiptV1Schema = z.object({
  category: z.enum([
    "stalled_without_progress",
    "repeated_state_cycle",
    "resource_exhausted",
    "trusted_state_corrupt",
    "process_or_lease_lost",
    "technical_failure",
    "bounded_semantic_failure",
  ]),
  accounting: SemanticAuthoringAccountingV1Schema,
  relevantFindingKeys: uniqueArray(SemanticAuthoringIdV1Schema, 0, 24),
  sourceIdentity: z.object({
    assetId: SemanticAuthoringIdV1Schema,
    generationId: SemanticAuthoringIdV1Schema.nullable(),
    contentDigest: z.string().min(1).max(128),
  }).strict(),
}).strict();

export const SemanticAuthoringOwnerQuestionEvidenceV1Schema = z.object({
  explicitProblemClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
  materialProtectedImpactClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
  materiallyDifferentOutcomeClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
  exhaustedRecoveryFindingKeys: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
  unsafeAutomaticResolutionClaimIds: uniqueArray(SemanticAuthoringIdV1Schema, 1, 24),
}).strict();

export const SemanticAuthoringResumptionRecipeV1Schema = z.object({
  predecessorRunId: SemanticAuthoringIdV1Schema,
  predecessorAttemptId: SemanticAuthoringIdV1Schema,
  questionId: SemanticAuthoringIdV1Schema,
}).strict();

export type SemanticAuthoringProviderRequestOutcomeV1 =
  | "succeeded"
  | "failed"
  | "unknown_consumption";

export type SemanticAuthoringDurableRunV1 = Readonly<{
  runId: string;
  attemptId: string;
  predecessorRunId: string | null;
  family: SemanticAuthoringFamilyV1;
  mode: SemanticAuthoringModeV1;
  ownerUserId: string;
  sourceIdentity: SemanticAuthoringRunV1["sourceIdentity"];
  sourcePayloadRef: string;
  targetContract: SemanticAuthoringRunV1["targetContract"];
  adapterIdentity: string;
  policyIdentity: string;
  pricingIdentity: string;
  tokenEstimatorIdentity: string;
  expectedCurrentGenerationId: string | null;
  status: SemanticAuthoringRunStatusV1;
  accounting: SemanticAuthoringAccountingV1;
  failureReceipt: SemanticAuthoringFailureReceiptV1 | null;
  executionFence: SemanticAuthoringRunV1["executionFence"];
  createdAt: string;
  updatedAt: string;
}>;
