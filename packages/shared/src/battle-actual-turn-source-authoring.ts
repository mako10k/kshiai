import { z } from "zod";
import {
  AdaptiveActionKindSchema,
  AdaptiveAdjudicationBatchResultSchema,
  type AdaptiveActionKind,
} from "./battle-adaptive-adjudication.js";
import {
  AdaptiveStageReceiptArtifactSchema,
  ApplicabilityDerivationArtifactSchema,
  CoarseProposalRegistryArtifactSchema,
  ConsistencyIssueSnapshotArtifactSchema,
  PurposeReadSetArtifactSchema,
  TurnFallbackPolicyArtifactSchema,
  deriveActualTurnApplicabilityInput,
  sha256ApplicabilityDerivationValue,
  stableApplicabilityDerivationJson,
  type ActualTurnInputDerivationArtifactKind,
  type ApplicabilityDerivationArtifact,
  type ApplicabilityDerivationProvenance,
  type ApplicabilityDerivationSourceBundle,
} from "./battle-actual-turn-input-derivation.js";
import {
  ConsistencyIssuePocEnvelopeSchema,
  projectConsistencyIssueViews,
} from "./battle-consistency-issue.js";
import type {
  ConflictHandlingApplicabilityInput,
} from "./battle-conflict-handling-applicability.js";
import {
  PurposeScopedReadCheckSchema,
} from "./battle-read-coherence.js";
import {
  BattleActionSchema,
  type ActionKind,
} from "./battle.js";

export const ACTUAL_TURN_SOURCE_AUTHORING_PROTOCOL_ID =
  "actual-turn-source-authoring-v1" as const;

export const ACTUAL_TURN_SOURCE_AUTHORING_CORE_CASE_REFS = [
  "C01_complete_nonempty",
  "C02_complete_empty",
  "C03_policy_missing",
  "C04_proposals_missing",
  "C05_adaptive_missing",
  "C06_reads_missing",
  "C07_issues_missing",
  "C08_duplicate_freeze",
  "C09_wrong_turn",
  "C10_digest_mismatch",
  "C11_dangling_refs",
] as const;

export const ACTUAL_TURN_SOURCE_AUTHORING_CORE_BOUNDARIES = {
  syntheticDataOnly: true,
  runtimeHooks: 0,
  backendImports: 0,
  repositoryReads: 0,
  databaseQueries: 0,
  networkCalls: 0,
  providerCalls: 0,
  externalLlmCalls: 0,
  xaiCalls: 0,
  canonicalWrites: 0,
  battleStateWrites: 0,
  persistenceWrites: 0,
} as const;

const CaseRefSchema = z.string().regex(/^[XFPARI][0-9]{2}_[a-z0-9_]+$/u);
const RefSchema = z.string().min(1).max(240);

const SourceAuthoringTransformSchema = z.enum([
  "copy",
  "literal",
  "deterministic_ref",
  "sha256",
  "action_kind_map",
  "issue_projection",
]);
export type SourceAuthoringTransform = z.infer<
  typeof SourceAuthoringTransformSchema
>;

export const SourceAuthoringFieldProvenanceSchema = z.object({
  artifactPath: z.string().min(1).max(500),
  sourcePath: z.string().min(1).max(500),
  transform: SourceAuthoringTransformSchema,
}).strict();
export type SourceAuthoringFieldProvenance = z.infer<
  typeof SourceAuthoringFieldProvenanceSchema
>;

export const SourceAuthoringReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  protocolId: z.literal(ACTUAL_TURN_SOURCE_AUTHORING_PROTOCOL_ID),
  artifactRef: RefSchema,
  kind: z.enum([
    "turn_fallback_policy",
    "coarse_proposal_registry",
    "adaptive_stage_receipt",
    "purpose_read_set",
    "consistency_issue_snapshot",
  ]),
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  fieldProvenance: z.array(SourceAuthoringFieldProvenanceSchema)
    .min(6)
    .max(8192),
  inferredFieldCount: z.literal(0),
}).strict().superRefine((receipt, ctx) => {
  const paths = receipt.fieldProvenance.map((entry) => entry.artifactPath);
  if (new Set(paths).size !== paths.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fieldProvenance"],
      message: "artifact field provenance paths must be unique",
    });
  }
});
export type SourceAuthoringReceipt = z.infer<
  typeof SourceAuthoringReceiptSchema
>;

function leafPaths(value: unknown, prefix: string): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [prefix];
    return value.flatMap((child, index) =>
      leafPaths(child, `${prefix}[${index}]`)
    );
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return [prefix];
    return entries.flatMap(([key, child]) =>
      leafPaths(child, `${prefix}.${key}`)
    );
  }
  return [prefix];
}

export function sourceAuthoringArtifactLeafPaths(
  artifact: ApplicabilityDerivationArtifact,
): string[] {
  return leafPaths(artifact, "artifact").sort((left, right) =>
    left.localeCompare(right)
  );
}

function provenanceCoversArtifact(input: {
  artifact: ApplicabilityDerivationArtifact;
  receipt: SourceAuthoringReceipt;
}): boolean {
  const expected = sourceAuthoringArtifactLeafPaths(input.artifact);
  const actual = input.receipt.fieldProvenance
    .map((entry) => `artifact.${entry.artifactPath}`)
    .sort((left, right) => left.localeCompare(right));
  return stableApplicabilityDerivationJson(expected) ===
    stableApplicabilityDerivationJson(actual);
}

export const SourceAuthoredArtifactRecordSchema = z.object({
  artifact: ApplicabilityDerivationArtifactSchema,
  receipt: SourceAuthoringReceiptSchema,
}).strict().superRefine((record, ctx) => {
  if (record.receipt.artifactRef !== record.artifact.artifactRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receipt", "artifactRef"],
      message: "receipt artifact reference must match its artifact",
    });
  }
  if (record.receipt.kind !== record.artifact.kind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receipt", "kind"],
      message: "receipt kind must match its artifact",
    });
  }
  if (record.receipt.payloadSha256 !== record.artifact.payloadSha256) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receipt", "payloadSha256"],
      message: "receipt payload digest must match its artifact",
    });
  }
  if (!provenanceCoversArtifact(record)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receipt", "fieldProvenance"],
      message: "receipt must cover every artifact leaf exactly once",
    });
  }
});
export type SourceAuthoredArtifactRecord = z.infer<
  typeof SourceAuthoredArtifactRecordSchema
>;

const PurposeReadSourceSchema = z.object({
  turn: z.number().int().nonnegative(),
  sliceRef: RefSchema,
  check: PurposeScopedReadCheckSchema,
}).strict();
export type PurposeReadSource = z.infer<typeof PurposeReadSourceSchema>;

const PurposeReadCollectorSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_open") }).strict(),
  z.object({
    status: z.literal("open"),
    entries: z.array(PurposeReadSourceSchema).max(32),
  }).strict(),
  z.object({ status: z.literal("closed") }).strict(),
]);

export const ActualTurnSourceAuthoringContextSchema = z.object({
  schemaVersion: z.literal(1),
  protocolId: z.literal(ACTUAL_TURN_SOURCE_AUTHORING_PROTOCOL_ID),
  caseRef: CaseRefSchema,
  turn: z.number().int().nonnegative(),
  records: z.array(SourceAuthoredArtifactRecordSchema).max(5),
  readCollector: PurposeReadCollectorSchema,
  sealed: z.boolean(),
}).strict().superRefine((context, ctx) => {
  const kinds = context.records.map((record) => record.artifact.kind);
  if (new Set(kinds).size !== kinds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["records"],
      message: "artifact kinds must be unique",
    });
  }
  const refs = context.records.map((record) => record.artifact.artifactRef);
  if (new Set(refs).size !== refs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["records"],
      message: "artifact references must be unique",
    });
  }
  for (const [index, record] of context.records.entries()) {
    if (record.artifact.turn !== context.turn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["records", index, "artifact", "turn"],
        message: "artifact turn must match its authoring context",
      });
    }
  }
  const hasReadArtifact = kinds.includes("purpose_read_set");
  if (hasReadArtifact !== (context.readCollector.status === "closed")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["readCollector"],
      message: "closed read collector and purpose read artifact must coincide",
    });
  }
  if (context.sealed && context.records.length !== 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sealed"],
      message: "a sealed context must contain all five artifacts",
    });
  }
});
export type ActualTurnSourceAuthoringContext = z.infer<
  typeof ActualTurnSourceAuthoringContextSchema
>;

export type SourceAuthoringTransitionResult =
  | {
      status: "accepted";
      context: ActualTurnSourceAuthoringContext;
    }
  | {
      status: "rejected";
      context: ActualTurnSourceAuthoringContext;
      reasons: string[];
    };

const TurnFallbackPolicySourceSchema = z.object({
  turn: z.number().int().nonnegative(),
  allowedFallbacks:
    TurnFallbackPolicyArtifactSchema.shape.payload.shape.allowedFallbacks,
}).strict();

const CharacterProposalSourceSchema = z.object({
  origin: z.literal("character"),
  proposalRef: RefSchema,
  action: BattleActionSchema,
}).strict();

const WorldProposalSourceSchema = z.object({
  origin: z.literal("world_process"),
  proposalRef: RefSchema,
  actionKind: z.literal("world_process"),
}).strict();

const CoarseProposalRegistrySourceSchema = z.object({
  turn: z.number().int().nonnegative(),
  proposals: z.array(z.discriminatedUnion("origin", [
    CharacterProposalSourceSchema,
    WorldProposalSourceSchema,
  ])).max(16),
}).strict().superRefine((source, ctx) => {
  const refs = source.proposals.map((proposal) => proposal.proposalRef);
  if (new Set(refs).size !== refs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proposals"],
      message: "proposal references must be unique",
    });
  }
});

const AdaptiveStageReceiptSourceSchema = z.object({
  turn: z.number().int().nonnegative(),
  receipt: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("executed"),
      result: AdaptiveAdjudicationBatchResultSchema,
    }).strict(),
    z.object({
      status: z.literal("skipped"),
      reason: z.string().min(1).max(320),
    }).strict(),
  ]),
}).strict();

const ConsistencyIssueSnapshotSourceSchema = z.object({
  turn: z.number().int().nonnegative(),
  envelope: ConsistencyIssuePocEnvelopeSchema,
}).strict();

const ACTION_KIND_MAP: Record<ActionKind, AdaptiveActionKind> = {
  basic_attack: "basic_attack",
  skill: "skill",
  rest: "custom",
  defend: "defense",
  wait: "custom",
  free_action: "free_action",
};

export function mapBattleActionKindToAdaptiveActionKind(
  actionKind: ActionKind,
): AdaptiveActionKind {
  return AdaptiveActionKindSchema.parse(ACTION_KIND_MAP[actionKind]);
}

export function createActualTurnSourceAuthoringContext(input: {
  caseRef: string;
  turn: number;
}): ActualTurnSourceAuthoringContext {
  return ActualTurnSourceAuthoringContextSchema.parse({
    schemaVersion: 1,
    protocolId: ACTUAL_TURN_SOURCE_AUTHORING_PROTOCOL_ID,
    caseRef: input.caseRef,
    turn: input.turn,
    records: [],
    readCollector: { status: "not_open" },
    sealed: false,
  });
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function schemaReasons(stage: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length === 0 ? "$" : issue.path.join(".");
    return `schema_invalid:${stage}:${path}:${issue.message}`;
  });
}

function rejected(
  context: ActualTurnSourceAuthoringContext,
  reasons: Iterable<string>,
): SourceAuthoringTransitionResult {
  return {
    status: "rejected",
    context,
    reasons: uniqueSorted(reasons),
  };
}

function recordFor(
  context: ActualTurnSourceAuthoringContext,
  kind: ActualTurnInputDerivationArtifactKind,
): SourceAuthoredArtifactRecord | undefined {
  return context.records.find((record) => record.artifact.kind === kind);
}

function exactKinds(
  context: ActualTurnSourceAuthoringContext,
  kinds: ActualTurnInputDerivationArtifactKind[],
): boolean {
  return stableApplicabilityDerivationJson(
    context.records.map((record) => record.artifact.kind),
  ) === stableApplicabilityDerivationJson(kinds);
}

function ensureWritableStage(input: {
  context: ActualTurnSourceAuthoringContext;
  kind: ActualTurnInputDerivationArtifactKind;
  predecessors: ActualTurnInputDerivationArtifactKind[];
}): string[] {
  if (input.context.sealed) return ["context_already_sealed"];
  if (recordFor(input.context, input.kind)) {
    return [`duplicate_artifact:${input.kind}`];
  }
  if (!exactKinds(input.context, input.predecessors)) {
    return [`stage_out_of_order:${input.kind}`];
  }
  return [];
}

function copiedPayloadProvenance(input: {
  payload: unknown;
  sourceRoot: string;
  transform?: SourceAuthoringTransform;
}): SourceAuthoringFieldProvenance[] {
  return leafPaths(input.payload, "payload").map((artifactPath) => ({
    artifactPath,
    sourcePath: artifactPath.replace(/^payload/u, input.sourceRoot),
    transform: input.transform ?? "copy",
  }));
}

function headerProvenance(input: {
  kind: ActualTurnInputDerivationArtifactKind;
  turnSourcePath: string;
}): SourceAuthoringFieldProvenance[] {
  return [
    {
      artifactPath: "artifactRef",
      sourcePath: "context.caseRef",
      transform: "deterministic_ref",
    },
    {
      artifactPath: "complete",
      sourcePath: "$literal.true",
      transform: "literal",
    },
    {
      artifactPath: "kind",
      sourcePath: `$literal.${input.kind}`,
      transform: "literal",
    },
    {
      artifactPath: "payloadSha256",
      sourcePath: "payload",
      transform: "sha256",
    },
    {
      artifactPath: "sourceStage",
      sourcePath: `$literal.${input.kind}`,
      transform: "literal",
    },
    {
      artifactPath: "turn",
      sourcePath: input.turnSourcePath,
      transform: "copy",
    },
  ];
}

async function authoredRecord(input: {
  context: ActualTurnSourceAuthoringContext;
  kind: ActualTurnInputDerivationArtifactKind;
  payload: unknown;
  payloadProvenance: SourceAuthoringFieldProvenance[];
  turnSourcePath: string;
}): Promise<SourceAuthoredArtifactRecord> {
  const payloadSha256 = await sha256ApplicabilityDerivationValue(input.payload);
  const artifact = ApplicabilityDerivationArtifactSchema.parse({
    artifactRef: `artifact:${input.context.caseRef}:${input.kind}`,
    kind: input.kind,
    sourceStage: input.kind,
    turn: input.context.turn,
    complete: true,
    payloadSha256,
    payload: input.payload,
  });
  const receipt = SourceAuthoringReceiptSchema.parse({
    schemaVersion: 1,
    protocolId: ACTUAL_TURN_SOURCE_AUTHORING_PROTOCOL_ID,
    artifactRef: artifact.artifactRef,
    kind: artifact.kind,
    payloadSha256,
    fieldProvenance: [
      ...headerProvenance({
        kind: input.kind,
        turnSourcePath: input.turnSourcePath,
      }),
      ...input.payloadProvenance,
    ],
    inferredFieldCount: 0,
  });
  return SourceAuthoredArtifactRecordSchema.parse({ artifact, receipt });
}

function withRecord(input: {
  context: ActualTurnSourceAuthoringContext;
  record: SourceAuthoredArtifactRecord;
  readCollector?: ActualTurnSourceAuthoringContext["readCollector"];
}): SourceAuthoringTransitionResult {
  return {
    status: "accepted",
    context: ActualTurnSourceAuthoringContextSchema.parse({
      ...input.context,
      records: [...input.context.records, input.record],
      readCollector: input.readCollector ?? input.context.readCollector,
    }),
  };
}

async function sourceSnapshot(rawSource: unknown): Promise<{
  before?: string;
  reason?: string;
}> {
  try {
    return { before: stableApplicabilityDerivationJson(rawSource) };
  } catch {
    return { reason: "source_not_json_serializable" };
  }
}

function sourceChanged(rawSource: unknown, before: string): boolean {
  try {
    return stableApplicabilityDerivationJson(rawSource) !== before;
  } catch {
    return true;
  }
}

export async function authorTurnFallbackPolicy(
  contextInput: ActualTurnSourceAuthoringContext,
  rawSource: unknown,
): Promise<SourceAuthoringTransitionResult> {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  const stageReasons = ensureWritableStage({
    context,
    kind: "turn_fallback_policy",
    predecessors: [],
  });
  if (stageReasons.length > 0) return rejected(context, stageReasons);
  const snapshot = await sourceSnapshot(rawSource);
  if (!snapshot.before) return rejected(context, [snapshot.reason!]);
  const parsed = TurnFallbackPolicySourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    return rejected(context, schemaReasons("turn_fallback_policy", parsed.error));
  }
  if (parsed.data.turn !== context.turn) {
    return rejected(context, ["source_turn_mismatch:turn_fallback_policy"]);
  }
  const payload = TurnFallbackPolicyArtifactSchema.shape.payload.parse({
    allowedFallbacks: parsed.data.allowedFallbacks,
  });
  const record = await authoredRecord({
    context,
    kind: "turn_fallback_policy",
    payload,
    payloadProvenance: copiedPayloadProvenance({
      payload,
      sourceRoot: "source",
    }),
    turnSourcePath: "source.turn",
  });
  if (sourceChanged(rawSource, snapshot.before)) {
    return rejected(context, ["source_changed_during_authoring"]);
  }
  return withRecord({ context, record });
}

export async function authorCoarseProposalRegistry(
  contextInput: ActualTurnSourceAuthoringContext,
  rawSource: unknown,
): Promise<SourceAuthoringTransitionResult> {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  const stageReasons = ensureWritableStage({
    context,
    kind: "coarse_proposal_registry",
    predecessors: ["turn_fallback_policy"],
  });
  if (stageReasons.length > 0) return rejected(context, stageReasons);
  const snapshot = await sourceSnapshot(rawSource);
  if (!snapshot.before) return rejected(context, [snapshot.reason!]);
  const parsed = CoarseProposalRegistrySourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    return rejected(
      context,
      schemaReasons("coarse_proposal_registry", parsed.error),
    );
  }
  if (parsed.data.turn !== context.turn) {
    return rejected(context, ["source_turn_mismatch:coarse_proposal_registry"]);
  }
  const payload = CoarseProposalRegistryArtifactSchema.shape.payload.parse({
    proposals: parsed.data.proposals.map((proposal) => ({
      proposalRef: proposal.proposalRef,
      actionKind: proposal.origin === "character"
        ? mapBattleActionKindToAdaptiveActionKind(proposal.action.kind)
        : proposal.actionKind,
    })),
  });
  const payloadProvenance = payload.proposals.length === 0
    ? [{
        artifactPath: "payload.proposals",
        sourcePath: "source.proposals",
        transform: "copy" as const,
      }]
    : payload.proposals.flatMap((_, index) => {
        const source = parsed.data.proposals[index]!;
        return [
          {
            artifactPath: `payload.proposals[${index}].actionKind`,
            sourcePath: source.origin === "character"
              ? `source.proposals[${index}].action.kind`
              : `source.proposals[${index}].actionKind`,
            transform: source.origin === "character"
              ? "action_kind_map" as const
              : "copy" as const,
          },
          {
            artifactPath: `payload.proposals[${index}].proposalRef`,
            sourcePath: `source.proposals[${index}].proposalRef`,
            transform: "copy" as const,
          },
        ];
      });
  const record = await authoredRecord({
    context,
    kind: "coarse_proposal_registry",
    payload,
    payloadProvenance,
    turnSourcePath: "source.turn",
  });
  if (sourceChanged(rawSource, snapshot.before)) {
    return rejected(context, ["source_changed_during_authoring"]);
  }
  return withRecord({ context, record });
}

export async function authorAdaptiveStageReceipt(
  contextInput: ActualTurnSourceAuthoringContext,
  rawSource: unknown,
): Promise<SourceAuthoringTransitionResult> {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  const stageReasons = ensureWritableStage({
    context,
    kind: "adaptive_stage_receipt",
    predecessors: ["turn_fallback_policy", "coarse_proposal_registry"],
  });
  if (stageReasons.length > 0) return rejected(context, stageReasons);
  const snapshot = await sourceSnapshot(rawSource);
  if (!snapshot.before) return rejected(context, [snapshot.reason!]);
  const parsed = AdaptiveStageReceiptSourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    return rejected(context, schemaReasons("adaptive_stage_receipt", parsed.error));
  }
  if (parsed.data.turn !== context.turn) {
    return rejected(context, ["source_turn_mismatch:adaptive_stage_receipt"]);
  }
  const payload = AdaptiveStageReceiptArtifactSchema.shape.payload.parse(
    parsed.data.receipt,
  );
  const record = await authoredRecord({
    context,
    kind: "adaptive_stage_receipt",
    payload,
    payloadProvenance: copiedPayloadProvenance({
      payload,
      sourceRoot: "source.receipt",
    }),
    turnSourcePath: "source.turn",
  });
  if (sourceChanged(rawSource, snapshot.before)) {
    return rejected(context, ["source_changed_during_authoring"]);
  }
  return withRecord({ context, record });
}

export function openPurposeReadSet(
  contextInput: ActualTurnSourceAuthoringContext,
): SourceAuthoringTransitionResult {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  if (context.sealed) return rejected(context, ["context_already_sealed"]);
  if (recordFor(context, "purpose_read_set") ||
    context.readCollector.status !== "not_open") {
    return rejected(context, ["duplicate_artifact:purpose_read_set"]);
  }
  if (!exactKinds(context, [
    "turn_fallback_policy",
    "coarse_proposal_registry",
    "adaptive_stage_receipt",
  ])) {
    return rejected(context, ["stage_out_of_order:purpose_read_set"]);
  }
  return {
    status: "accepted",
    context: ActualTurnSourceAuthoringContextSchema.parse({
      ...context,
      readCollector: { status: "open", entries: [] },
    }),
  };
}

export function appendPurposeRead(
  contextInput: ActualTurnSourceAuthoringContext,
  rawSource: unknown,
): SourceAuthoringTransitionResult {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  if (context.sealed) return rejected(context, ["context_already_sealed"]);
  if (context.readCollector.status !== "open") {
    return rejected(context, ["purpose_read_collector_not_open"]);
  }
  let before: string;
  try {
    before = stableApplicabilityDerivationJson(rawSource);
  } catch {
    return rejected(context, ["source_not_json_serializable"]);
  }
  const parsed = PurposeReadSourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    return rejected(context, schemaReasons("purpose_read_set", parsed.error));
  }
  if (parsed.data.turn !== context.turn) {
    return rejected(context, ["source_turn_mismatch:purpose_read_set"]);
  }
  if (context.readCollector.entries.some((entry) =>
    entry.sliceRef === parsed.data.sliceRef
  )) {
    return rejected(context, [`duplicate_slice_ref:${parsed.data.sliceRef}`]);
  }
  if (sourceChanged(rawSource, before)) {
    return rejected(context, ["source_changed_during_authoring"]);
  }
  return {
    status: "accepted",
    context: ActualTurnSourceAuthoringContextSchema.parse({
      ...context,
      readCollector: {
        status: "open",
        entries: [...context.readCollector.entries, parsed.data],
      },
    }),
  };
}

export async function closePurposeReadSet(
  contextInput: ActualTurnSourceAuthoringContext,
): Promise<SourceAuthoringTransitionResult> {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  if (context.sealed) return rejected(context, ["context_already_sealed"]);
  if (recordFor(context, "purpose_read_set")) {
    return rejected(context, ["duplicate_artifact:purpose_read_set"]);
  }
  if (context.readCollector.status !== "open") {
    return rejected(context, ["purpose_read_collector_not_open"]);
  }
  const payload = PurposeReadSetArtifactSchema.shape.payload.parse({
    reads: context.readCollector.entries.map((entry) => ({
      sliceRef: entry.sliceRef,
      check: entry.check,
    })),
  });
  const record = await authoredRecord({
    context,
    kind: "purpose_read_set",
    payload,
    payloadProvenance: copiedPayloadProvenance({
      payload,
      sourceRoot: "collector.entries",
    }),
    turnSourcePath: "context.turn",
  });
  return withRecord({
    context,
    record,
    readCollector: { status: "closed" },
  });
}

export async function authorConsistencyIssueSnapshot(
  contextInput: ActualTurnSourceAuthoringContext,
  rawSource: unknown,
): Promise<SourceAuthoringTransitionResult> {
  const context = ActualTurnSourceAuthoringContextSchema.parse(contextInput);
  const stageReasons = ensureWritableStage({
    context,
    kind: "consistency_issue_snapshot",
    predecessors: [
      "turn_fallback_policy",
      "coarse_proposal_registry",
      "adaptive_stage_receipt",
      "purpose_read_set",
    ],
  });
  if (stageReasons.length > 0) return rejected(context, stageReasons);
  const snapshot = await sourceSnapshot(rawSource);
  if (!snapshot.before) return rejected(context, [snapshot.reason!]);
  const parsed = ConsistencyIssueSnapshotSourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    return rejected(
      context,
      schemaReasons("consistency_issue_snapshot", parsed.error),
    );
  }
  if (parsed.data.turn !== context.turn) {
    return rejected(context, ["source_turn_mismatch:consistency_issue_snapshot"]);
  }
  const payload = ConsistencyIssueSnapshotArtifactSchema.shape.payload.parse({
    issues: projectConsistencyIssueViews(parsed.data.envelope),
  });
  const record = await authoredRecord({
    context,
    kind: "consistency_issue_snapshot",
    payload,
    payloadProvenance: copiedPayloadProvenance({
      payload,
      sourceRoot: "source.envelope",
      transform: "issue_projection",
    }).map((entry) => ({
      ...entry,
      sourcePath: entry.sourcePath.replace(
        /^source\.envelope\.issues/u,
        "source.envelope.issues",
      ),
    })),
    turnSourcePath: "source.turn",
  });
  if (sourceChanged(rawSource, snapshot.before)) {
    return rejected(context, ["source_changed_during_authoring"]);
  }
  return withRecord({ context, record });
}

export type ActualTurnSourceAuthoringSealResult =
  | {
      status: "complete";
      context: ActualTurnSourceAuthoringContext;
      bundle: ApplicabilityDerivationSourceBundle;
      applicabilityInput: ConflictHandlingApplicabilityInput;
      derivationProvenance: ApplicabilityDerivationProvenance;
      authoringReceipts: SourceAuthoringReceipt[];
      inferredFieldCount: 0;
    }
  | {
      status: "insufficient_source";
      missingArtifactKinds: ActualTurnInputDerivationArtifactKind[];
      reasons: string[];
      inferredFieldCount: 0;
    }
  | {
      status: "invalid_source";
      reasons: string[];
      inferredFieldCount: 0;
    };

const ARTIFACT_ORDER: ActualTurnInputDerivationArtifactKind[] = [
  "turn_fallback_policy",
  "coarse_proposal_registry",
  "adaptive_stage_receipt",
  "purpose_read_set",
  "consistency_issue_snapshot",
];

export async function sealActualTurnSourceAuthoringContext(
  rawContext: unknown,
): Promise<ActualTurnSourceAuthoringSealResult> {
  const parsed = ActualTurnSourceAuthoringContextSchema.safeParse(rawContext);
  if (!parsed.success) {
    return {
      status: "invalid_source",
      reasons: uniqueSorted(schemaReasons("authoring_context", parsed.error)),
      inferredFieldCount: 0,
    };
  }
  const context = parsed.data;
  if (context.sealed) {
    return {
      status: "invalid_source",
      reasons: ["context_already_sealed"],
      inferredFieldCount: 0,
    };
  }
  const presentKinds = new Set(
    context.records.map((record) => record.artifact.kind),
  );
  const missingArtifactKinds = ARTIFACT_ORDER.filter((kind) =>
    !presentKinds.has(kind)
  );
  if (missingArtifactKinds.length > 0) {
    return {
      status: "insufficient_source",
      missingArtifactKinds,
      reasons: [
        ...(context.readCollector.status === "open"
          ? ["purpose_read_collector_not_closed"]
          : []),
        ...missingArtifactKinds.map((kind) => `artifact_missing:${kind}`),
      ],
      inferredFieldCount: 0,
    };
  }
  const bundle: ApplicabilityDerivationSourceBundle = {
    schemaVersion: 1,
    caseRef: context.caseRef,
    turn: context.turn,
    artifacts: context.records.map((record) => record.artifact),
    observedProxyKinds: [],
  };
  const derivation = await deriveActualTurnApplicabilityInput(bundle);
  if (derivation.status === "invalid_source") {
    return {
      status: "invalid_source",
      reasons: derivation.reasons,
      inferredFieldCount: 0,
    };
  }
  if (derivation.status === "insufficient_source") {
    return {
      status: "invalid_source",
      reasons: [
        ...derivation.missingFields.map((field) => `field_missing:${field}`),
        ...derivation.ambiguousFields.map((field) =>
          `field_ambiguous:${field}`
        ),
      ],
      inferredFieldCount: 0,
    };
  }
  const sealedContext = ActualTurnSourceAuthoringContextSchema.parse({
    ...context,
    sealed: true,
  });
  return {
    status: "complete",
    context: sealedContext,
    bundle,
    applicabilityInput: derivation.applicabilityInput,
    derivationProvenance: derivation.provenance,
    authoringReceipts: context.records.map((record) => record.receipt),
    inferredFieldCount: 0,
  };
}
