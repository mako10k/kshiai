// R: Construct schema-valid frozen awareness battle assets for isolated contract tests.
import {
  AwarenessDefaultPolicy,
  BattleAssetManifestV5Schema, BattleStateSchema, BattleDialoguePipelineSnapshotV3Schema,
  BattlefieldInstanceSchema, CharacterDefinitionV3Schema, createBattleState,
  defaultBasicAttack, defaultDialoguePipelineSettings, defaultParameters,
  requireCombatReadyCharacterSheet, legacyCharacterSheetToDefinitionV2, compileCharacterPsycheTraitsV1,
  projectCharacterConsciousSelfV2, compileCharacterActionNormProgramV3, compileCharacterConsciousGuidanceV1,
  compileCharacterMechanicalConflictFallbacksV1,
} from "@kshiai/shared";

const now = Date.parse("2026-10-05T06:00:00.000Z");

function sheet(id: string) {
  return requireCombatReadyCharacterSheet({ id, ownerUserId: "owner", displayName: id, tags: [],
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    appearance: { summary: "試験", visualPrompt: "test" }, traits: [], parameters: defaultParameters(),
    skills: [], basicAttack: defaultBasicAttack(), weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false }, narrativeBlurb: "試験用" });
}

function binding(character: ReturnType<typeof sheet>) {
  const v2 = legacyCharacterSheetToDefinitionV2(character);
  const { schemaVersion, actionNorms, ...stable } = v2;
  const definition = CharacterDefinitionV3Schema.parse({ ...stable, schemaVersion: 3,
    actionNorms: [], consciousGuidance: [], mechanicalConflictFallbacks: [] });
  return { assetId: character.id, generationId: `generation-${character.id}`, contentDigest: "0".repeat(64), snapshot: character,
    basicAttackSource: { kind: "character_generation_v3", generationId: `generation-${character.id}`, definitionPath: "capabilities.basicAction" },
    compilerInputsV4: { psycheTraits: compileCharacterPsycheTraitsV1(v2), consciousSelf: projectCharacterConsciousSelfV2(v2),
      actionNorms: compileCharacterActionNormProgramV3(definition), consciousGuidance: compileCharacterConsciousGuidanceV1(definition),
      mechanicalConflictFallbacks: compileCharacterMechanicalConflictFallbacksV1(definition) } };
}

export function validAwarenessBattleFixture(id: string) {
  const a = sheet("a"); const b = sheet("b");
  const { updatedAt, updatedBy, ...values } = defaultDialoguePipelineSettings();
  const dialogue = BattleDialoguePipelineSnapshotV3Schema.parse({ ...values, schemaVersion: 3, contextProjectionMode: "compact" });
  const battlefield = BattlefieldInstanceSchema.parse({ displayName: "試験場", scene: "広場", terrain: "平坦", narrativeSetup: "広場で向き合う" });
  const manifest = BattleAssetManifestV5Schema.parse({ schemaVersion: 5, consciousOutputContract: "awareness-v5",
    boundAt: new Date(now).toISOString(), characters: { a: binding(a), b: binding(b) },
    narrationStyle: { assetId: "style", generationId: "narration-generation", contentDigest: "0".repeat(64),
      snapshot: { id: "style", displayName: "実況", instruction: "確定出来事を実況", perspective: "external" } },
    battlefield: { assetId: null, generationId: "field-generation", contentDigest: "0".repeat(64), snapshot: battlefield },
    dialoguePipeline: { generationId: "dialogue-generation", contentDigest: "0".repeat(64), snapshot: dialogue, activationSource: "persisted_setting" },
    awarenessPolicy: AwarenessDefaultPolicy, promptRevision: "awareness-prompt-v1", outputRevision: "awareness-output-v1",
    rules: { battleEngine: "battle-engine-v1", temporalRules: "initiative-window-v2", psycheReaction: "awareness-v5",
      characterDefinitionRules: "character-definition-rules-v3", battlefieldDefinitionRules: "battlefield-instance-v2", narrationStyleRules: "narration-prompt-v2" } });
  const state = BattleStateSchema.parse({ ...createBattleState({ id, sideA: a, sideB: b, turnLimit: 12,
    battlefield, prologuePending: false }), assetManifest: manifest, agentStateA: undefined, agentStateB: undefined });
  return { state, characters: { a, b }, definitions: { a: CharacterDefinitionV3Schema.parse({ ...legacyCharacterSheetToDefinitionV2(a), schemaVersion: 3, actionNorms: [], consciousGuidance: [], mechanicalConflictFallbacks: [] }), b: CharacterDefinitionV3Schema.parse({ ...legacyCharacterSheetToDefinitionV2(b), schemaVersion: 3, actionNorms: [], consciousGuidance: [], mechanicalConflictFallbacks: [] }) } };
}
