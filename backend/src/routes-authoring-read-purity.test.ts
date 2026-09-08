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

    const paths = [
      "/api/character-drafts/latest",
      `/api/character-drafts/${character.attempt.attemptId}`,
      "/api/battlefield-drafts/latest",
      `/api/battlefield-drafts/${battlefield.attempt.attemptId}`,
      "/api/narration-style-drafts/latest",
      `/api/narration-style-drafts/${narration.attempt.attemptId}`,
    ];
    for (const path of paths) {
      const response = await app.request(path, { headers: authHeaders });
      assert.equal(response.status, 200, path);
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
