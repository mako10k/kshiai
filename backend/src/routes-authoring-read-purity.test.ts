// R: Verify ADR-0024 repeated draft reads leave authoring persistence and provider work unchanged.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "kshiai-authoring-read-purity-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "routes.db");
process.env.LLM_PROVIDER = "mock";

const { closeDatabase, query } = await import("./db.js");
const { MockLlmProvider } = await import("./llm/mock.js");
const characterAssetRepo = await import("./repositories/character-assets-v2.js");
const battlefieldAssetRepo = await import("./repositories/battlefield-assets-v2.js");
const narrationStyleAssetRepo = await import(
  "./repositories/narration-style-assets-v2.js"
);
const { buildRoutes } = await import("./routes.js");

class CountingAuthoringProvider extends MockLlmProvider {
  authoringCalls = 0;

  override async generateCharacterProfile(...args: Parameters<InstanceType<typeof MockLlmProvider>["generateCharacterProfile"]>) {
    this.authoringCalls += 1;
    return super.generateCharacterProfile(...args);
  }

  override async generateCharacterDefinitionV2(...args: Parameters<InstanceType<typeof MockLlmProvider>["generateCharacterDefinitionV2"]>) {
    this.authoringCalls += 1;
    return super.generateCharacterDefinitionV2(...args);
  }

  override async generateBattlefieldScene(...args: Parameters<InstanceType<typeof MockLlmProvider>["generateBattlefieldScene"]>) {
    this.authoringCalls += 1;
    return super.generateBattlefieldScene(...args);
  }

  override async generateBattlefieldDefinitionV2(...args: Parameters<InstanceType<typeof MockLlmProvider>["generateBattlefieldDefinitionV2"]>) {
    this.authoringCalls += 1;
    return super.generateBattlefieldDefinitionV2(...args);
  }

  override async generateNarrationDefinitionV2(...args: Parameters<InstanceType<typeof MockLlmProvider>["generateNarrationDefinitionV2"]>) {
    this.authoringCalls += 1;
    return super.generateNarrationDefinitionV2(...args);
  }

  override async generateNarrationStyleDescription(...args: Parameters<InstanceType<typeof MockLlmProvider>["generateNarrationStyleDescription"]>) {
    this.authoringCalls += 1;
    return super.generateNarrationStyleDescription(...args);
  }

  override async generateCharacter(
    ...args: Parameters<InstanceType<typeof MockLlmProvider>["generateCharacter"]>
  ): Promise<Awaited<ReturnType<InstanceType<typeof MockLlmProvider>["generateCharacter"]>>> {
    this.authoringCalls += 1;
    return super.generateCharacter(...args);
  }

  override async generateBattlefieldPreset(
    ...args: Parameters<InstanceType<typeof MockLlmProvider>["generateBattlefieldPreset"]>
  ): Promise<Awaited<ReturnType<InstanceType<typeof MockLlmProvider>["generateBattlefieldPreset"]>>> {
    this.authoringCalls += 1;
    return super.generateBattlefieldPreset(...args);
  }

  override async generateNarrationStyle(
    ...args: Parameters<NonNullable<
      InstanceType<typeof MockLlmProvider>["generateNarrationStyle"]
    >>
  ): Promise<Awaited<ReturnType<NonNullable<
    InstanceType<typeof MockLlmProvider>["generateNarrationStyle"]
  >>>> {
    this.authoringCalls += 1;
    return super.generateNarrationStyle(...args);
  }
}

const provider = new CountingAuthoringProvider();
const app = buildRoutes({ llm: provider });
const sessionToken = "ses_authoring_read_purity";
const authHeaders = { Cookie: `kshiai_session=${sessionToken}` };

async function snapshotAuthoringPersistence() {
  const tables = [
    "character_authoring_attempts", "battlefield_authoring_attempts", "narration_style_authoring_attempts",
    "character_authoring_jobs", "battlefield_authoring_jobs", "narration_style_authoring_jobs",
    "asset_authoring_outbox", "asset_authoring_scheduler", "owner_notifications",
    "provider_operation_attempts", "semantic_authoring_runs", "semantic_authoring_provider_requests",
    "character_focused_authoring_payloads", "asset_generations", "asset_current_generations",
    "character_asset_states", "battlefield_asset_states", "narration_style_asset_states",
  ] as const;
  return Promise.all(tables.map(async (table) => ({
    table, rows: (await query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY rowid`)).rows,
  })));
}

before(async () => {
  const now = "2026-09-08T00:00:00.000Z";
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3)`,
    ["read-owner", "read-owner", now],
  );
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionToken, "read-owner", now, "2099-09-08T00:00:00.000Z"],
  );
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("authoring draft read purity", () => {
  it("keeps all six draft reads free of claims writes and provider calls", async () => {
    const character = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "read-owner",
      kind: "create",
      idempotencyKey: "read-character-001",
      requestDigest: "a".repeat(64),
      sourceText: "read-only character",
      sourceDigest: "b".repeat(64),
      focused: {
        source: { kind: "create", naturalText: "read-only character" },
        pricingIdentity: "controlled-test-prices-v1",
      },
    });
    const battlefield = await battlefieldAssetRepo.beginBattlefieldAuthoringAttempt({
      ownerUserId: "read-owner",
      kind: "create",
      idempotencyKey: "read-battlefield-001",
      requestDigest: "c".repeat(64),
      sourceText: "read-only battlefield",
      sourceDigest: "d".repeat(64),
    });
    const narration = await narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt({
      ownerUserId: "read-owner",
      kind: "create",
      idempotencyKey: "read-narration-001",
      requestDigest: "e".repeat(64),
      sourceText: "read-only narration",
      sourceDigest: "f".repeat(64),
    });
    const beforeState = await query<{
      family: string;
      attempt_id: string;
      job_status: string;
      outbox_status: string;
      delivery_attempts: number;
    }>(
      `SELECT outbox.family, outbox.attempt_id, job.job_status,
              outbox.status AS outbox_status, outbox.delivery_attempts
         FROM asset_authoring_outbox outbox
         JOIN (
           SELECT 'character' AS family, attempt_id, status AS job_status
             FROM character_authoring_jobs
           UNION ALL
           SELECT 'battlefield', attempt_id, status FROM battlefield_authoring_jobs
           UNION ALL
           SELECT 'narration_style', attempt_id, status
             FROM narration_style_authoring_jobs
         ) job ON job.family = outbox.family AND job.attempt_id = outbox.attempt_id
        ORDER BY outbox.family`,
    );

    const persistenceBefore = await snapshotAuthoringPersistence();
    const paths = [
      "/api/character-drafts/latest",
      `/api/character-drafts/${character.attempt.attemptId}`,
      "/api/battlefield-drafts/latest",
      `/api/battlefield-drafts/${battlefield.attempt.attemptId}`,
      "/api/narration-style-drafts/latest",
      `/api/narration-style-drafts/${narration.attempt.attemptId}`,
    ];
    for (let round = 0; round < 3; round += 1) {
      for (const path of paths) {
        const response = await app.request(path, { headers: authHeaders });
        assert.equal(response.status, 200, path);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));

    const afterState = await query<{
      family: string;
      attempt_id: string;
      job_status: string;
      outbox_status: string;
      delivery_attempts: number;
    }>(
      `SELECT outbox.family, outbox.attempt_id, job.job_status,
              outbox.status AS outbox_status, outbox.delivery_attempts
         FROM asset_authoring_outbox outbox
         JOIN (
           SELECT 'character' AS family, attempt_id, status AS job_status
             FROM character_authoring_jobs
           UNION ALL
           SELECT 'battlefield', attempt_id, status FROM battlefield_authoring_jobs
           UNION ALL
           SELECT 'narration_style', attempt_id, status
             FROM narration_style_authoring_jobs
         ) job ON job.family = outbox.family AND job.attempt_id = outbox.attempt_id
        ORDER BY outbox.family`,
    );
    assert.deepEqual(afterState.rows, beforeState.rows);
    assert.deepEqual(await snapshotAuthoringPersistence(), persistenceBefore);
    assert.deepEqual(
      afterState.rows.map((row) => [row.job_status, row.outbox_status, row.delivery_attempts]),
      [
        ["pending", "pending", 0],
        ["pending", "pending", 0],
        ["pending", "pending", 0],
      ],
    );
    assert.equal(provider.authoringCalls, 0);
  });
});
