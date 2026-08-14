import { z } from "zod";
import {
  ActionFeasibilityConstraintsSchema,
  CharacterSheetSchema,
  CombatFlagsSchema,
  ParamKeySchema,
  ParametersSchema,
  defaultBasicAttack,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  type CharacterSheet,
  type Equipment,
  type Skill,
} from "./character.js";
import {
  CharacterConsciousSelfStaticProjectionV2Schema,
  CharacterDeepPsycheStaticProjectionV2Schema,
  CharacterNarratorProjectionSetV2Schema,
  PsycheTraitProfileV1Schema,
  type CharacterNarratorStaticProjectionV2,
} from "./battle.js";
import {
  AssetClaimValidationReceiptV1Schema,
  AssetDisclosurePolicyV1Schema,
  AssetPublicPresentationV2Schema,
  assetGenerationEnvelopeV2Schema,
  type AssetClaimValidationReceiptV1,
  type AssetDisclosurePolicyV1,
  type AssetPublicPresentationV2,
} from "./structured-assets.js";

export const CHARACTER_DEFINITION_SCHEMA_VERSION = 2 as const;
export const CHARACTER_PROFILE_PROJECTION_VERSION = 2 as const;
export const CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT =
  "character-profile-claim-validator-v1" as const;
export const REQUIRED_CHARACTER_COMPILERS_V2 = [
  { consumer: "character-legacy-read-model", version: 2 },
  { consumer: "character-profile", version: 2 },
  { consumer: "character-profile-claim-validator", version: 1 },
  { consumer: "battle-mechanics", version: 2 },
  { consumer: "psyche-trait-profile", version: 1 },
  { consumer: "character-conscious-self", version: 2 },
  { consumer: "character-narrator-view", version: 2 },
  { consumer: "character-image-brief", version: 2 },
  { consumer: "character-observable-manifestation", version: 2 },
  { consumer: "character-action-norms", version: 2 },
  { consumer: "character-relationship", version: 2 },
] as const;

export const RegisteredCharacterConsumerSchema = z.enum([
  "profile-generator",
  "battle-mechanics",
  "deep-psyche",
  "conscious-action",
  "conscious-expression",
  "counterpart-perception",
  "narrator-external",
  "narrator-self-inner",
  "narrator-omniscient",
  "character-image",
]);
export type RegisteredCharacterConsumer = z.infer<
  typeof RegisteredCharacterConsumerSchema
>;

export const CharacterDescriptionV2Schema = z.object({
  text: z.string().min(1).max(600),
  consumerTags: z.array(RegisteredCharacterConsumerSchema).max(6),
  sourceSupportRefs: z.array(z.string().min(1).max(160)).max(8),
}).strict();
export type CharacterDescriptionV2 = z.infer<
  typeof CharacterDescriptionV2Schema
>;

const StableIdSchema = z.string().min(1).max(120);
const AwarenessSchema = z.enum(["unaware", "partial", "aware"]);

export const CharacterRelationshipTargetV2Schema = z.discriminatedUnion(
  "kind",
  [
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
  ],
);
export type CharacterRelationshipTargetV2 = z.infer<
  typeof CharacterRelationshipTargetV2Schema
>;

export const CharacterNormClauseV2Schema = z.object({
  kind: z.enum([
    "always",
    "battle_phase",
    "self_condition",
    "counterpart_condition",
    "resource_band",
    "distance_band",
    "relationship_band",
    "observed_event_kind",
  ]),
  operator: z.enum(["is", "is_not", "at_least", "at_most"]),
  value: z.string().min(1).max(120),
}).strict().superRefine((clause, context) => {
  const values = {
    always: ["true"],
    battle_phase: ["prologue", "turn", "aftermath"],
    self_condition: ["steady", "strained", "critical", "incapacitated"],
    counterpart_condition: ["steady", "strained", "critical", "incapacitated"],
    resource_band: ["empty", "critical", "low", "taxed", "ready", "full"]
      .flatMap((band) => ["hp", "mp", "stamina", "focus"]
        .map((resource) => `${resource}:${band}`)),
    distance_band: [
      "contact",
      "near",
      "medium",
      "far",
      "separate_area",
      "out_of_scene",
    ],
    relationship_band: [
      "stranger",
      "ally",
      "rival",
      "enemy",
      "mentor",
      "student",
      "family",
      "protected_person",
      "other",
    ],
    observed_event_kind: [
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
    ],
  } as const;
  if (!(values[clause.kind] as readonly string[]).includes(clause.value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `unregistered ${clause.kind} value: ${clause.value}`,
      path: ["value"],
    });
  }
  if (
    (clause.operator === "at_least" || clause.operator === "at_most") &&
    ![
      "self_condition",
      "counterpart_condition",
      "resource_band",
      "distance_band",
    ].includes(clause.kind)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${clause.operator} is unavailable for ${clause.kind}`,
      path: ["operator"],
    });
  }
});
export type CharacterNormClauseV2 = z.infer<
  typeof CharacterNormClauseV2Schema
>;

export const CharacterActionNormV2Schema = z.object({
  id: StableIdSchema,
  when: z.object({
    match: z.enum(["all", "any"]),
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
  }).strict(),
  response: z.object({
    disposition: z.enum(["prefer", "avoid", "allow_only", "forbid"]),
    actionRefs: z.array(StableIdSchema).max(8),
    actionKinds: z.array(z.enum([
      "basic_action",
      "skill",
      "defend",
      "wait",
      "free_action",
    ])).max(5),
    tacticTags: z.array(z.string().min(1).max(80)).max(8),
    statement: z.string().min(1).max(320),
    fallbackActionRef: StableIdSchema.nullable(),
  }).strict(),
  priority: z.number().int().min(0).max(100),
  force: z.enum(["preference", "commitment", "constraint"]),
  selfAwareness: AwarenessSchema,
  exceptions: z.array(z.object({
    clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
    description: z.string().min(1).max(320),
  }).strict()).max(4),
  description: CharacterDescriptionV2Schema.nullable(),
}).strict().superRefine((norm, context) => {
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
export type CharacterActionNormV2 = z.infer<typeof CharacterActionNormV2Schema>;

export const CharacterActionDefinitionV2Schema = z.object({
  id: StableIdSchema,
  name: z.string().min(1).max(120),
  description: CharacterDescriptionV2Schema,
  kind: z.enum([
    "basic",
    "attack",
    "magic",
    "defend",
    "support",
    "special",
    "status",
  ]),
  mechanics: z.object({
    targetParameter: ParamKeySchema,
    scalingParameter: ParamKeySchema,
    resistanceParameter: ParamKeySchema,
    power: z.number().min(0).max(3),
    costMp: z.number().int().nonnegative(),
    costStamina: z.number().int().nonnegative(),
    effects: z.array(z.object({
      target: z.enum(["self", "foe"]),
      parameter: ParamKeySchema,
      delta: z.number(),
    }).strict()).max(4),
    constraints: ActionFeasibilityConstraintsSchema,
  }).strict(),
  tacticTags: z.array(z.string().min(1).max(80)).max(8),
  expressionNotes: CharacterDescriptionV2Schema.nullable(),
}).strict();
export type CharacterActionDefinitionV2 = z.infer<
  typeof CharacterActionDefinitionV2Schema
>;

export const CharacterDefinitionV2Schema = z.object({
  schemaVersion: z.literal(CHARACTER_DEFINITION_SCHEMA_VERSION),
  identity: z.object({
    displayName: z.string().min(1).max(48),
    names: z.array(z.object({
      id: StableIdSchema,
      kind: z.enum(["real_name", "nickname", "self_reference", "epithet"]),
      value: z.string().min(1).max(120),
      description: CharacterDescriptionV2Schema.nullable(),
    }).strict()).max(12),
    presentation: z.object({
      form: z.string().min(1).max(120).nullable(),
      gender: z.string().min(1).max(120).nullable(),
      ageDescription: z.string().min(1).max(120).nullable(),
      pronouns: z.array(z.string().min(1).max(40)).max(6),
    }).strict(),
    tags: z.array(z.string().min(1).max(80)).max(12),
  }).strict(),
  appearance: z.object({
    publicSummary: z.string().min(1).max(600),
    details: z.array(z.object({
      id: StableIdSchema,
      region: z.enum([
        "face",
        "hair",
        "body",
        "clothing",
        "accessory",
        "aura",
        "form",
        "other",
      ]),
      description: CharacterDescriptionV2Schema,
    }).strict()).max(16),
    visualPrompt: z.string().min(1).max(1600),
    portrait: z.object({
      mediaId: z.string().min(1).max(200),
      revisionId: z.string().min(1).max(200),
    }).strict().nullable(),
  }).strict(),
  profileBackground: z.array(z.object({
    id: StableIdSchema,
    kind: z.enum([
      "origin",
      "formative_event",
      "role",
      "affiliation",
      "belief_context",
      "relationship_history",
      "other",
    ]),
    summary: z.string().min(1).max(240),
    description: CharacterDescriptionV2Schema,
    selfAwareness: AwarenessSchema,
  }).strict()).max(16),
  psycheDisposition: z.object({
    dynamicsVersion: z.literal("psyche-trait-profile-v1"),
    dynamics: PsycheTraitProfileV1Schema,
    coreNeeds: z.array(z.object({
      id: StableIdSchema,
      description: CharacterDescriptionV2Schema,
      selfAwareness: AwarenessSchema,
    }).strict()).max(6),
    tendencies: z.array(z.object({
      id: StableIdSchema,
      label: z.string().min(1).max(120),
      backgroundRefs: z.array(StableIdSchema).max(6),
      triggerKinds: z.array(z.enum([
        "threat",
        "uncertainty",
        "loss_of_control",
        "humiliation",
        "affiliation",
        "recognition",
        "injury",
        "success",
        "failure",
        "counterpart_distress",
        "environmental_change",
        "other",
      ])).max(6),
      selfAwareness: AwarenessSchema,
      tendencyDescription: CharacterDescriptionV2Schema,
      manifestationDescription: CharacterDescriptionV2Schema,
    }).strict()).max(12),
    description: CharacterDescriptionV2Schema.nullable(),
  }).strict(),
  actionNorms: z.array(CharacterActionNormV2Schema).max(12),
  speechPolicy: z.object({
    selfAwareness: AwarenessSchema,
    frequency: z.enum(["silent", "sparse", "measured", "frequent"]),
    phasePolicy: z.object({
      prologue: z.enum(["avoid", "allow", "prefer"]),
      turn: z.enum(["avoid", "allow", "prefer"]),
      aftermath: z.enum(["avoid", "allow", "prefer"]),
    }).strict(),
    reactTo: z.array(z.enum([
      "direct_address",
      "self_impact",
      "counterpart_impact",
      "ambient_change",
      "relationship_shift",
    ])).max(5),
    silenceRules: z.array(z.object({
      id: StableIdSchema,
      clauses: z.array(CharacterNormClauseV2Schema).min(1).max(6),
      priority: z.number().int().min(0).max(100),
      description: CharacterDescriptionV2Schema.nullable(),
    }).strict()).max(8),
    register: z.string().max(160),
    cadence: z.string().max(160),
    sentenceLength: z.enum(["short", "mixed", "long"]),
    vocabularyHabits: z.array(z.string().min(1).max(80)).max(12),
    addressRules: z.array(z.object({
      id: StableIdSchema,
      target: CharacterRelationshipTargetV2Schema,
      address: z.string().min(1).max(80),
      priority: z.number().int().min(0).max(100),
    }).strict()).max(12),
    selfReferenceNameId: StableIdSchema.nullable(),
    examples: z.array(z.object({
      id: StableIdSchema,
      text: z.string().min(1).max(240),
      tags: z.array(z.string().min(1).max(80)).max(6),
    }).strict()).max(6),
    counterexamples: z.array(z.object({
      id: StableIdSchema,
      text: z.string().min(1).max(240),
      reason: z.string().min(1).max(240),
    }).strict()).max(6),
    description: CharacterDescriptionV2Schema.nullable(),
  }).strict(),
  relationshipSeeds: z.array(z.object({
    id: StableIdSchema,
    target: CharacterRelationshipTargetV2Schema,
    relationKinds: z.array(z.string().min(1).max(80)).max(6),
    historySummary: CharacterDescriptionV2Schema.nullable(),
    defaultAddress: z.string().min(1).max(80).nullable(),
    selfAwareness: AwarenessSchema,
    dynamics: z.object({
      trust: z.number().int().min(-1000).max(1000),
      affiliation: z.number().int().min(-1000).max(1000),
      fear: z.number().int().min(-1000).max(1000),
      competition: z.number().int().min(-1000).max(1000),
    }).strict(),
    priority: z.number().int().min(0).max(100),
  }).strict()).max(24),
  combat: z.object({
    parameters: ParametersSchema,
    flags: CombatFlagsSchema,
  }).strict(),
  capabilities: z.object({
    basicAction: CharacterActionDefinitionV2Schema,
    skills: z.array(CharacterActionDefinitionV2Schema).max(12),
  }).strict(),
  inventory: z.array(z.object({
    id: StableIdSchema,
    name: z.string().min(1).max(120),
    kind: z.enum(["weapon", "armor", "tool", "consumable", "keepsake", "other"]),
    description: CharacterDescriptionV2Schema,
    equipmentBonuses: z.object({
      atk: z.number(),
      def: z.number(),
      mag: z.number(),
    }).strict().nullable(),
    battleStartEffects: z.array(z.object({
      parameter: ParamKeySchema,
      delta: z.number(),
    }).strict()).max(4),
    affordance: z.object({
      portable: z.boolean(),
      usable: z.boolean(),
      useDescriptions: z.array(z.string().min(1).max(240)).max(4),
      causalEnvelope: z.record(z.string(), z.unknown()),
    }).strict(),
  }).strict()).max(16),
  initialLoadout: z.array(z.object({
    itemId: StableIdSchema,
    quantity: z.number().int().min(1).max(20),
    placement: z.enum([
      "held",
      "worn_weapon",
      "worn_armor",
      "carried",
      "reserve",
    ]),
  }).strict()).max(16),
  expressionNotes: CharacterDescriptionV2Schema.nullable(),
}).strict().superRefine((definition, context) => {
  const unique = (ids: string[], path: Array<string | number>) => {
    const seen = new Set<string>();
    for (const [index, id] of ids.entries()) {
      if (seen.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate stable id: ${id}`,
          path: [...path, index, "id"],
        });
      }
      seen.add(id);
    }
  };
  unique(definition.identity.names.map((item) => item.id), ["identity", "names"]);
  unique(definition.profileBackground.map((item) => item.id), ["profileBackground"]);
  unique(definition.psycheDisposition.tendencies.map((item) => item.id), ["psycheDisposition", "tendencies"]);
  unique(definition.actionNorms.map((item) => item.id), ["actionNorms"]);
  unique(definition.relationshipSeeds.map((item) => item.id), ["relationshipSeeds"]);
  unique(definition.capabilities.skills.map((item) => item.id), ["capabilities", "skills"]);
  unique(definition.inventory.map((item) => item.id), ["inventory"]);
  if (definition.capabilities.skills.some((skill) =>
    skill.id === definition.capabilities.basicAction.id
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `duplicate stable action id: ${definition.capabilities.basicAction.id}`,
      path: ["capabilities", "basicAction", "id"],
    });
  }
  const actionIds = new Set([
    definition.capabilities.basicAction.id,
    ...definition.capabilities.skills.map((item) => item.id),
  ]);
  const itemIds = new Set(definition.inventory.map((item) => item.id));
  for (const [index, entry] of definition.initialLoadout.entries()) {
    if (!itemIds.has(entry.itemId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown loadout item: ${entry.itemId}`,
        path: ["initialLoadout", index, "itemId"],
      });
    }
  }
  for (const [index, norm] of definition.actionNorms.entries()) {
    for (const actionRef of [
      ...norm.response.actionRefs,
      ...(norm.response.fallbackActionRef ? [norm.response.fallbackActionRef] : []),
    ]) {
      if (!actionIds.has(actionRef) && !itemIds.has(actionRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown action reference: ${actionRef}`,
          path: ["actionNorms", index, "response", "actionRefs"],
        });
      }
    }
  }
  const canonicalClauses = (
    clauses: CharacterNormClauseV2[],
  ) => clauses
    .map((clause) => `${clause.kind}:${clause.operator}:${clause.value}`)
    .sort()
    .join("|");
  const activationSignature = (
    norm: CharacterActionNormV2,
  ) => JSON.stringify({
    match: norm.when.match,
    clauses: canonicalClauses(norm.when.clauses),
    exceptions: norm.exceptions
      .map((exception) => canonicalClauses(exception.clauses))
      .sort(),
  });
  type StaticNormAction = {
    ref: string | null;
    kind: CharacterActionNormV2["response"]["actionKinds"][number] | null;
    tags: string[];
  };
  const possibleActions: StaticNormAction[] = [
    {
      ref: definition.capabilities.basicAction.id,
      kind: "basic_action",
      tags: definition.capabilities.basicAction.tacticTags,
    },
    ...definition.capabilities.skills.map((skill) => ({
      ref: skill.id,
      kind: "skill" as const,
      tags: skill.tacticTags,
    })),
    { ref: null, kind: "defend" as const, tags: [] as string[] },
    { ref: null, kind: "wait" as const, tags: [] as string[] },
    { ref: null, kind: "free_action" as const, tags: [] as string[] },
    { ref: null, kind: null as null, tags: [] as string[] },
  ];
  const normMatchesAction = (
    norm: CharacterActionNormV2,
    action: StaticNormAction,
  ) => Boolean(
    (action.ref && norm.response.actionRefs.includes(action.ref)) ||
    (action.kind && norm.response.actionKinds.includes(action.kind)) ||
    action.tags.some((tag) => norm.response.tacticTags.includes(tag)),
  );
  const applyConstraint = (
    norm: CharacterActionNormV2,
    actions: StaticNormAction[],
  ) => norm.response.disposition === "allow_only"
    ? actions.filter((action) => normMatchesAction(norm, action))
    : actions.filter((action) => !normMatchesAction(norm, action));
  for (let leftIndex = 0; leftIndex < definition.actionNorms.length; leftIndex += 1) {
    const left = definition.actionNorms[leftIndex];
    if (!left || left.force !== "constraint") continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < definition.actionNorms.length;
      rightIndex += 1
    ) {
      const right = definition.actionNorms[rightIndex];
      if (!right || right.force !== "constraint" ||
          left.priority !== right.priority ||
          left.when.clauses.length !== right.when.clauses.length ||
          activationSignature(left) !== activationSignature(right)) {
        continue;
      }
      const afterLeft = applyConstraint(left, possibleActions);
      const afterRight = applyConstraint(right, possibleActions);
      if (
        afterLeft.length > 0 && afterRight.length > 0 &&
        applyConstraint(right, afterLeft).length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `statically contradictory equal-rank constraints: ${left.id}, ${right.id}`,
          path: ["actionNorms", rightIndex],
        });
      }
    }
  }
  const backgroundIds = new Set(definition.profileBackground.map((item) => item.id));
  for (const [index, tendency] of definition.psycheDisposition.tendencies.entries()) {
    for (const ref of tendency.backgroundRefs) {
      if (!backgroundIds.has(ref)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown background reference: ${ref}`,
          path: ["psycheDisposition", "tendencies", index, "backgroundRefs"],
        });
      }
    }
  }
  const slots = definition.initialLoadout
    .filter((entry) => entry.placement === "worn_weapon" || entry.placement === "worn_armor")
    .map((entry) => entry.placement);
  if (new Set(slots).size !== slots.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "worn loadout slots must be unique",
      path: ["initialLoadout"],
    });
  }
});
export type CharacterDefinitionV2 = z.infer<typeof CharacterDefinitionV2Schema>;

export const CharacterGenerationEnvelopeV2Schema = assetGenerationEnvelopeV2Schema(
  CharacterDefinitionV2Schema,
).superRefine((envelope, context) => {
  if (envelope.definitionSchema.family !== "character" ||
      envelope.definitionSchema.version !== CHARACTER_DEFINITION_SCHEMA_VERSION) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "character envelope requires character definition schema v2",
      path: ["definitionSchema"],
    });
  }
});
export type CharacterGenerationEnvelopeV2 = z.infer<
  typeof CharacterGenerationEnvelopeV2Schema
>;

export type CharacterProfileSourceFactV2 = {
  supportRef: string;
  valuePath: string;
  text: string;
};

export type CharacterProfileSourceProjectionV2 = {
  contractVersion: 2;
  displayName: string;
  facts: CharacterProfileSourceFactV2[];
};

export const CharacterImageBriefV2Schema = z.object({
  contractVersion: z.literal(2),
  publicSummary: z.string().min(1).max(600),
  details: z.array(z.string().min(1).max(600)).max(12),
  visualPrompt: z.string().min(1).max(1600),
}).strict();
export type CharacterImageBriefV2 = z.infer<
  typeof CharacterImageBriefV2Schema
>;

function publicRulePaths(policy: AssetDisclosurePolicyV1): Set<string> {
  return new Set(policy.rules
    .filter((rule) => rule.channel === "profile" && rule.target.kind === "public")
    .map((rule) => rule.valuePath));
}

export function projectCharacterProfileSourceV2(
  definition: CharacterDefinitionV2,
  policy: AssetDisclosurePolicyV1,
): CharacterProfileSourceProjectionV2 {
  CharacterDefinitionV2Schema.parse(definition);
  AssetDisclosurePolicyV1Schema.parse(policy);
  const allowed = publicRulePaths(policy);
  const facts: CharacterProfileSourceFactV2[] = [{
    supportRef: "identity.displayName",
    valuePath: "identity.displayName",
    text: definition.identity.displayName,
  }];
  const add = (valuePath: string, supportRef: string, text: string | null | undefined) => {
    if (text && allowed.has(valuePath)) facts.push({ supportRef, valuePath, text });
  };
  for (const name of definition.identity.names) {
    add("identity.names.*.value", `identity.names.${name.id}.value`, name.value);
  }
  for (const tag of definition.identity.tags) {
    add("identity.tags.*", `identity.tags.${facts.length}`, tag);
  }
  add("appearance.publicSummary", "appearance.publicSummary", definition.appearance.publicSummary);
  for (const entry of definition.profileBackground) {
    add("profileBackground.*.description", `profileBackground.${entry.id}`, entry.description.text);
  }
  for (const tendency of definition.psycheDisposition.tendencies) {
    add("psycheDisposition.tendencies.*.tendencyDescription", `psycheDisposition.tendencies.${tendency.id}`, tendency.tendencyDescription.text);
    add("psycheDisposition.tendencies.*.manifestationDescription", `psycheDisposition.manifestations.${tendency.id}`, tendency.manifestationDescription.text);
  }
  for (const norm of definition.actionNorms) {
    add("actionNorms.*.response.statement", `actionNorms.${norm.id}`, norm.response.statement);
  }
  add("speechPolicy.description", "speechPolicy.description", definition.speechPolicy.description?.text);
  for (const action of [definition.capabilities.basicAction, ...definition.capabilities.skills]) {
    add("capabilities.*.name/description", `capabilities.${action.id}`, `${action.name}: ${action.description.text}`);
  }
  for (const item of definition.inventory) {
    add("inventory.*.name/description", `inventory.${item.id}`, `${item.name}: ${item.description.text}`);
  }
  add("expressionNotes", "expressionNotes", definition.expressionNotes?.text);
  return { contractVersion: 2, displayName: definition.identity.displayName, facts };
}

export function validateCharacterPublicPresentationV2(
  projection: CharacterProfileSourceProjectionV2,
  presentation: AssetPublicPresentationV2,
): AssetPublicPresentationV2 {
  const parsed = AssetPublicPresentationV2Schema.parse(presentation);
  const renderedDescription = parsed.segments
    .map((segment) => segment.text)
    .join("\n\n");
  if (parsed.description !== renderedDescription) {
    throw new Error("PROFILE_DESCRIPTION_SEGMENT_MISMATCH");
  }
  const allowedRefs = new Set(projection.facts.map((fact) => fact.supportRef));
  for (const segment of parsed.segments) {
    if (segment.kind === "fact" && segment.supportRefs.length === 0) {
      throw new Error(`PROFILE_FACT_WITHOUT_SUPPORT:${segment.id}`);
    }
    for (const ref of segment.supportRefs) {
      if (!allowedRefs.has(ref)) throw new Error(`PROFILE_UNKNOWN_SUPPORT:${ref}`);
    }
  }
  return parsed;
}

export function validateCharacterProfileClaimAssessmentV2(
  projection: CharacterProfileSourceProjectionV2,
  presentation: AssetPublicPresentationV2,
  assessment: Pick<AssetClaimValidationReceiptV1,
    "contractVersion" | "validatorContract" | "projectionDigest" | "segments">,
): AssetPublicPresentationV2 {
  const parsed = validateCharacterPublicPresentationV2(projection, presentation);
  const receipt = AssetClaimValidationReceiptV1Schema.parse(assessment);
  if (receipt.validatorContract !== CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT) {
    throw new Error("PROFILE_CLAIM_VALIDATOR_CONTRACT_MISMATCH");
  }
  if (receipt.projectionDigest !== parsed.projectionDigest) {
    throw new Error("PROFILE_CLAIM_PROJECTION_DIGEST_MISMATCH");
  }
  const allowedRefs = new Set(projection.facts.map((fact) => fact.supportRef));
  const candidateById = new Map(parsed.segments.map((segment) => [segment.id, segment]));
  const seen = new Set<string>();
  for (const result of receipt.segments) {
    if (seen.has(result.segmentId)) {
      throw new Error(`PROFILE_CLAIM_DUPLICATE_SEGMENT:${result.segmentId}`);
    }
    seen.add(result.segmentId);
    const candidate = candidateById.get(result.segmentId);
    if (!candidate) {
      throw new Error(`PROFILE_CLAIM_UNKNOWN_SEGMENT:${result.segmentId}`);
    }
    for (const ref of result.supportRefs) {
      if (!allowedRefs.has(ref)) {
        throw new Error(`PROFILE_CLAIM_UNKNOWN_SUPPORT:${ref}`);
      }
    }
    if (result.verdict === "unsupported") {
      throw new Error(`PROFILE_UNSUPPORTED_CLAIM:${result.segmentId}`);
    }
    if (result.riskCodes.length > 0) {
      throw new Error(`PROFILE_CLAIM_RISK:${result.segmentId}`);
    }
    if (candidate.kind === "fact" &&
        (result.verdict !== "supported" || result.supportRefs.length === 0)) {
      throw new Error(`PROFILE_FACT_NOT_VALIDATED:${result.segmentId}`);
    }
    if (result.verdict === "flavor_only" &&
        (candidate.kind !== "flavor" || result.supportRefs.length > 0)) {
      throw new Error(`PROFILE_INVALID_FLAVOR_ASSESSMENT:${result.segmentId}`);
    }
  }
  if (seen.size !== parsed.segments.length) {
    const missing = parsed.segments.find((segment) => !seen.has(segment.id));
    throw new Error(`PROFILE_CLAIM_MISSING_SEGMENT:${missing?.id ?? "unknown"}`);
  }
  return AssetPublicPresentationV2Schema.parse({
    ...parsed,
    claimValidation: receipt,
  });
}

export function assertCharacterGenerationReadyV2(
  envelope: CharacterGenerationEnvelopeV2,
): CharacterGenerationEnvelopeV2 {
  const parsed = CharacterGenerationEnvelopeV2Schema.parse(envelope);
  for (const required of REQUIRED_CHARACTER_COMPILERS_V2) {
    if (!parsed.compilerCompatibility.some((compiler) =>
      compiler.consumer === required.consumer &&
      compiler.version === required.version)) {
      throw new Error(`CHARACTER_REQUIRED_COMPILER_MISSING:${required.consumer}`);
    }
  }
  if (!parsed.publicPresentation.claimValidation) {
    throw new Error("CHARACTER_PROFILE_CLAIM_RECEIPT_MISSING");
  }
  const projection = projectCharacterProfileSourceV2(
    parsed.definition,
    parsed.disclosurePolicy,
  );
  validateCharacterProfileClaimAssessmentV2(
    projection,
    parsed.publicPresentation,
    parsed.publicPresentation.claimValidation,
  );
  return parsed;
}

export function compileCharacterPsycheTraitsV1(
  definition: CharacterDefinitionV2,
) {
  return PsycheTraitProfileV1Schema.parse(definition.psycheDisposition.dynamics);
}

export function projectCharacterDeepPsycheV2(definition: CharacterDefinitionV2) {
  return CharacterDeepPsycheStaticProjectionV2Schema.parse({
    contractVersion: 2 as const,
    background: definition.profileBackground.map((entry) => ({
      id: entry.id,
      text: entry.description.text,
      selfAwareness: entry.selfAwareness,
    })),
    tendencies: definition.psycheDisposition.tendencies.map((tendency) => ({
      id: tendency.id,
      tendency: tendency.tendencyDescription.text,
      manifestation: tendency.manifestationDescription.text,
      backgroundRefs: tendency.backgroundRefs,
      selfAwareness: tendency.selfAwareness,
    })),
    coreNeeds: definition.psycheDisposition.coreNeeds.map((need) => ({
      id: need.id,
      text: need.description.text,
      selfAwareness: need.selfAwareness,
    })),
  });
}

export function projectCharacterConsciousSelfV2(definition: CharacterDefinitionV2) {
  const awareText = (
    awareness: "unaware" | "partial" | "aware",
    text: string,
  ) => awareness === "unaware"
    ? null
    : awareness === "partial"
      ? text.slice(0, 160)
      : text;
  return CharacterConsciousSelfStaticProjectionV2Schema.parse({
    contractVersion: 2 as const,
    displayName: definition.identity.displayName,
    background: definition.profileBackground
      .map((entry) => awareText(entry.selfAwareness, entry.description.text))
      .filter((text): text is string => text != null),
    tendencies: definition.psycheDisposition.tendencies
      .map((item) => awareText(item.selfAwareness, item.tendencyDescription.text))
      .filter((text): text is string => text != null),
    actionPrinciples: definition.actionNorms
      .map((item) => awareText(item.selfAwareness, item.response.statement))
      .filter((text): text is string => text != null),
    speech: {
      register: definition.speechPolicy.register,
      cadence: definition.speechPolicy.cadence,
      sentenceLength: definition.speechPolicy.sentenceLength,
      vocabularyHabits: definition.speechPolicy.vocabularyHabits,
      examples: definition.speechPolicy.examples.slice(0, 2).map((item) => item.text),
    },
  });
}

type CharacterNarratorAccessV2 = CharacterNarratorStaticProjectionV2["access"];
type CharacterNarratorProjectionGroupV2 = Exclude<
  keyof CharacterNarratorStaticProjectionV2,
  "contractVersion" | "access"
>;

function characterNarratorRuleAllows(input: {
  policy: AssetDisclosurePolicyV1;
  valuePath: string;
  access: CharacterNarratorAccessV2;
}): boolean {
  const perspective = input.access === "external"
    ? "external"
    : input.access === "self_inner"
      ? "self_inner"
      : "omniscient";
  return input.policy.rules.some((rule) =>
    rule.valuePath === input.valuePath &&
    rule.channel === "narrator" &&
    rule.target.kind === "narrator" &&
    rule.target.perspective === perspective &&
    (rule.prerequisites.length === 0 ||
      (input.access === "external" &&
        rule.prerequisites.every((item) => item === "observed")))
  );
}

function characterDescriptionAllowsNarrator(
  description: CharacterDescriptionV2,
  access: CharacterNarratorAccessV2,
): boolean {
  const tag = access === "external"
    ? "narrator-external"
    : access === "self_inner"
      ? "narrator-self-inner"
      : "narrator-omniscient";
  return description.consumerTags.includes(tag);
}

function narratorAwarenessText(
  access: CharacterNarratorAccessV2,
  awareness: "unaware" | "partial" | "aware",
  text: string,
): string | null {
  if (access === "external") return null;
  if (access === "omniscient") return text;
  if (awareness === "unaware") return null;
  return awareness === "partial" ? text.slice(0, 160) : text;
}

function buildCharacterNarratorStaticProjectionV2(input: {
  definition: CharacterDefinitionV2;
  policy: AssetDisclosurePolicyV1;
  access: CharacterNarratorAccessV2;
}): CharacterNarratorStaticProjectionV2 {
  const candidates: Array<{
    group: CharacterNarratorProjectionGroupV2;
    text: string;
  }> = [];
  const add = (
    group: CharacterNarratorProjectionGroupV2,
    valuePath: string,
    text: string | null | undefined,
    description?: CharacterDescriptionV2,
  ) => {
    const normalized = text?.trim();
    if (!normalized ||
        !characterNarratorRuleAllows({
          policy: input.policy,
          valuePath,
          access: input.access,
        }) ||
        (description && !characterDescriptionAllowsNarrator(
          description,
          input.access,
        ))) {
      return;
    }
    candidates.push({ group, text: normalized.slice(0, 600) });
  };

  add(
    "appearance",
    "appearance.publicSummary",
    input.definition.appearance.publicSummary,
  );
  for (const detail of input.definition.appearance.details) {
    add(
      "appearance",
      "appearance.details.*.description",
      detail.description.text,
      detail.description,
    );
  }
  for (const background of input.definition.profileBackground) {
    add(
      "innerBackground",
      "profileBackground.*.description",
      narratorAwarenessText(
        input.access,
        background.selfAwareness,
        background.description.text,
      ),
      background.description,
    );
  }
  for (const need of input.definition.psycheDisposition.coreNeeds) {
    add(
      "innerDisposition",
      "psycheDisposition.coreNeeds.*.description",
      narratorAwarenessText(
        input.access,
        need.selfAwareness,
        need.description.text,
      ),
      need.description,
    );
  }
  for (const tendency of input.definition.psycheDisposition.tendencies) {
    add(
      "innerDisposition",
      "psycheDisposition.tendencies.*.tendencyDescription",
      narratorAwarenessText(
        input.access,
        tendency.selfAwareness,
        tendency.tendencyDescription.text,
      ),
      tendency.tendencyDescription,
    );
    add(
      "observablePatterns",
      "psycheDisposition.tendencies.*.manifestationDescription",
      narratorAwarenessText(
        input.access,
        tendency.selfAwareness,
        tendency.manifestationDescription.text,
      ),
      tendency.manifestationDescription,
    );
  }
  for (const norm of input.definition.actionNorms) {
    add(
      "behaviorPrinciples",
      "actionNorms.*.response.statement",
      narratorAwarenessText(
        input.access,
        norm.selfAwareness,
        norm.response.statement,
      ),
      norm.description ?? undefined,
    );
  }

  const selected: typeof candidates = [];
  let textBudget = 0;
  for (const candidate of candidates) {
    if (selected.length >= 10 || textBudget + candidate.text.length > 2000) break;
    selected.push(candidate);
    textBudget += candidate.text.length;
  }
  const values = (group: CharacterNarratorProjectionGroupV2) => selected
    .filter((candidate) => candidate.group === group)
    .map((candidate) => candidate.text);
  return CharacterNarratorProjectionSetV2Schema.shape.external.parse({
    contractVersion: 2,
    access: input.access,
    appearance: values("appearance"),
    innerBackground: values("innerBackground"),
    innerDisposition: values("innerDisposition"),
    observablePatterns: values("observablePatterns"),
    behaviorPrinciples: values("behaviorPrinciples"),
  });
}

export function projectCharacterNarratorViewsV2(
  definition: CharacterDefinitionV2,
  policy: AssetDisclosurePolicyV1,
) {
  CharacterDefinitionV2Schema.parse(definition);
  AssetDisclosurePolicyV1Schema.parse(policy);
  return CharacterNarratorProjectionSetV2Schema.parse({
    external: buildCharacterNarratorStaticProjectionV2({
      definition,
      policy,
      access: "external",
    }),
    selfInner: buildCharacterNarratorStaticProjectionV2({
      definition,
      policy,
      access: "self_inner",
    }),
    omniscient: buildCharacterNarratorStaticProjectionV2({
      definition,
      policy,
      access: "omniscient",
    }),
  });
}

export function projectCharacterImageBriefV2(
  definition: CharacterDefinitionV2,
): CharacterImageBriefV2 {
  const parsed = CharacterDefinitionV2Schema.parse(definition);
  return CharacterImageBriefV2Schema.parse({
    contractVersion: 2,
    publicSummary: parsed.appearance.publicSummary,
    details: parsed.appearance.details
      .filter((detail) => detail.description.consumerTags.includes("character-image"))
      .map((detail) => detail.description.text)
      .slice(0, 12),
    visualPrompt: parsed.appearance.visualPrompt,
  });
}

export function projectCharacterCounterpartRelationV2(input: {
  definition: CharacterDefinitionV2;
  policy: AssetDisclosurePolicyV1;
  counterpartCharacterId: string;
  evidence: Array<"identified" | "observed" | "learned" | "committed_event">;
}) {
  const evidence = new Set(input.evidence);
  const permits = (valuePath: string) => input.policy.rules.some((rule) =>
    rule.valuePath === valuePath &&
    rule.channel === "counterpart" &&
    rule.target.kind === "character" &&
    rule.target.characterAssetId === input.counterpartCharacterId &&
    rule.prerequisites.every((item) => evidence.has(item as "identified" | "observed" | "learned" | "committed_event"))
  );
  return {
    contractVersion: 2 as const,
    relationships: input.definition.relationshipSeeds
      .filter((seed) => seed.target.kind === "character" &&
        seed.target.characterAssetId === input.counterpartCharacterId &&
        permits(`relationshipSeeds.${seed.id}`))
      .map((seed) => ({
        relationKinds: seed.relationKinds,
        history: seed.historySummary?.text ?? null,
        defaultAddress: seed.defaultAddress,
      })),
  };
}

function defaultDescription(text: string, tags: RegisteredCharacterConsumer[]): CharacterDescriptionV2 {
  return { text: text.slice(0, 600), consumerTags: tags.slice(0, 6), sourceSupportRefs: [] };
}

function actionFromLegacy(skill: Skill, index: number): CharacterActionDefinitionV2 {
  return {
    id: skill.id || `skill-${index + 1}`,
    name: skill.name,
    description: defaultDescription(skill.description, ["profile-generator", "battle-mechanics", "conscious-action", "conscious-expression"]),
    kind: skill.kind,
    mechanics: {
      targetParameter: "hp",
      scalingParameter: skill.kind === "magic" ? "mag" : "atk",
      resistanceParameter: skill.kind === "magic" ? "res" : "def",
      power: skill.power,
      costMp: skill.costMp,
      costStamina: skill.costStamina,
      effects: skill.effects ?? [],
      constraints: skill.constraints ?? ActionFeasibilityConstraintsSchema.parse({}),
    },
    tacticTags: skill.element ? [skill.element] : [],
    expressionNotes: null,
  };
}

function itemFromLegacy(
  slot: "weapon" | "armor",
  equipment: Equipment,
) {
  return {
    id: `item-${slot}`,
    name: equipment.name,
    kind: slot,
    description: defaultDescription(equipment.description, ["profile-generator", "battle-mechanics", "conscious-action"]),
    equipmentBonuses: {
      atk: equipment.atkBonus,
      def: equipment.defBonus,
      mag: equipment.magBonus,
    },
    battleStartEffects: equipment.effects ?? [],
    affordance: {
      portable: true,
      usable: true,
      useDescriptions: [equipment.description.slice(0, 240)],
      causalEnvelope: {},
    },
  } as const;
}

export function legacyCharacterSheetToDefinitionV2(
  legacy: CharacterSheet,
): CharacterDefinitionV2 {
  const sheet = ensureCharacterIdentityProperties(
    ensureCharacterCombatProperties(CharacterSheetSchema.parse(legacy)),
  );
  const basic = sheet.basicAttack ?? defaultBasicAttack();
  const inventory = [
    ...(sheet.weapon ? [itemFromLegacy("weapon", sheet.weapon)] : []),
    ...(sheet.armor ? [itemFromLegacy("armor", sheet.armor)] : []),
  ];
  const names = [
    ...(sheet.identity?.realName ? [{ kind: "real_name" as const, value: sheet.identity.realName }] : []),
    ...(sheet.identity?.nicknames ?? []).map((value) => ({ kind: "nickname" as const, value })),
    ...(sheet.identity?.selfNames ?? []).map((value) => ({ kind: "self_reference" as const, value })),
    ...(sheet.identity?.epithets ?? []).map((value) => ({ kind: "epithet" as const, value })),
  ].slice(0, 12).map((name, index) => ({
    id: `name-${name.kind}-${index + 1}`,
    ...name,
    description: null,
  }));
  const actionNorms = (sheet.decisionProfile?.principles ?? []).slice(0, 12).map((principle, index) => ({
    id: principle.id || `norm-${index + 1}`,
    when: { match: "all" as const, clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" }] },
    response: {
      disposition: principle.force === "constraint" ? "allow_only" as const : "prefer" as const,
      actionRefs: [] as string[],
      actionKinds: principle.force === "constraint" ? ["wait" as const] : [],
      tacticTags: [] as string[],
      statement: principle.statement.slice(0, 320),
      fallbackActionRef: null,
    },
    priority: Math.max(0, Math.min(100, principle.priority)),
    force: principle.force,
    selfAwareness: "aware" as const,
    exceptions: [],
    description: null,
  }));
  return CharacterDefinitionV2Schema.parse({
    schemaVersion: 2,
    identity: {
      displayName: sheet.displayName.slice(0, 48),
      names,
      presentation: {
        form: null,
        gender: sheet.identity?.gender ?? null,
        ageDescription: sheet.identity?.age ?? null,
        pronouns: [],
      },
      tags: sheet.tags.slice(0, 12),
    },
    appearance: {
      publicSummary: sheet.appearance.summary.slice(0, 600),
      details: [],
      visualPrompt: sheet.appearance.visualPrompt.slice(0, 1600),
      portrait: sheet.appearance.imageUrl
        ? { mediaId: sheet.appearance.imageUrl, revisionId: sheet.updatedAt }
        : null,
    },
    profileBackground: [],
    psycheDisposition: {
      dynamicsVersion: "psyche-trait-profile-v1",
      dynamics: {
        adverseSensitivity: 500,
        uncertaintySensitivity: 500,
        recoverySpeed: 500,
        irritationPersistence: 500,
        anxietyPersistence: 500,
        approachTendency: 500,
        withdrawalTendency: 500,
        impulseInhibition: 500,
        expressionRestraint: 500,
      },
      coreNeeds: [],
      tendencies: sheet.traits.slice(0, 12).map((trait, index) => ({
        id: `legacy-trait-${index + 1}`,
        label: trait.slice(0, 120),
        backgroundRefs: [],
        triggerKinds: [],
        selfAwareness: "aware",
        tendencyDescription: defaultDescription(trait, ["profile-generator", "deep-psyche", "conscious-action"]),
        manifestationDescription: defaultDescription(trait, ["deep-psyche", "conscious-expression", "narrator-external"]),
      })),
      description: null,
    },
    actionNorms,
    speechPolicy: {
      selfAwareness: "aware",
      frequency: "measured",
      phasePolicy: { prologue: "allow", turn: "allow", aftermath: "allow" },
      reactTo: ["direct_address", "self_impact", "counterpart_impact", "ambient_change"],
      silenceRules: [],
      register: "既存プロフィールからは特定しない",
      cadence: "既存プロフィールからは特定しない",
      sentenceLength: "mixed",
      vocabularyHabits: [],
      addressRules: [],
      selfReferenceNameId: names.find((name) => name.kind === "self_reference")?.id ?? null,
      examples: [],
      counterexamples: [],
      description: null,
    },
    relationshipSeeds: [],
    combat: { parameters: sheet.parameters, flags: sheet.combatFlags },
    capabilities: {
      basicAction: {
        id: "basic-action",
        name: basic.name,
        description: defaultDescription(basic.description, ["profile-generator", "battle-mechanics", "conscious-action", "conscious-expression"]),
        kind: "basic",
        mechanics: {
          targetParameter: basic.targetParameter,
          scalingParameter: basic.scalingParameter,
          resistanceParameter: basic.resistanceParameter,
          power: basic.power,
          costMp: 0,
          costStamina: 0,
          effects: [],
          constraints: basic.constraints ?? ActionFeasibilityConstraintsSchema.parse({}),
        },
        tacticTags: basic.element ? [basic.element] : [],
        expressionNotes: null,
      },
      skills: sheet.skills.slice(0, 12).map(actionFromLegacy),
    },
    inventory,
    initialLoadout: inventory.map((item) => ({
      itemId: item.id,
      quantity: 1,
      placement: item.kind === "weapon" ? "worn_weapon" : "worn_armor",
    })),
    expressionNotes: sheet.narrativeBlurb
      ? defaultDescription(sheet.narrativeBlurb, ["profile-generator", "deep-psyche", "conscious-expression"])
      : null,
  });
}

export function defaultCharacterDisclosurePolicyV2(
  definition: CharacterDefinitionV2,
): AssetDisclosurePolicyV1 {
  const paths = [
    "identity.names.*.value",
    "identity.tags.*",
    "appearance.publicSummary",
    "psycheDisposition.tendencies.*.tendencyDescription",
    "actionNorms.*.response.statement",
    "speechPolicy.description",
    "capabilities.*.name/description",
    "inventory.*.name/description",
    "expressionNotes",
  ];
  const rules = paths.map((valuePath) => ({
    valuePath,
    channel: "profile" as const,
    target: { kind: "public" as const },
    prerequisites: [],
  }));
  const narratorInnerPaths = [
    "appearance.publicSummary",
    "appearance.details.*.description",
    "profileBackground.*.description",
    "psycheDisposition.coreNeeds.*.description",
    "psycheDisposition.tendencies.*.tendencyDescription",
    "psycheDisposition.tendencies.*.manifestationDescription",
    "actionNorms.*.response.statement",
  ];
  const narratorRules = ["self_inner", "omniscient"].flatMap((perspective) =>
    narratorInnerPaths.map((valuePath) => ({
      valuePath,
      channel: "narrator" as const,
      target: {
        kind: "narrator" as const,
        perspective: perspective as "self_inner" | "omniscient",
      },
      prerequisites: [],
    }))
  );
  return AssetDisclosurePolicyV1Schema.parse({
    version: 1,
    rules: [
      ...rules,
      ...narratorRules,
      {
        valuePath: "appearance.publicSummary",
        channel: "narrator",
        target: { kind: "narrator", perspective: "external" },
        prerequisites: ["observed"],
      },
      {
        valuePath: "psycheDisposition.tendencies.*.manifestationDescription",
        channel: "narrator",
        target: { kind: "narrator", perspective: "external" },
        prerequisites: ["committed_event"],
      },
    ],
  });
}

export function characterDefinitionV2ToLegacySheet(input: {
  characterId: string;
  ownerUserId: string;
  definition: CharacterDefinitionV2;
  publicPresentation: AssetPublicPresentationV2;
  createdAt: string;
  updatedAt: string;
  previousImageUrl?: string | null;
  operational?: Partial<Pick<CharacterSheet,
    "visibility" | "record" | "recordOverall" | "improvementMemo" |
    "opponentMemories" | "deletedAt" | "revisionSnapshot">>;
}): CharacterSheet {
  const { definition } = input;
  const nameValues = (kind: "real_name" | "nickname" | "self_reference" | "epithet") =>
    definition.identity.names.filter((name) => name.kind === kind).map((name) => name.value);
  const item = (placement: "worn_weapon" | "worn_armor") => {
    const entry = definition.initialLoadout.find((candidate) => candidate.placement === placement);
    const value = entry ? definition.inventory.find((candidate) => candidate.id === entry.itemId) : null;
    if (!value) return null;
    return {
      name: value.name,
      description: value.description.text,
      atkBonus: value.equipmentBonuses?.atk ?? 0,
      defBonus: value.equipmentBonuses?.def ?? 0,
      magBonus: value.equipmentBonuses?.mag ?? 0,
      effects: value.battleStartEffects,
    };
  };
  const toSkill = (action: CharacterActionDefinitionV2): Skill => ({
    id: action.id,
    name: action.name,
    description: action.description.text,
    costMp: action.mechanics.costMp,
    costStamina: action.mechanics.costStamina,
    power: action.mechanics.power,
    kind: action.kind === "basic" ? "attack" : action.kind,
    effects: action.mechanics.effects,
    constraints: action.mechanics.constraints,
  });
  const basic = definition.capabilities.basicAction;
  return CharacterSheetSchema.parse({
    id: input.characterId,
    ownerUserId: input.ownerUserId,
    displayName: definition.identity.displayName,
    identity: {
      realName: nameValues("real_name")[0] ?? null,
      nicknames: nameValues("nickname"),
      selfNames: nameValues("self_reference"),
      epithets: nameValues("epithet"),
      gender: definition.identity.presentation.gender,
      age: definition.identity.presentation.ageDescription,
    },
    visibility: input.operational?.visibility ?? "public",
    tags: definition.identity.tags,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    deletedAt: input.operational?.deletedAt ?? null,
    appearance: {
      summary: definition.appearance.publicSummary,
      visualPrompt: definition.appearance.visualPrompt,
      imageUrl: definition.appearance.portrait?.mediaId ?? null,
      ...(input.previousImageUrl !== undefined
        ? { previousImageUrl: input.previousImageUrl }
        : {}),
    },
    traits: definition.psycheDisposition.tendencies
      .filter((item) => item.selfAwareness !== "unaware")
      .map((item) => item.selfAwareness === "partial"
        ? item.tendencyDescription.text.slice(0, 160)
        : item.tendencyDescription.text),
    parameters: definition.combat.parameters,
    basicAttack: {
      name: basic.name,
      description: basic.description.text,
      targetParameter: basic.mechanics.targetParameter,
      scalingParameter: basic.mechanics.scalingParameter,
      resistanceParameter: basic.mechanics.resistanceParameter,
      power: basic.mechanics.power,
      constraints: basic.mechanics.constraints,
    },
    skills: definition.capabilities.skills.map(toSkill),
    weapon: item("worn_weapon"),
    armor: item("worn_armor"),
    combatFlags: definition.combat.flags,
    narrativeBlurb: input.publicPresentation.description,
    ...input.operational,
  });
}
