// R: Project immutable character assets and current observer perception into separate awareness inputs.
import {
  CharacterGenerationEnvelopeV3Schema, AwarenessConsciousGuidanceSchema, type AwarenessConsciousGuidance,
  buildCharacterSelfProfileAnchor,
  deriveBattleProfileStateOverrides,
  type BattleState,
  type ObserverSafeAvailableAction,
} from "@kshiai/shared";
import type { AssetGeneration } from "../repositories/asset-generations.js";
import type { AwarenessExecutionContext } from "./awareness-execution.js";

function requireObserverPerception(state: BattleState, side: "a" | "b") {
  const perception = side === "a" ? state.perceptionFrameA : state.perceptionFrameB;
  if (!perception || perception.observer.side !== side) throw new Error("AWARENESS_OBSERVER_FRAME_REQUIRED");
  const combatant = side === "a" ? state.sideA : state.sideB;
  if (combatant.actionEffortPolicy && !perception.actionEffort) throw new Error("AWARENESS_EFFORT_PERCEPTION_REQUIRED");
  return perception;
}

export function buildAwarenessExecutionContext(input: {
  state: BattleState;
  side: "a" | "b";
  generation: AssetGeneration;
  availableActions: readonly ObserverSafeAvailableAction[];
  actionFacts?: readonly { ref: string; content: string }[];
  consciousGuidance: AwarenessConsciousGuidance;
  receivedSpeech: boolean;
  intentCompleted: boolean;
  intentInvalid: boolean;
}): AwarenessExecutionContext {
  const manifest = input.state.assetManifest;
  if (manifest?.schemaVersion !== 5 && manifest?.schemaVersion !== 6) throw new Error("AWARENESS_MANIFEST_REQUIRED");
  const binding = manifest.characters[input.side];
  if (input.generation.assetType !== "character" || input.generation.assetId !== binding.assetId ||
      input.generation.generationId !== binding.generationId || input.generation.contentDigest !== binding.contentDigest) {
    throw new Error("AWARENESS_IMMUTABLE_CHARACTER_MISMATCH");
  }
  const envelope = CharacterGenerationEnvelopeV3Schema.parse(input.generation.content);
  const perception = requireObserverPerception(input.state, input.side);
  const definition = envelope.definition;
  const compiler = binding.compilerInputsV4;
  if (!compiler) throw new Error("AWARENESS_IMMUTABLE_COMPILER_REQUIRED");
  const percepts = [perception.self, perception.counterpart, ...perception.others].flatMap((slot) => slot.percepts);
  const changed = new Set(perception.latestDiff.addedOrUpdatedPerceptIds);
  return {
    actionEffort: perception.actionEffort ?? null,
    character: buildCharacterSelfProfileAnchor(binding.snapshot, deriveBattleProfileStateOverrides({
      worldState: input.state.worldState, side: input.side,
    })),
    characteristics: [
      ...definition.psycheDisposition.tendencies.map((item) => item.tendencyDescription.text),
      ...definition.psycheDisposition.coreNeeds.map((item) => item.description.text),
      ...definition.profileBackground.map((item) => item.description.text),
    ],
    training: [],
    consciousCharacteristics: [
      ...compiler.consciousSelf.tendencies,
      ...compiler.consciousSelf.background,
      ...compiler.consciousSelf.actionPrinciples,
    ],
    consciousTraining: [],
    consciousGuidance: AwarenessConsciousGuidanceSchema.parse(input.consciousGuidance),
    perception,
    availableActions: [...input.availableActions],
    facts: [...percepts.map((percept) => ({ ref: percept.perceptId, content: percept.phenomenon })), ...(input.actionFacts ?? [])],
    stimuli: percepts.filter((percept) => changed.has(percept.perceptId))
      .map((percept) => ({ id: `${perception.revision}:${percept.perceptId}`, content: percept.phenomenon })),
    receivedSpeech: input.receivedSpeech,
    intentCompleted: input.intentCompleted,
    intentInvalid: input.intentInvalid,
  };
}
