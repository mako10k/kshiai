// R: Allocate and append durable public narration events atomically per battle.
import type { BattleNarrationEntryPublic, NarrativeBlock } from "@kshiai/shared";
import { databaseKind, type DatabaseConnection } from "../db.js";

export interface AppendNarrationEventInput {
  connection: DatabaseConnection;
  battleId: string;
  receiptId: string;
  narrationSequence: number;
  kind: "queued" | "started" | "completed" | "failed" | "cancelled";
  payload: {
    turnReceiptId: string;
    narrationSequence: number;
    phase: BattleNarrationEntryPublic["phase"];
    combatTurn: number | null;
    status: BattleNarrationEntryPublic["status"];
    narrative?: NarrativeBlock;
    fallbackReason?: string;
  };
  now: string;
}

/** The caller owns the transaction; the lock persists through its commit or rollback. */
export async function appendNarrationEvent(
  input: AppendNarrationEventInput,
  dialect: "postgres" | "sqlite" = databaseKind(),
): Promise<void> {
  if (dialect === "postgres") {
    await input.connection.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      ["battle-narration-events", input.battleId],
    );
  }
  // One statement sees either retained events or the atomically committed prune floor.
  const result = await input.connection.query<{ next_sequence: number | string }>(
    `SELECT COALESCE(MAX(event_sequence), 0) + 1 AS next_sequence FROM (
       SELECT event_sequence FROM battle_narration_events WHERE battle_id = $1
       UNION ALL
       SELECT pruned_through_sequence AS event_sequence
         FROM battle_narration_retention WHERE battle_id = $1
     ) watermark`,
    [input.battleId],
  );
  const sequence = Number(result.rows[0]?.next_sequence ?? 1);
  await input.connection.query(
    `INSERT INTO battle_narration_events
      (battle_id, event_sequence, event_id, receipt_id, narration_sequence,
       kind, public_payload_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [input.battleId, sequence, `${input.battleId}:event:${sequence}`, input.receiptId,
      input.narrationSequence, input.kind, JSON.stringify(input.payload), input.now],
  );
}
