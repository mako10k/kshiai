import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptsDir, "..");
const sealGraphRoot = join(repositoryRoot, ".sealgraph");
const inventory = JSON.parse(
  readFileSync(join(scriptsDir, "test-authority-inventory.json"), "utf8"),
);

if (inventory.schema !== "kshiai/test-authority-inventory/v2") {
  throw new Error(`unsupported test authority inventory: ${inventory.schema}`);
}

for (const directory of ["index", "cache", "logs", "locks", "tmp"]) {
  mkdirSync(join(sealGraphRoot, directory), { recursive: true });
}

for (const { ref, path } of inventory.tests) {
  execFileSync(
    "sealgraph",
    ["source", "bind", ref, "--file", path],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
}
