import {
  AssetPublicPresentationV2Schema,
  CharacterGenerationEnvelopeV2Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  REQUIRED_CHARACTER_COMPILERS_V2,
  balanceCharacterCombatFields,
  characterDefinitionV2ToLegacySheet,
  defaultCharacterDisclosurePolicyV2,
  defaultRecord,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterProfileSourceV2,
  validateCharacterProfileClaimAssessmentV2,
  validateCharacterPublicPresentationV2,
  type CharacterGenerationEnvelopeV2,
  type CharacterSheet,
} from "@kshiai/shared";
import { type LlmProvider, type GenerateCharacterResult } from "../llm/types.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

export const CHARACTER_STRUCTURE_GENERATOR_CONTRACT =
  "character-structure-transitional-v2";
export const CHARACTER_DESCRIPTION_GENERATOR_CONTRACT =
  "character-public-profile-v2";

export async function buildCharacterGenerationCandidate(input: {
  llm: LlmProvider;
  attemptId: string;
  characterId: string;
  ownerUserId: string;
  sourceText: string;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
  generated: GenerateCharacterResult;
  existing?: CharacterSheet | null;
}): Promise<{
  envelope: CharacterGenerationEnvelopeV2;
  previewSheet: CharacterSheet;
  assistantMessage: string;
}> {
  const now = new Date().toISOString();
  const balanced = balanceCharacterCombatFields({
    ...input.generated.sheet,
    // The first-stage public blurb is deliberately discarded. Public prose is
    // derived only after the structured definition and disclosure policy pass.
    narrativeBlurb: "",
  });
  const temporary: CharacterSheet = {
    ...balanced,
    id: input.characterId,
    ownerUserId: input.ownerUserId,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: input.existing?.deletedAt ?? null,
    record: input.existing?.record ?? defaultRecord(),
    recordOverall: input.existing?.recordOverall,
    improvementMemo: input.existing?.improvementMemo,
    opponentMemories: input.existing?.opponentMemories,
    visibility: input.existing?.visibility ?? "public",
  };
  const baseDefinition = legacyCharacterSheetToDefinitionV2(temporary);
  const definition = await input.llm.generateCharacterDefinitionV2({
    sourceText: input.sourceText,
    baseDefinition,
    sourceKind: input.sourceKind,
  });
  const disclosurePolicy = defaultCharacterDisclosurePolicyV2(definition);
  const projection = projectCharacterProfileSourceV2(
    definition,
    disclosurePolicy,
  );
  const generatedProfile = await input.llm.generateCharacterProfile({
    sourceText: input.sourceText,
    projection,
  });
  const projectionDigest = assetContentDigest(projection);
  const descriptionInputDigest = assetContentDigest({
    sourceDigest: assetContentDigest(input.sourceText),
    projectionDigest,
  });
  const profileDraft = validateCharacterPublicPresentationV2(
    projection,
    AssetPublicPresentationV2Schema.parse({
      description: generatedProfile.segments
        .map((segment) => segment.text)
        .join("\n\n"),
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest,
      segments: generatedProfile.segments,
    }),
  );
  const claimAssessment = await input.llm.validateCharacterProfileClaims({
    projection,
    profile: {
      description: profileDraft.description,
      segments: profileDraft.segments,
    },
  });
  const publicPresentation = validateCharacterProfileClaimAssessmentV2(
    projection,
    profileDraft,
    {
      contractVersion: 1,
      validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
      projectionDigest,
      segments: claimAssessment.segments,
    },
  );
  const envelope = CharacterGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "character", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: input.sourceKind,
      sourceDigest: assetContentDigest(input.sourceText),
      attemptId: input.attemptId,
      structureGeneratorContract: CHARACTER_STRUCTURE_GENERATOR_CONTRACT,
      descriptionGeneratorContract: CHARACTER_DESCRIPTION_GENERATOR_CONTRACT,
    },
    compilerCompatibility: [...REQUIRED_CHARACTER_COMPILERS_V2],
  });
  const previewSheet = characterDefinitionV2ToLegacySheet({
    characterId: input.characterId,
    ownerUserId: input.ownerUserId,
    definition,
    publicPresentation,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    previousImageUrl: input.existing?.appearance.previousImageUrl,
    operational: input.existing
      ? {
          visibility: input.existing.visibility,
          record: input.existing.record,
          recordOverall: input.existing.recordOverall,
          improvementMemo: input.existing.improvementMemo,
          opponentMemories: input.existing.opponentMemories,
          deletedAt: input.existing.deletedAt,
          revisionSnapshot: input.existing.revisionSnapshot,
        }
      : undefined,
  });
  return {
    envelope,
    previewSheet,
    assistantMessage: `${input.generated.assistantMessage}\n${generatedProfile.assistantMessage}`,
  };
}
