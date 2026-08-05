import { z } from "zod";
import { NarrativeBlockSchema } from "./narrative.js";
import { ParamKeySchema, ParametersSchema } from "./character.js";
import {
  BattlefieldInstancePublicSchema,
  BattlefieldInstanceSchema,
} from "./battlefield.js";
import { NarrationStyleSnapshotSchema } from "./narration-style.js";
import {
  BattleSemanticStateSchema,
  SemanticObservationStateSchema,
  TurnSemanticPatchSchema,
} from "./semantic-state.js";
import {
  BattleWorldStateSchema,
  BattleWorldTransitionSchema,
} from "./battle-world.js";
import { DramaStateSchema } from "./drama.js";
import {
  CharacterPerceptionFrameASchema,
  CharacterPerceptionFrameBSchema,
  ObserverContactRegistryASchema,
  ObserverContactRegistryBSchema,
} from "./perception.js";
import { BattleTemporalPlanSchema } from "./battle-temporal-rules.js";

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
  "basic_attack",
  "rest",
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
 * HP ratio 0–1. LLMs often emit 40/55 as percent — coerce those into 0.4/0.55.
 */
const HpRatioSchema = z.preprocess((raw) => {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  if (n > 1 && n <= 100) return n / 100;
  if (n > 100) return 1;
  if (n < 0) return 0;
  return n;
}, z.number().min(0).max(1).optional());

const IntPrioritySchema = z.preprocess((raw) => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1000, Math.max(-1000, n)));
}, z.number().int());

/**
 * Situation triggers for matching a policy rule at turn time.
 * Ratios are 0–1 (of max HP). Undefined = no constraint.
 */
export const PolicyTriggersSchema = z.object({
  /** True only on early turns (1–3). */
  earlyTurn: z.boolean().optional(),
  /** True only after turn >= mid (4+). */
  lateTurn: z.boolean().optional(),
  myHpBelow: HpRatioSchema,
  myHpAbove: HpRatioSchema,
  foeHpBelow: HpRatioSchema,
  foeHpAbove: HpRatioSchema,
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
  /** Groups two mutually-exclusive choices under one user-facing perspective. */
  perspectiveId: z.string().default("general"),
  perspectiveTitle: z.string().default("全体方針"),
  /** Short card title. */
  title: z.string(),
  /** When this case applies (user-facing). */
  when: z.string(),
  /** What approach to take (user-facing). */
  then: z.string(),
  /** Engine action bias when this rule wins. */
  bias: PolicyBiasSchema.catch("mixed").default("mixed"),
  /** Higher priority wins among matching rules. */
  priority: IntPrioritySchema.default(0),
  triggers: PolicyTriggersSchema.default({}),
  /** Suggested default selection from LLM / heuristics. */
  defaultSelected: z.boolean().default(false),
});
export type BattlePolicyOption = z.infer<typeof BattlePolicyOptionSchema>;

export const BattlePolicyOptionPublicSchema = BattlePolicyOptionSchema.pick({
  id: true,
  perspectiveId: true,
  perspectiveTitle: true,
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
    perspectiveId: o.perspectiveId,
    perspectiveTitle: o.perspectiveTitle,
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
    label: "積極的に働きかける",
    description: "自分から展開を動かすことを優先する。",
  },
  {
    id: "balanced",
    label: "柔軟に対応する",
    description: "状況に応じて働きかけ方を切り替える。",
  },
  {
    id: "defensive",
    label: "慎重に機会を待つ",
    description: "自分の状態を保ちながら好機を待つ。",
  },
  {
    id: "opportunistic",
    label: "変化を見て動く",
    description: "序盤は観察し、状況が変わったら応じる。",
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
  if (!options?.length) return "お任せ";
  const ids = new Set(selectedIds ?? []);
  const picked = options.filter((o) => ids.has(o.id));
  if (picked.length === 0) return "お任せ";
  return picked.map((o) => o.title).join(" / ");
}

/** Keep only the first selected choice for each policy perspective. */
export function selectPolicyIdsByPerspective(
  options: BattlePolicyOption[],
  selectedIds: string[],
): string[] {
  const selected = new Set(selectedIds);
  const seenPerspectives = new Set<string>();
  return options.flatMap((option) => {
    if (!selected.has(option.id)) return [];
    if (seenPerspectives.has(option.perspectiveId)) return [];
    seenPerspectives.add(option.perspectiveId);
    return [option.id];
  });
}

export const CharacterActionIntentSchema = z.object({
  kind: ActionKindSchema,
  skillId: z.string().optional(),
  /** Activate the one-use finisher attached to this skill when legal. */
  useFinisher: z.boolean().optional(),
});
export type CharacterActionIntent = z.infer<typeof CharacterActionIntentSchema>;

export const BattleActionSchema = CharacterActionIntentSchema.extend({
  actorSide: z.enum(["a", "b"]),
});
export type BattleAction = z.infer<typeof BattleActionSchema>;

export const ActionResolutionReasonSchema = z.enum([
  "invalid_intent",
  "actor_unavailable",
  "agency_blocked",
  "movement_blocked",
  "speech_blocked",
  "required_object_unavailable",
  "skill_unavailable",
  "insufficient_resource",
  "finisher_unavailable",
  "target_unavailable",
  "target_unlocalized",
  "out_of_range",
  "line_of_sight_blocked",
]);
export type ActionResolutionReason = z.infer<
  typeof ActionResolutionReasonSchema
>;

export const ActionResolutionSchema = z.object({
  requested: CharacterActionIntentSchema,
  outcome: z.enum(["accepted", "partial", "substituted", "failed"]),
  reason: ActionResolutionReasonSchema.nullable(),
}).strict();
export type ActionResolution = z.infer<typeof ActionResolutionSchema>;

export const ResolvedBattleActionSchema = BattleActionSchema.extend({
  id: z.string().min(1),
  executed: z.boolean(),
  skippedReason: z
    .enum([
      "incapacitated_before_action",
      "battle_inactive",
      "action_infeasible",
    ])
    .nullable()
    .default(null),
  resolution: ActionResolutionSchema.optional(),
});
export type ResolvedBattleAction = z.infer<
  typeof ResolvedBattleActionSchema
>;

/** Stable, one-use finishing technique selected when the battle starts. */
export const FinisherStateSchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  source: z.enum(["explicit", "derived"]),
  used: z.boolean().default(false),
  usedTurn: z.number().int().positive().nullable().default(null),
});
export type FinisherState = z.infer<typeof FinisherStateSchema>;

/** Engine-internal combatant (hidden). */
export const CombatantStateSchema = z.object({
  characterId: z.string(),
  displayName: z.string(),
  /** Portrait URL snapshot for records / UI (no combat params). */
  imageUrl: z.string().nullable().optional(),
  parameters: ParametersSchema,
  /** Original sheet values; every live parameter gradually returns here. */
  baseParameters: ParametersSchema.optional(),
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
  id: z.string().min(1).optional(),
  type: z.enum([
    "damage",
    "heal",
    "rest",
    "parameter",
    "defend",
    "wait",
    "status",
    "situation",
    "info",
    "utterance",
  ]),
  actorName: z.string().optional(),
  actorSide: z.enum(["a", "b"]).optional(),
  targetName: z.string().optional(),
  targetSides: z.array(z.enum(["a", "b"])).max(2).optional(),
  sourceActionId: z.string().min(1).optional(),
  skillName: z.string().optional(),
  /** Structured mechanical attribution; never infer these fields from summary. */
  parameterKey: ParamKeySchema.optional(),
  parameterDirection: z.enum(["loss", "gain"]).optional(),
  /** Abstract magnitude label for narration, not raw stats. */
  intensity: z.enum(["minor", "moderate", "heavy", "critical"]).optional(),
  /** Character-authored expression committed before any public rendering. */
  utterance: z.object({
    text: z.string().min(1).max(400),
    delivery: z.enum(["spoken", "visible_reaction"]),
    volume: z.enum(["quiet", "normal", "loud"]),
    articulation: z.enum(["clear", "impaired"]),
    language: z.string().min(1).max(40),
  }).strict().optional(),
  summary: z.string(),
}).superRefine((event, ctx) => {
  if (event.type === "utterance") {
    if (!event.id || !event.actorSide || !event.utterance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["utterance"],
        message: "utterance events require id, actorSide, and utterance payload",
      });
    }
  } else if (event.utterance !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["utterance"],
      message: "only utterance events may carry an utterance payload",
    });
  }
});
export type TurnEvent = z.infer<typeof TurnEventSchema>;

/** Qualitative condition visible to one character after engine resolution. */
export const PerceivedConditionSchema = z.enum([
  "steady",
  "strained",
  "critical",
  "incapacitated",
]);
export type PerceivedCondition = z.infer<typeof PerceivedConditionSchema>;

/** Engine-authored observation injected into one isolated character agent. */
export const CharacterCognitionSchema = z.object({
  turn: z.number().int().nonnegative(),
  scene: z.string(),
  ownCondition: PerceivedConditionSchema,
  foeCondition: PerceivedConditionSchema,
  parameterChanges: z.record(ParamKeySchema, z.number()).default({}),
  observedEvents: z.array(TurnEventSchema).default([]),
});
export type CharacterCognition = z.infer<typeof CharacterCognitionSchema>;

/**
 * Compact private continuity for a character agent. It stores conclusions and
 * disposition, not a model's step-by-step reasoning.
 */
export const CharacterAgentStateSchema = z.object({
  privateMemory: z.string().max(1200).default(""),
  currentGoal: z.string().max(240).default(""),
  emotion: z.string().max(120).default("平静"),
  beliefs: z.array(z.string().max(240)).max(8).default([]),
  observations: z.array(z.string().max(240)).max(8).default([]),
  speechStyle: z.string().max(240).default(""),
  selfReference: z.string().max(40).nullable().default(null),
  lastSpeech: z.string().max(400).nullable().default(null),
});
export type CharacterAgentState = z.infer<typeof CharacterAgentStateSchema>;

export const CombatantStateChangeSchema = z.object({
  parameterChanges: z.record(ParamKeySchema, z.number()).default({}),
  defendingBefore: z.boolean(),
  defendingAfter: z.boolean(),
  canFightBefore: z.boolean(),
  canFightAfter: z.boolean(),
});

export const CharacterAgentStateChangeSchema = z.object({
  goalBefore: z.string(),
  goalAfter: z.string(),
  emotionBefore: z.string(),
  emotionAfter: z.string(),
  beliefsAdded: z.array(z.string()).default([]),
  beliefsRemoved: z.array(z.string()).default([]),
  observationsAdded: z.array(z.string()).default([]),
  speechStyleBefore: z.string(),
  speechStyleAfter: z.string(),
  selfReferenceBefore: z.string().nullable(),
  selfReferenceAfter: z.string().nullable(),
  lastSpeech: z.string().nullable(),
});
export type CharacterAgentStateChange = z.infer<
  typeof CharacterAgentStateChangeSchema
>;

export const BattleTurnWorldImpactSchema = z.object({
  status: z.enum(["applied", "rejected", "skipped"]),
  operationKinds: z.array(z.enum([
    "add_area",
    "add_entity",
    "set_entity_active",
    "set_placement",
    "set_exposure",
    "set_actor_state",
    "set_object_state",
    "set_area_state",
    "set_pair_relation",
    "remove_pair_relation",
  ])).max(24),
}).strict();
export type BattleTurnWorldImpact = z.infer<
  typeof BattleTurnWorldImpactSchema
>;

export const BattleAdjudicationReasonFactSchema = z.object({
  factor: z.enum([
    "committed_actions",
    "mechanical_effects",
    "remaining_capacity",
    "world_impact",
    "overall_effectiveness",
  ]),
  favoredSide: z.enum(["a", "b", "draw"]),
  statement: z.string().min(1).max(240),
}).strict();
export type BattleAdjudicationReasonFact = z.infer<
  typeof BattleAdjudicationReasonFactSchema
>;

/** Immutable raw turn-limit result decided before presentation narration. */
export const BattleAdjudicationSchema = z.object({
  schemaVersion: z.literal(1),
  turn: z.number().int().positive(),
  winnerSide: z.enum(["a", "b", "draw"]),
  reason: z.string().min(1).max(600),
  reasonFacts: z.array(BattleAdjudicationReasonFactSchema).min(1).max(6),
  source: z.enum(["semantic_adjudicator", "deterministic_fallback"]),
  engineFallbackSide: z.enum(["a", "b", "draw"]),
  inputTurnRange: z.object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type BattleAdjudication = z.infer<typeof BattleAdjudicationSchema>;

/** Persisted engine facts for audit and agent cognition reconstruction. */
export const BattleTurnRecordSchema = z.object({
  turn: z.number().int().nonnegative(),
  temporalResolution: BattleTemporalPlanSchema.optional(),
  worldImpact: BattleTurnWorldImpactSchema.optional(),
  actions: z.array(ResolvedBattleActionSchema).default([]),
  events: z.array(TurnEventSchema).default([]),
  sideAChange: CombatantStateChangeSchema,
  sideBChange: CombatantStateChangeSchema,
  cognitionA: CharacterCognitionSchema,
  cognitionB: CharacterCognitionSchema,
});
export type BattleTurnRecord = z.infer<typeof BattleTurnRecordSchema>;

/** Monotony tracker for environmental happenings (supervisor). */
export const SupervisorStateSchema = z.object({
  quietTurns: z.number().int().nonnegative().default(0),
  /** Consecutive turns without a character-driven damage/heal exchange. */
  passiveTurns: z.number().int().nonnegative().default(0),
  turnsSinceHappening: z.number().int().nonnegative().default(0),
  lastHpA: z.number().nullable().default(null),
  lastHpB: z.number().nullable().default(null),
  happenings: z.number().int().nonnegative().default(0),
  recentHappenings: z.array(z.object({
    title: z.string(),
    summary: z.string(),
  })).default([]),
});
export type SupervisorState = z.infer<typeof SupervisorStateSchema>;

export const BattleStateSchema = z.object({
  id: z.string(),
  /** Present after narrator/speech/perception authority migration. */
  pipelineAuthorityVersion: z.literal(1).optional(),
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
  /**
   * Battle supervisor: injects environmental happenings when the fight stalls.
   * Optional for older saved battles.
   */
  supervisor: SupervisorStateSchema.optional(),
  /** Bounded continuity for variety and pacing; never stores full prose history. */
  dramaState: DramaStateSchema.optional(),
  /**
   * Before first combat turn: opening monologue / rivalry prologue.
   * New battles start true; older saves without the field default false.
   */
  prologuePending: z.boolean().optional().default(false),
  /**
   * After incapacity KO: stay active for one extra "aftermath" beat
   * (what becomes of the fallen / winner's closing moment) before finish.
   */
  aftermathPending: z.boolean().optional().default(false),
  /** Narration voice for this match (frozen at start). */
  narrationStyle: NarrationStyleSnapshotSchema.optional(),
  /**
   * Prior finished matchup summary between these two characters (if any),
   * used for prologue rivalry / 因縁.
   */
  priorMatchSummary: z.string().nullable().optional(),
  /** Isolated, private character-agent continuity. Never exposed publicly. */
  agentStateA: CharacterAgentStateSchema.optional(),
  agentStateB: CharacterAgentStateSchema.optional(),
  /** Stable one-use finishers; missing legacy values are derived by the engine. */
  finisherA: FinisherStateSchema.optional(),
  finisherB: FinisherStateSchema.optional(),
  /** Character-authored intent for the next turn; consumed once by the engine. */
  plannedActionA: CharacterActionIntentSchema.optional(),
  plannedActionB: CharacterActionIntentSchema.optional(),
  /** Structured engine transitions; narrative log is presentation only. */
  turnRecords: z.array(BattleTurnRecordSchema).default([]),
  /** Mutable observable world overlay; optional while legacy battles exist. */
  semanticState: BattleSemanticStateSchema.optional(),
  /** Server-owned coarse mechanical world; never exposed without projection. */
  worldState: BattleWorldStateSchema.optional(),
  /** Latest side-specific observation only; never copied into turn history. */
  observationStateA: SemanticObservationStateSchema.optional(),
  observationStateB: SemanticObservationStateSchema.optional(),
  observationStatePublic: SemanticObservationStateSchema.optional(),
  /** Latest bounded observer-relative frame for each isolated character agent. */
  perceptionFrameA: CharacterPerceptionFrameASchema.optional(),
  perceptionFrameB: CharacterPerceptionFrameBSchema.optional(),
  /** Server-private current contact continuity; never copied to BattlePublic. */
  perceptionRegistryA: ObserverContactRegistryASchema.optional(),
  perceptionRegistryB: ObserverContactRegistryBSchema.optional(),
  /** Only the most recent semantic transition is retained. */
  latestSemanticTransition: z.object({
    turn: z.number().int().nonnegative(),
    status: z.enum(["applied", "rejected", "skipped"]),
    fromRevision: z.number().int().nonnegative(),
    toRevision: z.number().int().nonnegative(),
    patch: TurnSemanticPatchSchema.nullable(),
  }).superRefine((transition, ctx) => {
    if (transition.fromRevision > transition.toRevision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fromRevision"],
        message: "semantic transition revision order is invalid",
      });
    }
    if (
      transition.patch &&
      transition.patch.baseRevision !== transition.fromRevision
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["patch", "baseRevision"],
        message: "semantic transition patch revision mismatch",
      });
    }
  }).optional(),
  /** Latest server-owned mechanical world transition; never exposed publicly. */
  latestWorldTransition: z.object({
    turn: z.number().int().nonnegative(),
    status: z.enum(["applied", "rejected", "skipped"]),
    fromRevision: z.number().int().nonnegative(),
    toRevision: z.number().int().nonnegative(),
    transition: BattleWorldTransitionSchema.nullable(),
  }).superRefine((worldTransition, ctx) => {
    if (worldTransition.fromRevision > worldTransition.toRevision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fromRevision"],
        message: "world transition revision order is invalid",
      });
    }
    if (
      worldTransition.transition &&
      worldTransition.transition.baseRevision !== worldTransition.fromRevision
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transition", "baseRevision"],
        message: "world transition base revision mismatch",
      });
    }
  }).optional(),
  /** Latest server-owned action ordering receipt; never exposed publicly. */
  latestTemporalResolution: BattleTemporalPlanSchema.optional(),
  /**
   * Engine-internal balance metrics (not exposed on BattlePublic).
   * Accumulated from HP deltas each combat turn for observability.
   */
  balanceTrace: z
    .object({
      combatTurns: z.number().int().nonnegative(),
      totalDamageA: z.number().nonnegative(),
      totalDamageB: z.number().nonnegative(),
      maxTurnDamageA: z.number().nonnegative(),
      maxTurnDamageB: z.number().nonnegative(),
      maxTurnDamageRatioA: z.number().nonnegative(),
      maxTurnDamageRatioB: z.number().nonnegative(),
      hitTurns: z.number().int().nonnegative(),
      oneShotSuspect: z.boolean(),
      firstKoCombatTurn: z.number().int().positive().nullable(),
    })
    .optional(),
  log: z.array(NarrativeBlockSchema).default([]),
  winnerSide: z.enum(["a", "b", "draw"]).nullable().default(null),
  finishReason: FinishReasonSchema.nullable().default(null),
  /** Raw result authority for turn-limit finishes; presentation is in log. */
  adjudication: BattleAdjudicationSchema.optional(),
  /** Elo settlement for this match. Legacy data may contain voided settlements. */
  ratingSettlement: z
    .object({
      applied: z.boolean(),
      voided: z.boolean(),
      /** True when public (cross-account) track was updated. */
      ranked: z.boolean(),
      sameOwner: z.boolean().optional(),
      /** @deprecated use overall.sideA — overall track for side A */
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
      overall: z
        .object({
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
      public: z
        .object({
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
        .nullable()
        .optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((state, ctx) => {
  if (state.adjudication) {
    if (
      state.status !== "finished" ||
      state.finishReason !== "turn_limit"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjudication"],
        message: "adjudication is valid only for a finished turn-limit battle",
      });
    }
    if (state.adjudication.turn !== state.turn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjudication", "turn"],
        message: "adjudication turn must match battle turn",
      });
    }
    if (state.adjudication.winnerSide !== state.winnerSide) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjudication", "winnerSide"],
        message: "adjudication winner must match canonical battle winner",
      });
    }
  }
  const revision = state.semanticState?.revision;
  if (revision === undefined) return;
  for (const [field, observation] of [
    ["observationStateA", state.observationStateA],
    ["observationStateB", state.observationStateB],
    ["observationStatePublic", state.observationStatePublic],
  ] as const) {
    if (observation && observation.snapshot.revision !== revision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, "snapshot", "revision"],
        message: "observation revision must match semantic state",
      });
    }
  }
  for (const [field, frame] of [
    ["perceptionFrameA", state.perceptionFrameA],
    ["perceptionFrameB", state.perceptionFrameB],
  ] as const) {
    if (frame && frame.revision !== revision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, "revision"],
        message: "perception frame revision must match semantic state",
      });
    }
  }
  if (
    state.latestSemanticTransition &&
    state.latestSemanticTransition.toRevision !== revision
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latestSemanticTransition", "toRevision"],
      message: "latest semantic transition must match semantic state",
    });
  }
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
    imageUrl: z.string().nullable().optional(),
  }),
  sideB: z.object({
    characterId: z.string(),
    displayName: z.string(),
    canFight: z.boolean(),
    imageUrl: z.string().nullable().optional(),
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
  /** Observable structured world only; excludes mechanics and private agents. */
  semanticState: SemanticObservationStateSchema.nullable().optional(),
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
  /** True while waiting for the post-KO aftermath beat. */
  aftermathPending: z.boolean().optional().default(false),
  /** True while waiting for the pre-combat prologue beat. */
  prologuePending: z.boolean().optional().default(false),
  /** Display name of the narration style for this match. */
  narrationStyleName: z.string().optional(),
  /** Prior rivalry note from last finished matchup (if any). */
  priorMatchSummary: z.string().nullable().optional(),
  /** Elo settlement for the finished match (shown on results). */
  ratingSettlement: z
    .object({
      applied: z.boolean(),
      ranked: z.boolean(),
      sameOwner: z.boolean().optional(),
      /** Overall (all matches) — only filled for the viewer on their own chars in UI. */
      overall: z
        .object({
          sideA: z.object({
            before: z.number(),
            after: z.number(),
            delta: z.number(),
            provisionalAfter: z.boolean(),
          }),
          sideB: z.object({
            before: z.number(),
            after: z.number(),
            delta: z.number(),
            provisionalAfter: z.boolean(),
          }),
        })
        .optional(),
      /** Public ranked track; null when same-owner only. */
      public: z
        .object({
          sideA: z.object({
            before: z.number(),
            after: z.number(),
            delta: z.number(),
            provisionalAfter: z.boolean(),
          }),
          sideB: z.object({
            before: z.number(),
            after: z.number(),
            delta: z.number(),
            provisionalAfter: z.boolean(),
          }),
        })
        .nullable()
        .optional(),
      /** @deprecated alias of overall.sideA for older clients */
      sideA: z
        .object({
          before: z.number(),
          after: z.number(),
          delta: z.number(),
          provisionalAfter: z.boolean(),
        })
        .optional(),
      sideB: z
        .object({
          before: z.number(),
          after: z.number(),
          delta: z.number(),
          provisionalAfter: z.boolean(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
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
  sideACharacterId: z.string().optional(),
  sideBCharacterId: z.string().optional(),
  sideAImageUrl: z.string().nullable().optional(),
  sideBImageUrl: z.string().nullable().optional(),
  scene: z.string(),
  battlefieldName: z.string().nullable().optional(),
  battlefieldImageUrl: z.string().nullable().optional(),
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
