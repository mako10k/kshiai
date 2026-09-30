// R: Freeze and atomically discard stopped pre-cutover unfinished battles and payloads.
import { createHash } from "node:crypto";
import { withTransaction, type DatabaseConnection } from "../db.js";
import { requestDigest } from "../services/distributed-guard.js";

type BattleRow = { id: string; state_json: unknown; created_at: string | Date };
const dependentTables = [
  "battle_leases", "battle_presentations", "battle_narration_entries",
  "battle_narration_leases", "battle_narration_retention",
  "battle_narration_events", "battle_narration_outbox",
] as const;
export type BattleCutoverPlan = {
  cutoverId: string;
  cutoverAt: string;
  targets: Array<{ id: string; stateDigest: string }>;
  finished: Array<{ id: string; stateDigest: string }>;
  relatedCounts: Record<string, number>;
  inventoryDigest: string;
  planDigest: string;
};
function stateValue(row: BattleRow): unknown {
  return typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json;
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function status(row: BattleRow): string {
  const state = stateValue(row);
  const value = state && typeof state === "object" ? Reflect.get(state, "status") : undefined;
  if (value !== "active" && value !== "finished") throw new Error(`BATTLE_CUTOVER_STATUS_UNKNOWN:${row.id}`);
  return value;
}
async function inventory(connection: DatabaseConnection): Promise<BattleRow[]> {
  return (await connection.query<BattleRow>("SELECT id, state_json, created_at FROM battles ORDER BY id")).rows;
}
async function counts(connection: DatabaseConnection, ids: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of dependentTables) {
    let count = 0;
    for (const id of ids) {
      const row = await connection.query<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM ${table} WHERE battle_id = $1`, [id],
      );
      count += Number(row.rows[0]?.count ?? 0);
    }
    result[table] = count;
  }
  return result;
}
function responseBattleId(response: unknown): string | null {
  const value = typeof response === "string" ? JSON.parse(response) : response;
  if (!value || typeof value !== "object") return null;
  const battle = Reflect.get(value, "battle");
  const id = battle && typeof battle === "object" ? Reflect.get(battle, "id") : undefined;
  return typeof id === "string" ? id : null;
}
async function matchingIdempotency(connection: DatabaseConnection, ids: Set<string>) {
  const rows = (await connection.query<{
    user_id: string; scope: string; key: string; request_hash: string; response_json: unknown;
  }>("SELECT user_id, scope, key, request_hash, response_json FROM idempotency_keys ORDER BY user_id, scope, key")).rows;
  return rows.filter((row) => {
    if (row.scope.startsWith("battle-advance:") && ids.has(row.scope.slice("battle-advance:".length))) return true;
    if (row.scope !== "battle-create") return false;
    const id = `btl_${requestDigest({userId: row.user_id, scope: row.scope, key: row.key, requestHash: row.request_hash}).slice(0, 32)}`;
    return ids.has(id) || ids.has(responseBattleId(row.response_json) ?? "");
  });
}
async function buildPlan(connection: DatabaseConnection, input: { cutoverId: string; cutoverAt: string }): Promise<BattleCutoverPlan> {
  if (!input.cutoverId || !Number.isFinite(Date.parse(input.cutoverAt))) throw new Error("BATTLE_CUTOVER_INPUT_INVALID");
  const rows = await inventory(connection);
  const targets: BattleCutoverPlan["targets"] = [];
  const finished: BattleCutoverPlan["finished"] = [];
  for (const row of rows) {
    const recorded = { id: row.id, stateDigest: digest(stateValue(row)) };
    if (status(row) === "finished") finished.push(recorded);
    else {
      const createdAt = new Date(row.created_at).getTime();
      if (!Number.isFinite(createdAt)) throw new Error(`BATTLE_CUTOVER_CREATED_AT_UNKNOWN:${row.id}`);
      if (createdAt < Date.parse(input.cutoverAt)) targets.push(recorded);
    }
  }
  const targetIds = targets.map((row) => row.id);
  const relatedCounts = await counts(connection, targetIds);
  relatedCounts.idempotency_keys = (await matchingIdempotency(connection, new Set(targetIds))).length;
  const base = { ...input, targets, finished, relatedCounts,
    inventoryDigest: digest(rows.map((row) => ({ id: row.id, state: stateValue(row) }))), };
  return { ...base, planDigest: digest(base) };
}
export async function planBattleCutover(input: { cutoverId: string; cutoverAt: string }): Promise<BattleCutoverPlan> {
  return withTransaction((connection) => buildPlan(connection, input));
}
export async function discardBattleCutover(input: {
  plan: BattleCutoverPlan;
  operatorId: string;
  stopped: boolean;
  recoverySnapshotIdentity: string;
}): Promise<{ kind: "discarded" | "replayed"; discardedIds: string[]; finishedIds: string[] }> {
  if (!input.operatorId || !input.stopped || !input.recoverySnapshotIdentity) throw new Error("BATTLE_CUTOVER_PRECONDITION_REQUIRED");
  const { planDigest, ...base } = input.plan;
  if (digest(base) !== planDigest) throw new Error("BATTLE_CUTOVER_PLAN_DIGEST_MISMATCH");
  return withTransaction(async (connection) => {
    const ids = input.plan.targets.map((target) => target.id);
    const recorded = await connection.query<{ battle_id: string; cutover_id: string }>(
      "SELECT battle_id, cutover_id FROM battle_discard_receipts WHERE cutover_id = $1 ORDER BY battle_id", [input.plan.cutoverId],
    );
    // A frozen empty set has no write identity to persist. Read back its empty
    // target predicate and retained rows; later post-cutover creations are unrelated.
    if (ids.length === 0) {
      const current = await buildPlan(connection, { cutoverId: input.plan.cutoverId, cutoverAt: input.plan.cutoverAt });
      if (current.targets.length !== 0) throw new Error("BATTLE_CUTOVER_PLAN_STALE");
      for (const expected of input.plan.finished) {
        if (!current.finished.some((row) => row.id === expected.id && row.stateDigest === expected.stateDigest)) throw new Error("BATTLE_CUTOVER_HISTORY_CHANGED");
      }
      return { kind: "replayed", discardedIds: [], finishedIds: input.plan.finished.map((row) => row.id) };
    }
    if (recorded.rowCount > 0) {
      if (JSON.stringify(recorded.rows.map((row) => row.battle_id)) !== JSON.stringify(ids)) throw new Error("BATTLE_CUTOVER_REPLAY_CONFLICT");
      for (const id of ids) {
        if ((await connection.query("SELECT 1 FROM battles WHERE id = $1", [id])).rowCount !== 0) throw new Error("BATTLE_CUTOVER_READBACK_FAILED");
      }
      if (Object.values(await counts(connection, ids)).some((count) => count !== 0) ||
          (await matchingIdempotency(connection, new Set(ids))).length !== 0) throw new Error("BATTLE_CUTOVER_READBACK_FAILED");
      const remaining = await inventory(connection);
      for (const expected of input.plan.finished) {
        const row = remaining.find((value) => value.id === expected.id);
        if (!row || status(row) !== "finished" || digest(stateValue(row)) !== expected.stateDigest) throw new Error("BATTLE_CUTOVER_HISTORY_CHANGED");
      }
      for (const id of ids) {
        if ((await connection.query("SELECT 1 FROM provider_operation_runs WHERE battle_id = $1 AND status = 'active'", [id])).rowCount !== 0 ||
            (await connection.query("SELECT 1 FROM battle_narration_attempts WHERE battle_id = $1 AND status = 'generating'", [id])).rowCount !== 0) throw new Error("BATTLE_CUTOVER_READBACK_FAILED");
      }
      return { kind: "replayed", discardedIds: ids, finishedIds: input.plan.finished.map((row) => row.id) };
    }
    const current = await buildPlan(connection, { cutoverId: input.plan.cutoverId, cutoverAt: input.plan.cutoverAt });
    if (current.planDigest !== input.plan.planDigest) throw new Error("BATTLE_CUTOVER_PLAN_STALE");
    const idempotency = await matchingIdempotency(connection, new Set(ids));
    for (const row of idempotency) {
      await connection.query("DELETE FROM idempotency_keys WHERE user_id = $1 AND scope = $2 AND key = $3", [row.user_id, row.scope, row.key]);
    }
    for (const id of ids) {
      await connection.query("INSERT INTO battle_discard_receipts (battle_id, cutover_id) VALUES ($1, $2)", [id, input.plan.cutoverId]);
      for (const table of dependentTables) await connection.query(`DELETE FROM ${table} WHERE battle_id = $1`, [id]);
      const now = new Date().toISOString();
      await connection.query("UPDATE battle_narration_attempts SET status = 'abandoned', finished_at = $2 WHERE battle_id = $1 AND status = 'generating'", [id, now]);
      await connection.query("UPDATE provider_operation_runs SET status = 'failed', finished_at = $2 WHERE battle_id = $1 AND status = 'active'", [id, now]);
      if ((await connection.query("DELETE FROM battles WHERE id = $1", [id])).rowCount !== 1) throw new Error("BATTLE_CUTOVER_DELETE_CONFLICT");
    }
    const remaining = await inventory(connection);
    for (const expected of input.plan.finished) {
      const row = remaining.find((value) => value.id === expected.id);
      if (!row || status(row) !== "finished" || digest(stateValue(row)) !== expected.stateDigest) throw new Error("BATTLE_CUTOVER_HISTORY_CHANGED");
    }
    return { kind: "discarded", discardedIds: ids, finishedIds: input.plan.finished.map((row) => row.id) };
  });
}
