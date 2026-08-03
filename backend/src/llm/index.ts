import { config } from "../config.js";
import { MockLlmProvider } from "./mock.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import { createFallbackLlmProvider } from "./fallback.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider } from "./types.js";

export function createLlmProvider(): LlmProvider {
  const providers = config.llmProviderOrder.flatMap((name): LlmProvider[] => {
    switch (name) {
      case "xai":
        return config.xai.apiKey ? [new OpenAiCompatibleProvider({
        name: "xai",
        apiKey: config.xai.apiKey,
        baseUrl: config.xai.baseUrl,
        modelEngine: config.xai.modelEngine,
        modelFast: config.xai.modelFast,
        fallbackOnError: false,
      })] : [];
      case "openai":
        return config.openai.apiKey ? [new OpenAiCompatibleProvider({
          name: "openai",
          apiKey: config.openai.apiKey,
          baseUrl: config.openai.baseUrl,
          modelEngine: config.openai.modelEngine,
          modelFast: config.openai.modelFast,
          fallbackOnError: false,
        })] : [];
      case "venice":
        return config.venice.apiKey ? [new OpenAiCompatibleProvider({
        name: "venice",
        apiKey: config.venice.apiKey,
        baseUrl: config.venice.baseUrl,
        modelEngine: config.venice.modelEngine,
        modelFast: config.venice.modelFast,
        fallbackOnError: false,
        timeoutMultiplier: 1.75,
      })] : [];
      case "mock":
        return config.allowMockProvider ? [new MockLlmProvider()] : [];
      default:
        return [];
    }
  });
  if (providers.length === 0) {
    throw new Error(
      "No usable LLM provider is configured. Set provider credentials, or explicitly select mock outside production.",
    );
  }
  return createFallbackLlmProvider(providers, config.llmQuotaCooldownMs);
}
