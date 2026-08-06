import { z } from "zod";
import { AdaptiveActionKindSchema } from "./battle-adaptive-adjudication.js";
import {
  IntegratedShadowTurnInputSchema,
  IntegratedShadowTurnReceiptSchema,
  type IntegratedShadowTurnInput,
  type IntegratedShadowTurnReceipt,
} from "./battle-integrated-shadow-turn.js";

const RefSchema = z.string().min(1).max(240);
const AllowedFallbackSchema = z.enum([
  "defense",
  "intermediate",
  "weak",
  "unknown",
]);
const ConsistencyLevelSchema = z.enum([
  "unchecked",
  "locally_coherent",
  "conflicted",
  "repaired",
]);
const AdaptiveResolutionSchema = z.enum([
  "fast",
  "coarse",
  "expanded",
  "degraded",
]);
const AdaptiveOutcomeSchema = z.enum([
  "completed",
  "partial",
  "attempted_failed",
  "indeterminate",
  "rejected",
]);
const AdaptiveFailureReasonSchema = z.enum([
  "precondition_failed",
  "precondition_unknown",
  "abort_condition",
  "simultaneous_conflict",
  "invalid_character_plan",
  "invalid_world_expansion",
  "budget_exhausted",
  "missing_resolution",
]);
const FallbackStrengthSchema = z.enum([
  "known",
  "intermediate",
  "weak",
  "unknown",
]);

export const ConflictHandlingTriggerKindSchema = z.enum([
  "selected_fallback_proposal",
  "contested_claim",
  "conflicted_read",
  "degraded_indeterminate",
  "budget_exhausted",
]);
export type ConflictHandlingTriggerKind = z.infer<
  typeof ConflictHandlingTriggerKindSchema
>;

export const ConflictHandlingEvidenceKindSchema = z.enum([
  "selected_fallback_proposal",
  "fallback_fact",
  "conflicted_read",
  "consistency_issue",
]);
export type ConflictHandlingEvidenceKind = z.infer<
  typeof ConflictHandlingEvidenceKindSchema
>;

const ApplicabilityAdaptiveReceiptSchema = z.object({
  proposalRef: RefSchema,
  resolution: AdaptiveResolutionSchema,
  outcome: AdaptiveOutcomeSchema,
  failureReason: AdaptiveFailureReasonSchema.optional(),
  fallbackFact: z.object({
    factRef: RefSchema,
    strength: FallbackStrengthSchema,
  }).strict().optional(),
}).strict();

const ApplicabilityAdaptiveStageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("executed"),
    contestedClaimRefs: z.array(RefSchema).max(32),
    receipts: z.array(ApplicabilityAdaptiveReceiptSchema).max(16),
  }).strict(),
  z.object({
    status: z.literal("skipped"),
  }).strict(),
]);

export const ConflictHandlingApplicabilityInputSchema = z.object({
  allowedFallbacks: z.array(AllowedFallbackSchema).max(8),
  proposals: z.array(z.object({
    proposalRef: RefSchema,
    actionKind: AdaptiveActionKindSchema,
  }).strict()).max(16),
  adaptive: ApplicabilityAdaptiveStageSchema,
  reads: z.array(z.object({
    sliceRef: RefSchema,
    consistencyLevel: ConsistencyLevelSchema,
    blockingIssueRefs: z.array(RefSchema).max(64),
  }).strict()).max(32),
  issues: z.array(z.object({
    issueRef: RefSchema,
    status: z.enum(["open", "deferred", "resolved"]),
  }).strict()).max(128),
}).strict().superRefine((input, ctx) => {
  const uniqueFields: Array<[string, string[]]> = [
    ["allowedFallbacks", input.allowedFallbacks],
    ["proposals", input.proposals.map((proposal) => proposal.proposalRef)],
    ["reads", input.reads.map((read) => read.sliceRef)],
    ["issues", input.issues.map((issue) => issue.issueRef)],
  ];
  if (input.adaptive.status === "executed") {
    uniqueFields.push([
      "adaptive.receipts",
      input.adaptive.receipts.map((receipt) => receipt.proposalRef),
    ]);
  }
  for (const [path, values] of uniqueFields) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: path.split("."),
        message: `${path} references must be unique`,
      });
    }
  }
});
export type ConflictHandlingApplicabilityInput = z.infer<
  typeof ConflictHandlingApplicabilityInputSchema
>;

function isSortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length && values.every(
    (value, index) => index === 0 || values[index - 1]!.localeCompare(value) < 0,
  );
}

export const ConflictHandlingV2Schema = z.object({
  schemaVersion: z.literal(2),
  capability: z.object({
    allowedFallbacks: z.array(AllowedFallbackSchema).max(8),
    availability: z.enum(["unavailable", "available"]),
    disposition: z.enum([
      "unavailable",
      "not_needed",
      "used",
      "available_unhandled",
    ]),
  }).strict(),
  applicability: z.object({
    status: z.enum(["not_applicable", "required"]),
    triggerKinds: z.array(ConflictHandlingTriggerKindSchema)
      .max(ConflictHandlingTriggerKindSchema.options.length),
    triggerRefs: z.array(RefSchema).max(256),
  }).strict(),
  handling: z.object({
    status: z.enum(["not_applicable", "handled", "missing"]),
    evidenceKinds: z.array(ConflictHandlingEvidenceKindSchema)
      .max(ConflictHandlingEvidenceKindSchema.options.length),
    evidenceRefs: z.array(RefSchema).max(256),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const sortedFields: Array<[string[], readonly string[]]> = [
    [["capability", "allowedFallbacks"], value.capability.allowedFallbacks],
    [["applicability", "triggerKinds"], value.applicability.triggerKinds],
    [["applicability", "triggerRefs"], value.applicability.triggerRefs],
    [["handling", "evidenceKinds"], value.handling.evidenceKinds],
    [["handling", "evidenceRefs"], value.handling.evidenceRefs],
  ];
  for (const [path, values] of sortedFields) {
    if (!isSortedUnique(values)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: "receipt arrays must be sorted and unique",
      });
    }
  }

  const available = value.capability.allowedFallbacks.length > 0;
  if (
    value.capability.availability !== (available ? "available" : "unavailable")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capability", "availability"],
      message: "capability availability must match allowed fallbacks",
    });
  }
  const applicable = value.applicability.triggerKinds.length > 0;
  if (
    value.applicability.status !== (applicable ? "required" : "not_applicable")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applicability", "status"],
      message: "applicability status must match observed triggers",
    });
  }
  if (
    value.applicability.status === "not_applicable" &&
    value.handling.status !== "not_applicable"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["handling", "status"],
      message: "handling must remain not applicable without a trigger",
    });
  }
  if (
    value.applicability.status === "required" &&
    value.handling.status === "not_applicable"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["handling", "status"],
      message: "required handling must be handled or missing",
    });
  }
  if (
    value.handling.status === "handled" &&
    value.handling.evidenceKinds.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["handling", "evidenceKinds"],
      message: "handled status requires evidence",
    });
  }
  if (!available && value.capability.disposition !== "unavailable") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capability", "disposition"],
      message: "an unavailable capability must have unavailable disposition",
    });
  }
  if (
    available && !applicable && value.capability.disposition !== "not_needed"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capability", "disposition"],
      message: "an unused non-applicable capability must be not needed",
    });
  }
  if (
    available && applicable &&
    !["used", "available_unhandled"].includes(value.capability.disposition)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capability", "disposition"],
      message: "an applicable capability must be used or available unhandled",
    });
  }
});
export type ConflictHandlingV2 = z.infer<typeof ConflictHandlingV2Schema>;

export const IntegratedShadowTurnReceiptV2Schema =
  IntegratedShadowTurnReceiptSchema.extend({
    conflictHandlingV2: ConflictHandlingV2Schema,
  }).strict();
export type IntegratedShadowTurnReceiptV2 = z.infer<
  typeof IntegratedShadowTurnReceiptV2Schema
>;

export const ConflictHandlingReferenceAuditSchema = z.object({
  checkedRefCount: z.number().int().nonnegative(),
  danglingRefs: z.array(RefSchema),
}).strict();
export type ConflictHandlingReferenceAudit = z.infer<
  typeof ConflictHandlingReferenceAuditSchema
>;

function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function classifyConflictHandlingApplicability(
  rawInput: ConflictHandlingApplicabilityInput,
): ConflictHandlingV2 {
  const input = ConflictHandlingApplicabilityInputSchema.parse(rawInput);
  const allowedFallbacks = uniqueSorted(input.allowedFallbacks);
  const allowed = new Set<string>(allowedFallbacks);
  const proposalKinds = new Map(input.proposals.map((proposal) => [
    proposal.proposalRef,
    proposal.actionKind,
  ] as const));
  const adaptiveReceipts = input.adaptive.status === "executed"
    ? input.adaptive.receipts
    : [];

  const selectedFallbackProposalRefs = adaptiveReceipts
    .filter((receipt) =>
      allowed.has(proposalKinds.get(receipt.proposalRef) ?? "")
    )
    .map((receipt) => receipt.proposalRef);
  const contestedClaimRefs = input.adaptive.status === "executed"
    ? input.adaptive.contestedClaimRefs
    : [];
  const conflictedReads = input.reads.filter((read) =>
    read.consistencyLevel === "conflicted"
  );
  const degradedReceipts = adaptiveReceipts.filter((receipt) =>
    receipt.resolution === "degraded" && receipt.outcome === "indeterminate"
  );
  const budgetExhaustedReceipts = adaptiveReceipts.filter((receipt) =>
    receipt.failureReason === "budget_exhausted"
  );

  const triggerKinds = new Set<ConflictHandlingTriggerKind>();
  const triggerRefs = new Set<string>();
  if (selectedFallbackProposalRefs.length > 0) {
    triggerKinds.add("selected_fallback_proposal");
    selectedFallbackProposalRefs.forEach((ref) => triggerRefs.add(ref));
  }
  if (contestedClaimRefs.length > 0) {
    triggerKinds.add("contested_claim");
    contestedClaimRefs.forEach((ref) => triggerRefs.add(ref));
  }
  if (conflictedReads.length > 0) {
    triggerKinds.add("conflicted_read");
    conflictedReads.forEach((read) => triggerRefs.add(read.sliceRef));
  }
  if (degradedReceipts.length > 0) {
    triggerKinds.add("degraded_indeterminate");
    degradedReceipts.forEach((receipt) => triggerRefs.add(receipt.proposalRef));
  }
  if (budgetExhaustedReceipts.length > 0) {
    triggerKinds.add("budget_exhausted");
    budgetExhaustedReceipts.forEach((receipt) =>
      triggerRefs.add(receipt.proposalRef)
    );
  }

  const evidenceKinds = new Set<ConflictHandlingEvidenceKind>();
  const evidenceRefs = new Set<string>();
  if (selectedFallbackProposalRefs.length > 0) {
    evidenceKinds.add("selected_fallback_proposal");
    selectedFallbackProposalRefs.forEach((ref) => evidenceRefs.add(ref));
  }
  const fallbackReceipts = adaptiveReceipts.filter((receipt) =>
    receipt.fallbackFact !== undefined
  );
  if (fallbackReceipts.length > 0) {
    evidenceKinds.add("fallback_fact");
    fallbackReceipts.forEach((receipt) =>
      evidenceRefs.add(receipt.fallbackFact!.factRef)
    );
  }
  if (conflictedReads.length > 0) {
    evidenceKinds.add("conflicted_read");
    conflictedReads.forEach((read) => evidenceRefs.add(read.sliceRef));
  }
  const unresolvedIssueRefs = new Set(input.issues
    .filter((issue) => issue.status !== "resolved")
    .map((issue) => issue.issueRef));
  const linkedIssueRefs = uniqueSorted(conflictedReads.flatMap((read) =>
    read.blockingIssueRefs.filter((issueRef) => unresolvedIssueRefs.has(issueRef))
  ));
  if (linkedIssueRefs.length > 0) {
    evidenceKinds.add("consistency_issue");
    linkedIssueRefs.forEach((ref) => evidenceRefs.add(ref));
  }

  const conflictEvidencePresent = fallbackReceipts.length > 0 ||
    conflictedReads.length > 0 || linkedIssueRefs.length > 0;
  const degradedHandled = degradedReceipts.every((receipt) =>
    receipt.fallbackFact !== undefined ||
    conflictedReads.length > 0 || linkedIssueRefs.length > 0
  );
  const budgetHandled = budgetExhaustedReceipts.every((receipt) =>
    receipt.fallbackFact !== undefined
  );
  const allTriggersHandled =
    (contestedClaimRefs.length === 0 || conflictEvidencePresent) &&
    degradedHandled && budgetHandled;

  const applicable = triggerKinds.size > 0;
  const fallbackCapabilityUsed = selectedFallbackProposalRefs.length > 0 ||
    fallbackReceipts.some((receipt) =>
      allowed.has(receipt.fallbackFact!.strength)
    );
  const disposition = allowedFallbacks.length === 0
    ? "unavailable" as const
    : !applicable
      ? "not_needed" as const
      : fallbackCapabilityUsed
        ? "used" as const
        : "available_unhandled" as const;

  return ConflictHandlingV2Schema.parse({
    schemaVersion: 2,
    capability: {
      allowedFallbacks,
      availability: allowedFallbacks.length > 0 ? "available" : "unavailable",
      disposition,
    },
    applicability: {
      status: applicable ? "required" : "not_applicable",
      triggerKinds: uniqueSorted(triggerKinds),
      triggerRefs: uniqueSorted(triggerRefs),
    },
    handling: {
      status: !applicable
        ? "not_applicable"
        : allTriggersHandled ? "handled" : "missing",
      evidenceKinds: uniqueSorted(evidenceKinds),
      evidenceRefs: uniqueSorted(evidenceRefs),
    },
  });
}

function toApplicabilityInput(input: {
  turnInput: IntegratedShadowTurnInput;
  receipt: IntegratedShadowTurnReceipt;
}): ConflictHandlingApplicabilityInput {
  const adaptive = input.receipt.adaptive.status === "executed"
    ? {
        status: "executed" as const,
        contestedClaimRefs: input.receipt.adaptive.result.contestedClaimRefs,
        receipts: input.receipt.adaptive.result.receipts.map((receipt) => ({
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
      }
    : { status: "skipped" as const };
  return ConflictHandlingApplicabilityInputSchema.parse({
    allowedFallbacks: input.turnInput.expectedBoundaries.allowedFallbacks,
    proposals: input.turnInput.characterInputs.cases.map((proposalCase) => ({
      proposalRef: proposalCase.proposal.proposalRef,
      actionKind: proposalCase.proposal.actionKind,
    })),
    adaptive,
    reads: input.receipt.reads.map((read) => ({
      sliceRef: read.sliceRef,
      consistencyLevel: read.check.consistency.level,
      blockingIssueRefs: read.check.blockingIssueRefs,
    })),
    issues: input.receipt.issues.map((issue) => ({
      issueRef: issue.id,
      status: issue.status,
    })),
  });
}

export function buildIntegratedShadowTurnReceiptV2(input: {
  turnInput: IntegratedShadowTurnInput;
  receipt: IntegratedShadowTurnReceipt;
}): IntegratedShadowTurnReceiptV2 {
  const turnInput = IntegratedShadowTurnInputSchema.parse(input.turnInput);
  const receipt = IntegratedShadowTurnReceiptSchema.parse(input.receipt);
  if (
    turnInput.transcriptRef !== receipt.transcriptRef ||
    turnInput.sourceBattleStateDigest !== receipt.sourceBattleStateDigest ||
    turnInput.authoritativeOutcomeDigest !== receipt.authoritativeOutcomeDigest
  ) {
    throw new Error("integrated input and receipt identities do not match");
  }
  const inputProposalRefs = new Set(turnInput.characterInputs.cases.map(
    (proposalCase) => proposalCase.proposal.proposalRef,
  ));
  if (
    receipt.adaptive.status === "executed" &&
    receipt.adaptive.result.receipts.some((adaptiveReceipt) =>
      !inputProposalRefs.has(adaptiveReceipt.proposalRef)
    )
  ) {
    throw new Error("adaptive receipt references an unknown proposal");
  }
  const conflictHandlingV2 = classifyConflictHandlingApplicability(
    toApplicabilityInput({ turnInput, receipt }),
  );
  return IntegratedShadowTurnReceiptV2Schema.parse({
    ...receipt,
    conflictHandlingV2,
  });
}

export function projectLegacyIntegratedShadowTurnReceipt(
  rawReceipt: IntegratedShadowTurnReceiptV2,
): IntegratedShadowTurnReceipt {
  const receipt = IntegratedShadowTurnReceiptV2Schema.parse(rawReceipt);
  const { conflictHandlingV2: _conflictHandlingV2, ...legacyReceipt } = receipt;
  return IntegratedShadowTurnReceiptSchema.parse(legacyReceipt);
}

export function auditConflictHandlingV2References(input: {
  turnInput: IntegratedShadowTurnInput;
  receipt: IntegratedShadowTurnReceiptV2;
}): ConflictHandlingReferenceAudit {
  const turnInput = IntegratedShadowTurnInputSchema.parse(input.turnInput);
  const receipt = IntegratedShadowTurnReceiptV2Schema.parse(input.receipt);
  const knownRefs = new Set<string>();

  for (const proposalCase of turnInput.characterInputs.cases) {
    knownRefs.add(proposalCase.proposal.proposalRef);
  }
  if (receipt.adaptive.status === "executed") {
    for (const contestedClaimRef of receipt.adaptive.result.contestedClaimRefs) {
      knownRefs.add(contestedClaimRef);
    }
    for (const adaptiveReceipt of receipt.adaptive.result.receipts) {
      knownRefs.add(adaptiveReceipt.proposalRef);
      if (adaptiveReceipt.fallbackFact) {
        knownRefs.add(adaptiveReceipt.fallbackFact.id);
      }
    }
  }
  for (const read of receipt.reads) {
    knownRefs.add(read.sliceRef);
    read.check.blockingIssueRefs.forEach((ref) => knownRefs.add(ref));
  }
  receipt.issues.forEach((issue) => knownRefs.add(issue.id));

  const referenced = [
    ...receipt.conflictHandlingV2.applicability.triggerRefs,
    ...receipt.conflictHandlingV2.handling.evidenceRefs,
  ];
  return ConflictHandlingReferenceAuditSchema.parse({
    checkedRefCount: referenced.length,
    danglingRefs: uniqueSorted(referenced.filter((ref) => !knownRefs.has(ref))),
  });
}
