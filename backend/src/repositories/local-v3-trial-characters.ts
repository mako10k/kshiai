/** R: Register an explicitly supplied V3 trial character in the local asset store. */
import {
  CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
  CharacterCompilerCapabilityV1Schema,
  CharacterGenerationEnvelopeV3Schema,
  characterDefinitionV3ToLegacySheet,
  projectCharacterCompilerCompatibilityV1,
  type CharacterGenerationEnvelopeV3,
} from "@kshiai/shared";
import { databaseKind, query, withTransaction } from "../db.js";
import {
  activateAssetGeneration,
  appendAssetGeneration,
  assetContentDigest,
  getCurrentAssetGeneration,
} from "./asset-generations.js";
import { getCharacterCompatibility } from "./character-assets-v2.js";

/** Existing character IDs are never repurposed by the local trial importer. */
export async function registerLocalV3TrialCharacter(input: {
  characterId: string;
  ownerUserId: string;
  envelope: CharacterGenerationEnvelopeV3;
}) {
  if (databaseKind() !== "sqlite") throw new Error("LOCAL_V3_TRIAL_REQUIRES_SQLITE");
  const envelope = CharacterGenerationEnvelopeV3Schema.parse(input.envelope);
  const compatibility = projectCharacterCompilerCompatibilityV1({
    required: CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
    available: envelope.compilerCompatibility.map((item) =>
      CharacterCompilerCapabilityV1Schema.parse(item)),
    deferredValues: envelope.deferredValues.values,
    blocked: [],
  });
  if (compatibility.status !== "ready") throw new Error("TRIAL_CHARACTER_NOT_READY");
  const contentDigest = assetContentDigest(envelope);
  await withTransaction(async (connection) => {
    const owner = await connection.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1`, [input.ownerUserId]);
    if (!owner.rows[0]) throw new Error("TRIAL_OWNER_NOT_FOUND");
    const existing = await connection.query<{ owner_user_id: string }>(
      `SELECT owner_user_id FROM characters WHERE id = $1`, [input.characterId]);
    if (existing.rows[0]) {
      if (existing.rows[0].owner_user_id !== input.ownerUserId) {
        throw new Error("TRIAL_CHARACTER_OWNER_MISMATCH");
      }
      const current = await connection.query<{
        generation_id: string; content_digest: string; schema_version: number;
      }>(
        `SELECT g.generation_id, g.content_digest, g.schema_version
           FROM asset_current_generations c
           JOIN asset_generations g ON g.generation_id = c.generation_id
          WHERE c.asset_type = 'character' AND c.asset_id = $1`,
        [input.characterId],
      );
      if (current.rows[0]?.content_digest === contentDigest
        && Number(current.rows[0].schema_version) === 3) return;
      throw new Error("TRIAL_CHARACTER_ALREADY_EXISTS");
    }
    const now = new Date().toISOString();
    const sheet = characterDefinitionV3ToLegacySheet({
      characterId: input.characterId,
      ownerUserId: input.ownerUserId,
      definition: envelope.definition,
      publicPresentation: envelope.publicPresentation,
      createdAt: now,
      updatedAt: now,
    });
    const generation = await appendAssetGeneration(connection, {
      assetType: "character",
      assetId: input.characterId,
      schemaVersion: 3,
      content: envelope,
      createdAt: now,
    });
    await connection.query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [sheet.id, input.ownerUserId, JSON.stringify(sheet), now, now],
    );
    await activateAssetGeneration(connection, generation, null, now);
    await connection.query(
      `INSERT INTO character_asset_states
        (character_id, compatibility_status, current_generation_id,
         active_attempt_id, reason_code, updated_at)
       VALUES ($1, 'ready', $2, NULL, NULL, $3)`,
      [input.characterId, generation.generationId, now],
    );
  });
  const generation = await getCurrentAssetGeneration("character", input.characterId);
  const state = await getCharacterCompatibility(input.characterId);
  if (!generation || generation.schemaVersion !== 3
    || generation.contentDigest !== contentDigest
    || state.status !== "ready"
    || state.currentGenerationId !== generation.generationId) {
    throw new Error("TRIAL_CHARACTER_READBACK_FAILED");
  }
  const sheet = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id = $1 AND owner_user_id = $2`,
    [input.characterId, input.ownerUserId],
  );
  if (!sheet.rows[0]) throw new Error("TRIAL_CHARACTER_READBACK_FAILED");
  return { characterId: input.characterId, generationId: generation.generationId,
    contentDigest: generation.contentDigest };
}
