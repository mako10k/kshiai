// R: Bind turn-only budgets and models without importing historical battle schemas.
import { z } from "zod";
export const ReservedTurnPromptRevisionSchema = z.enum(["reserved-turn-prompt-v1", "reserved-turn-prompt-v2", "reserved-turn-prompt-v3"]);
export type ReservedTurnPromptRevision = z.infer<typeof ReservedTurnPromptRevisionSchema>;
const id = z.string().min(1).max(160);
const ReservedTurnPolicyV1Schema = z.object({
  revision: z.literal("reserved-turn-policy-v1"),
  maxTurns: z.number().int().min(1).max(100),
  maxReservations: z.literal(5),
  maxLogicalCallsPerTurn: z.literal(4),
  maxPhysicalAttempts: z.number().int().positive().max(500),
  durationMs: z.number().int().positive(),
  deadlineMs: z.number().int().positive(),
  characterOutputTokens: z.number().int().positive(),
  adjudicationOutputTokens: z.number().int().positive(),
  inputCharacters: z.number().int().positive(),
  character: z.object({ provider: id, model: id }).strict(),
  adjudication: z.object({ provider: id, model: id }).strict(),
  narration: z.object({ provider: id, model: id }).strict(),
}).strict();
const ReservedTurnPolicyV2Schema = ReservedTurnPolicyV1Schema.extend({
  revision: z.literal("reserved-turn-policy-v2"),
  adjudicationDeadlineMs: z.number().int().positive(),
});
const ReservedTurnPolicyV3Schema = ReservedTurnPolicyV2Schema.extend({
  revision: z.literal("reserved-turn-policy-v3"),
  softDurationMs: z.number().int().positive(),
  softDeadlineMs: z.number().int().positive(),
  softAdjudicationDeadlineMs: z.number().int().positive(),
});
export const ReservedTurnPolicySchema = z.discriminatedUnion("revision", [ReservedTurnPolicyV1Schema, ReservedTurnPolicyV2Schema, ReservedTurnPolicyV3Schema]).superRefine((policy, ctx) => {
  if (policy.revision !== "reserved-turn-policy-v3") return;
  for (const [soft, hard] of [[policy.softDurationMs, policy.durationMs], [policy.softDeadlineMs, policy.deadlineMs], [policy.softAdjudicationDeadlineMs, policy.adjudicationDeadlineMs]]) {
    if (soft > hard) ctx.addIssue({ code: "custom", message: "Soft limit exceeds hard limit" });
  }
});
export type ReservedTurnPolicy = z.infer<typeof ReservedTurnPolicySchema>;
