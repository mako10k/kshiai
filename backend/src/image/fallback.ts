import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
} from "./types.js";

export function createFallbackImageProvider(
  providers: ImageProvider[],
): ImageProvider {
  if (providers.length === 0) {
    throw new Error("image_provider_unavailable");
  }
  return {
    name: providers.map((provider) => provider.name).join("->"),
    async generate(
      request: ImageGenerationRequest,
    ): Promise<ImageGenerationResult> {
      let lastError: unknown;
      for (const provider of providers) {
        try {
          return await provider.generate(request);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error("image_generation_failed");
    },
  };
}
