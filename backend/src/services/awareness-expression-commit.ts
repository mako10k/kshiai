// R: Commit selected awareness voices through physical speech and observer perception rules.
import {
  buildCommittedUtteranceEvents, buildUtterancePerceptionEvidence, projectObserverPerception,
  buildServerOnlyReserveCues, buildBattleTurnRecord,
  type AwarenessDesire, type BattleState, type TurnEvent, type ResolvedBattleAction,
  type PerceptionEvidence, type QuantizedMechanicalEvidence, type CommittedMechanicalEvidence,
} from "@kshiai/shared";
import type { CharacterSpeechSource } from "../llm/types.js";

type Voice = Extract<AwarenessDesire, { resource: "voice" }> | null;
export function commitAwarenessExpressions(input: {
  before: BattleState;
  after: BattleState;
  tick: number;
  voices: { a: Voice; b: Voice };
  events: readonly TurnEvent[];
  actions: readonly ResolvedBattleAction[];
  sensoryEvidence?: readonly PerceptionEvidence[];
  quantizedMechanicalEvidence?: readonly QuantizedMechanicalEvidence[];
  mechanicalEvidence?: readonly CommittedMechanicalEvidence[];
}): { state: BattleState; characterSpeeches: CharacterSpeechSource[] } {
  const sources = (["a", "b"] as const).flatMap((side) => {
    const voice = input.voices[side];
    if (!voice) return [];
    return [{ side, speaker: side === "a" ? input.after.sideA.displayName : input.after.sideB.displayName,
      text: voice.speech, delivery: "spoken" as const }];
  });
  const utterances = buildCommittedUtteranceEvents({ turn: input.tick, sources, worldState: input.after.worldState });
  const events = [...input.events, ...utterances];
  const evidence = buildUtterancePerceptionEvidence({ events: utterances, worldState: input.after.worldState,
    previousFrameA: input.after.perceptionFrameA, previousFrameB: input.after.perceptionFrameB });
  let state = input.after;
  if (utterances.length > 0) {
    if (!state.semanticState) throw new Error("AWARENESS_SPEECH_PERCEPTION_STATE_REQUIRED");
    const semanticState = state.semanticState;
    const project = (side: "a" | "b") => projectObserverPerception({
      observerSide: side, turn: state.turn, semanticState, worldState: state.worldState,
      events, sensoryEvidence: [...(input.sensoryEvidence ?? []), ...evidence],
      quantizedMechanicalEvidence: [...(input.quantizedMechanicalEvidence ?? [])],
      priorityEvidenceIds: evidence.map((item) => item.evidenceId),
      reserveEvidence: buildServerOnlyReserveCues({ side,
        parameters: side === "a" ? state.sideA.parameters : state.sideB.parameters,
        baseParameters: side === "a" ? state.sideA.baseParameters : state.sideB.baseParameters }),
      previousFrame: side === "a" ? state.perceptionFrameA : state.perceptionFrameB,
      previousRegistry: side === "a" ? state.perceptionRegistryA : state.perceptionRegistryB,
      legacyCounterpartIdentified: false,
    });
    const a = project("a"); const b = project("b");
    state = { ...state, perceptionFrameA: a.frame, perceptionFrameB: b.frame,
      perceptionRegistryA: a.registry, perceptionRegistryB: b.registry };
  }
  const record = buildBattleTurnRecord({ before: input.before, after: state, events,
    actions: [...input.actions], mechanicalEvidence: input.mechanicalEvidence });
  const characterSpeeches = utterances.flatMap((event) => event.actorSide && event.utterance
    ? [{ side: event.actorSide, speaker: event.actorName ?? "", text: event.utterance.text }] : []);
  return { state: { ...state, turnRecords: [...(state.turnRecords ?? []), record].slice(-50) }, characterSpeeches };
}
