// R: Verify governed test execution rejects missing Seals and an empty eligible set.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repositoryRoot, requireActiveTests, requireSealedTests, requireCurrentTestAuthority, summarizeInventory } from "./test-authority.mjs";

function isolatedSelector(context, suite, mapped, authority = null) {
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
  if (authority) {
    const activePath = suite === "unit" ? "scripts/active.test.mjs" : "e2e/active.spec.ts";
    copyFileSync(join(root, path), join(root, activePath));
    writeFileSync(join(root, "scripts/test-authority-inventory.json"), JSON.stringify({
      schema: "kshiai/test-authority-inventory/v2",
      tests: [{ path, ref: "verification/example" }, { path: activePath, ref: "verification/active" }],
    }));
    const bin = join(root, "empty-path");
    symlinkSync(process.execPath, join(bin, "node"));
    writeFileSync(join(bin, "npx"), `#!${process.execPath}\nimport { writeFileSync } from "node:fs"; writeFileSync("executed", "playwright launched");\n`, { mode: 0o755 });
    writeFileSync(join(bin, "sealgraph"), `#!${process.execPath}
const args = process.argv.slice(2);
const ref = args[1];
if (args[0] === "stale") console.log(${JSON.stringify(authority === "stale" ? "verification/example" : "")});
else if (args[0] === "show") console.log(JSON.stringify({ seal: { seal_id: "b".repeat(64), cause_links: [{target_seal:"a".repeat(64)}], draft:false } }));
else if (args[0] === "source" && args[1] === "compare") console.log(JSON.stringify({ path: args[2] === "verification/example" ? ${JSON.stringify(path)} : ${JSON.stringify(activePath)}, relation: "WORKFILE_MATCHES_HEAD" }));
`, { mode: 0o755 });
  }
  return {
    path,
    marker,
    run(listOnly = false) {
      const environment = { ...process.env, PATH: join(root, "empty-path") };
      delete environment.NODE_TEST_CONTEXT;
      return spawnSync(process.execPath, [
        join(root, "scripts/test-authority.mjs"),
        ...(suite === "e2e" ? ["--e2e"] : []),
        ...(listOnly ? ["--list"] : []),
      ], {
        cwd: root,
        env: environment,
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

  it("rejects stale authority even with active tests present", () => {
    assert.throws(() => requireCurrentTestAuthority("unit", [
      { path: "active.test.ts", state: "active", reason: "current", ref: "verification/active" },
      { path: "old.test.ts", state: "disabled", reason: "stale", ref: "verification/old" },
    ]), /Invalid unit test authority blocks execution \(1\).*\nold\.test\.ts ref=verification\/old \(stale\)/);
  });

  it("rejects all invalid authority reasons and reports every path", () => {
    const reasons = ["stale", "source_diverged", "missing_or_wrong_source_binding", "missing_basis", "unsealed", "missing_ref", "future_invalid_reason"];
    const inventory = reasons.map((reason) => ({ path: `${reason}.test.ts`, state: "disabled", reason, ref: `verification/${reason}` }));
    assert.throws(() => requireCurrentTestAuthority("e2e", inventory), (error) => {
      assert.match(error.message, /blocks execution \(7\)/);
      for (const entry of inventory) assert.ok(error.message.includes(`${entry.path} ref=${entry.ref} (${entry.reason})`));
      return true;
    });
  });

  it("allows current tests and preserves provisional classification", () => {
    assert.doesNotThrow(() => requireCurrentTestAuthority("unit", [
      { path: "active.test.ts", state: "active", reason: "current" },
      { path: "draft.test.ts", state: "provisional", reason: "draft_basis" },
    ]));
  });

  for (const suite of ["unit", "e2e"]) {
    it(`fails the actual ${suite} selector on mixed active/stale authority without launching tests`, (context) => {
      const fixture = isolatedSelector(context, suite, true, "stale");
      const result = fixture.run();
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /active=1 provisional=0 disabled=1/);
      assert.match(result.stderr, /Invalid .* test authority blocks execution \(1\)/);
      assert.ok(result.stderr.includes(`${fixture.path} ref=verification/example (stale)`));
      assert.equal(existsSync(fixture.marker), false);
      assert.doesNotMatch(result.stdout, /TAP version/);
      const listed = fixture.run(true);
      assert.equal(listed.status, 0);
      const summary = JSON.parse(listed.stdout);
      assert.equal(summary.active, 1);
      assert.equal(summary.disabled, 1);
      assert.equal(existsSync(fixture.marker), false);
    });
  }

  it("still launches the actual unit selector when every test has current authority", (context) => {
    const fixture = isolatedSelector(context, "unit", true, "current");
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /TAP version/);
    assert.equal(existsSync(fixture.marker), true);
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
