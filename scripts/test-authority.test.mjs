import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  buildInventory,
  classifyTest,
  repositoryRoot,
  summarizeInventory,
} from "./test-authority.mjs";

const entry = { path: "backend/src/example.test.ts", ref: "verification/example" };
const current = {
  head_seal_id: "b".repeat(64),
  cause_links: [{ target_seal: "a".repeat(64) }],
  local_source: { path: entry.path, relation: "WORKFILE_MATCHES_HEAD" },
  stale: { self: false, direct_target_seal_ids: [], transitive_paths: [] },
  draft_basis: false,
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
    assert.equal(classifyTest(entry, { ...current, head_seal_id: "bad" }).reason,
      "missing_ref");
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
    assert.equal(classifyTest(entry, { ...current, cause_links: "bad" }).reason,
      "missing_basis");
    assert.equal(classifyTest(entry, { ...current, cause_links: [{}] }).reason,
      "missing_basis");
  });

  it("reports a draft verification Seal as provisional", () => {
    assert.deepEqual(classifyTest(entry, { ...current, draft_basis: true }),
      { state: "provisional", reason: "draft_basis" });
  });

  it("does not let draft override stale or changed source", () => {
    assert.equal(classifyTest(entry, {
      ...current,
      draft_basis: true,
      stale: { ...current.stale, transitive_paths: [["old"]] },
    }).reason, "stale");
    assert.equal(classifyTest(entry, {
      ...current,
      draft_basis: true,
      local_source: { path: entry.path, relation: "WORKFILE_DIFFERS_FROM_HEAD" },
    }).reason, "source_diverged");
  });

  it("disables a SealGraph response without a boolean draft flag", () => {
    assert.equal(classifyTest(entry, { ...current, draft_basis: undefined }).reason,
      "missing_basis");
    assert.equal(classifyTest(entry, { ...current, draft_basis: "false" }).state,
      "disabled");
  });

  it("counts provisional tests separately and excludes them from active execution", () => {
    const [draft] = buildInventory(
      [resolve(repositoryRoot, entry.path)],
      [entry],
      [{ ref: entry.ref, ...current, draft_basis: true }],
    );
    const inventory = [
      { path: "active.test.ts", state: "active", ref: "verification/active" },
      draft,
      { path: "unsealed.test.ts", state: "disabled", ref: null },
    ];
    const summary = summarizeInventory("unit", inventory);
    assert.deepEqual(
      [summary.discovered, summary.active, summary.provisional, summary.disabled],
      [3, 1, 1, 1],
    );
    assert.deepEqual(inventory.filter((item) => item.state === "active").map((item) => item.path),
      ["active.test.ts"]);
    assert.deepEqual(draft, { path: entry.path, ref: entry.ref,
      state: "provisional", reason: "draft_basis" });
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
