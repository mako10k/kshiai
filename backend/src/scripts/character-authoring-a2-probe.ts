import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCharacterAuthoringA2 } from "./character-authoring-a2-execute.js";
import { freezeCharacterAuthoringA2 } from "./character-authoring-a2-freeze.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const evidenceDir = join(
  root,
  "docs/evidence/character-authoring-a2-2026-09-13",
);
const freezePath = join(evidenceDir, "freeze.json");
const resultPath = join(evidenceDir, "result.json");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  if (process.argv.includes("--execute")) {
    if (await exists(resultPath)) {
      throw new Error("A2 live result already exists; a second call is forbidden");
    }
    const result = await executeCharacterAuthoringA2(freezePath);
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(`wrote ${resultPath}\n`);
    return;
  }
  const { freeze } = await freezeCharacterAuthoringA2();
  await writeFile(freezePath, `${JSON.stringify(freeze, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(freeze, null, 2)}\n`);
  process.stderr.write(`wrote ${freezePath}\n`);
}

await main();
