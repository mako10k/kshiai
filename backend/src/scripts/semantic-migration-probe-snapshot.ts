import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("PROBE_SOURCE_SYMLINK");
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.name.endsWith(".ts") ? [file] : [];
  }));
  return nested.flat().sort();
}

// Freeze the actual source and built shared runtime, including dirty B5 files.
// Hashing is snapshot identity, not a replacement for semantic owner review.
export async function semanticMigrationProbeSnapshot(root: string) {
  const files = [
    ...await sourceFiles(join(root, "backend/src")),
    ...await sourceFiles(join(root, "packages/shared/src")),
    ...await runtimeFiles(join(root, "packages/shared/dist")),
    ...["package-lock.json", "package.json", "backend/package.json",
      "backend/tsconfig.json", "packages/shared/package.json",
      "packages/shared/tsconfig.json"].map((file) => join(root, file)),
  ].sort();
  const sources = await Promise.all(files.map(async (file) => ({
    path: relative(root, file),
    digest: createHash("sha256").update(await readFile(file)).digest("hex"),
  })));
  return { sources, digest: createHash("sha256").update(JSON.stringify(sources)).digest("hex") };
}

async function runtimeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("PROBE_RUNTIME_SYMLINK");
    return entry.isDirectory() ? runtimeFiles(file) : [file];
  }));
  return files.flat().sort();
}
