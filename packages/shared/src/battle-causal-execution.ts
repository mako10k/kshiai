import { z } from "zod";
import {
  BattleTemporalPlanSchema,
  BattleTemporalSideSchema,
} from "./battle-temporal-rules.js";

/**
 * Durable orchestration state for the Issue #98 causal turn path.
 *
 * This is deliberately independent from mechanics. The engine remains the
 * only component that can commit a bucket; this state machine only makes the
 * next permitted decision/commit boundary explicit and restartable.
 */
export const CausalTurnExecutionStatusSchema = z.enum([
  "awaiting_decision",
  "awaiting_bucket_commit",
  "awaiting_finalize",
  "finished",
]);
export type CausalTurnExecutionStatus = z.infer<
  typeof CausalTurnExecutionStatusSchema
>;

export const CausalTurnExecutionSchema = z.object({
  schemaVersion: z.literal(1),
  executionId: z.string().min(1).max(160),
  battleId: z.string().min(1).max(160),
  turn: z.number().int().positive(),
  /** Battle-state revision captured before the first decision. */
  expectedStateRevision: z.number().int().nonnegative(),
  temporalPlan: BattleTemporalPlanSchema,
  /** Bucket currently awaiting a decision or commit. */
  bucketIndex: z.number().int().nonnegative(),
  status: CausalTurnExecutionStatusSchema,
  /** Actor sides whose decision was durably accepted for the current bucket. */
  decidedSides: z.array(BattleTemporalSideSchema).max(2),
  /** Buckets that the engine durably committed. */
  committedBucketIndices: z.array(z.number().int().nonnegative()).max(2),
}).strict().superRefine((execution, ctx) => {
  const bucket = execution.temporalPlan.buckets[execution.bucketIndex];
  if (
    execution.status === "awaiting_finalize" ||
    execution.status === "finished"
  ) {
    if (execution.bucketIndex !== execution.temporalPlan.buckets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bucketIndex"],
        message: "terminal execution must be past the final bucket",
      });
    }
    if (execution.committedBucketIndices.length !== execution.temporalPlan.buckets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["committedBucketIndices"],
        message: "terminal execution must commit every temporal bucket",
      });
    }
    return;
  }
  if (!bucket) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bucketIndex"],
      message: "active execution must reference a temporal bucket",
    });
    return;
  }
  const expected = new Set(bucket.actorSides);
  if (execution.decidedSides.some((side) => !expected.has(side))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decidedSides"],
      message: "decision side is not in the active bucket",
    });
  }
  if (
    execution.status === "awaiting_bucket_commit" &&
    (execution.decidedSides.length !== expected.size ||
      execution.decidedSides.some((side) => !expected.has(side)))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decidedSides"],
      message: "bucket commit requires every active-bucket decision",
    });
  }
}).transform((execution) => ({
  ...execution,
  decidedSides: [...new Set(execution.decidedSides)].sort(),
  committedBucketIndices: [...new Set(execution.committedBucketIndices)].sort(
    (a, b) => a - b,
  ),
}));
export type CausalTurnExecution = z.infer<typeof CausalTurnExecutionSchema>;

export function createCausalTurnExecution(input: {
  executionId: string;
  battleId: string;
  turn: number;
  expectedStateRevision: number;
  temporalPlan: z.input<typeof BattleTemporalPlanSchema>;
}): CausalTurnExecution {
  return CausalTurnExecutionSchema.parse({
    schemaVersion: 1,
    executionId: input.executionId,
    battleId: input.battleId,
    turn: input.turn,
    expectedStateRevision: input.expectedStateRevision,
    temporalPlan: input.temporalPlan,
    bucketIndex: 0,
    status: "awaiting_decision",
    decidedSides: [],
    committedBucketIndices: [],
  });
}

export function causalExecutionDecisionSides(
  execution: CausalTurnExecution,
): Array<"a" | "b"> {
  if (execution.status !== "awaiting_decision") return [];
  return [...(execution.temporalPlan.buckets[execution.bucketIndex]?.actorSides ?? [])];
}

/** Accepts only decisions for the active bucket; duplicate retries are stable. */
export function acceptCausalExecutionDecision(input: {
  execution: CausalTurnExecution;
  side: "a" | "b";
}): CausalTurnExecution {
  const execution = CausalTurnExecutionSchema.parse(input.execution);
  if (execution.status !== "awaiting_decision") {
    throw new Error("causal execution is not awaiting a decision");
  }
  const expectedSides = causalExecutionDecisionSides(execution);
  if (!expectedSides.includes(input.side)) {
    throw new Error("decision side is not in the active bucket");
  }
  const decidedSides = [...new Set([...execution.decidedSides, input.side])].sort();
  return CausalTurnExecutionSchema.parse({
    ...execution,
    decidedSides,
    status: decidedSides.length === expectedSides.length
      ? "awaiting_bucket_commit"
      : "awaiting_decision",
  });
}

/** Advances only after the engine has durably committed the active bucket. */
export function commitCausalExecutionBucket(
  input: { execution: CausalTurnExecution },
): CausalTurnExecution {
  const execution = CausalTurnExecutionSchema.parse(input.execution);
  if (execution.status !== "awaiting_bucket_commit") {
    throw new Error("causal execution is not awaiting a bucket commit");
  }
  const committedBucketIndices = [
    ...execution.committedBucketIndices,
    execution.bucketIndex,
  ];
  const nextBucketIndex = execution.bucketIndex + 1;
  if (nextBucketIndex >= execution.temporalPlan.buckets.length) {
    return CausalTurnExecutionSchema.parse({
      ...execution,
      bucketIndex: nextBucketIndex,
      status: "awaiting_finalize",
      decidedSides: [],
      committedBucketIndices,
    });
  }
  return CausalTurnExecutionSchema.parse({
    ...execution,
    bucketIndex: nextBucketIndex,
    status: "awaiting_decision",
    decidedSides: [],
    committedBucketIndices,
  });
}

export function finishCausalTurnExecution(
  input: { execution: CausalTurnExecution },
): CausalTurnExecution {
  const execution = CausalTurnExecutionSchema.parse(input.execution);
  if (execution.status !== "awaiting_finalize") {
    throw new Error("causal execution is not awaiting finalization");
  }
  return CausalTurnExecutionSchema.parse({
    ...execution,
    status: "finished",
  });
}
