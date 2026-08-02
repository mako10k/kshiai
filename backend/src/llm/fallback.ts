import type { LlmProvider } from "./types.js";

type Clock = () => number;

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function isQuotaLimitError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 429) return true;
  if (status !== 402 && status !== 403) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /credit|quota|spend|billing|usage limit|rate limit/i.test(message);
}

/**
 * Route every LlmProvider method through an ordered provider list.
 * Quota-limited providers are skipped in memory for the configured cooldown.
 */
export function createFallbackLlmProvider(
  providers: LlmProvider[],
  quotaCooldownMs: number,
  now: Clock = Date.now,
): LlmProvider {
  if (providers.length === 0) {
    throw new Error("At least one LLM provider is required");
  }
  const cooldownUntil = new Map<LlmProvider, number>();
  const label = providers.map((provider) => provider.name).join(">");

  const target = {
    name: `fallback:${label}`,
    models: providers[0]?.models,
  } as LlmProvider;

  return new Proxy(target, {
    get(_target, property) {
      if (property === "name") return `fallback:${label}`;
      if (property === "models") return providers[0]?.models;

      const candidateValue = Reflect.get(providers[0] as object, property);
      if (typeof candidateValue !== "function") return candidateValue;

      return async (...args: unknown[]) => {
        let lastError: unknown;
        for (const provider of providers) {
          const until = cooldownUntil.get(provider) ?? 0;
          if (until > now()) continue;
          const method = Reflect.get(provider as object, property);
          if (typeof method !== "function") continue;
          try {
            return await method.apply(provider, args);
          } catch (error) {
            lastError = error;
            if (isQuotaLimitError(error)) {
              cooldownUntil.set(provider, now() + quotaCooldownMs);
              console.warn(
                `[llm-router] ${provider.name} quota-limited; cooldown=${Math.round(quotaCooldownMs / 1000)}s`,
              );
            } else {
              console.warn(
                `[llm-router] ${provider.name} ${String(property)} failed; trying next provider`,
              );
            }
          }
        }
        throw lastError ?? new Error(`No provider implements ${String(property)}`);
      };
    },
  });
}
