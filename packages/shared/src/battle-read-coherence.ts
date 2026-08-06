import { z } from "zod";
import {
  CanonicalFactAuthoritySchema,
  ShadowCanonicalFactSchema,
  ShadowCanonicalPatchSchema,
  ShadowPatchAuditResultSchema,
  auditShadowCanonicalPatch,
  type CanonicalFactAuthority,
  type ShadowCanonicalFact,
  type ShadowCanonicalPatch,
} from "./battle-canonical-patch.js";
import {
  CanonicalReadConsistencySchema,
  ConsistencySliceSchema,
  ProjectionPurposeSchema,
  type ConsistencyFactRow,
  type ConsistencySlice,
} from "./battle-projection.js";
import { SemanticValueSchema, type SemanticValue } from "./semantic-state.js";

export const READ_COHERENCE_POC_LIMITS = {
  maxAttempts: 5,
  maxRepairCalls: 5,
  maxConflictFacts: 8,
  maxTouchedFacts: 16,
  maxAttemptReceipts: 5,
} as const;

const CanonicalRefSchema = z.string().min(1).max(200);
const FactRefSchema = z.string().min(1).max(240);
const IssueRefSchema = z.string().min(1).max(160);
const RepairRefSchema = z.string()
  .min(8)
  .max(180)
  .regex(/^repair:[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const ConsistencyRepairStrategySchema = z.enum([
  "select",
  "reinterpret",
  "intermediate_state",
  "weaken_claim",
  "reset_unknown",
]);
export type ConsistencyRepairStrategy = z.infer<
  typeof ConsistencyRepairStrategySchema
>;

export const ReadCoherenceLimitsSchema = z.object({
  maxAttempts: z.number().int().min(1)
    .max(READ_COHERENCE_POC_LIMITS.maxAttempts)
    .default(3),
  maxRepairCalls: z.number().int().min(1)
    .max(READ_COHERENCE_POC_LIMITS.maxRepairCalls)
    .default(3),
  maxTouchedFacts: z.number().int().min(1)
    .max(READ_COHERENCE_POC_LIMITS.maxTouchedFacts)
    .default(8),
}).strict();
export type ReadCoherenceLimits = z.infer<typeof ReadCoherenceLimitsSchema>;

const UniqueConflictFactRefsSchema = z.array(FactRefSchema)
  .min(2)
  .max(READ_COHERENCE_POC_LIMITS.maxConflictFacts)
  .refine(
    (refs) => new Set(refs).size === refs.length,
    "conflicting fact references must be unique",
  );

export const LocalConsistencyConflictSchema = z.object({
  id: z.string().regex(/^local-conflict\.[0-9]{4}$/u),
  subjectRef: CanonicalRefSchema,
  predicate: z.string().min(1).max(120),
  objectRef: CanonicalRefSchema.nullable(),
  factRefs: UniqueConflictFactRefsSchema,
  distinctClaimCount: z.number().int().min(2),
}).strict();
export type LocalConsistencyConflict = z.infer<
  typeof LocalConsistencyConflictSchema
>;

export const PurposeScopedReadCheckSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow_read_check"),
  purpose: ProjectionPurposeSchema,
  complete: z.boolean(),
  value: ConsistencySliceSchema,
  consistency: CanonicalReadConsistencySchema,
  checkedEntityRefs: z.array(CanonicalRefSchema).max(128),
  conflicts: z.array(LocalConsistencyConflictSchema).max(128),
  blockingIssueRefs: z.array(IssueRefSchema).max(64),
  reason: z.string().min(1).max(1000),
}).strict();
export type PurposeScopedReadCheck = z.infer<
  typeof PurposeScopedReadCheckSchema
>;

const RepairReplacementSchema = z.object({
  subjectRef: CanonicalRefSchema,
  predicate: z.string().min(1).max(120),
  objectRef: CanonicalRefSchema.optional(),
  value: SemanticValueSchema.optional(),
}).strict();
export type RepairReplacement = z.infer<typeof RepairReplacementSchema>;

const RepairPlanBaseShape = {
  repairRef: RepairRefSchema,
  issueRef: IssueRefSchema.optional(),
  turn: z.number().int().nonnegative(),
  conflictFactRefs: UniqueConflictFactRefsSchema,
};

export const ConsistencyRepairPlanSchema = z.discriminatedUnion("strategy", [
  z.object({
    ...RepairPlanBaseShape,
    strategy: z.literal("select"),
  }).strict(),
  z.object({
    ...RepairPlanBaseShape,
    strategy: z.literal("reinterpret"),
    replacement: RepairReplacementSchema,
  }).strict(),
  z.object({
    ...RepairPlanBaseShape,
    strategy: z.literal("intermediate_state"),
  }).strict(),
  z.object({
    ...RepairPlanBaseShape,
    strategy: z.literal("weaken_claim"),
  }).strict(),
  z.object({
    ...RepairPlanBaseShape,
    strategy: z.literal("reset_unknown"),
  }).strict(),
]);
export type ConsistencyRepairPlan = z.infer<
  typeof ConsistencyRepairPlanSchema
>;

const ProposedRepairSchema = z.object({
  status: z.literal("proposed"),
  strategy: ConsistencyRepairStrategySchema,
  issueRef: IssueRefSchema.optional(),
  retainedFactRefs: z.array(FactRefSchema)
    .max(READ_COHERENCE_POC_LIMITS.maxConflictFacts),
  retractedFactRefs: z.array(FactRefSchema)
    .max(READ_COHERENCE_POC_LIMITS.maxConflictFacts),
  patch: ShadowCanonicalPatchSchema,
  audit: ShadowPatchAuditResultSchema,
  reason: z.string().min(1).max(1000),
}).strict();

const RejectedRepairSchema = z.object({
  status: z.literal("rejected"),
  strategy: ConsistencyRepairStrategySchema,
  issueRef: IssueRefSchema.optional(),
  retainedFactRefs: z.array(FactRefSchema).max(0),
  retractedFactRefs: z.array(FactRefSchema).max(0),
  reason: z.string().min(1).max(1000),
}).strict();

export const ShadowConsistencyRepairProposalSchema = z.discriminatedUnion(
  "status",
  [ProposedRepairSchema, RejectedRepairSchema],
);
export type ShadowConsistencyRepairProposal = z.infer<
  typeof ShadowConsistencyRepairProposalSchema
>;

export const ShadowReadRepairRunSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("shadow_repair_preview"),
  outcome: z.enum([
    "unchanged",
    "repaired",
    "partial",
    "unresolved",
    "limit_reached",
  ]),
  initial: PurposeScopedReadCheckSchema,
  final: PurposeScopedReadCheckSchema,
  attempts: z.array(ShadowConsistencyRepairProposalSchema)
    .max(READ_COHERENCE_POC_LIMITS.maxAttemptReceipts),
  appliedPatches: z.array(ShadowCanonicalPatchSchema)
    .max(READ_COHERENCE_POC_LIMITS.maxAttempts),
  shadowResolvedIssueRefs: z.array(IssueRefSchema).max(64),
  attemptsUsed: z.number().int().nonnegative()
    .max(READ_COHERENCE_POC_LIMITS.maxAttempts),
  repairCallsUsed: z.number().int().nonnegative()
    .max(READ_COHERENCE_POC_LIMITS.maxRepairCalls),
  totalTouchedFacts: z.number().int().nonnegative()
    .max(READ_COHERENCE_POC_LIMITS.maxTouchedFacts),
  externalLlmCallsMade: z.literal(0),
  sourceFactsMutated: z.literal(false),
  sourceSliceMutated: z.literal(false),
  reason: z.string().min(1).max(1000),
}).strict();
export type ShadowReadRepairRun = z.infer<typeof ShadowReadRepairRunSchema>;

type FlatFact = {
  subjectRef: string;
  row: ConsistencyFactRow;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function flatFacts(slice: ConsistencySlice): FlatFact[] {
  return slice.factGroups.flatMap((group) =>
    group.facts.map((row) => ({ subjectRef: group.subjectRef, row }))
  );
}

function factSlot(fact: FlatFact): string {
  return JSON.stringify([
    fact.subjectRef,
    fact.row[1],
    fact.row[1].startsWith("relation.") ? fact.row[2] : null,
  ]);
}

function factClaim(fact: FlatFact): string {
  return JSON.stringify([
    fact.row[2],
    fact.row.length === 7
      ? ["present", fact.row[6]]
      : ["absent"],
  ]);
}

function validityOverlaps(left: FlatFact, right: FlatFact): boolean {
  const from = Math.max(left.row[3], right.row[3]);
  const leftTo = left.row[4] ?? Number.POSITIVE_INFINITY;
  const rightTo = right.row[4] ?? Number.POSITIVE_INFINITY;
  return from <= Math.min(leftTo, rightTo);
}

function detectConflicts(slice: ConsistencySlice): {
  conflicts: LocalConsistencyConflict[];
  overflow: boolean;
} {
  const groups = new Map<string, FlatFact[]>();
  for (const fact of flatFacts(slice)) {
    const slot = factSlot(fact);
    groups.set(slot, [...(groups.get(slot) ?? []), fact]);
  }
  const conflicts: LocalConsistencyConflict[] = [];
  let overflow = false;
  for (const facts of groups.values()) {
    const involved = new Set<string>();
    for (let left = 0; left < facts.length; left += 1) {
      for (let right = left + 1; right < facts.length; right += 1) {
        if (
          factClaim(facts[left]!) !== factClaim(facts[right]!) &&
          validityOverlaps(facts[left]!, facts[right]!)
        ) {
          involved.add(facts[left]!.row[0]);
          involved.add(facts[right]!.row[0]);
        }
      }
    }
    if (involved.size < 2) continue;
    if (involved.size > READ_COHERENCE_POC_LIMITS.maxConflictFacts) {
      overflow = true;
      continue;
    }
    const first = facts[0]!;
    const involvedFacts = facts.filter((fact) => involved.has(fact.row[0]));
    conflicts.push(LocalConsistencyConflictSchema.parse({
      id: "local-conflict.0000",
      subjectRef: first.subjectRef,
      predicate: first.row[1],
      objectRef: first.row[1].startsWith("relation.") ? first.row[2] : null,
      factRefs: uniqueSorted(involved),
      distinctClaimCount: new Set(involvedFacts.map(factClaim)).size,
    }));
  }
  return {
    overflow,
    conflicts: conflicts
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    .map((conflict, index) => LocalConsistencyConflictSchema.parse({
      ...conflict,
      id: `local-conflict.${String(index + 1).padStart(4, "0")}`,
    })),
  };
}

function relevantBlockingIssueRefs(slice: ConsistencySlice): string[] {
  const facts = new Set(flatFacts(slice).map((fact) => fact.row[0]));
  const entities = new Set(slice.scope.entityRefs);
  return uniqueSorted(slice.issues.filter((issue) => {
    if (
      issue.status === "resolved" ||
      !issue.blocksPurposes.includes(slice.purpose)
    ) return false;
    if (
      issue.involvedFactRefs.length === 0 &&
      issue.involvedEntityRefs.length === 0
    ) return true;
    return issue.involvedFactRefs.some((ref) => facts.has(ref)) ||
      issue.involvedEntityRefs.some((ref) => entities.has(ref));
  }).map((issue) => issue.id));
}

export function checkPurposeScopedConsistencySlice(
  rawSlice: ConsistencySlice,
): PurposeScopedReadCheck {
  const slice = ConsistencySliceSchema.parse(clone(rawSlice));
  const checkedFactRefs = uniqueSorted(
    flatFacts(slice).map((fact) => fact.row[0]),
  );
  const detected = detectConflicts(slice);
  const conflicts = detected.conflicts;
  const blockingIssueRefs = relevantBlockingIssueRefs(slice);
  const complete = !slice.scope.truncated && !detected.overflow;
  const level = !complete
    ? "unchecked"
    : conflicts.length > 0 || blockingIssueRefs.length > 0
      ? "conflicted"
      : "locally_coherent";
  const reason = slice.scope.truncated
    ? "the purpose slice is truncated, so local coherence was not claimed"
    : detected.overflow
      ? "a conflict exceeded the bounded fact limit, so local coherence was not claimed"
    : level === "conflicted"
      ? "the complete purpose slice contains a direct conflict or relevant unresolved issue"
      : "no conflict was found in the complete purpose slice; this is not a global coherence claim";
  return PurposeScopedReadCheckSchema.parse({
    schemaVersion: 1,
    mode: "shadow_read_check",
    purpose: slice.purpose,
    complete,
    value: slice,
    consistency: {
      level,
      checkedFactRefs,
      unresolvedIssueRefs: blockingIssueRefs,
    },
    checkedEntityRefs: uniqueSorted(slice.scope.entityRefs),
    conflicts,
    blockingIssueRefs,
    reason,
  });
}

function sourceForFact(fact: ShadowCanonicalFact): ConsistencyFactRow[5] {
  switch (fact.provenance.subsystem) {
    case "mechanical": return "mechanical";
    case "world": return "world";
    case "semantic": return "semantic";
    case "free_action": return "event";
    case "repair": return "repair";
  }
}

function rowForFact(fact: ShadowCanonicalFact): ConsistencyFactRow {
  const core: ConsistencyFactRow = [
    fact.id,
    fact.predicate,
    fact.objectRef ?? null,
    fact.validFrom.turn,
    fact.validTo?.turn ?? null,
    sourceForFact(fact),
  ];
  return Object.hasOwn(fact, "value") ? [...core, clone(fact.value)] : core;
}

function factsMatchSlice(
  slice: ConsistencySlice,
  facts: readonly ShadowCanonicalFact[],
): boolean {
  const sliceRows = new Map(flatFacts(slice).map((fact) => [
    fact.row[0],
    JSON.stringify([fact.subjectRef, fact.row]),
  ]));
  const canonicalRows = new Map(facts.map((fact) => [
    fact.id,
    JSON.stringify([fact.subjectRef, rowForFact(fact)]),
  ]));
  return [...sliceRows].every(([ref, row]) => canonicalRows.get(ref) === row);
}

function authorityStrength(authority: CanonicalFactAuthority): number {
  const parsed = CanonicalFactAuthoritySchema.parse(authority);
  switch (parsed) {
    case "deterministic_resolver": return 4;
    case "validated_semantic_transition": return 3;
    case "validated_world_transition": return 3;
    case "free_action_commit": return 2;
    case "repair": return 1;
  }
}

function causalStrength(slice: ConsistencySlice, factRef: string): number {
  return slice.causalLinks
    .filter((link) => link[1] === factRef)
    .reduce((highest, link) => {
      const weight = link[2] === "modified"
        ? 4
        : link[2] === "triggered"
          ? 3
          : link[2] === "created"
            ? 2
            : 1;
      return Math.max(highest, weight);
    }, 0);
}

function rankFact(slice: ConsistencySlice, fact: ShadowCanonicalFact): number[] {
  return [
    fact.validFrom.turn,
    causalStrength(slice, fact.id),
    authorityStrength(fact.provenance.authority),
  ];
}

function compareRank(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function rejected(
  plan: ConsistencyRepairPlan,
  reason: string,
): ShadowConsistencyRepairProposal {
  return ShadowConsistencyRepairProposalSchema.parse({
    status: "rejected",
    strategy: plan.strategy,
    issueRef: plan.issueRef,
    retainedFactRefs: [],
    retractedFactRefs: [],
    reason,
  });
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
}

function replacementForPlan(input: {
  plan: ConsistencyRepairPlan;
  facts: ShadowCanonicalFact[];
}): RepairReplacement | null {
  const first = input.facts[0]!;
  const relationObject = first.predicate.startsWith("relation.")
    ? { objectRef: first.objectRef }
    : {};
  switch (input.plan.strategy) {
    case "select": return null;
    case "reinterpret": return input.plan.replacement;
    case "intermediate_state":
      return {
        subjectRef: first.subjectRef,
        predicate: first.predicate,
        ...relationObject,
        value: {
          repairState: "intermediate",
          basisCount: input.facts.length,
        },
      };
    case "weaken_claim":
      return {
        subjectRef: first.subjectRef,
        predicate: first.predicate,
        ...relationObject,
        value: {
          repairState: "weakened",
          basisCount: input.facts.length,
        },
      };
    case "reset_unknown":
      return {
        subjectRef: first.subjectRef,
        predicate: first.predicate,
        ...relationObject,
        value: { repairState: "unknown" },
      };
  }
}

function replacementFitsSlot(input: {
  replacement: RepairReplacement;
  conflict: LocalConsistencyConflict;
}): boolean {
  if (
    input.replacement.subjectRef !== input.conflict.subjectRef ||
    input.replacement.predicate !== input.conflict.predicate
  ) return false;
  if (input.conflict.predicate.startsWith("relation.")) {
    return (input.replacement.objectRef ?? null) === input.conflict.objectRef;
  }
  return true;
}

function buildRepairAssertion(input: {
  plan: ConsistencyRepairPlan;
  replacement: RepairReplacement;
}): ShadowCanonicalFact {
  const raw: Record<string, unknown> = {
    id: `${input.plan.repairRef}.fact.0001`,
    subjectRef: input.replacement.subjectRef,
    predicate: input.replacement.predicate,
    validFrom: { turn: input.plan.turn },
    provenance: {
      subsystem: "repair",
      authority: "repair",
      sourceRef: input.plan.repairRef,
      sourceEventRefs: [input.plan.repairRef],
    },
  };
  if (input.replacement.objectRef !== undefined) {
    raw.objectRef = input.replacement.objectRef;
  }
  if (Object.hasOwn(input.replacement, "value")) {
    raw.value = clone(input.replacement.value as SemanticValue);
  }
  return ShadowCanonicalFactSchema.parse(raw);
}

export function proposeShadowConsistencyRepair(input: {
  slice: ConsistencySlice;
  currentFacts: readonly ShadowCanonicalFact[];
  plan: ConsistencyRepairPlan;
  maxTouchedFacts?: number;
}): ShadowConsistencyRepairProposal {
  const slice = ConsistencySliceSchema.parse(clone(input.slice));
  const currentFacts = input.currentFacts.map((fact) =>
    ShadowCanonicalFactSchema.parse(clone(fact))
  );
  const plan = ConsistencyRepairPlanSchema.parse(clone(input.plan));
  const maxTouchedFacts = z.number().int().min(1)
    .max(READ_COHERENCE_POC_LIMITS.maxTouchedFacts)
    .parse(input.maxTouchedFacts ?? 8);
  const check = checkPurposeScopedConsistencySlice(slice);
  if (!check.complete) {
    return rejected(plan, "repair requires a complete purpose slice");
  }
  if (new Set(currentFacts.map((fact) => fact.id)).size !== currentFacts.length) {
    return rejected(plan, "canonical fact inputs contain duplicate fact IDs");
  }
  if (!factsMatchSlice(slice, currentFacts)) {
    return rejected(plan, "canonical fact inputs do not exactly cover the checked slice rows");
  }
  const conflict = check.conflicts.find((candidate) =>
    sameRefs(candidate.factRefs, plan.conflictFactRefs)
  );
  if (!conflict) {
    return rejected(plan, "repair fact references do not name one complete local conflict");
  }
  if (plan.issueRef) {
    const issue = slice.issues.find((candidate) => candidate.id === plan.issueRef);
    if (!issue || issue.status === "resolved") {
      return rejected(plan, "repair references an absent or already resolved issue");
    }
    const issueMatches = issue.involvedFactRefs.length > 0
      ? plan.conflictFactRefs.every((ref) =>
          issue.involvedFactRefs.includes(ref)
        )
      : issue.involvedEntityRefs.includes(conflict.subjectRef);
    if (
      !issue.blocksPurposes.includes(slice.purpose) ||
      !issueMatches
    ) {
      return rejected(plan, "repair issue is unrelated to this purpose conflict");
    }
  }
  const byRef = new Map(currentFacts.map((fact) => [fact.id, fact]));
  const conflictFacts = plan.conflictFactRefs.map((ref) => byRef.get(ref));
  if (conflictFacts.some((fact) => !fact)) {
    return rejected(plan, "repair references a fact absent from canonical inputs");
  }
  const facts = conflictFacts as ShadowCanonicalFact[];
  if (facts.some((fact) => plan.turn < fact.validFrom.turn)) {
    return rejected(plan, "repair cannot precede a conflicting fact");
  }

  let retainedFactRefs: string[] = [];
  let retractedFactRefs: string[];
  let assertion: ShadowCanonicalFact | undefined;
  if (plan.strategy === "select") {
    const ranked = facts.map((fact) => ({ fact, rank: rankFact(slice, fact) }))
      .sort((left, right) => compareRank(right.rank, left.rank));
    if (
      ranked.length > 1 &&
      compareRank(ranked[0]!.rank, ranked[1]!.rank) === 0
    ) {
      return rejected(
        plan,
        "select has no unique causally and authoritatively stronger fact",
      );
    }
    retainedFactRefs = [ranked[0]!.fact.id];
    retractedFactRefs = facts
      .filter((fact) => fact.id !== ranked[0]!.fact.id)
      .map((fact) => fact.id);
  } else {
    retractedFactRefs = facts.map((fact) => fact.id);
    const replacement = replacementForPlan({ plan, facts })!;
    if (!replacementFitsSlot({ replacement, conflict })) {
      return rejected(plan, "replacement does not refine the conflicted canonical slot");
    }
    assertion = buildRepairAssertion({ plan, replacement });
  }
  const touchedFactCount = retractedFactRefs.length + (assertion ? 1 : 0);
  if (touchedFactCount > maxTouchedFacts) {
    return rejected(plan, "repair would exceed the touched-fact limit");
  }
  const touchedRefs = uniqueSorted([
    ...facts.map((fact) => fact.subjectRef),
    ...facts.flatMap((fact) => fact.objectRef ? [fact.objectRef] : []),
    ...(assertion?.objectRef ? [assertion.objectRef] : []),
  ]);
  if (touchedRefs.some((ref) => !slice.scope.entityRefs.includes(ref))) {
    return rejected(plan, "repair would touch an entity outside the checked slice");
  }
  const patch = ShadowCanonicalPatchSchema.parse({
    schemaVersion: 1,
    mode: "shadow",
    sourceRef: plan.repairRef,
    assertions: assertion ? [assertion] : [],
    retractions: uniqueSorted(retractedFactRefs),
    causalLinks: [
      ...retractedFactRefs.map((targetFactRef) => ({
        sourceRef: plan.repairRef,
        targetFactRef,
        relation: "ended" as const,
      })),
      ...(assertion
        ? [{
            sourceRef: plan.repairRef,
            targetFactRef: assertion.id,
            relation: "created" as const,
          }]
        : []),
    ],
    touchedRefs,
  });
  const audit = auditShadowCanonicalPatch({
    patch,
    context: {
      knownEntityRefs: slice.scope.entityRefs,
      existingFacts: currentFacts,
      contextComplete: true,
    },
  });
  if (audit.verdict !== "no_issue_found") {
    return rejected(plan, `repair patch audit failed: ${audit.verdict}`);
  }
  return ShadowConsistencyRepairProposalSchema.parse({
    status: "proposed",
    strategy: plan.strategy,
    issueRef: plan.issueRef,
    retainedFactRefs,
    retractedFactRefs: uniqueSorted(retractedFactRefs),
    patch,
    audit,
    reason: "a bounded RepairRef patch was produced without canonical mutation",
  });
}

function applyShadowPatch(
  facts: readonly ShadowCanonicalFact[],
  patch: ShadowCanonicalPatch,
): ShadowCanonicalFact[] {
  const retracted = new Set(patch.retractions);
  return [
    ...facts.filter((fact) => !retracted.has(fact.id)).map(clone),
    ...patch.assertions.map(clone),
  ];
}

function rebuildSlice(input: {
  slice: ConsistencySlice;
  facts: readonly ShadowCanonicalFact[];
  patches: readonly ShadowCanonicalPatch[];
  shadowResolvedIssueRefs: readonly string[];
}): ConsistencySlice {
  const sourceFactRefs = new Set(flatFacts(input.slice).map((fact) => fact.row[0]));
  const assertionRefs = new Set(
    input.patches.flatMap((patch) => patch.assertions.map((fact) => fact.id)),
  );
  const included = input.facts.filter((fact) =>
    sourceFactRefs.has(fact.id) || assertionRefs.has(fact.id)
  );
  const groups = new Map<string, ConsistencyFactRow[]>();
  for (const fact of included) {
    groups.set(fact.subjectRef, [
      ...(groups.get(fact.subjectRef) ?? []),
      rowForFact(fact),
    ]);
  }
  const causalLinks = [
    ...input.slice.causalLinks,
    ...input.patches.flatMap((patch) => patch.causalLinks.map((link) => [
      link.sourceRef,
      link.targetFactRef,
      link.relation,
    ] as const)),
  ];
  const seenLinks = new Set<string>();
  return ConsistencySliceSchema.parse({
    ...clone(input.slice),
    factGroups: [...groups].map(([subjectRef, facts]) => ({ subjectRef, facts })),
    causalLinks: causalLinks.filter((link) => {
      const key = JSON.stringify(link);
      if (seenLinks.has(key)) return false;
      seenLinks.add(key);
      return true;
    }),
    issues: input.slice.issues.map((issue) =>
      input.shadowResolvedIssueRefs.includes(issue.id)
        ? { ...issue, status: "resolved" as const }
        : clone(issue)
    ),
  });
}

export function runShadowConsistencyRepair(input: {
  slice: ConsistencySlice;
  currentFacts: readonly ShadowCanonicalFact[];
  plans: readonly ConsistencyRepairPlan[];
  allowShadowRepair: boolean;
  limits?: Partial<ReadCoherenceLimits>;
}): ShadowReadRepairRun {
  const sourceSlice = ConsistencySliceSchema.parse(clone(input.slice));
  const sourceFacts = input.currentFacts.map((fact) =>
    ShadowCanonicalFactSchema.parse(clone(fact))
  );
  const limits = ReadCoherenceLimitsSchema.parse(input.limits ?? {});
  const initial = checkPurposeScopedConsistencySlice(sourceSlice);
  if (initial.consistency.level === "locally_coherent") {
    return ShadowReadRepairRunSchema.parse({
      schemaVersion: 1,
      mode: "shadow_repair_preview",
      outcome: "unchanged",
      initial,
      final: initial,
      attempts: [],
      appliedPatches: [],
      shadowResolvedIssueRefs: [],
      attemptsUsed: 0,
      repairCallsUsed: 0,
      totalTouchedFacts: 0,
      externalLlmCallsMade: 0,
      sourceFactsMutated: false,
      sourceSliceMutated: false,
      reason: "the complete purpose slice was already locally coherent",
    });
  }
  if (!input.allowShadowRepair) {
    return ShadowReadRepairRunSchema.parse({
      schemaVersion: 1,
      mode: "shadow_repair_preview",
      outcome: "unresolved",
      initial,
      final: initial,
      attempts: [],
      appliedPatches: [],
      shadowResolvedIssueRefs: [],
      attemptsUsed: 0,
      repairCallsUsed: 0,
      totalTouchedFacts: 0,
      externalLlmCallsMade: 0,
      sourceFactsMutated: false,
      sourceSliceMutated: false,
      reason: "shadow repair was not explicitly enabled",
    });
  }

  let currentSlice = clone(sourceSlice);
  let currentFacts = sourceFacts.map(clone);
  const attempts: ShadowConsistencyRepairProposal[] = [];
  const appliedPatches: ShadowCanonicalPatch[] = [];
  const shadowResolvedIssueRefs: string[] = [];
  let totalTouchedFacts = 0;
  let limitReached = false;
  for (const rawPlan of input.plans) {
    if (
      attempts.length >= limits.maxAttempts ||
      attempts.length >= limits.maxRepairCalls
    ) {
      limitReached = true;
      break;
    }
    if (totalTouchedFacts >= limits.maxTouchedFacts) {
      limitReached = true;
      break;
    }
    const plan = ConsistencyRepairPlanSchema.parse(clone(rawPlan));
    const proposal = proposeShadowConsistencyRepair({
      slice: currentSlice,
      currentFacts,
      plan,
      maxTouchedFacts: Math.min(
        limits.maxTouchedFacts - totalTouchedFacts,
        READ_COHERENCE_POC_LIMITS.maxTouchedFacts,
      ),
    });
    attempts.push(proposal);
    if (proposal.status === "rejected") continue;
    const touched = proposal.patch.retractions.length +
      proposal.patch.assertions.length;
    if (totalTouchedFacts + touched > limits.maxTouchedFacts) {
      limitReached = true;
      break;
    }
    totalTouchedFacts += touched;
    appliedPatches.push(proposal.patch);
    currentFacts = applyShadowPatch(currentFacts, proposal.patch);
    if (proposal.issueRef) shadowResolvedIssueRefs.push(proposal.issueRef);
    currentSlice = rebuildSlice({
      slice: sourceSlice,
      facts: currentFacts,
      patches: appliedPatches,
      shadowResolvedIssueRefs: uniqueSorted(shadowResolvedIssueRefs),
    });
    const checked = checkPurposeScopedConsistencySlice(currentSlice);
    if (checked.consistency.level === "locally_coherent") break;
  }

  const checkedFinal = checkPurposeScopedConsistencySlice(currentSlice);
  const repaired = appliedPatches.length > 0 &&
    checkedFinal.consistency.level === "locally_coherent";
  const final = repaired
    ? PurposeScopedReadCheckSchema.parse({
        ...checkedFinal,
        consistency: { ...checkedFinal.consistency, level: "repaired" },
        reason: "a locally coherent preview was rebuilt from bounded RepairRef patches",
      })
    : checkedFinal;
  const outcome = repaired
    ? "repaired"
    : limitReached
      ? "limit_reached"
      : appliedPatches.length > 0
        ? "partial"
        : "unresolved";
  return ShadowReadRepairRunSchema.parse({
    schemaVersion: 1,
    mode: "shadow_repair_preview",
    outcome,
    initial,
    final,
    attempts,
    appliedPatches,
    shadowResolvedIssueRefs: uniqueSorted(shadowResolvedIssueRefs),
    attemptsUsed: attempts.length,
    repairCallsUsed: attempts.length,
    totalTouchedFacts,
    externalLlmCallsMade: 0,
    sourceFactsMutated: false,
    sourceSliceMutated: false,
    reason: repaired
      ? "bounded shadow repair produced a locally coherent purpose slice preview"
      : limitReached
        ? "repair stopped at a configured attempt, call, or touched-fact limit"
        : "the supplied bounded repair plans did not produce a locally coherent preview",
  });
}
