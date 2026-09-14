import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { semanticMigrationProbeSnapshot } from "./semantic-migration-probe-snapshot.js";
import { SEMANTIC_MIGRATION_PROBE_RUN_V2, type SemanticMigrationProbeRun } from "./semantic-migration-probe-run.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function writeNew(output: string, name: string, value: unknown) {
  await writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}

function mode() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--prepare") return { execute: false, approved: null };
  if (args.length === 2 && args[0] === "--execute" && /^[a-f0-9]{64}$/.test(args[1])) {
    return { execute: true, approved: args[1] };
  }
  throw new Error("Use --prepare or --execute FULL_APPROVED_PROOF_DIGEST");
}

export async function runSemanticMigrationProbe(run: SemanticMigrationProbeRun = SEMANTIC_MIGRATION_PROBE_RUN_V2) {
  const selected = mode();
  // Set before any repository runtime import: neither ambient nor .env DB settings can win.
  const databaseDirectory = await mkdtemp(join(tmpdir(), "kshiai-semantic-probe-"));
  process.env.NODE_ENV = "test";
  process.env.AUTH_PROVIDER = "legacy";
  process.env.DATABASE_URL = "";
  process.env.DATABASE_PATH = join(databaseDirectory, "probe.sqlite");
  const { closeDatabase, databaseKind } = await import("../db.js");
  try {
    assert.equal(databaseKind(), "sqlite");
    await runProbe(selected, databaseDirectory, run);
  } finally {
    await closeDatabase();
  }
}

async function runProbe(selected: ReturnType<typeof mode>, databaseDirectory: string, run: SemanticMigrationProbeRun) {
  const output = join(root, "docs/evidence", run.runId);
  const { MIGRATION_PROBE_CONTRACT, createMigrationProbeProvider, migrationProbeReservation } =
    await import("../llm/character-migration-probe-provider.js");
  const { seedSemanticMigrationProbe } = await import("./semantic-migration-probe-fixture.js");
  const { generateCharacterSemanticMigration } = await import("../services/character-semantic-migration.js");
  const { createCharacterMigrationContext } = await import("../services/character-migration-context.js");
  const { initialCharacterMigrationMerge } = await import("../services/character-migration-merge.js");
  const { characterMigrationProviderPayload } = await import("../services/character-migration-prompts.js");
  const { assetContentDigest, getCurrentAssetGeneration } = await import("../repositories/asset-generations.js");
  const { loadCharacterSemanticMigrationWork } = await import("../repositories/character-semantic-migration.js");
  const attempt = await seedSemanticMigrationProbe(run);
  const context = createCharacterMigrationContext(attempt);
  const first = characterMigrationProviderPayload({
    context, state: initialCharacterMigrationMerge(context),
    kind: "initial_generation", findings: [], repairClosure: [],
  });
  const firstRequest = migrationProbeReservation({ ...first, kind: "initial_generation",
    providerRequestId: "preview-only", providerRoute: attempt.providerRoute,
    modelIdentity: attempt.modelIdentity });
  const proof = { schema: "semantic-migration-probe-proof-v1",
    executionContract: { ...MIGRATION_PROBE_CONTRACT, runId: attempt.migrationAttemptId },
    snapshot: await semanticMigrationProbeSnapshot(root),
    attempt, firstRequest,
    scope: "One synthetic mixed soft/executable/fallback character; never activate.",
    limitations: ["No production recovery proof", "Repair may not occur naturally",
      "Same-model stateless review is not independent human judgment",
      "Byte-based token reservation is an estimate, not a billing guarantee"],
  };
  const proofDigest = assetContentDigest(proof);
  await mkdir(output, { recursive: true });
  if (selected.execute) {
    const stored: unknown = JSON.parse(await readFile(join(output, "prepare-proof.json"), "utf8"));
    assert.equal(assetContentDigest(stored), proofDigest, "Preparation snapshot drift");
    assert.equal(selected.approved, proofDigest, "Exact prepared scope approval is required");
    assert.ok(process.env.XAI_API_KEY?.trim(), "XAI_API_KEY must be injected");
    assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0", "TLS verification must be enabled");
    // Exclusive creation consumes this run even on ambiguous network failure. Never resend.
    await writeNew(output, "live-start.json", { proofDigest, databaseDirectory, startedAt: new Date().toISOString() });
  } else {
    await writeNew(output, "prepare-proof.json", proof);
  }
  const events: import("../llm/character-migration-probe-provider.js").MigrationProbeEvent[] = [];
  const provider = createMigrationProbeProvider({
    apiKey: selected.execute ? process.env.XAI_API_KEY ?? "" : "offline-only-not-sent",
    persist: async (event) => {
      events.push(event);
      if (selected.execute) await writeNew(output, `call-${event.ordinal}-${event.phase}.json`, event);
    },
    ...(selected.execute ? {} : { fetcher: offlineTransport }),
  });
  const before = await getCurrentAssetGeneration("character", attempt.characterId);
  const result = await generateCharacterSemanticMigration({
    attempt, provider, availableCapabilities: attempt.compilerCapabilities.required,
  });
  assert.deepEqual(await getCurrentAssetGeneration("character", attempt.characterId), before);
  assert.equal(result.activated, false);
  const work = await loadCharacterSemanticMigrationWork(attempt);
  const report = { proofDigest, databaseDirectory, mode: selected.execute ? "live" : "offline",
    networkRequests: selected.execute ? events.filter((event) => event.phase === "before").length : 0,
    events, result, work, currentGenerationUnchanged: true };
  if (!selected.execute) {
    assert.equal(result.requests.length, 6, "Dry proof must cover all six request slots");
    assert.equal(result.status, "review_required");
  }
  await writeNew(output, selected.execute ? "live-result.json" : "prepare-result.json", report);
  console.log(JSON.stringify({ proofDigest, status: result.status, output,
    networkRequests: report.networkRequests, activated: result.activated }));
}

// Deliberately unresolved migration, used only to exercise all six transport/persistence slots.
// It is never substituted for a provider result or presented as model-quality evidence.
const offlineTransport: typeof fetch = async (_url, init) => {
  const body = typeof init?.body === "string" ? init.body : "";
  const review = body.includes('"name":"character_semantic_consistency_review_v1"');
  const content = review ? {
    schema: "character_semantic_consistency_review_v1", verdict: "repair_required",
    findings: [{ code: "offline_missing_split", targetPaths: ["definition.actionNorms"],
      sourcePaths: ["definition.actionNorms"], semanticDependants: ["definition.consciousGuidance"],
      explanation: "Offline fixture deliberately retains missing migration to exercise two repair rounds." }],
    summary: "Offline transport proof only.", uncertainties: [],
  } : { schema: "character_semantic_migration_change_set_v1", operations: [], uncertainties: [] };
  return new Response(JSON.stringify({
    id: "offline-not-a-provider-receipt", model: "grok-4.3",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }), { status: 200 });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSemanticMigrationProbe().catch(() => {
    // Never log an exception carrying authorization headers or ambient configuration.
    console.error("Semantic migration probe stopped; inspect retained evidence. No automatic retry.");
    process.exitCode = 1;
  });
}
