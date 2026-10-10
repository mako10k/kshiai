// R: Project immutable assets and observer changes into a synchronous private decision boundary.
import { UnifiedConsciousnessInputSchema, type BattleState, type UnifiedConsciousnessInput, type UnifiedConsciousnessRuntime } from "@kshiai/shared";
import { getAssetGeneration } from "../repositories/asset-generations.js";
import { getUnifiedRuntime, mutateUnifiedRuntime } from "../repositories/unified-consciousness.js";
import type { LlmProvider } from "../llm/types.js";
import { buildAwarenessExecutionContext } from "./awareness-context.js";
import type { AwarenessActionFrame } from "./awareness-battle-boundary.js";
import { prepareUnifiedBoundary } from "./unified-consciousness-execution.js";
import { requestDigest, type BattleLeaseFence } from "./distributed-guard.js";
export function unifiedPerceptionDigest(perception: UnifiedConsciousnessInput["perception"]): string {
  return requestDigest({ self: perception.self, counterpart: perception.counterpart, others: perception.others,
    reserveCues: perception.reserveCues, actionEffort: perception.actionEffort });
}
export async function prepareUnifiedBattleBoundary(input: {
  state: BattleState; llm: LlmProvider; fence: BattleLeaseFence; tick: number;
  frames: { a: AwarenessActionFrame; b: AwarenessActionFrame };
}) {
  const manifest = input.state.assetManifest;
  if (manifest?.schemaVersion !== 6) throw new Error("CONSCIOUSNESS_MANIFEST_REQUIRED");
  const transport = input.llm.awareness?.consciousness;
  if (!transport) throw new Error("CONSCIOUSNESS_ROUTE_REQUIRED");
  const current = await getUnifiedRuntime(input.state.id);
  if (!current) throw new Error("CONSCIOUSNESS_RUNTIME_NOT_FOUND");
  async function frame(side: "a" | "b"): Promise<UnifiedConsciousnessInput> {
    const generation = await getAssetGeneration(manifest!.characters[side].generationId);
    if (!generation) throw new Error("CONSCIOUSNESS_CHARACTER_GENERATION_REQUIRED");
    const context = buildAwarenessExecutionContext({ state: input.state, side, generation,
      availableActions: input.frames[side].availableActions, actionFacts: input.frames[side].facts,
      consciousGuidance: input.frames[side].consciousGuidance,
      receivedSpeech: false, intentCompleted: false, intentInvalid: false });
    return UnifiedConsciousnessInputSchema.parse({ side, tick: input.tick, character: context.character,
      characteristics: context.characteristics, perception: context.perception, memory: current!.runtime.sides[side].memory,
      events: [], availableActions: context.availableActions, facts: context.facts,
      ongoingAction: input.state.causalEngineContinuation ? "既に確定した行為の続きが実行中。新しい行為を生成せず既存規則で進行する。" : null });
  }
  const [a, b] = await Promise.all([frame("a"), frame("b")]);
  const collectEvents = (runtime: UnifiedConsciousnessRuntime): UnifiedConsciousnessRuntime => {
    const sides = { ...runtime.sides };
    for (const side of ["a", "b"] as const) {
      const context = side === "a" ? a : b;
      const digest = unifiedPerceptionDigest(context.perception);
      const state = sides[side];
      const pending = [...state.pendingEvents];
      const seen = new Set([...state.consumedEventIds, ...pending.map((event) => event.id)]);
      const append = (id: string, text: string) => { if (!seen.has(id)) { pending.push({ id, text }); seen.add(id); } };
      if (digest !== state.perceptionDigest) append(`${input.state.id}:perception:${side}:${input.tick}`, "本人の知覚内容に追加・変更・消失がある。現在の知覚を確認する。");
      for (const action of input.state.turnRecords?.at(-1)?.actions ?? []) {
        if (action.actorSide === side) append(`${input.state.id}:action:${action.id}`, `試みた行為${action.kind}: ${action.executed ? "実行された" : "実行されなかった"}。理由や周辺の変化は本人の知覚から確認する。`);
      }
      if (pending.length > runtime.policy.maxEvents || pending.reduce((size, event) => size + Array.from(event.text).length, 0) > runtime.policy.eventCharacters) throw new Error("CONSCIOUSNESS_EVENT_CAPACITY_EXCEEDED");
      sides[side] = { ...state, pendingEvents: pending, perceptionDigest: digest };
    }
    return { ...runtime, sides };
  };
  await mutateUnifiedRuntime(input.state.id, input.fence, collectEvents);
  return prepareUnifiedBoundary({ battleId: input.state.id, tick: input.tick, worldRevision: input.state.battleRevision ?? 0,
    transport, promptRevision: manifest.consciousnessPromptRevision, frames: { a, b }, port: {
      async read() { const latest = await getUnifiedRuntime(input.state.id); if (!latest) throw new Error("CONSCIOUSNESS_RUNTIME_NOT_FOUND"); return latest.runtime; },
      async update(reduce) { await mutateUnifiedRuntime(input.state.id, input.fence, reduce); },
      async account(reduce) { await mutateUnifiedRuntime(input.state.id, undefined, reduce); },
    } });
}
