import {
  DialoguePipelineSettingsSchema,
  snapshotDialoguePipelineSettings,
  type BattleAssetManifest,
  type DialoguePipelineActivationSource,
  type DialoguePipelineOverrideDeployment,
  type DialoguePipelineSettings,
} from "@kshiai/shared";
import { config } from "../config.js";
import type { AssetGeneration } from "../repositories/asset-generations.js";
import * as dialoguePipelineRepo from "../repositories/dialogue-pipeline-settings.js";

export type DialoguePipelineActivation = {
  settings: DialoguePipelineSettings;
  source: DialoguePipelineActivationSource;
  overrideDeployment?: DialoguePipelineOverrideDeployment;
};

export function resolveDialoguePipelineActivation(input: {
  settings: DialoguePipelineSettings;
  settingsSource: "default" | "persisted_setting";
  override: "legacy" | "compact" | null;
  overrideDeployment: DialoguePipelineOverrideDeployment | null;
}): DialoguePipelineActivation {
  if (!input.override) {
    if (input.overrideDeployment) {
      throw new Error("DIALOGUE_OVERRIDE_IDENTITY_WITHOUT_OVERRIDE");
    }
    return { settings: input.settings, source: input.settingsSource };
  }
  if (!input.overrideDeployment) {
    throw new Error("DIALOGUE_OVERRIDE_DEPLOYMENT_IDENTITY_REQUIRED");
  }
  if (input.settings.schemaVersion === 3 && input.override === "legacy") {
    throw new Error("BATTLE_CONTRACT_MISMATCH");
  }
  return {
    settings: DialoguePipelineSettingsSchema.parse({
      ...input.settings,
      contextProjectionMode: input.settings.schemaVersion === 3 ? "compact" : input.override,
    }),
    source: "deployment_override",
    overrideDeployment: input.overrideDeployment,
  };
}

export async function resolveConfiguredDialoguePipelineActivation() {
  const stored = await dialoguePipelineRepo.resolveDialoguePipelineSettings();
  const activation = resolveDialoguePipelineActivation({
    settings: stored.settings,
    settingsSource: stored.source,
    override: config.dialogueContextProjectionOverride,
    overrideDeployment: config.dialogueContextProjectionOverrideDeployment,
  });
  return {
    activation,
    snapshot: snapshotDialoguePipelineSettings(activation.settings),
  };
}

export function bindDialoguePipelineActivation(
  generation: Pick<AssetGeneration, "generationId" | "contentDigest">,
  snapshot: BattleAssetManifest["dialoguePipeline"]["snapshot"],
  activation: DialoguePipelineActivation,
): BattleAssetManifest["dialoguePipeline"] {
  return {
    generationId: generation.generationId,
    contentDigest: generation.contentDigest,
    snapshot,
    activationSource: activation.source,
    ...(activation.overrideDeployment
      ? { overrideDeployment: activation.overrideDeployment }
      : {}),
  };
}
