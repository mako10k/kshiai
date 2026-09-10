import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { SEMANTIC_MIGRATION_PROBE_RUN_V2 } from "./semantic-migration-probe-run.js";

it("binds the new run and corrected prompt without reusing the consumed v1 identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kshiai-probe-v2-test-"));
  process.env.NODE_ENV = "test";
  process.env.AUTH_PROVIDER = "legacy";
  process.env.DATABASE_URL = "";
  process.env.DATABASE_PATH = join(directory, "probe.sqlite");
  const { closeDatabase, databaseKind } = await import("../db.js");
  try {
    assert.equal(databaseKind(), "sqlite");
    const { seedSemanticMigrationProbe } = await import("./semantic-migration-probe-fixture.js");
    const { createCharacterMigrationContext, CHARACTER_MIGRATION_PROMPT_V2 } =
      await import("../services/character-migration-context.js");
    const { initialCharacterMigrationMerge } = await import("../services/character-migration-merge.js");
    const { characterMigrationProviderPayload } = await import("../services/character-migration-prompts.js");
    const { migrationProbeReservation, MIGRATION_PROBE_CONTRACT } =
      await import("../llm/character-migration-probe-provider.js");
    const { assertXaiResponseSchema } = await import("../llm/provider-response-schema.js");
    const attempt = await seedSemanticMigrationProbe(SEMANTIC_MIGRATION_PROBE_RUN_V2);
    assert.equal(attempt.migrationAttemptId, "semantic-migration-grok-2026-09-10-v2");
    assert.notEqual(attempt.migrationAttemptId, MIGRATION_PROBE_CONTRACT.runId);
    assert.equal(attempt.promptIdentity, CHARACTER_MIGRATION_PROMPT_V2);
    const context = createCharacterMigrationContext(attempt);
    const payload = characterMigrationProviderPayload({
      context, state: initialCharacterMigrationMerge(context),
      kind: "initial_generation", findings: [], repairClosure: [],
    });
    assertXaiResponseSchema(payload.responseSchema);
    const reservation = migrationProbeReservation({
      ...payload, kind: "initial_generation", providerRequestId: "test-preview",
      providerRoute: attempt.providerRoute, modelIdentity: attempt.modelIdentity,
    });
    assert.ok(reservation.bytes <= MIGRATION_PROBE_CONTRACT.maxRequestBytes);
    assert.equal(reservation.body.response_format.json_schema.strict, true);
    assert.equal(attempt.naturalSource, null);
  } finally {
    await closeDatabase();
  }
});
