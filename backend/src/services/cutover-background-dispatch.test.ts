// R: Verify configured cutover closure at dispatcher and direct worker entrypoints.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "kshiai-cutover-background-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "cutover-background.db");

const { config } = await import("../config.js");
const { closeDatabase, query } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { initializeCutoverControl } = await import(
  "../repositories/cutover-control.js"
);
const {
  dispatchPendingAuthoringTasks,
  enqueueAuthoringTask,
} = await import("./authoring-task-dispatch.js");
const {
  processNextCharacterAuthoringJob,
  wakeCharacterAuthoringJobs,
} = await import("./character-authoring-jobs.js");
const {
  dispatchPendingNarrationTasks,
  enqueueNarrationTask,
} = await import("./narration-task-dispatch.js");
const { enqueueNarration, processNextNarration } = await import(
  "./narration-worker.js"
);

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("configured cutover background closure", () => {
  it("keeps closed dispatch, enqueue, wake, and workers free of side effects", async (t) => {
    const now = "2026-09-30T06:00:00.000Z";
    await query(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id,
         side_b_character_id, created_at, updated_at, revision)
       VALUES ('closed-battle', '{}', 'closed-owner', 'a', 'b', $1, $1, 0)`,
      [now],
    );
    await enqueueNarration({
      battleId: "closed-battle",
      receiptId: "closed-battle:phase:1",
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "closed" },
      inputDigest: "c".repeat(64),
      now,
    });
    await query(
      `UPDATE battle_narration_outbox
          SET status = 'dispatched', dispatched_at = $1
        WHERE battle_id = 'closed-battle'`,
      [now],
    );
    await query(
      `INSERT INTO asset_authoring_outbox
        (outbox_id, family, attempt_id, status, created_at)
       VALUES ('closed-authoring-outbox', 'character', 'closed-attempt',
               'pending', $1)`,
      [now],
    );

    const cutoverId = "closed-background-cutover";
    const artifactId = "closed-background-artifact";
    await initializeCutoverControl({
      phase: "closed",
      operationId: "initialize-closed-background",
      operatorId: "operator",
      policy: {
        cutoverId,
        artifactId,
        ownerUserId: "closed-owner",
        ownerCandidates: [
          { attemptId: "candidate-a", candidateDigest: "a".repeat(64) },
          { attemptId: "candidate-b", candidateDigest: "b".repeat(64) },
        ],
        trialBindings: null,
        taskBattleIds: [],
        stageAcceptance: {
          health: null,
          postgres: null,
          email: null,
          google: null,
          ownership: null,
          r2: null,
          sse: null,
          directProtection: null,
        },
        productionReceipt: null,
      },
    });
    config.cutover = { cutoverId, artifactId };
    Object.assign(config.narrationTaskQueue, {
      configured: true,
      project: "project",
      location: "location",
      queue: "narration",
      targetUrl: "https://example.invalid/narration",
      serviceAccountEmail: "worker@example.invalid",
      audience: "https://example.invalid/narration",
    });
    Object.assign(config.authoringTaskQueue, {
      configured: true,
      project: "project",
      location: "location",
      queue: "authoring",
      targetUrl: "https://example.invalid/authoring",
      serviceAccountEmail: "worker@example.invalid",
      audience: "https://example.invalid/authoring",
    });
    let networkCalls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      networkCalls += 1;
      throw new Error("closed cutover must not reach transport");
    });

    assert.deepEqual(await dispatchPendingNarrationTasks(), {
      delivered: 0,
      failed: 0,
    });
    assert.deepEqual(await dispatchPendingAuthoringTasks(), {
      delivered: 0,
      failed: 0,
    });
    await assert.rejects(
      enqueueNarrationTask({
        outboxId: "closed-outbox",
        battleId: "closed-battle",
        receiptId: "closed-battle:phase:1",
        deliveryGeneration: 0,
      }),
      /cutover_unavailable/,
    );
    await assert.rejects(
      enqueueAuthoringTask({
        outboxId: "closed-authoring-outbox",
        family: "character",
        attemptId: "closed-attempt",
        deliveryGeneration: 0,
      }),
      /cutover_unavailable/,
    );
    let generatorCalls = 0;
    await assert.rejects(
      processNextNarration({
        battleId: "closed-battle",
        ownerId: "closed-worker",
        generator: async () => {
          generatorCalls += 1;
          throw new Error("closed cutover must not reach provider");
        },
      }),
      /cutover_unavailable/,
    );
    await assert.rejects(
      processNextCharacterAuthoringJob({ llm: new MockLlmProvider() }),
      /cutover_unavailable/,
    );
    wakeCharacterAuthoringJobs(new MockLlmProvider());
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(networkCalls, 0);
    assert.equal(generatorCalls, 0);
    const narration = await query<{
      status: string;
      delivery_generation: number;
      delivery_attempts: number;
    }>(
      `SELECT status, delivery_generation, delivery_attempts
         FROM battle_narration_outbox WHERE battle_id = 'closed-battle'`,
    );
    assert.deepEqual(narration.rows[0], {
      status: "dispatched",
      delivery_generation: 0,
      delivery_attempts: 0,
    });
    const authoring = await query<{ status: string; delivery_attempts: number }>(
      `SELECT status, delivery_attempts FROM asset_authoring_outbox
        WHERE outbox_id = 'closed-authoring-outbox'`,
    );
    assert.deepEqual(authoring.rows[0], {
      status: "pending",
      delivery_attempts: 0,
    });
  });
});
