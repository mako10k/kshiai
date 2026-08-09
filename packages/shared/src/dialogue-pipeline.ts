import { z } from "zod";

/**
 * Operator-authored, runtime dialogue policy. It guides LLM-authored
 * character psychology only; deterministic combat and canonical facts never
 * read this as a mechanical rule.
 */
export const DialoguePipelineValuesSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean().default(true),
  conversationHistoryLimit: z.number().int().min(4).max(24).default(12),
  psychologyGuidance: z.string().min(1).max(3_000),
});
export type DialoguePipelineValues = z.infer<typeof DialoguePipelineValuesSchema>;

export const DEFAULT_DIALOGUE_PSYCHOLOGY_GUIDANCE = [
  "キャラクターは言葉を、相手との関係や場に働きかける行為として受け止める。",
  "通じない表現が重なると、通常はその効力が薄れたと感じ、目的や気分に合う別の角度を探す。",
  "ただし執着、儀式、信念、威圧、不調などがそのキャラクター自身の根拠になるなら、",
  "反復や沈黙そのものを選んでよい。その選択は内面の理由と、相手や場への手応えに結びつける。",
].join("\n");

export const DialoguePipelineSettingsSchema = DialoguePipelineValuesSchema.extend({
  revision: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime().nullable().default(null),
  updatedBy: z.string().max(64).nullable().default(null),
});
export type DialoguePipelineSettings = z.infer<typeof DialoguePipelineSettingsSchema>;

export const UpdateDialoguePipelineSettingsSchema = DialoguePipelineValuesSchema
  .omit({ schemaVersion: true })
  .extend({
    expectedRevision: z.number().int().nonnegative(),
  });
export type UpdateDialoguePipelineSettings = z.infer<
  typeof UpdateDialoguePipelineSettingsSchema
>;

export function defaultDialoguePipelineSettings(): DialoguePipelineSettings {
  return DialoguePipelineSettingsSchema.parse({
    schemaVersion: 1,
    enabled: true,
    conversationHistoryLimit: 12,
    psychologyGuidance: DEFAULT_DIALOGUE_PSYCHOLOGY_GUIDANCE,
    revision: 0,
    updatedAt: null,
    updatedBy: null,
  });
}
