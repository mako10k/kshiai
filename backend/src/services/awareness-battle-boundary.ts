// R: Prepare one battle boundary from immutable assets, current legal actions, and durable subjective state.
import {
  AwarenessInitialize, AwarenessCancelGeneration, AwarenessSelectDesires,
  buildUtterancePerceptionEvidence, observerPerceptId,
  type BattleState, type CharacterActionIntent, type ObserverSafeAvailableAction, type AwarenessConsciousGuidance,
} from "@kshiai/shared";
import type { LlmProvider } from "../llm/types.js";
import { getAssetGeneration } from "../repositories/asset-generations.js";
import { getAwarenessRuntime, initializeAwarenessRuntime, mutateAwarenessRuntime } from "../repositories/battle-awareness.js";
import { buildAwarenessExecutionContext } from "./awareness-context.js";
import { createConfiguredAwarenessExecution } from "./awareness-execution-factory.js";
import type { AwarenessPreparedTick } from "./awareness-execution.js";
import type { BattleLeaseFence } from "./distributed-guard.js";

export type AwarenessActionFrame = {
  consciousGuidance: AwarenessConsciousGuidance;
  availableActions: readonly ObserverSafeAvailableAction[];
  facts: readonly { ref: string; content: string }[];
  accepts(action: CharacterActionIntent): boolean;
};

/** The production transfer seam is also exercised by source-to-prompt delivery tests. */
export function buildAwarenessBoundaryContext(input: Omit<Parameters<typeof buildAwarenessExecutionContext>[0],
  "availableActions" | "actionFacts" | "consciousGuidance"> & { frame: AwarenessActionFrame }) {
  const { frame, ...current } = input;
  return buildAwarenessExecutionContext({ ...current, availableActions: frame.availableActions,
    actionFacts: frame.facts, consciousGuidance: frame.consciousGuidance });
}

export async function stopAwarenessBattleRuntime(input: {
  battleId: string; fence: BattleLeaseFence; reason: string;
}): Promise<void> {
  for (let retry = 0; retry < 5; retry += 1) {
    const current = await getAwarenessRuntime(input.battleId);
    if (!current) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    try {
      await mutateAwarenessRuntime({ battleId: input.battleId, expectedRevision: current.revision,
        fence: input.fence, now: new Date().toISOString() }, (runtime) => ({
        ...runtime, status: "incomplete", incompleteReason: input.reason.slice(0, 200),
        sides: { a: AwarenessCancelGeneration(runtime.sides.a), b: AwarenessCancelGeneration(runtime.sides.b) },
      }));
      return;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "AWARENESS_REVISION_OR_LEASE_CONFLICT" || retry === 4) throw error;
    }
  }
}

export async function prepareAwarenessBattleBoundary(input: {
  state: BattleState;
  llm: LlmProvider;
  fence: BattleLeaseFence;
  tick: number;
  phase: "prologue" | "turn";
  frames: { a: AwarenessActionFrame; b: AwarenessActionFrame };
}): Promise<AwarenessPreparedTick> {
  const manifest = input.state.assetManifest;
  if (manifest?.schemaVersion !== 5) throw new Error("AWARENESS_MANIFEST_REQUIRED");
  const startedAt = Date.parse(manifest.boundAt);
  await initializeAwarenessRuntime({ battleId: input.state.id, fence: input.fence,
    now: new Date().toISOString(), runtime: AwarenessInitialize({ policy: manifest.awarenessPolicy, startedAt,
      promptRevision: manifest.promptRevision, outputRevision: manifest.outputRevision }) });
  const current = await getAwarenessRuntime(input.state.id);
  if (!current) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
  const roles = input.llm.awareness;
  if (!roles) {
    await stopAwarenessBattleRuntime({ battleId: input.state.id, fence: input.fence, reason: "AWARENESS_REQUIRED_MODEL_ROUTE_MISSING" });
    const stopped = await getAwarenessRuntime(input.state.id);
    if (!stopped) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    return { snapshot: stopped, canCommitWorld: false, selected: { a: { body: null, voice: null }, b: { body: null, voice: null } } };
  }
  const generations = await Promise.allSettled([
    getAssetGeneration(manifest.characters.a.generationId),
    getAssetGeneration(manifest.characters.b.generationId),
  ]);
  const latestRecord = input.state.turnRecords?.at(-1);
  const speechEvidence = buildUtterancePerceptionEvidence({ events: latestRecord?.events ?? [],
    worldState: input.state.worldState, previousFrameA: input.state.perceptionFrameA,
    previousFrameB: input.state.perceptionFrameB });
  const context = (side: "a" | "b", index: 0 | 1) => {
    const generation = generations[index];
    if (generation.status !== "fulfilled") throw generation.reason;
    if (!generation.value) throw new Error("AWARENESS_IMMUTABLE_CHARACTER_MISSING");
    const selected = AwarenessSelectDesires(current.runtime.sides[side].desires, input.tick,
      current.runtime.sides[side].acceptedDesireIds);
    const frame = side === "a" ? input.state.perceptionFrameA : input.state.perceptionFrameB;
    const changed = new Set(frame?.latestDiff.addedOrUpdatedPerceptIds ?? []);
    const receivedSpeech = speechEvidence.some((evidence) => evidence.source.kind === "entity" &&
      evidence.source.entityId !== `character.${side}` && changed.has(observerPerceptId(side, evidence.evidenceId)));
    return buildAwarenessBoundaryContext({ state: input.state, side, generation: generation.value,
      frame: input.frames[side],
      receivedSpeech,
      intentCompleted: Boolean(latestRecord?.actions.some((action) => action.actorSide === side)),
      intentInvalid: Boolean(selected.body && !input.frames[side].accepts(selected.body.action)),
    });
  };
  return createConfiguredAwarenessExecution(roles, input.llm.awarenessBillingContracts ?? [], current.runtime.policy, input.state.id, current.runtime.promptRevision).prepareTick({
    battleId: input.state.id, phase: input.phase, tick: input.tick, now: Date.now(),
    battleLeaseFence: input.fence, sides: { a: context("a", 0), b: context("b", 1) },
  });
}
