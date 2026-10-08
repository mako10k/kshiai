// R: Verify immutable V5 battle identity and technical termination without changing V4 meaning.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BattleAssetManifestV4Schema, BattleAssetManifestV5Schema, BattleStateSchema, CharacterAgentStateSchema } from "./battle.js";
import { createBattleState } from "./battle-engine.js";
import { defaultBasicAttack, defaultParameters, requireCombatReadyCharacterSheet } from "./character.js";
import { compileCharacterPsycheTraitsV1, projectCharacterConsciousSelfV2, legacyCharacterSheetToDefinitionV2 } from "./structured-character.js";
import { CharacterDefinitionV3Schema, compileCharacterActionNormProgramV3, compileCharacterConsciousGuidanceV1, compileCharacterMechanicalConflictFallbacksV1 } from "./character-definition-v3.js";
import { initialConsciousAgencyV2 } from "./conscious-dynamic.js";
import { defaultDialoguePipelineSettings, BattleDialoguePipelineSnapshotV3Schema } from "./dialogue-pipeline.js";
import { BattlefieldInstanceSchema } from "./battlefield.js";
import { AwarenessDefaultPolicy } from "./awareness-policy.js";

function sheet(id: string) {
  return requireCombatReadyCharacterSheet({ id, ownerUserId: "owner", displayName: id, tags: [],
    createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
    appearance: { summary: "試験", visualPrompt: "test" }, traits: [], parameters: defaultParameters(),
    skills: [], basicAttack: defaultBasicAttack(), weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false }, narrativeBlurb: "試験用" });
}
function fixture() {
  const a = sheet("a"); const b = sheet("b");
  function binding(character: ReturnType<typeof sheet>) {
    const v2 = legacyCharacterSheetToDefinitionV2(character);
    const { schemaVersion, actionNorms, ...stable } = v2;
    const definition = CharacterDefinitionV3Schema.parse({ ...stable, schemaVersion: 3, actionNorms: [], consciousGuidance: [], mechanicalConflictFallbacks: [] });
    return { assetId: character.id, generationId: `generation-${character.id}`, contentDigest: "0".repeat(64), snapshot: character,
      basicAttackSource: { kind: "character_generation_v3", generationId: `generation-${character.id}`, definitionPath: "capabilities.basicAction" },
      compilerInputsV4: { psycheTraits: compileCharacterPsycheTraitsV1(v2), consciousSelf: projectCharacterConsciousSelfV2(v2), actionNorms: compileCharacterActionNormProgramV3(definition), consciousGuidance: compileCharacterConsciousGuidanceV1(definition), mechanicalConflictFallbacks: compileCharacterMechanicalConflictFallbacksV1(definition) } };
  }
  const { updatedAt, updatedBy, ...values } = defaultDialoguePipelineSettings();
  const snapshot = BattleDialoguePipelineSnapshotV3Schema.parse({ ...values, schemaVersion: 3, contextProjectionMode: "compact" });
  const battlefield = BattlefieldInstanceSchema.parse({ displayName: "試験場", scene: "広場", terrain: "平坦", narrativeSetup: "広場で向き合う" });
  const manifest = BattleAssetManifestV4Schema.parse({ schemaVersion: 4, consciousOutputContract: "dynamic-v4", boundAt: "2026-10-05T00:00:00Z", characters: { a: binding(a), b: binding(b) },
    narrationStyle: { assetId: "style", generationId: "narration-generation", contentDigest: "0".repeat(64), snapshot: { id: "style", displayName: "実況", instruction: "確定出来事を実況", perspective: "external" } },
    battlefield: { assetId: null, generationId: "field-generation", contentDigest: "0".repeat(64), snapshot: battlefield },
    dialoguePipeline: { generationId: "dialogue-generation", contentDigest: "0".repeat(64), snapshot, activationSource: "persisted_setting" },
    rules: { battleEngine: "battle-engine-v1", temporalRules: "initiative-window-v2", psycheReaction: "psyche-reaction-policy-v1", characterDefinitionRules: "character-definition-rules-v3", battlefieldDefinitionRules: "battlefield-instance-v2", narrationStyleRules: "narration-prompt-v2" } });
  const state = createBattleState({ id: "battle", sideA: a, sideB: b, turnLimit: 12, battlefield: { kind: "legacy", instance: battlefield }, prologuePending: false });
  state.assetManifest = manifest;
  state.agentStateA = CharacterAgentStateSchema.parse({ consciousAgencyV2: initialConsciousAgencyV2() });
  state.agentStateB = CharacterAgentStateSchema.parse({ consciousAgencyV2: initialConsciousAgencyV2() });
  return { manifest, state: BattleStateSchema.parse(state) };
}
function v5Fixture() {
  const { manifest, state } = fixture();
  const v5 = BattleAssetManifestV5Schema.parse({ ...manifest, schemaVersion: 5, consciousOutputContract: "awareness-v5", awarenessPolicy: AwarenessDefaultPolicy, promptRevision: "awareness-prompt-v1", outputRevision: "awareness-output-v1", rules: { ...manifest.rules, psycheReaction: "awareness-v5" } });
  assert.equal(BattleAssetManifestV5Schema.parse({ ...v5, promptRevision: "awareness-prompt-v2" }).promptRevision, "awareness-prompt-v2");
  assert.equal(BattleAssetManifestV5Schema.parse({ ...v5, promptRevision: "awareness-prompt-v3" }).promptRevision, "awareness-prompt-v3");
  assert.equal(BattleAssetManifestV5Schema.parse({ ...v5, promptRevision: "awareness-prompt-v4" }).promptRevision, "awareness-prompt-v4");
  assert.equal(BattleAssetManifestV5Schema.safeParse({ ...v5, promptRevision: "unsupported-prompt" }).success, false);
  return { ...state, assetManifest: v5, agentStateA: undefined, agentStateB: undefined };
}
describe("awareness-v5 battle version boundary", () => {
  it("preserves complete V4 tuple and dynamic output semantics", () => {
    const { manifest, state } = fixture();
    assert.deepEqual(BattleAssetManifestV4Schema.parse(manifest), manifest);
    assert.deepEqual(BattleStateSchema.parse(state), state);
    assert.equal(state.assetManifest?.schemaVersion, 4);
    assert.equal(state.agentStateA?.consciousAgencyV2?.schemaVersion, 2);
  });
  it("requires frozen V5 policy, prompt/output revisions and both V3 generation compilers", () => {
    const state = v5Fixture();
    assert.equal(BattleStateSchema.safeParse(state).success, true);
    for (const key of ["awarenessPolicy", "promptRevision", "outputRevision"] as const) {
      assert.equal(BattleAssetManifestV5Schema.safeParse({ ...state.assetManifest, [key]: undefined }).success, false);
    }
    const manifest = state.assetManifest;
    assert.equal(BattleAssetManifestV5Schema.safeParse({ ...manifest, characters: { ...manifest.characters, a: { ...manifest.characters.a, compilerInputsV4: undefined } } }).success, false);
    assert.equal(BattleAssetManifestV5Schema.safeParse({ ...manifest, awarenessPolicy: { ...AwarenessDefaultPolicy, maxDurationMs: 180001 } }).success, false);
  });
  it("technical incomplete preserves the last committed world without a winner", () => {
    const state = { ...v5Fixture(), status: "incomplete", incompleteReason: "subconscious_deadline" };
    assert.equal(BattleStateSchema.safeParse(state).success, true);
  });
  for (const [description, patch] of [
    ["requires an incomplete reason", { incompleteReason: undefined }],
    ["forbids an invented winner", { winnerSide: "a" }],
    ["forbids a canonical finish reason", { finishReason: "turn_limit" }],
    ["forbids old conscious agency", { agentStateA: CharacterAgentStateSchema.parse({ consciousAgencyV2: initialConsciousAgencyV2() }) }],
  ] as const) {
    it(description, () => {
      const candidate = { ...v5Fixture(), status: "incomplete", incompleteReason: "subconscious_deadline" };
      assert.equal(BattleStateSchema.safeParse({ ...candidate, ...patch }).success, false);
    });
  }
  it("does not add technical incomplete to older frozen V4 contracts", () => {
    assert.equal(BattleStateSchema.safeParse({ ...fixture().state, status: "incomplete", incompleteReason: "failure" }).success, false);
  });
  it("does not settle ratings on a technical incomplete", () => {
    const side = { characterId: "a", before: 1500, after: 1501, delta: 1, provisionalBefore: true, provisionalAfter: true, gamesPlayedBefore: 0 };
    const ratingSettlement = { applied: true, voided: false, ranked: true, sideA: side, sideB: { ...side, characterId: "b", after: 1499, delta: -1 } };
    const state = v5Fixture();
    assert.equal(BattleStateSchema.safeParse({ ...state, status: "finished", winnerSide: "a", finishReason: "turn_limit", ratingSettlement }).success, true);
    assert.equal(BattleStateSchema.safeParse({ ...state, status: "incomplete", incompleteReason: "resource_failure", ratingSettlement }).success, false);
  });
});
