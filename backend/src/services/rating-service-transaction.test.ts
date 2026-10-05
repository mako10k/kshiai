// R: Verify rating accounting and canonical battle persistence share one rollback boundary.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CharacterSheetSchema, ensureRecord, ensureRecordOverall, type BattleState } from "@kshiai/shared";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";
const directory = mkdtempSync(join(tmpdir(), "kshiai-rating-atomic-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { getDb, withTransaction } = await import("../db.js");
const { settleBattleRatingInTransaction } = await import("./rating-service.js");
const { insertNewBattle, saveBattleInTransaction } = await import("../repositories/battles.js");
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
function sheet(id: string) {
  const row = getDb().prepare("SELECT sheet_json FROM characters WHERE id=?").get(id);
  return CharacterSheetSchema.parse(row && typeof row === "object" && "sheet_json" in row && typeof row.sheet_json === "string" ? JSON.parse(row.sheet_json) : null);
}
async function fixture(id: string, sameOwner: boolean) {
  const { state, characters } = validAwarenessBattleFixture(id);
  for (const owner of ["rating-owner-a", "rating-owner-b"]) {
    getDb().prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .run(owner, owner, "test", state.createdAt);
  }
  for (const side of ["a", "b"] as const) {
    const character = { ...characters[side], ownerUserId: side === "a" || sameOwner ? "rating-owner-a" : "rating-owner-b" };
    getDb().prepare("INSERT INTO characters(id,owner_user_id,sheet_json,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id,sheet_json=excluded.sheet_json")
      .run(character.id, character.ownerUserId, JSON.stringify(character), character.createdAt, character.updatedAt);
  }
  const meta = { sideAUserId: "rating-owner-a", sideACharacterId: state.sideA.characterId, sideBCharacterId: state.sideB.characterId };
  assert.equal(await insertNewBattle(state, meta), "created");
  const finished: BattleState = { ...state, status: "finished", winnerSide: "a", finishReason: "turn_limit", aftermathPending: false };
  return { state, finished, meta };
}
describe("atomic dual-track rating settlement", () => {
  for (const sameOwner of [true, false]) {
    it(`rolls back both character tracks when canonical CAS fails (${sameOwner ? "same" : "cross"} owner)`, async () => {
      const { state, finished, meta } = await fixture(`rating-rollback-${sameOwner}`, sameOwner);
      const beforeA = sheet(state.sideA.characterId); const beforeB = sheet(state.sideB.characterId);
      await assert.rejects(withTransaction(async (connection) => {
        const settled = await settleBattleRatingInTransaction(connection, finished);
        assert.equal(settled.ratingSettlement?.applied, true);
        await saveBattleInTransaction(connection, settled, { ...meta, expectedRevision: 99 });
      }), /REVISION|CONFLICT/);
      assert.deepEqual(sheet(state.sideA.characterId), beforeA);
      assert.deepEqual(sheet(state.sideB.characterId), beforeB);
      const row = getDb().prepare("SELECT state_json FROM battles WHERE id=?").get(state.id);
      assert.ok(row && typeof row === "object" && "state_json" in row && typeof row.state_json === "string");
      assert.equal(JSON.parse(row.state_json).status, state.status);
    });
    it(`commits the existing accounting rules and returns the settled public state (${sameOwner ? "same" : "cross"} owner)`, async () => {
      const { state, finished, meta } = await fixture(`rating-commit-${sameOwner}`, sameOwner);
      const beforeA = sheet(state.sideA.characterId); const beforeB = sheet(state.sideB.characterId);
      const settled = await withTransaction(async (connection) => {
        const result = await settleBattleRatingInTransaction(connection, finished);
        await saveBattleInTransaction(connection, result, { ...meta, expectedRevision: 0 });
        return result;
      });
      const afterA = sheet(state.sideA.characterId); const afterB = sheet(state.sideB.characterId);
      assert.equal(ensureRecordOverall(afterA).gamesPlayed, ensureRecordOverall(beforeA).gamesPlayed + 1);
      assert.equal(ensureRecordOverall(afterA).wins, ensureRecordOverall(beforeA).wins + 1);
      assert.equal(ensureRecordOverall(afterB).losses, ensureRecordOverall(beforeB).losses + 1);
      assert.equal(ensureRecord(afterA).gamesPlayed, ensureRecord(beforeA).gamesPlayed + (sameOwner ? 0 : 1));
      assert.equal(settled.ratingSettlement?.ranked, !sameOwner);
      assert.equal(settled.ratingSettlement?.sameOwner, sameOwner);
      assert.deepEqual(settled.ratingSettlement?.overall?.sideA.after, ensureRecordOverall(afterA).rating);
      await withTransaction(async (connection) => {
        assert.equal(await settleBattleRatingInTransaction(connection, settled), settled);
      });
      assert.deepEqual(sheet(state.sideA.characterId), afterA);
      assert.deepEqual(afterA.appearance, beforeA.appearance);
      assert.deepEqual(afterB.skills, beforeB.skills);
    });
  }
  it("never mutates accounting for an incomplete match", async () => {
    const { state } = await fixture("rating-incomplete", false);
    const before = sheet(state.sideA.characterId);
    const incomplete: BattleState = { ...state, status: "incomplete", incompleteReason: "required_failure" };
    await withTransaction(async (connection) => assert.equal(await settleBattleRatingInTransaction(connection, incomplete), incomplete));
    assert.deepEqual(sheet(state.sideA.characterId), before);
  });
});
