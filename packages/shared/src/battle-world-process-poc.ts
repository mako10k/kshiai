import { z } from "zod";
import {
  ShadowCanonicalPatchSchema,
  type ShadowCanonicalPatch,
} from "./battle-canonical-patch.js";
import {
  ConsistencySliceSchema,
  TemporalWindowSchema,
  type ConsistencySlice,
  type TemporalWindow,
} from "./battle-projection.js";

const RefSchema = z.string().min(1).max(200);

export const WORLD_PROCESS_POC_LIMITS = {
  maxProcesses: 16,
  maxTargetsPerProcess: 16,
  maxEffectsPerProposal: 32,
  maxTimelineItems: 32,
  maxSemanticConcretizations: 1,
} as const;

export const WorldProcessKindSchema = z.enum([
  "fire",
  "collapse",
  "fall",
  "spread",
  "support_loss",
]);
export type WorldProcessKind = z.infer<typeof WorldProcessKindSchema>;

export const ActiveWorldProcessSchema = z.object({
  processRef: RefSchema,
  processKind: WorldProcessKindSchema,
  sourceRefs: z.array(RefSchema).min(1).max(16),
  targetRefs: z.array(RefSchema)
    .min(1)
    .max(WORLD_PROCESS_POC_LIMITS.maxTargetsPerProcess),
  triggerFactRefs: z.array(RefSchema).min(1).max(16),
  timing: TemporalWindowSchema,
  active: z.boolean(),
}).strict();
export type ActiveWorldProcess = z.infer<typeof ActiveWorldProcessSchema>;

export const WorldProcessConcretizationSchema = z.object({
  processRef: RefSchema,
  baseFactRef: RefSchema,
  value: z.unknown(),
  evidenceRefs: z.array(RefSchema).min(1).max(8),
}).strict();
export type WorldProcessConcretization = z.infer<
  typeof WorldProcessConcretizationSchema
>;

export const WorldProcessEffectProposalSchema = z.object({
  effectRef: RefSchema,
  targetRef: RefSchema,
  predicate: z.string().min(1).max(160),
  value: z.unknown(),
  priorFactRef: RefSchema.optional(),
  causalSourceRef: RefSchema,
  exclusiveClaimRef: RefSchema,
}).strict();
export type WorldProcessEffectProposal = z.infer<
  typeof WorldProcessEffectProposalSchema
>;

export const WorldTransitionProposalPocSchema = z.object({
  proposalRef: RefSchema,
  processRef: RefSchema,
  processKind: WorldProcessKindSchema,
  sourceRefs: z.array(RefSchema).min(1).max(16),
  triggerFactRefs: z.array(RefSchema).min(1).max(16),
  effects: z.array(WorldProcessEffectProposalSchema)
    .min(1)
    .max(WORLD_PROCESS_POC_LIMITS.maxEffectsPerProposal),
  timing: TemporalWindowSchema,
  ruleRef: RefSchema,
  semanticConcretizationRef: RefSchema.optional(),
}).strict();
export type WorldTransitionProposalPoc = z.infer<
  typeof WorldTransitionProposalPocSchema
>;

export const WorldTimelineCharacterProposalSchema = z.object({
  proposalRef: RefSchema,
  actorRef: RefSchema,
  timing: TemporalWindowSchema,
  exclusiveClaimRefs: z.array(RefSchema).max(16),
}).strict();
export type WorldTimelineCharacterProposal = z.infer<
  typeof WorldTimelineCharacterProposalSchema
>;

const WorldTimelineItemSchema = z.object({
  proposalRef: RefSchema,
  sourceKind: z.enum(["character", "world_process"]),
  sourceRef: RefSchema,
  timing: TemporalWindowSchema,
  exclusiveClaimRefs: z.array(RefSchema).max(32),
  status: z.enum(["ready", "contested"]),
}).strict();

const WorldProcessReceiptSchema = z.object({
  proposalRef: RefSchema,
  processRef: RefSchema,
  outcome: z.enum(["completed", "requires_adjudication", "rejected"]),
  reason: z.enum([
    "rule_applied",
    "same_window_conflict",
    "inactive_process",
    "missing_trigger",
    "missing_rule",
    "out_of_scope",
    "invalid_concretization",
  ]),
  effects: z.array(WorldProcessEffectProposalSchema).max(32),
  patch: ShadowCanonicalPatchSchema.optional(),
  projectionFactRefsUsed: z.array(RefSchema).max(32),
  semanticConcretizationUsed: z.boolean(),
  canonicalCommitPerformed: z.literal(false),
}).strict();

export const WorldProcessPocResultSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow_world_process_poc"),
  proposals: z.array(WorldTransitionProposalPocSchema).max(16),
  timeline: z.array(WorldTimelineItemSchema)
    .max(WORLD_PROCESS_POC_LIMITS.maxTimelineItems),
  receipts: z.array(WorldProcessReceiptSchema).max(16),
  contestedClaimRefs: z.array(RefSchema).max(32),
  ruleRefsUsed: z.array(RefSchema).max(16),
  externalLlmCalls: z.literal(0),
  sourceMutated: z.literal(false),
  canonicalCommitPerformed: z.literal(false),
}).strict();
export type WorldProcessPocResult = z.infer<typeof WorldProcessPocResultSchema>;

type ProjectedFact = {
  id: string;
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  valuePresent: boolean;
  value?: unknown;
};

type Rule = {
  id: string;
  triggerPredicate: string;
  triggerValue: unknown;
  effectPredicate: string;
  effectValue: unknown;
};

const RULES: Record<WorldProcessKind, Rule> = {
  fire: {
    id: "world-process.fire.v1",
    triggerPredicate: "fire.state",
    triggerValue: "active",
    effectPredicate: "area.fire",
    effectValue: "burning",
  },
  collapse: {
    id: "world-process.collapse.v1",
    triggerPredicate: "collapse.state",
    triggerValue: "active",
    effectPredicate: "structure.state",
    effectValue: "collapsed",
  },
  fall: {
    id: "world-process.fall.v1",
    triggerPredicate: "fall.state",
    triggerValue: "active",
    effectPredicate: "actor.posture",
    effectValue: "fallen",
  },
  spread: {
    id: "world-process.spread.v1",
    triggerPredicate: "spread.state",
    triggerValue: "active",
    effectPredicate: "area.smoke",
    effectValue: "spreading",
  },
  support_loss: {
    id: "world-process.support-loss.v1",
    triggerPredicate: "support.state",
    triggerValue: "lost",
    effectPredicate: "structure.stability",
    effectValue: "unstable",
  },
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function projectedFacts(slice: ConsistencySlice): ProjectedFact[] {
  return slice.factGroups.flatMap((group) => group.facts.map((row) => ({
    id: row[0],
    subjectRef: group.subjectRef,
    predicate: row[1],
    ...(row[2] ? { objectRef: row[2] } : {}),
    valuePresent: row.length === 7,
    ...(row.length === 7 ? { value: row[6] } : {}),
  })));
}

function sameWindow(left: TemporalWindow, right: TemporalWindow): boolean {
  return left.fromTurn <= right.toTurn && right.fromTurn <= left.toTurn &&
    (left.phase ?? "execution") === (right.phase ?? "execution");
}

function buildPatch(input: {
  proposal: WorldTransitionProposalPoc;
  turn: number;
}): ShadowCanonicalPatch {
  const assertions = input.proposal.effects.map((effect, index) => ({
    id: `shadow.fact.world-process.${input.turn}.${String(index + 1).padStart(4, "0")}.${input.proposal.processRef}`,
    subjectRef: effect.targetRef,
    predicate: effect.predicate,
    value: effect.value,
    validFrom: { turn: input.turn },
    provenance: {
      subsystem: "world" as const,
      authority: "validated_world_transition" as const,
      sourceRef: input.proposal.processRef,
      sourceEventRefs: input.proposal.triggerFactRefs,
    },
  }));
  return ShadowCanonicalPatchSchema.parse({
    schemaVersion: 1,
    mode: "shadow",
    sourceRef: input.proposal.processRef,
    assertions,
    retractions: [...new Set(input.proposal.effects.flatMap((effect) =>
      effect.priorFactRef ? [effect.priorFactRef] : []
    ))].sort(),
    causalLinks: assertions.flatMap((assertion, index) => {
      const effect = input.proposal.effects[index]!;
      return [{
        sourceRef: effect.causalSourceRef,
        targetFactRef: assertion.id,
        relation: effect.priorFactRef ? "modified" as const : "created" as const,
      }, ...(effect.priorFactRef ? [{
        sourceRef: effect.causalSourceRef,
        targetFactRef: effect.priorFactRef,
        relation: "ended" as const,
      }] : []), ...input.proposal.triggerFactRefs.map((triggerRef) => ({
        sourceRef: triggerRef,
        targetFactRef: assertion.id,
        relation: "triggered" as const,
      }))];
    }),
    touchedRefs: [...new Set(input.proposal.effects.map((effect) =>
      effect.targetRef
    ))].sort(),
  });
}

/**
 * Frozen PoC only. Consumes a bounded world-process projection and emits shadow
 * proposals/patches; it never applies them to BattleState or canonical storage.
 */
export function evaluateWorldProcessesPoc(input: {
  slice: ConsistencySlice;
  activeProcesses: ActiveWorldProcess[];
  characterProposals: WorldTimelineCharacterProposal[];
  concretizations?: WorldProcessConcretization[];
}): WorldProcessPocResult {
  const source = clone(input);
  const slice = ConsistencySliceSchema.parse(source.slice);
  if (slice.purpose !== "world_process") {
    throw new Error("world-process PoC requires a purpose=world_process projection");
  }
  const processes = z.array(ActiveWorldProcessSchema)
    .max(WORLD_PROCESS_POC_LIMITS.maxProcesses)
    .parse(source.activeProcesses);
  const characters = z.array(WorldTimelineCharacterProposalSchema)
    .max(16)
    .parse(source.characterProposals);
  const concretizations = z.array(WorldProcessConcretizationSchema)
    .max(WORLD_PROCESS_POC_LIMITS.maxSemanticConcretizations)
    .parse(source.concretizations ?? []);
  const facts = projectedFacts(slice);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const concretizationByProcess = new Map<string, WorldProcessConcretization>();
  const invalidConcretizationProcesses = new Set<string>();
  const projectionEvidenceRefs = new Set([
    ...facts.map((fact) => fact.id),
    ...slice.causalLinks.map((link) => link[0]),
  ]);
  for (const concretization of concretizations) {
    const base = factById.get(concretization.baseFactRef);
    const process = processes.find((item) =>
      item.processRef === concretization.processRef
    );
    if (
      !base || base.valuePresent || !process ||
      !process.triggerFactRefs.includes(base.id) ||
      concretizationByProcess.has(process.processRef) ||
      !concretization.evidenceRefs.every((ref) =>
        projectionEvidenceRefs.has(ref)
      )
    ) {
      invalidConcretizationProcesses.add(concretization.processRef);
      continue;
    }
    base.valuePresent = true;
    base.value = clone(concretization.value);
    concretizationByProcess.set(process.processRef, concretization);
  }

  const proposals: WorldTransitionProposalPoc[] = [];
  const rejected = new Map<string,
    | "inactive_process"
    | "missing_trigger"
    | "missing_rule"
    | "out_of_scope"
    | "invalid_concretization"
  >();
  const scopeRefs = new Set([
    ...slice.scope.anchorRefs,
    ...slice.scope.entityRefs,
  ]);
  for (const process of processes) {
    if (!process.active) {
      rejected.set(process.processRef, "inactive_process");
      continue;
    }
    if (invalidConcretizationProcesses.has(process.processRef)) {
      rejected.set(process.processRef, "invalid_concretization");
      continue;
    }
    const rule = RULES[process.processKind];
    if (!slice.applicableRuleRefs.includes(rule.id)) {
      rejected.set(process.processRef, "missing_rule");
      continue;
    }
    if (!process.targetRefs.every((ref) => scopeRefs.has(ref))) {
      rejected.set(process.processRef, "out_of_scope");
      continue;
    }
    const triggerFacts = process.triggerFactRefs.map((ref) => factById.get(ref));
    if (
      triggerFacts.some((fact) => !fact) ||
      !triggerFacts.some((fact) => fact!.predicate === rule.triggerPredicate &&
        fact!.valuePresent && sameValue(fact!.value, rule.triggerValue))
    ) {
      rejected.set(process.processRef, "missing_trigger");
      continue;
    }
    const effects = process.targetRefs.map((targetRef, index) => {
      const prior = facts.find((fact) =>
        fact.subjectRef === targetRef && fact.predicate === rule.effectPredicate
      );
      return WorldProcessEffectProposalSchema.parse({
        effectRef: `${process.processRef}.effect.${index + 1}`,
        targetRef,
        predicate: rule.effectPredicate,
        value: rule.effectValue,
        ...(prior ? { priorFactRef: prior.id } : {}),
        causalSourceRef: process.processRef,
        exclusiveClaimRef: `state:${targetRef}:${rule.effectPredicate}`,
      });
    });
    proposals.push(WorldTransitionProposalPocSchema.parse({
      proposalRef: `world-proposal:${process.processRef}`,
      processRef: process.processRef,
      processKind: process.processKind,
      sourceRefs: process.sourceRefs,
      triggerFactRefs: process.triggerFactRefs,
      effects,
      timing: process.timing,
      ruleRef: rule.id,
      ...(concretizationByProcess.has(process.processRef)
        ? { semanticConcretizationRef: concretizationByProcess.get(process.processRef)!.baseFactRef }
        : {}),
    }));
  }

  const timelineBase = [
    ...characters.map((proposal) => ({
      proposalRef: proposal.proposalRef,
      sourceKind: "character" as const,
      sourceRef: proposal.actorRef,
      timing: proposal.timing,
      exclusiveClaimRefs: proposal.exclusiveClaimRefs,
    })),
    ...proposals.map((proposal) => ({
      proposalRef: proposal.proposalRef,
      sourceKind: "world_process" as const,
      sourceRef: proposal.processRef,
      timing: proposal.timing,
      exclusiveClaimRefs: proposal.effects.map((effect) =>
        effect.exclusiveClaimRef
      ),
    })),
  ];
  const contested = new Set<string>();
  for (let left = 0; left < timelineBase.length; left += 1) {
    for (let right = left + 1; right < timelineBase.length; right += 1) {
      const a = timelineBase[left]!;
      const b = timelineBase[right]!;
      if (!sameWindow(a.timing, b.timing)) continue;
      for (const claim of a.exclusiveClaimRefs) {
        if (b.exclusiveClaimRefs.includes(claim)) contested.add(claim);
      }
    }
  }
  const timeline = timelineBase.map((item) => WorldTimelineItemSchema.parse({
    ...item,
    status: item.exclusiveClaimRefs.some((claim) => contested.has(claim))
      ? "contested"
      : "ready",
  })).sort((a, b) => a.timing.fromTurn - b.timing.fromTurn ||
    (a.timing.phase ?? "execution").localeCompare(b.timing.phase ?? "execution") ||
    a.proposalRef.localeCompare(b.proposalRef));

  const receipts = [
    ...proposals.map((proposal) => {
      const hasConflict = proposal.effects.some((effect) =>
        contested.has(effect.exclusiveClaimRef)
      );
      return WorldProcessReceiptSchema.parse({
        proposalRef: proposal.proposalRef,
        processRef: proposal.processRef,
        outcome: hasConflict ? "requires_adjudication" : "completed",
        reason: hasConflict ? "same_window_conflict" : "rule_applied",
        effects: proposal.effects,
        ...(!hasConflict
          ? { patch: buildPatch({ proposal, turn: proposal.timing.fromTurn }) }
          : {}),
        projectionFactRefsUsed: proposal.triggerFactRefs,
        semanticConcretizationUsed: Boolean(proposal.semanticConcretizationRef),
        canonicalCommitPerformed: false,
      });
    }),
    ...processes.filter((process) => rejected.has(process.processRef)).map(
      (process) => WorldProcessReceiptSchema.parse({
        proposalRef: `world-proposal:${process.processRef}`,
        processRef: process.processRef,
        outcome: "rejected",
        reason: rejected.get(process.processRef)!,
        effects: [],
        projectionFactRefsUsed: process.triggerFactRefs,
        semanticConcretizationUsed: false,
        canonicalCommitPerformed: false,
      }),
    ),
  ].sort((a, b) => a.proposalRef.localeCompare(b.proposalRef));

  return WorldProcessPocResultSchema.parse({
    schemaVersion: 1,
    mode: "shadow_world_process_poc",
    proposals: proposals.sort((a, b) => a.proposalRef.localeCompare(b.proposalRef)),
    timeline,
    receipts,
    contestedClaimRefs: [...contested].sort(),
    ruleRefsUsed: [...new Set(proposals.map((proposal) => proposal.ruleRef))].sort(),
    externalLlmCalls: 0,
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
}
