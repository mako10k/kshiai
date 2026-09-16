import { execFile, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptsDir, "..");
const execFileAsync = promisify(execFile);

export function isStale(status) {
  return Boolean(
    status?.stale === true
      || status?.stale?.self
      || status?.stale?.direct_target_seal_ids?.length
      || status?.stale?.transitive_paths?.length,
  );
}

export function classifyTest(entry, status) {
  if (!status || status.error || !status.head_seal_id) {
    return { state: "disabled", reason: "missing_ref" };
  }
  if (status.local_source?.path !== entry.path) {
    return { state: "disabled", reason: "missing_or_wrong_source_binding" };
  }
  if (status.local_source.relation !== "WORKFILE_MATCHES_HEAD") {
    return { state: "disabled", reason: "source_diverged" };
  }
  if (!status.cause_links?.length) {
    return { state: "disabled", reason: "missing_basis" };
  }
  if (isStale(status)) return { state: "disabled", reason: "stale" };
  return { state: "active", reason: "current" };
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function discoverTests(suite) {
  if (suite === "e2e") {
    return walk(join(repositoryRoot, "e2e"))
      .filter((path) => /\.spec\.(?:ts|tsx)$/.test(path));
  }
  const roots = [
    "backend/src",
    "frontend/src",
    "packages/shared/src",
    "infra/cloudflare-worker/src",
    "scripts",
  ];
  return roots.flatMap((root) => walk(join(repositoryRoot, root)))
    .filter((path) => /\.test\.(?:ts|tsx|mjs)$/.test(path));
}

function loadInventory() {
  const path = join(scriptsDir, "test-authority-inventory.json");
  const inventory = JSON.parse(readFileSync(path, "utf8"));
  if (inventory.schema !== "kshiai/test-authority-inventory/v2") {
    throw new Error(`unsupported test authority inventory: ${inventory.schema}`);
  }
  const paths = inventory.tests.map((entry) => entry.path);
  const refs = inventory.tests.map((entry) => entry.ref);
  if (new Set(paths).size !== paths.length || new Set(refs).size !== refs.length) {
    throw new Error("test authority inventory paths and refs must be unique");
  }
  const missing = paths.filter((entry) => !existsSync(join(repositoryRoot, entry)));
  if (missing.length) throw new Error(`inventory test file missing: ${missing.join(", ")}`);
  return inventory;
}

async function loadSealGraphStatus(configuredTests) {
  const { stdout: staleOutput } = await execFileAsync(
    "sealgraph",
    ["stale", "--refs-only", "--scan"],
    { cwd: repositoryRoot, maxBuffer: 4 * 1024 * 1024 },
  );
  const staleRefs = new Set(staleOutput.split("\n").filter(Boolean));
  return Promise.all(configuredTests.map(async (entry) => {
    try {
      const [comparisonResult, showResult] = await Promise.all([
        execFileAsync(
          "sealgraph",
          ["source", "compare", entry.ref, "--format", "json"],
          { cwd: repositoryRoot, maxBuffer: 1024 * 1024 },
        ),
        execFileAsync(
          "sealgraph",
          ["show", entry.ref, "--format", "json"],
          { cwd: repositoryRoot, maxBuffer: 4 * 1024 * 1024 },
        ),
      ]);
      const comparison = JSON.parse(comparisonResult.stdout);
      const shown = JSON.parse(showResult.stdout);
      return {
        ref: entry.ref,
        head_seal_id: shown.seal.seal_id,
        cause_links: shown.seal.cause_links,
        stale: staleRefs.has(entry.ref),
        local_source: { path: comparison.path, relation: comparison.relation },
      };
    } catch (error) {
      return { ref: entry.ref, error: String(error) };
    }
  }));
}

export function buildInventory(testPaths, configuredTests, statuses) {
  const configByPath = new Map(configuredTests.map((entry) => [entry.path, entry]));
  const statusByRef = new Map(statuses.map((status) => [status.ref, status]));
  return testPaths.map((absolutePath) => {
    const path = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
    const entry = configByPath.get(path);
    if (!entry) return { path, state: "disabled", reason: "unsealed", ref: null };
    return { path, ref: entry.ref, ...classifyTest(entry, statusByRef.get(entry.ref)) };
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: "inherit" });
  return result.status ?? 1;
}

async function main() {
  const suite = process.argv.includes("--e2e") ? "e2e" : "unit";
  const listOnly = process.argv.includes("--list");
  const configured = loadInventory();
  const statuses = await loadSealGraphStatus(configured.tests);
  const inventory = buildInventory(discoverTests(suite), configured.tests, statuses);
  const disabled = inventory.filter((entry) => entry.state === "disabled");
  const active = inventory.filter((entry) => entry.state === "active");
  const summary = {
    schema: "kshiai/test-authority-selection/v2",
    suite,
    discovered: inventory.length,
    active: active.length,
    disabled: disabled.length,
    sealed: inventory.filter((entry) => entry.ref).length,
    unsealed: inventory.filter((entry) => !entry.ref).length,
    tests: inventory,
  };
  if (listOnly) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  for (const entry of disabled) {
    process.stderr.write(`DISABLED ${entry.path} ref=${entry.ref} reason=${entry.reason}\n`);
  }
  if (suite === "e2e") {
    process.exitCode = active.length
      ? run("npx", ["playwright", "test", ...active.map((entry) => entry.path)])
      : 0;
    return;
  }
  const groups = [
    { prefix: "backend/", tsx: true },
    { prefix: "frontend/", tsx: true },
    { prefix: "packages/shared/", tsx: true },
    { prefix: "infra/cloudflare-worker/", tsx: true },
    { prefix: "scripts/", tsx: false },
  ];
  for (const group of groups) {
    const paths = active.filter((entry) => entry.path.startsWith(group.prefix)).map((entry) => entry.path);
    if (!paths.length) continue;
    const args = group.tsx ? ["--import", "tsx", "--test", ...paths] : ["--test", ...paths];
    const status = run("node", args);
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
