import { z } from "zod";
import {
  CharacterBattleCompilerInputsV3Schema,
  CharacterConsciousSelfStaticProjectionV2Schema,
  PsycheTraitProfileV1Schema,
} from "./battle-character-compiler.js";
import {
  CombatReadyCharacterSheetSchema,
  type CharacterSheet,
} from "./character.js";
import {
  CharacterActionNormProgramV2Schema,
  CharacterNormFactV2Schema,
  CharacterRelationshipResolutionV2Schema,
  compileCharacterRelationshipProgramV2,
  resolveCharacterRelationshipV2,
  type CharacterNormFactV2,
} from "./character-definition-rules.js";
import {
  CharacterDefinitionV2ObjectSchema,
  CharacterDefinitionV2Schema,
  CharacterDescriptionV2Schema,
  CharacterNormClauseV2Schema,
  characterDefinitionToLegacySheetProjection,
  compileCharacterPsycheTraitsV1,
  projectCharacterConsciousSelfV2,
  projectCharacterNarratorViewsV2,
  type CharacterDefinitionV2,
} from "./structured-character.js";
import {
  type AssetPublicPresentationV2,
  CompilerRequirementSchema,
  assetGenerationEnvelopeV2Schema,
} from "./structured-assets.js";

export const CHARACTER_DEFINITION_SCHEMA_VERSION_V3 = 3;

const StableIdSchema = z.string().min(1).max(120);
const AwarenessSchema = z.enum(["unaware", "partial", "aware"]);
const CharacterActionKindV3Schema = z.enum([
  "basic_action",
  "skill",
  "defend",
  "wait",
  "free_action",
]);

const CharacterActionNormV3ObjectSchema = z.object({
  id: StableIdSchema,
  when: z.object({
    match: z.enum(["all", "any"]),
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
  }).strict(),
  response: z.object({
    disposition: z.enum(["prefer", "avoid", "allow_only", "forbid"]),
    actionRefs: z.array(StableIdSchema).max(8),
    actionKinds: z.array(CharacterActionKindV3Schema).max(5),
    tacticTags: z.array(z.string().min(1).max(80)).max(8),
  }).strict(),
  priority: z.number().int().min(0).max(100),
  force: z.enum(["preference", "commitment", "constraint"]),
  exceptions: z.array(z.object({
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
    description: z.string().min(1).max(320),
  }).strict()).max(4),
  description: CharacterDescriptionV2Schema.nullable(),
}).strict();

export const CharacterActionNormV3Schema = CharacterActionNormV3ObjectSchema
  .superRefine((norm, context) => {
    const selectorCount = norm.response.actionRefs.length +
      norm.response.actionKinds.length + norm.response.tacticTags.length;
    if (selectorCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "V3 action norm requires at least one action selector",
        path: ["response"],
      });
    }
    const restrictive = norm.response.disposition === "allow_only" ||
      norm.response.disposition === "forbid";
    if (restrictive !== (norm.force === "constraint")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allow_only/forbid require constraint; prefer/avoid do not",
        path: ["force"],
      });
    }
  });
export type CharacterActionNormV3 = z.infer<typeof CharacterActionNormV3Schema>;

export const CharacterConsciousGuidanceV1Schema = z.object({
  id: StableIdSchema,
  applicability: z.object({
    match: z.enum(["all", "any"]),
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
  }).strict(),
  statement: z.string().min(1).max(320),
  priority: z.number().int().min(0).max(100),
  force: z.enum(["preference", "commitment"]),
  selfAwareness: AwarenessSchema,
  exceptions: z.array(z.object({
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
    description: z.string().min(1).max(320),
  }).strict()).max(4),
  description: CharacterDescriptionV2Schema.nullable(),
}).strict();
export type CharacterConsciousGuidanceV1 = z.infer<
  typeof CharacterConsciousGuidanceV1Schema
>;

export const CharacterMechanicalConflictFallbackV1Schema = z.object({
  id: StableIdSchema,
  applicability: z.object({
    match: z.enum(["all", "any"]),
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
  }).strict(),
  orderedActionRefs: z.array(StableIdSchema).min(1).max(8),
  priority: z.number().int().min(0).max(100),
  receiptContract: z.literal("character-mechanical-conflict-receipt-v1"),
}).strict();
export type CharacterMechanicalConflictFallbackV1 = z.infer<
  typeof CharacterMechanicalConflictFallbackV1Schema
>;

export const CharacterMechanicalConflictReceiptV1Schema = z.object({
  contractVersion: z.literal(1),
  fallbackId: StableIdSchema,
  legalityCheckedActionRefs: z.array(StableIdSchema).min(1).max(8),
  rejectedActionRefs: z.array(StableIdSchema).max(8),
  selectedActionRef: StableIdSchema.nullable(),
}).strict().superRefine((receipt, context) => {
  if (receipt.selectedActionRef &&
      !receipt.legalityCheckedActionRefs.includes(receipt.selectedActionRef)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "selected fallback action must have a legality check",
      path: ["selectedActionRef"],
    });
  }
});

export const CharacterDefinitionV3ObjectSchema = CharacterDefinitionV2ObjectSchema
  .omit({ schemaVersion: true, actionNorms: true })
  .extend({
    schemaVersion: z.literal(CHARACTER_DEFINITION_SCHEMA_VERSION_V3),
    actionNorms: z.array(CharacterActionNormV3Schema).max(12),
    consciousGuidance: z.array(CharacterConsciousGuidanceV1Schema).max(12),
    mechanicalConflictFallbacks: z.array(
      CharacterMechanicalConflictFallbackV1Schema,
    ).max(8),
  })
  .strict();

export const CharacterDefinitionV3Schema = CharacterDefinitionV3ObjectSchema
  .superRefine((definition, context) => {
    const {
      schemaVersion: _schemaVersion,
      actionNorms,
      consciousGuidance: _consciousGuidance,
      mechanicalConflictFallbacks: _mechanicalConflictFallbacks,
      ...v2StableFields
    } = definition;
    const v2Equivalent = CharacterDefinitionV2Schema.safeParse({
      ...v2StableFields,
      schemaVersion: 2,
      actionNorms: actionNorms.map((norm) => ({
        ...norm,
        response: {
          ...norm.response,
          statement: norm.description?.text ?? `action norm ${norm.id}`,
          fallbackActionRef: null,
        },
        selfAwareness: "aware",
      })),
    });
    if (!v2Equivalent.success) {
      for (const issue of v2Equivalent.error.issues) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: issue.path,
        });
      }
    }

    const actionIds = new Set([
      definition.capabilities.basicAction.id,
      ...definition.capabilities.skills.map((skill) => skill.id),
    ]);
    const semanticIds = [
      ...definition.actionNorms.map((entry) => entry.id),
      ...definition.consciousGuidance.map((entry) => entry.id),
      ...definition.mechanicalConflictFallbacks.map((entry) => entry.id),
    ];
    const seen = new Set<string>();
    for (const [index, id] of semanticIds.entries()) {
      if (seen.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate V3 semantic id: ${id}`,
          path: ["semanticEntries", index],
        });
      }
      seen.add(id);
    }
    for (const [fallbackIndex, fallback] of
      definition.mechanicalConflictFallbacks.entries()) {
      for (const [actionIndex, actionRef] of
        fallback.orderedActionRefs.entries()) {
        if (!actionIds.has(actionRef)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `unknown mechanical fallback action: ${actionRef}`,
            path: [
              "mechanicalConflictFallbacks",
              fallbackIndex,
              "orderedActionRefs",
              actionIndex,
            ],
          });
        }
      }
    }
  });
export type CharacterDefinitionV3 = z.infer<typeof CharacterDefinitionV3Schema>;

const REGISTERED_CHARACTER_COMPILER_CAPABILITY_PAIRS_V1 = [
  ["character-profile", 2],
  ["character-profile-claim-validator", 1],
  ["battle-mechanics", 3],
  ["psyche-trait-profile", 1],
  ["character-conscious-self", 3],
  ["character-narrator-view", 2],
  ["character-image-brief", 2],
  ["character-observable-manifestation", 2],
  ["character-action-norms", 3],
  ["character-mechanical-conflict-fallback", 1],
  ["character-relationship", 2],
] as const;

const RegisteredCharacterCompilerConsumerV1Schema = z.enum([
  "character-profile",
  "character-profile-claim-validator",
  "battle-mechanics",
  "psyche-trait-profile",
  "character-conscious-self",
  "character-narrator-view",
  "character-image-brief",
  "character-observable-manifestation",
  "character-action-norms",
  "character-mechanical-conflict-fallback",
  "character-relationship",
]);

export const CharacterCompilerCapabilityV1Schema = z.object({
  consumer: RegisteredCharacterCompilerConsumerV1Schema,
  version: z.number().int().positive(),
}).strict().superRefine((capability, context) => {
  const registered = REGISTERED_CHARACTER_COMPILER_CAPABILITY_PAIRS_V1.some(
    ([consumer, version]) =>
      consumer === capability.consumer && version === capability.version,
  );
  if (!registered) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `unregistered character compiler capability: ${capability.consumer}@${capability.version}`,
      path: ["version"],
    });
  }
});
export type CharacterCompilerCapabilityV1 = z.infer<
  typeof CharacterCompilerCapabilityV1Schema
>;

export const CharacterCompilerCapabilitySetV1Schema = z.object({
  contractVersion: z.literal(1),
  required: z.array(CharacterCompilerCapabilityV1Schema).min(1).max(24),
}).strict().superRefine((set, context) => {
  const keys = set.required.map(characterCompilerCapabilityKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "duplicate required character compiler capability",
      path: ["required"],
    });
  }
});
export type CharacterCompilerCapabilitySetV1 = z.infer<
  typeof CharacterCompilerCapabilitySetV1Schema
>;

export const CharacterDeferredValueV1Schema = z.object({
  targetPath: z.string().min(1).max(240),
  reason: z.string().min(1).max(320),
  candidateSourcePaths: z.array(z.string().min(1).max(240)).max(12),
  requiringCapability: CharacterCompilerCapabilityV1Schema,
}).strict();
export type CharacterDeferredValueV1 = z.infer<
  typeof CharacterDeferredValueV1Schema
>;

export const CharacterDeferredValueCollectionV1Schema = z.object({
  contractVersion: z.literal(1),
  values: z.array(CharacterDeferredValueV1Schema).max(64),
}).strict().superRefine((collection, context) => {
  const paths = collection.values.map((entry) => entry.targetPath);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "duplicate deferred target path",
      path: ["values"],
    });
  }
});

export const CharacterCompilerCompatibilityV1Schema = z.object({
  contractVersion: z.literal(1),
  status: z.enum(["ready", "blocked"]),
  supported: z.array(CharacterCompilerCapabilityV1Schema).max(24),
  blocked: z.array(z.object({
    capability: CharacterCompilerCapabilityV1Schema,
    reasonCode: z.string().min(1).max(120),
  }).strict()).max(24),
  deferred: z.array(z.object({
    capability: CharacterCompilerCapabilityV1Schema,
    targetPaths: z.array(z.string().min(1).max(240)).min(1).max(64),
  }).strict()).max(24),
}).strict();
export type CharacterCompilerCompatibilityV1 = z.infer<
  typeof CharacterCompilerCompatibilityV1Schema
>;

function characterCompilerCapabilityKey(
  capability: CharacterCompilerCapabilityV1,
): string {
  return `${capability.consumer}@${capability.version}`;
}

export function projectCharacterCompilerCompatibilityV1(input: {
  required: CharacterCompilerCapabilitySetV1;
  available: CharacterCompilerCapabilityV1[];
  deferredValues: CharacterDeferredValueV1[];
  blocked: Array<{
    capability: CharacterCompilerCapabilityV1;
    reasonCode: string;
  }>;
}): CharacterCompilerCompatibilityV1 {
  const required = CharacterCompilerCapabilitySetV1Schema.parse(input.required);
  const available = input.available.map((capability) =>
    CharacterCompilerCapabilityV1Schema.parse(capability));
  const deferredValues = input.deferredValues.map((value) =>
    CharacterDeferredValueV1Schema.parse(value));
  const blocked = input.blocked.map((entry) => ({
    capability: CharacterCompilerCapabilityV1Schema.parse(entry.capability),
    reasonCode: entry.reasonCode,
  }));
  const availableKeys = new Set(available.map(characterCompilerCapabilityKey));
  const blockedByKey = new Map(blocked.map((entry) => [
    characterCompilerCapabilityKey(entry.capability),
    entry,
  ]));
  const deferredByKey = new Map<string, {
    capability: CharacterCompilerCapabilityV1;
    targetPaths: string[];
  }>();
  for (const value of deferredValues) {
    const key = characterCompilerCapabilityKey(value.requiringCapability);
    const current = deferredByKey.get(key);
    deferredByKey.set(key, {
      capability: value.requiringCapability,
      targetPaths: [...(current?.targetPaths ?? []), value.targetPath],
    });
  }
  const blockedResultByKey = new Map(blocked.map((entry) => [
    characterCompilerCapabilityKey(entry.capability),
    entry,
  ]));
  let requiredBlocked = false;
  let requiredDeferred = false;
  for (const capability of required.required) {
    const key = characterCompilerCapabilityKey(capability);
    const explicitBlock = blockedByKey.get(key);
    const deferredEntry = deferredByKey.get(key);
    if (explicitBlock) {
      requiredBlocked = true;
      continue;
    }
    if (deferredEntry) {
      requiredDeferred = true;
    } else if (!availableKeys.has(key)) {
      requiredBlocked = true;
      blockedResultByKey.set(key, {
        capability,
        reasonCode: "capability_unavailable",
      });
    }
  }
  const supportedByKey = new Map(available.map((capability) => [
    characterCompilerCapabilityKey(capability),
    capability,
  ]));
  const deferred = [...deferredByKey.values()].map((entry) => ({
    capability: entry.capability,
    targetPaths: [...new Set(entry.targetPaths)],
  }));
  return CharacterCompilerCompatibilityV1Schema.parse({
    contractVersion: 1,
    status: !requiredBlocked && !requiredDeferred
      ? "ready"
      : "blocked",
    supported: [...supportedByKey.values()],
    blocked: [...blockedResultByKey.values()],
    deferred,
  });
}

const CharacterGenerationEnvelopeV3ObjectSchema = assetGenerationEnvelopeV2Schema(
  CharacterDefinitionV3Schema,
).extend({
  deferredValues: CharacterDeferredValueCollectionV1Schema,
}).strict();

export const CharacterGenerationEnvelopeV3Schema =
  CharacterGenerationEnvelopeV3ObjectSchema.superRefine((envelope, context) => {
    if (envelope.definitionSchema.family !== "character" ||
        envelope.definitionSchema.version !== CHARACTER_DEFINITION_SCHEMA_VERSION_V3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "character envelope requires character definition schema v3",
        path: ["definitionSchema"],
      });
    }
    for (const [index, compiler] of envelope.compilerCompatibility.entries()) {
      const result = CharacterCompilerCapabilityV1Schema.safeParse(compiler);
      if (!result.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unregistered V3 character compiler capability",
          path: ["compilerCompatibility", index],
        });
      }
    }
  });
export type CharacterGenerationEnvelopeV3 = z.infer<
  typeof CharacterGenerationEnvelopeV3Schema
>;

export function characterDefinitionV3ToLegacySheet(input: {
  characterId: string;
  ownerUserId: string;
  definition: CharacterDefinitionV3;
  publicPresentation: AssetPublicPresentationV2;
  createdAt: string;
  updatedAt: string;
  previousImageUrl?: string | null;
  operational?: Partial<Pick<CharacterSheet,
    "visibility" | "record" | "recordOverall" | "improvementMemo" |
    "opponentMemories" | "deletedAt" | "revisionSnapshot">>;
}): ReturnType<typeof characterDefinitionToLegacySheetProjection> {
  return characterDefinitionToLegacySheetProjection({
    ...input,
    definition: CharacterDefinitionV3Schema.parse(input.definition),
  });
}

const CompiledCharacterActionNormV3Schema = CharacterActionNormV3ObjectSchema
  .omit({ description: true })
  .strict();

export const CharacterActionNormProgramV3Schema = z.object({
  contractVersion: z.literal(3),
  norms: z.array(CompiledCharacterActionNormV3Schema).max(12),
  actionCatalog: CharacterActionNormProgramV2Schema.shape.actionCatalog,
}).strict();
export type CharacterActionNormProgramV3 = z.infer<
  typeof CharacterActionNormProgramV3Schema
>;

export const CharacterNormActionCandidateV3Schema = z.object({
  actionKey: z.string().min(1).max(160),
  actionRef: StableIdSchema.nullable(),
  actionKind: CharacterActionKindV3Schema.nullable(),
  tacticTags: z.array(z.string().min(1).max(80)).max(8),
}).strict();
export type CharacterNormActionCandidateV3 = z.infer<
  typeof CharacterNormActionCandidateV3Schema
>;

export const CharacterActionNormResolutionReceiptV3Schema = z.object({
  contractVersion: z.literal(3),
  status: z.enum(["no_applicable_norm", "applied", "character_norm_conflict"]),
  applicableNormIds: z.array(StableIdSchema).max(12),
  exceptedNormIds: z.array(StableIdSchema).max(12),
  constraintNormIds: z.array(StableIdSchema).max(12),
  excludedActionKeys: z.array(z.string().min(1).max(160)).max(32),
  rankedActionKeys: z.array(z.string().min(1).max(160)).max(32),
  conflict: z.object({
    normIds: z.array(StableIdSchema).max(12),
    fallbackId: StableIdSchema.nullable(),
    legalityCheckedActionRefs: z.array(StableIdSchema).max(8),
    rejectedActionRefs: z.array(StableIdSchema).max(8),
    selectedActionRef: StableIdSchema.nullable(),
  }).strict().nullable(),
}).strict();
export type CharacterActionNormResolutionReceiptV3 = z.infer<
  typeof CharacterActionNormResolutionReceiptV3Schema
>;

export const CharacterConsciousGuidanceProgramV1Schema = z.object({
  contractVersion: z.literal(1),
  entries: z.array(CharacterConsciousGuidanceV1Schema).max(12),
}).strict();

export const CharacterMechanicalConflictFallbackProgramV1Schema = z.object({
  contractVersion: z.literal(1),
  entries: z.array(CharacterMechanicalConflictFallbackV1Schema).max(8),
}).strict();
export type CharacterMechanicalConflictFallbackProgramV1 = z.infer<
  typeof CharacterMechanicalConflictFallbackProgramV1Schema
>;

export const CharacterBattleCompilerInputsV4Schema =
  CharacterBattleCompilerInputsV3Schema.omit({ actionNorms: true })
    .extend({
      actionNorms: CharacterActionNormProgramV3Schema,
      consciousGuidance: CharacterConsciousGuidanceProgramV1Schema,
      mechanicalConflictFallbacks:
        CharacterMechanicalConflictFallbackProgramV1Schema,
    })
    .strict();
export type CharacterBattleCompilerInputsV4 = z.infer<
  typeof CharacterBattleCompilerInputsV4Schema
>;

export const CharacterGenerationV3BasicAttackSourceSchema = z.object({
  kind: z.literal("character_generation_v3"),
  generationId: z.string().min(1),
  definitionPath: z.literal("capabilities.basicAction"),
}).strict();

export const BattleCharacterAssetBindingV4Schema = z.object({
  assetId: z.string().min(1),
  generationId: z.string().min(1),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: CombatReadyCharacterSheetSchema,
  basicAttackSource: CharacterGenerationV3BasicAttackSourceSchema,
  compilerInputsV4: CharacterBattleCompilerInputsV4Schema,
}).strict().superRefine((binding, context) => {
  if (binding.basicAttackSource.generationId !== binding.generationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "V3 basic attack source must match the bound character generation",
      path: ["basicAttackSource", "generationId"],
    });
  }
});

export function compileCharacterActionNormProgramV3(
  definition: CharacterDefinitionV3,
): CharacterActionNormProgramV3 {
  const parsed = CharacterDefinitionV3Schema.parse(definition);
  return CharacterActionNormProgramV3Schema.parse({
    contractVersion: 3,
    norms: parsed.actionNorms.map((norm) => ({
      id: norm.id,
      when: norm.when,
      response: norm.response,
      priority: norm.priority,
      force: norm.force,
      exceptions: norm.exceptions,
    })),
    actionCatalog: [
      {
        actionRef: parsed.capabilities.basicAction.id,
        actionKind: "basic_action",
        tacticTags: parsed.capabilities.basicAction.tacticTags,
      },
      ...parsed.capabilities.skills.map((skill) => ({
        actionRef: skill.id,
        actionKind: "skill",
        tacticTags: skill.tacticTags,
      })),
    ],
  });
}

export function compileCharacterConsciousGuidanceV1(
  definition: CharacterDefinitionV3,
) {
  const parsed = CharacterDefinitionV3Schema.parse(definition);
  return CharacterConsciousGuidanceProgramV1Schema.parse({
    contractVersion: 1,
    entries: parsed.consciousGuidance,
  });
}

export function compileCharacterMechanicalConflictFallbacksV1(
  definition: CharacterDefinitionV3,
) {
  const parsed = CharacterDefinitionV3Schema.parse(definition);
  return CharacterMechanicalConflictFallbackProgramV1Schema.parse({
    contractVersion: 1,
    entries: parsed.mechanicalConflictFallbacks,
  });
}

export function resolveCharacterMechanicalConflictFallbackV1(input: {
  fallback: CharacterMechanicalConflictFallbackV1;
  legalActionRefs: string[];
}) {
  const fallback = CharacterMechanicalConflictFallbackV1Schema.parse(
    input.fallback,
  );
  const legalActionRefs = new Set(input.legalActionRefs.map((actionRef) =>
    StableIdSchema.parse(actionRef)));
  const selectedActionRef = fallback.orderedActionRefs.find((actionRef) =>
    legalActionRefs.has(actionRef)) ?? null;
  return CharacterMechanicalConflictReceiptV1Schema.parse({
    contractVersion: 1,
    fallbackId: fallback.id,
    legalityCheckedActionRefs: fallback.orderedActionRefs,
    rejectedActionRefs: fallback.orderedActionRefs.filter((actionRef) =>
      !legalActionRefs.has(actionRef)),
    selectedActionRef,
  });
}

const V3_NORM_FORCE_RANK = {
  constraint: 3,
  commitment: 2,
  preference: 1,
} as const;

const V3_ORDERED_FACT_VALUES: Record<string, readonly string[] | undefined> = {
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

const V3_RESOURCE_BANDS = ["empty", "critical", "low", "taxed", "ready", "full"];
const V3_RESOURCE_KEYS = new Set(["hp", "mp", "stamina", "focus"]);

function v3OrderedValues(kind: string, value: string): readonly string[] | null {
  if (kind !== "resource_band") return V3_ORDERED_FACT_VALUES[kind] ?? null;
  const separator = value.indexOf(":");
  const resource = separator < 0 ? "" : value.slice(0, separator);
  return V3_RESOURCE_KEYS.has(resource)
    ? V3_RESOURCE_BANDS.map((band) => `${resource}:${band}`)
    : null;
}

function v3ClauseMatches(
  clause: CharacterActionNormV3["when"]["clauses"][number],
  facts: readonly CharacterNormFactV2[],
): boolean {
  if (clause.kind === "always") {
    return clause.operator === "is" && clause.value === "true";
  }
  const matching = facts.filter((fact) => fact.kind === clause.kind);
  if (clause.operator === "is") {
    return matching.some((fact) => fact.value === clause.value);
  }
  if (clause.operator === "is_not") {
    return matching.length > 0 && matching.every((fact) => fact.value !== clause.value);
  }
  const ordered = v3OrderedValues(clause.kind, clause.value);
  const expected = ordered?.indexOf(clause.value) ?? -1;
  if (expected < 0) return false;
  return matching.some((fact) => {
    const actual = ordered?.indexOf(fact.value) ?? -1;
    return actual >= 0 && (clause.operator === "at_least"
      ? actual >= expected
      : actual <= expected);
  });
}

function v3ClausesMatch(
  clauses: readonly CharacterActionNormV3["when"]["clauses"][number][],
  match: "all" | "any",
  facts: readonly CharacterNormFactV2[],
): boolean {
  return match === "all"
    ? clauses.every((clause) => v3ClauseMatches(clause, facts))
    : clauses.some((clause) => v3ClauseMatches(clause, facts));
}

function v3ActionMatches(
  action: CharacterNormActionCandidateV3,
  norm: CharacterActionNormProgramV3["norms"][number],
): boolean {
  return Boolean(
    (action.actionRef && norm.response.actionRefs.includes(action.actionRef)) ||
    (action.actionKind && norm.response.actionKinds.includes(action.actionKind)) ||
    action.tacticTags.some((tag) => norm.response.tacticTags.includes(tag)),
  );
}

function v3CompareNorms(
  left: CharacterActionNormProgramV3["norms"][number],
  right: CharacterActionNormProgramV3["norms"][number],
): number {
  return V3_NORM_FORCE_RANK[right.force] - V3_NORM_FORCE_RANK[left.force] ||
    right.priority - left.priority ||
    right.when.clauses.length - left.when.clauses.length ||
    left.id.localeCompare(right.id);
}

function v3CompareActions(
  left: CharacterNormActionCandidateV3,
  right: CharacterNormActionCandidateV3,
  norms: readonly CharacterActionNormProgramV3["norms"][number][],
  originalIndex: ReadonlyMap<string, number>,
): number {
  for (const norm of norms) {
    const leftSignal = v3ActionMatches(left, norm)
      ? norm.response.disposition === "prefer" ? 1 : -1
      : 0;
    const rightSignal = v3ActionMatches(right, norm)
      ? norm.response.disposition === "prefer" ? 1 : -1
      : 0;
    if (leftSignal !== rightSignal) return rightSignal - leftSignal;
  }
  return (originalIndex.get(left.actionKey) ?? 0) -
    (originalIndex.get(right.actionKey) ?? 0);
}

/**
 * Resolves V3 mechanical action norms. Conscious guidance is intentionally not
 * input to this evaluator; ADR-0030 keeps it out of action selection.
 */
export function evaluateCharacterActionNormsV3(input: {
  program: CharacterActionNormProgramV3;
  mechanicalConflictFallbacks: CharacterMechanicalConflictFallbackProgramV1;
  facts: readonly CharacterNormFactV2[];
  legalActions: readonly CharacterNormActionCandidateV3[];
}): {
  actions: CharacterNormActionCandidateV3[];
  receipt: CharacterActionNormResolutionReceiptV3;
} {
  const program = CharacterActionNormProgramV3Schema.parse(input.program);
  const fallbacks = CharacterMechanicalConflictFallbackProgramV1Schema.parse(
    input.mechanicalConflictFallbacks,
  );
  const facts = z.array(CharacterNormFactV2Schema).max(64).parse(input.facts);
  const legalActions = z.array(CharacterNormActionCandidateV3Schema).max(32)
    .refine(
      (actions) => new Set(actions.map((action) => action.actionKey)).size ===
        actions.length,
      "character norm action keys must be unique",
    )
    .parse(input.legalActions);
  const excepted = new Set<string>();
  const applicable = program.norms.filter((norm) => {
    if (!v3ClausesMatch(norm.when.clauses, norm.when.match, facts)) return false;
    const hasException = norm.exceptions.some((exception) =>
      v3ClausesMatch(exception.clauses, "all", facts)
    );
    if (hasException) excepted.add(norm.id);
    return !hasException;
  }).sort(v3CompareNorms);
  const constraints = applicable.filter((norm) => norm.force === "constraint");
  let remaining = [...legalActions];
  for (const norm of constraints) {
    remaining = norm.response.disposition === "allow_only"
      ? remaining.filter((action) => v3ActionMatches(action, norm))
      : remaining.filter((action) => !v3ActionMatches(action, norm));
  }
  const conflict = legalActions.length > 0 && remaining.length === 0 &&
    constraints.length > 0;
  let conflictReceipt: CharacterActionNormResolutionReceiptV3["conflict"] = null;
  if (conflict) {
    const fallback = fallbacks.entries
      .filter((entry) => v3ClausesMatch(
        entry.applicability.clauses,
        entry.applicability.match,
        facts,
      ))
      .sort((left, right) => right.priority - left.priority ||
        left.id.localeCompare(right.id))[0];
    if (fallback) {
      const fallbackReceipt = resolveCharacterMechanicalConflictFallbackV1({
        fallback,
        legalActionRefs: legalActions.flatMap((action) =>
          action.actionRef ? [action.actionRef] : []),
      });
      const selectedAction = fallbackReceipt.selectedActionRef
        ? legalActions.find((action) =>
          action.actionRef === fallbackReceipt.selectedActionRef
        ) ?? null
        : null;
      remaining = selectedAction ? [selectedAction] : [];
      conflictReceipt = {
        normIds: constraints.map((norm) => norm.id),
        fallbackId: fallbackReceipt.fallbackId,
        legalityCheckedActionRefs: fallbackReceipt.legalityCheckedActionRefs,
        rejectedActionRefs: fallbackReceipt.rejectedActionRefs,
        selectedActionRef: fallbackReceipt.selectedActionRef,
      };
    } else {
      conflictReceipt = {
        normIds: constraints.map((norm) => norm.id),
        fallbackId: null,
        legalityCheckedActionRefs: [],
        rejectedActionRefs: [],
        selectedActionRef: null,
      };
    }
  }
  const softNorms = applicable.filter((norm) => norm.force !== "constraint");
  const originalIndex = new Map(
    legalActions.map((action, index) => [action.actionKey, index]),
  );
  const ranked = remaining.sort((left, right) =>
    v3CompareActions(left, right, softNorms, originalIndex));
  const retained = new Set(ranked.map((action) => action.actionKey));
  return {
    actions: ranked,
    receipt: CharacterActionNormResolutionReceiptV3Schema.parse({
      contractVersion: 3,
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
      conflict: conflictReceipt,
    }),
  };
}

function v3StableProjectionDefinition(
  definition: CharacterDefinitionV3,
): CharacterDefinitionV2 {
  const {
    schemaVersion: _schemaVersion,
    actionNorms: _actionNorms,
    consciousGuidance: _consciousGuidance,
    mechanicalConflictFallbacks: _mechanicalConflictFallbacks,
    ...stable
  } = definition;
  return CharacterDefinitionV2Schema.parse({
    ...stable,
    schemaVersion: 2,
    actionNorms: [],
  });
}

/**
 * Compiles the V4 member that a V3 battle manifest freezes. Narrator views and
 * relationship resolution remain optional because their inputs require a
 * disclosure policy and counterpart context that this generic compiler lacks.
 */
export function compileCharacterBattleCompilerInputsV4(
  input: {
    definition: CharacterDefinitionV3;
    counterpartCharacterAssetId?: string;
    relationshipRoles?: Parameters<typeof resolveCharacterRelationshipV2>[0]["relationshipRoles"];
    disclosurePolicy?: Parameters<typeof projectCharacterNarratorViewsV2>[1];
  },
): CharacterBattleCompilerInputsV4 {
  const parsed = CharacterDefinitionV3Schema.parse(input.definition);
  const stable = v3StableProjectionDefinition(parsed);
  const relationship = input.counterpartCharacterAssetId
    ? resolveCharacterRelationshipV2({
      program: compileCharacterRelationshipProgramV2(stable),
      counterpartCharacterAssetId: input.counterpartCharacterAssetId,
      relationshipRoles: input.relationshipRoles,
    })
    : undefined;
  return CharacterBattleCompilerInputsV4Schema.parse({
    psycheTraits: compileCharacterPsycheTraitsV1(stable),
    consciousSelf: CharacterConsciousSelfStaticProjectionV2Schema.parse({
      ...projectCharacterConsciousSelfV2(stable),
      actionPrinciples: parsed.consciousGuidance
        .filter((guidance) => guidance.selfAwareness !== "unaware")
        .map((guidance) => guidance.selfAwareness === "partial"
          ? guidance.statement.slice(0, 160)
          : guidance.statement),
    }),
    actionNorms: compileCharacterActionNormProgramV3(parsed),
    consciousGuidance: compileCharacterConsciousGuidanceV1(parsed),
    mechanicalConflictFallbacks:
      compileCharacterMechanicalConflictFallbacksV1(parsed),
    ...(input.disclosurePolicy
      ? { narratorViews: projectCharacterNarratorViewsV2(stable, input.disclosurePolicy) }
      : {}),
    ...(relationship ? { relationship } : {}),
  });
}

export function resolveRegisteredCharacterMechanicalConflictFallbackV1(input: {
  program: CharacterMechanicalConflictFallbackProgramV1;
  fallbackId: string;
  legalActionRefs: readonly string[];
}): z.infer<typeof CharacterMechanicalConflictReceiptV1Schema> {
  const program = CharacterMechanicalConflictFallbackProgramV1Schema.parse(input.program);
  const fallback = program.entries.find((entry) => entry.id === input.fallbackId);
  if (!fallback) {
    throw new Error(`unknown registered mechanical fallback: ${input.fallbackId}`);
  }
  return resolveCharacterMechanicalConflictFallbackV1({
    fallback,
    legalActionRefs: [...input.legalActionRefs],
  });
}

export function createCharacterGenerationV3BasicAttackSource(input: {
  generationId: string;
}) {
  return CharacterGenerationV3BasicAttackSourceSchema.parse({
    kind: "character_generation_v3",
    generationId: input.generationId,
    definitionPath: "capabilities.basicAction",
  });
}
