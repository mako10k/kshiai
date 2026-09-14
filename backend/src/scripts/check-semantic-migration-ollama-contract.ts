import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CharacterMigrationJsonSchema,
  CharacterSemanticMigrationChangeSetV1Schema,
} from "@kshiai/shared";
import {
  OLLAMA_MIGRATION_CHECK_CONTRACT,
  createOllamaMigrationCheckProvider,
} from "../llm/character-migration-ollama-provider.js";
import { characterMigrationChangeSetResponseSchema } from
  "../llm/character-migration-response-schema.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const runId = "semantic-migration-ollama-2026-09-11-v3-contract";
const outputDirectory = join(root, "docs/evidence", runId);

async function writeNew(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(outputDirectory, name),
    JSON.stringify(value, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" },
  );
}

async function main(): Promise<void> {
  await mkdir(outputDirectory);
  await writeNew("00-start.json", {
    schema: "semantic-migration-ollama-contract-smoke-start-v1",
    runId,
    scope: "One tiny local adapter contract request; not a full semantic migration.",
    startedAt: new Date().toISOString(),
  });
  const expectedOperation = {
    operation: "transform",
    targetPath: "definition.profileBackground",
    sourcePaths: ["definition.profileBackground"],
    value: [{ id: "background-1", summary: "Enjoys tactical duels." }],
    deferred: null,
    explanation: "Preserve the supplied meaning in the requested target fragment.",
    provenance: "source_derived",
    semanticDependants: [],
  };
  const provider = createOllamaMigrationCheckProvider({
    persist: async (event) => {
      const ordinal = event.phase === "before" ? "01" :
        event.phase === "response" ? "02" : "03";
      await writeNew(`${ordinal}-${event.phase}.json`, event);
    },
  });
  const receipt = await provider({
    providerRequestId: "ollama-contract-smoke-request-v1",
    providerRoute: OLLAMA_MIGRATION_CHECK_CONTRACT.endpoint,
    modelIdentity: OLLAMA_MIGRATION_CHECK_CONTRACT.model,
    kind: "initial_generation",
    system: [
      "Return exactly one CharacterSemanticMigrationChangeSetV1 JSON object.",
      "Copy expectedOperation from the user input exactly into operations.",
      "Return an empty uncertainties array. Do not add commentary.",
    ].join("\n"),
    input: CharacterMigrationJsonSchema.parse({ expectedOperation }),
    responseSchema: CharacterMigrationJsonSchema.parse(
      characterMigrationChangeSetResponseSchema(),
    ),
  });
  if (receipt.outcome === "failed") {
    await writeNew("04-result.json", {
      schema: "semantic-migration-ollama-contract-smoke-result-v1",
      outcome: "provider_failed",
      receipt,
    });
    return;
  }
  const parsed = CharacterSemanticMigrationChangeSetV1Schema.safeParse(receipt.response);
  const exactExpected = parsed.success &&
    JSON.stringify(parsed.data.operations) === JSON.stringify([expectedOperation]) &&
    parsed.data.uncertainties.length === 0;
  await writeNew("04-result.json", {
    schema: "semantic-migration-ollama-contract-smoke-result-v1",
    outcome: parsed.success ? "schema_valid" : "schema_invalid",
    exactExpected,
    receipt,
    validationIssues: parsed.success ? [] : parsed.error.issues,
    limitations: [
      "This checks the live native adapter and response contract, not full migration quality.",
      "It does not establish xAI-equivalent behavior.",
    ],
  });
}

main().catch(async (error: unknown) => {
  const failure = error instanceof Error ? error.message : "UNKNOWN_FAILURE";
  try {
    await writeNew("99-failure.json", {
      schema: "semantic-migration-ollama-contract-smoke-failure-v1",
      failure,
      retryPerformed: false,
      failedAt: new Date().toISOString(),
    });
  } catch {
    // A pre-existing evidence directory intentionally blocks a second request.
  }
  console.error("Local Ollama contract smoke stopped; inspect retained evidence. No retry was made.");
  process.exitCode = 1;
});
