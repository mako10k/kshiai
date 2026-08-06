import { z } from "zod";
import {
  BattleStateSchema,
  BattleTurnRecordSchema,
} from "./battle.js";
import {
  ConflictHandlingApplicabilityInputSchema,
} from "./battle-conflict-handling-applicability.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const ObservationIdSchema = z.string().regex(
  /^observation:[0-9a-f]{64}$/u,
);
const OpaqueObservationRefSchema = z.string().regex(
  /^(proposal|claim|slice|issue|fact):[0-9a-f]{64}$/u,
);

export const ACTUAL_TURN_SHADOW_CAPTURE_VERSION =
  "actual-turn-shadow-observation-capture-v1" as const;

export const ACTUAL_TURN_APPLICABILITY_FIELDS = [
  "allowedFallbacks",
  "proposals",
  "adaptive",
  "reads",
  "issues",
] as const;

export const ActualTurnApplicabilityFieldSchema = z.enum(
  ACTUAL_TURN_APPLICABILITY_FIELDS,
);
export type ActualTurnApplicabilityField = z.infer<
  typeof ActualTurnApplicabilityFieldSchema
>;

function validateOpaqueRef(
  value: string,
  path: Array<string | number>,
  expectedKind: "proposal" | "claim" | "slice" | "issue" | "fact",
  ctx: z.RefinementCtx,
): void {
  if (
    !OpaqueObservationRefSchema.safeParse(value).success ||
    !value.startsWith(`${expectedKind}:`)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `reference must be an opaque ${expectedKind} SHA-256 token`,
    });
  }
}

export const ActualTurnShadowApplicabilityInputSchema =
  ConflictHandlingApplicabilityInputSchema.superRefine((value, ctx) => {
    value.proposals.forEach((proposal, index) => {
      validateOpaqueRef(
        proposal.proposalRef,
        ["proposals", index, "proposalRef"],
        "proposal",
        ctx,
      );
    });
    if (value.adaptive.status === "executed") {
      value.adaptive.contestedClaimRefs.forEach((reference, index) => {
        validateOpaqueRef(
          reference,
          ["adaptive", "contestedClaimRefs", index],
          "claim",
          ctx,
        );
      });
      value.adaptive.receipts.forEach((receipt, index) => {
        validateOpaqueRef(
          receipt.proposalRef,
          ["adaptive", "receipts", index, "proposalRef"],
          "proposal",
          ctx,
        );
        if (receipt.fallbackFact) {
          validateOpaqueRef(
            receipt.fallbackFact.factRef,
            ["adaptive", "receipts", index, "fallbackFact", "factRef"],
            "fact",
            ctx,
          );
        }
      });
    }
    value.reads.forEach((read, index) => {
      validateOpaqueRef(
        read.sliceRef,
        ["reads", index, "sliceRef"],
        "slice",
        ctx,
      );
      read.blockingIssueRefs.forEach((reference, issueIndex) => {
        validateOpaqueRef(
          reference,
          ["reads", index, "blockingIssueRefs", issueIndex],
          "issue",
          ctx,
        );
      });
    });
    value.issues.forEach((issue, index) => {
      validateOpaqueRef(
        issue.issueRef,
        ["issues", index, "issueRef"],
        "issue",
        ctx,
      );
    });
  });
export type ActualTurnShadowApplicabilityInput = z.infer<
  typeof ActualTurnShadowApplicabilityInputSchema
>;

export const ActualTurnShadowObservationEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  observationId: ObservationIdSchema,
  source: z.object({
    battleRefHash: Sha256Schema,
    turn: z.number().int().nonnegative(),
    capturedAt: z.string().datetime(),
    captureVersion: z.literal(ACTUAL_TURN_SHADOW_CAPTURE_VERSION),
  }).strict(),
  applicabilityInput: ActualTurnShadowApplicabilityInputSchema,
  authorityEvidence: z.object({
    sourceBeforeDigest: Sha256Schema,
    sourceAfterDigest: Sha256Schema,
    authoritativeOutcomeDigest: Sha256Schema,
    battleResultChanged: z.literal(false),
    canonicalCommitCount: z.literal(0),
    persistenceWriteCount: z.literal(0),
    addedExternalLlmCalls: z.literal(0),
    addedXaiCalls: z.literal(0),
  }).strict(),
  privacyEvidence: z.object({
    canonicalIdentifiersIncluded: z.literal(false),
    characterNamesIncluded: z.literal(false),
    speechOrNarrationIncluded: z.literal(false),
    promptOrProviderPayloadIncluded: z.literal(false),
    mediaUrlsIncluded: z.literal(false),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (
    value.authorityEvidence.sourceBeforeDigest !==
      value.authorityEvidence.sourceAfterDigest
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["authorityEvidence", "sourceAfterDigest"],
      message: "read-only capture requires identical source digests",
    });
  }
});
export type ActualTurnShadowObservationEnvelope = z.infer<
  typeof ActualTurnShadowObservationEnvelopeSchema
>;

const EnvelopeFileSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("actual_turn_shadow_observation_envelopes"),
  envelopes: z.array(ActualTurnShadowObservationEnvelopeSchema).max(500),
}).strict();

const PersistedBattleStateFileSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("persisted_battle_state"),
  battleState: BattleStateSchema,
}).strict();

const PersistedTurnRecordsFileSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("persisted_battle_turn_records"),
  turnRecords: z.array(BattleTurnRecordSchema).max(500),
}).strict();

export const ActualTurnShadowObservationInputFileSchema =
  z.discriminatedUnion("mode", [
    EnvelopeFileSchema,
    PersistedBattleStateFileSchema,
    PersistedTurnRecordsFileSchema,
  ]);
export type ActualTurnShadowObservationInputFile = z.infer<
  typeof ActualTurnShadowObservationInputFileSchema
>;

const RecordRefSchema = z.string().regex(/^record:[0-9]{6}$/u);
const CompleteRecordAuditSchema = z.object({
  recordRef: RecordRefSchema,
  sourceKind: z.literal("observation_envelope"),
  status: z.literal("complete"),
  availableApplicabilityFields: z.tuple([
    z.literal("allowedFallbacks"),
    z.literal("proposals"),
    z.literal("adaptive"),
    z.literal("reads"),
    z.literal("issues"),
  ]),
  missingApplicabilityFields: z.array(ActualTurnApplicabilityFieldSchema)
    .length(0),
  inferredFieldCount: z.literal(0),
  danglingStructuralRefCount: z.number().int().nonnegative(),
  envelopeDigest: Sha256Schema,
  applicabilityInputDigest: Sha256Schema,
}).strict();

const InsufficientRecordAuditSchema = z.object({
  recordRef: RecordRefSchema,
  sourceKind: z.enum([
    "persisted_battle_state_record",
    "persisted_battle_turn_record",
  ]),
  status: z.literal("insufficient_source"),
  availableApplicabilityFields: z.array(ActualTurnApplicabilityFieldSchema)
    .length(0),
  missingApplicabilityFields: z.tuple([
    z.literal("allowedFallbacks"),
    z.literal("proposals"),
    z.literal("adaptive"),
    z.literal("reads"),
    z.literal("issues"),
  ]),
  inferredFieldCount: z.literal(0),
  danglingStructuralRefCount: z.literal(0),
}).strict();

export const ActualTurnShadowObservationRecordAuditSchema =
  z.discriminatedUnion("status", [
    CompleteRecordAuditSchema,
    InsufficientRecordAuditSchema,
  ]);
export type ActualTurnShadowObservationRecordAudit = z.infer<
  typeof ActualTurnShadowObservationRecordAuditSchema
>;

export const ActualTurnShadowObservationReportSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("actual_turn_shadow_observation_audit"),
  source: z.object({
    inputMode: z.enum([
      "actual_turn_shadow_observation_envelopes",
      "persisted_battle_state",
      "persisted_battle_turn_records",
    ]),
    byteLength: z.number().int().nonnegative(),
    beforeSha256: Sha256Schema,
    afterSha256: Sha256Schema,
    unchanged: z.literal(true),
  }).strict(),
  summary: z.object({
    inputRecordCount: z.number().int().nonnegative().max(500),
    completeRecordCount: z.number().int().nonnegative().max(500),
    insufficientSourceRecordCount: z.number().int().nonnegative().max(500),
    inferredFieldCount: z.literal(0),
  }).strict(),
  records: z.array(ActualTurnShadowObservationRecordAuditSchema).max(500),
  privacy: z.object({
    directIdentityFieldsEmitted: z.literal(0),
    proseFieldsEmitted: z.literal(0),
    promptOrProviderFieldsEmitted: z.literal(0),
    mediaUrlFieldsEmitted: z.literal(0),
  }).strict(),
  boundaries: z.object({
    sourceWriteCount: z.literal(0),
    databaseQueryCount: z.literal(0),
    networkCallCount: z.literal(0),
    providerCallCount: z.literal(0),
    externalLlmCallCount: z.literal(0),
    xaiCallCount: z.literal(0),
    canonicalWriteCount: z.literal(0),
    persistenceWriteCount: z.literal(0),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (
    value.summary.inputRecordCount !== value.records.length ||
    value.summary.completeRecordCount !== value.records.filter(
      (record) => record.status === "complete",
    ).length ||
    value.summary.insufficientSourceRecordCount !== value.records.filter(
      (record) => record.status === "insufficient_source",
    ).length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["summary"],
      message: "record summary must match the emitted audits",
    });
  }
});
export type ActualTurnShadowObservationReport = z.infer<
  typeof ActualTurnShadowObservationReportSchema
>;
