/** R: Install the two fixed V3 Stage-trial candidates into an explicit local SQLite database. */
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { createV3StageTrialCandidate } from "../fixtures/neva-v3.js";
import { createV3StageTrialSecondCandidate } from "../fixtures/rio-v3.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const databasePath = argument("--db");
  const ownerUserId = argument("--owner");
  if (!databasePath || !isAbsolute(databasePath) || !ownerUserId) {
    throw new Error("Usage: register-v3-stage-trial --db /absolute/local.sqlite --owner EXISTING_USER_ID");
  }
  process.env.DATABASE_URL = "";
  process.env.DATABASE_PATH = databasePath;
  const { registerLocalV3TrialCharacter } = await import(
    "../repositories/local-v3-trial-characters.js");
  const { closeDatabase } = await import("../db.js");
  try {
    const ownerSuffix = createHash("sha256").update(ownerUserId).digest("hex").slice(0, 16);
    for (const [name, envelope] of [
      ["neva", createV3StageTrialCandidate()],
      ["rio", createV3StageTrialSecondCandidate()],
    ] as const) {
      const result = await registerLocalV3TrialCharacter({
        characterId: `stage-trial-${name}-${ownerSuffix}`,
        ownerUserId,
        envelope,
      });
      process.stdout.write(`${name}\t${result.characterId}\t${result.generationId}\t${result.contentDigest}\n`);
    }
  } finally {
    await closeDatabase();
  }
}

await main();
