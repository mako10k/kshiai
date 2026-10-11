// R: Fence private reserved_turns preparation and commit; retain accounting after lease loss.
import { ReservedTurnRuntimeSchema, type ReservedTurnRuntime } from "@kshiai/shared";
import { config } from "../config.js";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import type { BattleLeaseFence } from "../services/distributed-guard.js";
export type ReservedRuntimeSnapshot = { battleId: string; revision: number; fencingToken: number; runtime: ReservedTurnRuntime; updatedAt: string };
type Row = { battle_id: string; revision: number; fencing_token: number; snapshot_json: string; updated_at: string };
function parse(row: Row): ReservedRuntimeSnapshot {
  return { battleId: row.battle_id, revision: Number(row.revision), fencingToken: Number(row.fencing_token),
    runtime: ReservedTurnRuntimeSchema.parse(JSON.parse(row.snapshot_json)), updatedAt: row.updated_at };
}
export async function getReservedRuntimeInTransaction(connection: DatabaseConnection, battleId: string, options = { lock: false }): Promise<ReservedRuntimeSnapshot | null> {
  const result = await connection.query<Row>(`SELECT * FROM battle_reserved_turns WHERE battle_id=$1${options.lock && config.databaseUrl ? " FOR UPDATE" : ""}`, [battleId]);
  return result.rows[0] ? parse(result.rows[0]) : null;
}
export function getReservedRuntime(battleId: string): Promise<ReservedRuntimeSnapshot | null> {
  return getReservedRuntimeInTransaction({ query }, battleId);
}
export async function insertReservedRuntime(connection: DatabaseConnection, battleId: string, runtime: ReservedTurnRuntime, now: string): Promise<void> {
  const checked = ReservedTurnRuntimeSchema.parse(runtime);
  await connection.query(`INSERT INTO battle_reserved_turns(battle_id,revision,fencing_token,snapshot_json,updated_at)
    VALUES($1,0,1,$2,$3)`, [battleId, JSON.stringify(checked), now]);
}
export async function writeReservedRuntime(connection: DatabaseConnection, current: ReservedRuntimeSnapshot, next: ReservedTurnRuntime, now: string, fence?: BattleLeaseFence): Promise<ReservedRuntimeSnapshot> {
  if (!Number.isFinite(Date.parse(now)) || (fence && (fence.battleId !== current.battleId || fence.fencingToken < current.fencingToken))) throw new Error("RESERVED_TURN_FENCE_INVALID");
  const checked = ReservedTurnRuntimeSchema.parse(next);
  const values: unknown[] = [current.battleId, current.revision, JSON.stringify(checked), now];
  const fenceCheck = fence ? ` AND EXISTS (SELECT 1 FROM battle_leases WHERE battle_id=$1 AND owner_id=$5 AND fencing_token=$6 AND expires_at>$7)` : "";
  if (fence) values.push(fence.ownerId, fence.fencingToken, now);
  const result = await connection.query<Row>(`UPDATE battle_reserved_turns SET revision=revision+1,snapshot_json=$3,updated_at=$4${fence ? ",fencing_token=$6" : ""}
    WHERE battle_id=$1 AND revision=$2${fenceCheck} RETURNING *`, values);
  if (!result.rows[0]) throw new Error("RESERVED_TURN_REVISION_OR_LEASE_CONFLICT");
  return parse(result.rows[0]);
}
export async function mutateReservedRuntime(battleId: string, fence: BattleLeaseFence | undefined, reduce: (runtime: ReservedTurnRuntime) => ReservedTurnRuntime, now = new Date().toISOString()): Promise<ReservedRuntimeSnapshot> {
  return withTransaction(async (connection) => {
    const current = await getReservedRuntimeInTransaction(connection, battleId, { lock: true });
    if (!current) throw new Error("RESERVED_TURN_RUNTIME_NOT_FOUND");
    return writeReservedRuntime(connection, current, reduce(current.runtime), now, fence);
  });
}
