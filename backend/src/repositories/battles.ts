import type { BattleListItem, BattleState } from "@kshiai/shared";
import {
  BattleStateSchema,
  battleResultLabel,
  buildSemanticObservationState,
  createBattleSemanticState,
  ensureBattlePerceptionState,
  ensureBattleWorldState,
  resolveBattlefieldImageUrl,
} from "@kshiai/shared";
import { query } from "../db.js";

export async function saveBattle(
  state: BattleState,
  meta: {
    sideAUserId: string;
    sideACharacterId: string;
    sideBCharacterId: string;
  },
): Promise<void> {
  const json = JSON.stringify(state);
  await query(
    `INSERT INTO battles
      (id, state_json, side_a_user_id, side_a_character_id, side_b_character_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE
       SET state_json = EXCLUDED.state_json,
           updated_at = EXCLUDED.updated_at`,
    [
      state.id,
      json,
      meta.sideAUserId,
      meta.sideACharacterId,
      meta.sideBCharacterId,
      state.createdAt,
      state.updatedAt,
    ],
  );
}

function parseBattleState(rawJson: unknown, idHint = "?"): BattleState {
  const raw = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  const parsed = BattleStateSchema.safeParse(raw);
  if (parsed.success) return ensureSemanticState(parsed.data);
  console.warn(
    "[battles] schema soft-repair",
    idHint,
    parsed.error.issues.slice(0, 3),
  );
  const fixed = sanitizeBattleStateJson(raw);
  return ensureSemanticState(BattleStateSchema.parse(fixed));
}

function ensureSemanticState(state: BattleState): BattleState {
  const semanticState = state.semanticState ?? createBattleSemanticState({
    scene: state.situation.scene,
    notes: state.situation.notes,
    terrain: state.battlefield?.terrain,
    obstacles: state.battlefield?.obstacles,
    conditions: state.battlefield?.conditions,
    seed: state.battlefield?.semanticSeed,
    sideA: { displayName: state.sideA.displayName },
    sideB: { displayName: state.sideB.displayName },
  });
  const withSemantic: BattleState = {
    ...state,
    semanticState,
    observationStateA: state.observationStateA ?? buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "a",
    }),
    observationStateB: state.observationStateB ?? buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "b",
    }),
    observationStatePublic: state.observationStatePublic ?? buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "public",
    }),
  };
  return ensureBattlePerceptionState(ensureBattleWorldState(withSemantic));
}

export async function getBattle(id: string): Promise<BattleState | null> {
  const { rows } = await query<{ state_json: unknown }>(
    `SELECT state_json FROM battles WHERE id = $1`,
    [id],
  );
  const row = rows[0];
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
  if (state.battlefield && typeof state.battlefield === "object") {
    const battlefield = { ...(state.battlefield as Record<string, unknown>) };
    if (battlefield.category === "カスタム") battlefield.category = "custom";
    state.battlefield = battlefield;
  }
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

export async function getBattleMeta(id: string) {
  const { rows } = await query<{
        side_a_user_id: string;
        side_a_character_id: string;
        side_b_character_id: string;
      }>(
    `SELECT side_a_user_id, side_a_character_id, side_b_character_id
       FROM battles WHERE id = $1`,
    [id],
  );
  return rows[0];
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
    sideACharacterId: state.sideA.characterId,
    sideBCharacterId: state.sideB.characterId,
    sideAImageUrl: state.sideA.imageUrl ?? null,
    sideBImageUrl: state.sideB.imageUrl ?? null,
    scene: state.situation.scene,
    battlefieldName: state.battlefield?.displayName ?? null,
    battlefieldImageUrl: state.battlefield
      ? resolveBattlefieldImageUrl(state.battlefield)
      : null,
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

export async function listBattlesForUser(input: {
  userId: string;
  q?: string;
  status?: "active" | "finished" | "all";
  limit?: number;
  offset?: number;
}): Promise<{ battles: BattleListItem[]; total: number }> {
  const status = input.status ?? "all";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const { rows } = await query<{ state_json: unknown }>(
    `SELECT state_json FROM battles
     WHERE side_a_user_id = $1
     ORDER BY updated_at DESC
     LIMIT 500`,
    [input.userId],
  );

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

export async function deleteBattle(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM battles WHERE id = $1 AND side_a_user_id = $2`,
    [id, userId],
  );
  return result.rowCount > 0;
}

/** All battles where character appears as side A or B. */
export async function listBattlesInvolvingCharacter(characterId: string): Promise<Array<{
  state: BattleState;
  meta: {
    side_a_user_id: string;
    side_a_character_id: string;
    side_b_character_id: string;
  };
}>> {
  const { rows } = await query<{
    state_json: unknown;
    side_a_user_id: string;
    side_a_character_id: string;
    side_b_character_id: string;
  }>(
    `SELECT state_json, side_a_user_id, side_a_character_id, side_b_character_id
     FROM battles
     WHERE side_a_character_id = $1 OR side_b_character_id = $1
     ORDER BY updated_at DESC`,
    [characterId],
  );

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
 * Battle history rows for a single character.
 * Visible if the viewer owns the character, or started a match involving them.
 */
export async function listBattleItemsForCharacter(input: {
  characterId: string;
  viewerUserId: string;
  characterOwnerUserId: string;
  limit?: number;
}): Promise<{ battles: BattleListItem[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const isOwner = input.viewerUserId === input.characterOwnerUserId;
  const rows = await listBattlesInvolvingCharacter(input.characterId);
  const filtered = rows.filter(
    (r) => isOwner || r.meta.side_a_user_id === input.viewerUserId,
  );
  // Newest first (repo query already ORDER BY updated_at DESC)
  const items = filtered.map((r) => toListItem(r.state));
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    battles: items.slice(0, limit),
    total: items.length,
  };
}

/** Narrative-safe battle summary for improvement analysis tools (no raw params). */
export type CharacterBattleSearchHit = {
  battleId: string;
  result: "win" | "loss" | "draw" | "active" | "unknown";
  resultLabel: string | null;
  opponentName: string;
  turn: number;
  turnLimit: number;
  battlefieldName: string | null;
  scene: string;
  finishReason: string | null;
  updatedAt: string;
  skillMentions: string[];
  eventHighlights: string[];
};

export type CharacterBattleDetail = CharacterBattleSearchHit & {
  policySummary: string | null;
  narrationExcerpts: string[];
  turnEventSummaries: string[];
};

function perspectiveResult(
  state: BattleState,
  characterId: string,
): CharacterBattleSearchHit["result"] {
  if (state.status !== "finished") return "active";
  if (state.winnerSide === "draw") return "draw";
  const onA = state.sideA.characterId === characterId;
  const onB = state.sideB.characterId === characterId;
  if (!onA && !onB) return "unknown";
  if (state.winnerSide === "a") return onA ? "win" : "loss";
  if (state.winnerSide === "b") return onB ? "win" : "loss";
  return "unknown";
}

function skillMentionsFromState(state: BattleState, characterName: string): string[] {
  const names = new Set<string>();
  for (const rec of state.turnRecords ?? []) {
    for (const ev of rec.events ?? []) {
      if (ev.skillName && (!ev.actorName || ev.actorName === characterName)) {
        names.add(ev.skillName);
      }
    }
  }
  for (const block of state.log ?? []) {
    for (const line of block.narrator ?? []) {
      // Narration may name skills; keep short unique snippets only via events above.
      void line;
    }
  }
  return [...names].slice(0, 12);
}

function eventHighlights(state: BattleState, characterName: string): string[] {
  const out: string[] = [];
  for (const rec of state.turnRecords ?? []) {
    for (const ev of rec.events ?? []) {
      if (!ev.summary) continue;
      const involves =
        ev.actorName === characterName ||
        ev.targetName === characterName ||
        !ev.actorName;
      if (!involves) continue;
      out.push(`T${rec.turn}: ${ev.summary}`.slice(0, 160));
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function toSearchHit(
  state: BattleState,
  characterId: string,
): CharacterBattleSearchHit {
  const onA = state.sideA.characterId === characterId;
  const selfName = onA ? state.sideA.displayName : state.sideB.displayName;
  const opponentName = onA ? state.sideB.displayName : state.sideA.displayName;
  const result = perspectiveResult(state, characterId);
  return {
    battleId: state.id,
    result,
    resultLabel: battleResultLabel(
      state.status,
      state.winnerSide,
      state.sideA.displayName,
      state.sideB.displayName,
      state.finishReason,
    ),
    opponentName,
    turn: state.turn,
    turnLimit: state.turnLimit,
    battlefieldName: state.battlefield?.displayName ?? null,
    scene: state.situation.scene,
    finishReason: state.finishReason,
    updatedAt: state.updatedAt,
    skillMentions: skillMentionsFromState(state, selfName),
    eventHighlights: eventHighlights(state, selfName),
  };
}

/** Finished battles only, for analysis gating and tools. */
export async function countFinishedBattlesForCharacter(characterId: string): Promise<number> {
  return (await listBattlesInvolvingCharacter(characterId)).filter(
    (r) => r.state.status === "finished",
  ).length;
}

/**
 * Search a character's battle history for LLM tools / coaching analysis.
 * Query matches opponent, field, result label, scene, and battle id.
 */
export async function searchCharacterBattleHistory(input: {
  characterId: string;
  query?: string;
  limit?: number;
  finishedOnly?: boolean;
}): Promise<CharacterBattleSearchHit[]> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30);
  const finishedOnly = input.finishedOnly !== false;
  const needle = input.query?.trim().toLowerCase() ?? "";
  const rows = await listBattlesInvolvingCharacter(input.characterId);
  const hits: CharacterBattleSearchHit[] = [];
  for (const r of rows) {
    if (finishedOnly && r.state.status !== "finished") continue;
    const hit = toSearchHit(r.state, input.characterId);
    if (needle) {
      const hay = [
        hit.opponentName,
        hit.result,
        hit.resultLabel ?? "",
        hit.battlefieldName ?? "",
        hit.scene,
        hit.finishReason ?? "",
        hit.battleId,
        ...hit.skillMentions,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    hits.push(hit);
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Detail payload for get_character_battle tool (narrative-safe). */
export async function getCharacterBattleDetail(
  characterId: string,
  battleId: string,
): Promise<CharacterBattleDetail | null> {
  const rows = await listBattlesInvolvingCharacter(characterId);
  const row = rows.find((r) => r.state.id === battleId);
  if (!row) return null;
  const state = row.state;
  const hit = toSearchHit(state, characterId);
  const onA = state.sideA.characterId === characterId;
  const policies = onA ? state.policiesA : state.policiesB;
  const selected = new Set(onA ? state.selectedPolicyIdsA : state.selectedPolicyIdsB);
  const policyTitles = policies
    .filter((p) => selected.has(p.id))
    .map((p) => p.title);
  const narrationExcerpts = (state.log ?? [])
    .flatMap((block) => block.narrator ?? [])
    .filter((line) => line && !line.startsWith("——"))
    .slice(-10)
    .map((line) => line.slice(0, 200));
  const turnEventSummaries = (state.turnRecords ?? [])
    .flatMap((rec) =>
      (rec.events ?? []).map((ev) => `T${rec.turn}: ${ev.summary}`.slice(0, 180)),
    )
    .slice(-16);
  return {
    ...hit,
    policySummary: policyTitles.length ? policyTitles.join(" / ") : null,
    narrationExcerpts,
    turnEventSummaries,
  };
}

/**
 * Latest finished matchup between two characters (either seating).
 * Used for prologue rivalry (因縁).
 */
export async function findPriorMatchSummary(
  characterIdA: string,
  characterIdB: string,
  excludeBattleId?: string,
): Promise<string | null> {
  const { rows } = await query<{
    id: string;
    state_json: unknown;
    updated_at: string | Date;
  }>(
    `SELECT id, state_json, updated_at FROM battles
     WHERE (
       (side_a_character_id = $1 AND side_b_character_id = $2)
       OR (side_a_character_id = $2 AND side_b_character_id = $1)
     )
     ORDER BY updated_at DESC
     LIMIT 12`,
    [characterIdA, characterIdB],
  );

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
