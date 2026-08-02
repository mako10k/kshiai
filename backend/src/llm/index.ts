import { config } from "../config.js";
import { MockLlmProvider } from "./mock.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider } from "./types.js";

export function createLlmProvider(): LlmProvider {
  switch (config.llmProvider) {
    case "xai":
      return new OpenAiCompatibleProvider({
        name: "xai",
        apiKey: config.xai.apiKey,
        baseUrl: config.xai.baseUrl,
        modelEngine: config.xai.modelEngine,
        modelFast: config.xai.modelFast,
      });
    case "venice":
      return new OpenAiCompatibleProvider({
        name: "venice",
        apiKey: config.venice.apiKey,
        baseUrl: config.venice.baseUrl,
        modelEngine: config.venice.modelEngine,
        modelFast: config.venice.modelFast,
      });
    case "mock":
    default:
      return new MockLlmProvider();
  }
}
