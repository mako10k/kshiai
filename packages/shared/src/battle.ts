import { z } from "zod";
import { NarrativeBlockSchema } from "./narrative.js";
import { ParamKeySchema, ParametersSchema } from "./character.js";
import {
  BattlefieldInstancePublicSchema,
  BattlefieldInstanceSchema,
} from "./battlefield.js";

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

/**
 * @deprecated Fixed stances replaced by LLM case policies.
 * Kept for parsing older battle JSON.
 */
export const BattleStanceSchema = z.enum([
  "aggressive",
  "balanced",
  "defensive",
  "opportunistic",
]);
export type BattleStance = z.infer<typeof BattleStanceSchema>;

/** Engine bias for automatic action selection. */
export const PolicyBiasSchema = z.enum([
  "attack",
  "defend",
  "support",
  "wait",
  "mixed",
]);
export type PolicyBias = z.infer<typeof PolicyBiasSchema>;

/**
 * Situation triggers for matching a policy rule at turn time.
 * Ratios are 0–1 (of max HP). Undefined = no constraint.
 */
export const PolicyTriggersSchema = z.object({
  /** True only on early turns (1–3). */
  earlyTurn: z.boolean().optional(),
  /** True only after turn >= mid (4+). */
  lateTurn: z.boolean().optional(),
  myHpBelow: z.number().min(0).max(1).optional(),
  myHpAbove: z.number().min(0).max(1).optional(),
  foeHpBelow: z.number().min(0).max(1).optional(),
  foeHpAbove: z.number().min(0).max(1).optional(),
  /** Always consider this rule as a soft default fallback. */
  always: z.boolean().optional(),
});
export type PolicyTriggers = z.infer<typeof PolicyTriggersSchema>;

/**
 * Case-based battle directive generated from character + field.
 * User multi-selects several; each answers "in this case, do this".
 */
export const BattlePolicyOptionSchema = z.object({
  id: z.string(),
  /** Short card title. */
  title: z.string(),
  /** When this case applies (user-facing). */
  when: z.string(),
  /** What approach to take (user-facing). */
  then: z.string(),
  /** Engine action bias when this rule wins. */
  bias: PolicyBiasSchema.default("mixed"),
  /** Higher priority wins among matching rules. */
  priority: z.number().int().default(0),
  triggers: PolicyTriggersSchema.default({}),
  /** Suggested default selection from LLM / heuristics. */
  defaultSelected: z.boolean().default(false),
});
export type BattlePolicyOption = z.infer<typeof BattlePolicyOptionSchema>;

export const BattlePolicyOptionPublicSchema = BattlePolicyOptionSchema.pick({
  id: true,
  title: true,
  when: true,
  then: true,
  defaultSelected: true,
});
export type BattlePolicyOptionPublic = z.infer<
  typeof BattlePolicyOptionPublicSchema
>;

export function toPublicPolicyOption(
  o: BattlePolicyOption,
): BattlePolicyOptionPublic {
  return {
    id: o.id,
    title: o.title,
    when: o.when,
    then: o.then,
    defaultSelected: o.defaultSelected,
  };
}

/** @deprecated */
export const BATTLE_STANCE_OPTIONS: Array<{
  id: BattleStance;
  label: string;
  description: string;
}> = [
  {
    id: "aggressive",
    label: "積極的に攻撃",
    description: "手数が多く、攻めを優先する。",
  },
  {
    id: "balanced",
    label: "攻守の均衡",
    description: "状況に応じて攻撃と守りを切り替える。",
  },
  {
    id: "defensive",
    label: "防御主体でチャンスを狙う",
    description: "守りを固めつつ隙を突く。",
  },
  {
    id: "opportunistic",
    label: "様子を見て隙を突く",
    description: "序盤様子見、崩れた瞬間に畳みかける。",
  },
];

export function stanceLabel(stance: BattleStance | null | undefined): string {
  if (!stance) return "—";
  return BATTLE_STANCE_OPTIONS.find((o) => o.id === stance)?.label ?? stance;
}

export function summarizeSelectedPolicies(
  options: BattlePolicyOption[] | undefined,
  selectedIds: string[] | undefined,
): string {
  if (!options?.length) return "方針未設定";
  const ids = new Set(selectedIds ?? []);
  const picked = options.filter((o) => ids.has(o.id));
  if (picked.length === 0) return "方針未設定";
  return picked.map((o) => o.title).join(" / ");
}

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
  /** Optional tags carried for narration (terrain/obstacles/conditions). */
  tags: z.array(z.string()).default([]),
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
  /** @deprecated Use policiesA / selectedPolicyIdsA. */
  stanceA: BattleStanceSchema.optional(),
  /** @deprecated Use policiesB / selectedPolicyIdsB. */
  stanceB: BattleStanceSchema.optional(),
  /** Full case-policy catalog for side A (generated at match start). */
  policiesA: z.array(BattlePolicyOptionSchema).default([]),
  selectedPolicyIdsA: z.array(z.string()).default([]),
  policiesB: z.array(BattlePolicyOptionSchema).default([]),
  selectedPolicyIdsB: z.array(z.string()).default([]),
  situation: SituationSchema,
  /** Concrete battlefield fixed at match start. */
  battlefield: BattlefieldInstanceSchema.optional(),
  log: z.array(NarrativeBlockSchema).default([]),
  winnerSide: z.enum(["a", "b", "draw"]).nullable().default(null),
  finishReason: FinishReasonSchema.nullable().default(null),
  /** Elo settlement for this match (may be voided if a character is deleted). */
  ratingSettlement: z
    .object({
      applied: z.boolean(),
      voided: z.boolean(),
      ranked: z.boolean(),
      sideA: z.object({
        characterId: z.string(),
        before: z.number(),
        after: z.number(),
        delta: z.number(),
        provisionalBefore: z.boolean(),
        provisionalAfter: z.boolean(),
        gamesPlayedBefore: z.number(),
      }),
      sideB: z.object({
        characterId: z.string(),
        before: z.number(),
        after: z.number(),
        delta: z.number(),
        provisionalBefore: z.boolean(),
        provisionalAfter: z.boolean(),
        gamesPlayedBefore: z.number(),
      }),
    })
    .optional(),
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
  /** Selected case policies (player), user-facing. */
  policies: z.array(BattlePolicyOptionPublicSchema).default([]),
  policySummary: z.string().default(""),
  /** Opponent policy summary only (details hidden). */
  opponentPolicySummary: z.string().default(""),
  /** @deprecated */
  stanceA: BattleStanceSchema.optional(),
  stanceALabel: z.string().optional(),
  stanceB: BattleStanceSchema.optional(),
  stanceBLabel: z.string().optional(),
  scene: z.string(),
  situationNotes: z.string(),
  battlefield: BattlefieldInstancePublicSchema.nullable().optional(),
  log: z.array(NarrativeBlockSchema),
  /** @deprecated Per-turn choices are automatic; kept empty for compatibility. */
  availableActions: z
    .array(
      z.object({
        kind: ActionKindSchema,
        skillId: z.string().optional(),
        label: z.string(),
      }),
    )
    .default([]),
  winnerSide: z.enum(["a", "b", "draw"]).nullable(),
  finishReason: FinishReasonSchema.nullable(),
  resultSummary: z.string().nullable().optional(),
});
export type BattlePublic = z.infer<typeof BattlePublicSchema>;

/** History list row — narrative-safe, no internal sheets/params. */
export const BattleListItemSchema = z.object({
  id: z.string(),
  status: BattleStatusSchema,
  turn: z.number(),
  turnLimit: z.number(),
  sideAName: z.string(),
  sideBName: z.string(),
  scene: z.string(),
  battlefieldName: z.string().nullable().optional(),
  winnerSide: z.enum(["a", "b", "draw"]).nullable(),
  /** User-facing result label, not engine codes. */
  resultLabel: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canResume: z.boolean(),
});
export type BattleListItem = z.infer<typeof BattleListItemSchema>;

export function battleResultLabel(
  status: BattleStatus,
  winnerSide: "a" | "b" | "draw" | null,
  sideAName: string,
  sideBName: string,
  finishReason?: string | null,
): string | null {
  if (status === "active") return "進行中";
  if (winnerSide === "draw") return "引き分け";
  if (winnerSide === "a") return `${sideAName} の勝利`;
  if (winnerSide === "b") return `${sideBName} の勝利`;
  if (finishReason) return "決着";
  return "終了";
}

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
