/** R: Enforce the retained compatibility boundary for legacy character authoring. */
import { candidateToSheet, type CharacterAuthoringCandidate } from "./character-authoring-candidate.js";
import {
  CharacterGenerationEnvelopeV2Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  REQUIRED_CHARACTER_COMPILERS_V2,
  balanceCharacterCombatFields,
  coalesceNonEmptyList,
  defaultCharacterDisclosurePolicyV2,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterProfileSourceV2,
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
  candidate: CharacterAuthoringCandidate;
  existing?: CharacterSheet | null;
}): CharacterSheet {
  return candidateToSheet(input.candidate, {
    characterId: input.characterId,
    ownerUserId: input.ownerUserId,
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

export function buildImportedCharacterEnvelopeV2(input: {
  sheet: CharacterSheet;
  attemptId: string;
}): CharacterGenerationEnvelopeV2 {
  const definition = legacyCharacterSheetToDefinitionV2(input.sheet);
  const disclosurePolicy = defaultCharacterDisclosurePolicyV2(definition);
  const projection = projectCharacterProfileSourceV2(
    definition,
    disclosurePolicy,
  );
  const projectionDigest = assetContentDigest(projection);
  const sourceDigest = assetContentDigest(input.sheet.narrativeBlurb);
  const description = input.sheet.narrativeBlurb.trim() || input.sheet.displayName;
  return CharacterGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "character", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation: {
      description,
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest: assetContentDigest({ sourceDigest, projectionDigest }),
      segments: [{
        id: "imported-profile",
        text: description.slice(0, 1200),
        kind: "fact",
        supportRefs: projection.facts.map((fact) => fact.supportRef).slice(0, 12),
      }],
      claimValidation: {
        contractVersion: 1,
        validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
        projectionDigest,
        segments: [{
          segmentId: "imported-profile",
          verdict: "supported",
          supportRefs: projection.facts
            .map((fact) => fact.supportRef)
            .slice(0, 12),
          riskCodes: [],
        }],
      },
    },
    provenance: {
      sourceKind: "import",
      sourceDigest,
      attemptId: input.attemptId,
      structureGeneratorContract: "legacy-deterministic-import-v2",
      descriptionGeneratorContract: "trusted-import-profile-v2",
    },
    compilerCompatibility: [...REQUIRED_CHARACTER_COMPILERS_V2],
  });
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
  throw new Error("LEGACY_CHARACTER_AUTHORING_RETIRED");
}
