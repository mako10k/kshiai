import { z } from "zod";

/**
 * Operator-authored, runtime dialogue policy. It guides LLM-authored
 * the pre-speech deep-psyche stage only; deterministic combat and canonical
 * facts never read this as a mechanical rule.
 */
const DialoguePipelineCommonValuesSchema = z.object({
  enabled: z.boolean().default(true),
  conversationHistoryLimit: z.number().int().min(4).max(24).default(12),
  /** Which input projection new battles should snapshot for their dialogue calls. */
  contextProjectionMode: z.enum(["legacy", "compact"]).default("legacy"),
  /** Raw recent exchanges retained beside the private dialogue-thread summary. */
  recentExchangeLimit: z.number().int().min(2).max(8).default(4),
  /** At most this many deep-psyche-selected older exchanges may re-enter a prompt. */
  relevantMemoryLimit: z.number().int().min(0).max(2).default(1),
  psychologyGuidance: z.string().min(1).max(3_000),
});

export const DialoguePipelineValuesV1Schema =
  DialoguePipelineCommonValuesSchema.extend({
    schemaVersion: z.literal(1),
  });

export const DialoguePipelineValuesV2Schema =
  DialoguePipelineCommonValuesSchema.extend({
    schemaVersion: z.literal(2),
  });

export const DialoguePipelineValuesV3Schema =
  DialoguePipelineCommonValuesSchema.extend({
    schemaVersion: z.literal(3),
    contextProjectionMode: z.literal("compact"),
  });

export const DialoguePipelineValuesSchema = z.discriminatedUnion(
  "schemaVersion",
  [DialoguePipelineValuesV1Schema, DialoguePipelineValuesV2Schema, DialoguePipelineValuesV3Schema],
);
export type DialoguePipelineValues = z.infer<typeof DialoguePipelineValuesSchema>;

export const DEFAULT_DIALOGUE_PSYCHOLOGY_GUIDANCE = [
  "キャラクターは言葉を、相手との関係や場に働きかける行為として受け止める。",
  "通じない表現が重なると、通常はその効力が薄れたと感じ、目的や気分に合う別の角度を探す。",
  "ただし執着、儀式、信念、威圧、不調などがそのキャラクター自身の根拠になるなら、",
  "反復や沈黙そのものを選んでよい。その選択は内面の理由と、相手や場への手応えに結びつける。",
].join("\n");

const DialoguePipelineSettingsMetadataSchema = z.object({
  revision: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime().nullable().default(null),
  updatedBy: z.string().max(64).nullable().default(null),
});

export const DialoguePipelineSettingsSchema = z.discriminatedUnion(
  "schemaVersion",
  [
    DialoguePipelineValuesV1Schema.merge(DialoguePipelineSettingsMetadataSchema),
    DialoguePipelineValuesV2Schema.merge(DialoguePipelineSettingsMetadataSchema),
    DialoguePipelineValuesV3Schema.merge(DialoguePipelineSettingsMetadataSchema),
  ],
);
export type DialoguePipelineSettings = z.infer<typeof DialoguePipelineSettingsSchema>;

export const DialoguePipelineActivationSourceSchema = z.enum([
  "default",
  "persisted_setting",
  "deployment_override",
]);
export type DialoguePipelineActivationSource = z.infer<
  typeof DialoguePipelineActivationSourceSchema
>;

export const DialoguePipelineOverrideDeploymentSchema = z.object({
  commitSha: z.string().regex(/^[a-f0-9]{40}$/),
  artifactRef: z.string().regex(/^[^\s]+@sha256:[a-f0-9]{64}$/),
}).strict();
export type DialoguePipelineOverrideDeployment = z.infer<
  typeof DialoguePipelineOverrideDeploymentSchema
>;

export const UpdateDialoguePipelineSettingsSchema =
  DialoguePipelineCommonValuesSchema.extend({
    expectedRevision: z.number().int().nonnegative(),
    schemaVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  });
export type UpdateDialoguePipelineSettings = z.infer<
  typeof UpdateDialoguePipelineSettingsSchema
>;

/**
 * Battle-owned dialogue context policy. Operator edits apply to later battles;
 * an active battle consumes this snapshot rather than rereading global settings.
 */
const BattleDialoguePipelineSnapshotMetadataSchema = z.object({
  revision: z.number().int().nonnegative(),
});

export const BattleDialoguePipelineSnapshotSchema = z.discriminatedUnion(
  "schemaVersion",
  [
    DialoguePipelineValuesV1Schema
      .merge(BattleDialoguePipelineSnapshotMetadataSchema)
      .strict(),
    DialoguePipelineValuesV2Schema
      .merge(BattleDialoguePipelineSnapshotMetadataSchema)
      .strict(),
    DialoguePipelineValuesV3Schema
      .merge(BattleDialoguePipelineSnapshotMetadataSchema)
      .strict(),
  ],
);
export type BattleDialoguePipelineSnapshot = z.infer<
  typeof BattleDialoguePipelineSnapshotSchema
>;

/**
 * ADR-0028: V3 can only bind compact consciousness; default remains V1.
 */
export const BattleDialoguePipelineSnapshotV3Schema =
  DialoguePipelineCommonValuesSchema.extend({
    schemaVersion: z.literal(3),
    contextProjectionMode: z.literal("compact"),
    revision: z.number().int().nonnegative(),
  }).strict();
export type BattleDialoguePipelineSnapshotV3 = z.infer<
  typeof BattleDialoguePipelineSnapshotV3Schema
>;

export function snapshotDialoguePipelineSettings(
  settings: DialoguePipelineSettings,
): BattleDialoguePipelineSnapshot {
  return BattleDialoguePipelineSnapshotSchema.parse({
    schemaVersion: settings.schemaVersion,
    enabled: settings.enabled,
    conversationHistoryLimit: settings.conversationHistoryLimit,
    contextProjectionMode: settings.contextProjectionMode,
    recentExchangeLimit: settings.recentExchangeLimit,
    relevantMemoryLimit: settings.relevantMemoryLimit,
    psychologyGuidance: settings.psychologyGuidance,
    revision: settings.revision,
  });
}

export function defaultDialoguePipelineSettings(): Extract<DialoguePipelineSettings, { schemaVersion: 1 }> {
  return DialoguePipelineValuesV1Schema.merge(DialoguePipelineSettingsMetadataSchema).parse({
    schemaVersion: 1,
    enabled: true,
    conversationHistoryLimit: 12,
    contextProjectionMode: "legacy",
    recentExchangeLimit: 4,
    relevantMemoryLimit: 1,
    psychologyGuidance: DEFAULT_DIALOGUE_PSYCHOLOGY_GUIDANCE,
    revision: 0,
    updatedAt: null,
    updatedBy: null,
  });
}
