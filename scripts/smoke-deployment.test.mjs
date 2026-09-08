import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { waitForExpectedHealth } from "./smoke-deployment.mjs";

function healthResponse(revision) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        database: "postgres",
        auth: "supabase",
        ...(revision ? { revision } : {}),
      };
    },
  };
}

describe("waitForExpectedHealth", () => {
  it("waits for the expected revision and records stale observations", async () => {
    const responses = [healthResponse(undefined), healthResponse("expected")];
    const observations = [];
    let waits = 0;

    const body = await waitForExpectedHealth({
      url: "https://example.test/api/health",
      expectedRevision: "expected",
      attempts: 2,
      delayMs: 1,
      fetchHealth: async () => responses.shift(),
      wait: async () => {
        waits += 1;
      },
      observe: (message) => observations.push(message),
    });

    assert.equal(body.revision, "expected");
    assert.equal(waits, 1);
    assert.deepEqual(observations, [
      "Health convergence pending (1/2): status=200, revision=undefined",
    ]);
  });

  it("fails with every observed revision after the bounded horizon", async () => {
    const responses = [healthResponse("old-a"), healthResponse("old-b")];

    await assert.rejects(
      waitForExpectedHealth({
        url: "https://example.test/api/health",
        expectedRevision: "expected",
        attempts: 2,
        delayMs: 1,
        fetchHealth: async () => responses.shift(),
        wait: async () => {},
        observe: () => {},
      }),
      /status=200, revision=old-a; status=200, revision=old-b/,
    );
  });
});
