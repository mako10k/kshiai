import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleRequest, type WorkerEnvironment } from "./index.js";

function environment(overrides: Partial<WorkerEnvironment> = {}): WorkerEnvironment {
  return {
    ASSETS: {
      async fetch() {
        return new Response("asset");
      },
    },
    BACKEND_ORIGIN: "https://backend.example.run.app",
    ORIGIN_SHARED_SECRET: "shared-secret",
    ...overrides,
  };
}

describe("Cloudflare frontend worker", () => {
  it("serves non-API requests from static assets", async () => {
    const response = await handleRequest(
      new Request("https://kshiai.example/characters/one"),
      environment(),
      async () => new Response("unexpected"),
    );
    assert.equal(await response.text(), "asset");
  });

  it("proxies API method, body, query, and protected origin headers", async () => {
    let upstream: Request | undefined;
    const response = await handleRequest(
      new Request("https://kshiai.example/api/battles/one?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kshiai-origin": "forged" },
        body: JSON.stringify({ turn: 1 }),
      }),
      environment(),
      async (request) => {
        upstream = request;
        return new Response("stream", { headers: { "Content-Type": "text/event-stream" } });
      },
    );
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(upstream?.url, "https://backend.example.run.app/api/battles/one?stream=1");
    assert.equal(upstream?.method, "POST");
    assert.equal(upstream?.headers.get("x-kshiai-origin"), "shared-secret");
    assert.equal(upstream?.headers.get("x-forwarded-host"), "kshiai.example");
    assert.equal(await upstream?.text(), JSON.stringify({ turn: 1 }));
  });

  it("fails closed when the backend binding is incomplete", async () => {
    const response = await handleRequest(
      new Request("https://kshiai.example/api/health"),
      environment({ ORIGIN_SHARED_SECRET: undefined }),
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
