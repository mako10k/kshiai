import type { NarrativeBlock } from "@kshiai/shared";
import { NarrativeBlockSchema } from "@kshiai/shared";
import { query } from "../db.js";

export async function saveBattlePresentation(input: {
  battleId: string;
  receiptId: string;
  sequence: number;
  phase: "prologue" | "combat" | "judgment" | "aftermath";
  combatTurn: number | null;
  inputDigest: string;
  narrative: NarrativeBlock;
  createdAt: string;
}): Promise<void> {
  const result = await query<{ receipt_id: string }>(
    `INSERT INTO battle_presentations
      (battle_id, receipt_id, sequence, phase, combat_turn, input_digest, narrative_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (battle_id, receipt_id) DO UPDATE
       SET narrative_json = EXCLUDED.narrative_json
       WHERE battle_presentations.input_digest = EXCLUDED.input_digest
     RETURNING receipt_id`,
    [
      input.battleId,
      input.receiptId,
      input.sequence,
      input.phase,
      input.combatTurn,
      input.inputDigest,
      JSON.stringify(input.narrative),
      input.createdAt,
    ],
  );
  if (result.rowCount !== 1) throw new Error("PRESENTATION_DIGEST_CONFLICT");
}

export async function listBattlePresentations(
  battleId: string,
): Promise<NarrativeBlock[]> {
  const result = await query<{ narrative_json: unknown }>(
    `SELECT narrative_json
       FROM battle_presentations
      WHERE battle_id = $1
      ORDER BY sequence ASC`,
    [battleId],
  );
  return result.rows.map((row) => NarrativeBlockSchema.parse(
    typeof row.narrative_json === "string"
      ? JSON.parse(row.narrative_json)
      : row.narrative_json,
  ));
}
