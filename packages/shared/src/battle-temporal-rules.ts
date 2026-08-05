export type BattleTemporalSide = "a" | "b";

export const BATTLE_TEMPORAL_RULESET = Object.freeze({
  id: "initiative-window-v1",
  simultaneousInitiativeDelta: 1,
  sameBucketSnapshot: "bucket_start",
  sameBucketCommit: "atomic",
  lowerBucketRevalidation: "required",
  incapacitatedBeforeBucket: "skip",
  mutualIncapacitation: "draw",
  sameBucketDefense: "applies",
  exclusiveConflict: "contested",
  orderingRandomness: "forbidden",
} as const);

export type BattleTemporalBucket = {
  index: number;
  actorSides: BattleTemporalSide[];
  initiativeScore: number;
  simultaneous: boolean;
  readsFrom: "turn_start" | "previous_bucket_commit";
  commitMode: "atomic" | "sequential";
};

export type BattleTemporalPlan = {
  rulesetId: typeof BATTLE_TEMPORAL_RULESET.id;
  initiativeScores: Record<BattleTemporalSide, number>;
  buckets: BattleTemporalBucket[];
};

function normalizeInitiativeScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("effective initiative must be finite");
  }
  return Math.round(value);
}

/**
 * Builds the side-neutral execution buckets for a two-combatant turn.
 *
 * Both initiative inputs must already include committed start-of-turn effects.
 * This function does not use random tie-breaking. Members of a simultaneous
 * bucket are an unordered set for mechanical resolution even though the wire
 * representation uses the stable [a, b] order.
 */
export function buildBattleTemporalPlan(input: {
  effectiveSpeedA: number;
  effectiveSpeedB: number;
}): BattleTemporalPlan {
  const initiativeScores = {
    a: normalizeInitiativeScore(input.effectiveSpeedA),
    b: normalizeInitiativeScore(input.effectiveSpeedB),
  };
  const difference = initiativeScores.a - initiativeScores.b;

  if (
    Math.abs(difference) <=
      BATTLE_TEMPORAL_RULESET.simultaneousInitiativeDelta
  ) {
    return {
      rulesetId: BATTLE_TEMPORAL_RULESET.id,
      initiativeScores,
      buckets: [{
        index: 0,
        actorSides: ["a", "b"],
        initiativeScore: Math.max(initiativeScores.a, initiativeScores.b),
        simultaneous: true,
        readsFrom: "turn_start",
        commitMode: "atomic",
      }],
    };
  }

  const faster: BattleTemporalSide = difference > 0 ? "a" : "b";
  const slower: BattleTemporalSide = faster === "a" ? "b" : "a";
  return {
    rulesetId: BATTLE_TEMPORAL_RULESET.id,
    initiativeScores,
    buckets: [
      {
        index: 0,
        actorSides: [faster],
        initiativeScore: initiativeScores[faster],
        simultaneous: false,
        readsFrom: "turn_start",
        commitMode: "sequential",
      },
      {
        index: 1,
        actorSides: [slower],
        initiativeScore: initiativeScores[slower],
        simultaneous: false,
        readsFrom: "previous_bucket_commit",
        commitMode: "sequential",
      },
    ],
  };
}
