// R: Freeze action effort and bounded adjudication penalties for newly created combatants.
import { z } from "zod";

export const ActionEffortPolicyV1Schema = z.object({
  contractVersion: z.literal("battle-action-effort-v1"),
  skillCooldown: z.literal("none"),
  repeatedActionStamina: z.object({ secondAndThird: z.literal(2), fourthAndLater: z.literal(4) }).strict(),
  freeActionPenalty: z.object({
    extraStamina: z.object({ light: z.literal(2), substantial: z.literal(4), extreme: z.literal(8) }).strict(),
    defenseReduction: z.object({ light: z.literal(0.1), substantial: z.literal(0.2), extreme: z.literal(0.3) }).strict(),
    defenseLifetime: z.literal("next_incoming_attack"),
  }).strict(),
}).strict();
export type ActionEffortPolicyV1 = z.infer<typeof ActionEffortPolicyV1Schema>;

export const CurrentActionEffortPolicyV1: ActionEffortPolicyV1 = ActionEffortPolicyV1Schema.parse({
  contractVersion: "battle-action-effort-v1", skillCooldown: "none",
  repeatedActionStamina: { secondAndThird: 2, fourthAndLater: 4 },
  freeActionPenalty: {
    extraStamina: { light: 2, substantial: 4, extreme: 8 },
    defenseReduction: { light: 0.1, substantial: 0.2, extreme: 0.3 },
    defenseLifetime: "next_incoming_attack",
  },
});

/** Missing policy means a historical battle, including its original free-action fatigue. */
export function repeatedActionStaminaCost(input: {
  kind: string;
  repeatCount: number;
  policy: ActionEffortPolicyV1 | undefined;
}): number {
  if (input.repeatCount < 2) return 0;
  const kinds = input.policy ? ["basic_attack", "skill", "reflect"] : ["basic_attack", "skill", "reflect", "free_action"];
  if (!kinds.includes(input.kind)) return 0;
  if (!input.policy) return input.repeatCount >= 4 ? 4 : 2;
  return input.repeatCount >= 4 ? input.policy.repeatedActionStamina.fourthAndLater
    : input.policy.repeatedActionStamina.secondAndThird;
}

const penaltyFields = {
  baseWorldRevision: z.number().int().nonnegative(),
  level: z.enum(["light", "substantial", "extreme"]),
  reason: z.string().trim().min(1).max(240),
  /** Exact description quote establishes which attempted bodily action was judged. */
  actionQuote: z.string().trim().min(1).max(400),
};
export const FreeActionPenaltyProposalV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("extra_stamina"), ...penaltyFields }).strict(),
  z.object({ kind: z.literal("defense_exposure"), ...penaltyFields }).strict(),
  z.object({ kind: z.literal("execution_limit"), ...penaltyFields,
    execution: z.enum(["partial", "not_executed"]),
    executedDescription: z.string().trim().max(400),
    appliedChangeIndexes: z.array(z.number().int().min(0).max(7)).max(8),
  }).strict(),
]);
export type FreeActionPenaltyProposalV1 = z.infer<typeof FreeActionPenaltyProposalV1Schema>;
export const AppliedFreeActionPenaltyV1Schema = z.object({
  contractVersion: z.literal("battle-action-effort-v1"),
  actionId: z.string().min(1),
  actorSide: z.enum(["a", "b"]),
  proposal: FreeActionPenaltyProposalV1Schema,
  requestedStamina: z.number().int().min(0).max(8),
  paidStamina: z.number().min(0).max(8),
  unpaidStamina: z.number().min(0).max(8),
  defenseReduction: z.union([z.literal(0), z.literal(0.1), z.literal(0.2), z.literal(0.3)]),
}).strict();
export type AppliedFreeActionPenaltyV1 = z.infer<typeof AppliedFreeActionPenaltyV1Schema>;
export const PendingDefenseExposureV1Schema = z.object({
  actionId: z.string().min(1), reduction: z.union([z.literal(0.1), z.literal(0.2), z.literal(0.3)]),
  reason: z.string().trim().min(1).max(240),
}).strict();

export const SelfActionEffortPerceptionV1Schema = z.object({
  contractVersion: z.literal("battle-action-effort-v1"),
  fatigue: z.string().min(1).max(120),
  repeatingEffort: z.string().min(1).max(120),
  freeActionRisk: z.string().min(1).max(160),
  latestPenalty: z.string().max(800).nullable(),
}).strict();
export type SelfActionEffortPerceptionV1 = z.infer<typeof SelfActionEffortPerceptionV1Schema>;
