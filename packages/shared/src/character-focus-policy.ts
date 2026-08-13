import {
  CharacterFocusPacketV1Schema,
  CharacterFocusStateV1Schema,
  CharacterFocusTransitionReceiptV1Schema,
  type CharacterAttentionEffectivenessV1,
  type CharacterConversationEntry,
  type CharacterFocusEvidenceKindV1,
  type CharacterFocusPacketV1,
  type CharacterFocusSlotV1,
  type CharacterFocusStateV1,
  type CharacterFocusStrengthV1,
  type CharacterFocusTransitionReasonV1,
  type CharacterFocusTransitionReceiptV1,
  type PsycheReactionProjectionV1,
  type TurnObservationItem,
  type TurnObservationPacket,
} from "./battle.js";
import type { ServerOnlyReserveCue } from "./perception.js";

export const CHARACTER_FOCUS_POLICY_V1 = "character-focus-shadow-v1";

const DETECTION_THRESHOLD: Record<CharacterAttentionEffectivenessV1, number> = {
  strained: 700,
  steady: 500,
  sharp: 350,
};

const KIND_BASE: Record<CharacterFocusEvidenceKindV1, number> = {
  self_result: 500,
  counterpart_result: 620,
  ambient_change: 420,
  counterpart_speech: 800,
};

const CERTAINTY_ADJUSTMENT: Record<TurnObservationItem["certainty"], number> = {
  certain: 160,
  likely: 80,
  uncertain: -60,
  unknown: -180,
};

const KIND_ORDER: Record<CharacterFocusEvidenceKindV1, number> = {
  counterpart_speech: 0,
  counterpart_result: 1,
  self_result: 2,
  ambient_change: 3,
};

type FocusEvidenceCandidateV1 = {
  evidenceRef: string;
  kind: CharacterFocusEvidenceKindV1;
  perceivedChange: string;
  sourceEventIds: string[];
  turn: number;
  fresh: boolean;
  salience: number;
  strength: CharacterFocusStrengthV1;
};

export type CharacterFocusTransitionV1Input = {
  observerSide: "a" | "b";
  turn: number;
  prior?: CharacterFocusStateV1;
  packet: TurnObservationPacket | null;
  retainedPackets?: readonly TurnObservationPacket[];
  conversation?: readonly CharacterConversationEntry[];
  focusCue?: ServerOnlyReserveCue | null;
  reaction?: PsycheReactionProjectionV1;
  protectiveHold?: boolean;
};

export type CharacterFocusTransitionV1Result = {
  state: CharacterFocusStateV1;
  packet: CharacterFocusPacketV1;
  receipt: CharacterFocusTransitionReceiptV1;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function strengthFor(salience: number): CharacterFocusStrengthV1 {
  if (salience >= 700) return "strong";
  if (salience >= 500) return "clear";
  return "weak";
}

function reactionAdjustment(
  kind: CharacterFocusEvidenceKindV1,
  reaction?: PsycheReactionProjectionV1,
): number {
  if (!reaction) return 0;
  let adjustment = reaction.arousal === "high"
    ? 30
    : reaction.arousal === "low" ? -30 : 0;
  if (
    reaction.interpretation.includes("adverse") &&
    (kind === "counterpart_result" || kind === "counterpart_speech")
  ) {
    adjustment += 50;
  }
  if (
    reaction.interpretation.includes("uncertain") &&
    kind === "ambient_change"
  ) {
    adjustment += 50;
  }
  if (
    reaction.interpretation.includes("affiliative") &&
    kind === "counterpart_speech"
  ) {
    adjustment += 50;
  }
  return adjustment;
}

function scoreObservation(input: {
  kind: CharacterFocusEvidenceKindV1;
  item: TurnObservationItem;
  reaction?: PsycheReactionProjectionV1;
}): number {
  const evidenceDensity = Math.min(120, input.item.sourceEventIds.length * 40);
  return clamp(
    KIND_BASE[input.kind] +
      CERTAINTY_ADJUSTMENT[input.item.certainty] +
      evidenceDensity +
      reactionAdjustment(input.kind, input.reaction),
  );
}

function observationCandidates(input: {
  packet: TurnObservationPacket;
  fresh: boolean;
  reaction?: PsycheReactionProjectionV1;
}): FocusEvidenceCandidateV1[] {
  const groups = [
    ["self_result", input.packet.selfResult],
    ["counterpart_result", input.packet.counterpartResult],
    ["ambient_change", input.packet.ambientChange],
  ] as const;
  return groups.flatMap(([kind, items]) => items.map((item, index) => {
    const salience = scoreObservation({ kind, item, reaction: input.reaction });
    return {
      evidenceRef:
        `focus.${input.packet.observerSide}.observation.${input.packet.turn}.${kind}.${index}`,
      kind,
      perceivedChange: item.phenomenon,
      sourceEventIds: [...new Set(item.sourceEventIds)].sort(),
      turn: input.packet.turn,
      fresh: input.fresh,
      salience,
      strength: strengthFor(salience),
    };
  }));
}

function shortTextDigest(text: string): string {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

function conversationCandidates(input: {
  observerSide: "a" | "b";
  conversation: readonly CharacterConversationEntry[];
  processedConversationThrough: number | null;
  reaction?: PsycheReactionProjectionV1;
}): FocusEvidenceCandidateV1[] {
  const occurrences = new Map<string, number>();
  return input.conversation.flatMap((entry) => {
    if (entry.speaker !== "counterpart") return [];
    const digest = shortTextDigest(entry.text);
    const occurrenceKey = `${entry.turn}.${digest}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    const salience = clamp(
      KIND_BASE.counterpart_speech +
        reactionAdjustment("counterpart_speech", input.reaction),
    );
    return [{
      evidenceRef:
        `focus.${input.observerSide}.conversation.${entry.turn}.${digest}.${occurrence}`,
      kind: "counterpart_speech" as const,
      perceivedChange: entry.text,
      sourceEventIds: [],
      turn: entry.turn,
      fresh: input.processedConversationThrough === null ||
        entry.turn > input.processedConversationThrough,
      salience,
      strength: strengthFor(salience),
    }];
  });
}

function focusEffectiveness(input: {
  observerSide: "a" | "b";
  focusCue?: ServerOnlyReserveCue | null;
}): CharacterAttentionEffectivenessV1 | null {
  const cue = input.focusCue;
  if (
    !cue ||
    cue.side !== input.observerSide ||
    cue.targetEntityId !== `character.${input.observerSide}` ||
    cue.parameterKey !== "focus"
  ) {
    return null;
  }
  if (
    cue.absoluteBand === "empty" ||
    cue.absoluteBand === "critical" ||
    cue.relativeBand === "empty" ||
    cue.relativeBand === "critical" ||
    cue.relativeBand === "low"
  ) {
    return "strained";
  }
  if (
    (cue.absoluteBand === "ready" || cue.absoluteBand === "full") &&
    (cue.relativeBand === "ready" || cue.relativeBand === "full")
  ) {
    return "sharp";
  }
  return "steady";
}

function processedConversationThrough(input: {
  prior: CharacterFocusStateV1 | undefined;
  conversation: readonly CharacterConversationEntry[];
}): number | null {
  const turns = input.conversation.map((entry) => entry.turn);
  if (input.prior?.processedConversationThrough !== null &&
      input.prior?.processedConversationThrough !== undefined) {
    turns.push(input.prior.processedConversationThrough);
  }
  return turns.length > 0 ? Math.max(...turns) : null;
}

function decayedSlot(
  slot: CharacterFocusSlotV1 | null | undefined,
  decayAmount: number,
): CharacterFocusSlotV1 | null {
  if (!slot) return null;
  const salience = clamp(slot.salience - decayAmount);
  return salience > 0 ? { ...slot, salience } : null;
}

function slotFromCandidate(
  candidate: FocusEvidenceCandidateV1,
  beganTurn = candidate.turn,
): CharacterFocusSlotV1 {
  return {
    kind: candidate.kind,
    evidenceRef: candidate.evidenceRef,
    salience: candidate.salience,
    strength: candidate.strength,
    beganTurn,
    lastEvidenceTurn: candidate.turn,
  };
}

function packetSlot(input: {
  slot: CharacterFocusSlotV1 | null;
  evidenceByRef: ReadonlyMap<string, FocusEvidenceCandidateV1>;
  reason: CharacterFocusTransitionReasonV1;
}): CharacterFocusPacketV1["primary"] {
  if (!input.slot) return null;
  const evidence = input.evidenceByRef.get(input.slot.evidenceRef);
  if (!evidence) return null;
  return {
    kind: input.slot.kind,
    perceivedChange: evidence.perceivedChange,
    freshness: evidence.fresh
      ? "fresh"
      : input.reason === "held_protective" ? "held" : "decaying",
    strength: input.slot.strength,
  };
}

function featureUnavailableResult(input: {
  observerSide: "a" | "b";
  turn: number;
  prior?: CharacterFocusStateV1;
}): CharacterFocusTransitionV1Result {
  const decayAmount = 250;
  const primary = decayedSlot(input.prior?.primary, decayAmount);
  const state = CharacterFocusStateV1Schema.parse({
    schemaVersion: 1,
    policyGeneration: CHARACTER_FOCUS_POLICY_V1,
    primary,
    secondary: null,
    processedConversationThrough:
      input.prior?.processedConversationThrough ?? null,
    transitionReason: "feature_unavailable",
  });
  const packet = CharacterFocusPacketV1Schema.parse({
    schemaVersion: 1,
    effectiveness: null,
    transition: "feature_unavailable",
    primary: null,
    secondary: null,
  });
  const receipt = CharacterFocusTransitionReceiptV1Schema.parse({
    schemaVersion: 1,
    policyGeneration: CHARACTER_FOCUS_POLICY_V1,
    turn: input.turn,
    observerSide: input.observerSide,
    route: "deterministic_shadow_no_call",
    reason: "feature_unavailable",
    effectiveness: null,
    detectionThreshold: null,
    decayAmount,
    switchMargin: 100,
    consideredEvidenceRefs: [],
    selectedEvidenceRefs: [],
    sourceEventIds: [],
  });
  return { state, packet, receipt };
}

export function advanceCharacterFocusV1(
  input: CharacterFocusTransitionV1Input,
): CharacterFocusTransitionV1Result {
  const prior = input.prior?.policyGeneration === CHARACTER_FOCUS_POLICY_V1
    ? input.prior
    : undefined;
  const effectiveness = focusEffectiveness(input);
  if (
    !input.packet ||
    input.packet.observerSide !== input.observerSide ||
    input.packet.turn !== input.turn ||
    effectiveness === null
  ) {
    return featureUnavailableResult({
      observerSide: input.observerSide,
      turn: input.turn,
      prior,
    });
  }

  const conversation = input.conversation ?? [];
  const retainedPackets = (input.retainedPackets ?? [])
    .filter((packet) => packet.observerSide === input.observerSide);
  const retainedCandidates = retainedPackets.flatMap((packet) =>
    observationCandidates({ packet, fresh: false, reaction: input.reaction })
  );
  const currentCandidates = observationCandidates({
    packet: input.packet,
    fresh: true,
    reaction: input.reaction,
  });
  const speechCandidates = conversationCandidates({
    observerSide: input.observerSide,
    conversation,
    processedConversationThrough: prior?.processedConversationThrough ?? null,
    reaction: input.reaction,
  });
  const evidenceByRef = new Map<string, FocusEvidenceCandidateV1>();
  for (const candidate of [...retainedCandidates, ...speechCandidates, ...currentCandidates]) {
    const previous = evidenceByRef.get(candidate.evidenceRef);
    if (!previous || candidate.fresh) evidenceByRef.set(candidate.evidenceRef, candidate);
  }
  const freshCandidates = [...currentCandidates, ...speechCandidates.filter((item) => item.fresh)]
    .sort((left, right) =>
      right.salience - left.salience ||
      right.turn - left.turn ||
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      left.evidenceRef.localeCompare(right.evidenceRef)
    );
  const detectionThreshold = DETECTION_THRESHOLD[effectiveness];
  const eligible = freshCandidates.filter((candidate) =>
    candidate.salience >= detectionThreshold
  );
  const protectiveHold = input.protectiveHold === true;
  const decayAmount = protectiveHold ? 80 : 250;
  const switchMargin = protectiveHold ? 160 : 100;
  const priorPrimary = decayedSlot(prior?.primary, decayAmount);
  const top = eligible[0];
  let primary: CharacterFocusSlotV1 | null = priorPrimary;
  let reason: CharacterFocusTransitionReasonV1;

  if (!priorPrimary && top) {
    primary = slotFromCandidate(top);
    reason = "selected_fresh";
  } else if (priorPrimary && top?.kind === priorPrimary.kind) {
    primary = slotFromCandidate(top, priorPrimary.beganTurn);
    reason = "refreshed_fresh";
  } else if (
    priorPrimary &&
    top &&
    top.salience >= priorPrimary.salience + switchMargin
  ) {
    primary = slotFromCandidate(top);
    reason = "switched_stronger";
  } else if (priorPrimary && top) {
    reason = protectiveHold ? "held_protective" : "held_hysteresis";
  } else if (priorPrimary) {
    reason = protectiveHold ? "held_protective" : "decayed_unsupported";
  } else {
    reason = "no_detectable_evidence";
  }

  const secondaryCandidate = effectiveness === "sharp"
    ? eligible.find((candidate) => candidate.evidenceRef !== primary?.evidenceRef)
    : undefined;
  const secondary = secondaryCandidate
    ? slotFromCandidate(secondaryCandidate)
    : null;
  const state = CharacterFocusStateV1Schema.parse({
    schemaVersion: 1,
    policyGeneration: CHARACTER_FOCUS_POLICY_V1,
    primary,
    secondary,
    processedConversationThrough: processedConversationThrough({
      prior,
      conversation,
    }),
    transitionReason: reason,
  });
  const packet = CharacterFocusPacketV1Schema.parse({
    schemaVersion: 1,
    effectiveness,
    transition: reason,
    primary: packetSlot({ slot: primary, evidenceByRef, reason }),
    secondary: packetSlot({ slot: secondary, evidenceByRef, reason }),
  });
  const selectedSlots = [primary, secondary].filter(
    (slot): slot is CharacterFocusSlotV1 => slot !== null,
  );
  const selectedEvidence = selectedSlots.flatMap((slot) => {
    const evidence = evidenceByRef.get(slot.evidenceRef);
    return evidence ? [evidence] : [];
  });
  const receipt = CharacterFocusTransitionReceiptV1Schema.parse({
    schemaVersion: 1,
    policyGeneration: CHARACTER_FOCUS_POLICY_V1,
    turn: input.turn,
    observerSide: input.observerSide,
    route: "deterministic_shadow_no_call",
    reason,
    effectiveness,
    detectionThreshold,
    decayAmount,
    switchMargin,
    consideredEvidenceRefs: freshCandidates
      .map((candidate) => candidate.evidenceRef)
      .slice(0, 32),
    selectedEvidenceRefs: selectedSlots
      .map((slot) => slot.evidenceRef)
      .slice(0, 2),
    sourceEventIds: [...new Set(
      selectedEvidence.flatMap((evidence) => evidence.sourceEventIds),
    )].sort().slice(0, 24),
  });
  return { state, packet, receipt };
}
