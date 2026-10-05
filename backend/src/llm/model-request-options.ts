// R: Select typed Chat Completions options for explicitly supported model identities.
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions.js";

type ModelRequestOptions = Pick<
  ChatCompletionCreateParamsNonStreaming,
  "reasoning_effort" | "temperature" | "max_completion_tokens"
>;

export function modelRequestOptions(input: {
  provider: string;
  model: string;
  supportsTemperature: boolean;
  temperature: number;
  maxCompletionTokens?: number;
}): ModelRequestOptions {
  if (input.maxCompletionTokens !== undefined &&
    (!Number.isSafeInteger(input.maxCompletionTokens) || input.maxCompletionTokens <= 0)) {
    throw new Error("maxCompletionTokens must be a positive safe integer");
  }
  const luna = input.provider === "openai" && input.model === "gpt-6-luna";
  const noReasoning = luna ||
    (input.provider === "xai" && input.model === "grok-4.3");
  return {
    ...(noReasoning ? { reasoning_effort: "none" } : {}),
    ...(input.supportsTemperature && !luna ? { temperature: input.temperature } : {}),
    ...(input.maxCompletionTokens !== undefined
      ? { max_completion_tokens: input.maxCompletionTokens }
      : {}),
  };
}
