import type {
  PsycheReactionProjectionV1,
  PsycheReactionReceiptV1,
  PsycheReactionStateV1,
  PsycheRelationshipStateV1,
  PsycheTraitProfileV1,
  TurnObservationPacket,
} from "./battle.js";

export const PSYCHE_REACTION_POLICY_V1 = "psyche-reaction-policy-v1";

export const NEUTRAL_PSYCHE_TRAITS_V1: PsycheTraitProfileV1 = {
  adverseSensitivity: 500,
  uncertaintySensitivity: 500,
  recoverySpeed: 500,
  irritationPersistence: 500,
  anxietyPersistence: 500,
  approachTendency: 500,
  withdrawalTendency: 500,
  impulseInhibition: 500,
  expressionRestraint: 500,
};

export const NEUTRAL_PSYCHE_RELATIONSHIP_V1: PsycheRelationshipStateV1 = {
  trust: 0,
  affiliation: 0,
  fear: 0,
  competition: 0,
};

export function initialPsycheReactionStateV1(): PsycheReactionStateV1 {
  return {
    schemaVersion: 1,
    emotion: { irritation: 0, anxiety: 0, relief: 0, fear: 0 },
    interpretation: { adverse: 0, uncertain: 0, affiliative: 0 },
    impulse: { confront: 0, withdraw: 0, approach: 0, seekReassurance: 0 },
    arousal: 0,
  };
}

const clamp = (value: number) => Math.max(0, Math.min(1000, Math.round(value)));
const retained = (value: number, perMille: number) => clamp(value * perMille / 1000);
const band = (value: number): "low" | "medium" | "high" =>
  value >= 667 ? "high" : value >= 334 ? "medium" : "low";

function sourceIds(packet: TurnObservationPacket): string[] {
  return [...new Set([
    ...packet.selfResult,
    ...packet.counterpartResult,
    ...packet.ambientChange,
  ].flatMap((item) => item.sourceEventIds))].sort().slice(0, 24);
}

/**
 * V1 deliberately derives no sentiment from prose. A committed observation is
 * activation; uncertainty is taken only from the validated certainty enum.
 */
export function advancePsycheReactionV1(input: {
  prior?: PsycheReactionStateV1;
  packet: TurnObservationPacket | null;
  traits?: PsycheTraitProfileV1;
  relationship?: PsycheRelationshipStateV1;
}): {
  state: PsycheReactionStateV1;
  actionProjection: PsycheReactionProjectionV1;
  expressionProjection: PsycheReactionProjectionV1;
  receipt: PsycheReactionReceiptV1;
} {
  const prior = input.prior ?? initialPsycheReactionStateV1();
  const traits = input.traits ?? NEUTRAL_PSYCHE_TRAITS_V1;
  const relationship = input.relationship ?? NEUTRAL_PSYCHE_RELATIONSHIP_V1;
  const items = input.packet
    ? [...input.packet.selfResult, ...input.packet.counterpartResult, ...input.packet.ambientChange]
    : [];
  const anxietyRetention = 700 + Math.round(traits.anxietyPersistence * 250 / 1000);
  const irritationRetention = 700 + Math.round(traits.irritationPersistence * 250 / 1000);
  const recoveryRetention = 900 - Math.round(traits.recoverySpeed * 400 / 1000);
  const certaintyWeight = { certain: 0, likely: 50, uncertain: 150, unknown: 250 } as const;
  const uncertainty = Math.min(250, Math.round(
    items.reduce((sum, item) => sum + certaintyWeight[item.certainty], 0) *
      traits.uncertaintySensitivity / 1000,
  ));
  const activation = Math.min(250, items.length * 35);
  const next: PsycheReactionStateV1 = {
    schemaVersion: 1,
    emotion: {
      irritation: retained(prior.emotion.irritation, irritationRetention),
      anxiety: clamp(retained(prior.emotion.anxiety, anxietyRetention) + uncertainty),
      relief: retained(prior.emotion.relief, recoveryRetention),
      fear: clamp(retained(prior.emotion.fear, anxietyRetention) +
        Math.max(0, relationship.fear) * uncertainty / 1000),
    },
    interpretation: {
      adverse: retained(prior.interpretation.adverse, irritationRetention),
      uncertain: clamp(retained(prior.interpretation.uncertain, anxietyRetention) + uncertainty),
      affiliative: retained(prior.interpretation.affiliative, recoveryRetention),
    },
    impulse: {
      confront: 0,
      withdraw: 0,
      approach: 0,
      seekReassurance: 0,
    },
    arousal: clamp(retained(prior.arousal, 750) + activation),
  };
  const inhibition = traits.impulseInhibition / 1000;
  next.impulse.confront = clamp(next.emotion.irritation * traits.approachTendency / 1000 * (1 - inhibition));
  next.impulse.withdraw = clamp((next.emotion.anxiety + next.emotion.fear) / 2 * traits.withdrawalTendency / 1000 * (1 - inhibition));
  next.impulse.approach = clamp(next.emotion.relief * traits.approachTendency / 1000 * (1 - inhibition));
  next.impulse.seekReassurance = clamp(next.emotion.anxiety * Math.max(0, relationship.affiliation + 1000) / 2000 * (1 - inhibition));

  const interpretations = (["adverse", "uncertain", "affiliative"] as const)
    .filter((key) => next.interpretation[key] >= 334);
  const impulses = ([
    ["confront", next.impulse.confront],
    ["withdraw", next.impulse.withdraw],
    ["approach", next.impulse.approach],
    ["seek_reassurance", next.impulse.seekReassurance],
  ] as const).filter(([, value]) => value >= 334).map(([key]) => key);
  const actionProjection: PsycheReactionProjectionV1 = {
    schemaVersion: 1,
    arousal: band(next.arousal),
    interpretation: interpretations,
    impulse: impulses,
  };
  const expressionProjection: PsycheReactionProjectionV1 = {
    ...actionProjection,
    expressionTendency: traits.expressionRestraint >= 667
      ? "withhold"
      : traits.expressionRestraint >= 334 ? "restrained" : "available",
  };
  const receipt: PsycheReactionReceiptV1 = {
    schemaVersion: 1,
    policyGeneration: PSYCHE_REACTION_POLICY_V1,
    turn: input.packet?.turn ?? 0,
    observerSide: input.packet?.observerSide ?? "a",
    route: "deterministic_no_call",
    reason: input.packet === null
      ? "feature_unavailable_hold"
      : items.length === 0 ? "no_observation_decay" : "committed_observation",
    sourceEventIds: input.packet ? sourceIds(input.packet) : [],
    contributions: [
      { code: "uncertainty", dimension: "interpretation.uncertain", amount: uncertainty },
      { code: "activation", dimension: "arousal", amount: activation },
      { code: "inhibition", dimension: "impulse", amount: -Math.round(traits.impulseInhibition / 4) },
      { code: "restraint", dimension: "expression", amount: -Math.round(traits.expressionRestraint / 4) },
    ],
  };
  return { state: next, actionProjection, expressionProjection, receipt };
}
