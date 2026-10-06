// R: Verify narrator-only budget authority, atomic proof persistence and world-fence preservation.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AwarenessInitialize, AwarenessObservedPolicy } from "@kshiai/shared";
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "narration-reserve-")), "test.db");
const { query, withTransaction } = await import("../db.js");
const { initializeAwarenessRuntime, getAwarenessRuntime, mutateAwarenessRuntime } = await import("./battle-awareness.js");
const { reserveNarrationAttempt, reserveNarrationAttemptInTransaction } = await import("./battle-awareness-narration-reservation.js");
const now = "2026-10-06T00:00:00.000Z";
async function fixture(id: string) {
  await query("INSERT INTO battles(id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at) VALUES($1,'{}','u','a','b',$2,$2)", [id, now]);
  await query("INSERT INTO battle_leases(battle_id,owner_id,fencing_token,acquired_at,expires_at) VALUES($1,'world',7,$2,'2026-10-06T00:02:00.000Z')", [id, now]);
  await initializeAwarenessRuntime({
    battleId: id, now, fence: {
      battleId: id, ownerId: "world", fencingToken: 7,
    },
    runtime: AwarenessInitialize({
      startedAt: Date.parse(now), promptRevision: "test", outputRevision: "test", policy: AwarenessObservedPolicy,
    }),
  });
  await query("INSERT INTO battle_narration_leases(battle_id,owner_id,fencing_token,updated_at,expires_at) VALUES($1,'narrator',3,$2,'2026-10-06T00:01:00.000Z')", [id, now]);
  await query(`INSERT INTO battle_narration_entries(battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,status,active_attempt_id,created_at,updated_at)
    VALUES($1,'receipt',1,'combat',1,'{}','digest','generating',$2,$3,$3)`, [id, `${id}:attempt`, now]);
  await query("INSERT INTO battle_narration_attempts(attempt_id,battle_id,receipt_id,fencing_token,status,provider,route,started_at) VALUES($1,$2,'receipt',3,'generating','xai','fast',$3)", [`${id}:attempt`, id, now]);
  await query(`INSERT INTO battle_awareness_narration_batches(attempt_id,battle_id,fencing_token,receipt_ids_json,deadline_at,status,created_at,updated_at)
    VALUES($1,$2,3,'["receipt"]','2026-10-06T00:00:30.000Z','claimed',$3,$3)`, [`${id}:attempt`, id, now]);
  return {
    battleId: id, ownerId: "narrator", fencingToken: 3, attemptId: `${id}:attempt`, receiptIds: ["receipt"], now, requestDigest: "proof", pricingRevision: "unpriced", maximumUsd: null,
  };
}
test("narrator reserves while world lease is live, preserving world fence and fresh world CAS budget", async () => {
  const input = await fixture("independent");
  const before = await getAwarenessRuntime(input.battleId);
  assert.ok(before);
  await reserveNarrationAttempt(input);
  const after = await getAwarenessRuntime(input.battleId);
  assert.ok(after);
  assert.equal(after.fencingToken, 7);
  assert.equal(after.runtime.budget.physicalAttempts, 1);
  assert.equal(after.runtime.budget.physicalOutstanding, 1);
  const fence = {
    battleId: input.battleId, ownerId: "world", fencingToken: 7,
  };
  await assert.rejects(mutateAwarenessRuntime({
    battleId: input.battleId, now, fence, expectedRevision: before.revision,
  }, state => ({
    ...state, tick: 1,
  })), /REVISION_OR_LEASE_CONFLICT/);
  await mutateAwarenessRuntime({
    battleId: input.battleId, now, fence, expectedRevision: after.revision,
  }, state => ({
    ...state, tick: 1,
  }));
  assert.equal((await getAwarenessRuntime(input.battleId))?.runtime.budget.reservations[0]?.id, input.attemptId);
  assert.equal((await query<{
    status: string;
    request_digest: string;
  }>("SELECT status,request_digest FROM battle_awareness_narration_batches WHERE attempt_id=$1", [input.attemptId])).rows[0]?.request_digest, "proof");
  await assert.rejects(reserveNarrationAttempt(input), /CAPABILITY_INVALID|ALREADY_RESERVED/);
});
test("stale, expired or incorrectly linked narrator capabilities never reserve", async () => {
  for (const mode of ["owner", "fence", "expired", "link", "receipts", "attempt"]) {
    const input = await fixture(`reject-${mode}`);
    if (mode === "owner") {
      input.ownerId = "other";
    }
    if (mode === "fence") {
      input.fencingToken = 2;
    }
    if (mode === "expired") {
      await query("UPDATE battle_narration_leases SET expires_at=$2 WHERE battle_id=$1", [input.battleId, now]);
    }
    if (mode === "link") {
      await query("UPDATE battle_narration_entries SET active_attempt_id='other' WHERE battle_id=$1", [input.battleId]);
    }
    if (mode === "attempt") {
      await query("UPDATE battle_narration_attempts SET status='abandoned' WHERE attempt_id=$1", [input.attemptId]);
    }
    if (mode === "receipts") {
      input.receiptIds = ["other"];
    }
    await assert.rejects(reserveNarrationAttempt(input));
    assert.equal((await getAwarenessRuntime(input.battleId))?.runtime.budget.physicalAttempts, 0);
  }
});
test("budget and inactive bounds remain enforced and transaction rollback removes proof and reservation", async () => {
  for (const mode of ["inactive", "budget", "rollback"]) {
    const input = await fixture(`bounds-${mode}`);
    if (mode !== "rollback") {
      const current = await getAwarenessRuntime(input.battleId);
      assert.ok(current);
      await mutateAwarenessRuntime({
        battleId: input.battleId, now, expectedRevision: current.revision, fence: {
          battleId: input.battleId, ownerId: "world", fencingToken: 7,
        },
      }, state => mode === "inactive"
        ? {
          ...state, status: "incomplete", incompleteReason: "test",
        }
        : {
          ...state, budget: {
            ...state.budget, physicalAttempts: 1, physicalOutstanding: 1, reservations: [{
                id: "existing", role: "narration", status: "reserved", maximumUsd: null, actualUsd: null, physicalOutstanding: true,
              }], unknownAttemptIds: ["existing"],
          },
        });
      await assert.rejects(reserveNarrationAttempt(input), /INACTIVE|BUDGET_ADMISSION_REJECTED/);
    }
    else {
      await assert.rejects(withTransaction(async (connection) => {
        await reserveNarrationAttemptInTransaction(connection, input);
        throw new Error("rollback");
      }), /rollback/);
      assert.equal((await getAwarenessRuntime(input.battleId))?.runtime.budget.physicalAttempts, 0);
      assert.equal((await query<{ status: string }>("SELECT status FROM battle_awareness_narration_batches WHERE attempt_id=$1", [input.attemptId])).rows[0]?.status, "claimed");
    }
  }
});
