import { z } from "zod";

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

export const BattleTemporalSideSchema = z.enum(["a", "b"]);

export const BattleTemporalBucketSchema = z.object({
  index: z.number().int().nonnegative(),
  actorSides: z.array(BattleTemporalSideSchema).min(1).max(2),
  initiativeScore: z.number().int(),
  simultaneous: z.boolean(),
  readsFrom: z.enum(["turn_start", "previous_bucket_commit"]),
  commitMode: z.enum(["atomic", "sequential"]),
}).strict();
export type BattleTemporalBucket = z.infer<typeof BattleTemporalBucketSchema>;

export const BattleTemporalPlanSchema = z.object({
  rulesetId: z.literal(BATTLE_TEMPORAL_RULESET.id),
  initiativeScores: z.object({
    a: z.number().int(),
    b: z.number().int(),
  }).strict(),
  buckets: z.array(BattleTemporalBucketSchema).min(1).max(2),
}).strict();
export type BattleTemporalPlan = z.infer<typeof BattleTemporalPlanSchema>;

export type BattleTemporalExclusiveClaim = {
  side: BattleTemporalSide;
  resourceId: string;
  operation: "move" | "take";
};

export type BattleTemporalExclusiveOutcome = BattleTemporalExclusiveClaim & {
  outcome: "committed" | "contested";
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
    return BattleTemporalPlanSchema.parse({
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
    });
  }

  const faster: BattleTemporalSide = difference > 0 ? "a" : "b";
  const slower: BattleTemporalSide = faster === "a" ? "b" : "a";
  return BattleTemporalPlanSchema.parse({
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
  });
}

/**
 * Resolves same-bucket exclusive movement/object claims without using the side
 * label or input order as a tie-break. Different resources remain independent.
 */
export function resolveBattleTemporalExclusiveClaims(
  claims: BattleTemporalExclusiveClaim[],
): BattleTemporalExclusiveOutcome[] {
  const claimantsByResource = new Map<string, Set<BattleTemporalSide>>();
  for (const claim of claims) {
    const claimants = claimantsByResource.get(claim.resourceId) ?? new Set();
    claimants.add(claim.side);
    claimantsByResource.set(claim.resourceId, claimants);
  }
  return claims.map((claim) => ({
    ...claim,
    outcome: claimantsByResource.get(claim.resourceId)!.size > 1
      ? "contested"
      : "committed",
  }));
}
