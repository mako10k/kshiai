// R: Prepare disposable SealGraph runtime directories around an existing repository.
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function ensureSealGraphRuntimeDirectories(repositoryRoot) {
  const sealGraphRoot = join(repositoryRoot, ".sealgraph");
  for (const [name, expectedType] of [
    ["config", "file"],
    ["objects", "directory"],
    ["refs", "directory"],
  ]) {
    let stat;
    try {
      stat = statSync(join(sealGraphRoot, name));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      throw new Error(`SealGraph repository is incomplete: .sealgraph/${name} is missing`);
    }
    if (expectedType === "file" ? !stat.isFile() : !stat.isDirectory()) {
      throw new Error(`SealGraph repository is incomplete: .sealgraph/${name} is not a ${expectedType}`);
    }
  }

  for (const name of ["index", "cache", "logs", "locks", "tmp"]) {
    mkdirSync(join(sealGraphRoot, name), { recursive: true });
  }
}
