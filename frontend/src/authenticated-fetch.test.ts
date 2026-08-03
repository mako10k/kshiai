import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authenticatedFetch } from "./authenticated-fetch.js";

describe("authenticatedFetch", () => {
  it("adds the current access token to requests including SSE posts", async () => {
    let captured: RequestInit | undefined;
    const response = await authenticatedFetch(
      "/api/battles/example/advance/stream",
      {
        method: "POST",
        headers: { Accept: "text/event-stream" },
      },
      async () => "current-token",
      async (_input, init) => {
        captured = init;
        return new Response(null, { status: 200 });
      },
    );

    assert.equal(response.status, 200);
    assert.equal(new Headers(captured?.headers).get("Authorization"), "Bearer current-token");
    assert.equal(new Headers(captured?.headers).get("Accept"), "text/event-stream");
    assert.equal(captured?.credentials, "include");
  });

  it("preserves an explicitly supplied authorization header", async () => {
    let captured: RequestInit | undefined;
    let tokenRequested = false;
    await authenticatedFetch(
      "/api/example",
      { headers: { Authorization: "Bearer explicit-token" } },
      async () => {
        tokenRequested = true;
        return "ignored-token";
      },
      async (_input, init) => {
        captured = init;
        return new Response(null, { status: 200 });
      },
    );

    assert.equal(tokenRequested, false);
    assert.equal(new Headers(captured?.headers).get("Authorization"), "Bearer explicit-token");
  });
});
