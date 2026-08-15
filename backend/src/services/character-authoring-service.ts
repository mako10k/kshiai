import {
  AssetPublicPresentationV2Schema,
  CharacterGenerationEnvelopeV2Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  REQUIRED_CHARACTER_COMPILERS_V2,
  balanceCharacterCombatFields,
  coalesceNonEmptyList,
  characterDefinitionV2ToLegacySheet,
  defaultCharacterDisclosurePolicyV2,
  defaultRecord,
  legacyCharacterSheetToDefinitionV2,
  listCharacterDefinitionGapsV2,
  normalizeCharacterDefinitionV2,
  projectCharacterProfileSourceV2,
  validateCharacterProfileClaimAssessmentV2,
  validateCharacterPublicPresentationV2,
  type AssetAuthoringAttemptStatus,
  type CharacterGenerationEnvelopeV2,
  type CharacterSheet,
} from "@kshiai/shared";
import { type LlmProvider, type GenerateCharacterResult } from "../llm/types.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

export function lastAuthoringAdjustment(sourceText: string): string | null {
  const matches = [...sourceText.matchAll(/追加調整:\s*(.*)/g)];
  const last = matches.at(-1)?.[1]?.trim();
  return last || null;
}

export function sheetFromAuthoringCandidate(input: {
  characterId: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  candidate: CharacterGenerationEnvelopeV2;
  existing?: CharacterSheet | null;
}): CharacterSheet {
  return characterDefinitionV2ToLegacySheet({
    characterId: input.characterId,
    ownerUserId: input.ownerUserId,
    definition: input.candidate.definition,
    publicPresentation: input.candidate.publicPresentation,
    createdAt: input.existing?.createdAt ?? input.createdAt,
    updatedAt: input.updatedAt,
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
}

export const CHARACTER_DEFINITION_CHECK_FAILED =
  "CHARACTER_DEFINITION_CHECK_FAILED";

export function existingCharacterGenerationResult(
  sheet: CharacterSheet,
): GenerateCharacterResult {
  const {
    id: _id,
    ownerUserId: _ownerUserId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = sheet;
  return {
    assistantMessage: "既存の公開設定を最新版の構造へ移します。",
    sheet: rest,
  };
}

export function adjustedGenerationResult(
  current: CharacterSheet,
  patch: Awaited<ReturnType<LlmProvider["adjustCharacter"]>>,
): GenerateCharacterResult {
  const nextSkills = coalesceNonEmptyList(patch.sheetPatch.skills, current.skills);
  const nextTraits = coalesceNonEmptyList(patch.sheetPatch.traits, current.traits);
  const merged = balanceCharacterCombatFields({
    ...current,
    ...patch.sheetPatch,
    parameters: patch.sheetPatch.parameters
      ? { ...current.parameters, ...patch.sheetPatch.parameters }
      : current.parameters,
    basicAttack: patch.sheetPatch.basicAttack ?? current.basicAttack,
    skills: nextSkills,
    traits: nextTraits,
    weapon: patch.sheetPatch.weapon !== undefined
      ? patch.sheetPatch.weapon
      : current.weapon,
    armor: patch.sheetPatch.armor !== undefined
      ? patch.sheetPatch.armor
      : current.armor,
    appearance: patch.sheetPatch.appearance
      ? { ...current.appearance, ...patch.sheetPatch.appearance }
      : current.appearance,
  });
  const {
    id: _id,
    ownerUserId: _ownerUserId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...sheet
  } = merged;
  return { sheet, assistantMessage: patch.assistantMessage };
}

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
  reportStatus?: (status: AssetAuthoringAttemptStatus) => Promise<void>;
}): Promise<{
  envelope: CharacterGenerationEnvelopeV2;
  previewSheet: CharacterSheet;
  assistantMessage: string;
}> {
  const now = new Date().toISOString();
  const keepLegacyBlurb = input.sourceKind === "upgrade_description";
  const balanced = balanceCharacterCombatFields({
    ...input.generated.sheet,
    // Create/revision discard the first-stage public blurb so profile prose is
    // derived only after structure. Upgrade keeps the existing blurb as the
    // deterministic expressionNotes source.
    narrativeBlurb: keepLegacyBlurb
      ? (input.existing?.narrativeBlurb || input.generated.sheet.narrativeBlurb || "")
      : "",
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
  await input.reportStatus?.("generating_structure");
  const generatedDefinition = await input.llm.generateCharacterDefinitionV2({
    sourceText: input.sourceText,
    baseDefinition,
    sourceKind: input.sourceKind,
  });
  await input.reportStatus?.("validating_structure");
  const firstPass = normalizeCharacterDefinitionV2({
    base: baseDefinition,
    candidate: generatedDefinition,
    sourceKind: input.sourceKind,
  });
  const review = await input.llm.reviewCharacterDefinitionV2({
    sourceText: input.sourceText,
    sourceKind: input.sourceKind,
    baseDefinition,
    candidate: firstPass.definition,
    gaps: listCharacterDefinitionGapsV2(baseDefinition),
    findings: firstPass.findings,
  });
  let definition = firstPass.definition;
  let findings = firstPass.findings;
  if (review.verdict === "revise" && review.fill) {
    const corrected = normalizeCharacterDefinitionV2({
      base: baseDefinition,
      candidate: definition,
      sourceKind: input.sourceKind,
      fill: review.fill,
    });
    definition = corrected.definition;
    findings = corrected.findings;
  }
  if (findings.length > 0) {
    throw new Error(
      `${CHARACTER_DEFINITION_CHECK_FAILED}:${findings.map((finding) => finding.code).join(",")}`,
    );
  }
  const disclosurePolicy = defaultCharacterDisclosurePolicyV2(definition);
  const projection = projectCharacterProfileSourceV2(
    definition,
    disclosurePolicy,
  );
  await input.reportStatus?.("generating_description");
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
  await input.reportStatus?.("validating_description");
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
