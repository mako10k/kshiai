import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { LlmProvider } from "../llm/types.js";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-narration-worker-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");

const { query } = await import("../db.js");
const {
  createLlmNarrationGenerator,
  dispatchNarrationOutbox,
  enqueueNarration,
  getBattleNarrationSnapshot,
  listNarrationEvents,
  nextNarrationBattleId,
  processNextNarration,
  recoverStaleNarrationOutbox,
  readBattleNarrationEvents,
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
  it("claims only the exact receipt generation and defers successors without provider work", async () => {
    const battleId = "worker-exact-receipt";
    await createBattle(battleId);
    for (const sequence of [1, 2]) {
      await enqueueNarration({
        battleId,
        receiptId: `${battleId}:phase:${sequence}`,
        sequence,
        phase: "combat",
        combatTurn: sequence,
        frozenInput: { scene: `exact-${sequence}` },
        inputDigest: String(sequence).repeat(64),
      });
    }
    const outboxes = await query<{
      outbox_id: string;
      receipt_id: string;
      delivery_generation: number;
    }>(
      `SELECT outbox_id, receipt_id, delivery_generation
         FROM battle_narration_outbox
        WHERE battle_id = $1 ORDER BY receipt_id`,
      [battleId],
    );
    const first = outboxes.rows[0]!;
    const second = outboxes.rows[1]!;
    const dispatched: string[] = [];
    assert.deepEqual(await dispatchNarrationOutbox(async (delivery) => {
      dispatched.push(delivery.receiptId);
    }), { delivered: 1, failed: 0 });
    assert.deepEqual(dispatched, [first.receipt_id]);
    await query(
      `UPDATE battle_narration_outbox SET status = 'dispatched'
        WHERE battle_id = $1 AND receipt_id = $2`,
      [battleId, second.receipt_id],
    );
    const generated: string[] = [];
    const generator = async (raw: unknown) => {
      const scene = (raw as { scene: string }).scene;
      generated.push(scene);
      return {
        narrative: { turn: generated.length, narrator: [scene], speeches: [] },
        provider: "stub",
        model: null,
        route: "fast" as const,
        httpAttempts: 1,
        tokenCount: 1,
        estimatedCostUsd: 0,
      };
    };

    assert.equal(await processNextNarration({
      battleId,
      receiptId: second.receipt_id,
      outboxId: second.outbox_id,
      deliveryGeneration: Number(second.delivery_generation),
      ownerId: `task:${second.outbox_id}:0`,
      generator,
    }), "deferred");
    assert.deepEqual(generated, []);
    assert.equal(await processNextNarration({
      battleId,
      receiptId: first.receipt_id,
      outboxId: first.outbox_id,
      deliveryGeneration: Number(first.delivery_generation),
      ownerId: `task:${first.outbox_id}:0`,
      generator,
    }), "completed");
    assert.deepEqual(generated, ["exact-1"]);
    assert.equal(await processNextNarration({
      battleId,
      receiptId: first.receipt_id,
      outboxId: first.outbox_id,
      deliveryGeneration: Number(first.delivery_generation),
      ownerId: `task:${first.outbox_id}:0:stale`,
      generator,
    }), "acknowledged");
    assert.deepEqual(generated, ["exact-1"]);
    assert.equal(await processNextNarration({
      battleId,
      receiptId: second.receipt_id,
      outboxId: second.outbox_id,
      deliveryGeneration: Number(second.delivery_generation),
      ownerId: `task:${second.outbox_id}:0`,
      generator,
    }), "completed");
    assert.deepEqual(generated, ["exact-1", "exact-2"]);
  });

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
    const presentations = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM battle_presentations WHERE battle_id = $1",
      [battleId],
    );
    assert.equal(Number(presentations.rows[0]?.count), 2);
  });

  it("invokes the phase-specific provider only from the worker generator", async () => {
    const called: string[] = [];
    const llm = {
      name: "worker-only-provider",
      models: { engine: "standard", fast: "light" },
      narrateTurn: async (request: { view: { turn: number } }) => {
        called.push("combat");
        return { turn: request.view.turn, narrator: ["combat"], speeches: [] };
      },
      narratePrologue: async () => {
        called.push("prologue");
        return { turn: 0, narrator: ["prologue"], speeches: [] };
      },
      narrateAftermath: async () => {
        called.push("aftermath");
        return { before: ["before"], after: ["after"], speeches: [] };
      },
      narrateJudgment: async () => {
        called.push("judgment");
        return { before: ["before"], after: ["after"] };
      },
    } as unknown as LlmProvider;
    const generate = createLlmNarrationGenerator(llm);

    const combat = await generate({ kind: "combat", request: { view: { turn: 3 } } });
    const prologue = await generate({ kind: "prologue", request: {} });
    const aftermath = await generate({ kind: "aftermath", request: { turn: 4 } });
    const judgment = await generate({
      kind: "judgment",
      request: {
        turn: 5,
        winnerName: "A",
        adjudicationReason: "canonical facts",
      },
    });

    assert.deepEqual(called, ["combat", "prologue", "aftermath", "judgment"]);
    assert.equal(combat.model, "light");
    assert.equal(prologue.narrative.turn, 0);
    assert.equal(aftermath.narrative.turn, 4);
    assert.match(judgment.narrative.narrator.join(" "), /A.*canonical facts/);
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
    const battle = await query<{ revision: number }>(
      "SELECT revision FROM battles WHERE id = $1",
      [battleId],
    );
    assert.equal(Number(battle.rows[0]?.revision), 0);
  });

  it("does not retry an observation accounting stop", async () => {
    const battleId = "worker-accounting-stop";
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "accounting-stop" },
      inputDigest: "f".repeat(64),
    });
    assert.equal(
      await processNextNarration({
        battleId,
        ownerId: "worker-a",
        generator: async () => {
          throw new Error("PROVIDER_OPERATION_CEILING_EXHAUSTED");
        },
      }),
      "failed",
    );
    const attempts = await query<{ count: number; status: string }>(
      `SELECT COUNT(*) AS count, MIN(status) AS status
         FROM battle_narration_attempts WHERE battle_id = $1`,
      [battleId],
    );
    assert.equal(Number(attempts.rows[0]?.count), 1);
    assert.equal(attempts.rows[0]?.status, "failed");
  });

  it("does not hold the battle transaction while narration is generating", async () => {
    const battleId = "worker-independent-advance";
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "slow narration" },
      inputDigest: "9".repeat(64),
    });
    let releaseGeneration: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const processing = processNextNarration({
      battleId,
      ownerId: "slow-worker",
      generator: async () => {
        markStarted?.();
        await generationStarted;
        return {
          narrative: { turn: 1, narrator: ["complete"], speeches: [] },
          provider: "stub",
          model: null,
          route: "fast",
          httpAttempts: 1,
          tokenCount: 1,
          estimatedCostUsd: 0,
        };
      },
    });
    await started;
    const updated = await query(
      "UPDATE battles SET revision = revision + 1 WHERE id = $1",
      [battleId],
    );
    assert.equal(updated.rowCount, 1);
    releaseGeneration?.();
    assert.equal(await processing, "completed");
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

  it("re-arms a stale dispatched outbox with a new delivery generation", async () => {
    const battleId = "worker-outbox-recovery";
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "recover" },
      inputDigest: "f".repeat(64),
      now: "2026-08-12T00:00:00.000Z",
    });
    await query(
      `UPDATE battle_narration_outbox SET status = 'dispatched', dispatched_at = $2
        WHERE battle_id = $1`,
      [battleId, "2026-08-12T00:00:01.000Z"],
    );
    assert.equal(
      await recoverStaleNarrationOutbox(new Date("2026-08-12T00:10:00.000Z")),
      1,
    );
    const recovered = await query<{
      status: string;
      delivery_generation: number;
    }>(
      `SELECT status, delivery_generation FROM battle_narration_outbox
        WHERE battle_id = $1`,
      [battleId],
    );
    assert.deepEqual(recovered.rows[0], {
      status: "pending",
      delivery_generation: 1,
    });
    assert.equal(
      await recoverStaleNarrationOutbox(new Date("2026-08-12T00:20:00.000Z")),
      0,
    );
  });

  it("does not recover generating work while its fenced lease is active", async () => {
    const battleId = "worker-outbox-active-lease";
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "active" },
      inputDigest: "a".repeat(64),
      now: "2026-08-12T00:00:00.000Z",
    });
    await query(
      `UPDATE battle_narration_entries SET status = 'generating'
        WHERE battle_id = $1`,
      [battleId],
    );
    await query(
      `UPDATE battle_narration_outbox SET status = 'dispatched', dispatched_at = $2
        WHERE battle_id = $1`,
      [battleId, "2026-08-12T00:00:01.000Z"],
    );
    await query(
      `INSERT INTO battle_narration_leases
        (battle_id, owner_id, fencing_token, expires_at, updated_at)
       VALUES ($1, 'worker', 1, $2, $3)`,
      [battleId, "2026-08-12T00:20:00.000Z", "2026-08-12T00:00:01.000Z"],
    );
    assert.equal(
      await recoverStaleNarrationOutbox(new Date("2026-08-12T00:10:00.000Z")),
      0,
    );
    await query(
      `UPDATE battle_narration_leases SET expires_at = $2 WHERE battle_id = $1`,
      [battleId, "2026-08-12T00:09:00.000Z"],
    );
    assert.equal(
      await recoverStaleNarrationOutbox(new Date("2026-08-12T00:10:00.000Z")),
      1,
    );
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

  it("provides opaque cursor replay and terminal-only public snapshots", async () => {
    const battleId = "worker-public-read";
    await createBattle(battleId);
    await enqueueNarration({
      battleId,
      receiptId: `${battleId}:phase:1`,
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "private-scene", privateMarker: "must-not-leak" },
      inputDigest: "1".repeat(64),
    });
    const initial = await getBattleNarrationSnapshot(battleId);
    assert.equal(initial.entries[0]?.status, "queued");
    assert.equal(initial.entries[0]?.narrative, null);
    assert.doesNotMatch(JSON.stringify(initial), /must-not-leak|private-scene/);
    const replay = await readBattleNarrationEvents({ battleId });
    assert.equal(replay.events.length, 1);
    assert.ok(replay.cursor);
    assert.doesNotMatch(replay.cursor, /battle|event|:/);
    assert.deepEqual(
      await readBattleNarrationEvents({ battleId, cursor: replay.cursor }),
      { events: [], cursor: replay.cursor },
    );
    await processNextNarration({
      battleId,
      ownerId: "public-read-worker",
      generator: async () => ({
        narrative: { turn: 1, narrator: ["terminal-public"], speeches: [] },
        provider: "stub",
        model: null,
        route: "fast",
        httpAttempts: 1,
        tokenCount: 1,
        estimatedCostUsd: 0,
      }),
    });
    await query(
      `DELETE FROM battle_narration_events
        WHERE battle_id = $1 AND event_sequence <= 2`,
      [battleId],
    );
    const reset = await readBattleNarrationEvents({ battleId, cursor: replay.cursor });
    assert.equal(reset.events[0]?.type, "reset");
    assert.match(JSON.stringify(reset), /terminal-public/);
    await assert.rejects(
      readBattleNarrationEvents({ battleId, cursor: "not-a-cursor" }),
      /NARRATION_CURSOR_INVALID/,
    );
  });
});
