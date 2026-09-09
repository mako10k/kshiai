import {
  BattleAssetManifestV3Schema, DialoguePipelineSettingsSchema,
  initialConsciousAgencyV1, initialPsycheReactionStateV1,
  snapshotDialoguePipelineSettings, type BattleCharacterAssetBinding,
} from "@kshiai/shared";
import { createInventoryFixture, type InventoryVariant } from "./character-agency-inventory.fixtures.js";

export function createConsciousFixture(variant: InventoryVariant = "control") {
  const fixture = createInventoryFixture(variant);
  const manifest = fixture.state.assetManifest;
  if (!manifest) throw new Error("Missing fixture manifest");
  const settings = DialoguePipelineSettingsSchema.parse({ ...fixture.settings, schemaVersion: 3 });
  function character(binding: BattleCharacterAssetBinding) {
    if (!binding.compilerInputsV2) throw new Error("Missing fixture compiler");
    const { deepPsyche: _legacyPsyche, ...compilerInputsV3 } = binding.compilerInputsV2;
    const { compilerInputsV2: _legacyCompiler, ...bound } = binding;
    return { ...bound, compilerInputsV3 };
  }
  fixture.state.dialoguePipelineSnapshot = snapshotDialoguePipelineSettings(settings);
  fixture.state.assetManifest = BattleAssetManifestV3Schema.parse({
    ...manifest, schemaVersion: 3,
    characters: { a: character(manifest.characters.a), b: character(manifest.characters.b) },
    dialoguePipeline: { ...manifest.dialoguePipeline, snapshot: fixture.state.dialoguePipelineSnapshot },
  });
  for (const agent of [fixture.state.agentStateA, fixture.state.agentStateB]) {
    if (!agent) throw new Error("Missing fixture agent");
    agent.currentGoal = "legacy-private-goal-do-not-forward";
    agent.privateMemory = "legacy-private-memory-do-not-forward";
    agent.consciousAgencyV1 = initialConsciousAgencyV1();
    agent.reactionStateV1 = initialPsycheReactionStateV1();
  }
  return { ...fixture, settings };
}
