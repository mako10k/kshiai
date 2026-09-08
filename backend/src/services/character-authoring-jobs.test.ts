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
const battlefieldAssetRepo = await import("../repositories/battlefield-assets-v2.js");
const narrationStyleAssetRepo = await import(
  "../repositories/narration-style-assets-v2.js"
);
const {
  drainCharacterAuthoringJobs,
  processAuthoringTask,
  processNextCharacterAuthoringJob,
} = await import("./character-authoring-jobs.js");
const familyJobs = await import("../repositories/family-authoring-jobs.js");
const { defaultBasicAttack, defaultParameters } = await import("@kshiai/shared");

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
      basicAttack: defaultBasicAttack(),
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

  it("delivers one exact job from the environment-global queue", async () => {
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, 'x', $3)`,
      ["job-owner-two", "job-owner-two", "2026-09-08T00:00:00.000Z"],
    );
    const first = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      kind: "create",
      idempotencyKey: "exact-owner-one",
      requestDigest: "i".repeat(64),
      sourceText: "owner one",
      sourceDigest: "j".repeat(64),
    });
    const second = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner-two",
      kind: "create",
      idempotencyKey: "exact-owner-two",
      requestDigest: "k".repeat(64),
      sourceText: "owner two",
      sourceDigest: "l".repeat(64),
    });
    const outbox = await query<{
      outbox_id: string;
      family: "character";
      attempt_id: string;
      delivery_generation: number;
    }>(
      `SELECT outbox_id, family, attempt_id, delivery_generation
         FROM asset_authoring_outbox
        WHERE attempt_id = $1`,
      [second.attempt.attemptId],
    );
    const delivery = outbox.rows[0];
    assert.ok(delivery);
    const result = await processAuthoringTask({
      llm: new MockLlmProvider(),
      workerId: "exact-worker",
      delivery: {
        outboxId: delivery.outbox_id,
        family: delivery.family,
        attemptId: delivery.attempt_id,
        deliveryGeneration: Number(delivery.delivery_generation),
      },
    });
    assert.equal(result, "completed");
    assert.equal(
      (await characterAssetRepo.getCharacterAuthoringAttempt(
        first.attempt.attemptId,
        "job-owner",
      ))?.status,
      "pending_structure",
    );
    assert.equal(
      (await characterAssetRepo.getCharacterAuthoringAttempt(
        second.attempt.attemptId,
        "job-owner-two",
      ))?.status,
      "awaiting_owner_acceptance",
    );
    assert.equal(await processAuthoringTask({
      llm: new MockLlmProvider(),
      workerId: "exact-worker-duplicate",
      delivery: {
        outboxId: delivery.outbox_id,
        family: delivery.family,
        attemptId: delivery.attempt_id,
        deliveryGeneration: Number(delivery.delivery_generation),
      },
    }), "acknowledged");
  });

  it("rejects a stale worker after the exact job is reclaimed", async () => {
    const attempt = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      kind: "create",
      idempotencyKey: "stale-fence-owner",
      requestDigest: "m".repeat(64),
      sourceText: "stale fence",
      sourceDigest: "n".repeat(64),
    });
    const firstNow = new Date("2026-09-08T01:00:00.000Z");
    const first = await familyJobs.claimFamilyAuthoringJob({
      family: "character",
      attemptId: attempt.attempt.attemptId,
      workerId: "worker-old",
      now: firstNow,
      cap: 10,
    });
    assert.notEqual(first, "busy");
    assert.notEqual(first, "terminal");
    if (first === "busy" || first === "terminal") return;
    const second = await familyJobs.claimFamilyAuthoringJob({
      family: "character",
      attemptId: attempt.attempt.attemptId,
      workerId: "worker-new",
      now: new Date(firstNow.getTime() + familyJobs.AUTHORING_JOB_CLAIM_MS + 1),
      cap: 10,
    });
    assert.notEqual(second, "busy");
    assert.notEqual(second, "terminal");
    if (second === "busy" || second === "terminal") return;
    assert.ok(second.executionFence.fencingToken > first.executionFence.fencingToken);
    await assert.rejects(
      () => characterAssetRepo.updateCharacterAuthoringStatus({
        attemptId: attempt.attempt.attemptId,
        ownerUserId: "job-owner",
        status: "generating_structure",
        executionFence: first.executionFence,
      }),
      /AUTHORING_STALE_FENCE/,
    );
    await assert.rejects(
      () => characterAssetRepo.discardCharacterAuthoringAttempt(
        attempt.attempt.attemptId,
        "job-owner",
      ),
      /AUTHORING_JOB_CLAIMED/,
    );
    assert.equal(
      (await characterAssetRepo.getCharacterAuthoringAttempt(
        attempt.attempt.attemptId,
        "job-owner",
      ))?.status,
      "pending_structure",
    );
  });

  it("re-arms only stale deliveries without an active lease", async () => {
    const stale = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      kind: "create",
      idempotencyKey: "stale-outbox-pending",
      requestDigest: "s".repeat(64),
      sourceText: "stale outbox pending",
      sourceDigest: "t".repeat(64),
    });
    const active = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner-two",
      kind: "create",
      idempotencyKey: "stale-outbox-active",
      requestDigest: "u".repeat(64),
      sourceText: "stale outbox active",
      sourceDigest: "v".repeat(64),
    });
    const now = new Date("2026-09-08T04:00:00.000Z");
    const activeClaim = await familyJobs.claimFamilyAuthoringJob({
      family: "character",
      attemptId: active.attempt.attemptId,
      workerId: "active-outbox-worker",
      now,
      cap: 10,
    });
    assert.notEqual(activeClaim, "busy");
    assert.notEqual(activeClaim, "terminal");
    await query(
      `UPDATE asset_authoring_outbox
          SET status = 'dispatched', dispatched_at = $2
        WHERE attempt_id IN ($1, $3)`,
      [
        stale.attempt.attemptId,
        new Date(now.getTime() - familyJobs.AUTHORING_OUTBOX_STALE_MS - 1)
          .toISOString(),
        active.attempt.attemptId,
      ],
    );

    assert.equal(await familyJobs.recoverStaleAuthoringOutbox(now), 1);
    const rows = await query<{
      attempt_id: string;
      status: string;
      delivery_generation: number;
    }>(
      `SELECT attempt_id, status, delivery_generation
         FROM asset_authoring_outbox
        WHERE attempt_id IN ($1, $2)
        ORDER BY attempt_id`,
      [stale.attempt.attemptId, active.attempt.attemptId],
    );
    const byAttempt = new Map(rows.rows.map((row) => [row.attempt_id, row]));
    assert.deepEqual(byAttempt.get(stale.attempt.attemptId), {
      attempt_id: stale.attempt.attemptId,
      status: "pending",
      delivery_generation: 1,
    });
    assert.deepEqual(byAttempt.get(active.attempt.attemptId), {
      attempt_id: active.attempt.attemptId,
      status: "dispatched",
      delivery_generation: 0,
    });
  });

  it("serializes concurrent exact claims against the environment-global cap", async () => {
    const first = await characterAssetRepo.beginCharacterAuthoringAttempt({
      ownerUserId: "job-owner",
      kind: "create",
      idempotencyKey: "global-cap-first",
      requestDigest: "w".repeat(64),
      sourceText: "global cap first",
      sourceDigest: "x".repeat(64),
    });
    const second = await battlefieldAssetRepo.beginBattlefieldAuthoringAttempt({
      ownerUserId: "job-owner-two",
      kind: "create",
      idempotencyKey: "global-cap-second",
      requestDigest: "y".repeat(64),
      sourceText: "global cap second",
      sourceDigest: "z".repeat(64),
    });
    const now = new Date("2026-09-09T00:00:00.000Z");
    const claims = await Promise.all([
      familyJobs.claimFamilyAuthoringJob({
        family: "character",
        attemptId: first.attempt.attemptId,
        workerId: "global-cap-character",
        now,
        cap: 1,
      }),
      familyJobs.claimFamilyAuthoringJob({
        family: "battlefield",
        attemptId: second.attempt.attemptId,
        workerId: "global-cap-battlefield",
        now,
        cap: 1,
      }),
    ]);
    assert.equal(claims.filter((claim) => claim === "busy").length, 1);
    assert.equal(claims.filter((claim) =>
      claim !== "busy" && claim !== "terminal"
    ).length, 1);
  });

  it("uses the same exact delivery contract for every authoring family", async () => {
    const battlefield = await battlefieldAssetRepo.beginBattlefieldAuthoringAttempt({
      ownerUserId: "job-owner-two",
      kind: "create",
      idempotencyKey: "exact-family-battlefield",
      requestDigest: "o".repeat(64),
      sourceText: "family battlefield",
      sourceDigest: "p".repeat(64),
    });
    const narration = await narrationStyleAssetRepo.beginNarrationStyleAuthoringAttempt({
      ownerUserId: "job-owner-two",
      kind: "create",
      idempotencyKey: "exact-family-narration",
      requestDigest: "q".repeat(64),
      sourceText: "family narration",
      sourceDigest: "r".repeat(64),
    });
    for (const target of [
      { family: "battlefield" as const, attemptId: battlefield.attempt.attemptId },
      { family: "narration_style" as const, attemptId: narration.attempt.attemptId },
    ]) {
      const outbox = await query<{
        outbox_id: string;
        delivery_generation: number;
      }>(
        `SELECT outbox_id, delivery_generation
           FROM asset_authoring_outbox
          WHERE family = $1 AND attempt_id = $2`,
        [target.family, target.attemptId],
      );
      const delivery = outbox.rows[0];
      assert.ok(delivery);
      assert.equal(await processAuthoringTask({
        llm: new MockLlmProvider(),
        workerId: `family-worker:${target.family}`,
        cap: 10,
        delivery: {
          outboxId: delivery.outbox_id,
          family: target.family,
          attemptId: target.attemptId,
          deliveryGeneration: Number(delivery.delivery_generation),
        },
      }), "completed");
    }
    assert.equal(
      (await battlefieldAssetRepo.getBattlefieldAuthoringAttempt(
        battlefield.attempt.attemptId,
        "job-owner-two",
      ))?.status,
      "awaiting_owner_acceptance",
    );
    assert.equal(
      (await narrationStyleAssetRepo.getNarrationStyleAuthoringAttempt(
        narration.attempt.attemptId,
        "job-owner-two",
      ))?.status,
      "awaiting_owner_acceptance",
    );
  });
});
