import type { LlmProvider } from "./types.js";
import { classifyLlmProviderError } from "./provider-errors.js";

type Clock = () => number;

export function isProviderUnavailableError(error: unknown): boolean {
  const reason = classifyLlmProviderError(error);
  return reason === "billing" || reason === "dns";
}

/**
 * Route every LlmProvider method through an ordered provider list.
 * Only provider-unavailable DNS or billing failures enter cooldown and permit
 * the next provider. Timeout, 429, 503, and operation errors remain terminal.
 */
export function createFallbackLlmProvider(
  providers: LlmProvider[],
  providerCooldownMs: number,
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
            const reason = classifyLlmProviderError(error);
            if (isProviderUnavailableError(error)) {
              cooldownUntil.set(provider, now() + providerCooldownMs);
              console.warn(
                `[llm-router] ${provider.name} unavailable reason=${reason}; cooldown=${Math.round(providerCooldownMs / 1000)}s; trying next provider`,
              );
            } else {
              console.warn(
                `[llm-router] ${provider.name} ${String(property)} failed reason=${reason}; provider fallback disabled`,
              );
              throw error;
            }
          }
        }
        throw lastError ?? new Error(`No provider implements ${String(property)}`);
      };
    },
  });
}
