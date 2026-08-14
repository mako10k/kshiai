import {
  AssetPublicPresentationV2Schema,
  NARRATION_STYLE_CLAIM_VALIDATOR_CONTRACT,
  NarrationGenerationEnvelopeV2Schema,
  REQUIRED_NARRATION_COMPILERS_V2,
  defaultNarrationDisclosurePolicyV2,
  legacyNarrationStyleToDefinitionV2,
  narrationDefinitionV2ToLegacyStyle,
  projectNarrationStyleSourceV2,
  validateNarrationPublicPresentationV2,
  validateNarrationStyleClaimAssessmentV2,
  type NarrationGenerationEnvelopeV2,
  type NarrationPerspective,
  type NarrationStyle,
} from "@kshiai/shared";
import type { LlmProvider } from "../llm/types.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

export const NARRATION_STRUCTURE_GENERATOR_CONTRACT =
  "narration-structure-v2";
export const NARRATION_DESCRIPTION_GENERATOR_CONTRACT =
  "narration-public-style-v2";

type GeneratedNarrationStyle = {
  displayName: string;
  description: string;
  instruction: string;
  tags: string[];
  perspective?: NarrationPerspective;
};

export async function buildNarrationStyleGenerationCandidate(input: {
  llm: LlmProvider;
  attemptId: string;
  narrationStyleId: string;
  ownerUserId: string | null;
  isSystem?: boolean;
  sourceText: string;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
  generated: GeneratedNarrationStyle;
  existing?: NarrationStyle | null;
}): Promise<{
  envelope: NarrationGenerationEnvelopeV2;
  previewStyle: NarrationStyle;
  assistantMessage: string;
}> {
  const now = new Date().toISOString();
  const temporary: NarrationStyle = {
    id: input.narrationStyleId,
    ownerUserId: input.ownerUserId,
    isSystem: input.isSystem ?? input.existing?.isSystem ?? false,
    displayName: input.generated.displayName,
    description: input.generated.description,
    instruction: input.generated.instruction,
    perspective: input.generated.perspective ?? input.existing?.perspective ?? "external",
    tags: input.generated.tags,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
  const baseDefinition = legacyNarrationStyleToDefinitionV2(temporary);
  const definition = await input.llm.generateNarrationDefinitionV2({
    sourceText: input.sourceText,
    baseDefinition,
    sourceKind: input.sourceKind,
  });
  const disclosurePolicy = defaultNarrationDisclosurePolicyV2(definition);
  const projection = projectNarrationStyleSourceV2(definition, disclosurePolicy);
  const generatedDescription = await input.llm.generateNarrationStyleDescription({
    sourceText: input.sourceText,
    projection,
  });
  const projectionDigest = assetContentDigest(projection);
  const descriptionInputDigest = assetContentDigest({
    sourceDigest: assetContentDigest(input.sourceText),
    projectionDigest,
  });
  const descriptionDraft = validateNarrationPublicPresentationV2(
    projection,
    AssetPublicPresentationV2Schema.parse({
      description: generatedDescription.segments
        .map((segment) => segment.text)
        .join("\n\n"),
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest,
      segments: generatedDescription.segments,
    }),
  );
  const claimAssessment = await input.llm.validateNarrationStyleClaims({
    projection,
    style: {
      description: descriptionDraft.description,
      segments: descriptionDraft.segments,
    },
  });
  const publicPresentation = validateNarrationStyleClaimAssessmentV2(
    projection,
    descriptionDraft,
    {
      contractVersion: 1,
      validatorContract: NARRATION_STYLE_CLAIM_VALIDATOR_CONTRACT,
      projectionDigest,
      segments: claimAssessment.segments,
    },
  );
  const envelope = NarrationGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "narration-style", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: input.sourceKind,
      sourceDigest: assetContentDigest(input.sourceText),
      attemptId: input.attemptId,
      structureGeneratorContract: NARRATION_STRUCTURE_GENERATOR_CONTRACT,
      descriptionGeneratorContract: NARRATION_DESCRIPTION_GENERATOR_CONTRACT,
    },
    compilerCompatibility: [...REQUIRED_NARRATION_COMPILERS_V2],
  });
  const previewStyle = narrationDefinitionV2ToLegacyStyle({
    styleId: input.narrationStyleId,
    ownerUserId: input.ownerUserId,
    isSystem: input.isSystem ?? input.existing?.isSystem ?? false,
    definition,
    publicPresentation,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  });
  return {
    envelope,
    previewStyle,
    assistantMessage: generatedDescription.assistantMessage,
  };
}

export function buildImportedNarrationStyleEnvelopeV2(input: {
  style: NarrationStyle;
  attemptId: string;
}): NarrationGenerationEnvelopeV2 {
  const definition = legacyNarrationStyleToDefinitionV2(input.style);
  const disclosurePolicy = defaultNarrationDisclosurePolicyV2(definition);
  const projection = projectNarrationStyleSourceV2(definition, disclosurePolicy);
  const projectionDigest = assetContentDigest(projection);
  const supportRefs = projection.facts.slice(0, 12)
    .map((fact) => fact.supportRef);
  const text = input.style.description.trim() ||
    `${input.style.displayName}の語り口。`;
  const segment = {
    id: "imported-style",
    text: text.slice(0, 1200),
    kind: "fact" as const,
    supportRefs,
  };
  const publicPresentation = validateNarrationStyleClaimAssessmentV2(
    projection,
    AssetPublicPresentationV2Schema.parse({
      description: segment.text,
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest: assetContentDigest({
        sourceDigest: assetContentDigest(text),
        projectionDigest,
      }),
      segments: [segment],
    }),
    {
      contractVersion: 1,
      validatorContract: NARRATION_STYLE_CLAIM_VALIDATOR_CONTRACT,
      projectionDigest,
      segments: [{
        segmentId: segment.id,
        verdict: "supported",
        supportRefs,
        riskCodes: [],
      }],
    },
  );
  return NarrationGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "narration-style", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation,
    provenance: {
      sourceKind: "import",
      sourceDigest: assetContentDigest(text),
      attemptId: input.attemptId,
      structureGeneratorContract: NARRATION_STRUCTURE_GENERATOR_CONTRACT,
      descriptionGeneratorContract: "narration-imported-style-v2",
    },
    compilerCompatibility: [...REQUIRED_NARRATION_COMPILERS_V2],
  });
}
