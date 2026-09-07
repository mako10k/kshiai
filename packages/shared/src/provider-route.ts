import { z } from "zod";

export const LlmProviderRouteFailureSchema = z.object({
  provider: z.string().min(1).max(120),
  reason: z.enum(["billing", "dns"]),
  disposition: z.enum(["failed", "cooldown_active"]),
  cooldownMs: z.number().int().nonnegative().max(86_400_000),
}).strict();
export type LlmProviderRouteFailure = z.infer<
  typeof LlmProviderRouteFailureSchema
>;

/** Bounded routing metadata only; prompts, output, and error text are excluded. */
export const LlmProviderRouteReceiptSchema = z.object({
  operation: z.string().min(1).max(80),
  failures: z.array(LlmProviderRouteFailureSchema).min(1).max(8),
  /** Null means every configured provider was unavailable. */
  selectedProvider: z.string().min(1).max(120).nullable(),
}).strict();
export type LlmProviderRouteReceipt = z.infer<
  typeof LlmProviderRouteReceiptSchema
>;
