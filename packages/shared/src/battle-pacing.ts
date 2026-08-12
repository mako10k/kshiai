import { z } from "zod";

export const BattlePacingPolicySchema = z.object({
  schemaVersion: z.literal(1),
  policyId: z.string().min(1),
  turnLimit: z.number().int().positive(),
  finisherUnlockTurn: z.number().int().positive(),
  decisivePressureStartTurn: z.number().int().nonnegative(),
  decisivePressureMaximumTurn: z.number().int().positive(),
  warningTurnsBeforeLimit: z.number().int().nonnegative(),
  automaticRestoration: z.enum([
    "legacy_twenty_percent",
    "explicit_effects_only",
  ]),
  terminalAdjudication: z.literal("deterministic_engine"),
}).strict().superRefine((policy, context) => {
  if (policy.finisherUnlockTurn > policy.turnLimit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["finisherUnlockTurn"],
      message: "finisher unlock must not be after the turn limit",
    });
  }
  if (policy.decisivePressureMaximumTurn < policy.decisivePressureStartTurn) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decisivePressureMaximumTurn"],
      message: "decisive pressure maximum must not be before its start",
    });
  }
  if (policy.decisivePressureMaximumTurn > policy.turnLimit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decisivePressureMaximumTurn"],
      message: "decisive pressure maximum must not be after the turn limit",
    });
  }
});

export type BattlePacingPolicy = z.infer<typeof BattlePacingPolicySchema>;

/** Preserve the deployed 20-turn engine curve while making it explicit. */
export function currentBattlePacingPolicy(turnLimit: number): BattlePacingPolicy {
  const safeLimit = Math.max(1, turnLimit);
  const pressureStartTurn = Math.min(10, safeLimit);
  return BattlePacingPolicySchema.parse({
    schemaVersion: 1,
    policyId: `pacing-current-v1-${safeLimit}`,
    turnLimit: safeLimit,
    finisherUnlockTurn: Math.min(10, safeLimit),
    decisivePressureStartTurn: pressureStartTurn,
    decisivePressureMaximumTurn: Math.max(
      pressureStartTurn,
      Math.min(20, safeLimit),
    ),
    warningTurnsBeforeLimit: 1,
    automaticRestoration: "legacy_twenty_percent",
    terminalAdjudication: "deterministic_engine",
  });
}

/** Local-only candidate. Adoption requires an explicit owner decision. */
export const LOCAL_TWELVE_TURN_PACING_CANDIDATE =
  BattlePacingPolicySchema.parse({
    schemaVersion: 1,
    policyId: "pacing-local-12-v1",
    turnLimit: 12,
    finisherUnlockTurn: 6,
    decisivePressureStartTurn: 6,
    decisivePressureMaximumTurn: 12,
    warningTurnsBeforeLimit: 1,
    automaticRestoration: "explicit_effects_only",
    terminalAdjudication: "deterministic_engine",
  });

export function battlePacingPolicyForState(input: {
  turnLimit: number;
  pacingPolicy?: BattlePacingPolicy;
}): BattlePacingPolicy {
  return input.pacingPolicy ?? currentBattlePacingPolicy(input.turnLimit);
}
