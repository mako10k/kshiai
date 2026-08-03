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
      let detail = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text) as {
          error?: string | { message?: string };
          message?: string;
        };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
        else if (parsed.message) detail = parsed.message;
      } catch {
        // Preserve the bounded response body for diagnostics.
      }
      throw Object.assign(new Error(`${this.name}_${response.status}:${detail}`), {
        status: response.status,
      });
    }

    let parsed: {
      data?: Array<{
        url?: string;
        b64_json?: string;
        respect_moderation?: boolean;
      }>;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new Error(`${this.name}_invalid_image_json`);
    }
    const item = parsed.data?.[0];
    if (item?.respect_moderation === false) {
      throw new Error(`${this.name}_moderation_filtered`);
    }
    if (item?.url) return { sourceUrl: item.url };
    if (item?.b64_json) {
      return { sourceUrl: `data:image/jpeg;base64,${item.b64_json}` };
    }
    throw new Error(`${this.name}_image_empty_response`);
  }
}
