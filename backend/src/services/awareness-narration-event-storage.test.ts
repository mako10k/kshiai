// R: Verify event identities, retained cursor continuity and unpublished rollback with SQLite.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "narration-event-")), "test.db");
const { query, withTransaction } = await import("../db.js");
const { insertNewBattle } = await import("../repositories/battles.js");
const { validAwarenessBattleFixture } = await import("./awareness-test-fixture.js");
const { appendNarrationEvent } = await import("./narration-event-storage.js");
function event(connection: Parameters<typeof appendNarrationEvent>[0]["connection"], battleId: string): Parameters<typeof appendNarrationEvent>[0] {
  return { connection, battleId, receiptId: "receipt", narrationSequence: 1, kind: "queued",
    payload: { turnReceiptId: "receipt", narrationSequence: 1, phase: "combat",
      combatTurn: 1, status: "queued" }, now: "2026-10-06T00:00:00.000Z" };
}
test("SQLite appends exact public IDs and continues above the retained floor after full pruning", async () => {
  await insertNewBattle(validAwarenessBattleFixture("retained").state, { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b" });
  await withTransaction(async (connection) => {
    await appendNarrationEvent(event(connection, "retained"));
    await appendNarrationEvent(event(connection, "retained"));
  });
  assert.deepEqual((await query<{ event_id: string }>("SELECT event_id FROM battle_narration_events WHERE battle_id='retained' ORDER BY event_sequence")).rows,
    [{ event_id: "retained:event:1" }, { event_id: "retained:event:2" }]);
  await withTransaction(async (connection) => {
    await connection.query("INSERT INTO battle_narration_retention(battle_id,pruned_through_sequence,updated_at) VALUES ('retained',2,$1)", ["2026-10-06T00:00:00.000Z"]);
    await connection.query("DELETE FROM battle_narration_events WHERE battle_id='retained'");
  });
  await withTransaction(connection => appendNarrationEvent(event(connection, "retained")));
  assert.equal((await query<{ event_id: string }>("SELECT event_id FROM battle_narration_events WHERE battle_id='retained'")).rows[0]?.event_id, "retained:event:3");
});
test("rollback publishes no event and permits reuse of its unpublished sequence", async () => {
  await assert.rejects(withTransaction(async (connection) => {
    await appendNarrationEvent(event(connection, "rollback"));
    throw new Error("rollback-check");
  }), /rollback-check/);
  await withTransaction(connection => appendNarrationEvent(event(connection, "rollback")));
  assert.deepEqual((await query<{ event_id: string }>("SELECT event_id FROM battle_narration_events WHERE battle_id='rollback'")).rows, [{ event_id: "rollback:event:1" }]);
});
