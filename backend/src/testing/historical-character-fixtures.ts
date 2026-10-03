/** R: Prepare immutable historical character fixtures exclusively for automated tests. */
import { defaultRecord, requireCombatReadyCharacterSheet, ensureCharacterIdentityProperties,
  assertCharacterGenerationReadyV2, characterDefinitionV2ToLegacySheet,
  type CharacterSheet, type CharacterGenerationEnvelopeV2 } from "@kshiai/shared";
import { withTransaction } from "../db.js";
import { appendAssetGeneration, activateAssetGeneration, type AssetGeneration } from "./historical-asset-generations.js";
import { buildImportedCharacterEnvelopeV2 } from "../services/character-authoring-service.js";

export async function saveHistoricalCharacterFixture(sheet: CharacterSheet): Promise<void> {
  const withRecord = requireCombatReadyCharacterSheet({
    ...ensureCharacterIdentityProperties(requireCombatReadyCharacterSheet(sheet)),
    record: sheet.record ?? defaultRecord(),
  });
  const json = JSON.stringify(withRecord);
  await withTransaction(async (connection) => {
    const stored = await connection.query<{ id: string }>(
      `SELECT id FROM characters WHERE id = $1`,
      [withRecord.id],
    );
    // V2 authority is immutable. Existing operational rows may refresh only
    // the transitional read model; they never append a legacy generation.
    let importedGeneration: Awaited<ReturnType<typeof appendAssetGeneration>> | null = null;
    if (!stored.rows[0]) {
      // Programmatic seed/import of a brand-new character is explicitly marked
      // as an import. Existing rows are never auto-upgraded by this path.
      const envelope = buildImportedCharacterEnvelopeV2({
        sheet: withRecord,
        attemptId: `internal-import:${withRecord.id}`.slice(0, 160),
      });
      importedGeneration = await appendAssetGeneration(connection, {
        assetType: "character",
        assetId: withRecord.id,
        schemaVersion: 2,
        content: envelope,
        createdAt: withRecord.updatedAt,
      });
    }
    await connection.query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [
        withRecord.id,
        withRecord.ownerUserId,
        json,
        withRecord.createdAt,
        withRecord.updatedAt,
      ],
    );
    if (importedGeneration) {
      await activateAssetGeneration(
        connection,
        importedGeneration,
        null,
        withRecord.updatedAt,
      );
      await connection.query(
        `INSERT INTO character_asset_states
          (character_id, compatibility_status, current_generation_id,
           active_attempt_id, reason_code, updated_at)
         VALUES ($1, 'ready', $2, NULL, NULL, $3)`,
        [withRecord.id, importedGeneration.generationId, withRecord.updatedAt],
      );
    }
  });
}

export async function activateHistoricalCharacterFixtureV2(input: {
  sheet: CharacterSheet;
  envelope: CharacterGenerationEnvelopeV2;
}): Promise<AssetGeneration> {
  const envelope = assertCharacterGenerationReadyV2(input.envelope);
  return withTransaction(async (connection) => {
    const current = await connection.query<{ generation_id: string }>(
      `SELECT generation_id FROM asset_current_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      [input.sheet.id],
    );
    const sheet = characterDefinitionV2ToLegacySheet({
      characterId: input.sheet.id,
      ownerUserId: input.sheet.ownerUserId,
      definition: envelope.definition,
      publicPresentation: envelope.publicPresentation,
      createdAt: input.sheet.createdAt,
      updatedAt: input.sheet.updatedAt,
      previousImageUrl: input.sheet.appearance.previousImageUrl,
      operational: {
        visibility: input.sheet.visibility,
        record: input.sheet.record,
        recordOverall: input.sheet.recordOverall,
        improvementMemo: input.sheet.improvementMemo,
        opponentMemories: input.sheet.opponentMemories,
        deletedAt: input.sheet.deletedAt,
        revisionSnapshot: input.sheet.revisionSnapshot,
      },
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "character",
      assetId: sheet.id,
      schemaVersion: 2,
      content: envelope,
      createdAt: sheet.updatedAt,
    });
    await connection.query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [sheet.id, sheet.ownerUserId, JSON.stringify(sheet), sheet.createdAt, sheet.updatedAt],
    );
    await activateAssetGeneration(
      connection,
      generation,
      current.rows[0]?.generation_id ?? null,
      sheet.updatedAt,
    );
    await connection.query(
      `INSERT INTO character_asset_states
        (character_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)
       ON CONFLICT (character_id) DO UPDATE
         SET compatibility_status = 'ready',
             current_generation_id = EXCLUDED.current_generation_id,
             active_attempt_id = NULL,
             reason_code = NULL,
             updated_at = EXCLUDED.updated_at`,
      [sheet.id, generation.generationId, sheet.updatedAt],
    );
    return generation;
  });
}
