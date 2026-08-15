import { z } from "zod";

export const SelectableAssetTypeSchema = z.enum([
  "character",
  "battlefield-preset",
  "narration-style",
]);
export type SelectableAssetType = z.infer<typeof SelectableAssetTypeSchema>;

export const DisclosureCeilingSchema = z.enum([
  "required_public",
  "public_eligible",
  "restricted",
]);
export type DisclosureCeiling = z.infer<typeof DisclosureCeilingSchema>;

export const ProjectionChannelSchema = z.enum([
  "profile",
  "self",
  "counterpart",
  "narrator",
  "mechanics",
  "image",
]);
export type ProjectionChannel = z.infer<typeof ProjectionChannelSchema>;

export const ProjectionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("public") }).strict(),
  z.object({ kind: z.literal("owner") }).strict(),
  z.object({ kind: z.literal("self") }).strict(),
  z.object({
    kind: z.literal("character"),
    characterAssetId: z.string().min(1).max(160),
  }).strict(),
  z.object({
    kind: z.literal("relationship_role"),
    role: z.string().min(1).max(80),
  }).strict(),
  z.object({
    kind: z.literal("narrator"),
    perspective: z.enum(["external", "self_inner", "omniscient"]),
  }).strict(),
]);
export type ProjectionTarget = z.infer<typeof ProjectionTargetSchema>;

export const ProjectionPrerequisiteSchema = z.enum([
  "identified",
  "observed",
  "learned",
  "committed_event",
  "self_aware",
]);
export type ProjectionPrerequisite = z.infer<
  typeof ProjectionPrerequisiteSchema
>;

export const AssetDisclosureRuleV1Schema = z.object({
  valuePath: z.string().min(1).max(240),
  channel: ProjectionChannelSchema,
  target: ProjectionTargetSchema,
  prerequisites: z.array(ProjectionPrerequisiteSchema).max(5).default([]),
}).strict();

export const AssetDisclosurePolicyV1Schema = z.object({
  version: z.literal(1),
  rules: z.array(AssetDisclosureRuleV1Schema).max(256),
}).strict();
export type AssetDisclosurePolicyV1 = z.infer<
  typeof AssetDisclosurePolicyV1Schema
>;

export const CompilerRequirementSchema = z.object({
  consumer: z.string().min(1).max(120),
  version: z.number().int().positive(),
}).strict();
export type CompilerRequirement = z.infer<typeof CompilerRequirementSchema>;

export const AssetClaimRiskCodeSchema = z.enum([
  "proper_noun",
  "number",
  "capability",
  "item",
  "relationship",
  "history_event",
  "hidden_cause",
  "information_right",
  "mechanics",
  "contradiction",
  "control_metadata",
]);
export type AssetClaimRiskCode = z.infer<typeof AssetClaimRiskCodeSchema>;

export const AssetClaimValidationReceiptV1Schema = z.object({
  contractVersion: z.literal(1),
  validatorContract: z.string().min(1).max(160),
  projectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  segments: z.array(z.object({
    segmentId: z.string().min(1).max(120),
    verdict: z.enum(["supported", "flavor_only", "unsupported"]),
    supportRefs: z.array(z.string().min(1).max(200)).max(12),
    riskCodes: z.array(AssetClaimRiskCodeSchema).max(8),
  }).strict()).min(1).max(12),
}).strict();
export type AssetClaimValidationReceiptV1 = z.infer<
  typeof AssetClaimValidationReceiptV1Schema
>;

export const AssetPublicPresentationV2Schema = z.object({
  description: z.string().min(1).max(4000),
  projectionContractVersion: z.number().int().positive(),
  projectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  descriptionInputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  segments: z.array(z.object({
    id: z.string().min(1).max(120),
    text: z.string().min(1).max(1200),
    kind: z.enum(["fact", "flavor"]),
    supportRefs: z.array(z.string().min(1).max(200)).max(12),
  }).strict()).min(1).max(12),
  claimValidation: AssetClaimValidationReceiptV1Schema.optional(),
}).strict();
export type AssetPublicPresentationV2 = z.infer<
  typeof AssetPublicPresentationV2Schema
>;

export function assetGenerationEnvelopeV2Schema<
  DefinitionSchema extends z.ZodTypeAny,
>(definitionSchema: DefinitionSchema) {
  return z.object({
    envelopeVersion: z.literal(2),
    definitionSchema: z.object({
      family: SelectableAssetTypeSchema,
      version: z.number().int().positive(),
    }).strict(),
    definition: definitionSchema,
    disclosurePolicy: AssetDisclosurePolicyV1Schema,
    publicPresentation: AssetPublicPresentationV2Schema,
    provenance: z.object({
      sourceKind: z.enum([
        "create_instruction",
        "revision_instruction",
        "upgrade_description",
        "media_revision",
        "restore_revision",
        "import",
      ]),
      sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
      attemptId: z.string().min(1).max(160),
      structureGeneratorContract: z.string().min(1).max(160),
      descriptionGeneratorContract: z.string().min(1).max(160),
    }).strict(),
    compilerCompatibility: z.array(CompilerRequirementSchema).min(1).max(24),
  }).strict();
}

export const AssetCompatibilityStatusSchema = z.enum([
  "unsupported",
  "upgrading",
  "upgrade_failed",
  "ready",
]);
export type AssetCompatibilityStatus = z.infer<
  typeof AssetCompatibilityStatusSchema
>;

export const AssetCompatibilitySchema = z.object({
  status: AssetCompatibilityStatusSchema,
  schemaVersion: z.number().int().positive().nullable(),
  currentGenerationId: z.string().nullable(),
  reasonCode: z.string().max(120).nullable(),
}).strict();
export type AssetCompatibility = z.infer<typeof AssetCompatibilitySchema>;

export const AssetAuthoringAttemptKindSchema = z.enum([
  "create",
  "revision",
  "upgrade",
]);
export type AssetAuthoringAttemptKind = z.infer<
  typeof AssetAuthoringAttemptKindSchema
>;

export const AssetAuthoringAttemptStatusSchema = z.enum([
  "pending_structure",
  "generating_structure",
  "validating_structure",
  "generating_description",
  "validating_description",
  "awaiting_owner_acceptance",
  "committing",
  "succeeded",
  "failed",
  "discarded",
  "expired",
]);
export type AssetAuthoringAttemptStatus = z.infer<
  typeof AssetAuthoringAttemptStatusSchema
>;

export const AssetAuthoringProgressSchema = z.object({
  attemptId: z.string().min(1).max(80).optional(),
  kind: AssetAuthoringAttemptKindSchema,
  status: AssetAuthoringAttemptStatusSchema,
  label: z.string().min(1).max(80),
  step: z.number().int().min(1).max(8),
  stepCount: z.number().int().min(1).max(8),
}).strict();
export type AssetAuthoringProgress = z.infer<typeof AssetAuthoringProgressSchema>;

export const AssetAuthoringFailureSchema = z.object({
  attemptId: z.string().min(1).max(80),
  characterId: z.string().min(1).max(80),
  kind: AssetAuthoringAttemptKindSchema,
  errorCode: z.string().max(120).nullable(),
  updatedAt: z.string().min(1),
}).strict();
export type AssetAuthoringFailure = z.infer<typeof AssetAuthoringFailureSchema>;

export const AssetAuthoringAcceptedSchema = z.object({
  attemptId: z.string().min(1).max(80),
  characterId: z.string().min(1).max(80),
  kind: AssetAuthoringAttemptKindSchema,
  progress: AssetAuthoringProgressSchema.nullable(),
}).strict();
export type AssetAuthoringAccepted = z.infer<typeof AssetAuthoringAcceptedSchema>;

export const AssetAuthoringReviewBaseSchema = z.object({
  attemptId: z.string().min(1).max(80),
  kind: AssetAuthoringAttemptKindSchema,
  status: z.string().min(1),
  assistantMessage: z.string(),
  expiresAt: z.string().min(1),
  latestAttemptId: z.string().min(1).max(80),
  stale: z.boolean(),
  canAccept: z.boolean(),
  failed: AssetAuthoringFailureSchema.nullable(),
  progress: AssetAuthoringProgressSchema.nullable(),
}).strict();

export const CharacterReviewStateSchema = z.enum([
  "queued",
  "generating",
  "awaiting_acceptance",
  "failed",
]);
export type CharacterReviewState = z.infer<typeof CharacterReviewStateSchema>;

export const OwnerNotificationKindSchema = z.enum([
  "authoring_ready",
  "authoring_failed",
]);
export type OwnerNotificationKind = z.infer<typeof OwnerNotificationKindSchema>;

export const AuthoringAssetTypeSchema = z.enum([
  "character",
  "battlefield",
  "narration_style",
]);
export type AuthoringAssetType = z.infer<typeof AuthoringAssetTypeSchema>;

export const OwnerNotificationPublicSchema = z.object({
  id: z.string().min(1).max(80),
  kind: OwnerNotificationKindSchema,
  attemptId: z.string().min(1).max(80),
  characterId: z.string().min(1).max(80),
  assetType: AuthoringAssetTypeSchema.default("character"),
  attemptKind: AssetAuthoringAttemptKindSchema,
  title: z.string().min(1).max(80),
  href: z.string().min(1).max(160),
  createdAt: z.string().min(1),
  readAt: z.string().nullable(),
}).strict();
export type OwnerNotificationPublic = z.infer<typeof OwnerNotificationPublicSchema>;

const AUTHORING_IN_FLIGHT_STATUSES = [
  "pending_structure",
  "generating_structure",
  "validating_structure",
  "generating_description",
  "validating_description",
] as const satisfies readonly AssetAuthoringAttemptStatus[];

export function isAssetAuthoringInFlight(
  status: AssetAuthoringAttemptStatus,
): boolean {
  return (AUTHORING_IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}

const AUTHORING_PROGRESS_STEP_COUNT = 5;

function authoringProgressLabel(
  kind: AssetAuthoringAttemptKind,
  status: AssetAuthoringAttemptStatus,
): { step: number; label: string } | null {
  if (status === "pending_structure") {
    return { step: 1, label: "準備しています" };
  }
  if (status === "generating_structure") {
    if (kind === "upgrade") {
      return { step: 2, label: "既存設定を構造へ移しています" };
    }
    if (kind === "revision") {
      return { step: 2, label: "変更を構造へ反映しています" };
    }
    return { step: 2, label: "構造化設定を作成中" };
  }
  if (status === "validating_structure") {
    return { step: 3, label: "機械チェックと自己レビュー中" };
  }
  if (status === "generating_description") {
    return { step: 4, label: "公開プロフィールを作成中" };
  }
  if (status === "validating_description") {
    return { step: 5, label: "記載内容を検証中" };
  }
  return null;
}

export function toAssetAuthoringProgress(
  kind: AssetAuthoringAttemptKind,
  status: AssetAuthoringAttemptStatus,
  attemptId?: string,
): AssetAuthoringProgress | null {
  const mapped = authoringProgressLabel(kind, status);
  if (!mapped) return null;
  return AssetAuthoringProgressSchema.parse({
    ...(attemptId ? { attemptId } : {}),
    kind,
    status,
    label: mapped.label,
    step: mapped.step,
    stepCount: AUTHORING_PROGRESS_STEP_COUNT,
  });
}
