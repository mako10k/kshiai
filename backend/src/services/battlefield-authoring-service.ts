import {
  AssetPublicPresentationV2Schema,
  BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT,
  BattlefieldGenerationEnvelopeV2Schema,
  REQUIRED_BATTLEFIELD_COMPILERS_V2,
  battlefieldDefinitionV2ToLegacyPreset,
  defaultBattlefieldDisclosurePolicyV2,
  legacyBattlefieldPresetToDefinitionV2,
  projectBattlefieldSceneSourceV2,
  validateBattlefieldPublicPresentationV2,
  validateBattlefieldSceneClaimAssessmentV2,
  type BattlefieldGenerationEnvelopeV2,
  type BattlefieldPreset,
} from "@kshiai/shared";
import type { GenerateBattlefieldResult, LlmProvider } from "../llm/types.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

export const BATTLEFIELD_STRUCTURE_GENERATOR_CONTRACT =
  "battlefield-structure-v2";
export const BATTLEFIELD_DESCRIPTION_GENERATOR_CONTRACT =
  "battlefield-public-scene-v2";

export async function buildBattlefieldGenerationCandidate(input: {
  llm: LlmProvider;
  attemptId: string;
  battlefieldId: string;
  ownerUserId: string | null;
  isSystem?: boolean;
  sourceText: string;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
  generated: GenerateBattlefieldResult;
  existing?: BattlefieldPreset | null;
}): Promise<{
  envelope: BattlefieldGenerationEnvelopeV2;
  previewPreset: BattlefieldPreset;
  assistantMessage: string;
}> {
  const now = new Date().toISOString();
  const temporary: BattlefieldPreset = {
    id: input.battlefieldId,
    ownerUserId: input.ownerUserId,
    isSystem: input.isSystem ?? input.existing?.isSystem ?? false,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    ...input.generated.preset,
    narrativeBlurb: "",
  };
  const baseDefinition = legacyBattlefieldPresetToDefinitionV2(temporary);
  const definition = await input.llm.generateBattlefieldDefinitionV2({
    sourceText: input.sourceText,
    baseDefinition,
    sourceKind: input.sourceKind,
  });
  const disclosurePolicy = defaultBattlefieldDisclosurePolicyV2(definition);
  const projection = projectBattlefieldSceneSourceV2(definition, disclosurePolicy);
  const generatedScene = await input.llm.generateBattlefieldScene({
    sourceText: input.sourceText,
    projection,
  });
  const projectionDigest = assetContentDigest(projection);
  const descriptionInputDigest = assetContentDigest({
    sourceDigest: assetContentDigest(input.sourceText),
    projectionDigest,
  });
  const sceneDraft = validateBattlefieldPublicPresentationV2(
    projection,
    AssetPublicPresentationV2Schema.parse({
      description: generatedScene.segments.map((segment) => segment.text).join("\n\n"),
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest,
      segments: generatedScene.segments,
    }),
  );
  const claimAssessment = await input.llm.validateBattlefieldSceneClaims({
    projection,
    scene: {
      description: sceneDraft.description,
      segments: sceneDraft.segments,
    },
  });
  const publicPresentation = validateBattlefieldSceneClaimAssessmentV2(
    projection,
    sceneDraft,
    {
      contractVersion: 1,
      validatorContract: BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT,
      projectionDigest,
      segments: claimAssessment.segments,
    },
  );
  const envelope = BattlefieldGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "battlefield-preset", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: input.sourceKind,
      sourceDigest: assetContentDigest(input.sourceText),
      attemptId: input.attemptId,
      structureGeneratorContract: BATTLEFIELD_STRUCTURE_GENERATOR_CONTRACT,
      descriptionGeneratorContract: BATTLEFIELD_DESCRIPTION_GENERATOR_CONTRACT,
    },
    compilerCompatibility: [...REQUIRED_BATTLEFIELD_COMPILERS_V2],
  });
  const previewPreset = battlefieldDefinitionV2ToLegacyPreset({
    battlefieldId: input.battlefieldId,
    ownerUserId: input.ownerUserId,
    isSystem: input.isSystem ?? input.existing?.isSystem ?? false,
    definition,
    publicPresentation,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  });
  return {
    envelope,
    previewPreset,
    assistantMessage: `${input.generated.assistantMessage}\n${generatedScene.assistantMessage}`,
  };
}

export function buildImportedBattlefieldEnvelopeV2(input: {
  preset: BattlefieldPreset;
  attemptId: string;
}): BattlefieldGenerationEnvelopeV2 {
  const definition = legacyBattlefieldPresetToDefinitionV2(input.preset);
  const disclosurePolicy = defaultBattlefieldDisclosurePolicyV2(definition);
  const projection = projectBattlefieldSceneSourceV2(definition, disclosurePolicy);
  const projectionDigest = assetContentDigest(projection);
  const supportRefs = projection.facts.slice(0, 12).map((fact) => fact.supportRef);
  const description = input.preset.narrativeBlurb.trim() ||
    input.preset.appearance.summary;
  const segment = {
    id: "imported-scene",
    text: description.slice(0, 1200),
    kind: "fact" as const,
    supportRefs,
  };
  const publicPresentation = validateBattlefieldSceneClaimAssessmentV2(
    projection,
    AssetPublicPresentationV2Schema.parse({
      description: segment.text,
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest: assetContentDigest({
        sourceDigest: assetContentDigest(description),
        projectionDigest,
      }),
      segments: [segment],
    }),
    {
      contractVersion: 1,
      validatorContract: BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT,
      projectionDigest,
      segments: [{
        segmentId: segment.id,
        verdict: "supported",
        supportRefs,
        riskCodes: [],
      }],
    },
  );
  return BattlefieldGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "battlefield-preset", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: "import",
      sourceDigest: assetContentDigest(description),
      attemptId: input.attemptId,
      structureGeneratorContract: BATTLEFIELD_STRUCTURE_GENERATOR_CONTRACT,
      descriptionGeneratorContract: "battlefield-imported-scene-v2",
    },
    compilerCompatibility: [...REQUIRED_BATTLEFIELD_COMPILERS_V2],
  });
}
