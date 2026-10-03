/** R: Prepare two fixed V3 candidates for owner review in an explicitly selected database. */
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { createV3StageTrialCandidate, createV3StageTrialSource } from "../fixtures/neva-v3.js";
import { createV3StageTrialSecondCandidate, createV3StageTrialSecondSource } from "../fixtures/rio-v3.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const databasePath = argument("--db");
  const ownerUserId = argument("--owner");
  const requestKey = argument("--request-key") ?? "initial";
  const configuredDatabase = process.argv.includes("--configured-database");
  if (!ownerUserId || (configuredDatabase === Boolean(databasePath))
    || (databasePath && !isAbsolute(databasePath))) {
    throw new Error("Usage: register-v3-stage-trial (--db /absolute/local.sqlite | --configured-database) --owner EXISTING_USER_ID");
  }
  if (databasePath) {
    process.env.DATABASE_URL = "";
    process.env.DATABASE_PATH = databasePath;
  }
  const { prepareV3TrialCharacter } = await import(
    "../repositories/local-v3-trial-characters.js");
  const { closeDatabase } = await import("../db.js");
  try {
    const ownerSuffix = createHash("sha256").update(ownerUserId).digest("hex").slice(0, 16);
    for (const [name, envelope, source] of [
      ["neva", createV3StageTrialCandidate(), createV3StageTrialSource()],
      ["rio", createV3StageTrialSecondCandidate(), createV3StageTrialSecondSource()],
    ] as const) {
      const result = await prepareV3TrialCharacter({
        characterId: `stage-trial-${name}-${ownerSuffix}`,
        ownerUserId,
        envelope, source, requestKey,
      });
      process.stdout.write(`${name}\t${result.characterId}\t${result.attemptId}\t${result.status}\t${result.candidateDigest}\t/reviews/${result.attemptId}\n`);
    }
  } finally {
    await closeDatabase();
  }
}

await main();
