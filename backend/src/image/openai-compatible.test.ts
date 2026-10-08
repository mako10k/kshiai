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

describe("image response contract", () => {
  it("rejects non-string URL and base64 fields before returning a result", async () => {
    for (const item of [{ url: 123 }, { b64_json: { encoded: "abc" } }]) {
      const provider = new OpenAiCompatibleImageProvider(
        "test", "fixture", "https://example.invalid", "fixture",
        async () => new Response(JSON.stringify({ data: [item] })),
      );
      await assert.rejects(
        provider.generate({ prompt: "fixture", aspectRatio: "1:1" }),
        /test_image_empty_response/,
      );
    }
  });

  it("preserves valid base64 responses and moderation rejection", async () => {
    const provider = new OpenAiCompatibleImageProvider(
      "test", "fixture", "https://example.invalid", "fixture",
      async () => new Response(JSON.stringify({ data: [{ b64_json: "YWJj" }] })),
    );
    assert.deepEqual(
      await provider.generate({ prompt: "fixture", aspectRatio: "1:1" }),
      { sourceUrl: "data:image/jpeg;base64,YWJj" },
    );
    const moderated = new OpenAiCompatibleImageProvider(
      "test", "fixture", "https://example.invalid", "fixture",
      async () => new Response(JSON.stringify({
        data: [{ url: "https://example.invalid/image", respect_moderation: false }],
      })),
    );
    await assert.rejects(
      moderated.generate({ prompt: "fixture", aspectRatio: "1:1" }),
      /test_moderation_filtered/,
    );
  });
});

it("preserves structured HTTP errors and bounded raw error diagnostics", async () => {
  for (const [body, detail] of [
    [JSON.stringify({ error: "rejected" }), "rejected"],
    [JSON.stringify({ error: { message: "nested" } }), "nested"],
    [JSON.stringify({ message: "plain" }), "plain"],
    ["x".repeat(600), "x".repeat(500)],
  ]) {
    const provider = new OpenAiCompatibleImageProvider(
      "test", "fixture", "https://example.invalid", "fixture",
      async () => new Response(body, { status: 400 }),
    );
    await assert.rejects(
      provider.generate({ prompt: "fixture", aspectRatio: "1:1" }),
      { message: `test_400:${detail}`, status: 400 },
    );
  }
});
