import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "kshiai-authoring-jobs-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "jobs.db");
process.env.LLM_PROVIDER = "mock";

const { closeDatabase, query } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const characterRepo = await import("../repositories/characters.js");
const characterAssetRepo = await import("../repositories/character-assets-v2.js");
const {
  drainCharacterAuthoringJobs,
  processNextCharacterAuthoringJob,
} = await import("./character-authoring-jobs.js");
const { defaultParameters } = await import("@kshiai/shared");

before(async () => {
  const now = "2026-08-15T00:00:00.000Z";
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3)`,
    ["job-owner", "job-owner", now],
  );
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("character authoring jobs", () => {
  it("begins without calling the provider and latest failed hides an older draft", async () => {
    const llm = new MockLlmProvider();
    const first = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      kind: "create",
      idempotencyKey: "job-create-ok",
      requestDigest: "a".repeat(64),
      sourceText: "成功する作成",
      sourceDigest: "b".repeat(64),
    });
    assert.equal(first.attempt.status, "pending_structure");
    await drainCharacterAuthoringJobs({ llm, workerId: "job-test" });
    const ready = await characterAssetRepo.getCharacterAuthoringAttempt(
      first.attempt.attemptId,
      "job-owner",
    );
    assert.equal(ready?.status, "awaiting_owner_acceptance");

    class FailProvider extends MockLlmProvider {
      override async generateCharacter(): Promise<never> {
        throw new Error("JOB_PROVIDER_FAIL");
      }
    }
    await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      kind: "create",
      idempotencyKey: "job-create-fail",
      requestDigest: "c".repeat(64),
      sourceText: "失敗する作成",
      sourceDigest: "d".repeat(64),
    });
    await drainCharacterAuthoringJobs({
      llm: new FailProvider(),
      workerId: "job-test-fail",
    });
    const latest = await characterAssetRepo.getLatestCharacterAuthoringAttempt(
      "job-owner",
    );
    assert.equal(latest?.status, "failed");
    assert.equal(latest?.errorCode, "JOB_PROVIDER_FAIL");
    assert.equal(latest?.candidate, null);
  });

  it("does not claim a second job for the same character", async () => {
    const now = "2026-08-15T00:00:00.000Z";
    await characterRepo.saveSheet({
      id: "job-ready-char",
      ownerUserId: "job-owner",
      displayName: "準備済み",
      tags: [],
      createdAt: now,
      updatedAt: now,
      appearance: {
        summary: "外見",
        visualPrompt: "portrait",
        imageUrl: null,
      },
      traits: [],
      parameters: defaultParameters(),
      skills: [],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "紹介",
      visibility: "public",
    });
    await query(
      `INSERT INTO character_asset_states
        (character_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', NULL, NULL, NULL, $2)
       ON CONFLICT (character_id) DO UPDATE
         SET compatibility_status = 'ready', updated_at = EXCLUDED.updated_at`,
      ["job-ready-char", now],
    );
    await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      characterId: "job-ready-char",
      kind: "upgrade",
      idempotencyKey: "job-upgrade-1",
      requestDigest: "e".repeat(64),
      sourceText: "少し強く",
      sourceDigest: "f".repeat(64),
    });
    await assert.rejects(
      () => characterAssetRepo.beginCharacterAuthoringAttempt({
        ownerUserId: "job-owner",
        characterId: "job-ready-char",
        kind: "upgrade",
        idempotencyKey: "job-upgrade-2",
        requestDigest: "g".repeat(64),
        sourceText: "もう一度",
        sourceDigest: "h".repeat(64),
      }),
      /AUTHORING_ALREADY_IN_PROGRESS/,
    );
    const first = await processNextCharacterAuthoringJob({
      llm: new MockLlmProvider(),
      workerId: "job-test-single",
    });
    assert.equal(first, "completed");
  });
});
