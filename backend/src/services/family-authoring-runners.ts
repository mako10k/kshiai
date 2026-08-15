import { lastAuthoringAdjustment } from "./character-authoring-service.js";
import { buildBattlefieldGenerationCandidate } from "./battlefield-authoring-service.js";
import { buildNarrationStyleGenerationCandidate } from "./narration-style-authoring-service.js";
import * as battlefieldAssetRepo from "../repositories/battlefield-assets-v2.js";
import * as narrationStyleAssetRepo from "../repositories/narration-style-assets-v2.js";
import * as bfRepo from "../repositories/battlefields.js";
import * as styleRepo from "../repositories/narration-styles.js";
import { finishFamilyAuthoringJob } from "../repositories/family-authoring-jobs.js";
import type { LlmProvider } from "../llm/types.js";
import { battlefieldDefinitionV2ToLegacyPreset, narrationDefinitionV2ToLegacyStyle } from "@kshiai/shared";

function lastAdjustment(sourceText: string): string | null {
  return lastAuthoringAdjustment(sourceText);
}

function sourceKindOf(
  kind: "create" | "revision" | "upgrade",
): "upgrade_description" | "revision_instruction" | "create_instruction" {
  if (kind === "upgrade") return "upgrade_description";
  if (kind === "revision") return "revision_instruction";
  return "create_instruction";
}

async function generatedBattlefieldFromAttempt(
  llm: LlmProvider,
  attempt: NonNullable<
    Awaited<ReturnType<typeof battlefieldAssetRepo.getBattlefieldAuthoringAttempt>>
  >,
  existing: Awaited<ReturnType<typeof bfRepo.getPreset>>,
) {
  const sourceText = attempt.sourceText ?? "";
  const adjust = lastAdjustment(sourceText);
  if (attempt.candidate && adjust) {
    const current = battlefieldDefinitionV2ToLegacyPreset({
      battlefieldId: attempt.battlefieldId,
      ownerUserId: attempt.ownerUserId,
      definition: attempt.candidate.definition,
      publicPresentation: attempt.candidate.publicPresentation,
      createdAt: existing?.createdAt ?? attempt.createdAt,
      updatedAt: attempt.updatedAt,
      isSystem: existing?.isSystem ?? false,
    });
    const patch = await llm.adjustBattlefieldPreset(current, adjust);
    return {
      preset: {
        ...current,
        ...patch.presetPatch,
        appearance: patch.presetPatch.appearance
          ? { ...current.appearance, ...patch.presetPatch.appearance }
          : current.appearance,
        narrativeBlurb: "",
      },
      assistantMessage: patch.assistantMessage,
    };
  }
  if (attempt.kind === "upgrade" && existing) {
    return {
      preset: {
        displayName: existing.displayName,
        category: existing.category,
        tags: existing.tags,
        appearance: existing.appearance,
        terrainHints: existing.terrainHints,
        obstacleHints: existing.obstacleHints,
        conditionHints: existing.conditionHints,
        baseCoefficients: existing.baseCoefficients,
        narrativeBlurb: existing.narrativeBlurb,
      },
      assistantMessage: "既存の戦場から最新版の構造化候補を作成しました。",
    };
  }
  if (attempt.kind === "revision" && existing) {
    const patch = await llm.adjustBattlefieldPreset(existing, sourceText);
    return {
      preset: {
        ...existing,
        ...patch.presetPatch,
        appearance: patch.presetPatch.appearance
          ? { ...existing.appearance, ...patch.presetPatch.appearance }
          : existing.appearance,
        narrativeBlurb: "",
      },
      assistantMessage: patch.assistantMessage,
    };
  }
  return llm.generateBattlefieldPreset({
    prompt: sourceText,
    category: existing?.category ?? "custom",
  });
}

export async function runBattlefieldAuthoringJob(
  llm: LlmProvider,
  attemptId: string,
  ownerUserId: string,
): Promise<"completed" | "failed"> {
  const attempt = await battlefieldAssetRepo.getBattlefieldAuthoringAttempt(
    attemptId,
    ownerUserId,
  );
  if (!attempt || ["succeeded", "discarded", "failed", "expired"].includes(attempt.status)) {
    await finishFamilyAuthoringJob("battlefield", attemptId, "cancelled");
    return "failed";
  }
  try {
    await battlefieldAssetRepo.updateBattlefieldAuthoringStatus({
      attemptId,
      ownerUserId,
      status: "generating_structure",
    });
    const existing = await bfRepo.getPreset(attempt.battlefieldId);
    const generated = await generatedBattlefieldFromAttempt(llm, attempt, existing);
    const candidate = await buildBattlefieldGenerationCandidate({
      llm,
      attemptId,
      battlefieldId: attempt.battlefieldId,
      ownerUserId,
      sourceText: attempt.sourceText ?? "",
      sourceKind: sourceKindOf(attempt.kind),
      generated,
      existing,
    });
    await battlefieldAssetRepo.saveBattlefieldAuthoringCandidate({
      attemptId,
      ownerUserId,
      envelope: candidate.envelope,
      assistantMessage: candidate.assistantMessage,
    });
    await finishFamilyAuthoringJob("battlefield", attemptId, "completed");
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "authoring_failed";
    await battlefieldAssetRepo.failBattlefieldAuthoringAttempt({
      attemptId,
      ownerUserId,
      errorCode: message.slice(0, 120),
    });
    return "failed";
  }
}

async function generatedNarrationStyleFromAttempt(
  llm: LlmProvider,
  attempt: NonNullable<
    Awaited<ReturnType<typeof narrationStyleAssetRepo.getNarrationStyleAuthoringAttempt>>
  >,
  existing: Awaited<ReturnType<typeof styleRepo.getNarrationStyle>>,
) {
  const sourceText = attempt.sourceText ?? "";
  if (attempt.kind === "upgrade" && existing) return existing;
  if (llm.generateNarrationStyle) return llm.generateNarrationStyle(sourceText);
  if (existing) {
    return {
      displayName: existing.displayName,
      description: existing.description,
      instruction: sourceText,
      tags: existing.tags,
      perspective: existing.perspective,
    };
  }
  return {
    displayName: sourceText.slice(0, 12) || "カスタム",
    description: sourceText.slice(0, 80),
    instruction: `次の雰囲気で語る: ${sourceText}`,
    tags: ["custom"],
  };
}

export async function runNarrationStyleAuthoringJob(
  llm: LlmProvider,
  attemptId: string,
  ownerUserId: string,
): Promise<"completed" | "failed"> {
  const attempt = await narrationStyleAssetRepo.getNarrationStyleAuthoringAttempt(
    attemptId,
    ownerUserId,
  );
  if (!attempt || ["succeeded", "discarded", "failed", "expired"].includes(attempt.status)) {
    await finishFamilyAuthoringJob("narration_style", attemptId, "cancelled");
    return "failed";
  }
  try {
    const sourceText = attempt.sourceText ?? "";
    const existing = await styleRepo.getNarrationStyle(attempt.narrationStyleId);
    const generated = await generatedNarrationStyleFromAttempt(llm, attempt, existing);
    const candidate = await buildNarrationStyleGenerationCandidate({
      llm,
      attemptId,
      narrationStyleId: attempt.narrationStyleId,
      ownerUserId,
      sourceText,
      sourceKind: attempt.kind === "upgrade"
        ? "upgrade_description"
        : attempt.kind === "revision"
          ? "revision_instruction"
          : "create_instruction",
      generated,
      existing,
    });
    await narrationStyleAssetRepo.saveNarrationStyleAuthoringCandidate({
      attemptId,
      ownerUserId,
      envelope: candidate.envelope,
      assistantMessage: candidate.assistantMessage,
    });
    await finishFamilyAuthoringJob("narration_style", attemptId, "completed");
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "authoring_failed";
    await narrationStyleAssetRepo.failNarrationStyleAuthoringAttempt({
      attemptId,
      ownerUserId,
      errorCode: message.slice(0, 120),
    });
    return "failed";
  }
}
