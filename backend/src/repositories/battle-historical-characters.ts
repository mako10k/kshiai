/** R: Read immutable battle-bound character profiles without executable battle reconstruction. */
import { query } from "../db.js";
import { resolveHistoricalCharacterViewFromJson, type HistoricalCharacterView } from "../services/character-historical-view.js";

export async function getHistoricalBattleCharacter(
  battleId: string,
  characterId: string,
): Promise<HistoricalCharacterView | null> {
  const result = await query<{ state_json: unknown }>(
    "SELECT state_json FROM battles WHERE id = $1",
    [battleId],
  );
  const row = result.rows[0];
  return row ? resolveHistoricalCharacterViewFromJson(row.state_json, characterId) : null;
}
