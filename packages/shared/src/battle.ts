import { z } from "zod";
import { NarrativeBlockSchema } from "./narrative.js";
import { ParamKeySchema, ParametersSchema } from "./character.js";

export const BattleStatusSchema = z.enum([
  "active",
  "finished",
]);
export type BattleStatus = z.infer<typeof BattleStatusSchema>;

export const FinishReasonSchema = z.enum([
  "incapacitated",
  "turn_limit",
  "forfeit",
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const ActionKindSchema = z.enum([
  "skill",
  "defend",
  "wait",
]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const BattleActionSchema = z.object({
  actorSide: z.enum(["a", "b"]),
  kind: ActionKindSchema,
  skillId: z.string().optional(),
});
export type BattleAction = z.infer<typeof BattleActionSchema>;

/** Engine-internal combatant (hidden). */
export const CombatantStateSchema = z.object({
  characterId: z.string(),
  displayName: z.string(),
  parameters: ParametersSchema,
  defending: z.boolean().default(false),
  canFight: z.boolean().default(true),
  irreversibleIncapacitated: z.boolean().default(false),
});
export type CombatantState = z.infer<typeof CombatantStateSchema>;

export const SituationSchema = z.object({
  scene: z.string(),
  notes: z.string().default(""),
  /** Multipliers keyed by param or "damage" — clamped by engine. */
  coefficients: z.record(z.string(), z.number()).default({}),
});
export type Situation = z.infer<typeof SituationSchema>;

export const TurnEventSchema = z.object({
  type: z.enum([
    "damage",
    "heal",
    "defend",
    "wait",
    "status",
    "situation",
    "info",
  ]),
  actorName: z.string().optional(),
  targetName: z.string().optional(),
  skillName: z.string().optional(),
  /** Abstract magnitude label for narration, not raw stats. */
  intensity: z.enum(["minor", "moderate", "heavy", "critical"]).optional(),
  summary: z.string(),
});
export type TurnEvent = z.infer<typeof TurnEventSchema>;

export const BattleStateSchema = z.object({
  id: z.string(),
  status: BattleStatusSchema,
  turn: z.number().int().nonnegative(),
  turnLimit: z.number().int().positive(),
  sideA: CombatantStateSchema,
  sideB: CombatantStateSchema,
  situation: SituationSchema,
  log: z.array(NarrativeBlockSchema).default([]),
  winnerSide: z.enum(["a", "b", "draw"]).nullable().default(null),
  finishReason: FinishReasonSchema.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BattleState = z.infer<typeof BattleStateSchema>;

/** Public battle view — no parameter numbers. */
export const BattlePublicSchema = z.object({
  id: z.string(),
  status: BattleStatusSchema,
  turn: z.number(),
  turnLimit: z.number(),
  sideA: z.object({
    characterId: z.string(),
    displayName: z.string(),
    canFight: z.boolean(),
  }),
  sideB: z.object({
    characterId: z.string(),
    displayName: z.string(),
    canFight: z.boolean(),
  }),
  scene: z.string(),
  situationNotes: z.string(),
  log: z.array(NarrativeBlockSchema),
  availableActions: z.array(
    z.object({
      kind: ActionKindSchema,
      skillId: z.string().optional(),
      label: z.string(),
    }),
  ),
  winnerSide: z.enum(["a", "b", "draw"]).nullable(),
  finishReason: FinishReasonSchema.nullable(),
  resultSummary: z.string().nullable().optional(),
});
export type BattlePublic = z.infer<typeof BattlePublicSchema>;

export const COEFFICIENT_MIN = 0.25;
export const COEFFICIENT_MAX = 2.5;

export function clampCoefficient(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(COEFFICIENT_MAX, Math.max(COEFFICIENT_MIN, value));
}

export function isCombatantDown(c: CombatantState): boolean {
  if (c.irreversibleIncapacitated) return true;
  if (!c.canFight) return true;
  const hp = c.parameters.hp ?? 0;
  return hp <= 0;
}

export { ParamKeySchema };
