import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleAssetManifestSchema, BattleAssetManifestV3Schema,
  BattleCharacterAssetBindingV3Schema, CharacterBattleCompilerInputsV3Schema,
  BattleDialoguePipelineSnapshotV3Schema, DialoguePipelineSettingsSchema,
  defaultDialoguePipelineSettings,
} from "@kshiai/shared";
import { createInventoryFixture } from "./character-agency-inventory.fixtures.js";

function manifestV3() {
  const { state } = createInventoryFixture();
  const old = state.assetManifest;
  assert.ok(old);
  function character(side: "a" | "b") {
    const binding = old!.characters[side];
    const input = binding.compilerInputsV2;
    assert.ok(input);
    const { deepPsyche: _legacyPsyche, ...compilerInputsV3 } = input;
    const { compilerInputsV2: _legacyCompiler, ...bound } = binding;
    return { ...bound, compilerInputsV3 };
  }
  return {
    ...old,
    schemaVersion: 3,
    characters: { a: character("a"), b: character("b") },
    dialoguePipeline: {
      ...old.dialoguePipeline,
      snapshot: { ...old.dialoguePipeline.snapshot, schemaVersion: 3, contextProjectionMode: "compact" },
    },
  };
}

describe("ADR-0028 immutable V3 tuple", () => {
  it("binds existing character generations without author-origin metadata", () => {
    const source = manifestV3();
    const parsed = BattleAssetManifestV3Schema.parse(source);
    assert.equal(parsed.schemaVersion, 3);
    assert.equal(parsed.characters.a.generationId, source.characters.a.generationId);
    assert.deepEqual(parsed.characters.a.compilerInputsV3, source.characters.a.compilerInputsV3);
    assert.equal(Object.hasOwn(parsed.characters.a.compilerInputsV3, "deepPsyche"), false);
    assert.equal(Object.hasOwn(parsed.characters.a.compilerInputsV3, "objectiveAuthority"), false);
  });
  it("requires complete compiler inputs and matching bound generation", () => {
    const binding = manifestV3().characters.a;
    assert.equal(BattleCharacterAssetBindingV3Schema.safeParse({ ...binding, compilerInputsV3: undefined }).success, false);
    assert.equal(BattleCharacterAssetBindingV3Schema.safeParse({ ...binding, contentDigest: undefined }).success, false);
    assert.equal(BattleCharacterAssetBindingV3Schema.safeParse({
      ...binding, basicAttackSource: { ...binding.basicAttackSource, generationId: "different" },
    }).success, false);
    assert.equal(CharacterBattleCompilerInputsV3Schema.safeParse({
      ...binding.compilerInputsV3, deepPsyche: {},
    }).success, false);
  });
  it("rejects missing/mixed dialogue generation and reaction policy", () => {
    const source = manifestV3();
    for (const snapshot of [
      { ...source.dialoguePipeline.snapshot, schemaVersion: 2 },
      { ...source.dialoguePipeline.snapshot, contextProjectionMode: "legacy" },
      undefined,
    ]) {
      assert.equal(BattleAssetManifestV3Schema.safeParse({
        ...source, dialoguePipeline: { ...source.dialoguePipeline, snapshot },
      }).success, false);
    }
    assert.equal(BattleAssetManifestV3Schema.safeParse({
      ...source, rules: { ...source.rules, psycheReaction: undefined },
    }).success, false);
  });
  it("keeps override identity paired and rejects legacy override snapshots", () => {
    const source = manifestV3();
    assert.equal(BattleAssetManifestV3Schema.safeParse({
      ...source, dialoguePipeline: { ...source.dialoguePipeline, activationSource: "deployment_override" },
    }).success, false);
    assert.equal(BattleDialoguePipelineSnapshotV3Schema.safeParse({
      ...source.dialoguePipeline.snapshot, contextProjectionMode: "legacy",
    }).success, false);
  });
  it("supports explicit complete V3 without changing the default", () => {
    assert.equal(DialoguePipelineSettingsSchema.safeParse({
      ...defaultDialoguePipelineSettings(), schemaVersion: 3, contextProjectionMode: "compact",
    }).success, true);
    assert.equal(BattleAssetManifestSchema.safeParse(manifestV3()).success, true);
    assert.equal(defaultDialoguePipelineSettings().schemaVersion, 1);
  });
});
