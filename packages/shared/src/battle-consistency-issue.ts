import { z } from "zod";
import {
  PatchAuditIssueCodeSchema,
  ShadowPatchAuditIssueSchema,
  ShadowPatchAuditResultSchema,
  type PatchAuditIssueCode,
  type ShadowPatchAuditIssue,
  type ShadowPatchAuditResult,
} from "./battle-canonical-patch.js";
import {
  ConsistencyIssueViewSchema,
  ProjectionPurposeSchema,
  type ConsistencyIssueView,
  type ProjectionPurpose,
} from "./battle-projection.js";

export const CONSISTENCY_ISSUE_POC_LIMITS = {
  maxIssues: 256,
  maxLifecycleEvents: 1024,
  maxIssueRefs: 64,
  maxOriginsPerIssue: 64,
  maxEnvelopeBytes: 512 * 1024,
} as const;

const CanonicalRefSchema = z.string().min(1).max(200);
const FactRefSchema = z.string().min(1).max(240);
const IssueRefSchema = z.string().min(1).max(160);
const SourceRefSchema = z.string().min(1).max(240);

export const ConsistencyDiscoveryStageSchema = z.enum([
  "patch_audit",
  "planning",
  "adjudication",
  "world_process",
  "perception",
  "narration",
]);
export type ConsistencyDiscoveryStage = z.infer<
  typeof ConsistencyDiscoveryStageSchema
>;

const AlertDiscoveryStageSchema = z.enum([
  "planning",
  "adjudication",
  "world_process",
  "perception",
  "narration",
]);

export const ConsistencyAlertReporterSchema = z.enum([
  "character_agent",
  "adjudicator",
  "world_evaluator",
  "narrator",
]);
export type ConsistencyAlertReporter = z.infer<
  typeof ConsistencyAlertReporterSchema
>;

export const ConsistencyAlertSchema = z.object({
  schemaVersion: z.literal(1),
  alertRef: SourceRefSchema,
  reporter: ConsistencyAlertReporterSchema,
  turn: z.number().int().nonnegative(),
  involvedRefs: z.array(CanonicalRefSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssueRefs),
  conflictingClaims: z.array(FactRefSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssueRefs),
  blocking: z.boolean(),
  explanation: z.string().min(1).max(1000),
}).strict().superRefine((alert, ctx) => {
  if (alert.involvedRefs.length === 0 && alert.conflictingClaims.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["involvedRefs"],
      message: "an alert must identify at least one entity or fact",
    });
  }
  if (new Set(alert.involvedRefs).size !== alert.involvedRefs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["involvedRefs"],
      message: "alert entity references must be unique",
    });
  }
  if (
    new Set(alert.conflictingClaims).size !== alert.conflictingClaims.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conflictingClaims"],
      message: "alert conflicting fact references must be unique",
    });
  }
});
export type ConsistencyAlert = z.infer<typeof ConsistencyAlertSchema>;

export const ConsistencyIssueKindSchema = z.union([
  PatchAuditIssueCodeSchema,
  z.literal("reported_conflict"),
]);
export type ConsistencyIssueKind = z.infer<
  typeof ConsistencyIssueKindSchema
>;

const ConsistencyIssueOriginKindSchema = z.enum([
  "patch_audit",
  "llm_alert",
]);

const ConsistencyIssueResolutionSchema = z.object({
  resolutionRef: SourceRefSchema,
  resolvedAtTurn: z.number().int().nonnegative(),
  summary: z.string().min(1).max(1000),
}).strict();

export const ConsistencyIssueSchema = z.object({
  id: IssueRefSchema,
  fingerprint: z.string().regex(/^issue-fingerprint:[0-9a-f]{8}$/u),
  kind: ConsistencyIssueKindSchema,
  involvedFactRefs: z.array(FactRefSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssueRefs),
  involvedEntityRefs: z.array(CanonicalRefSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssueRefs),
  discoveredAt: z.object({
    stage: ConsistencyDiscoveryStageSchema,
    turn: z.number().int().nonnegative(),
  }).strict(),
  blocksPurposes: z.array(ProjectionPurposeSchema)
    .max(ProjectionPurposeSchema.options.length),
  status: z.enum(["open", "deferred", "resolved"]),
  sourceRefs: z.array(SourceRefSchema)
    .min(1)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxOriginsPerIssue),
  sourceKinds: z.array(ConsistencyIssueOriginKindSchema)
    .min(1)
    .max(ConsistencyIssueOriginKindSchema.options.length),
  reporters: z.array(ConsistencyAlertReporterSchema)
    .max(ConsistencyAlertReporterSchema.options.length),
  reporterClaimsBlocking: z.boolean(),
  occurrenceCount: z.number().int().min(1).max(10_000),
  lastObservedTurn: z.number().int().nonnegative(),
  resolution: ConsistencyIssueResolutionSchema.optional(),
}).strict().superRefine((issue, ctx) => {
  for (const [path, values] of [
    ["involvedFactRefs", issue.involvedFactRefs],
    ["involvedEntityRefs", issue.involvedEntityRefs],
    ["blocksPurposes", issue.blocksPurposes],
    ["sourceRefs", issue.sourceRefs],
    ["sourceKinds", issue.sourceKinds],
    ["reporters", issue.reporters],
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: `${path} must contain unique values`,
      });
    }
  }
  if ((issue.status === "resolved") !== Boolean(issue.resolution)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolution"],
      message: "resolved status and resolution metadata must appear together",
    });
  }
  if (issue.lastObservedTurn < issue.discoveredAt.turn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastObservedTurn"],
      message: "last observation cannot precede discovery",
    });
  }
});
export type ConsistencyIssue = z.infer<typeof ConsistencyIssueSchema>;

export const ConsistencyIssueLifecycleEventSchema = z.object({
  id: z.string().regex(/^issue-event\.[0-9]{6}$/u),
  issueRef: IssueRefSchema,
  kind: z.enum(["registered", "deduplicated", "deferred", "resolved"]),
  turn: z.number().int().nonnegative(),
  sourceRef: SourceRefSchema,
  note: z.string().min(1).max(1000),
}).strict();
export type ConsistencyIssueLifecycleEvent = z.infer<
  typeof ConsistencyIssueLifecycleEventSchema
>;

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export const ConsistencyIssuePocEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow_issue_registry"),
  revision: z.number().int().nonnegative(),
  nextIssueSequence: z.number().int().positive(),
  issues: z.array(ConsistencyIssueSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssues),
  lifecycleEvents: z.array(ConsistencyIssueLifecycleEventSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxLifecycleEvents),
}).strict().superRefine((envelope, ctx) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(envelope.issues.map((issue) => issue.id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["issues"],
      message: "issue IDs must be unique",
    });
  }
  if (!unique(envelope.lifecycleEvents.map((event) => event.id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lifecycleEvents"],
      message: "lifecycle event IDs must be unique",
    });
  }
  const issueRefs = new Set(envelope.issues.map((issue) => issue.id));
  if (envelope.lifecycleEvents.some((event) => !issueRefs.has(event.issueRef))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lifecycleEvents"],
      message: "lifecycle event references an unknown issue",
    });
  }
  if (serializedBytes(envelope) > CONSISTENCY_ISSUE_POC_LIMITS.maxEnvelopeBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "issue PoC envelope exceeds its byte limit",
    });
  }
});
export type ConsistencyIssuePocEnvelope = z.infer<
  typeof ConsistencyIssuePocEnvelopeSchema
>;

const IssueMutationOutcomeSchema = z.enum([
  "registered",
  "deduplicated",
  "deferred",
  "resolved",
  "unchanged",
  "rejected",
]);

export const ConsistencyIssueMutationReceiptSchema = z.object({
  outcome: IssueMutationOutcomeSchema,
  issueRef: IssueRefSchema.optional(),
  reason: z.string().min(1).max(1000),
  envelope: ConsistencyIssuePocEnvelopeSchema,
}).strict();
export type ConsistencyIssueMutationReceipt = z.infer<
  typeof ConsistencyIssueMutationReceiptSchema
>;

export const PatchAuditRegistrationReceiptSchema = z.object({
  outcome: z.enum([
    "registered",
    "deduplicated",
    "mixed",
    "no_issue_found",
    "indeterminate",
    "rejected",
  ]),
  issueRefs: z.array(IssueRefSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssueRefs),
  checkedFactRefs: z.array(FactRefSchema).max(512),
  checkedEntityRefs: z.array(CanonicalRefSchema).max(128),
  registrationOutcomes: z.array(IssueMutationOutcomeSchema)
    .max(CONSISTENCY_ISSUE_POC_LIMITS.maxIssueRefs),
  reason: z.string().min(1).max(1000),
  envelope: ConsistencyIssuePocEnvelopeSchema,
}).strict();
export type PatchAuditRegistrationReceipt = z.infer<
  typeof PatchAuditRegistrationReceiptSchema
>;

type IssueCandidate = {
  kind: ConsistencyIssueKind;
  involvedFactRefs: string[];
  involvedEntityRefs: string[];
  discoveredAt: {
    stage: ConsistencyDiscoveryStage;
    turn: number;
  };
  blocksPurposes: ProjectionPurpose[];
  sourceRef: string;
  sourceKind: "patch_audit" | "llm_alert";
  reporter?: ConsistencyAlertReporter;
  reporterClaimsBlocking: boolean;
  note: string;
};

function cloneEnvelope(
  envelope: ConsistencyIssuePocEnvelope,
): ConsistencyIssuePocEnvelope {
  return ConsistencyIssuePocEnvelopeSchema.parse(structuredClone(envelope));
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function candidateFingerprint(candidate: {
  kind: ConsistencyIssueKind;
  involvedFactRefs: string[];
  involvedEntityRefs: string[];
  sourceRef: string;
}): string {
  return `issue-fingerprint:${fnv1a(JSON.stringify([
    candidate.kind,
    candidate.involvedFactRefs,
    candidate.involvedEntityRefs,
    candidate.involvedFactRefs.length === 0 &&
        candidate.involvedEntityRefs.length === 0
      ? candidate.sourceRef
      : null,
  ]))}`;
}

function eventFor(input: {
  envelope: ConsistencyIssuePocEnvelope;
  issueRef: string;
  kind: ConsistencyIssueLifecycleEvent["kind"];
  turn: number;
  sourceRef: string;
  note: string;
}): ConsistencyIssueLifecycleEvent {
  return ConsistencyIssueLifecycleEventSchema.parse({
    id: `issue-event.${String(input.envelope.revision + 1).padStart(6, "0")}`,
    issueRef: input.issueRef,
    kind: input.kind,
    turn: input.turn,
    sourceRef: input.sourceRef,
    note: input.note,
  });
}

function receipt(input: {
  outcome: z.infer<typeof IssueMutationOutcomeSchema>;
  envelope: ConsistencyIssuePocEnvelope;
  reason: string;
  issueRef?: string;
}): ConsistencyIssueMutationReceipt {
  return ConsistencyIssueMutationReceiptSchema.parse({
    outcome: input.outcome,
    envelope: input.envelope,
    reason: input.reason,
    ...(input.issueRef ? { issueRef: input.issueRef } : {}),
  });
}

function rejected(
  envelope: ConsistencyIssuePocEnvelope,
  reason: string,
  issueRef?: string,
): ConsistencyIssueMutationReceipt {
  return receipt({
    outcome: "rejected",
    envelope: cloneEnvelope(envelope),
    reason,
    ...(issueRef ? { issueRef } : {}),
  });
}

function commitDraft(input: {
  original: ConsistencyIssuePocEnvelope;
  draft: ConsistencyIssuePocEnvelope;
  outcome: z.infer<typeof IssueMutationOutcomeSchema>;
  reason: string;
  issueRef: string;
}): ConsistencyIssueMutationReceipt {
  const parsed = ConsistencyIssuePocEnvelopeSchema.safeParse(input.draft);
  if (!parsed.success) {
    return rejected(
      input.original,
      parsed.error.issues[0]?.message ?? "issue envelope rejected the mutation",
      input.issueRef,
    );
  }
  return receipt({
    outcome: input.outcome,
    envelope: parsed.data,
    reason: input.reason,
    issueRef: input.issueRef,
  });
}

function registerCandidate(
  envelopeInput: ConsistencyIssuePocEnvelope,
  candidateInput: IssueCandidate,
): ConsistencyIssueMutationReceipt {
  const original = cloneEnvelope(envelopeInput);
  const candidate: IssueCandidate = {
    ...candidateInput,
    involvedFactRefs: uniqueSorted(candidateInput.involvedFactRefs),
    involvedEntityRefs: uniqueSorted(candidateInput.involvedEntityRefs),
    blocksPurposes: uniqueSorted(candidateInput.blocksPurposes) as ProjectionPurpose[],
  };
  const fingerprint = candidateFingerprint(candidate);
  const duplicate = original.issues.find((issue) =>
    issue.status !== "resolved" &&
    issue.fingerprint === fingerprint &&
    issue.kind === candidate.kind &&
    sameStrings(issue.involvedFactRefs, candidate.involvedFactRefs) &&
    sameStrings(issue.involvedEntityRefs, candidate.involvedEntityRefs)
  );
  if (duplicate) {
    if (duplicate.sourceRefs.includes(candidate.sourceRef)) {
      return receipt({
        outcome: "unchanged",
        envelope: original,
        reason: "the same source was already registered for this unresolved issue",
        issueRef: duplicate.id,
      });
    }
    if (
      original.lifecycleEvents.length >=
        CONSISTENCY_ISSUE_POC_LIMITS.maxLifecycleEvents ||
      duplicate.sourceRefs.length >=
        CONSISTENCY_ISSUE_POC_LIMITS.maxOriginsPerIssue ||
      duplicate.occurrenceCount >= 10_000
    ) {
      return rejected(original, "issue deduplication would exceed a PoC limit", duplicate.id);
    }
    const draft = cloneEnvelope(original);
    const issue = draft.issues.find((item) => item.id === duplicate.id)!;
    issue.sourceRefs = uniqueSorted([...issue.sourceRefs, candidate.sourceRef]);
    issue.sourceKinds = uniqueSorted([
      ...issue.sourceKinds,
      candidate.sourceKind,
    ]) as ConsistencyIssue["sourceKinds"];
    issue.reporters = uniqueSorted([
      ...issue.reporters,
      ...(candidate.reporter ? [candidate.reporter] : []),
    ]) as ConsistencyIssue["reporters"];
    issue.blocksPurposes = uniqueSorted([
      ...issue.blocksPurposes,
      ...candidate.blocksPurposes,
    ]) as ProjectionPurpose[];
    issue.reporterClaimsBlocking ||= candidate.reporterClaimsBlocking;
    issue.occurrenceCount += 1;
    issue.lastObservedTurn = Math.max(
      issue.lastObservedTurn,
      candidate.discoveredAt.turn,
    );
    draft.lifecycleEvents.push(eventFor({
      envelope: draft,
      issueRef: issue.id,
      kind: "deduplicated",
      turn: candidate.discoveredAt.turn,
      sourceRef: candidate.sourceRef,
      note: candidate.note,
    }));
    draft.revision += 1;
    return commitDraft({
      original,
      draft,
      outcome: "deduplicated",
      reason: "the candidate was merged into the matching unresolved issue",
      issueRef: issue.id,
    });
  }

  if (
    original.issues.length >= CONSISTENCY_ISSUE_POC_LIMITS.maxIssues ||
    original.lifecycleEvents.length >=
      CONSISTENCY_ISSUE_POC_LIMITS.maxLifecycleEvents
  ) {
    return rejected(original, "issue registration would exceed a PoC limit");
  }
  const draft = cloneEnvelope(original);
  const issueRef = `issue.${String(draft.nextIssueSequence).padStart(6, "0")}`;
  const issue = ConsistencyIssueSchema.parse({
    id: issueRef,
    fingerprint,
    kind: candidate.kind,
    involvedFactRefs: candidate.involvedFactRefs,
    involvedEntityRefs: candidate.involvedEntityRefs,
    discoveredAt: candidate.discoveredAt,
    blocksPurposes: candidate.blocksPurposes,
    status: "open",
    sourceRefs: [candidate.sourceRef],
    sourceKinds: [candidate.sourceKind],
    reporters: candidate.reporter ? [candidate.reporter] : [],
    reporterClaimsBlocking: candidate.reporterClaimsBlocking,
    occurrenceCount: 1,
    lastObservedTurn: candidate.discoveredAt.turn,
  });
  draft.issues.push(issue);
  draft.lifecycleEvents.push(eventFor({
    envelope: draft,
    issueRef,
    kind: "registered",
    turn: candidate.discoveredAt.turn,
    sourceRef: candidate.sourceRef,
    note: candidate.note,
  }));
  draft.nextIssueSequence += 1;
  draft.revision += 1;
  return commitDraft({
    original,
    draft,
    outcome: "registered",
    reason: "a new unresolved issue was registered in the shadow envelope",
    issueRef,
  });
}

export function createConsistencyIssuePocEnvelope(): ConsistencyIssuePocEnvelope {
  return ConsistencyIssuePocEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "shadow_issue_registry",
    revision: 0,
    nextIssueSequence: 1,
    issues: [],
    lifecycleEvents: [],
  });
}

export function registerConsistencyAlert(input: {
  envelope: ConsistencyIssuePocEnvelope;
  alert: ConsistencyAlert;
  discoveredAtStage: Exclude<ConsistencyDiscoveryStage, "patch_audit">;
  classifiedBlocksPurposes: readonly ProjectionPurpose[];
}): ConsistencyIssueMutationReceipt {
  const alert = ConsistencyAlertSchema.parse(input.alert);
  const blocksPurposes = z.array(ProjectionPurposeSchema)
    .max(ProjectionPurposeSchema.options.length)
    .parse(input.classifiedBlocksPurposes);
  const discoveredAtStage = AlertDiscoveryStageSchema.parse(
    input.discoveredAtStage,
  );
  return registerCandidate(input.envelope, {
    kind: "reported_conflict",
    involvedFactRefs: alert.conflictingClaims,
    involvedEntityRefs: alert.involvedRefs,
    discoveredAt: {
      stage: discoveredAtStage,
      turn: alert.turn,
    },
    blocksPurposes,
    sourceRef: alert.alertRef,
    sourceKind: "llm_alert",
    reporter: alert.reporter,
    reporterClaimsBlocking: alert.blocking,
    note: alert.explanation,
  });
}

function auditReceipt(input: {
  outcome: PatchAuditRegistrationReceipt["outcome"];
  result: ShadowPatchAuditResult;
  envelope: ConsistencyIssuePocEnvelope;
  reason: string;
  issueRefs?: string[];
  registrationOutcomes?: Array<z.infer<typeof IssueMutationOutcomeSchema>>;
}): PatchAuditRegistrationReceipt {
  return PatchAuditRegistrationReceiptSchema.parse({
    outcome: input.outcome,
    issueRefs: uniqueSorted(input.issueRefs ?? []),
    checkedFactRefs: uniqueSorted(input.result.checkedScope.factRefs),
    checkedEntityRefs: uniqueSorted(input.result.checkedScope.entityRefs),
    registrationOutcomes: input.registrationOutcomes ?? [],
    reason: input.reason,
    envelope: input.envelope,
  });
}

export function registerPatchAuditResult(input: {
  envelope: ConsistencyIssuePocEnvelope;
  auditRef: string;
  turn: number;
  result: ShadowPatchAuditResult;
  classifyIssue: (
    issue: ShadowPatchAuditIssue,
  ) => readonly ProjectionPurpose[];
}): PatchAuditRegistrationReceipt {
  const original = cloneEnvelope(input.envelope);
  const result = ShadowPatchAuditResultSchema.parse(input.result);
  const auditRef = SourceRefSchema.parse(input.auditRef);
  const turn = z.number().int().nonnegative().parse(input.turn);
  if (result.verdict === "no_issue_found") {
    return auditReceipt({
      outcome: "no_issue_found",
      result,
      envelope: original,
      reason: "no issue was found in the explicitly checked audit scope",
    });
  }
  if (result.verdict === "indeterminate") {
    return auditReceipt({
      outcome: "indeterminate",
      result,
      envelope: original,
      reason: "the audit was indeterminate and was not promoted to a conflict issue",
    });
  }
  if (result.issues.length === 0) {
    return auditReceipt({
      outcome: "rejected",
      result,
      envelope: original,
      reason: "issue_found audit result did not contain an issue",
    });
  }
  let current = original;
  const issueRefs: string[] = [];
  const outcomes: Array<z.infer<typeof IssueMutationOutcomeSchema>> = [];
  const registerableIssues = result.issues.filter((issue) =>
    issue.code !== "incomplete_context"
  );
  if (registerableIssues.length === 0) {
    return auditReceipt({
      outcome: "indeterminate",
      result,
      envelope: original,
      reason: "the audit contained only incomplete-context uncertainty",
    });
  }
  for (const rawIssue of registerableIssues) {
    const issue = ShadowPatchAuditIssueSchema.parse(rawIssue);
    const blocksPurposes = z.array(ProjectionPurposeSchema)
      .max(ProjectionPurposeSchema.options.length)
      .parse(input.classifyIssue(issue));
    const registered = registerCandidate(current, {
      kind: issue.code,
      involvedFactRefs: issue.factRefs,
      involvedEntityRefs: issue.entityRefs,
      discoveredAt: { stage: "patch_audit", turn },
      blocksPurposes,
      sourceRef: auditRef,
      sourceKind: "patch_audit",
      reporterClaimsBlocking: false,
      note: issue.explanation,
    });
    if (registered.outcome === "rejected") {
      return auditReceipt({
        outcome: "rejected",
        result,
        envelope: original,
        reason: `audit registration was rolled back: ${registered.reason}`,
      });
    }
    current = registered.envelope;
    outcomes.push(registered.outcome);
    if (registered.issueRef) issueRefs.push(registered.issueRef);
  }
  const changed = new Set(outcomes);
  const outcome = changed.size === 1 && changed.has("registered")
    ? "registered"
    : changed.size === 1 &&
        (changed.has("deduplicated") || changed.has("unchanged"))
      ? "deduplicated"
      : "mixed";
  return auditReceipt({
    outcome,
    result,
    envelope: current,
    reason: "audit issues were registered in the shadow issue envelope",
    issueRefs,
    registrationOutcomes: outcomes,
  });
}

export function deferConsistencyIssue(input: {
  envelope: ConsistencyIssuePocEnvelope;
  issueRef: string;
  decisionRef: string;
  turn: number;
  reason: string;
}): ConsistencyIssueMutationReceipt {
  const original = cloneEnvelope(input.envelope);
  const issueRef = IssueRefSchema.parse(input.issueRef);
  const issue = original.issues.find((item) => item.id === issueRef);
  if (!issue) return rejected(original, "cannot defer an unknown issue", issueRef);
  const turn = z.number().int().nonnegative().parse(input.turn);
  if (turn < issue.discoveredAt.turn) {
    return rejected(original, "issue deferral cannot precede discovery", issueRef);
  }
  if (issue.status === "resolved") {
    return rejected(original, "cannot defer a resolved issue", issueRef);
  }
  if (issue.status === "deferred") {
    return receipt({
      outcome: "unchanged",
      envelope: original,
      reason: "the issue is already deferred",
      issueRef,
    });
  }
  if (
    original.lifecycleEvents.length >=
      CONSISTENCY_ISSUE_POC_LIMITS.maxLifecycleEvents
  ) {
    return rejected(original, "issue deferral would exceed a PoC limit", issueRef);
  }
  const draft = cloneEnvelope(original);
  draft.issues.find((item) => item.id === issueRef)!.status = "deferred";
  draft.lifecycleEvents.push(eventFor({
    envelope: draft,
    issueRef,
    kind: "deferred",
    turn,
    sourceRef: SourceRefSchema.parse(input.decisionRef),
    note: z.string().min(1).max(1000).parse(input.reason),
  }));
  draft.revision += 1;
  return commitDraft({
    original,
    draft,
    outcome: "deferred",
    reason: "issue resolution was deferred without changing its claims",
    issueRef,
  });
}

export function resolveConsistencyIssue(input: {
  envelope: ConsistencyIssuePocEnvelope;
  issueRef: string;
  resolutionRef: string;
  turn: number;
  summary: string;
}): ConsistencyIssueMutationReceipt {
  const original = cloneEnvelope(input.envelope);
  const issueRef = IssueRefSchema.parse(input.issueRef);
  const issue = original.issues.find((item) => item.id === issueRef);
  if (!issue) return rejected(original, "cannot resolve an unknown issue", issueRef);
  const turn = z.number().int().nonnegative().parse(input.turn);
  if (turn < issue.discoveredAt.turn) {
    return rejected(original, "issue resolution cannot precede discovery", issueRef);
  }
  if (issue.status === "resolved") {
    return receipt({
      outcome: "unchanged",
      envelope: original,
      reason: "the issue is already resolved",
      issueRef,
    });
  }
  if (
    original.lifecycleEvents.length >=
      CONSISTENCY_ISSUE_POC_LIMITS.maxLifecycleEvents
  ) {
    return rejected(original, "issue resolution would exceed a PoC limit", issueRef);
  }
  const resolution = ConsistencyIssueResolutionSchema.parse({
    resolutionRef: input.resolutionRef,
    resolvedAtTurn: turn,
    summary: input.summary,
  });
  const draft = cloneEnvelope(original);
  const target = draft.issues.find((item) => item.id === issueRef)!;
  target.status = "resolved";
  target.resolution = resolution;
  draft.lifecycleEvents.push(eventFor({
    envelope: draft,
    issueRef,
    kind: "resolved",
    turn: resolution.resolvedAtTurn,
    sourceRef: resolution.resolutionRef,
    note: resolution.summary,
  }));
  draft.revision += 1;
  return commitDraft({
    original,
    draft,
    outcome: "resolved",
    reason: "issue was resolved inside the shadow envelope",
    issueRef,
  });
}

export function blockingConsistencyIssueRefs(input: {
  envelope: ConsistencyIssuePocEnvelope;
  purpose: ProjectionPurpose;
}): string[] {
  const envelope = ConsistencyIssuePocEnvelopeSchema.parse(input.envelope);
  const purpose = ProjectionPurposeSchema.parse(input.purpose);
  return envelope.issues
    .filter((issue) =>
      issue.status !== "resolved" && issue.blocksPurposes.includes(purpose)
    )
    .map((issue) => issue.id)
    .sort((left, right) => left.localeCompare(right));
}

export function projectConsistencyIssueViews(
  envelopeInput: ConsistencyIssuePocEnvelope,
): ConsistencyIssueView[] {
  const envelope = ConsistencyIssuePocEnvelopeSchema.parse(envelopeInput);
  return envelope.issues.map((issue) => ConsistencyIssueViewSchema.parse({
    id: issue.id,
    involvedFactRefs: issue.involvedFactRefs,
    involvedEntityRefs: issue.involvedEntityRefs,
    blocksPurposes: issue.blocksPurposes,
    status: issue.status,
  }));
}
