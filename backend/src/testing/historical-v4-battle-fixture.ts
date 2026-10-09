// R: Persist a complete local historical V4 tuple without invoking current battle creation.
import {
  BattleAssetManifestV4Schema, BattleStateSchema, CharacterAgentStateSchema,
  CharacterGenerationEnvelopeV3Schema, compileCharacterBattleCompilerInputsV4,
  createBattleState, initialConsciousAgencyV2, initialPsycheReactionStateV1,
  LOCAL_TWELVE_TURN_PACING_CANDIDATE, openSceneBeat, toBattleCharacterSnapshot,
} from "@kshiai/shared";
import { createConsciousFixture } from "../services/conscious-agency.fixtures.js";
import { getSheet } from "../repositories/characters.js";
import { createAssetGeneration, getCurrentAssetGeneration } from "../repositories/asset-generations.js";
import { insertNewBattle } from "../repositories/battles.js";
import { bindDialoguePipelineActivation, resolveConfiguredDialoguePipelineActivation } from "../services/dialogue-pipeline-activation.js";
import { toBattlePublic } from "../services/battle-service.js";

/** Q06 fixture entry: construct before insert; never rewrite an existing manifest. */
export async function persistHistoricalV4BattleFixture(input: {
  userId: string; battleId: string; myCharacterId: string; opponentCharacterId: string;
}) {
  const mine = await getSheet(input.myCharacterId);
  const opponent = await getSheet(input.opponentCharacterId);
  if (!mine || !opponent || mine.ownerUserId !== input.userId) throw new Error("INVALID_HISTORICAL_FIXTURE_PARTICIPANTS");
  const a = await getCurrentAssetGeneration("character", mine.id);
  const b = await getCurrentAssetGeneration("character", opponent.id);
  if (!a || !b) throw new Error("MISSING_HISTORICAL_FIXTURE_GENERATIONS");
  const envelopes = {
    a: CharacterGenerationEnvelopeV3Schema.parse(a.content),
    b: CharacterGenerationEnvelopeV3Schema.parse(b.content),
  };
  const template = createConsciousFixture();
  const templateManifest = template.state.assetManifest;
  if (!templateManifest) throw new Error("MISSING_HISTORICAL_FIXTURE_TEMPLATE");
  const { activation, snapshot } = await resolveConfiguredDialoguePipelineActivation();
  const dialogueGeneration = await createAssetGeneration({ assetType: "dialogue-pipeline",
    assetId: "global", schemaVersion: 1, content: snapshot });
  const characters = {
    a: { assetId: mine.id, generationId: a.generationId, contentDigest: a.contentDigest,
      snapshot: toBattleCharacterSnapshot(mine),
      basicAttackSource: { kind: "character_generation_v3", generationId: a.generationId,
        definitionPath: "capabilities.basicAction" },
      compilerInputsV4: compileCharacterBattleCompilerInputsV4({ definition: envelopes.a.definition,
        counterpartCharacterAssetId: opponent.id, relationshipRoles: ["stranger"],
        disclosurePolicy: envelopes.a.disclosurePolicy }) },
    b: { assetId: opponent.id, generationId: b.generationId, contentDigest: b.contentDigest,
      snapshot: toBattleCharacterSnapshot(opponent),
      basicAttackSource: { kind: "character_generation_v3", generationId: b.generationId,
        definitionPath: "capabilities.basicAction" },
      compilerInputsV4: compileCharacterBattleCompilerInputsV4({ definition: envelopes.b.definition,
        counterpartCharacterAssetId: mine.id, relationshipRoles: ["stranger"],
        disclosurePolicy: envelopes.b.disclosurePolicy }) },
  };
  const state = createBattleState({ id: input.battleId, sideA: mine, sideB: opponent,
    turnLimit: 12, pacingPolicy: LOCAL_TWELVE_TURN_PACING_CANDIDATE,
    battlefield: template.state.battlefield
      ? { kind: "legacy", instance: template.state.battlefield } : undefined, narrationStyle: template.state.narrationStyle,
    prologuePending: true });
  const manifest = BattleAssetManifestV4Schema.parse({
    schemaVersion: 4, consciousOutputContract: "dynamic-v4", boundAt: state.createdAt,
    characters, battlefield: templateManifest.battlefield, narrationStyle: templateManifest.narrationStyle,
    dialoguePipeline: bindDialoguePipelineActivation(dialogueGeneration, snapshot, activation),
    rules: { battleEngine: "battle-engine-v1", temporalRules: "initiative-window-v2",
      psycheReaction: "psyche-reaction-policy-v1", characterDefinitionRules: "character-definition-rules-v3",
      battlefieldDefinitionRules: "battlefield-instance-v2", narrationStyleRules: "narration-prompt-v2" },
  });
  const historical = BattleStateSchema.parse({ ...state, assetManifest: manifest,
    sceneBeat: openSceneBeat(3), dialoguePipelineSnapshot: snapshot,
    agentStateA: CharacterAgentStateSchema.parse({ ...state.agentStateA,
      consciousAgencyV2: initialConsciousAgencyV2(), reactionStateV1: initialPsycheReactionStateV1() }),
    agentStateB: CharacterAgentStateSchema.parse({ ...state.agentStateB,
      consciousAgencyV2: initialConsciousAgencyV2(), reactionStateV1: initialPsycheReactionStateV1() }),
  });
  const inserted = await insertNewBattle(historical, { sideAUserId: input.userId,
    sideACharacterId: mine.id, sideBCharacterId: opponent.id });
  if (inserted !== "created") throw new Error("HISTORICAL_FIXTURE_ALREADY_EXISTS");
  return toBattlePublic(historical, mine, null, opponent);
}
