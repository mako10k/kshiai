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

function parseBattleState(rawJson: string, idHint = "?"): BattleState {
  const raw = JSON.parse(rawJson) as unknown;
  const parsed = BattleStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.warn(
    "[battles] schema soft-repair",
    idHint,
    parsed.error.issues.slice(0, 3),
  );
  const fixed = sanitizeBattleStateJson(raw);
  return BattleStateSchema.parse(fixed);
}

export function getBattle(id: string): BattleState | null {
  const row = getDb()
    .prepare(`SELECT state_json FROM battles WHERE id = ?`)
    .get(id) as { state_json: string } | undefined;
  if (!row) return null;
  try {
    return parseBattleState(row.state_json, id);
  } catch (e) {
    console.error("[battles] getBattle parse failed", id, e);
    throw e;
  }
}

/** Coerce LLM percent-style HP triggers so saved battles still load. */
function sanitizeBattleStateJson(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const state = { ...(raw as Record<string, unknown>) };
  for (const key of ["policiesA", "policiesB"] as const) {
    const list = state[key];
    if (!Array.isArray(list)) continue;
    state[key] = list.map((p) => {
      if (!p || typeof p !== "object") return p;
      const pol = { ...(p as Record<string, unknown>) };
      if (typeof pol.priority === "number" && !Number.isInteger(pol.priority)) {
        pol.priority = Math.round(pol.priority);
      }
      if (typeof pol.bias === "string") {
        pol.bias = pol.bias.toLowerCase();
      }
      const tr = pol.triggers;
      if (tr && typeof tr === "object") {
        const t = { ...(tr as Record<string, unknown>) };
        for (const rk of [
          "myHpBelow",
          "myHpAbove",
          "foeHpBelow",
          "foeHpAbove",
        ] as const) {
          const v = t[rk];
          if (typeof v === "number" && v > 1 && v <= 100) t[rk] = v / 100;
          else if (typeof v === "number" && v > 100) t[rk] = 1;
        }
        pol.triggers = t;
      }
      return pol;
    });
  }
  return state;
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

  let items: BattleListItem[] = [];
  for (const r of rows) {
    try {
      items.push(toListItem(parseBattleState(r.state_json)));
    } catch (e) {
      console.warn("[battles] skip unlistable battle", e);
    }
  }

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

  return rows.flatMap((r) => {
    try {
      return [
        {
          state: parseBattleState(r.state_json, "involving"),
          meta: {
            side_a_user_id: r.side_a_user_id,
            side_a_character_id: r.side_a_character_id,
            side_b_character_id: r.side_b_character_id,
          },
        },
      ];
    } catch {
      return [];
    }
  });
}

/**
 * Latest finished matchup between two characters (either seating).
 * Used for prologue rivalry (因縁).
 */
export function findPriorMatchSummary(
  characterIdA: string,
  characterIdB: string,
  excludeBattleId?: string,
): string | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, state_json, updated_at FROM battles
       WHERE (
         (side_a_character_id = ? AND side_b_character_id = ?)
         OR (side_a_character_id = ? AND side_b_character_id = ?)
       )
       ORDER BY updated_at DESC
       LIMIT 12`,
    )
    .all(characterIdA, characterIdB, characterIdB, characterIdA) as Array<{
    id: string;
    state_json: string;
    updated_at: string;
  }>;

  for (const row of rows) {
    if (excludeBattleId && row.id === excludeBattleId) continue;
    let state: BattleState;
    try {
      state = parseBattleState(row.state_json, row.id);
    } catch {
      continue;
    }
    if (state.status !== "finished") continue;

    const a = state.sideA.displayName;
    const b = state.sideB.displayName;
    const result = battleResultLabel(
      state.status,
      state.winnerSide,
      a,
      b,
      state.finishReason,
    );
    const field = state.battlefield?.displayName ?? state.situation.scene;
    const tail = state.log
      .slice(-2)
      .flatMap((block) => block.narrator)
      .filter((line) => line && !line.startsWith("——"))
      .slice(-3)
      .join(" ");
    const bits = [
      `前回: ${a} vs ${b}（${state.turn}ターン・${field}）→ ${result}`,
      tail ? tail.slice(0, 220) : null,
    ].filter(Boolean);
    return bits.join(" ");
  }
  return null;
}
