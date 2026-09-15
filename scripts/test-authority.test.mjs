import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTest } from "./test-authority.mjs";

const entry = { path: "backend/src/example.test.ts", ref: "verification/example" };
const current = {
  local_source: { path: entry.path, relation: "WORKFILE_MATCHES_HEAD" },
  stale: { self: false, direct_target_seal_ids: [], transitive_paths: [] },
};

describe("SealGraph test authority", () => {
  it("keeps a source-matched non-stale test active", () => {
    assert.deepEqual(classifyTest(entry, current), { state: "active", reason: "current" });
  });

  it("disables direct and transitive stale tests", () => {
    assert.equal(classifyTest(entry, {
      ...current,
      stale: { ...current.stale, direct_target_seal_ids: ["old"] },
    }).reason, "stale");
    assert.equal(classifyTest(entry, {
      ...current,
      stale: { ...current.stale, transitive_paths: [["old"]] },
    }).reason, "stale");
  });

  it("disables missing, misbound, and source-diverged verification", () => {
    assert.equal(classifyTest(entry, undefined).reason, "missing_ref");
    assert.equal(classifyTest(entry, { ...current, local_source: undefined }).reason,
      "missing_or_wrong_source_binding");
    assert.equal(classifyTest(entry, {
      ...current,
      local_source: { path: entry.path, relation: "WORKFILE_DIFFERS_FROM_HEAD" },
    }).reason, "source_diverged");
  });
});
