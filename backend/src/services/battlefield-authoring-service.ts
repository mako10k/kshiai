import {
  AssetPublicPresentationV2Schema,
  BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT,
  BattlefieldGenerationEnvelopeV2Schema,
  REQUIRED_BATTLEFIELD_COMPILERS_V2,
  battlefieldDefinitionV2ToLegacyPreset,
  defaultBattlefieldDisclosurePolicyV2,
  deterministicBattlefieldSceneV2,
  legacyBattlefieldPresetToDefinitionV2,
  projectBattlefieldSceneSourceV2,
  validateBattlefieldPublicPresentationV2,
  validateBattlefieldSceneClaimAssessmentV2,
  type BattlefieldGenerationEnvelopeV2,
  type BattlefieldPreset,
  type BattlefieldSceneSourceProjectionV2,
} from "@kshiai/shared";
import type { GenerateBattlefieldResult, LlmProvider } from "../llm/types.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

export const BATTLEFIELD_STRUCTURE_GENERATOR_CONTRACT =
  "battlefield-structure-v2";
export const BATTLEFIELD_DESCRIPTION_GENERATOR_CONTRACT =
  "battlefield-public-scene-v2";

async function buildBattlefieldScenePresentation(input: {
  llm: LlmProvider;
  sourceText: string;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
  existingBlurb?: string;
  projection: BattlefieldSceneSourceProjectionV2;
  projectionDigest: string;
  descriptionInputDigest: string;
}) {
  const fallback = deterministicBattlefieldSceneV2(
    input.projection,
    input.existingBlurb,
  );
  const asPresentation = (scene: {
    description: string;
    segments: Array<{
      id: string;
      text: string;
      kind: "fact" | "flavor";
      supportRefs: string[];
    }>;
  }) => AssetPublicPresentationV2Schema.parse({
    description: scene.segments.map((segment) => segment.text).join("\n\n") ||
      scene.description,
    projectionContractVersion: 2,
    projectionDigest: input.projectionDigest,
    descriptionInputDigest: input.descriptionInputDigest,
    segments: scene.segments,
  });
  try {
    const generatedScene = await input.llm.generateBattlefieldScene({
      sourceText: input.sourceText,
      projection: input.projection,
    });
    const sceneDraft = validateBattlefieldPublicPresentationV2(
      input.projection,
      asPresentation(generatedScene),
    );
    const claimAssessment = await input.llm.validateBattlefieldSceneClaims({
      projection: input.projection,
      scene: {
        description: sceneDraft.description,
        segments: sceneDraft.segments,
      },
    });
    return {
      presentation: validateBattlefieldSceneClaimAssessmentV2(
        input.projection,
        sceneDraft,
        {
          contractVersion: 1,
          validatorContract: BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT,
          projectionDigest: input.projectionDigest,
          segments: claimAssessment.segments,
        },
      ),
      assistantMessage: generatedScene.assistantMessage,
    };
  } catch (error) {
    if (input.sourceKind !== "upgrade_description") throw error;
    const sceneDraft = validateBattlefieldPublicPresentationV2(
      input.projection,
      asPresentation(fallback),
    );
    return {
      presentation: validateBattlefieldSceneClaimAssessmentV2(
        input.projection,
        sceneDraft,
        {
          contractVersion: 1,
          validatorContract: BATTLEFIELD_SCENE_CLAIM_VALIDATOR_CONTRACT,
          projectionDigest: input.projectionDigest,
          segments: sceneDraft.segments.map((segment) => ({
            segmentId: segment.id,
            verdict: "supported" as const,
            supportRefs: [...segment.supportRefs],
            riskCodes: [],
          })),
        },
      ),
      assistantMessage: "既存の戦場から公開シーンを復元しました。",
    };
  }
}

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
  const projectionDigest = assetContentDigest(projection);
  const descriptionInputDigest = assetContentDigest({
    sourceDigest: assetContentDigest(input.sourceText),
    projectionDigest,
  });
  const scene = await buildBattlefieldScenePresentation({
    llm: input.llm,
    sourceText: input.sourceText,
    sourceKind: input.sourceKind,
    existingBlurb: input.existing?.narrativeBlurb,
    projection,
    projectionDigest,
    descriptionInputDigest,
  });
  const publicPresentation = scene.presentation;
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
    visibility: input.existing?.visibility,
  });
  return {
    envelope,
    previewPreset,
    assistantMessage: `${input.generated.assistantMessage}\n${scene.assistantMessage}`,
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
