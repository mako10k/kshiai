// R: Fence private unified preparation and commit; retain accounting after lease loss.
import { UnifiedConsciousnessRuntimeSchema, type UnifiedConsciousnessRuntime } from "@kshiai/shared";
import { config } from "../config.js";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import type { BattleLeaseFence } from "../services/distributed-guard.js";
export type UnifiedRuntimeSnapshot = { battleId: string; revision: number; fencingToken: number; runtime: UnifiedConsciousnessRuntime; updatedAt: string };
type Row = { battle_id: string; revision: number; fencing_token: number; snapshot_json: string; updated_at: string };
function parse(row: Row): UnifiedRuntimeSnapshot {
  return { battleId: row.battle_id, revision: Number(row.revision), fencingToken: Number(row.fencing_token),
    runtime: UnifiedConsciousnessRuntimeSchema.parse(JSON.parse(row.snapshot_json)), updatedAt: row.updated_at };
}
export async function getUnifiedRuntimeInTransaction(connection: DatabaseConnection, battleId: string, options = { lock: false }): Promise<UnifiedRuntimeSnapshot | null> {
  const result = await connection.query<Row>(`SELECT * FROM battle_unified_consciousness WHERE battle_id=$1${options.lock && config.databaseUrl ? " FOR UPDATE" : ""}`, [battleId]);
  return result.rows[0] ? parse(result.rows[0]) : null;
}
export function getUnifiedRuntime(battleId: string): Promise<UnifiedRuntimeSnapshot | null> {
  return getUnifiedRuntimeInTransaction({ query }, battleId);
}
export async function insertUnifiedRuntime(connection: DatabaseConnection, battleId: string, runtime: UnifiedConsciousnessRuntime, now: string): Promise<void> {
  const checked = UnifiedConsciousnessRuntimeSchema.parse(runtime);
  await connection.query(`INSERT INTO battle_unified_consciousness(battle_id,revision,fencing_token,snapshot_json,updated_at)
    VALUES($1,0,1,$2,$3)`, [battleId, JSON.stringify(checked), now]);
}
export async function writeUnifiedRuntime(connection: DatabaseConnection, current: UnifiedRuntimeSnapshot, next: UnifiedConsciousnessRuntime, now: string, fence?: BattleLeaseFence): Promise<UnifiedRuntimeSnapshot> {
  if (!Number.isFinite(Date.parse(now)) || (fence && (fence.battleId !== current.battleId || fence.fencingToken < current.fencingToken))) throw new Error("CONSCIOUSNESS_FENCE_INVALID");
  const checked = UnifiedConsciousnessRuntimeSchema.parse(next);
  const values: unknown[] = [current.battleId, current.revision, JSON.stringify(checked), now];
  const fenceCheck = fence ? ` AND EXISTS (SELECT 1 FROM battle_leases WHERE battle_id=$1 AND owner_id=$5 AND fencing_token=$6 AND expires_at>$7)` : "";
  if (fence) values.push(fence.ownerId, fence.fencingToken, now);
  const result = await connection.query<Row>(`UPDATE battle_unified_consciousness SET revision=revision+1,snapshot_json=$3,updated_at=$4${fence ? ",fencing_token=$6" : ""}
    WHERE battle_id=$1 AND revision=$2${fenceCheck} RETURNING *`, values);
  if (!result.rows[0]) throw new Error("CONSCIOUSNESS_REVISION_OR_LEASE_CONFLICT");
  return parse(result.rows[0]);
}
export async function mutateUnifiedRuntime(battleId: string, fence: BattleLeaseFence | undefined, reduce: (runtime: UnifiedConsciousnessRuntime) => UnifiedConsciousnessRuntime, now = new Date().toISOString()): Promise<UnifiedRuntimeSnapshot> {
  return withTransaction(async (connection) => {
    const current = await getUnifiedRuntimeInTransaction(connection, battleId, { lock: true });
    if (!current) throw new Error("CONSCIOUSNESS_RUNTIME_NOT_FOUND");
    return writeUnifiedRuntime(connection, current, reduce(current.runtime), now, fence);
  });
}
