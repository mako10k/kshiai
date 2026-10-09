import type { ImageGenerationResult } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function imageErrorDetail(text: string): string {
  const fallback = text.slice(0, 500);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (!isRecord(parsed)) return fallback;
  if (typeof parsed.error === "string") return parsed.error;
  if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
    return parsed.error.message;
  }
  return typeof parsed.message === "string" ? parsed.message : fallback;
}

export function decodeImageResponse(
  text: string,
  providerName: string,
): ImageGenerationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${providerName}_invalid_image_json`);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    throw new Error(`${providerName}_image_empty_response`);
  }
  const item: unknown = parsed.data[0];
  if (!isRecord(item)) throw new Error(`${providerName}_image_empty_response`);
  if (item.respect_moderation === false) {
    throw new Error(`${providerName}_moderation_filtered`);
  }
  if (typeof item.url === "string" && item.url) return { sourceUrl: item.url };
  if (typeof item.b64_json === "string" && item.b64_json) {
    return { sourceUrl: `data:image/jpeg;base64,${item.b64_json}` };
  }
  throw new Error(`${providerName}_image_empty_response`);
}
