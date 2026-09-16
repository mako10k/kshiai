import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  buildInventory,
  classifyTest,
  repositoryRoot,
} from "./test-authority.mjs";

const entry = { path: "backend/src/example.test.ts", ref: "verification/example" };
const current = {
  head_seal_id: "verification-seal",
  cause_links: [{ target_seal: "governing-basis" }],
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
    assert.equal(classifyTest(entry, { error: "missing" }).reason, "missing_ref");
    assert.equal(classifyTest(entry, { ...current, local_source: undefined }).reason,
      "missing_or_wrong_source_binding");
    assert.equal(classifyTest(entry, {
      ...current,
      local_source: { path: entry.path, relation: "WORKFILE_DIFFERS_FROM_HEAD" },
    }).reason, "source_diverged");
  });

  it("disables a sealed test that does not state a governing basis", () => {
    assert.equal(classifyTest(entry, { ...current, cause_links: [] }).reason,
      "missing_basis");
  });

  it("disables a discovered test that has no verification Seal mapping", () => {
    assert.deepEqual(buildInventory(
      [resolve(repositoryRoot, "backend/src/unsealed.test.ts")],
      [],
      [],
    ), [{
      path: "backend/src/unsealed.test.ts",
      state: "disabled",
      reason: "unsealed",
      ref: null,
    }]);
  });
});
