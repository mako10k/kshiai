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
  maxAttemptElapsedMs: 240_000;
  maxProviderCallElapsedMs: 60_000;
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
