import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFallbackImageProvider } from "./fallback.js";
import { OpenAiCompatibleImageProvider } from "./openai-compatible.js";
import type { ImageProvider } from "./types.js";

describe("OpenAI-compatible image provider", () => {
  it("sends the configured model and aspect ratio", async () => {
    let requestBody: unknown;
    const provider = new OpenAiCompatibleImageProvider(
      "test",
      "secret",
      "https://images.example/v1/",
      "image-model",
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: [{ url: "https://cdn.example/image.jpg" }] }));
      },
    );

    const result = await provider.generate({
      prompt: "A wide arena",
      aspectRatio: "16:9",
    });

    assert.equal(result.sourceUrl, "https://cdn.example/image.jpg");
    assert.deepEqual(requestBody, {
      model: "image-model",
      prompt: "A wide arena",
      aspect_ratio: "16:9",
    });
  });

  it("falls through to the next image provider", async () => {
    const calls: string[] = [];
    const failing: ImageProvider = {
      name: "first",
      async generate() {
        calls.push("first");
        throw new Error("unavailable");
      },
    };
    const succeeding: ImageProvider = {
      name: "second",
      async generate() {
        calls.push("second");
        return { sourceUrl: "data:image/jpeg;base64,abc" };
      },
    };

    const result = await createFallbackImageProvider([
      failing,
      succeeding,
    ]).generate({ prompt: "arena", aspectRatio: "1:1" });

    assert.deepEqual(calls, ["first", "second"]);
    assert.equal(result.sourceUrl, "data:image/jpeg;base64,abc");
  });
});
