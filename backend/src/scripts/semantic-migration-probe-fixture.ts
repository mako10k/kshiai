import {
  CharacterGenerationEnvelopeV2Schema, CharacterSemanticMigrationAttemptV1Schema,
  CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1, CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
  defaultBasicAttack, defaultParameters, type CharacterSheet,
} from "@kshiai/shared";
import { buildImportedCharacterEnvelopeV2 } from "../services/character-authoring-service.js";
import { assetContentDigest, createAssetGeneration } from "../repositories/asset-generations.js";
import { characterSemanticMigrationInitialRequestDigest } from "../repositories/character-semantic-migration.js";
import { query } from "../db.js";
import { MIGRATION_PROBE_CONTRACT } from "../llm/character-migration-probe-provider.js";
import type { SemanticMigrationProbeRun } from "./semantic-migration-probe-run.js";

export const PROBE_STAMP = "2026-09-10T00:00:00.000Z";

export function semanticMigrationProbeSource() {
  const sheet: CharacterSheet = {
    id: "migration-probe-akari", ownerUserId: "migration-probe-owner",
    displayName: "検証用アカリ", tags: [], traits: [],
    createdAt: PROBE_STAMP, updatedAt: PROBE_STAMP,
    appearance: { summary: "青い外套の剣士", visualPrompt: "synthetic blue cloak" },
    parameters: defaultParameters(), skills: [], basicAttack: defaultBasicAttack(),
    weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "移行検証専用の架空の剣士。",
  };
  const imported = buildImportedCharacterEnvelopeV2({ sheet, attemptId: "probe-import" });
  const always = { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] };
  const common = { when: always, priority: 60, force: "preference",
    selfAwareness: "aware", exceptions: [], description: null };
  const source = CharacterGenerationEnvelopeV2Schema.parse({
    ...imported,
    definition: { ...imported.definition, actionNorms: [
      { ...common, id: "probe-enjoy", response: {
        disposition: "prefer", actionRefs: [], actionKinds: [], tacticTags: [],
        statement: "勝利だけに固執せず、相手との攻防を楽しみたい。",
        fallbackActionRef: imported.definition.capabilities.basicAction.id,
      } },
      { ...common, id: "probe-basic", priority: 40, response: {
        disposition: "prefer", actionRefs: [imported.definition.capabilities.basicAction.id],
        actionKinds: [], tacticTags: [], statement: "基本攻撃を優先したい。", fallbackActionRef: null,
      } },
    ] },
  });
  return { sheet, source };
}

// Imported only after the standalone launcher has selected its fresh SQLite directory.
export async function seedSemanticMigrationProbe(run: SemanticMigrationProbeRun = {
  runId: MIGRATION_PROBE_CONTRACT.runId,
  promptIdentity: "character-semantic-migration-prompt-v1",
}) {
  const { sheet, source } = semanticMigrationProbeSource();
  await query("INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$1,'probe',$2)",
    [sheet.ownerUserId, PROBE_STAMP]);
  await query(`INSERT INTO characters (id,owner_user_id,sheet_json,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$4)`, [sheet.id, sheet.ownerUserId, JSON.stringify(sheet), PROBE_STAMP]);
  const generation = await createAssetGeneration({
    assetType: "character", assetId: sheet.id, schemaVersion: 2, content: source, createdAt: PROBE_STAMP,
  });
  await query(`INSERT INTO character_asset_states
    (character_id,compatibility_status,current_generation_id,updated_at)
    VALUES ($1,'ready',$2,$3)`, [sheet.id, generation.generationId, PROBE_STAMP]);
  const base = CharacterSemanticMigrationAttemptV1Schema.omit({ initialRequestDigest: true }).parse({
    migrationAttemptId: run.runId,
    ownerUserId: sheet.ownerUserId, characterId: sheet.id,
    sourceGenerationId: generation.generationId, sourceSchemaVersion: 2,
    sourceContent: source, sourceContentDigest: assetContentDigest(source), naturalSource: null,
    targetSchemaVersion: 3, migrationContractId: CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
    promptIdentity: run.promptIdentity,
    responseSchemaIdentity: CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
    providerRoute: MIGRATION_PROBE_CONTRACT.endpoint, modelIdentity: MIGRATION_PROBE_CONTRACT.model,
    compilerCapabilities: { contractVersion: 1, required: [
      { consumer: "character-action-norms", version: 3 },
      { consumer: "character-mechanical-conflict-fallback", version: 1 },
    ] },
    createdAt: PROBE_STAMP,
  });
  return { ...base, initialRequestDigest: characterSemanticMigrationInitialRequestDigest(base) };
}
