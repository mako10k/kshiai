import {
  TurnObservationPacketSchema,
  type TurnObservationItem,
  type TurnObservationPacket,
} from "./battle.js";
import type {
  CharacterPerceptionFrame,
  PerceptionCertainty,
  PerceptionEvidence,
  PerceptionSlot,
} from "./perception.js";

const certaintyRank: Record<PerceptionCertainty, number> = {
  certain: 0,
  probable: 1,
  possible: 2,
  unknown: 3,
};

function observationCertainty(
  occurrence: PerceptionCertainty,
  attribution: PerceptionCertainty,
): TurnObservationItem["certainty"] {
  const weaker = certaintyRank[occurrence] >= certaintyRank[attribution]
    ? occurrence
    : attribution;
  return weaker === "certain"
    ? "certain"
    : weaker === "probable"
      ? "likely"
      : weaker === "possible"
        ? "uncertain"
        : "unknown";
}

function sourceEventIdsForPercept(input: {
  side: "a" | "b";
  perceptId: string;
  evidence: readonly PerceptionEvidence[];
}): string[] {
  const ids = input.evidence
    .filter((item) => input.perceptId === `percept.${input.side}.${item.evidenceId}`)
    .flatMap((item) => item.basisEventIds)
    .slice(0, 8);
  return [...new Set(ids)];
}

function newPerceptsForSlot(input: {
  frame: CharacterPerceptionFrame;
  slot: PerceptionSlot;
  evidence: readonly PerceptionEvidence[];
}): TurnObservationItem[] {
  const changed = new Set(input.frame.latestDiff.addedOrUpdatedPerceptIds);
  // Utterance evidence remains observer-visible in the perception frame, but
  // reaches character agents only through ordered conversation continuity.
  // This server-owned evidence-ID prefix is not a free-form prose classifier.
  return input.slot.percepts
    .filter((percept) =>
      changed.has(percept.perceptId) &&
      !percept.perceptId.startsWith(
        `percept.${input.frame.observer.side}.evidence.utterance.`,
      )
    )
    .slice(0, 8)
    .map((percept) => ({
      phenomenon: percept.phenomenon.slice(0, 320),
      certainty: observationCertainty(
        percept.occurrenceCertainty,
        percept.attributionCertainty,
      ),
      sourceEventIds: sourceEventIdsForPercept({
        side: input.frame.observer.side,
        perceptId: percept.perceptId,
        evidence: input.evidence,
      }),
    }));
}

function qualitativeItems(input: {
  frame: CharacterPerceptionFrame;
  target: "self" | "counterpart" | "ambient";
}): TurnObservationItem[] {
  return input.frame.qualitativeChanges
    .filter((change) => input.target === "self"
      ? change.targetKnowledge === "self"
      : input.target === "counterpart"
        ? change.targetKnowledge !== "self"
        : false)
    .slice(0, 8)
    .map((change) => ({
      phenomenon: `${change.parameterKey}:${change.direction}:${change.absoluteBand}:${change.outcome}`,
      certainty: change.targetKnowledge === "unknown" ? "uncertain" : "likely",
      sourceEventIds: [],
    }));
}

/**
 * Bounded observer-safe input for dialogue. It contains only committed
 * observer perception and evidence references, never canonical mechanics.
 */
export function buildTurnObservationPacket(input: {
  frame: CharacterPerceptionFrame;
  evidence?: readonly PerceptionEvidence[];
}): TurnObservationPacket {
  const evidence = input.evidence ?? [];
  const selfResult = [
    ...newPerceptsForSlot({ frame: input.frame, slot: input.frame.self, evidence }),
    ...qualitativeItems({ frame: input.frame, target: "self" }),
  ].slice(0, 8);
  const counterpartResult = [
    ...newPerceptsForSlot({ frame: input.frame, slot: input.frame.counterpart, evidence }),
    ...qualitativeItems({ frame: input.frame, target: "counterpart" }),
  ].slice(0, 8);
  const ambientChange = input.frame.others
    .flatMap((slot) => newPerceptsForSlot({ frame: input.frame, slot, evidence }))
    .slice(0, 8);

  return TurnObservationPacketSchema.parse({
    schemaVersion: 1,
    turn: input.frame.turn,
    observerSide: input.frame.observer.side,
    selfResult,
    counterpartResult,
    ambientChange,
  });
}
