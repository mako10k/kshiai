// R: Prepare local test authority source bindings for an existing SealGraph repository.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSealGraphRuntimeDirectories } from "./sealgraph-runtime-dirs.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptsDir, "..");

export function prepareTestAuthorityRuntime(configuredTests) {
  ensureSealGraphRuntimeDirectories(repositoryRoot);
  for (const { ref, path } of configuredTests) {
    // Source bindings are machine-local and idempotent for the same path.
    execFileSync("sealgraph", ["source", "bind", ref, "--file", path], {
      cwd: repositoryRoot,
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = JSON.parse(
    readFileSync(join(scriptsDir, "test-authority-inventory.json"), "utf8"),
  );
  if (inventory.schema !== "kshiai/test-authority-inventory/v2") {
    throw new Error(`unsupported test authority inventory: ${inventory.schema}`);
  }
  prepareTestAuthorityRuntime(inventory.tests);
}
