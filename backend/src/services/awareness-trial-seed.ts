// R: Register fixed trial assets through current immutable-generation writers in a fresh scratch database.
import { BattlefieldPresetSchema, CharacterGenerationEnvelopeV3Schema, defaultDialoguePipelineSettings } from "@kshiai/shared";
import { query, withTransaction } from "../db.js";
import { writeAssetGeneration, type AssetGeneration } from "../repositories/asset-generations.js";
import { updateDialoguePipelineSettings } from "../repositories/dialogue-pipeline-settings.js";
import { ensureSystemNarrationStyles } from "../repositories/narration-styles.js";
import { buildImportedCharacterEnvelopeV2 } from "./character-authoring-service.js";
import { buildImportedBattlefieldEnvelopeV2 } from "./battlefield-authoring-service.js";
import type { AwarenessTrialCandidate } from "./awareness-trial-candidate.js";

export async function seedAwarenessTrial(candidate: AwarenessTrialCandidate) {
  const userId = "awareness-trial-owner";
  const now = "2026-10-05T00:00:00.000Z";
  const counts = await query<{ count: number }>("SELECT COUNT(*) AS count FROM characters");
  if (Number(counts.rows[0]?.count) !== 0) throw new Error("TRIAL_REQUIRES_EMPTY_DATABASE");
  const battlefield = BattlefieldPresetSchema.parse({
    id: "awareness-trial-field", ownerUserId: userId, isSystem: false,
    createdAt: now, updatedAt: now, displayName: "平坦な訓練場", category: "arena", tags: ["平坦"],
    appearance: { summary: candidate.scenario.setting, visualPrompt: "flat bright training ground" },
    terrainHints: ["平坦な地面"], obstacleHints: [], conditionHints: ["明るい"],
    baseCoefficients: {}, narrativeBlurb: candidate.scenario.setting,
  });
  const generations = await withTransaction(async (connection) => {
    await connection.query("INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$2,$3,$4)", [userId, "awareness-trial", "disabled-trial-login", now]);
    const result: AssetGeneration[] = [];
    for (const { sheet, definition } of candidate.characters) {
      const imported = buildImportedCharacterEnvelopeV2({ sheet, attemptId: `trial-import:${sheet.id}` });
      const envelope = CharacterGenerationEnvelopeV3Schema.parse({
        ...imported, definitionSchema: { family: "character", version: 3 }, definition,
        provenance: { ...imported.provenance, structureGeneratorContract: "fixed-trial-character-v3-import-v1" },
        compilerCompatibility: [
          { consumer: "character-profile", version: 2 }, { consumer: "battle-mechanics", version: 3 },
          { consumer: "psyche-trait-profile", version: 1 }, { consumer: "character-conscious-self", version: 3 },
          { consumer: "character-action-norms", version: 3 }, { consumer: "character-mechanical-conflict-fallback", version: 1 },
          { consumer: "character-relationship", version: 2 },
        ], deferredValues: { contractVersion: 1, values: [] },
      });
      await connection.query("INSERT INTO characters (id,owner_user_id,sheet_json,created_at,updated_at) VALUES ($1,$2,$3,$4,$5)", [sheet.id, userId, JSON.stringify(sheet), sheet.createdAt, sheet.updatedAt]);
      const generation = await writeAssetGeneration(connection, { assetType: "character", assetId: sheet.id, schemaVersion: 3, content: envelope });
      await connection.query(`INSERT INTO character_asset_states (character_id,compatibility_status,current_generation_id,active_attempt_id,reason_code,updated_at) VALUES ($1,'ready',$2,NULL,NULL,$3)`, [sheet.id, generation.generationId, now]);
      result.push(generation);
    }
    await connection.query("INSERT INTO battlefields (id,owner_user_id,is_system,sheet_json,created_at,updated_at) VALUES ($1,$2,FALSE,$3,$4,$4)", [battlefield.id, userId, JSON.stringify(battlefield), now]);
    const fieldGeneration = await writeAssetGeneration(connection, { assetType: "battlefield-preset", assetId: battlefield.id, schemaVersion: 2, content: buildImportedBattlefieldEnvelopeV2({ preset: battlefield, attemptId: "trial-field-import" }) });
    await connection.query(`INSERT INTO battlefield_asset_states (battlefield_id,compatibility_status,current_generation_id,active_attempt_id,reason_code,updated_at) VALUES ($1,'ready',$2,NULL,NULL,$3)`, [battlefield.id, fieldGeneration.generationId, now]);
    result.push(fieldGeneration);
    return result;
  });
  await ensureSystemNarrationStyles();
  await updateDialoguePipelineSettings({ userId, patch: { ...defaultDialoguePipelineSettings(), schemaVersion: 3, contextProjectionMode: "compact", expectedRevision: 0 } });
  return { userId, battlefieldId: battlefield.id, generations };
}
