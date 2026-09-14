import {
  CharacterGenerationEnvelopeV2Schema,
  CharacterGenerationEnvelopeV3Schema,
  CharacterCompilerCapabilityV1Schema,
  assertCharacterGenerationReadyV2,
  characterDefinitionV2ToLegacySheet,
  characterDefinitionV3ToLegacySheet,
  compileCharacterActionNormProgramV3,
  compileCharacterConsciousGuidanceV1,
  compileCharacterMechanicalConflictFallbacksV1,
  projectCharacterCompilerCompatibilityV1,
  type CharacterCompilerCapabilitySetV1,
  type CharacterCompilerCompatibilityV1,
  type CharacterGenerationEnvelopeV2,
  type CharacterGenerationEnvelopeV3,
  type CharacterSheet,
  type CombatReadyCharacterSheet,
} from "@kshiai/shared";
import {
  assetContentDigest,
  getAssetGeneration,
  type AssetGeneration,
} from "./asset-generations.js";

type CharacterGenerationReadBase = {
  generation: AssetGeneration;
  sheet: CombatReadyCharacterSheet;
};

export type CharacterGenerationRead =
  | (CharacterGenerationReadBase & {
      schemaVersion: 2;
      envelope: CharacterGenerationEnvelopeV2;
      readiness: "ready" | "unsupported";
      reasonCode: string | null;
    })
  | (CharacterGenerationReadBase & {
      schemaVersion: 3;
      envelope: CharacterGenerationEnvelopeV3;
      compatibility: CharacterCompilerCompatibilityV1;
      actionNorms: ReturnType<typeof compileCharacterActionNormProgramV3>;
      consciousGuidance: ReturnType<typeof compileCharacterConsciousGuidanceV1>;
      mechanicalConflictFallbacks: ReturnType<
        typeof compileCharacterMechanicalConflictFallbacksV1
      >;
    });

function v2Readiness(envelope: CharacterGenerationEnvelopeV2): {
  readiness: "ready" | "unsupported";
  reasonCode: string | null;
} {
  try {
    assertCharacterGenerationReadyV2(envelope);
    return { readiness: "ready", reasonCode: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_v2_envelope";
    if (message.startsWith("CHARACTER_REQUIRED_COMPILER_MISSING:")) {
      return { readiness: "unsupported", reasonCode: "missing_required_compiler" };
    }
    if (message === "CHARACTER_PROFILE_CLAIM_RECEIPT_MISSING") {
      return { readiness: "unsupported", reasonCode: "missing_claim_validation" };
    }
    if (message === "CHARACTER_ACTION_NORM_SELECTOR_MISSING") {
      return { readiness: "unsupported", reasonCode: "invalid_action_norm_selector" };
    }
    if (message.startsWith("PROFILE_")) {
      return { readiness: "unsupported", reasonCode: "invalid_claim_validation" };
    }
    return { readiness: "unsupported", reasonCode: "invalid_v2_envelope" };
  }
}

function assertGenerationIdentity(generation: AssetGeneration): void {
  if (generation.assetType !== "character") {
    throw new Error("CHARACTER_GENERATION_ASSET_TYPE_MISMATCH");
  }
  if (assetContentDigest(generation.content) !== generation.contentDigest) {
    throw new Error("CHARACTER_GENERATION_CONTENT_DIGEST_MISMATCH");
  }
}

export function readCharacterGeneration(input: {
  generation: AssetGeneration;
  currentSheet: CharacterSheet;
  requiredV3Capabilities: CharacterCompilerCapabilitySetV1;
}): CharacterGenerationRead {
  const { generation, currentSheet } = input;
  assertGenerationIdentity(generation);
  if (generation.assetId !== currentSheet.id) {
    throw new Error("CHARACTER_GENERATION_ASSET_ID_MISMATCH");
  }
  if (generation.schemaVersion === 2) {
    const envelope = CharacterGenerationEnvelopeV2Schema.parse(generation.content);
    const readiness = v2Readiness(envelope);
    return {
      schemaVersion: 2,
      generation,
      envelope,
      ...readiness,
      sheet: characterDefinitionV2ToLegacySheet({
        characterId: currentSheet.id,
        ownerUserId: currentSheet.ownerUserId,
        definition: envelope.definition,
        publicPresentation: envelope.publicPresentation,
        createdAt: currentSheet.createdAt,
        updatedAt: generation.createdAt,
        previousImageUrl: currentSheet.appearance.previousImageUrl,
        operational: {
          visibility: currentSheet.visibility,
          record: currentSheet.record,
          recordOverall: currentSheet.recordOverall,
          improvementMemo: currentSheet.improvementMemo,
          opponentMemories: currentSheet.opponentMemories,
          deletedAt: currentSheet.deletedAt,
          revisionSnapshot: currentSheet.revisionSnapshot,
        },
      }),
    };
  }
  if (generation.schemaVersion === 3) {
    const envelope = CharacterGenerationEnvelopeV3Schema.parse(generation.content);
    const compatibility = projectCharacterCompilerCompatibilityV1({
      required: input.requiredV3Capabilities,
      available: envelope.compilerCompatibility.map((capability) =>
        CharacterCompilerCapabilityV1Schema.parse(capability)),
      deferredValues: envelope.deferredValues.values,
      blocked: [],
    });
    return {
      schemaVersion: 3,
      generation,
      envelope,
      compatibility,
      actionNorms: compileCharacterActionNormProgramV3(envelope.definition),
      consciousGuidance: compileCharacterConsciousGuidanceV1(envelope.definition),
      mechanicalConflictFallbacks:
        compileCharacterMechanicalConflictFallbacksV1(envelope.definition),
      sheet: characterDefinitionV3ToLegacySheet({
        characterId: currentSheet.id,
        ownerUserId: currentSheet.ownerUserId,
        definition: envelope.definition,
        publicPresentation: envelope.publicPresentation,
        createdAt: currentSheet.createdAt,
        updatedAt: generation.createdAt,
        previousImageUrl: currentSheet.appearance.previousImageUrl,
        operational: {
          visibility: currentSheet.visibility,
          record: currentSheet.record,
          recordOverall: currentSheet.recordOverall,
          improvementMemo: currentSheet.improvementMemo,
          opponentMemories: currentSheet.opponentMemories,
          deletedAt: currentSheet.deletedAt,
          revisionSnapshot: currentSheet.revisionSnapshot,
        },
      }),
    };
  }
  throw new Error("CHARACTER_GENERATION_SCHEMA_UNSUPPORTED");
}

export async function loadCharacterGeneration(input: {
  generationId: string;
  currentSheet: CharacterSheet;
  requiredV3Capabilities: CharacterCompilerCapabilitySetV1;
}): Promise<CharacterGenerationRead | null> {
  const generation = await getAssetGeneration(input.generationId);
  return generation ? readCharacterGeneration({ ...input, generation }) : null;
}
