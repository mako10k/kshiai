import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
  CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
  CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1,
  CharacterSemanticMigrationAttemptV1Schema,
  type CharacterSemanticMigrationAttemptV1,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-semantic-migration-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "migration.db");

const { closeDatabase, query } = await import("../db.js");
const {
  appendAssetGeneration,
  activateAssetGeneration,
  assetContentDigest,
  createAssetGeneration,
  getCurrentAssetGeneration,
  getAssetGeneration,
} = await import("./asset-generations.js");
const migration = await import("./character-semantic-migration.js");

const now = "2026-09-10T09:00:00.000Z";
const sourceContent = { schemaVersion: 2, identity: { displayName: "移行対象" } };
let sourceGenerationId = "";

before(async () => {
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3)`,
    ["migration-owner", "migration-owner", now],
  );
  await query(
    `INSERT INTO characters
      (id, owner_user_id, sheet_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)`,
    ["migration-character", "migration-owner", "{}", now],
  );
  const source = await createAssetGeneration({
    assetType: "character",
    assetId: "migration-character",
    schemaVersion: 2,
    content: sourceContent,
    createdAt: now,
  });
  sourceGenerationId = source.generationId;
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function attemptInput(
  migrationAttemptId = "migration-attempt-1",
): CharacterSemanticMigrationAttemptV1 {
  const base = {
    migrationAttemptId,
    ownerUserId: "migration-owner",
    characterId: "migration-character",
    sourceGenerationId,
    sourceSchemaVersion: 2 as const,
    sourceContentDigest: assetContentDigest(sourceContent),
    sourceContent,
    naturalSource: {
      disclosureContractId: "character_semantic_migration_owner_source_v1" as const,
      allowedSourcePaths: ["characterAuthoring.sourceText"],
      contentDigest: assetContentDigest([{
        sourcePath: "characterAuthoring.sourceText",
        value: "炎を好む",
      }]),
      fragments: [{
        sourcePath: "characterAuthoring.sourceText",
        value: "炎を好む",
      }],
    },
    targetSchemaVersion: 3 as const,
    migrationContractId: CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
    promptIdentity: "character-semantic-migration-prompt-v1",
    responseSchemaIdentity: CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
    providerRoute: "xai-chat-completions-v1",
    modelIdentity: "grok-test-model",
    compilerCapabilities: {
      contractVersion: 1 as const,
      required: [{ consumer: "battle-mechanics" as const, version: 3 }],
    },
    createdAt: now,
  };
  return CharacterSemanticMigrationAttemptV1Schema.parse({
    ...base,
    initialRequestDigest:
      migration.characterSemanticMigrationInitialRequestDigest(base),
  });
}

function accounting() {
  return {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    estimatedCostUsd: null,
    elapsedMs: 20,
  };
}

describe("character semantic migration persistence", () => {
  it("freezes and exactly replays an attempt without moving the current pointer", async () => {
    const input = attemptInput();
    const first = await migration.beginCharacterSemanticMigrationAttempt(input);
    const replay = await migration.beginCharacterSemanticMigrationAttempt(input);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.attempt, input);

    await assert.rejects(
      migration.beginCharacterSemanticMigrationAttempt({
        ...input,
        modelIdentity: "different-model",
      }),
      /INITIAL_REQUEST_DIGEST_MISMATCH/,
    );
    const { initialRequestDigest: _digest, ...changedBase } = {
      ...input,
      modelIdentity: "different-model",
    };
    await assert.rejects(
      migration.beginCharacterSemanticMigrationAttempt({
        ...changedBase,
        initialRequestDigest:
          migration.characterSemanticMigrationInitialRequestDigest(changedBase),
      }),
      /ATTEMPT_IDENTITY_DRIFT/,
    );
    assert.equal(
      (await getCurrentAssetGeneration("character", "migration-character"))
        ?.generationId,
      sourceGenerationId,
    );
    const count = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      ["migration-character"],
    );
    assert.equal(Number(count.rows[0]?.count), 1);
  });

  it("resumes an unreceipted request and appends a retry after failure", async () => {
    const input = attemptInput();
    const initial = await migration.recordCharacterSemanticMigrationProviderRequest({
      providerRequestId: "provider-request-1",
      migrationAttemptId: input.migrationAttemptId,
      parentProviderRequestId: null,
      kind: "initial_generation",
      requestDigest: input.initialRequestDigest,
      createdAt: "2026-09-10T09:01:00.000Z",
    });
    const crashView = await migration.loadCharacterSemanticMigrationWork({
      migrationAttemptId: input.migrationAttemptId,
      ownerUserId: input.ownerUserId,
    });
    assert.equal(initial.replayed, false);
    assert.equal(crashView?.requests[0]?.receipt, null);

    const requestReplay = await migration.recordCharacterSemanticMigrationProviderRequest({
      providerRequestId: "provider-request-1",
      migrationAttemptId: input.migrationAttemptId,
      parentProviderRequestId: null,
      kind: "initial_generation",
      requestDigest: input.initialRequestDigest,
      createdAt: "2026-09-10T09:01:00.000Z",
    });
    assert.equal(requestReplay.replayed, true);
    await migration.recordCharacterSemanticMigrationProviderReceipt({
      providerRequestId: initial.request.providerRequestId,
      receipt: {
        outcome: "failed",
        failureCode: "PROVIDER_UNAVAILABLE",
        failureDetail: "temporary failure",
        accounting: accounting(),
        finishedAt: "2026-09-10T09:02:00.000Z",
      },
    });
    const retry = await migration.recordCharacterSemanticMigrationProviderRequest({
      providerRequestId: "provider-request-2",
      migrationAttemptId: input.migrationAttemptId,
      parentProviderRequestId: initial.request.providerRequestId,
      kind: "semantic_repair",
      requestDigest: "f".repeat(64),
      createdAt: "2026-09-10T09:03:00.000Z",
    });
    assert.equal(retry.request.ordinal, 2);
    assert.equal(retry.request.parentProviderRequestId, "provider-request-1");
    const response = { operations: [] };
    const successReceipt = {
      outcome: "succeeded" as const,
      responseDigest: assetContentDigest(response),
      response,
      accounting: accounting(),
      finishedAt: "2026-09-10T09:04:00.000Z",
    };
    const succeeded = await migration.recordCharacterSemanticMigrationProviderReceipt({
      providerRequestId: retry.request.providerRequestId,
      receipt: successReceipt,
    });
    const receiptReplay =
      await migration.recordCharacterSemanticMigrationProviderReceipt({
        providerRequestId: retry.request.providerRequestId,
        receipt: successReceipt,
      });
    assert.equal(succeeded.replayed, false);
    assert.equal(receiptReplay.replayed, true);
    const resumed = await migration.loadCharacterSemanticMigrationWork({
      migrationAttemptId: input.migrationAttemptId,
      ownerUserId: input.ownerUserId,
    });
    assert.equal(resumed?.requests.length, 2);
    assert.equal(resumed?.requests[0]?.receipt?.outcome, "failed");
    assert.equal(resumed?.requests[1]?.receipt?.outcome, "succeeded");
    assert.deepEqual(
      resumed?.events.map((event) => event.type),
      [
        "attempt_started",
        "provider_request_recorded",
        "provider_request_failed",
        "provider_request_recorded",
        "provider_request_succeeded",
      ],
    );
    assert.equal(
      (await getCurrentAssetGeneration("character", "migration-character"))
        ?.generationId,
      sourceGenerationId,
    );
  });

  it("stores a bounded capsule and exposes it only to the registered consumer", async () => {
    const target = await appendAssetGeneration({ query }, {
      assetType: "character",
      assetId: "migration-character",
      schemaVersion: 3,
      content: { schemaVersion: 3, identity: { displayName: "移行対象" } },
      createdAt: "2026-09-10T09:04:00.000Z",
    });
    const capsule = {
      capsuleVersion: 1 as const,
      migrationAttemptId: "migration-attempt-1",
      sourceGenerationId,
      targetGenerationId: target.generationId,
      entries: [{
        sourcePath: "actionNorms.0.response.statement",
        value: "戦闘を楽しむ",
        operationId: "operation-retire-1",
        provenanceCategory: "retired" as const,
      }],
      createdAt: "2026-09-10T09:05:00.000Z",
    };
    const stored = await migration.storeMigrationPreservationCapsule({
      ownerUserId: "migration-owner",
      capsule,
    });
    const replay = await migration.storeMigrationPreservationCapsule({
      ownerUserId: "migration-owner",
      capsule,
    });
    assert.equal(stored.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(
      await migration.loadMigrationPreservationCapsuleForConsumer({
        ownerUserId: "migration-owner",
        capsuleDigest: stored.capsuleDigest,
        consumer: CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1,
      }),
      capsule,
    );
    assert.equal(
      await migration.loadMigrationPreservationCapsuleForConsumer({
        ownerUserId: "another-owner",
        capsuleDigest: stored.capsuleDigest,
        consumer: CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1,
      }),
      null,
    );
    await assert.rejects(
      migration.storeMigrationPreservationCapsule({
        ownerUserId: "migration-owner",
        capsule: {
          ...capsule,
          targetGenerationId: target.generationId,
          entries: [{
            ...capsule.entries[0],
            value: "x".repeat(270_000),
          }],
        },
      }),
      /CAPSULE_TOO_LARGE/,
    );
    assert.equal(
      (await getCurrentAssetGeneration("character", "migration-character"))
        ?.generationId,
      sourceGenerationId,
    );
  });

  it("enforces the accepted six-request ceiling", async () => {
    const input = attemptInput("migration-attempt-request-limit");
    await migration.beginCharacterSemanticMigrationAttempt(input);
    let parentProviderRequestId: string | null = null;
    for (let ordinal = 1; ordinal <= 6; ordinal += 1) {
      const providerRequestId = `limited-provider-request-${ordinal}`;
      await migration.recordCharacterSemanticMigrationProviderRequest({
        providerRequestId,
        migrationAttemptId: input.migrationAttemptId,
        parentProviderRequestId,
        kind: ordinal === 1 ? "initial_generation" : "semantic_rereview",
        requestDigest: ordinal === 1
          ? input.initialRequestDigest
          : assetContentDigest({ ordinal }),
        createdAt: `2026-09-10T09:1${ordinal}:00.000Z`,
      });
      if (ordinal < 6) {
        await migration.recordCharacterSemanticMigrationProviderReceipt({
          providerRequestId,
          receipt: {
            outcome: "failed",
            failureCode: "FIXTURE_RETRY",
            failureDetail: null,
            accounting: accounting(),
            finishedAt: `2026-09-10T09:1${ordinal}:30.000Z`,
          },
        });
      }
      parentProviderRequestId = providerRequestId;
    }
    await assert.rejects(
      migration.recordCharacterSemanticMigrationProviderRequest({
        providerRequestId: "limited-provider-request-7",
        migrationAttemptId: input.migrationAttemptId,
        parentProviderRequestId,
        kind: "semantic_rereview",
        requestDigest: assetContentDigest({ ordinal: 7 }),
        createdAt: "2026-09-10T09:17:00.000Z",
      }),
      /PROVIDER_REQUEST_LIMIT_EXCEEDED/,
    );
  });

  it("rejects undisclosed or content-drifted natural source material", async () => {
    const input = attemptInput();
    assert.equal(CharacterSemanticMigrationAttemptV1Schema.safeParse({
      ...input,
      migrationAttemptId: "migration-attempt-duplicate-path",
      naturalSource: {
        ...input.naturalSource,
        allowedSourcePaths: [
          "characterAuthoring.sourceText",
          "characterAuthoring.sourceText",
        ],
      },
    }).success, false);
    assert.equal(CharacterSemanticMigrationAttemptV1Schema.safeParse({
      ...input,
      migrationAttemptId: "migration-attempt-unknown-disclosure",
      naturalSource: input.naturalSource
        ? { ...input.naturalSource, disclosureContractId: "unregistered" }
        : null,
    }).success, false);
    assert.equal(CharacterSemanticMigrationAttemptV1Schema.safeParse({
      ...input,
      migrationAttemptId: "migration-attempt-undisclosed-path",
      naturalSource: input.naturalSource
        ? {
            ...input.naturalSource,
            fragments: [{ sourcePath: "privateNotes", value: "secret" }],
          }
        : null,
    }).success, false);
    await assert.rejects(
      migration.beginCharacterSemanticMigrationAttempt({
        ...input,
        migrationAttemptId: "migration-attempt-natural-drift",
        naturalSource: input.naturalSource
          ? {
              ...input.naturalSource,
              fragments: [{
                sourcePath: "characterAuthoring.sourceText",
                value: "changed",
              }],
            }
          : null,
      }),
      /NATURAL_SOURCE_DIGEST_MISMATCH/,
    );
  });

  it("rechecks the frozen current generation before a provider request", async () => {
    const target = await query<{ generation_id: string }>(
      `SELECT generation_id FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1 AND schema_version = 3`,
      ["migration-character"],
    );
    const generation = target.rows[0]
      ? await getAssetGeneration(target.rows[0].generation_id)
      : null;
    assert.ok(generation);
    await activateAssetGeneration({ query }, generation, sourceGenerationId);
    await assert.rejects(
      migration.recordCharacterSemanticMigrationProviderRequest({
        providerRequestId: "provider-request-after-pointer-drift",
        migrationAttemptId: "migration-attempt-1",
        parentProviderRequestId: "provider-request-2",
        kind: "semantic_review",
        requestDigest: "e".repeat(64),
        createdAt: "2026-09-10T10:00:00.000Z",
      }),
      /SOURCE_POINTER_DRIFT/,
    );
  });
});
