// R: Verify governed test execution rejects missing Seals and an empty eligible set.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repositoryRoot, requireActiveTests, requireSealedTests, summarizeInventory } from "./test-authority.mjs";

function isolatedSelector(context, suite, mapped) {
  const root = mkdtempSync(join(tmpdir(), "kshiai-selector-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["scripts", "backend/src", "frontend/src", "packages/shared/src", "infra/cloudflare-worker/src", "e2e", "empty-path"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const file of ["test-authority.mjs", "prepare-test-authority-runtime.mjs", "sealgraph-runtime-dirs.mjs"]) {
    copyFileSync(join(repositoryRoot, "scripts", file), join(root, "scripts", file));
  }
  mkdirSync(join(root, ".sealgraph/objects"), { recursive: true });
  mkdirSync(join(root, ".sealgraph/refs"), { recursive: true });
  // Only the runtime directory guard is exercised; no SealGraph executable exists.
  writeFileSync(join(root, ".sealgraph/config"), "");
  const path = suite === "unit" ? "scripts/example.test.mjs" : "e2e/example.spec.ts";
  const marker = join(root, "executed");
  writeFileSync(join(root, path), 'import { writeFileSync } from "node:fs";\nwriteFileSync("executed", "ran");\n');
  writeFileSync(join(root, "scripts/test-authority-inventory.json"), JSON.stringify({
    schema: "kshiai/test-authority-inventory/v2",
    tests: mapped ? [{ path, ref: "verification/example" }] : [],
  }));
  return {
    path,
    marker,
    run(listOnly = false) {
      return spawnSync(process.execPath, [
        join(root, "scripts/test-authority.mjs"),
        ...(suite === "e2e" ? ["--e2e"] : []),
        ...(listOnly ? ["--list"] : []),
      ], {
        cwd: root,
        env: { ...process.env, PATH: join(root, "empty-path") },
        encoding: "utf8",
        timeout: 10_000,
      });
    },
  };
}

describe("test authority execution gate", () => {
  it("rejects a zero-test success", () => {
    assert.throws(() => requireActiveTests("unit", []), /No active unit tests/);
  });

  it("allows an eligible test set to execute", () => {
    assert.doesNotThrow(() => requireActiveTests("unit", [{ path: "example.test.ts" }]));
  });

  it("rejects unsealed tests even when eligible tests are present", () => {
    const inventory = [
      { path: "active.test.ts", state: "active", reason: "current", ref: "verification/active" },
      { path: "new.test.ts", state: "disabled", reason: "unsealed", ref: null },
    ];
    assert.throws(() => requireSealedTests("unit", inventory), /Unsealed unit tests block execution.*\nnew\.test\.ts \(unsealed\)/);
    assert.equal(summarizeInventory("unit", inventory).unsealed, 1);
  });

  it("rejects a mapped test whose verification Seal is unavailable", () => {
    assert.throws(() => requireSealedTests("e2e", [
      { path: "lost.spec.ts", state: "disabled", reason: "missing_ref", ref: "verification/lost" },
    ]), /Unsealed e2e tests block execution.*\nlost\.spec\.ts \(missing_ref\)/);
  });

  it("reports all blocking paths without treating other exclusions as unsealed", () => {
    const inventory = [
      { path: "new.test.ts", state: "disabled", reason: "unsealed", ref: null },
      { path: "lost.test.ts", state: "disabled", reason: "missing_ref", ref: "verification/lost" },
      { path: "old.test.ts", state: "disabled", reason: "stale", ref: "verification/old" },
    ];
    assert.throws(() => requireSealedTests("unit", inventory), (error) => {
      assert.match(error.message, /block execution \(2\)/);
      assert.match(error.message, /new\.test\.ts/);
      assert.match(error.message, /lost\.test\.ts/);
      assert.doesNotMatch(error.message, /old\.test\.ts/);
      return true;
    });
  });

  it("preserves the existing classification policy for sealed tests", () => {
    assert.doesNotThrow(() => requireSealedTests("unit", [
      { path: "active.test.ts", state: "active", reason: "current", ref: "verification/active" },
      { path: "draft.test.ts", state: "provisional", reason: "draft_basis", ref: "verification/draft" },
      { path: "old.test.ts", state: "disabled", reason: "stale", ref: "verification/old" },
    ]));
  });

  for (const suite of ["unit", "e2e"]) {
    it(`rejects an unmapped ${suite} file before invoking SealGraph or executing tests`, (context) => {
      const fixture = isolatedSelector(context, suite, false);
      const result = fixture.run();
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`TEST_PREFLIGHT suite=${suite} unsealed=1 authority_evaluated=false`));
      assert.ok(result.stderr.includes(`${fixture.path} (unsealed)`));
      assert.doesNotMatch(result.stderr, /ENOENT|TEST_SELECTION/);
      assert.equal(existsSync(fixture.marker), false);
      assert.doesNotMatch(result.stdout, /TAP version/);
    });
  }

  it("still attempts SealGraph inspection in list mode with unmapped files", (context) => {
    const fixture = isolatedSelector(context, "unit", false);
    const result = fixture.run(true);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sealgraph.*ENOENT/);
    assert.doesNotMatch(result.stderr, /TEST_PREFLIGHT/);
    assert.equal(existsSync(fixture.marker), false);
  });

  it("still requires SealGraph inspection when every file has a mapping", (context) => {
    const fixture = isolatedSelector(context, "unit", true);
    const result = fixture.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sealgraph.*ENOENT/);
    assert.doesNotMatch(result.stderr, /TEST_PREFLIGHT/);
    assert.equal(existsSync(fixture.marker), false);
  });
});
