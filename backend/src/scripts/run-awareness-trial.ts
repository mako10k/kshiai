// R: Establish a fresh isolated SQLite target before loading trial services and require explicit paid execution mode.
import { AwarenessLongMeasurementPolicy, AwarenessObservedPolicy } from "@kshiai/shared";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readAwarenessTrialCandidate } from "../services/awareness-trial-candidate.js";
import { observeAwarenessTrialInputSizes } from "../services/awareness-trial-input-sizes.js";

const args = process.argv.slice(2);
if (args.some((arg) => !["--validate", "--execute", "--long-timeouts"].includes(arg)) || args.filter((arg) => arg !== "--long-timeouts").length > 1 || new Set(args).size !== args.length) {
  throw new Error("USAGE: run-awareness-trial.ts [--validate|--execute] [--long-timeouts]");
}
const execute = args.includes("--execute");
const policy = args.includes("--long-timeouts") ? AwarenessLongMeasurementPolicy : AwarenessObservedPolicy;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const document = readAwarenessTrialCandidate(join(root, "docs/evidence/awareness-real-trial-candidate-2026-10-05.json"));
if (execute && (!process.env.OPENAI_API_KEY?.trim() || !process.env.XAI_API_KEY?.trim())) throw new Error("TRIAL_PROVIDER_KEYS_REQUIRED");
const directory = mkdtempSync(join(tmpdir(), execute ? "kshiai-awareness-paid-trial-" : "kshiai-awareness-offline-trial-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "trial.db");
process.env.AUTH_PROVIDER = "legacy";
process.env.LLM_PROVIDER_ORDER = "xai";
process.env.ALLOW_MOCK_PROVIDER = "false";
process.env.XAI_MODEL_ENGINE = document.configuration.conscious.model;
process.env.XAI_MODEL_FAST = document.configuration.narration.model;
process.env.OPENAI_BASE_URL = document.configuration.endpoints[0];
process.env.XAI_BASE_URL = document.configuration.endpoints[1];
if (!execute) globalThis.fetch = async () => { throw new Error("OFFLINE_TRIAL_NETWORK_DISABLED"); };
writeFileSync(join(directory, "candidate.json"), JSON.stringify(document, null, 2), { mode: 0o600 });
writeFileSync(join(directory, "measurement-policy.json"), JSON.stringify(policy, null, 2), { mode: 0o600 });
// Importing config/database before the target assignment above would bypass isolation.
const { closeDatabase, databaseKind } = await import("../db.js");
const restoreFetch = execute ? observeAwarenessTrialInputSizes(directory) : () => undefined;
try {
  if (databaseKind() !== "sqlite") throw new Error("TRIAL_REQUIRES_SQLITE");
  const { seedAwarenessTrial } = await import("../services/awareness-trial-seed.js");
  const seeded = await seedAwarenessTrial(document.candidate);
  writeFileSync(join(directory, "asset-generations.json"), JSON.stringify(seeded.generations, null, 2), { mode: 0o600 });
  if (execute) {
    const { createLlmProvider } = await import("../llm/index.js");
    const { executeAwarenessTrial } = await import("../services/awareness-trial-execution.js");
    const result = await executeAwarenessTrial({ candidate: document.candidate, directory, userId: seeded.userId, battlefieldId: seeded.battlefieldId, llm: createLlmProvider({ awarenessPolicy: policy }), policy });
    console.log(JSON.stringify({ mode: "execute", directory, policyRevision: policy.revision, ...result }));
    if (result.errorClass || result.unresolvedAttemptCount || result.pendingNarrationCount || result.missingUsageAttemptCount || result.completedCombatTicks !== 3) process.exitCode = 1;
  } else {
    const { getCurrentAssetGeneration } = await import("../repositories/asset-generations.js");
    const { getReadyPresetForUser } = await import("../repositories/battlefields.js");
    for (const generation of seeded.generations) {
      const saved = await getCurrentAssetGeneration(generation.assetType, generation.assetId);
      if (saved?.generationId !== generation.generationId || saved.contentDigest !== generation.contentDigest) throw new Error("TRIAL_ASSET_READBACK_MISMATCH");
    }
    if (!await getReadyPresetForUser(seeded.battlefieldId, seeded.userId)) throw new Error("TRIAL_BATTLEFIELD_NOT_READY");
    console.log(JSON.stringify({ mode: "validate", directory, policyRevision: policy.revision, candidateSha256: document.candidateSha256, generationCount: seeded.generations.length, networkDisabled: true }));
  }
} finally {
  restoreFetch();
  await closeDatabase();
}
