import type { BattleState } from "@kshiai/shared";
import { BattleStateSchema } from "@kshiai/shared";
import { getDb } from "../db.js";

export function saveBattle(
  state: BattleState,
  meta: {
    sideAUserId: string;
    sideACharacterId: string;
    sideBCharacterId: string;
  },
): void {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM battles WHERE id = ?`).get(state.id);
  const json = JSON.stringify(state);
  if (existing) {
    db.prepare(
      `UPDATE battles SET state_json = ?, updated_at = ? WHERE id = ?`,
    ).run(json, state.updatedAt, state.id);
  } else {
    db.prepare(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id, side_b_character_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      state.id,
      json,
      meta.sideAUserId,
      meta.sideACharacterId,
      meta.sideBCharacterId,
      state.createdAt,
      state.updatedAt,
    );
  }
}

export function getBattle(id: string): BattleState | null {
  const row = getDb()
    .prepare(`SELECT state_json FROM battles WHERE id = ?`)
    .get(id) as { state_json: string } | undefined;
  if (!row) return null;
  return BattleStateSchema.parse(JSON.parse(row.state_json));
}

export function getBattleMeta(id: string) {
  return getDb()
    .prepare(
      `SELECT side_a_user_id, side_a_character_id, side_b_character_id FROM battles WHERE id = ?`,
    )
    .get(id) as
    | {
        side_a_user_id: string;
        side_a_character_id: string;
        side_b_character_id: string;
      }
    | undefined;
}
