import { decodeImageResponse, imageErrorDetail } from "./image-response.js";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
} from "./types.js";

type Fetch = typeof fetch;

export class OpenAiCompatibleImageProvider implements ImageProvider {
  constructor(
    readonly name: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async generate(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResult> {
    if (!request.prompt.trim()) throw new Error("empty_image_prompt");

    const response = await this.fetchImpl(
      `${this.baseUrl.replace(/\/$/, "")}/images/generations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: request.prompt.trim(),
          aspect_ratio: request.aspectRatio,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      const detail = imageErrorDetail(text);
      throw Object.assign(new Error(`${this.name}_${response.status}:${detail}`), {
        status: response.status,
      });
    }

    return decodeImageResponse(text, this.name);
  }
}
