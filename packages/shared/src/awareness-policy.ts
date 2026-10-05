// R: Define revision-bound awareness operating limits independent of battle state and transport.
import { z } from "zod";
const StandardPolicySchema = z.object({
  revision: z.enum(["awareness-v5-trial-v1", "awareness-v5-usage-v1"]),
  accountingMode: z.enum(["certified", "observed"]).optional(), maxTicks: z.literal(36),
  maxDurationMs: z.literal(180000), minTickIntervalMs: z.literal(1000),
  maxPhysicalAttempts: z.literal(200), maxCostUsd: z.literal(0.5), maxPhysicalConcurrent: z.literal(6),
  maxStimuli: z.literal(8), latentReassessmentTicks: z.literal(3), consciousReassessmentTicks: z.literal(6),
  consciousMinIntervalTicks: z.literal(3), maxApplicationRepairs: z.literal(1),
  transportRetries: z.literal(0), automaticFallbacks: z.literal(0),
  roles: z.object({
    subconscious: z.object({ inputTokens: z.literal(1800), outputTokens: z.literal(600), deadlineMs: z.literal(5000), concurrent: z.literal(2) }).strict(),
    conscious: z.object({ inputTokens: z.literal(4000), outputTokens: z.literal(1500), deadlineMs: z.literal(15000), concurrent: z.literal(2) }).strict(),
    adjudication: z.object({ inputTokens: z.literal(4000), outputTokens: z.literal(1500), deadlineMs: z.literal(10000), concurrent: z.literal(1) }).strict(),
    narration: z.object({ inputTokens: z.literal(4000), outputTokens: z.literal(1200), deadlineMs: z.literal(15000), concurrent: z.literal(1) }).strict(),
  }).strict(),
  budgetShares: z.object({ required: z.literal(0.6), conscious: z.literal(0.25), narration: z.literal(0.15) }).strict(),
  narration: z.object({ batchReceipts: z.literal(3), flushMs: z.literal(6000), publicationDeadlineMs: z.literal(36000), queueBeats: z.literal(12), terminalDrainMs: z.literal(15000) }).strict(),
}).strict();
const MeasurementPolicySchema = StandardPolicySchema.extend({
  revision: z.literal("awareness-v5-measurement-v1"), accountingMode: z.literal("observed"),
  maxDurationMs: z.literal(600000),
  roles: StandardPolicySchema.shape.roles.extend({
    subconscious: StandardPolicySchema.shape.roles.shape.subconscious.extend({ deadlineMs: z.literal(60000) }),
    conscious: StandardPolicySchema.shape.roles.shape.conscious.extend({ deadlineMs: z.literal(90000) }),
    adjudication: StandardPolicySchema.shape.roles.shape.adjudication.extend({ deadlineMs: z.literal(60000) }),
    narration: StandardPolicySchema.shape.roles.shape.narration.extend({ deadlineMs: z.literal(60000) }),
  }),
  narration: StandardPolicySchema.shape.narration.extend({ publicationDeadlineMs: z.literal(180000), terminalDrainMs: z.literal(90000) }),
}).strict();
const NormalPolicySchema = MeasurementPolicySchema.extend({ revision: z.literal("awareness-v5-usage-v2") }).strict();
export const AwarenessPolicyV1Schema = z.union([StandardPolicySchema, MeasurementPolicySchema, NormalPolicySchema]).superRefine((value, context) => {
  if ((value.revision !== "awareness-v5-trial-v1") !== (value.accountingMode === "observed")) {
    context.addIssue({ code: "custom", path: ["accountingMode"], message: "Accounting mode must match the immutable policy revision" });
  }
});
export type AwarenessPolicyV1 = z.infer<typeof AwarenessPolicyV1Schema>;
export const AwarenessDefaultPolicy: AwarenessPolicyV1 = {
  revision: "awareness-v5-trial-v1", maxTicks: 36, maxDurationMs: 180000, minTickIntervalMs: 1000,
  maxPhysicalAttempts: 200, maxCostUsd: 0.5, maxPhysicalConcurrent: 6, maxStimuli: 8,
  latentReassessmentTicks: 3, consciousReassessmentTicks: 6, consciousMinIntervalTicks: 3,
  maxApplicationRepairs: 1, transportRetries: 0, automaticFallbacks: 0,
  roles: { subconscious: { inputTokens: 1800, outputTokens: 600, deadlineMs: 5000, concurrent: 2 },
    conscious: { inputTokens: 4000, outputTokens: 1500, deadlineMs: 15000, concurrent: 2 },
    adjudication: { inputTokens: 4000, outputTokens: 1500, deadlineMs: 10000, concurrent: 1 },
    narration: { inputTokens: 4000, outputTokens: 1200, deadlineMs: 15000, concurrent: 1 } },
  budgetShares: { required: 0.6, conscious: 0.25, narration: 0.15 },
  narration: { batchReceipts: 3, flushMs: 6000, publicationDeadlineMs: 36000, queueBeats: 12, terminalDrainMs: 15000 },
};


/** Historical observed usage revision; existing bound battles retain these limits. */
export const AwarenessObservedPolicy: AwarenessPolicyV1 = {
  ...AwarenessDefaultPolicy,
  revision: "awareness-v5-usage-v1",
  accountingMode: "observed",
};

/** Explicit isolated measurement only; ordinary creation does not select this policy. */
export const AwarenessLongMeasurementPolicy: AwarenessPolicyV1 = MeasurementPolicySchema.parse({
  ...AwarenessObservedPolicy, revision: "awareness-v5-measurement-v1", maxDurationMs: 600000,
  roles: {
    subconscious: { ...AwarenessObservedPolicy.roles.subconscious, deadlineMs: 60000 },
    conscious: { ...AwarenessObservedPolicy.roles.conscious, deadlineMs: 90000 },
    adjudication: { ...AwarenessObservedPolicy.roles.adjudication, deadlineMs: 60000 },
    narration: { ...AwarenessObservedPolicy.roles.narration, deadlineMs: 60000 },
  },
  narration: { ...AwarenessObservedPolicy.narration, publicationDeadlineMs: 180000, terminalDrainMs: 90000 },
});

/** Ordinary new battles use the observed long timing; historical policies remain immutable. */
export const AwarenessNormalPolicy: AwarenessPolicyV1 = NormalPolicySchema.parse({
  ...AwarenessLongMeasurementPolicy, revision: "awareness-v5-usage-v2",
});
