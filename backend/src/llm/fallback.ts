import { AsyncLocalStorage } from "node:async_hooks";
import {
  LlmProviderRouteReceiptSchema,
  type LlmProviderRouteFailure,
  type LlmProviderRouteReceipt,
} from "@kshiai/shared";
import type { LlmProvider } from "./types.js";
import { classifyLlmProviderError } from "./provider-errors.js";

type Clock = () => number;

const routeReceiptCapture = new AsyncLocalStorage<LlmProviderRouteReceipt[]>();
const MAX_RECORDED_COOLDOWN_MS = 86_400_000;

function boundedRouteLabel(value: string): string {
  return value.trim().slice(0, 120) || "unknown";
}

export function withLlmProviderRouteReceiptCapture<T>(
  receipts: LlmProviderRouteReceipt[],
  action: () => Promise<T>,
): Promise<T> {
  return routeReceiptCapture.run(receipts, action);
}

function recordProviderRoute(input: {
  operation: PropertyKey;
  failures: LlmProviderRouteFailure[];
  selectedProvider: string | null;
}): void {
  if (input.failures.length === 0) return;
  const receipt = LlmProviderRouteReceiptSchema.parse({
    operation: String(input.operation).slice(0, 80),
    failures: input.failures.slice(-8),
    selectedProvider: input.selectedProvider
      ? boundedRouteLabel(input.selectedProvider)
      : null,
  });
  routeReceiptCapture.getStore()?.push(receipt);
}

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
  const cooldowns = new Map<LlmProvider, {
    until: number;
    reason: "billing" | "dns";
  }>();
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
        const failures: LlmProviderRouteFailure[] = [];
        for (const provider of providers) {
          const currentTime = now();
          const cooldown = cooldowns.get(provider);
          if (cooldown && cooldown.until > currentTime) {
            failures.push({
              provider: boundedRouteLabel(provider.name),
              reason: cooldown.reason,
              disposition: "cooldown_active",
              cooldownMs: Math.min(
                cooldown.until - currentTime,
                MAX_RECORDED_COOLDOWN_MS,
              ),
            });
            continue;
          }
          const method = Reflect.get(provider as object, property);
          if (typeof method !== "function") continue;
          try {
            const value = await method.apply(provider, args);
            recordProviderRoute({
              operation: property,
              failures,
              selectedProvider: provider.name,
            });
            return value;
          } catch (error) {
            lastError = error;
            const reason = classifyLlmProviderError(error);
            if (isProviderUnavailableError(error)) {
              const unavailableReason = reason === "billing" ? "billing" : "dns";
              cooldowns.set(provider, {
                until: now() + providerCooldownMs,
                reason: unavailableReason,
              });
              failures.push({
                provider: boundedRouteLabel(provider.name),
                reason: unavailableReason,
                disposition: "failed",
                cooldownMs: Math.min(
                  providerCooldownMs,
                  MAX_RECORDED_COOLDOWN_MS,
                ),
              });
              console.warn(
                `[llm-router] ${provider.name} unavailable reason=${reason}; cooldown=${Math.round(providerCooldownMs / 1000)}s; trying next provider`,
              );
            } else {
              recordProviderRoute({
                operation: property,
                failures,
                selectedProvider: provider.name,
              });
              console.warn(
                `[llm-router] ${provider.name} ${String(property)} failed reason=${reason}; provider fallback disabled`,
              );
              throw error;
            }
          }
        }
        recordProviderRoute({
          operation: property,
          failures,
          selectedProvider: null,
        });
        throw lastError ?? new Error(`No provider implements ${String(property)}`);
      };
    },
  });
}
