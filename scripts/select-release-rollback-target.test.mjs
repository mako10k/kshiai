import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  selectActiveCloudRunRevision,
  selectActiveWorkerVersion,
} from "./select-release-rollback-target.mjs";

describe("release rollback target selection", () => {
  it("selects the sole 100% Cloud Run revision independently of tag order", () => {
    const service = {
      status: {
        traffic: [
          { revisionName: "oldest", tag: "release-oldest" },
          { revisionName: "current", percent: 100 },
          { revisionName: "staged", tag: "stage-current" },
        ],
      },
    };

    assert.equal(selectActiveCloudRunRevision(service), "current");
  });

  it("selects the sole 100% Worker version", () => {
    const deployment = {
      versions: [
        { version_id: "candidate", percentage: 0 },
        { version_id: "current", percentage: 100 },
      ],
    };

    assert.equal(selectActiveWorkerVersion(deployment), "current");
  });

  it("rejects ambiguous or missing full-traffic targets", () => {
    assert.throws(
      () =>
        selectActiveCloudRunRevision({
          status: {
            traffic: [
              { revisionName: "one", percent: 100 },
              { revisionName: "two", percent: 100 },
            ],
          },
        }),
      /exactly one 100% Cloud Run target, received 2/,
    );
    assert.throws(
      () => selectActiveWorkerVersion({ versions: [] }),
      /exactly one 100% Worker target, received 0/,
    );
  });
});
