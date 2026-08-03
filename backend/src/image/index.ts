import { config } from "../config.js";
import { createFallbackImageProvider } from "./fallback.js";
import { OpenAiCompatibleImageProvider } from "./openai-compatible.js";
import type { ImageProvider } from "./types.js";

export type { ImageProvider } from "./types.js";

export function createImageProvider(): ImageProvider {
  const providers = config.imageProviderOrder.flatMap(
    (name): ImageProvider[] => {
      if (name === "xai" && config.xai.apiKey && config.xai.imageModel) {
        return [
          new OpenAiCompatibleImageProvider(
            "xai",
            config.xai.apiKey,
            config.xai.baseUrl,
            config.xai.imageModel,
          ),
        ];
      }
      if (
        name === "venice" &&
        config.venice.apiKey &&
        config.venice.imageModel
      ) {
        return [
          new OpenAiCompatibleImageProvider(
            "venice",
            config.venice.apiKey,
            config.venice.baseUrl,
            config.venice.imageModel,
          ),
        ];
      }
      return [];
    },
  );
  return createFallbackImageProvider(providers);
}
