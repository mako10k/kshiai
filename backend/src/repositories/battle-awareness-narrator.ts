// R: Persist receipt-ordered narrator recognition independently and project only permitted published predecessor context.
import { BattleNarratorContinuitySchema, NarrativeBlockSchema, applyBattleNarratorRecognitionUpdates,
  selectNarratorContinuityForFocus, type BattleNarratorContinuity, type NarratorRecognitionUpdate } from "@kshiai/shared";
import type { DatabaseConnection } from "../db.js";
import { AwarenessNarratorDispatchContextSchema, type AwarenessNarratorDispatchContext } from "../llm/awareness-narrator-context.js";

type Snapshot = { continuity: BattleNarratorContinuity; sequence: number };
export async function readAwarenessNarrator(connection: DatabaseConnection, battleId: string): Promise<Snapshot | null> {
  const row = (await connection.query<{ continuity_json: unknown; last_published_sequence: number }>(
    "SELECT continuity_json,last_published_sequence FROM battle_awareness_narrator_state WHERE battle_id=$1", [battleId])).rows[0];
  if (!row) return null;
  return { continuity: BattleNarratorContinuitySchema.parse(typeof row.continuity_json === "string" ? JSON.parse(row.continuity_json) : row.continuity_json), sequence: Number(row.last_published_sequence) };
}
export async function captureAwarenessNarratorContext(connection: DatabaseConnection, input: {
  battleId: string; firstSequence: number; target: "reader" | "a" | "b"; initial?: BattleNarratorContinuity; now: string;
}): Promise<AwarenessNarratorDispatchContext> {
  let snapshot = await readAwarenessNarrator(connection, input.battleId);
  if (!snapshot && input.initial) {
    await connection.query(`INSERT INTO battle_awareness_narrator_state(battle_id,last_published_sequence,continuity_json,updated_at)
      VALUES($1,0,$2,$3) ON CONFLICT(battle_id) DO NOTHING`, [input.battleId,JSON.stringify(BattleNarratorContinuitySchema.parse(input.initial)),input.now]);
    snapshot = await readAwarenessNarrator(connection, input.battleId);
  }
  if (snapshot && snapshot.sequence >= input.firstSequence) throw new Error("AWARENESS_NARRATOR_SEQUENCE_NOT_PREDECESSOR");
  const history = await connection.query<{ receipt_id: string; sequence: number; narrative_json: unknown }>(
    `SELECT receipt_id,sequence,narrative_json FROM battle_presentations WHERE battle_id=$1 AND sequence<$2 ORDER BY sequence DESC LIMIT 4`, [input.battleId,input.firstSequence]);
  return AwarenessNarratorDispatchContextSchema.parse({ target: input.target,
    continuity: snapshot ? selectNarratorContinuityForFocus({ continuity: snapshot.continuity,
      focus: input.target === "a" ? "self" : input.target === "b" ? "foe" : "external" }) : null,
    published: history.rows.reverse().map((row) => ({ battleId: input.battleId,turnReceiptId: row.receipt_id,sequence:Number(row.sequence),
      narrative: NarrativeBlockSchema.parse(typeof row.narrative_json === "string" ? JSON.parse(row.narrative_json) : row.narrative_json) })),
  });
}
export async function commitAwarenessNarratorRecognition(connection: DatabaseConnection, input: {
  battleId: string; sequence: number; turn: number; target: "reader" | "a" | "b";
  allowedSubjectRefs: readonly string[]; updates: readonly NarratorRecognitionUpdate[]; now: string;
}): Promise<void> {
  const snapshot = await readAwarenessNarrator(connection,input.battleId);
  if (!snapshot) { if (input.updates.length) throw new Error("AWARENESS_NARRATOR_INITIAL_STATE_REQUIRED"); return; }
  if (input.sequence <= snapshot.sequence) throw new Error("AWARENESS_NARRATOR_SEQUENCE_CONFLICT");
  const continuity = applyBattleNarratorRecognitionUpdates({ continuity: snapshot.continuity,target:input.target,
    turn:input.turn,allowedSubjectRefs:input.allowedSubjectRefs,updates:input.updates });
  const updated = await connection.query(`UPDATE battle_awareness_narrator_state SET continuity_json=$3,last_published_sequence=$4,updated_at=$5
    WHERE battle_id=$1 AND last_published_sequence=$2`,[input.battleId,snapshot.sequence,JSON.stringify(continuity),input.sequence,input.now]);
  if (updated.rowCount !== 1) throw new Error("AWARENESS_NARRATOR_SEQUENCE_CONFLICT");
}
