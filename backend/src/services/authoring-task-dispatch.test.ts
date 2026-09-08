import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../config.js";
import { enqueueAuthoringTask } from "./authoring-task-dispatch.js";

describe("authoring task dispatch", () => {
  it("uses a deterministic global-queue task with an authoring-specific audience", async () => {
    const prior = { ...config.authoringTaskQueue };
    Object.assign(config.authoringTaskQueue, {
      configured: true,
      project: "project-a",
      location: "region-a",
      queue: "global-queue-a",
      targetUrl: "https://example.test/api/internal/authoring/task",
      serviceAccountEmail: "worker@example.test",
      audience: "https://example.test/api/internal/authoring/task",
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
      await enqueueAuthoringTask({
        outboxId: "authoring-outbox:character:attempt-1",
        family: "character",
        attemptId: "attempt-1",
        deliveryGeneration: 3,
      }, fetchImpl);
    } finally {
      Object.assign(config.authoringTaskQueue, prior);
    }

    assert.equal(requests.length, 2);
    assert.equal(
      requests[1]?.url,
      "https://cloudtasks.googleapis.com/v2/projects/project-a/locations/region-a/queues/global-queue-a/tasks",
    );
    const body = JSON.parse(String(requests[1]?.init?.body)) as {
      task: {
        name: string;
        httpRequest: {
          url: string;
          body: string;
          oidcToken: { audience: string };
        };
      };
    };
    assert.match(body.task.name, /\/tasks\/authoring-[a-f0-9]{64}$/);
    assert.equal(
      body.task.httpRequest.url,
      "https://example.test/api/internal/authoring/task",
    );
    assert.equal(
      body.task.httpRequest.oidcToken.audience,
      "https://example.test/api/internal/authoring/task",
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(body.task.httpRequest.body, "base64").toString("utf8")),
      {
        outboxId: "authoring-outbox:character:attempt-1",
        family: "character",
        attemptId: "attempt-1",
        deliveryGeneration: 3,
      },
    );
  });
});
