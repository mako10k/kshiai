// R: Capture entry provenance before its containing canonical state under statement-level snapshots.
import { BattleStateSchema, type BattleState } from "@kshiai/shared";
import type { DatabaseConnection } from "../db.js";
import { getBattleOperationalRuntimeInTransaction, type BattleOperationalSnapshot } from "../repositories/battle-operational-runtime.js";
import type { Entry } from "./awareness-narration-worker-contract.js";

export interface AwarenessNarrationClaimReadPort {
  readEntries(): Promise<Entry[]>;
  readBattle(): Promise<BattleState | null>;
  readRuntime(): Promise<BattleOperationalSnapshot | null>;
}
export type AwarenessNarrationClaimSnapshot = {
  entries: Entry[];
  battle: BattleState;
  runtime: BattleOperationalSnapshot;
};

/** Writers commit each canonical receipt and its entry together. Reading entries first
 * lets a later canonical snapshot contain every captured entry without adding locks.
 * Normal bounded V5 execution retains at most 38 receipts within its 100-receipt
 * canonical retention window; this ordering assumes captured receipts remain retained.
 * Missing runtime remains an error even when the captured entry list is empty.
 */
export async function captureAwarenessNarrationClaimSnapshot(port: AwarenessNarrationClaimReadPort): Promise<AwarenessNarrationClaimSnapshot | null> {
  const entries = await port.readEntries();
  const battle = await port.readBattle();
  if (!battle) return null;
  const runtime = await port.readRuntime();
  if (!runtime) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
  return { entries, battle, runtime };
}

/** The caller owns the transaction and its isolation level. */
export function readAwarenessNarrationClaimSnapshot(connection: DatabaseConnection, battleId: string): Promise<AwarenessNarrationClaimSnapshot | null> {
  return captureAwarenessNarrationClaimSnapshot({
    async readEntries() {
      const result = await connection.query<Entry>(`SELECT battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,
        status,active_attempt_id,attempt_count,created_at FROM battle_narration_entries
        WHERE battle_id = $1 AND status IN ('queued','generating') ORDER BY sequence ASC`, [battleId]);
      return result.rows;
    },
    async readBattle() {
      const result = await connection.query<{ state_json: unknown }>("SELECT state_json FROM battles WHERE id=$1", [battleId]);
      const raw = result.rows[0]?.state_json;
      return raw === undefined ? null : BattleStateSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
    },
    readRuntime: () => getBattleOperationalRuntimeInTransaction(connection, battleId),
  });
}
