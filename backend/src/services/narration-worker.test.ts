import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-narration-worker-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");

const { query } = await import("../db.js");
const {
  dispatchNarrationOutbox,
  enqueueNarration,
  listNarrationEvents,
  nextNarrationBattleId,
  processNextNarration,
} = await import("./narration-worker.js");

async function createBattle(id: string): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO battles
      (id, state_json, side_a_user_id, side_a_character_id,
       side_b_character_id, created_at, updated_at, revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
    [id, "{}", "user-a", "char-a", "char-b", now, now],
  );
}

describe("ordered narration worker", () => {
  it("generates the earliest receipt first and publishes only terminal prose", async () => {
    const battleId = "worker-ordered";
    await createBattle(battleId);
    for (const sequence of [1, 2]) {
      await enqueueNarration({
        battleId,
        receiptId: `${battleId}:phase:${sequence}`,
        sequence,
        phase: "combat",
        combatTurn: sequence,
        frozenInput: { scene: `scene-${sequence}`, privateMarker: "never-public" },
        inputDigest: String(sequence).repeat(64),
      });
    }
    const generated: string[] = [];
    const generator = async (input: unknown) => {
      const scene = (input as { scene: string }).scene;
      generated.push(scene);
      return {
        narrative: { turn: generated.length, narrator: [`done-${scene}`], speeches: [] },
        provider: "stub-fast",
        model: "stub-v1",
        route: "fast" as const,
        httpAttempts: 1,
        tokenCount: 20,
        estimatedCostUsd: 0.0001,
      };
    };
    assert.equal(await processNextNarration({ battleId, ownerId: "worker-a", generator }), "completed");
    assert.equal(await processNextNarration({ battleId, ownerId: "worker-a", generator }), "completed");
    assert.deepEqual(generated, ["scene-1", "scene-2"]);

    const events = await listNarrationEvents(battleId);
    assert.deepEqual(events.map((event) => event.kind), [
      "queued", "queued", "started", "completed", "started", "completed",
    ]);
    const publicJson = JSON.stringify(events);
    assert.doesNotMatch(publicJson, /never-public|stub-fast|stub-v1|tokenCount/);
    assert.match(publicJson, /done-scene-1/);
  });

  it("deduplicates enqueue and fails closed on input digest drift", async () => {
    const battleId = "worker-dedup";
    await createBattle(battleId);
    const base = {
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "prologue" as const,
      combatTurn: null,
      frozenInput: { scene: "arena" },
      inputDigest: "a".repeat(64),
    };
    await enqueueNarration(base);
    await enqueueNarration(base);
    assert.equal((await listNarrationEvents(battleId)).length, 1);
    await assert.rejects(
      enqueueNarration({ ...base, inputDigest: "b".repeat(64) }),
      /NARRATION_INPUT_DIGEST_CONFLICT/,
    );
  });

  it("bounds retries and releases the successor with a terminal fallback", async () => {
    const battleId = "worker-fallback";
    await createBattle(battleId);
    for (const sequence of [1, 2]) {
      await enqueueNarration({
        battleId,
        receiptId: `${battleId}:phase:${sequence}`,
        sequence,
        phase: "combat",
        combatTurn: sequence,
        frozenInput: { scene: `fallback-${sequence}` },
        inputDigest: "c".repeat(64),
      });
    }
    const failing = async () => {
      throw new Error("provider_down_private_detail");
    };
    assert.equal(
      await processNextNarration({ battleId, ownerId: "worker-a", generator: failing }),
      "retry_queued",
    );
    assert.equal(
      await processNextNarration({ battleId, ownerId: "worker-a", generator: failing }),
      "failed",
    );
    assert.equal(
      await processNextNarration({
        battleId,
        ownerId: "worker-a",
        generator: async () => ({
          narrative: { turn: 2, narrator: ["successor"], speeches: [] },
          provider: "stub",
          model: null,
          route: "fast",
          httpAttempts: 1,
          tokenCount: 1,
          estimatedCostUsd: 0,
        }),
      }),
      "completed",
    );
    const terminal = (await listNarrationEvents(battleId))
      .filter((event) => event.kind === "failed" || event.kind === "completed");
    assert.deepEqual(terminal.map((event) => event.kind), ["failed", "completed"]);
  });

  it("rejects a stale worker after its fencing lease is replaced", async () => {
    const battleId = "worker-fence";
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "fence" },
      inputDigest: "d".repeat(64),
    });
    await assert.rejects(
      processNextNarration({
        battleId,
        ownerId: "stale-worker",
        generator: async () => {
          await query(
            `UPDATE battle_narration_leases
                SET owner_id = 'takeover', fencing_token = fencing_token + 1,
                    expires_at = $2
              WHERE battle_id = $1`,
            [battleId, new Date(Date.now() + 60_000).toISOString()],
          );
          return {
            narrative: { turn: 1, narrator: ["must-not-publish"], speeches: [] },
            provider: "stub",
            model: null,
            route: "fast" as const,
            httpAttempts: 1,
            tokenCount: 1,
            estimatedCostUsd: 0,
          };
        },
      }),
      /NARRATION_STALE_FENCE/,
    );
    assert.doesNotMatch(JSON.stringify(await listNarrationEvents(battleId)), /must-not-publish/);
  });

  it("redelivers an outbox item until authenticated dispatch succeeds", async () => {
    const battleId = "worker-outbox";
    await query("DELETE FROM battle_narration_outbox");
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "outbox" },
      inputDigest: "e".repeat(64),
    });
    const deliveries: string[] = [];
    assert.deepEqual(
      await dispatchNarrationOutbox(async (delivery) => {
        deliveries.push(delivery.outboxId);
        throw new Error("push unavailable");
      }),
      { delivered: 0, failed: 1 },
    );
    assert.deepEqual(
      await dispatchNarrationOutbox(async (delivery) => {
        deliveries.push(delivery.outboxId);
      }),
      { delivered: 1, failed: 0 },
    );
    assert.equal(deliveries.length, 2);
    assert.deepEqual(await dispatchNarrationOutbox(async () => undefined), {
      delivered: 0,
      failed: 0,
    });
  });

  it("selects the oldest ready battle and permits a fenced heartbeat", async () => {
    const firstBattle = "worker-fair-first";
    const secondBattle = "worker-fair-second";
    await createBattle(firstBattle);
    await createBattle(secondBattle);
    await enqueueNarration({
      battleId: firstBattle,
      receiptId: `${firstBattle}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "first" },
      inputDigest: "f".repeat(64),
      now: "2026-01-01T00:00:00.000Z",
    });
    await enqueueNarration({
      battleId: secondBattle,
      receiptId: `${secondBattle}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "second" },
      inputDigest: "0".repeat(64),
      now: "2026-01-02T00:00:00.000Z",
    });
    assert.equal(await nextNarrationBattleId(), firstBattle);
    assert.equal(await processNextNarration({
      battleId: firstBattle,
      ownerId: "heartbeat-worker",
      generator: async (_input, context) => {
        await context?.heartbeat();
        return {
          narrative: { turn: 1, narrator: ["heartbeat-ok"], speeches: [] },
          provider: "stub",
          model: null,
          route: "fast",
          httpAttempts: 1,
          tokenCount: 1,
          estimatedCostUsd: 0,
        };
      },
    }), "completed");
    assert.equal(await nextNarrationBattleId(), secondBattle);
  });
});
