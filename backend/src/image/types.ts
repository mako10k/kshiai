export type ImageGenerationRequest = {
  prompt: string;
  aspectRatio: "1:1" | "16:9";
};

export type ImageGenerationResult = {
  sourceUrl: string;
};

export interface ImageProvider {
  readonly name: string;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
