import {
  classifyLlmProviderError,
  isLlmRateLimitResponse,
  providerRetryAfterMs,
  type LlmProviderFailureReason,
} from "./provider-errors.js";

type Sleep = (milliseconds: number) => Promise<void>;

export type LlmProviderRetryNotice = {
  reason: "rate_limit" | "service_unavailable";
  retry: number;
  delayMs: number;
};

type RetryOptions = {
  sleep?: Sleep;
  deadlineAt?: number;
  rateLimitOnly?: boolean;
  canRetry?: () => boolean;
  onRetry?: (notice: LlmProviderRetryNotice) => void;
};

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(
  error: unknown,
  reason: LlmProviderFailureReason,
  retry: number,
  respectFullDelay = false,
): number {
  const requested = providerRetryAfterMs(error, respectFullDelay ? Infinity : 10_000);
  if (requested !== null) return requested;
  return reason === "rate_limit"
    ? Math.min(1_000 * (2 ** (retry - 1)), 10_000)
    : 1_000;
}

/** Retry only within one provider. Provider routing remains an outer concern. */
export async function retryLlmProviderCall<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let totalRetries = 0;
  let rateLimitRetries = 0;
  let serviceUnavailableRetries = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      const reason = classifyLlmProviderError(error);
      const retryRateLimit = reason === "rate_limit" && (!options.rateLimitOnly || isLlmRateLimitResponse(error)) &&
        rateLimitRetries < 2 && totalRetries < 2;
      const retryServiceUnavailable = !options.rateLimitOnly && reason === "service_unavailable" &&
        serviceUnavailableRetries < 1 && totalRetries < 2;
      if (
        (!retryRateLimit && !retryServiceUnavailable) ||
        options.canRetry?.() === false
      ) {
        throw error;
      }

      totalRetries += 1;
      if (retryRateLimit) rateLimitRetries += 1;
      if (retryServiceUnavailable) serviceUnavailableRetries += 1;
      const delayMs = retryDelay(error, reason, totalRetries, options.deadlineAt !== undefined);
      if (options.deadlineAt !== undefined && Date.now() + delayMs >= options.deadlineAt) throw error;
      options.onRetry?.({
        reason,
        retry: totalRetries,
        delayMs,
      });
      await sleep(delayMs);
      if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) throw error;
    }
  }
}
