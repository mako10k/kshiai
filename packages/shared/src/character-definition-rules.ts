import { z } from "zod";
import type { CharacterDefinitionV2 } from "./structured-character.js";

const StableIdSchema = z.string().min(1).max(120);

const CharacterNormClauseKindV2Schema = z.enum([
  "always",
  "battle_phase",
  "self_condition",
  "counterpart_condition",
  "resource_band",
  "distance_band",
  "relationship_band",
  "observed_event_kind",
]);

const CharacterNormClauseV2Schema = z.object({
  kind: CharacterNormClauseKindV2Schema,
  operator: z.enum(["is", "is_not", "at_least", "at_most"]),
  value: z.string().min(1).max(120),
}).strict();

const CharacterNormActionKindV2Schema = z.enum([
  "basic_action",
  "skill",
  "defend",
  "wait",
  "free_action",
]);

const CompiledCharacterActionNormV2Schema = z.object({
  id: StableIdSchema,
  when: z.object({
    match: z.enum(["all", "any"]),
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
  }).strict(),
  response: z.object({
    disposition: z.enum(["prefer", "avoid", "allow_only", "forbid"]),
    actionRefs: z.array(StableIdSchema).max(8),
    actionKinds: z.array(CharacterNormActionKindV2Schema).max(5),
    tacticTags: z.array(z.string().min(1).max(80)).max(8),
    fallbackActionRef: StableIdSchema.nullable(),
    consciousStatement: z.string().min(1).max(320).nullable(),
  }).strict(),
  priority: z.number().int().min(0).max(100),
  force: z.enum(["preference", "commitment", "constraint"]),
  exceptions: z.array(z.object({
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
  }).strict()).max(4),
}).strict();

export const CharacterActionNormProgramV2Schema = z.object({
  contractVersion: z.literal(2),
  norms: z.array(CompiledCharacterActionNormV2Schema).max(12),
  actionCatalog: z.array(z.object({
    actionRef: StableIdSchema,
    actionKind: z.enum(["basic_action", "skill"]),
    tacticTags: z.array(z.string().min(1).max(80)).max(8),
  }).strict()).max(13),
}).strict();
export type CharacterActionNormProgramV2 = z.infer<
  typeof CharacterActionNormProgramV2Schema
>;

export const CharacterNormActionCandidateV2Schema = z.object({
  actionKey: z.string().min(1).max(160),
  actionRef: StableIdSchema.nullable(),
  actionKind: CharacterNormActionKindV2Schema.nullable(),
  tacticTags: z.array(z.string().min(1).max(80)).max(8),
}).strict();
export type CharacterNormActionCandidateV2 = z.infer<
  typeof CharacterNormActionCandidateV2Schema
>;

export const CharacterNormFactV2Schema = z.object({
  kind: CharacterNormClauseKindV2Schema,
  value: z.string().min(1).max(120),
}).strict();
export type CharacterNormFactV2 = z.infer<typeof CharacterNormFactV2Schema>;

const CharacterActionNormReceiptStatusV2Schema = z.enum([
  "no_applicable_norm",
  "applied",
  "character_norm_conflict",
]);

export const CharacterActionNormResolutionReceiptV2Schema = z.object({
  contractVersion: z.literal(2),
  status: CharacterActionNormReceiptStatusV2Schema,
  applicableNormIds: z.array(StableIdSchema).max(12),
  exceptedNormIds: z.array(StableIdSchema).max(12),
  constraintNormIds: z.array(StableIdSchema).max(12),
  excludedActionKeys: z.array(z.string().min(1).max(160)).max(32),
  rankedActionKeys: z.array(z.string().min(1).max(160)).max(32),
  fallback: z.object({
    actionKey: z.string().min(1).max(160),
    actionRef: StableIdSchema.nullable(),
    sourceNormId: StableIdSchema.nullable(),
  }).strict().nullable(),
}).strict();
export type CharacterActionNormResolutionReceiptV2 = z.infer<
  typeof CharacterActionNormResolutionReceiptV2Schema
>;

const CharacterRelationshipTargetV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("character"),
    characterAssetId: z.string().min(1).max(160),
  }).strict(),
  z.object({
    kind: z.literal("role"),
    role: z.enum([
      "stranger",
      "ally",
      "rival",
      "enemy",
      "mentor",
      "student",
      "family",
      "protected_person",
      "other",
    ]),
  }).strict(),
]);

const CompiledCharacterRelationshipSeedV2Schema = z.object({
  id: StableIdSchema,
  target: CharacterRelationshipTargetV2Schema,
  relationKinds: z.array(z.string().min(1).max(80)).max(6),
  history: z.string().min(1).max(600).nullable(),
  defaultAddress: z.string().min(1).max(80).nullable(),
  selfAwareness: z.enum(["unaware", "partial", "aware"]),
  dynamics: z.object({
    trust: z.number().int().min(-1000).max(1000),
    affiliation: z.number().int().min(-1000).max(1000),
    fear: z.number().int().min(-1000).max(1000),
    competition: z.number().int().min(-1000).max(1000),
  }).strict(),
  priority: z.number().int().min(0).max(100),
}).strict();

export const CharacterRelationshipProgramV2Schema = z.object({
  contractVersion: z.literal(2),
  seeds: z.array(CompiledCharacterRelationshipSeedV2Schema).max(24),
}).strict();
export type CharacterRelationshipProgramV2 = z.infer<
  typeof CharacterRelationshipProgramV2Schema
>;

export const CharacterRelationshipResolutionReceiptV2Schema = z.object({
  contractVersion: z.literal(2),
  counterpartCharacterAssetId: z.string().min(1).max(160),
  consideredSeedIds: z.array(StableIdSchema).max(24),
  matchedSeedIds: z.array(StableIdSchema).max(24),
  selectedSeedId: StableIdSchema.nullable(),
  selectedTargetKind: z.enum(["character", "role"]).nullable(),
  selectedRole: z.enum([
    "stranger",
    "ally",
    "rival",
    "enemy",
    "mentor",
    "student",
    "family",
    "protected_person",
    "other",
  ]).nullable(),
}).strict();
export type CharacterRelationshipResolutionReceiptV2 = z.infer<
  typeof CharacterRelationshipResolutionReceiptV2Schema
>;

export const CharacterRelationshipResolutionV2Schema = z.object({
  contractVersion: z.literal(2),
  selected: CompiledCharacterRelationshipSeedV2Schema.nullable(),
  receipt: CharacterRelationshipResolutionReceiptV2Schema,
}).strict();
export type CharacterRelationshipResolutionV2 = z.infer<
  typeof CharacterRelationshipResolutionV2Schema
>;

export const CharacterRelationshipDescriptiveProjectionV2Schema = z.object({
  contractVersion: z.literal(2),
  relationKinds: z.array(z.string().min(1).max(80)).max(6),
  history: z.string().min(1).max(600).nullable(),
  defaultAddress: z.string().min(1).max(80).nullable(),
}).strict();
export type CharacterRelationshipDescriptiveProjectionV2 = z.infer<
  typeof CharacterRelationshipDescriptiveProjectionV2Schema
>;

function consciousStatement(
  awareness: "unaware" | "partial" | "aware",
  statement: string,
): string | null {
  if (awareness === "unaware") return null;
  return awareness === "partial" ? statement.slice(0, 160) : statement;
}

export function compileCharacterActionNormProgramV2(
  definition: CharacterDefinitionV2,
): CharacterActionNormProgramV2 {
  return CharacterActionNormProgramV2Schema.parse({
    contractVersion: 2,
    norms: definition.actionNorms.map((norm) => ({
      id: norm.id,
      when: norm.when,
      response: {
        disposition: norm.response.disposition,
        actionRefs: norm.response.actionRefs,
        actionKinds: norm.response.actionKinds,
        tacticTags: norm.response.tacticTags,
        fallbackActionRef: norm.response.fallbackActionRef,
        consciousStatement: consciousStatement(
          norm.selfAwareness,
          norm.response.statement,
        ),
      },
      priority: norm.priority,
      force: norm.force,
      exceptions: norm.exceptions.map((exception) => ({
        clauses: exception.clauses,
      })),
    })),
    actionCatalog: [
      {
        actionRef: definition.capabilities.basicAction.id,
        actionKind: "basic_action",
        tacticTags: definition.capabilities.basicAction.tacticTags,
      },
      ...definition.capabilities.skills.map((skill) => ({
        actionRef: skill.id,
        actionKind: "skill" as const,
        tacticTags: skill.tacticTags,
      })),
    ],
  });
}

export function compileCharacterRelationshipProgramV2(
  definition: CharacterDefinitionV2,
): CharacterRelationshipProgramV2 {
  return CharacterRelationshipProgramV2Schema.parse({
    contractVersion: 2,
    seeds: definition.relationshipSeeds.map((seed) => ({
      id: seed.id,
      target: seed.target,
      relationKinds: seed.relationKinds,
      history: seed.historySummary?.text ?? null,
      defaultAddress: seed.defaultAddress,
      selfAwareness: seed.selfAwareness,
      dynamics: seed.dynamics,
      priority: seed.priority,
    })),
  });
}

const FORCE_RANK = {
  constraint: 3,
  commitment: 2,
  preference: 1,
} as const;

function compareNorms(
  left: z.infer<typeof CompiledCharacterActionNormV2Schema>,
  right: z.infer<typeof CompiledCharacterActionNormV2Schema>,
): number {
  return FORCE_RANK[right.force] - FORCE_RANK[left.force] ||
    right.priority - left.priority ||
    right.when.clauses.length - left.when.clauses.length ||
    left.id.localeCompare(right.id);
}

const ORDERED_FACT_VALUES: Partial<Record<
  z.infer<typeof CharacterNormClauseKindV2Schema>,
  readonly string[]
>> = {
  battle_phase: ["prologue", "turn", "aftermath"],
  self_condition: ["steady", "strained", "critical", "incapacitated"],
  counterpart_condition: ["steady", "strained", "critical", "incapacitated"],
  distance_band: [
    "contact",
    "near",
    "medium",
    "far",
    "separate_area",
    "out_of_scene",
  ],
};

const RESOURCE_BANDS = ["empty", "critical", "low", "taxed", "ready", "full"];
const RESOURCE_KEYS = ["hp", "mp", "stamina", "focus"];
const REGISTERED_RELATIONSHIP_BANDS = new Set([
  "stranger",
  "ally",
  "rival",
  "enemy",
  "mentor",
  "student",
  "family",
  "protected_person",
  "other",
]);
const REGISTERED_EVENT_KINDS = new Set([
  "damage",
  "heal",
  "rest",
  "parameter",
  "defend",
  "wait",
  "reflect",
  "status",
  "situation",
  "info",
  "utterance",
  "manifestation",
  "free_action",
]);

function orderedValuesFor(
  kind: z.infer<typeof CharacterNormClauseKindV2Schema>,
  value: string,
): readonly string[] | null {
  if (kind === "resource_band") {
    const separator = value.indexOf(":");
    const resource = separator < 0 ? "" : value.slice(0, separator);
    if (!RESOURCE_KEYS.includes(resource)) return null;
    return RESOURCE_BANDS.map((band) => `${resource}:${band}`);
  }
  return ORDERED_FACT_VALUES[kind] ?? null;
}

function registeredValue(
  kind: z.infer<typeof CharacterNormClauseKindV2Schema>,
  value: string,
): boolean {
  if (kind === "always") return value === "true";
  if (kind === "relationship_band") {
    return REGISTERED_RELATIONSHIP_BANDS.has(value);
  }
  if (kind === "observed_event_kind") return REGISTERED_EVENT_KINDS.has(value);
  return orderedValuesFor(kind, value)?.includes(value) ?? false;
}

function clauseMatches(
  clause: z.infer<typeof CharacterNormClauseV2Schema>,
  facts: readonly CharacterNormFactV2[],
): boolean {
  if (!registeredValue(clause.kind, clause.value)) return false;
  const matchingKind = facts.filter((fact) =>
    fact.kind === clause.kind && registeredValue(fact.kind, fact.value)
  );
  if (clause.operator === "is") {
    return matchingKind.some((fact) => fact.value === clause.value);
  }
  if (clause.operator === "is_not") {
    return matchingKind.length > 0 &&
      matchingKind.every((fact) => fact.value !== clause.value);
  }
  const order = orderedValuesFor(clause.kind, clause.value);
  if (!order) return false;
  const expected = order.indexOf(clause.value);
  if (expected < 0) return false;
  return matchingKind.some((fact) => {
    const actual = order.indexOf(fact.value);
    if (actual < 0) return false;
    return clause.operator === "at_least"
      ? actual >= expected
      : actual <= expected;
  });
}

function clausesMatch(
  clauses: readonly z.infer<typeof CharacterNormClauseV2Schema>[],
  match: "all" | "any",
  facts: readonly CharacterNormFactV2[],
): boolean {
  return match === "all"
    ? clauses.every((clause) => clauseMatches(clause, facts))
    : clauses.some((clause) => clauseMatches(clause, facts));
}

function actionMatches(
  action: CharacterNormActionCandidateV2,
  norm: z.infer<typeof CompiledCharacterActionNormV2Schema>,
): boolean {
  return Boolean(
    (action.actionRef && norm.response.actionRefs.includes(action.actionRef)) ||
    (action.actionKind && norm.response.actionKinds.includes(action.actionKind)) ||
    action.tacticTags.some((tag) => norm.response.tacticTags.includes(tag)),
  );
}

function actionSignal(
  action: CharacterNormActionCandidateV2,
  norms: readonly z.infer<typeof CompiledCharacterActionNormV2Schema>[],
): number[] {
  return norms.map((norm) => {
    if (!actionMatches(action, norm)) return 0;
    return norm.response.disposition === "prefer" ? 1 : -1;
  });
}

function compareSignals(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function evaluateCharacterActionNormsV2(input: {
  program: CharacterActionNormProgramV2;
  facts: readonly CharacterNormFactV2[];
  legalActions: readonly CharacterNormActionCandidateV2[];
}): {
  actions: CharacterNormActionCandidateV2[];
  consciousActionPrinciples: string[];
  receipt: CharacterActionNormResolutionReceiptV2;
} {
  const program = CharacterActionNormProgramV2Schema.parse(input.program);
  const facts = z.array(CharacterNormFactV2Schema).max(64).parse(input.facts);
  const legalActions = z.array(CharacterNormActionCandidateV2Schema).max(32)
    .refine(
      (actions) => new Set(actions.map((action) => action.actionKey)).size === actions.length,
      "character norm action keys must be unique",
    )
    .parse(input.legalActions);
  const excepted = new Set<string>();
  const applicable = program.norms.filter((norm) => {
    if (!clausesMatch(norm.when.clauses, norm.when.match, facts)) return false;
    const hasException = norm.exceptions.some((exception) =>
      clausesMatch(exception.clauses, "all", facts)
    );
    if (hasException) excepted.add(norm.id);
    return !hasException;
  }).sort(compareNorms);
  const constraints = applicable.filter((norm) => norm.force === "constraint");
  let remaining = [...legalActions];
  for (const norm of constraints) {
    remaining = norm.response.disposition === "allow_only"
      ? remaining.filter((action) => actionMatches(action, norm))
      : remaining.filter((action) => !actionMatches(action, norm));
  }
  const conflict = legalActions.length > 0 && remaining.length === 0 &&
    constraints.length > 0;
  let fallback: CharacterActionNormResolutionReceiptV2["fallback"] = null;
  if (conflict) {
    for (const norm of applicable) {
      const fallbackAction = norm.response.fallbackActionRef
        ? legalActions.find((action) =>
            action.actionRef === norm.response.fallbackActionRef
          )
        : null;
      if (fallbackAction) {
        remaining = [fallbackAction];
        fallback = {
          actionKey: fallbackAction.actionKey,
          actionRef: fallbackAction.actionRef,
          sourceNormId: norm.id,
        };
        break;
      }
    }
    if (!fallback) {
      const wait = legalActions.find((action) => action.actionKind === "wait");
      if (wait) {
        remaining = [wait];
        fallback = {
          actionKey: wait.actionKey,
          actionRef: wait.actionRef,
          sourceNormId: null,
        };
      }
    }
  }
  const softNorms = applicable.filter((norm) => norm.force !== "constraint");
  const originalIndex = new Map(
    legalActions.map((action, index) => [action.actionKey, index]),
  );
  const ranked = remaining.sort((left, right) =>
    compareSignals(
      actionSignal(left, softNorms),
      actionSignal(right, softNorms),
    ) ||
    (originalIndex.get(left.actionKey) ?? 0) -
      (originalIndex.get(right.actionKey) ?? 0)
  );
  const retained = new Set(ranked.map((action) => action.actionKey));
  const receipt = CharacterActionNormResolutionReceiptV2Schema.parse({
    contractVersion: 2,
    status: conflict
      ? "character_norm_conflict"
      : applicable.length > 0 ? "applied" : "no_applicable_norm",
    applicableNormIds: applicable.map((norm) => norm.id),
    exceptedNormIds: [...excepted].sort(),
    constraintNormIds: constraints.map((norm) => norm.id),
    excludedActionKeys: legalActions
      .filter((action) => !retained.has(action.actionKey))
      .map((action) => action.actionKey),
    rankedActionKeys: ranked.map((action) => action.actionKey),
    fallback,
  });
  return {
    actions: ranked,
    consciousActionPrinciples: applicable.flatMap((norm) =>
      norm.response.consciousStatement ? [norm.response.consciousStatement] : []
    ).slice(0, 12),
    receipt,
  };
}

export function resolveCharacterRelationshipV2(input: {
  program: CharacterRelationshipProgramV2;
  counterpartCharacterAssetId: string;
  relationshipRoles?: ReadonlyArray<
    "stranger" | "ally" | "rival" | "enemy" | "mentor" | "student" |
      "family" | "protected_person" | "other"
  >;
}): CharacterRelationshipResolutionV2 {
  const program = CharacterRelationshipProgramV2Schema.parse(input.program);
  const roles = new Set(input.relationshipRoles ?? []);
  const matches = program.seeds.filter((seed) =>
    seed.target.kind === "character"
      ? seed.target.characterAssetId === input.counterpartCharacterAssetId
      : roles.has(seed.target.role)
  ).sort((left, right) => {
    const leftExact = left.target.kind === "character" ? 1 : 0;
    const rightExact = right.target.kind === "character" ? 1 : 0;
    return rightExact - leftExact ||
      right.priority - left.priority ||
      left.id.localeCompare(right.id);
  });
  const selected = matches[0] ?? null;
  return CharacterRelationshipResolutionV2Schema.parse({
    contractVersion: 2,
    selected,
    receipt: {
      contractVersion: 2,
      counterpartCharacterAssetId: input.counterpartCharacterAssetId,
      consideredSeedIds: program.seeds.map((seed) => seed.id).sort(),
      matchedSeedIds: matches.map((seed) => seed.id),
      selectedSeedId: selected?.id ?? null,
      selectedTargetKind: selected?.target.kind ?? null,
      selectedRole: selected?.target.kind === "role" ? selected.target.role : null,
    },
  });
}

export function projectCharacterRelationshipDescriptionV2(input: {
  resolution: CharacterRelationshipResolutionV2;
  consumer: "deep-psyche" | "conscious-self";
}): CharacterRelationshipDescriptiveProjectionV2 | null {
  const resolution = CharacterRelationshipResolutionV2Schema.parse(
    input.resolution,
  );
  const selected = resolution.selected;
  if (!selected ||
      (input.consumer === "conscious-self" &&
        selected.selfAwareness === "unaware")) {
    return null;
  }
  const partial = input.consumer === "conscious-self" &&
    selected.selfAwareness === "partial";
  return CharacterRelationshipDescriptiveProjectionV2Schema.parse({
    contractVersion: 2,
    relationKinds: partial ? [] : selected.relationKinds,
    history: partial ? selected.history?.slice(0, 160) ?? null : selected.history,
    defaultAddress: partial ? null : selected.defaultAddress,
  });
}
