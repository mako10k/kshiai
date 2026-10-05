// R: Record physical provider completion independently of parsing and domain acceptance.
import { observePhysicalAttemptStarted, observePhysicalResponseCompleted } from "../llm/llm-physical-completion.js";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { currentLlmUsageScope } from "../llm/llm-usage-context.js";
import { classifyLlmProviderError } from "../llm/provider-errors.js";
import { finishLlmUsageAttempt, startLlmUsageAttempt, type LlmResponseDiagnostics } from "./llm-usage.js";
export type LlmUsageReceipt = { usage?: unknown; responseModel?: string | null; requestId?: string | null; responseDiagnostics?: LlmResponseDiagnostics | null };
export async function observeLlmPhysicalAttempt<T>(input: { callId: string; attemptOrdinal: number; provider: string; requestedModel: string; role: string }, send: () => Promise<T>, receipt: (result: T) => LlmUsageReceipt, failureReceipt?: () => LlmUsageReceipt): Promise<T> {
  const monotonicStartedAt = performance.now();
  const inherited = currentLlmUsageScope();
  const id = await startLlmUsageAttempt({ ...input, startedAt: Date.now(), scope: { role: input.role, ...inherited } });
  let result: T;
  observePhysicalAttemptStarted();
  try { result = await send(); } catch (error) {
    const reason = classifyLlmProviderError(error);
    const metadata = z.object({ requestID: z.string().nullable().optional() }).passthrough().safeParse(error);
    await finishLlmUsageAttempt({ id, requestId: metadata.success ? metadata.data.requestID : null, status: reason === "timeout" ? "timeout" : "failed", finishedAt: Date.now(), elapsedMs: performance.now() - monotonicStartedAt, errorClass: reason, ...failureReceipt?.() });
    throw error;
  }
  observePhysicalResponseCompleted();
  await finishLlmUsageAttempt({ id, status: "completed", finishedAt: Date.now(), elapsedMs: performance.now() - monotonicStartedAt, ...receipt(result) });
  return result;
}
