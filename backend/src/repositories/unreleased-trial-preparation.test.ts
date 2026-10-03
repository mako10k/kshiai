// R: Verify frozen unreleased-trial disposal preparation and rollback on an exact-plan mismatch.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { defaultParameters, type BattleState } from "@kshiai/shared";
import type { UnreleasedTrialPolicy } from "./unreleased-trial-preparation.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-unreleased-trial-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "trial.db");
process.env.AUTH_PROVIDER = "legacy";
const db = await import("../db.js");
const battles = await import("./battles.js");
const trial = await import("./unreleased-trial-preparation.js");
const now = "2026-10-01T01:00:00.000Z";
const meta = { sideAUserId: "trial-user", sideACharacterId: "trial-a", sideBCharacterId: "trial-b" };

function state(id: string, finished: boolean): BattleState {
  const side = (characterId: string) => ({ characterId, displayName: characterId,
    parameters: defaultParameters(), defending: false, canFight: true, irreversibleIncapacitated: false });
  return { id, status: finished ? "finished" : "active", turn: 0, turnLimit: 20,
    sideA: side("trial-a"), sideB: side("trial-b"), policiesA: [], policiesB: [],
    selectedPolicyIdsA: [], selectedPolicyIdsB: [], situation: { scene: "trial", notes: "", coefficients: {}, tags: [] },
    prologuePending: false, aftermathPending: false, turnRecords: [], log: [],
    winnerSide: finished ? "draw" : null, finishReason: finished ? "turn_limit" : null,
    createdAt: now, updatedAt: now, battleRevision: 0 };
}

function policy(): UnreleasedTrialPolicy {
  const stoppedAt = new Date(Date.now() - 10_000).toISOString();
  return { kind: "unreleased-initial-v3-trial", ownerDecisionIdentity: "owner-decision",
    stoppedAt, expiresAt: new Date(Date.parse(stoppedAt) + 1_800_000).toISOString(),
    oldWritersClosedReceiptId: "writers-closed" };
}

before(async () => {
  await db.query("INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$1,'test',$2)", [meta.sideAUserId, now]);
  for (const id of ["trial-a", "trial-b"]) {
    await db.query("INSERT INTO characters (id,owner_user_id,sheet_json,created_at,updated_at) VALUES ($1,$2,'{}',$3,$3)", [id, meta.sideAUserId, now]);
  }
});
after(async () => { await db.closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe("unreleased initial V3 trial preparation", () => {
  it("keeps preview read-only, rolls back a mismatch, then applies and replays exact accounting", async () => {
    const active = state("trial-active", false);
    const finished = state("trial-finished", true);
    await battles.insertNewBattle(active, meta);
    await battles.insertNewBattle(finished, meta);
    await db.query(
      `INSERT INTO battle_narration_entries
        (battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,status,active_attempt_id,
         attempt_count,terminal_narrative_json,fallback_reason,created_at,updated_at)
       VALUES ($1,'finished-receipt',1,'aftermath',0,'{}',$2,'completed',NULL,1,$3,NULL,$4,$4)`,
      [finished.id, "a".repeat(64), JSON.stringify({ narrator: ["done"] }), now],
    );
    await db.query(
      `INSERT INTO battle_narration_outbox
        (outbox_id,battle_id,receipt_id,status,delivery_generation,created_at)
       VALUES ('finished-outbox',$1,'finished-receipt','dispatched',3,$2)`, [finished.id, now],
    );
    await db.query("DROP TABLE battle_discard_receipts");
    const input = { cutoverId: "trial-cutover", cutoverAt: "2026-10-01T02:00:00.000Z" };
    const frozen = await trial.planUnreleasedTrialPreparation(input);
    assert.deepEqual(frozen.targets.map((row) => row.id), [active.id]);
    assert.deepEqual(frozen.finishedOutbox.map((row) => row.outboxId), ["finished-outbox"]);
    assert.equal((await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='battle_discard_receipts'")).rowCount, 0);

    await db.query("INSERT INTO battle_leases (battle_id,owner_id,fencing_token,acquired_at,expires_at) VALUES ($1,'old-writer',1,$2,$3)",
      [active.id, now, "2099-01-01T00:00:00.000Z"]);
    await assert.rejects(trial.prepareUnreleasedTrial({ plan: frozen, operatorId: "operator", policy: policy() }),
      /UNRELEASED_TRIAL_NOT_QUIESCENT/);
    assert.equal((await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='battle_discard_receipts'")).rowCount, 0);
    await db.query("DELETE FROM battle_leases WHERE battle_id=$1", [active.id]);

    await db.query("UPDATE battle_narration_outbox SET delivery_generation=4 WHERE outbox_id='finished-outbox'");
    await assert.rejects(trial.prepareUnreleasedTrial({ plan: frozen, operatorId: "operator", policy: policy() }),
      /UNRELEASED_TRIAL_PLAN_STALE/);
    assert.ok(await battles.getBattle(active.id));
    assert.equal((await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='battle_discard_receipts'")).rowCount, 0);

    await db.query("UPDATE battle_narration_outbox SET delivery_generation=3 WHERE outbox_id='finished-outbox'");
    const plan = await trial.planUnreleasedTrialPreparation(input);
    const applied = await trial.prepareUnreleasedTrial({ plan, operatorId: "operator", policy: policy() });
    assert.equal(applied.kind, "prepared");
    assert.equal(await battles.getBattle(active.id), null);
    assert.equal((await battles.getBattle(finished.id))?.status, "finished");
    assert.equal((await db.query("SELECT 1 FROM users WHERE id=$1", [meta.sideAUserId])).rowCount, 1);
    assert.equal((await db.query<{ status: string }>("SELECT status FROM battle_narration_outbox WHERE outbox_id='finished-outbox'")).rows[0]?.status, "completed");
    assert.equal((await trial.prepareUnreleasedTrial({ plan, operatorId: "operator", policy: policy() })).kind, "replayed");
    assert.deepEqual(await trial.readbackUnreleasedTrialPreparation(plan), {
      kind: "replayed", discardedIds: [active.id], finishedIds: [finished.id], completedOutboxIds: ["finished-outbox"],
    });
    await db.query(
      `INSERT INTO battle_narration_entries
        (battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,status,active_attempt_id,
         attempt_count,terminal_narrative_json,fallback_reason,created_at,updated_at)
       VALUES ($1,'extra-receipt',2,'aftermath',0,'{}',$2,'completed',NULL,1,$3,NULL,$4,$4)`,
      [finished.id, "b".repeat(64), JSON.stringify({ narrator: ["extra"] }), now],
    );
    await db.query(
      `INSERT INTO battle_narration_outbox
        (outbox_id,battle_id,receipt_id,status,delivery_generation,created_at)
       VALUES ('extra-outbox',$1,'extra-receipt','pending',0,$2)`, [finished.id, now],
    );
    await assert.rejects(trial.readbackUnreleasedTrialPreparation(plan), /UNRELEASED_TRIAL_OUTBOX_NOT_DRAINED/);
    await assert.rejects(trial.prepareUnreleasedTrial({ plan, operatorId: "operator", policy: policy() }),
      /UNRELEASED_TRIAL_OUTBOX_NOT_DRAINED/);
    assert.equal((await db.query<{ status: string }>("SELECT status FROM battle_narration_outbox WHERE outbox_id='extra-outbox'")).rows[0]?.status, "pending");
  });
});
