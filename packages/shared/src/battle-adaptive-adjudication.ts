import { z } from "zod";

const RefSchema = z.string().min(1).max(160);

export const ADAPTIVE_ADJUDICATION_POC_LIMITS = {
  maxProposals: 4,
  maxFactsPerProposal: 256,
  maxStepsPerPlan: 12,
  maxEffectsPerReceipt: 32,
  maxFallbackClaims: 4,
  maxWorldExpansions: 4,
} as const;

const AdaptiveClaimStrengthSchema = z.enum([
  "known",
  "intermediate",
  "weak",
  "unknown",
]);
export type AdaptiveClaimStrength = z.infer<
  typeof AdaptiveClaimStrengthSchema
>;

export const AdaptiveFactSchema = z.object({
  id: RefSchema,
  subjectRef: RefSchema,
  predicate: z.string().min(1).max(160),
  objectRef: RefSchema.optional(),
  value: z.unknown().optional(),
  strength: AdaptiveClaimStrengthSchema,
  provenance: z.enum([
    "canonical",
    "world_expansion",
    "character_step",
    "intermediate_fallback",
    "weak_fallback",
    "unknown_fallback",
  ]),
}).strict();
export type AdaptiveFact = z.infer<typeof AdaptiveFactSchema>;

export const AdaptiveFactConditionSchema = z.object({
  factRef: RefSchema,
  operator: z.enum(["exists", "equals", "not_equals"]),
  value: z.unknown().optional(),
}).strict().superRefine((condition, ctx) => {
  if (
    condition.operator !== "exists" &&
    !Object.prototype.hasOwnProperty.call(condition, "value")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "fact equality conditions require a comparison value",
    });
  }
});
export type AdaptiveFactCondition = z.infer<
  typeof AdaptiveFactConditionSchema
>;

export const AdaptiveEffectSchema = z.object({
  id: RefSchema,
  operation: z.enum(["assert", "retract"]),
  fact: AdaptiveFactSchema.optional(),
  factRef: RefSchema.optional(),
  irreversible: z.boolean(),
  causalSourceRef: RefSchema,
  sourceStepRef: RefSchema.optional(),
}).strict().superRefine((effect, ctx) => {
  if (effect.operation === "assert" && !effect.fact) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fact"],
      message: "assert effects require a fact",
    });
  }
  if (effect.operation === "retract" && !effect.factRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["factRef"],
      message: "retract effects require a fact reference",
    });
  }
  if (effect.operation === "assert" && effect.factRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["factRef"],
      message: "assert effects cannot carry a retraction reference",
    });
  }
  if (effect.operation === "retract" && effect.fact) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fact"],
      message: "retract effects cannot carry an asserted fact",
    });
  }
});
export type AdaptiveEffect = z.infer<typeof AdaptiveEffectSchema>;

export const AdaptiveExecutionCostSchema = z.object({
  id: RefSchema,
  channel: z.enum([
    "position",
    "posture",
    "stamina",
    "mp",
    "ammunition",
    "cooldown",
    "durability",
    "exposure",
    "noise",
    "action_opportunity",
    "new_cognition",
  ]),
  description: z.string().min(1).max(320),
  sourceStepRef: RefSchema,
  effect: AdaptiveEffectSchema.optional(),
}).strict();
export type AdaptiveExecutionCost = z.infer<
  typeof AdaptiveExecutionCostSchema
>;

export const AdaptiveExpansionReasonSchema = z.enum([
  "intermediate_state_affects_outcome",
  "partial_stop_matters",
  "simultaneous_conflict",
  "unknown_world_state",
  "irreversible_effect",
  "rule_ambiguity",
  "stage_dependent_cost",
]);
export type AdaptiveExpansionReason = z.infer<
  typeof AdaptiveExpansionReasonSchema
>;

export const AdaptiveActionKindSchema = z.enum([
  "basic_attack",
  "skill",
  "movement",
  "defense",
  "release",
  "free_action",
  "custom",
  "world_process",
]);
export type AdaptiveActionKind = z.infer<typeof AdaptiveActionKindSchema>;

export const AdaptiveCharacterIntentSchema = z.object({
  objective: z.string().min(1).max(320),
  targetRefs: z.array(RefSchema).max(8),
  priorities: z.array(z.string().min(1).max(240)).max(8).default([]),
  mustPreserve: z.array(z.string().min(1).max(240)).max(8).default([]),
  mustAvoid: z.array(z.string().min(1).max(240)).max(8).default([]),
}).strict();
export type AdaptiveCharacterIntent = z.infer<
  typeof AdaptiveCharacterIntentSchema
>;

export const AdaptiveCharacterBasisSchema = z.object({
  observationRefs: z.array(RefSchema).min(1).max(32),
  psychologyRefs: z.array(RefSchema).max(16).default([]),
  experienceRefs: z.array(RefSchema).max(16).default([]),
}).strict();
export type AdaptiveCharacterBasis = z.infer<
  typeof AdaptiveCharacterBasisSchema
>;

export const AdaptiveActionProposalSchema = z.object({
  proposalRef: RefSchema,
  actorRef: RefSchema,
  actionKind: AdaptiveActionKindSchema,
  method: z.string().min(1).max(400),
  targetRefs: z.array(RefSchema).max(8),
  instrumentRef: RefSchema.optional(),
  intent: AdaptiveCharacterIntentSchema,
  characterBasis: AdaptiveCharacterBasisSchema,
  latentPlanHints: z.object({
    approachPreference: z.string().min(1).max(240).optional(),
    criticalStep: z.string().min(1).max(240).optional(),
    fallback: z.string().min(1).max(240).optional(),
    riskTolerance: z.string().min(1).max(160).optional(),
  }).strict().optional(),
  expansionReasons: z.array(AdaptiveExpansionReasonSchema).max(7).default([]),
  expansionNeeds: z.object({
    characterPlan: z.boolean(),
    worldDetail: z.boolean(),
  }).strict(),
}).strict().superRefine((proposal, ctx) => {
  if (
    proposal.expansionReasons.length === 0 &&
    (proposal.expansionNeeds.characterPlan || proposal.expansionNeeds.worldDetail)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expansionNeeds"],
      message: "expansion needs require an explicit expansion reason",
    });
  }
  if (
    proposal.expansionReasons.length > 0 &&
    !proposal.expansionNeeds.characterPlan &&
    !proposal.expansionNeeds.worldDetail
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expansionNeeds"],
      message: "an expansion reason must route to character or world detail",
    });
  }
});
export type AdaptiveActionProposal = z.infer<
  typeof AdaptiveActionProposalSchema
>;

export const PlannedAdaptiveStepSchema = z.object({
  id: RefSchema,
  description: z.string().min(1).max(320),
  origin: z.literal("character_expansion"),
  basisRefs: z.array(RefSchema).min(1).max(16),
  preconditions: z.array(AdaptiveFactConditionSchema).max(12).default([]),
  effects: z.array(AdaptiveEffectSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxEffectsPerReceipt)
    .default([]),
  costs: z.array(AdaptiveExecutionCostSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxEffectsPerReceipt)
    .default([]),
  exclusiveClaimRefs: z.array(RefSchema).max(8).default([]),
}).strict().superRefine((step, ctx) => {
  for (const [index, effect] of step.effects.entries()) {
    if (effect.sourceStepRef !== step.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects", index, "sourceStepRef"],
        message: "step effect source must match its owning step",
      });
    }
  }
  for (const [index, cost] of step.costs.entries()) {
    if (cost.sourceStepRef !== step.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["costs", index, "sourceStepRef"],
        message: "execution cost source must match its completed step",
      });
    }
    if (cost.effect?.sourceStepRef !== undefined &&
      cost.effect.sourceStepRef !== step.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["costs", index, "effect", "sourceStepRef"],
        message: "cost effect source must match its owning step",
      });
    }
  }
});
export type PlannedAdaptiveStep = z.infer<typeof PlannedAdaptiveStepSchema>;

export const AdaptiveCharacterActionPlanSchema = z.object({
  proposalRef: RefSchema,
  steps: z.array(PlannedAdaptiveStepSchema)
    .min(1)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxStepsPerPlan),
  branches: z.array(z.object({
    condition: AdaptiveFactConditionSchema,
    nextStepRef: RefSchema,
  }).strict()).max(8).default([]),
  abortConditions: z.array(AdaptiveFactConditionSchema).max(8).default([]),
}).strict().superRefine((plan, ctx) => {
  const stepRefs = plan.steps.map((step) => step.id);
  if (new Set(stepRefs).size !== stepRefs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["steps"],
      message: "planned step references must be unique",
    });
  }
  const effectRefs = plan.steps.flatMap((step) =>
    step.effects.map((effect) => effect.id)
  );
  const costRefs = plan.steps.flatMap((step) =>
    step.costs.map((cost) => cost.id)
  );
  if (new Set(effectRefs).size !== effectRefs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["steps"],
      message: "planned effect references must be unique",
    });
  }
  if (new Set(costRefs).size !== costRefs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["steps"],
      message: "planned cost references must be unique",
    });
  }
  for (const [index, branch] of plan.branches.entries()) {
    if (!stepRefs.includes(branch.nextStepRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["branches", index, "nextStepRef"],
        message: "planned branch target must exist in the same plan",
      });
    }
  }
});
export type AdaptiveCharacterActionPlan = z.infer<
  typeof AdaptiveCharacterActionPlanSchema
>;

export const AdaptiveWorldExpansionSchema = z.object({
  requestRef: RefSchema,
  baseFactRef: RefSchema,
  refinedFact: AdaptiveFactSchema,
}).strict().superRefine((expansion, ctx) => {
  if (expansion.refinedFact.strength === "unknown") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refinedFact", "strength"],
      message: "world expansion must add information rather than another unknown",
    });
  }
  if (expansion.refinedFact.provenance !== "world_expansion") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refinedFact", "provenance"],
      message: "world expansion facts require world-expansion provenance",
    });
  }
});
export type AdaptiveWorldExpansion = z.infer<
  typeof AdaptiveWorldExpansionSchema
>;

export const AdaptiveDirectResolutionSchema = z.object({
  source: z.enum(["control", "coarse"]),
  outcome: z.enum(["completed", "partial", "attempted_failed"]),
  effects: z.array(AdaptiveEffectSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxEffectsPerReceipt)
    .default([]),
  costs: z.array(AdaptiveExecutionCostSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxEffectsPerReceipt)
    .default([]),
}).strict();
export type AdaptiveDirectResolution = z.infer<
  typeof AdaptiveDirectResolutionSchema
>;

export const AdaptiveProposalCaseSchema = z.object({
  proposal: AdaptiveActionProposalSchema,
  facts: z.array(AdaptiveFactSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxFactsPerProposal * 2),
  scopeRefs: z.array(RefSchema).min(1).max(256),
  controlResolution: AdaptiveDirectResolutionSchema.optional(),
  coarseResolution: AdaptiveDirectResolutionSchema.optional(),
  characterPlan: AdaptiveCharacterActionPlanSchema.optional(),
  worldExpansions: z.array(AdaptiveWorldExpansionSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxWorldExpansions)
    .default([]),
  fallbackClaims: z.array(AdaptiveFactSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxFallbackClaims)
    .default([]),
}).strict();
export type AdaptiveProposalCase = z.infer<
  typeof AdaptiveProposalCaseSchema
>;

export const AdaptiveAdjudicationBudgetSchema = z.object({
  maxCoarseAdjudications: z.number().int().min(0).max(16),
  maxPlanningExpansions: z.number().int().min(0).max(16),
  maxWorldExpansions: z.number().int().min(0).max(16),
  maxFactsPerProposal: z.number().int().min(1)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxFactsPerProposal),
  maxStepsPerPlan: z.number().int().min(1)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxStepsPerPlan),
  maxEffectsPerReceipt: z.number().int().min(1)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxEffectsPerReceipt),
}).strict();
export type AdaptiveAdjudicationBudget = z.infer<
  typeof AdaptiveAdjudicationBudgetSchema
>;

export const DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET: AdaptiveAdjudicationBudget = {
  maxCoarseAdjudications: 4,
  maxPlanningExpansions: 2,
  maxWorldExpansions: 2,
  maxFactsPerProposal: 128,
  maxStepsPerPlan: 8,
  maxEffectsPerReceipt: 24,
};

const AdaptiveBudgetUsageSchema = z.object({
  coarseAdjudications: z.number().int().nonnegative(),
  planningExpansions: z.number().int().nonnegative(),
  worldExpansions: z.number().int().nonnegative(),
  factsRead: z.number().int().nonnegative(),
  externalLlmCalls: z.literal(0),
}).strict();

export const AdaptiveAdjudicationReceiptSchema = z.object({
  proposalRef: RefSchema,
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  resolution: z.enum(["fast", "coarse", "expanded", "degraded"]),
  outcome: z.enum([
    "completed",
    "partial",
    "attempted_failed",
    "indeterminate",
    "rejected",
  ]),
  completedSteps: z.array(RefSchema),
  failedStep: RefSchema.optional(),
  failureReason: z.enum([
    "precondition_failed",
    "precondition_unknown",
    "abort_condition",
    "simultaneous_conflict",
    "invalid_character_plan",
    "invalid_world_expansion",
    "budget_exhausted",
    "missing_resolution",
  ]).optional(),
  effects: z.array(AdaptiveEffectSchema),
  costs: z.array(AdaptiveExecutionCostSchema),
  refinedFacts: z.array(AdaptiveFactSchema),
  rejectedWorldExpansionRefs: z.array(RefSchema),
  fallbackFact: AdaptiveFactSchema.optional(),
  expansionReasons: z.array(AdaptiveExpansionReasonSchema),
  budgetUsage: AdaptiveBudgetUsageSchema,
  sourceMutated: z.literal(false),
  canonicalCommitPerformed: z.literal(false),
}).strict();
export type AdaptiveAdjudicationReceipt = z.infer<
  typeof AdaptiveAdjudicationReceiptSchema
>;

export const AdaptiveAdjudicationBatchResultSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow_adaptive_adjudication"),
  receipts: z.array(AdaptiveAdjudicationReceiptSchema)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxProposals),
  budget: AdaptiveAdjudicationBudgetSchema,
  budgetUsage: AdaptiveBudgetUsageSchema,
  contestedClaimRefs: z.array(RefSchema),
  externalLlmCalls: z.literal(0),
  sourceMutated: z.literal(false),
  canonicalCommitPerformed: z.literal(false),
}).strict();
export type AdaptiveAdjudicationBatchResult = z.infer<
  typeof AdaptiveAdjudicationBatchResultSchema
>;

type MutableBudgetUsage = z.infer<typeof AdaptiveBudgetUsageSchema>;

const FAST_ACTION_KINDS = new Set<AdaptiveActionKind>([
  "basic_attack",
  "skill",
  "movement",
  "defense",
  "release",
  "world_process",
]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) ===
    JSON.stringify(canonicalize(right));
}

function slotKey(fact: Pick<AdaptiveFact, "subjectRef" | "predicate" | "objectRef">): string {
  return JSON.stringify([fact.subjectRef, fact.predicate, fact.objectRef ?? null]);
}

function conditionResult(
  condition: AdaptiveFactCondition,
  facts: Map<string, AdaptiveFact>,
): "true" | "false" | "unknown" {
  const fact = facts.get(condition.factRef);
  if (condition.operator === "exists") return fact ? "true" : "false";
  if (!fact || fact.strength === "unknown") return "unknown";
  const equal = sameValue(fact.value, condition.value);
  return condition.operator === "equals"
    ? equal ? "true" : "false"
    : equal ? "false" : "true";
}

function applyVirtualEffect(
  effect: AdaptiveEffect,
  facts: Map<string, AdaptiveFact>,
): void {
  if (effect.operation === "assert" && effect.fact) {
    facts.set(effect.fact.id, clone(effect.fact));
  } else if (effect.operation === "retract" && effect.factRef) {
    facts.delete(effect.factRef);
  }
}

export type AdaptiveWorldRefinementResult = {
  facts: AdaptiveFact[];
  refinedFacts: AdaptiveFact[];
  acceptedRequestRefs: string[];
  rejectedRequestRefs: string[];
};

export function refineAdaptiveWorldFacts(input: {
  facts: AdaptiveFact[];
  expansions: AdaptiveWorldExpansion[];
  scopeRefs: string[];
}): AdaptiveWorldRefinementResult {
  const facts = AdaptiveFactSchema.array().parse(clone(input.facts));
  const expansions = AdaptiveWorldExpansionSchema.array().parse(
    clone(input.expansions),
  );
  const scopeRefs = new Set(input.scopeRefs);
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const refinedFacts: AdaptiveFact[] = [];
  const acceptedRequestRefs: string[] = [];
  const rejectedRequestRefs: string[] = [];
  for (const expansion of expansions) {
    const base = byId.get(expansion.baseFactRef);
    const refined = expansion.refinedFact;
    const knownConflict = facts.some((fact) =>
      fact.strength === "known" &&
      slotKey(fact) === slotKey(refined) &&
      !sameValue(fact.value, refined.value)
    );
    if (
      !base ||
      base.strength !== "unknown" ||
      slotKey(base) !== slotKey(refined) ||
      (byId.has(refined.id) &&
        !sameValue(byId.get(refined.id), refined)) ||
      !scopeRefs.has(refined.subjectRef) ||
      (refined.objectRef !== undefined && !scopeRefs.has(refined.objectRef)) ||
      knownConflict
    ) {
      rejectedRequestRefs.push(expansion.requestRef);
      continue;
    }
    byId.set(refined.id, clone(refined));
    facts.push(clone(refined));
    refinedFacts.push(clone(refined));
    acceptedRequestRefs.push(expansion.requestRef);
  }
  return {
    facts,
    refinedFacts,
    acceptedRequestRefs,
    rejectedRequestRefs,
  };
}

function validateCharacterPlan(input: {
  proposalCase: AdaptiveProposalCase;
  facts: AdaptiveFact[];
  budget: AdaptiveAdjudicationBudget;
}): boolean {
  const { proposal, characterPlan, scopeRefs } = input.proposalCase;
  if (!characterPlan || characterPlan.proposalRef !== proposal.proposalRef) {
    return false;
  }
  if (characterPlan.steps.length > input.budget.maxStepsPerPlan) return false;
  const effectCount = characterPlan.steps.reduce(
    (sum, step) => sum + step.effects.length + step.costs.length,
    0,
  );
  if (effectCount > input.budget.maxEffectsPerReceipt) return false;
  const basisRefs = new Set([
    ...proposal.characterBasis.observationRefs,
    ...proposal.characterBasis.psychologyRefs,
    ...proposal.characterBasis.experienceRefs,
  ]);
  const usedBasisRefs = new Set(characterPlan.steps.flatMap((step) =>
    step.basisRefs
  ));
  const scope = new Set(scopeRefs);
  const availableFacts = new Map(input.facts.map((fact) => [fact.id, fact]));
  const coversCategory = (refs: string[]) =>
    refs.length === 0 || refs.some((ref) => usedBasisRefs.has(ref));
  const basisCoverage = coversCategory(
    proposal.characterBasis.observationRefs,
  ) && coversCategory(
    proposal.characterBasis.psychologyRefs,
  ) && coversCategory(proposal.characterBasis.experienceRefs);
  if (!basisCoverage) return false;
  const effectIsGrounded = (effect: AdaptiveEffect): boolean => {
    if (effect.fact) {
      const existing = availableFacts.get(effect.fact.id);
      return (!existing || sameValue(existing, effect.fact)) &&
        scope.has(effect.fact.subjectRef) &&
        (effect.fact.objectRef === undefined || scope.has(effect.fact.objectRef));
    }
    return effect.factRef !== undefined && availableFacts.has(effect.factRef);
  };
  for (const step of characterPlan.steps) {
    if (
      step.origin !== "character_expansion" ||
      !step.basisRefs.every((ref) => basisRefs.has(ref)) ||
      !step.preconditions.every((condition) =>
        availableFacts.has(condition.factRef)
      ) ||
      !step.effects.every(effectIsGrounded) ||
      !step.costs.every((cost) =>
        cost.effect === undefined || effectIsGrounded(cost.effect)
      )
    ) {
      return false;
    }
    for (const effect of [
      ...step.effects,
      ...step.costs.flatMap((cost) => cost.effect ? [cost.effect] : []),
    ]) {
      if (effect.fact) availableFacts.set(effect.fact.id, effect.fact);
      if (effect.operation === "retract" && effect.factRef) {
        availableFacts.delete(effect.factRef);
      }
    }
  }
  return true;
}

function directResolutionFitsBudget(
  resolution: AdaptiveDirectResolution,
  budget: AdaptiveAdjudicationBudget,
): boolean {
  return resolution.effects.length + resolution.costs.length <=
    budget.maxEffectsPerReceipt;
}

function fallbackFact(input: {
  proposalCase: AdaptiveProposalCase;
  facts: AdaptiveFact[];
}): AdaptiveFact {
  const knownSlots = new Map(input.facts.filter((fact) =>
    fact.strength === "known"
  ).map((fact) => [slotKey(fact), fact]));
  for (const strength of ["intermediate", "weak"] as const) {
    const candidate = input.proposalCase.fallbackClaims.find((fact) =>
      fact.strength === strength &&
      fact.provenance === `${strength}_fallback` &&
      input.proposalCase.scopeRefs.includes(fact.subjectRef) &&
      (fact.objectRef === undefined ||
        input.proposalCase.scopeRefs.includes(fact.objectRef))
    );
    if (!candidate) continue;
    const known = knownSlots.get(slotKey(candidate));
    if (!known || sameValue(known.value, candidate.value)) return clone(candidate);
  }
  return AdaptiveFactSchema.parse({
    id: `adaptive.fallback.${input.proposalCase.proposal.proposalRef}.unknown`,
    subjectRef: input.proposalCase.proposal.actorRef,
    predicate: "adjudication.outcome",
    value: "unknown",
    strength: "unknown",
    provenance: "unknown_fallback",
  });
}

function budgetSnapshot(usage: MutableBudgetUsage): MutableBudgetUsage {
  return clone(usage);
}

function degradedReceipt(input: {
  proposalCase: AdaptiveProposalCase;
  usage: MutableBudgetUsage;
  facts: AdaptiveFact[];
  level?: 0 | 1 | 2;
  reason: AdaptiveAdjudicationReceipt["failureReason"];
  refinedFacts?: AdaptiveFact[];
  rejectedWorldExpansionRefs?: string[];
}): AdaptiveAdjudicationReceipt {
  return AdaptiveAdjudicationReceiptSchema.parse({
    proposalRef: input.proposalCase.proposal.proposalRef,
    level: input.level ?? 1,
    resolution: "degraded",
    outcome: "indeterminate",
    completedSteps: [],
    failureReason: input.reason,
    effects: [],
    costs: [],
    refinedFacts: input.refinedFacts ?? [],
    rejectedWorldExpansionRefs: input.rejectedWorldExpansionRefs ?? [],
    fallbackFact: fallbackFact({
      proposalCase: input.proposalCase,
      facts: input.facts,
    }),
    expansionReasons: input.proposalCase.proposal.expansionReasons,
    budgetUsage: budgetSnapshot(input.usage),
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
}

function directReceipt(input: {
  proposalCase: AdaptiveProposalCase;
  resolution: AdaptiveDirectResolution;
  usage: MutableBudgetUsage;
  level: 0 | 1 | 2;
  refinedFacts?: AdaptiveFact[];
  rejectedWorldExpansionRefs?: string[];
}): AdaptiveAdjudicationReceipt {
  return AdaptiveAdjudicationReceiptSchema.parse({
    proposalRef: input.proposalCase.proposal.proposalRef,
    level: input.level,
    resolution: input.level === 0
      ? "fast"
      : input.level === 1 ? "coarse" : "expanded",
    outcome: input.resolution.outcome,
    completedSteps: [],
    effects: input.resolution.effects,
    costs: input.resolution.costs,
    refinedFacts: input.refinedFacts ?? [],
    rejectedWorldExpansionRefs: input.rejectedWorldExpansionRefs ?? [],
    expansionReasons: input.proposalCase.proposal.expansionReasons,
    budgetUsage: budgetSnapshot(input.usage),
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
}

function executeCharacterPlan(input: {
  proposalCase: AdaptiveProposalCase;
  facts: AdaptiveFact[];
  usage: MutableBudgetUsage;
  contestedClaimRefs: Set<string>;
  refinedFacts: AdaptiveFact[];
  rejectedWorldExpansionRefs: string[];
}): AdaptiveAdjudicationReceipt {
  const plan = input.proposalCase.characterPlan!;
  const facts = new Map(input.facts.map((fact) => [fact.id, clone(fact)]));
  const completedSteps: string[] = [];
  const effects: AdaptiveEffect[] = [];
  const costs: AdaptiveExecutionCost[] = [];
  let failedStep: string | undefined;
  let failureReason: AdaptiveAdjudicationReceipt["failureReason"];
  for (const step of plan.steps) {
    const abort = plan.abortConditions.some((condition) =>
      conditionResult(condition, facts) === "true"
    );
    if (abort) {
      failedStep = step.id;
      failureReason = "abort_condition";
      break;
    }
    if (step.exclusiveClaimRefs.some((ref) => input.contestedClaimRefs.has(ref))) {
      failedStep = step.id;
      failureReason = "simultaneous_conflict";
      break;
    }
    const preconditions = step.preconditions.map((condition) =>
      conditionResult(condition, facts)
    );
    if (preconditions.includes("false")) {
      failedStep = step.id;
      failureReason = "precondition_failed";
      break;
    }
    if (preconditions.includes("unknown")) {
      failedStep = step.id;
      failureReason = "precondition_unknown";
      break;
    }
    completedSteps.push(step.id);
    for (const effect of step.effects) {
      effects.push(clone(effect));
      applyVirtualEffect(effect, facts);
    }
    costs.push(...clone(step.costs));
    for (const cost of step.costs) {
      if (cost.effect) applyVirtualEffect(cost.effect, facts);
    }
  }
  const completed = completedSteps.length === plan.steps.length;
  const outcome = completed
    ? "completed"
    : completedSteps.length > 0
    ? "partial"
    : failureReason === "precondition_unknown" ||
        failureReason === "simultaneous_conflict"
    ? "indeterminate"
    : "attempted_failed";
  return AdaptiveAdjudicationReceiptSchema.parse({
    proposalRef: input.proposalCase.proposal.proposalRef,
    level: 2,
    resolution: "expanded",
    outcome,
    completedSteps,
    ...(failedStep ? { failedStep } : {}),
    ...(failureReason ? { failureReason } : {}),
    effects,
    costs,
    refinedFacts: input.refinedFacts,
    rejectedWorldExpansionRefs: input.rejectedWorldExpansionRefs,
    ...(outcome === "indeterminate"
      ? {
          fallbackFact: fallbackFact({
            proposalCase: input.proposalCase,
            facts: input.facts,
          }),
        }
      : {}),
    expansionReasons: input.proposalCase.proposal.expansionReasons,
    budgetUsage: budgetSnapshot(input.usage),
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
}

function contestedClaims(cases: AdaptiveProposalCase[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const proposalCase of cases) {
    for (const claimRef of proposalCase.characterPlan?.steps.flatMap((step) =>
      step.exclusiveClaimRefs
    ) ?? []) {
      const proposals = owners.get(claimRef) ?? new Set<string>();
      proposals.add(proposalCase.proposal.proposalRef);
      owners.set(claimRef, proposals);
    }
  }
  return new Set([...owners].filter(([, proposals]) => proposals.size > 1)
    .map(([claimRef]) => claimRef));
}

export function adjudicateAdaptiveBattleProposals(input: {
  cases: AdaptiveProposalCase[];
  budget?: AdaptiveAdjudicationBudget;
}): AdaptiveAdjudicationBatchResult {
  const source = clone(input);
  const cases = z.array(AdaptiveProposalCaseSchema)
    .min(1)
    .max(ADAPTIVE_ADJUDICATION_POC_LIMITS.maxProposals)
    .parse(source.cases);
  const proposalRefs = cases.map((proposalCase) =>
    proposalCase.proposal.proposalRef
  );
  if (new Set(proposalRefs).size !== proposalRefs.length) {
    throw new Error("adaptive proposal references must be unique within a batch");
  }
  const budget = AdaptiveAdjudicationBudgetSchema.parse(
    source.budget ?? DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
  );
  const usage: MutableBudgetUsage = {
    coarseAdjudications: 0,
    planningExpansions: 0,
    worldExpansions: 0,
    factsRead: 0,
    externalLlmCalls: 0,
  };
  const conflicts = contestedClaims(cases);
  const receipts: AdaptiveAdjudicationReceipt[] = [];
  for (const proposalCase of cases) {
    const proposal = proposalCase.proposal;
    usage.factsRead += proposalCase.facts.length;
    if (proposalCase.facts.length > budget.maxFactsPerProposal) {
      receipts.push(degradedReceipt({
        proposalCase,
        usage,
        facts: proposalCase.facts,
        reason: "budget_exhausted",
      }));
      continue;
    }
    if (
      FAST_ACTION_KINDS.has(proposal.actionKind) &&
      proposal.expansionReasons.length === 0
    ) {
      if (!proposalCase.controlResolution ||
        proposalCase.controlResolution.source !== "control") {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: proposalCase.facts,
          level: 0,
          reason: "missing_resolution",
        }));
      } else if (!directResolutionFitsBudget(
        proposalCase.controlResolution,
        budget,
      )) {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: proposalCase.facts,
          level: 0,
          reason: "budget_exhausted",
        }));
      } else {
        receipts.push(directReceipt({
          proposalCase,
          resolution: proposalCase.controlResolution,
          usage,
          level: 0,
        }));
      }
      continue;
    }
    if (usage.coarseAdjudications >= budget.maxCoarseAdjudications) {
      receipts.push(degradedReceipt({
        proposalCase,
        usage,
        facts: proposalCase.facts,
        reason: "budget_exhausted",
      }));
      continue;
    }
    usage.coarseAdjudications += 1;
    if (proposal.expansionReasons.length === 0) {
      if (!proposalCase.coarseResolution ||
        proposalCase.coarseResolution.source !== "coarse") {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: proposalCase.facts,
          reason: "missing_resolution",
        }));
      } else if (!directResolutionFitsBudget(
        proposalCase.coarseResolution,
        budget,
      )) {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: proposalCase.facts,
          reason: "budget_exhausted",
        }));
      } else {
        receipts.push(directReceipt({
          proposalCase,
          resolution: proposalCase.coarseResolution,
          usage,
          level: 1,
        }));
      }
      continue;
    }

    let refinement: AdaptiveWorldRefinementResult = {
      facts: clone(proposalCase.facts),
      refinedFacts: [],
      acceptedRequestRefs: [],
      rejectedRequestRefs: [],
    };
    if (proposal.expansionNeeds.worldDetail) {
      if (usage.worldExpansions >= budget.maxWorldExpansions ||
        proposalCase.worldExpansions.length === 0) {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: proposalCase.facts,
          level: 2,
          reason: "budget_exhausted",
        }));
        continue;
      }
      usage.worldExpansions += 1;
      refinement = refineAdaptiveWorldFacts({
        facts: proposalCase.facts,
        expansions: proposalCase.worldExpansions,
        scopeRefs: proposalCase.scopeRefs,
      });
      if (refinement.acceptedRequestRefs.length === 0) {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: proposalCase.facts,
          level: 2,
          reason: "invalid_world_expansion",
          rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
        }));
        continue;
      }
    }
    if (!proposal.expansionNeeds.characterPlan) {
      if (!proposalCase.coarseResolution ||
        proposalCase.coarseResolution.source !== "coarse") {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: refinement.facts,
          level: 2,
          reason: "missing_resolution",
          refinedFacts: refinement.refinedFacts,
          rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
        }));
      } else if (!directResolutionFitsBudget(
        proposalCase.coarseResolution,
        budget,
      )) {
        receipts.push(degradedReceipt({
          proposalCase,
          usage,
          facts: refinement.facts,
          level: 2,
          reason: "budget_exhausted",
          refinedFacts: refinement.refinedFacts,
          rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
        }));
      } else {
        receipts.push(directReceipt({
          proposalCase,
          resolution: proposalCase.coarseResolution,
          usage,
          level: 2,
          refinedFacts: refinement.refinedFacts,
          rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
        }));
      }
      continue;
    }
    if (usage.planningExpansions >= budget.maxPlanningExpansions) {
      receipts.push(degradedReceipt({
        proposalCase,
        usage,
        facts: refinement.facts,
        level: 2,
        reason: "budget_exhausted",
        refinedFacts: refinement.refinedFacts,
        rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
      }));
      continue;
    }
    usage.planningExpansions += 1;
    if (!validateCharacterPlan({ proposalCase, facts: refinement.facts, budget })) {
      receipts.push(degradedReceipt({
        proposalCase,
        usage,
        facts: refinement.facts,
        level: 2,
        reason: "invalid_character_plan",
        refinedFacts: refinement.refinedFacts,
        rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
      }));
      continue;
    }
    receipts.push(executeCharacterPlan({
      proposalCase,
      facts: refinement.facts,
      usage,
      contestedClaimRefs: conflicts,
      refinedFacts: refinement.refinedFacts,
      rejectedWorldExpansionRefs: refinement.rejectedRequestRefs,
    }));
  }
  return AdaptiveAdjudicationBatchResultSchema.parse({
    schemaVersion: 1,
    mode: "shadow_adaptive_adjudication",
    receipts,
    budget,
    budgetUsage: budgetSnapshot(usage),
    contestedClaimRefs: [...conflicts].sort(),
    externalLlmCalls: 0,
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
}
