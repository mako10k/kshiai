import type { BattleListItem, BattleState } from "@kshiai/shared";
import { BattleStateSchema, battleResultLabel } from "@kshiai/shared";
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

function toListItem(state: BattleState): BattleListItem {
  const sideAName = state.sideA.displayName;
  const sideBName = state.sideB.displayName;
  return {
    id: state.id,
    status: state.status,
    turn: state.turn,
    turnLimit: state.turnLimit,
    sideAName,
    sideBName,
    scene: state.situation.scene,
    battlefieldName: state.battlefield?.displayName ?? null,
    winnerSide: state.winnerSide,
    resultLabel: battleResultLabel(
      state.status,
      state.winnerSide,
      sideAName,
      sideBName,
      state.finishReason,
    ),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    canResume: state.status === "active",
  };
}

export function listBattlesForUser(input: {
  userId: string;
  q?: string;
  status?: "active" | "finished" | "all";
  limit?: number;
  offset?: number;
}): { battles: BattleListItem[]; total: number } {
  const db = getDb();
  const status = input.status ?? "all";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT state_json FROM battles
       WHERE side_a_user_id = ?
       ORDER BY updated_at DESC
       LIMIT 500`,
    )
    .all(input.userId) as { state_json: string }[];

  let items = rows.map((r) =>
    toListItem(BattleStateSchema.parse(JSON.parse(r.state_json))),
  );

  if (status === "active") {
    items = items.filter((b) => b.status === "active");
  } else if (status === "finished") {
    items = items.filter((b) => b.status === "finished");
  }

  const q = input.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((b) => {
      const hay = [
        b.sideAName,
        b.sideBName,
        b.scene,
        b.battlefieldName ?? "",
        b.resultLabel ?? "",
        b.id,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const total = items.length;
  return {
    battles: items.slice(offset, offset + limit),
    total,
  };
}

export function deleteBattle(id: string, userId: string): boolean {
  const r = getDb()
    .prepare(`DELETE FROM battles WHERE id = ? AND side_a_user_id = ?`)
    .run(id, userId);
  return r.changes > 0;
}

/** All battles where character appears as side A or B. */
export function listBattlesInvolvingCharacter(characterId: string): Array<{
  state: BattleState;
  meta: {
    side_a_user_id: string;
    side_a_character_id: string;
    side_b_character_id: string;
  };
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT state_json, side_a_user_id, side_a_character_id, side_b_character_id
       FROM battles
       WHERE side_a_character_id = ? OR side_b_character_id = ?`,
    )
    .all(characterId, characterId) as Array<{
    state_json: string;
    side_a_user_id: string;
    side_a_character_id: string;
    side_b_character_id: string;
  }>;

  return rows.map((r) => ({
    state: BattleStateSchema.parse(JSON.parse(r.state_json)),
    meta: {
      side_a_user_id: r.side_a_user_id,
      side_a_character_id: r.side_a_character_id,
      side_b_character_id: r.side_b_character_id,
    },
  }));
}
