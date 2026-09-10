import { z } from "zod";
import {
  CharacterBattleCompilerInputsV3Schema,
  CharacterConsciousSelfStaticProjectionV2Schema,
  CharacterNarratorProjectionSetV2Schema,
  PsycheTraitProfileV1Schema,
} from "./battle.js";
import { CombatReadyCharacterSheetSchema } from "./character.js";
import {
  CharacterActionNormProgramV2Schema,
  CharacterRelationshipResolutionV2Schema,
} from "./character-definition-rules.js";
import {
  CharacterDefinitionV2ObjectSchema,
  CharacterDefinitionV2Schema,
  CharacterDescriptionV2Schema,
  CharacterNormClauseV2Schema,
} from "./structured-character.js";
import {
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

export const CharacterConsciousGuidanceProgramV1Schema = z.object({
  contractVersion: z.literal(1),
  entries: z.array(CharacterConsciousGuidanceV1Schema).max(12),
}).strict();

export const CharacterMechanicalConflictFallbackProgramV1Schema = z.object({
  contractVersion: z.literal(1),
  entries: z.array(CharacterMechanicalConflictFallbackV1Schema).max(8),
}).strict();

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

export function createCharacterGenerationV3BasicAttackSource(input: {
  generationId: string;
}) {
  return CharacterGenerationV3BasicAttackSourceSchema.parse({
    kind: "character_generation_v3",
    generationId: input.generationId,
    definitionPath: "capabilities.basicAction",
  });
}

export const CharacterBattleCompilerInputComponentsV4Schema = z.object({
  psycheTraits: PsycheTraitProfileV1Schema,
  consciousSelf: CharacterConsciousSelfStaticProjectionV2Schema,
  narratorViews: CharacterNarratorProjectionSetV2Schema.optional(),
  relationship: CharacterRelationshipResolutionV2Schema.optional(),
}).strict();
