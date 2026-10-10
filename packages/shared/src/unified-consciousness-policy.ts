// R: Bind one finite operating contract and explicit model identity to each new battle.
import { z } from "zod";
export const UnifiedConsciousnessPolicySchema = z.object({
  revision: z.literal("unified-consciousness-policy-v1"),
  model: z.object({ provider: z.literal("openai"), model: z.literal("gpt-6-luna"), reasoning: z.literal("none") }).strict(),
  maxTicks: z.literal(36), maxCalls: z.literal(74), maxCallsPerSide: z.literal(37),
  concurrent: z.literal(2), outputTokens: z.literal(1000), deadlineMs: z.literal(60000),
  durationMs: z.literal(600000), inputCharacters: z.literal(24000),
  maxEvents: z.literal(128), eventCharacters: z.literal(16000), reassessmentTicks: z.literal(3),
  maxPhysicalAttempts: z.literal(200), maxPhysicalConcurrent: z.literal(6),
  repairs: z.literal(0), retries: z.literal(0), fallbacks: z.literal(0),
}).strict();
export type UnifiedConsciousnessPolicy = z.infer<typeof UnifiedConsciousnessPolicySchema>;
export const UnifiedConsciousnessPolicyV1: UnifiedConsciousnessPolicy = {
  revision: "unified-consciousness-policy-v1", model: { provider: "openai", model: "gpt-6-luna", reasoning: "none" },
  maxTicks: 36, maxCalls: 74, maxCallsPerSide: 37, concurrent: 2, outputTokens: 1000,
  deadlineMs: 60000, durationMs: 600000, inputCharacters: 24000, maxEvents: 128,
  eventCharacters: 16000, reassessmentTicks: 3, maxPhysicalAttempts: 200, maxPhysicalConcurrent: 6,
  repairs: 0, retries: 0, fallbacks: 0,
};
