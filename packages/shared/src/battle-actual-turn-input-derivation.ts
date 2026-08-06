import { z } from "zod";
import {
  AdaptiveAdjudicationBatchResultSchema,
} from "./battle-adaptive-adjudication.js";
import {
  ActualTurnShadowApplicabilityInputSchema,
} from "./battle-actual-turn-shadow-observation.js";
import {
  ConflictHandlingApplicabilityInputSchema,
  type ConflictHandlingApplicabilityInput,
} from "./battle-conflict-handling-applicability.js";
import {
  PurposeScopedReadCheckSchema,
} from "./battle-read-coherence.js";
import {
  ConsistencyIssueViewSchema,
} from "./battle-projection.js";

export const ACTUAL_TURN_INPUT_DERIVATION_PROTOCOL_ID =
  "actual-turn-input-derivability-v1" as const;

export const ACTUAL_TURN_INPUT_DERIVATION_FIELDS = [
  "allowedFallbacks",
  "proposals",
  "adaptive",
  "reads",
  "issues",
] as const;

export const ActualTurnInputDerivationFieldSchema = z.enum(
  ACTUAL_TURN_INPUT_DERIVATION_FIELDS,
);
export type ActualTurnInputDerivationField = z.infer<
  typeof ActualTurnInputDerivationFieldSchema
>;

export const ACTUAL_TURN_INPUT_DERIVATION_ARTIFACT_KINDS = [
  "turn_fallback_policy",
  "coarse_proposal_registry",
  "adaptive_stage_receipt",
  "purpose_read_set",
  "consistency_issue_snapshot",
] as const;

export const ActualTurnInputDerivationArtifactKindSchema = z.enum(
  ACTUAL_TURN_INPUT_DERIVATION_ARTIFACT_KINDS,
);
export type ActualTurnInputDerivationArtifactKind = z.infer<
  typeof ActualTurnInputDerivationArtifactKindSchema
>;

export const ACTUAL_TURN_INPUT_DERIVATION_PROXY_KINDS = [
  "resolved_actions",
  "events_or_parameter_deltas",
  "speech_narration_or_cognition",
  "prompt_or_provider_output",
  "fallback_outcome_proxy",
  "slice_without_read_check",
  "blocking_refs_without_issue_snapshot",
] as const;

export const ActualTurnInputDerivationProxyKindSchema = z.enum(
  ACTUAL_TURN_INPUT_DERIVATION_PROXY_KINDS,
);
export type ActualTurnInputDerivationProxyKind = z.infer<
  typeof ActualTurnInputDerivationProxyKindSchema
>;

const RefSchema = z.string().min(1).max(240);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const InputObjectSchema = ConflictHandlingApplicabilityInputSchema.innerType();

const AuthorityHeaderShape = {
  artifactRef: RefSchema,
  turn: z.number().int().nonnegative(),
  complete: z.literal(true),
  payloadSha256: Sha256Schema,
};

export const TurnFallbackPolicyArtifactSchema = z.object({
  ...AuthorityHeaderShape,
  kind: z.literal("turn_fallback_policy"),
  sourceStage: z.literal("turn_fallback_policy"),
  payload: z.object({
    allowedFallbacks: InputObjectSchema.shape.allowedFallbacks,
  }).strict(),
}).strict();
export type TurnFallbackPolicyArtifact = z.infer<
  typeof TurnFallbackPolicyArtifactSchema
>;

export const CoarseProposalRegistryArtifactSchema = z.object({
  ...AuthorityHeaderShape,
  kind: z.literal("coarse_proposal_registry"),
  sourceStage: z.literal("coarse_proposal_registry"),
  payload: z.object({
    proposals: InputObjectSchema.shape.proposals,
  }).strict(),
}).strict();
export type CoarseProposalRegistryArtifact = z.infer<
  typeof CoarseProposalRegistryArtifactSchema
>;

const AdaptiveStageReceiptPayloadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("executed"),
    result: AdaptiveAdjudicationBatchResultSchema,
  }).strict(),
  z.object({
    status: z.literal("skipped"),
    reason: z.string().min(1).max(320),
  }).strict(),
]);

export const AdaptiveStageReceiptArtifactSchema = z.object({
  ...AuthorityHeaderShape,
  kind: z.literal("adaptive_stage_receipt"),
  sourceStage: z.literal("adaptive_stage_receipt"),
  payload: AdaptiveStageReceiptPayloadSchema,
}).strict();
export type AdaptiveStageReceiptArtifact = z.infer<
  typeof AdaptiveStageReceiptArtifactSchema
>;

export const PurposeReadSetArtifactSchema = z.object({
  ...AuthorityHeaderShape,
  kind: z.literal("purpose_read_set"),
  sourceStage: z.literal("purpose_read_set"),
  payload: z.object({
    reads: z.array(z.object({
      sliceRef: RefSchema,
      check: PurposeScopedReadCheckSchema,
    }).strict()).max(32),
  }).strict(),
}).strict();
export type PurposeReadSetArtifact = z.infer<
  typeof PurposeReadSetArtifactSchema
>;

export const ConsistencyIssueSnapshotArtifactSchema = z.object({
  ...AuthorityHeaderShape,
  kind: z.literal("consistency_issue_snapshot"),
  sourceStage: z.literal("consistency_issue_snapshot"),
  payload: z.object({
    issues: z.array(ConsistencyIssueViewSchema).max(128),
  }).strict(),
}).strict();
export type ConsistencyIssueSnapshotArtifact = z.infer<
  typeof ConsistencyIssueSnapshotArtifactSchema
>;

export const ApplicabilityDerivationArtifactSchema = z.discriminatedUnion(
  "kind",
  [
    TurnFallbackPolicyArtifactSchema,
    CoarseProposalRegistryArtifactSchema,
    AdaptiveStageReceiptArtifactSchema,
    PurposeReadSetArtifactSchema,
    ConsistencyIssueSnapshotArtifactSchema,
  ],
);
export type ApplicabilityDerivationArtifact = z.infer<
  typeof ApplicabilityDerivationArtifactSchema
>;

export const ApplicabilityDerivationSourceBundleSchema = z.object({
  schemaVersion: z.literal(1),
  caseRef: z.string().regex(/^[XFPARI][0-9]{2}_[a-z0-9_]+$/u),
  turn: z.number().int().nonnegative(),
  artifacts: z.array(ApplicabilityDerivationArtifactSchema).max(10),
  observedProxyKinds: z.array(ActualTurnInputDerivationProxyKindSchema)
    .max(ACTUAL_TURN_INPUT_DERIVATION_PROXY_KINDS.length),
}).strict().superRefine((value, ctx) => {
  const artifactRefs = value.artifacts.map((artifact) => artifact.artifactRef);
  if (new Set(artifactRefs).size !== artifactRefs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["artifacts"],
      message: "artifact references must be unique",
    });
  }
  if (
    new Set(value.observedProxyKinds).size !== value.observedProxyKinds.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["observedProxyKinds"],
      message: "observed proxy kinds must be unique",
    });
  }
});
export type ApplicabilityDerivationSourceBundle = z.infer<
  typeof ApplicabilityDerivationSourceBundleSchema
>;

const ProvenanceEntrySchema = z.object({
  artifactRef: RefSchema,
  payloadSha256: Sha256Schema,
  sourcePaths: z.array(z.string().min(1).max(240)).min(1).max(64),
}).strict();

export const ApplicabilityDerivationProvenanceSchema = z.object({
  allowedFallbacks: ProvenanceEntrySchema,
  proposals: ProvenanceEntrySchema,
  adaptive: ProvenanceEntrySchema,
  reads: ProvenanceEntrySchema,
  issues: ProvenanceEntrySchema,
}).strict();
export type ApplicabilityDerivationProvenance = z.infer<
  typeof ApplicabilityDerivationProvenanceSchema
>;

const FieldArraySchema = z.array(ActualTurnInputDerivationFieldSchema)
  .max(ACTUAL_TURN_INPUT_DERIVATION_FIELDS.length);

export const ApplicabilityDerivationResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("complete"),
      applicabilityInput: ConflictHandlingApplicabilityInputSchema,
      provenance: ApplicabilityDerivationProvenanceSchema,
      inferredFieldCount: z.literal(0),
    }).strict(),
    z.object({
      status: z.literal("insufficient_source"),
      availableFields: FieldArraySchema,
      missingFields: FieldArraySchema,
      ambiguousFields: FieldArraySchema,
      forbiddenProxyKinds: z.array(ActualTurnInputDerivationProxyKindSchema)
        .max(ACTUAL_TURN_INPUT_DERIVATION_PROXY_KINDS.length),
      inferredFieldCount: z.literal(0),
    }).strict(),
    z.object({
      status: z.literal("invalid_source"),
      reasons: z.array(z.string().min(1).max(500)).min(1).max(64),
      inferredFieldCount: z.literal(0),
    }).strict(),
  ],
);
export type ApplicabilityDerivationResult = z.infer<
  typeof ApplicabilityDerivationResultSchema
>;

const FIELD_FOR_KIND: Record<
  ActualTurnInputDerivationArtifactKind,
  ActualTurnInputDerivationField
> = {
  turn_fallback_policy: "allowedFallbacks",
  coarse_proposal_registry: "proposals",
  adaptive_stage_receipt: "adaptive",
  purpose_read_set: "reads",
  consistency_issue_snapshot: "issues",
};

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

export function stableApplicabilityDerivationJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) {
    throw new TypeError("source is not JSON serializable");
  }
  return serialized;
}

export async function sha256ApplicabilityDerivationValue(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    stableApplicabilityDerivationJson(value),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function invalidResult(reasons: Iterable<string>): ApplicabilityDerivationResult {
  return ApplicabilityDerivationResultSchema.parse({
    status: "invalid_source",
    reasons: [...new Set(reasons)].sort((left, right) =>
      left.localeCompare(right)
    ),
    inferredFieldCount: 0,
  });
}

function schemaReasons(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length === 0 ? "$" : issue.path.join(".");
    return `schema_invalid:${path}:${issue.message}`;
  });
}

function sourcePathsForProposals(
  artifact: CoarseProposalRegistryArtifact,
): string[] {
  if (artifact.payload.proposals.length === 0) return ["payload.proposals"];
  return artifact.payload.proposals.flatMap((_, index) => [
    `payload.proposals[${index}].proposalRef`,
    `payload.proposals[${index}].actionKind`,
  ]);
}

function sourcePathsForAdaptive(
  artifact: AdaptiveStageReceiptArtifact,
): string[] {
  if (artifact.payload.status === "skipped") return ["payload.status"];
  const paths = ["payload.status", "payload.result.contestedClaimRefs"];
  for (const [index, receipt] of artifact.payload.result.receipts.entries()) {
    const prefix = `payload.result.receipts[${index}]`;
    paths.push(
      `${prefix}.proposalRef`,
      `${prefix}.resolution`,
      `${prefix}.outcome`,
    );
    if (receipt.failureReason !== undefined) {
      paths.push(`${prefix}.failureReason`);
    }
    if (receipt.fallbackFact !== undefined) {
      paths.push(
        `${prefix}.fallbackFact.id`,
        `${prefix}.fallbackFact.strength`,
      );
    }
  }
  return paths;
}

function sourcePathsForReads(artifact: PurposeReadSetArtifact): string[] {
  if (artifact.payload.reads.length === 0) return ["payload.reads"];
  return artifact.payload.reads.flatMap((_, index) => [
    `payload.reads[${index}].sliceRef`,
    `payload.reads[${index}].check.consistency.level`,
    `payload.reads[${index}].check.blockingIssueRefs`,
  ]);
}

function sourcePathsForIssues(
  artifact: ConsistencyIssueSnapshotArtifact,
): string[] {
  if (artifact.payload.issues.length === 0) return ["payload.issues"];
  return artifact.payload.issues.flatMap((_, index) => [
    `payload.issues[${index}].id`,
    `payload.issues[${index}].status`,
  ]);
}

function provenanceEntry(
  artifact: ApplicabilityDerivationArtifact,
  sourcePaths: string[],
) {
  return ProvenanceEntrySchema.parse({
    artifactRef: artifact.artifactRef,
    payloadSha256: artifact.payloadSha256,
    sourcePaths,
  });
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function payloadDigestReasons(
  artifacts: ApplicabilityDerivationArtifact[],
): Promise<string[]> {
  const results = await Promise.all(artifacts.map(async (artifact) => ({
    artifact,
    digest: await sha256ApplicabilityDerivationValue(artifact.payload),
  })));
  return results
    .filter(({ artifact, digest }) => digest !== artifact.payloadSha256)
    .map(({ artifact }) => `payload_digest_mismatch:${artifact.artifactRef}`);
}

function adaptiveInput(artifact: AdaptiveStageReceiptArtifact) {
  if (artifact.payload.status === "skipped") {
    return { status: "skipped" as const };
  }
  return {
    status: "executed" as const,
    contestedClaimRefs: artifact.payload.result.contestedClaimRefs,
    receipts: artifact.payload.result.receipts.map((receipt) => ({
      proposalRef: receipt.proposalRef,
      resolution: receipt.resolution,
      outcome: receipt.outcome,
      ...(receipt.failureReason === undefined
        ? {}
        : { failureReason: receipt.failureReason }),
      ...(receipt.fallbackFact === undefined
        ? {}
        : {
            fallbackFact: {
              factRef: receipt.fallbackFact.id,
              strength: receipt.fallbackFact.strength,
            },
          }),
    })),
  };
}

function buildCompleteResult(artifacts: {
  allowedFallbacks: TurnFallbackPolicyArtifact;
  proposals: CoarseProposalRegistryArtifact;
  adaptive: AdaptiveStageReceiptArtifact;
  reads: PurposeReadSetArtifact;
  issues: ConsistencyIssueSnapshotArtifact;
}): ApplicabilityDerivationResult {
  const input: ConflictHandlingApplicabilityInput = {
    allowedFallbacks: artifacts.allowedFallbacks.payload.allowedFallbacks,
    proposals: artifacts.proposals.payload.proposals,
    adaptive: adaptiveInput(artifacts.adaptive),
    reads: artifacts.reads.payload.reads.map((read) => ({
      sliceRef: read.sliceRef,
      consistencyLevel: read.check.consistency.level,
      blockingIssueRefs: read.check.blockingIssueRefs,
    })),
    issues: artifacts.issues.payload.issues.map((issue) => ({
      issueRef: issue.id,
      status: issue.status,
    })),
  };
  const parsedInput = ConflictHandlingApplicabilityInputSchema.safeParse(input);
  if (!parsedInput.success) return invalidResult(schemaReasons(parsedInput.error));
  const observationInput = ActualTurnShadowApplicabilityInputSchema.safeParse(
    parsedInput.data,
  );
  if (!observationInput.success) {
    return invalidResult(schemaReasons(observationInput.error));
  }
  const proposalRefs = new Set(
    artifacts.proposals.payload.proposals.map((proposal) =>
      proposal.proposalRef
    ),
  );
  if (artifacts.adaptive.payload.status === "executed") {
    const dangling = artifacts.adaptive.payload.result.receipts
      .map((receipt) => receipt.proposalRef)
      .filter((proposalRef) => !proposalRefs.has(proposalRef));
    if (dangling.length > 0) {
      return invalidResult(uniqueSorted(dangling).map((proposalRef) =>
        `adaptive_proposal_missing:${proposalRef}`
      ));
    }
  }
  const issueByRef = new Map(
    artifacts.issues.payload.issues.map((issue) => [issue.id, issue]),
  );
  const issueReasons: string[] = [];
  for (const read of artifacts.reads.payload.reads) {
    for (const issueRef of read.check.blockingIssueRefs) {
      const issue = issueByRef.get(issueRef);
      if (!issue) issueReasons.push(`blocking_issue_missing:${issueRef}`);
      else if (issue.status === "resolved") {
        issueReasons.push(`blocking_issue_resolved:${issueRef}`);
      }
    }
  }
  if (issueReasons.length > 0) return invalidResult(issueReasons);
  return ApplicabilityDerivationResultSchema.parse({
    status: "complete",
    applicabilityInput: parsedInput.data,
    provenance: {
      allowedFallbacks: provenanceEntry(
        artifacts.allowedFallbacks,
        ["payload.allowedFallbacks"],
      ),
      proposals: provenanceEntry(
        artifacts.proposals,
        sourcePathsForProposals(artifacts.proposals),
      ),
      adaptive: provenanceEntry(
        artifacts.adaptive,
        sourcePathsForAdaptive(artifacts.adaptive),
      ),
      reads: provenanceEntry(
        artifacts.reads,
        sourcePathsForReads(artifacts.reads),
      ),
      issues: provenanceEntry(
        artifacts.issues,
        sourcePathsForIssues(artifacts.issues),
      ),
    },
    inferredFieldCount: 0,
  });
}

export async function deriveActualTurnApplicabilityInput(
  rawBundle: unknown,
): Promise<ApplicabilityDerivationResult> {
  let sourceBefore: string;
  try {
    sourceBefore = stableApplicabilityDerivationJson(rawBundle);
  } catch {
    return invalidResult(["source_not_json_serializable"]);
  }
  const parsed = ApplicabilityDerivationSourceBundleSchema.safeParse(rawBundle);
  if (!parsed.success) return invalidResult(schemaReasons(parsed.error));
  const bundle = parsed.data;
  const digestReasons = await payloadDigestReasons(bundle.artifacts);
  let sourceAfter: string;
  try {
    sourceAfter = stableApplicabilityDerivationJson(rawBundle);
  } catch {
    return invalidResult(["source_changed_during_derivation"]);
  }
  if (sourceBefore !== sourceAfter) {
    return invalidResult(["source_changed_during_derivation"]);
  }
  if (digestReasons.length > 0) return invalidResult(digestReasons);
  const wrongTurnRefs = bundle.artifacts
    .filter((artifact) => artifact.turn !== bundle.turn)
    .map((artifact) => artifact.artifactRef);
  if (wrongTurnRefs.length > 0) {
    return invalidResult(uniqueSorted(wrongTurnRefs).map((artifactRef) =>
      `artifact_turn_mismatch:${artifactRef}`
    ));
  }
  const byField = new Map<
    ActualTurnInputDerivationField,
    ApplicabilityDerivationArtifact[]
  >(ACTUAL_TURN_INPUT_DERIVATION_FIELDS.map((field) => [field, []]));
  for (const artifact of bundle.artifacts) {
    byField.get(FIELD_FOR_KIND[artifact.kind])!.push(artifact);
  }
  const availableFields = ACTUAL_TURN_INPUT_DERIVATION_FIELDS.filter(
    (field) => byField.get(field)!.length === 1,
  );
  const missingFields = ACTUAL_TURN_INPUT_DERIVATION_FIELDS.filter(
    (field) => byField.get(field)!.length === 0,
  );
  const ambiguousFields = ACTUAL_TURN_INPUT_DERIVATION_FIELDS.filter(
    (field) => byField.get(field)!.length > 1,
  );
  if (missingFields.length > 0 || ambiguousFields.length > 0) {
    return ApplicabilityDerivationResultSchema.parse({
      status: "insufficient_source",
      availableFields,
      missingFields,
      ambiguousFields,
      forbiddenProxyKinds: bundle.observedProxyKinds,
      inferredFieldCount: 0,
    });
  }
  return buildCompleteResult({
    allowedFallbacks: byField.get("allowedFallbacks")![0] as
      TurnFallbackPolicyArtifact,
    proposals: byField.get("proposals")![0] as
      CoarseProposalRegistryArtifact,
    adaptive: byField.get("adaptive")![0] as
      AdaptiveStageReceiptArtifact,
    reads: byField.get("reads")![0] as PurposeReadSetArtifact,
    issues: byField.get("issues")![0] as
      ConsistencyIssueSnapshotArtifact,
  });
}
