import { type CharacterSemanticMigrationAttemptV1 } from "@kshiai/shared";
import { query } from "../db.js";

export async function requireCharacterMigrationSourceReady(
  attempt: CharacterSemanticMigrationAttemptV1,
): Promise<void> {
  const result = await query<{
    compatibility_status: string; current_generation_id: string | null;
  }>(
    `SELECT compatibility_status, current_generation_id
       FROM character_asset_states WHERE character_id = $1`,
    [attempt.characterId],
  );
  const state = result.rows[0];
  if (state?.compatibility_status !== "ready" ||
      state.current_generation_id !== attempt.sourceGenerationId) {
    throw new Error("CHARACTER_MIGRATION_SOURCE_NOT_READY");
  }
}
