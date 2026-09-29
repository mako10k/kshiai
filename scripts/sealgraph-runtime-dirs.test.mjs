// R: Verify that test setup restores only disposable SealGraph directories.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ensureSealGraphRuntimeDirectories } from "./sealgraph-runtime-dirs.mjs";

describe("SealGraph test runtime directories", () => {
  it("restores ignored directories around an existing repository", (context) => {
    const root = mkdtempSync(join(tmpdir(), "kshiai-sealgraph-runtime-"));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const graph = join(root, ".sealgraph");
    mkdirSync(join(graph, "objects"), { recursive: true });
    mkdirSync(join(graph, "refs"));
    writeFileSync(join(graph, "config"), "existing config\n");

    ensureSealGraphRuntimeDirectories(root);
    ensureSealGraphRuntimeDirectories(root);

    assert.equal(readFileSync(join(graph, "config"), "utf8"), "existing config\n");
    for (const name of ["index", "cache", "logs", "locks", "tmp"]) {
      assert.equal(existsSync(join(graph, name)), true);
    }
  });

  it("does not bootstrap an absent canonical repository", (context) => {
    const root = mkdtempSync(join(tmpdir(), "kshiai-sealgraph-absent-"));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    assert.throws(
      () => ensureSealGraphRuntimeDirectories(root),
      /SealGraph repository is incomplete: \.sealgraph\/config is missing/,
    );
    assert.equal(existsSync(join(root, ".sealgraph")), false);
  });
});
