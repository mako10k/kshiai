/** R: Persist battle accounting facts while preserving character definitions and immutable generations. */
import { CharacterSheetSchema, type CharacterSheet } from "@kshiai/shared";
import { withTransaction } from "../db.js";

/** Persist battle results without altering the character definition or generation. */
export async function saveCharacterBattleAccounting(input: Pick<CharacterSheet,
  "id" | "record" | "recordOverall" | "opponentMemories" | "updatedAt">): Promise<void> {
  await withTransaction(async (connection) => {
    const { rows } = await connection.query<{ sheet_json: unknown }>(
      "SELECT sheet_json FROM characters WHERE id = $1", [input.id]);
    if (!rows[0]) throw new Error("CHARACTER_NOT_FOUND");
    const stored = CharacterSheetSchema.parse(typeof rows[0].sheet_json === "string"
      ? JSON.parse(rows[0].sheet_json) : rows[0].sheet_json);
    const next = CharacterSheetSchema.parse({ ...stored,
      record: input.record ?? stored.record,
      recordOverall: input.recordOverall ?? stored.recordOverall,
      opponentMemories: input.opponentMemories ?? stored.opponentMemories,
      updatedAt: input.updatedAt,
    });
    await connection.query("UPDATE characters SET sheet_json = $2, updated_at = $3 WHERE id = $1",
      [input.id, JSON.stringify(next), next.updatedAt]);
  });
}
