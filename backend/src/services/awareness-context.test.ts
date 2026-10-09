// R: Verify awareness projections bind immutable assets and separate hidden traits from conscious inputs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AwarenessLatentInputSchema, CharacterGenerationEnvelopeV3Schema,
  CurrentActionEffortPolicyV1, projectBattleActionEffort,
  CharacterDefinitionV3Schema, compileCharacterBattleCompilerInputsV4,
  type CharacterSheet,
} from "@kshiai/shared";
import type { AssetGeneration } from "../repositories/asset-generations.js";
import { assetContentDigest } from "../repositories/asset-generations.js";
import { buildImportedCharacterEnvelopeV2 } from "./character-authoring-service.js";
import { buildAwarenessExecutionContext } from "./awareness-context.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";
import { commitAwarenessExpressions } from "./awareness-expression-commit.js";

function envelopeV3(sheet: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({ sheet, attemptId: `awareness-context-${sheet.id}` });
  const { schemaVersion, actionNorms, ...stable } = source.definition;
  const description = (text: string) => ({ text, consumerTags: [], sourceSupportRefs: [] });
  const definition = CharacterDefinitionV3Schema.parse({ ...stable, schemaVersion: 3, actionNorms: [], consciousGuidance: [], mechanicalConflictFallbacks: [],
    profileBackground: [
      { id: "hidden-background", kind: "formative_event", summary: "本人には不明", description: description("本人に知られていない過去の理由"), selfAwareness: "unaware" },
      { id: "known-background", kind: "role", summary: "本人が知る役割", description: description("自分は守り役だと思っている"), selfAwareness: "aware" },
    ],
    psycheDisposition: { ...stable.psycheDisposition, coreNeeds: [
      { id: "hidden-need", description: description("知らないまま承認を求める"), selfAwareness: "unaware" },
    ], tendencies: [
      { id: "hidden-tendency", label: "本人に不明な反応", backgroundRefs: ["hidden-background"], triggerKinds: ["threat"], selfAwareness: "unaware", tendencyDescription: description("意識せず相手の手を警戒する"), manifestationDescription: description("肩がわずかに固くなる") },
      { id: "known-tendency", label: "慎重", backgroundRefs: [], triggerKinds: ["uncertainty"], selfAwareness: "aware", tendencyDescription: description("慎重に距離を保ちたい"), manifestationDescription: description("少し距離を保つ") },
    ] },
  });
  return CharacterGenerationEnvelopeV3Schema.parse({ ...source, definitionSchema: { family: "character", version: 3 }, definition,
    compilerCompatibility: [{ consumer: "character-profile", version: 2 }, { consumer: "battle-mechanics", version: 3 }, { consumer: "psyche-trait-profile", version: 1 }, { consumer: "character-conscious-self", version: 3 }, { consumer: "character-action-norms", version: 3 }, { consumer: "character-mechanical-conflict-fallback", version: 1 }, { consumer: "character-relationship", version: 2 }], deferredValues: { contractVersion: 1, values: [] },
  });
}
function fixture() {
  const { state, characters } = validAwarenessBattleFixture("awareness-context-test");
  const manifest = state.assetManifest;
  if (!manifest || manifest.schemaVersion !== 5) throw new Error("Expected awareness fixture manifest");
  const content = envelopeV3(characters.a);
  const binding = manifest.characters.a;
  binding.contentDigest = assetContentDigest(content);
  binding.compilerInputsV4 = compileCharacterBattleCompilerInputsV4({ definition: content.definition });
  const generation: AssetGeneration = { assetType: "character", assetId: binding.assetId, generation: 1, generationId: binding.generationId, schemaVersion: 3, content, contentDigest: binding.contentDigest, createdAt: manifest.boundAt };
  return { state, generation, content, binding };
}
function project(input: ReturnType<typeof fixture>) {
  return buildAwarenessExecutionContext({ state: input.state, side: "a", generation: input.generation, availableActions: [], consciousGuidance: { kind: "none" }, receivedSpeech: false, intentCompleted: false, intentInvalid: false });
}

describe("awareness immutable context projection", () => {
  it("delivers current bodily effort to both awareness contexts after admitted prologue speech", () => {
    const input = fixture();
    for (const side of ["a", "b"] as const) {
      const actor = side === "a" ? input.state.sideA : input.state.sideB;
      actor.actionEffortPolicy = CurrentActionEffortPolicyV1;
      actor.parameters.stamina = 0;
      const frame = side === "a" ? input.state.perceptionFrameA : input.state.perceptionFrameB;
      assert.ok(frame);
      // A previous value must be recomputed from current bodily facts, not carried forward.
      const effort = projectBattleActionEffort(input.state, side);
      assert.ok(effort);
      frame.actionEffort = { ...effort, fatigue: "古い感覚" };
    }
    const committed = commitAwarenessExpressions({ before: input.state, after: input.state, tick: 0,
      voices: { a: { id: "prologue-voice", source: "conscious", strength: 0.8,
        startTick: 0, validUntilTick: 2, resource: "voice", speech: "正面から来い。" }, b: null },
      events: [{ type: "situation", summary: "向き合っている。" }], actions: [] });
    for (const side of ["a", "b"] as const) {
      const manifest = committed.state.assetManifest;
      assert.ok(manifest?.schemaVersion === 5);
      const binding = manifest.characters[side];
      const content = side === "a" ? input.content : envelopeV3(binding.snapshot);
      binding.contentDigest = assetContentDigest(content);
      const generation: AssetGeneration = { assetType: "character", assetId: binding.assetId,
        generation: 1, generationId: binding.generationId, schemaVersion: 3, content,
        contentDigest: binding.contentDigest, createdAt: manifest.boundAt };
      const context = buildAwarenessExecutionContext({ state: committed.state, side, generation,
        availableActions: [], consciousGuidance: { kind: "none" }, receivedSpeech: side === "b",
        intentCompleted: false, intentInvalid: false });
      assert.deepEqual(context.actionEffort, projectBattleActionEffort(committed.state, side));
      assert.deepEqual(context.perception.actionEffort, context.actionEffort);
      assert.equal(context.actionEffort?.fatigue, "力が入らない");
    }
  });
  it("requires the current bodily effort projection for a newly bound policy", () => {
    const input = fixture();
    input.state.sideA.actionEffortPolicy = CurrentActionEffortPolicyV1;
    assert.throws(() => project(input), /AWARENESS_EFFORT_PERCEPTION_REQUIRED/);
    const frame = input.state.perceptionFrameA;
    assert.ok(frame);
    const effort = projectBattleActionEffort(input.state, "a");
    assert.ok(effort);
    frame.actionEffort = effort;
    const context = project(input);
    assert.deepEqual(context.actionEffort, effort);
    assert.deepEqual(context.perception.actionEffort, effort);
  });
  it("includes hidden latent traits and background while conscious context uses only its aware compiler", () => {
    const context = project(fixture());
    assert.equal(context.characteristics.includes("本人に知られていない過去の理由"), true);
    assert.equal(context.characteristics.includes("意識せず相手の手を警戒する"), true);
    assert.equal(context.characteristics.includes("知らないまま承認を求める"), true);
    assert.deepEqual(context.consciousCharacteristics, ["慎重に距離を保ちたい", "自分は守り役だと思っている"]);
    assert.equal(context.consciousCharacteristics.some((text) => text.includes("知ら") || text.includes("意識せず")), false);
    assert.deepEqual(context.training, []);
    assert.deepEqual(context.consciousTraining, []);
  });
  it("rejects missing or unevaluated guidance instead of treating it as no applicable principle", () => {
    const source = fixture();
    const input = { state: source.state, side: "a" as const, generation: source.generation, availableActions: [],
      consciousGuidance: { kind: "none" as const }, receivedSpeech: false, intentCompleted: false, intentInvalid: false };
    Reflect.deleteProperty(input, "consciousGuidance");
    assert.throws(() => buildAwarenessExecutionContext(input));
  });
  it("rejects mismatched asset, generation, digest, and missing immutable compiler", () => {
    for (const patch of [ { assetId: "another-character" }, { generationId: "current-pointer-generation" }, { contentDigest: "different-digest" }, { assetType: "battlefield" } ]) {
      const input = fixture();
      input.generation = { ...input.generation, ...patch };
      assert.throws(() => project(input), /IMMUTABLE_CHARACTER_MISMATCH/);
    }
    const missingCompiler = fixture();
    missingCompiler.binding.compilerInputsV4 = undefined;
    assert.throws(() => project(missingCompiler), /IMMUTABLE_COMPILER_REQUIRED/);
  });
  it("rejects a perception frame belonging to the other observer", () => {
    const input = fixture();
    const frame = input.state.perceptionFrameA;
    assert.ok(frame);
    frame.observer.side = "b";
    assert.throws(() => project(input), /OBSERVER_FRAME_REQUIRED/);
  });
  it("makes stimuli only from changed current percepts and does not synthesize missing or removed history", () => {
    const input = fixture();
    const frame = input.state.perceptionFrameA;
    assert.ok(frame);
    const percept = (id: string, phenomenon: string) => ({ perceptId: id, modality: "proprioception" as const, phenomenon, direction: "front" as const, distance: "near" as const, salience: "prominent" as const, occurrenceCertainty: "certain" as const, attributionCertainty: "certain" as const });
    frame.self.percepts = [percept("current", "腕が痛い"), percept("unchanged", "足が地面に触れている")];
    frame.counterpart.percepts = [];
    frame.others = [];
    frame.revision = 2;
    frame.latestDiff = { fromRevision: frame.revision - 1, toRevision: frame.revision, addedOrUpdatedPerceptIds: ["current", "absent-history"], removedPerceptIds: ["removed-old"] };
    const context = project(input);
    assert.deepEqual(context.stimuli, [{ id: `${frame.revision}:current`, content: "腕が痛い" }]);
    assert.deepEqual(context.facts, [{ ref: "current", content: "腕が痛い" }, { ref: "unchanged", content: "足が地面に触れている" }]);
  });
  it("preserves a full valid V3 description without rejecting it on the smaller emotion bound", () => {
    const input = fixture();
    input.content.definition.profileBackground[0]!.description.text = "あ".repeat(600);
    input.generation.content = input.content;
    input.generation.contentDigest = assetContentDigest(input.content);
    input.binding.contentDigest = input.generation.contentDigest;
    const context = project(input);
    assert.equal(context.characteristics.some((text) => text.length === 600), true);
    const bounded = AwarenessLatentInputSchema.safeParse({ character: context.character, characteristics: context.characteristics, training: context.training, availableActions: context.availableActions, facts: context.facts, perception: context.perception, side: "a", tick: 1, stimuli: context.stimuli, currentState: { updatedTick: 0, sensations: [], emotions: [], tendencies: [], feltProjection: "" }, influences: [] });
    assert.equal(bounded.success, true);
  });
});
