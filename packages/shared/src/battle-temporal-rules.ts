import { z } from "zod";

export type BattleTemporalSide = "a" | "b";
export const BattleTemporalSideSchema = z.enum(["a", "b"]);

export const SequentialInitiativeOrderReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  initiativeScores: z.object({
    a: z.number().int(),
    b: z.number().int(),
  }).strict(),
  order: z.tuple([BattleTemporalSideSchema, BattleTemporalSideSchema]),
  reason: z.enum([
    "higher_initiative",
    "previous_order",
    "weighted_redraw",
    "fair_redraw",
  ]),
  draw: z.object({
    sample: z.number().min(0).lt(1),
    weights: z.object({
      a: z.number().nonnegative(),
      b: z.number().nonnegative(),
    }).strict(),
    probabilityAFirst: z.number().min(0).max(1),
  }).strict().nullable(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.order[0] === receipt.order[1]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["order"],
      message: "initiative order must contain both sides",
    });
  }
  const redraw = receipt.reason === "weighted_redraw" ||
    receipt.reason === "fair_redraw";
  if (redraw !== (receipt.draw !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["draw"],
      message: "draw details must exist only for a redraw",
    });
  }
});
export type SequentialInitiativeOrderReceipt = z.infer<
  typeof SequentialInitiativeOrderReceiptSchema
>;

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

export const SEQUENTIAL_BATTLE_TEMPORAL_RULESET = Object.freeze({
  id: "initiative-sequential-v2",
  ordinaryActionCommit: "sequential",
  equalInitiative: "previous_order_then_persisted_redraw",
  lowerBucketRevalidation: "required",
  incapacitatedBeforeBucket: "skip",
} as const);

export const BattleTemporalBucketSchema = z.object({
  index: z.number().int().nonnegative(),
  actorSides: z.array(BattleTemporalSideSchema).min(1).max(2),
  initiativeScore: z.number().int(),
  simultaneous: z.boolean(),
  readsFrom: z.enum(["turn_start", "previous_bucket_commit"]),
  commitMode: z.enum(["atomic", "sequential"]),
}).strict();
export type BattleTemporalBucket = z.infer<typeof BattleTemporalBucketSchema>;

export const LegacyBattleTemporalPlanSchema = z.object({
  rulesetId: z.literal(BATTLE_TEMPORAL_RULESET.id),
  initiativeScores: z.object({
    a: z.number().int(),
    b: z.number().int(),
  }).strict(),
  buckets: z.array(BattleTemporalBucketSchema).min(1).max(2),
}).strict();
export const SequentialBattleTemporalPlanSchema = z.object({
  rulesetId: z.literal(SEQUENTIAL_BATTLE_TEMPORAL_RULESET.id),
  initiativeScores: z.object({
    a: z.number().int(),
    b: z.number().int(),
  }).strict(),
  initiativeOrder: SequentialInitiativeOrderReceiptSchema,
  buckets: z.tuple([BattleTemporalBucketSchema, BattleTemporalBucketSchema]),
}).strict().superRefine((plan, ctx) => {
  const plannedOrder = plan.buckets.flatMap((bucket) => bucket.actorSides);
  if (
    plannedOrder.length !== 2 ||
    plannedOrder.some((side, index) => side !== plan.initiativeOrder.order[index])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["buckets"],
      message: "sequential buckets must match the initiative order",
    });
  }
  if (plan.buckets.some((bucket) => bucket.simultaneous || bucket.commitMode !== "sequential")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["buckets"],
      message: "ordinary v2 buckets must be sequential",
    });
  }
});
export const BattleTemporalPlanSchema = z.union([
  LegacyBattleTemporalPlanSchema,
  SequentialBattleTemporalPlanSchema,
]);
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
 * Selects the ADR-0001 ordinary-action order. Randomness is injected once by
 * the caller so the returned receipt can be persisted before any action call.
 */
export function selectSequentialInitiativeOrder(input: {
  effectiveSpeedA: number;
  effectiveSpeedB: number;
  previousOrder?: [BattleTemporalSide, BattleTemporalSide] | null;
  redrawWeights?: { a: number; b: number } | null;
  drawSample?: number;
}): SequentialInitiativeOrderReceipt {
  const initiativeScores = {
    a: normalizeInitiativeScore(input.effectiveSpeedA),
    b: normalizeInitiativeScore(input.effectiveSpeedB),
  };
  if (initiativeScores.a !== initiativeScores.b) {
    const first = initiativeScores.a > initiativeScores.b ? "a" : "b";
    return SequentialInitiativeOrderReceiptSchema.parse({
      schemaVersion: 1,
      initiativeScores,
      order: [first, first === "a" ? "b" : "a"],
      reason: "higher_initiative",
      draw: null,
    });
  }

  if (input.previousOrder) {
    return SequentialInitiativeOrderReceiptSchema.parse({
      schemaVersion: 1,
      initiativeScores,
      order: input.previousOrder,
      reason: "previous_order",
      draw: null,
    });
  }

  if (input.drawSample === undefined) {
    throw new Error("equal initiative without previous order requires one draw sample");
  }
  const suppliedWeights = input.redrawWeights;
  const weighted = suppliedWeights !== null && suppliedWeights !== undefined &&
    Number.isFinite(suppliedWeights.a) && Number.isFinite(suppliedWeights.b) &&
    suppliedWeights.a >= 0 && suppliedWeights.b >= 0 &&
    suppliedWeights.a + suppliedWeights.b > 0;
  const weights = weighted ? suppliedWeights : { a: 1, b: 1 };
  const probabilityAFirst = weights.a / (weights.a + weights.b);
  const first = input.drawSample < probabilityAFirst ? "a" : "b";
  return SequentialInitiativeOrderReceiptSchema.parse({
    schemaVersion: 1,
    initiativeScores,
    order: [first, first === "a" ? "b" : "a"],
    reason: weighted ? "weighted_redraw" : "fair_redraw",
    draw: {
      sample: input.drawSample,
      weights,
      probabilityAFirst,
    },
  });
}

export function buildSequentialBattleTemporalPlan(
  initiativeOrder: SequentialInitiativeOrderReceipt,
): BattleTemporalPlan {
  const receipt = SequentialInitiativeOrderReceiptSchema.parse(initiativeOrder);
  const [first, later] = receipt.order;
  return SequentialBattleTemporalPlanSchema.parse({
    rulesetId: SEQUENTIAL_BATTLE_TEMPORAL_RULESET.id,
    initiativeScores: receipt.initiativeScores,
    initiativeOrder: receipt,
    buckets: [
      {
        index: 0,
        actorSides: [first],
        initiativeScore: receipt.initiativeScores[first],
        simultaneous: false,
        readsFrom: "turn_start",
        commitMode: "sequential",
      },
      {
        index: 1,
        actorSides: [later],
        initiativeScore: receipt.initiativeScores[later],
        simultaneous: false,
        readsFrom: "previous_bucket_commit",
        commitMode: "sequential",
      },
    ],
  });
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
    return LegacyBattleTemporalPlanSchema.parse({
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
  return LegacyBattleTemporalPlanSchema.parse({
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
