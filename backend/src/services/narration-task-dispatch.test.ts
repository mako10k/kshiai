import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../config.js";
import { enqueueNarrationTask } from "./narration-task-dispatch.js";

describe("narration task dispatch", () => {
  it("uses a deterministic Cloud Task with OIDC and accepts duplicate enqueue", async () => {
    const prior = { ...config.narrationTaskQueue };
    Object.assign(config.narrationTaskQueue, {
      configured: true,
      project: "project-a",
      location: "region-a",
      queue: "queue-a",
      targetUrl: "https://example.test/api/internal/narration/task",
      serviceAccountEmail: "worker@example.test",
      audience: "https://example.test/api/internal/narration/task",
    });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.startsWith("http://metadata.google.internal/")) {
        return Response.json({ access_token: "metadata-token" });
      }
      return new Response(null, { status: 409 });
    }) as typeof fetch;

    try {
      await enqueueNarrationTask({
        outboxId: "outbox-1",
        battleId: "battle-1",
        receiptId: "receipt-1",
      }, fetchImpl);
    } finally {
      Object.assign(config.narrationTaskQueue, prior);
    }

    assert.equal(requests.length, 2);
    assert.equal(
      requests[1]?.url,
      "https://cloudtasks.googleapis.com/v2/projects/project-a/locations/region-a/queues/queue-a/tasks",
    );
    assert.equal(
      new Headers(requests[1]?.init?.headers).get("Authorization"),
      "Bearer metadata-token",
    );
    const body = JSON.parse(String(requests[1]?.init?.body)) as {
      task: { name: string; httpRequest: { oidcToken: { audience: string } } };
    };
    assert.match(body.task.name, /\/tasks\/narration-[a-f0-9]{64}$/);
    assert.equal(
      body.task.httpRequest.oidcToken.audience,
      "https://example.test/api/internal/narration/task",
    );
  });
});
