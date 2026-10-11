// R: Publish already-generated reserved-turn narration atomically, without another worker or provider call.
import { NarrativeBlockSchema, type BattleState, type ReservedTurnRuntime } from "@kshiai/shared";
import type { DatabaseConnection } from "../db.js";
import { appendNarrationEvent } from "../services/narration-event-storage.js";
export async function publishReservedNarration(connection: DatabaseConnection, state: BattleState, runtime: ReservedTurnRuntime, now: string): Promise<void> {
  const receipt = state.phaseReceipts?.at(-1);
  const narrative = NarrativeBlockSchema.parse(state.log.at(-1));
  const request = runtime.requests.find((item) => item.turn === state.turn && item.role === "narration" && item.status === "prepared");
  if (!receipt || receipt.combatTurn !== state.turn || narrative.turn !== state.turn || !request) throw new Error("RESERVED_PUBLICATION_BINDING_INVALID");
  await connection.query(`INSERT INTO battle_narration_entries
    (battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,status,attempt_count,terminal_narrative_json,created_at,updated_at)
    VALUES($1,$2,$3,'combat',$4,$5,$6,'completed',0,$7,$8,$8)`,
    [state.id,receipt.id,receipt.sequence,state.turn,JSON.stringify({ kind: "reserved-turns-v1", requestId: request.id }),request.inputDigest,JSON.stringify(narrative),now]);
  await appendNarrationEvent({ connection,battleId:state.id,receiptId:receipt.id,narrationSequence:receipt.sequence,kind:"completed",
    payload:{turnReceiptId:receipt.id,narrationSequence:receipt.sequence,phase:"combat",combatTurn:state.turn,status:"completed",narrative},now });
}
