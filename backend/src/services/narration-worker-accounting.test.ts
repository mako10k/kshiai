// R: Verify narration budget failures retain attempt accounting across worker orchestration boundaries.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "narration-accounting-")), "test.db");
const { query } = await import("../db.js");
const { enqueueNarration, processNextNarration } = await import("./narration-worker.js");

async function queuedBattle(battleId: string): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO battles
      (id, state_json, side_a_user_id, side_a_character_id, side_b_character_id, created_at, updated_at, revision)
     VALUES ($1, '{}', 'owner', 'a', 'b', $2, $2, 0)`,
    [battleId, now],
  );
  await enqueueNarration({
    battleId,
    receiptId: `${battleId}:1`,
    sequence: 1,
    phase: "combat",
    combatTurn: 1,
    frozenInput: { scene: "arena" },
    inputDigest: "a".repeat(64),
  });
}

test("retains returned provider usage when its token ceiling rejects publication", async () => {
  const battleId = "returned-budget";
  await queuedBattle(battleId);
  assert.equal(await processNextNarration({
    battleId,
    ownerId: "worker",
    generator: async () => ({
      narrative: { turn: 1, narrator: ["not published"], speeches: [] },
      provider: "accounted",
      model: "model",
      route: "fast",
      httpAttempts: 1,
      tokenCount: 12_001,
      estimatedCostUsd: 0.25,
    }),
  }), "failed");
  const attempts = await query<{ provider: string; token_count: number; estimated_cost_usd: number; fallback_reason: string }>(
    "SELECT provider, token_count, estimated_cost_usd, fallback_reason FROM battle_narration_attempts WHERE battle_id = $1",
    [battleId],
  );
  assert.deepEqual(attempts.rows[0], {
    provider: "accounted", token_count: 12_001, estimated_cost_usd: 0.25, fallback_reason: "budget_exhausted",
  });
  assert.equal((await query("SELECT 1 FROM battle_presentations WHERE battle_id = $1", [battleId])).rowCount, 0);
});

test("retains thrown provider usage and stops retries at the HTTP ceiling", async () => {
  const battleId = "thrown-budget";
  await queuedBattle(battleId);
  assert.equal(await processNextNarration({
    battleId,
    ownerId: "worker",
    generator: async () => {
      throw Object.assign(new Error("provider unavailable"), { httpAttempts: 4, tokenCount: 27, estimatedCostUsd: 0.1 });
    },
  }), "failed");
  const attempts = await query<{ http_attempts: number; token_count: number; estimated_cost_usd: number; fallback_reason: string }>(
    "SELECT http_attempts, token_count, estimated_cost_usd, fallback_reason FROM battle_narration_attempts WHERE battle_id = $1",
    [battleId],
  );
  assert.deepEqual(attempts.rows[0], {
    http_attempts: 4, token_count: 27, estimated_cost_usd: 0.1, fallback_reason: "budget_exhausted",
  });
  assert.equal((await query("SELECT 1 FROM battle_narration_leases WHERE battle_id = $1", [battleId])).rowCount, 0);
});
