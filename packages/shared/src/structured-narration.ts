import { z } from "zod";
import { NarrationPerspectiveSchema } from "./narration-perspective.js";
import {
  AssetClaimValidationReceiptV1Schema,
  AssetDisclosurePolicyV1Schema,
  AssetPublicPresentationV2Schema,
  assetGenerationEnvelopeV2Schema,
  type AssetClaimValidationReceiptV1,
  type AssetDisclosurePolicyV1,
  type AssetPublicPresentationV2,
} from "./structured-assets.js";

export const NARRATION_DEFINITION_SCHEMA_VERSION = 2 as const;
export const NARRATION_STYLE_PROJECTION_VERSION = 2 as const;
export const NARRATION_PROMPT_COMPILER_V2 = "narration-prompt-v2" as const;
export const NARRATION_STYLE_CLAIM_VALIDATOR_CONTRACT =
  "narration-style-claim-validator-v1" as const;
export const REQUIRED_NARRATION_COMPILERS_V2 = [
  { consumer: "narration-legacy-read-model", version: 2 },
  { consumer: "narration-style-card", version: 2 },
  { consumer: "narration-style-claim-validator", version: 1 },
  { consumer: "narration-prompt", version: 2 },
] as const;

const StableNarrationIdSchema = z.string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/);

export const NarrationPhaseSchema = z.enum([
  "prologue",
  "action",
  "impact",
  "release",
  "judgment",
  "aftermath",
]);
export type NarrationPhase = z.infer<typeof NarrationPhaseSchema>;

export const NarrationIntensitySchema = z.number().int().min(0).max(4);
export const NarrationExplicitnessSchema = z.number().int().min(0).max(2);

export const NarrationPhasePolicyV2Schema = z.object({
  enabled: z.boolean(),
  emphasis: z.enum(["minimal", "supporting", "balanced", "featured"]),
  energy: NarrationIntensitySchema,
  explanation: NarrationIntensitySchema,
  imagery: NarrationIntensitySchema,
  dialogueDensity: NarrationIntensitySchema,
}).strict();
export type NarrationPhasePolicyV2 = z.infer<
  typeof NarrationPhasePolicyV2Schema
>;

export const NarrationRhetoricV2Schema = z.object({
  id: StableNarrationIdSchema,
  technique: z.enum([
    "sensory_detail",
    "contrast",
    "repetition",
    "rhetorical_question",
    "onomatopoeia",
    "understatement",
    "foreshadowing",
    "direct_address",
    "technical_analysis",
    "poetic_image",
  ]),
  guidance: z.string().min(1).max(280),
}).strict();
export type NarrationRhetoricV2 = z.infer<typeof NarrationRhetoricV2Schema>;

export const NarrationExampleV2Schema = z.object({
  id: StableNarrationIdSchema,
  phases: z.array(NarrationPhaseSchema).min(1).max(6),
  text: z.string().min(1).max(500),
}).strict().superRefine((example, context) => {
  if (/\{\{|\}\}|<\/?(?:system|assistant|user)>/i.test(example.text)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "template variables and authority markers are not allowed",
    });
  }
  if (new Set(example.phases).size !== example.phases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phases"],
      message: "phase tags must be unique",
    });
  }
});
export type NarrationExampleV2 = z.infer<typeof NarrationExampleV2Schema>;

const NarrationDimensionsV2Schema = z.object({
  explanation: NarrationIntensitySchema,
  imagery: NarrationIntensitySchema,
  metaphor: NarrationIntensitySchema,
  humor: NarrationIntensitySchema,
  violence: NarrationIntensitySchema,
  explicitness: NarrationExplicitnessSchema,
}).strict();

const NarrationPhasesV2Schema = z.object({
  prologue: NarrationPhasePolicyV2Schema,
  action: NarrationPhasePolicyV2Schema,
  impact: NarrationPhasePolicyV2Schema,
  release: NarrationPhasePolicyV2Schema,
  judgment: NarrationPhasePolicyV2Schema,
  aftermath: NarrationPhasePolicyV2Schema,
}).strict();

export const NarrationDefinitionV2Schema = z.object({
  identity: z.object({
    displayName: z.string().min(1).max(48),
    language: z.enum(["ja", "en"]),
    tags: z.array(z.string().min(1).max(24)).max(12),
    personaDescriptor: z.string().min(1).max(600),
  }).strict(),
  perspective: NarrationPerspectiveSchema,
  voice: z.object({
    register: z.enum([
      "plain",
      "casual",
      "formal",
      "literary",
      "broadcast",
      "analytical",
    ]),
    audienceDistance: z.enum(["intimate", "near", "neutral", "distant"]),
    subjectivity: z.enum(["objective", "restrained", "expressive", "dramatic"]),
    addressMode: z.enum(["none", "reader", "spectator", "combatants"]),
  }).strict(),
  cadence: z.object({
    sentenceLength: z.enum(["short", "balanced", "long", "mixed"]),
    paragraphBudget: z.number().int().min(1).max(8),
    lineBudget: z.number().int().min(1).max(16),
    dialoguePlacement: z.enum([
      "separate_speeches",
      "before_narration",
      "after_narration",
      "interleaved",
      "minimal",
    ]),
  }).strict(),
  phases: NarrationPhasesV2Schema,
  dimensions: NarrationDimensionsV2Schema,
  preferredRhetoric: z.array(NarrationRhetoricV2Schema).max(12),
  forbiddenRhetoric: z.array(NarrationRhetoricV2Schema).max(12),
  examples: z.array(NarrationExampleV2Schema).max(12),
  counterexamples: z.array(NarrationExampleV2Schema).max(12),
}).strict().superRefine((definition, context) => {
  const seen = new Set<string>();
  const entries = [
    ...definition.preferredRhetoric,
    ...definition.forbiddenRhetoric,
    ...definition.examples,
    ...definition.counterexamples,
  ];
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate stable id: ${entry.id}`,
      });
    }
    seen.add(entry.id);
  }
});
export type NarrationDefinitionV2 = z.infer<
  typeof NarrationDefinitionV2Schema
>;

export const NarrationGenerationEnvelopeV2Schema =
  assetGenerationEnvelopeV2Schema(NarrationDefinitionV2Schema).superRefine(
    (envelope, context) => {
      if (envelope.definitionSchema.family !== "narration-style" ||
          envelope.definitionSchema.version !== 2) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["definitionSchema"],
          message: "expected narration-style schema version 2",
        });
      }
    },
  );
export type NarrationGenerationEnvelopeV2 = z.infer<
  typeof NarrationGenerationEnvelopeV2Schema
>;

export const NarrationStyleSourceFactV2Schema = z.object({
  supportRef: z.string().min(1).max(200),
  valuePath: z.string().min(1).max(200),
  text: z.string().min(1).max(800),
}).strict();
export const NarrationStyleSourceProjectionV2Schema = z.object({
  contractVersion: z.literal(2),
  displayName: z.string().min(1).max(48),
  facts: z.array(NarrationStyleSourceFactV2Schema).max(96),
}).strict();
export type NarrationStyleSourceProjectionV2 = z.infer<
  typeof NarrationStyleSourceProjectionV2Schema
>;

export const CompiledNarrationPhaseV2Schema = z.object({
  phase: NarrationPhaseSchema,
  instruction: z.string().min(1).max(6000),
  selectedExampleIds: z.array(StableNarrationIdSchema).max(2),
  selectedCounterexampleIds: z.array(StableNarrationIdSchema).max(1),
}).strict();

export const CompiledNarrationPolicyV2Schema = z.object({
  compilerContract: z.literal(NARRATION_PROMPT_COMPILER_V2),
  perspective: NarrationPerspectiveSchema,
  fallbackInstruction: z.string().min(1).max(6000),
  phases: z.object({
    prologue: CompiledNarrationPhaseV2Schema,
    action: CompiledNarrationPhaseV2Schema,
    impact: CompiledNarrationPhaseV2Schema,
    release: CompiledNarrationPhaseV2Schema,
    judgment: CompiledNarrationPhaseV2Schema,
    aftermath: CompiledNarrationPhaseV2Schema,
  }).strict(),
}).strict();
export type CompiledNarrationPolicyV2 = z.infer<
  typeof CompiledNarrationPolicyV2Schema
>;

function publicProfilePaths(policy: AssetDisclosurePolicyV1): Set<string> {
  return new Set(policy.rules
    .filter((rule) => rule.channel === "profile" && rule.target.kind === "public")
    .map((rule) => rule.valuePath));
}

export function defaultNarrationDisclosurePolicyV2(
  _definition: NarrationDefinitionV2,
): AssetDisclosurePolicyV1 {
  return AssetDisclosurePolicyV1Schema.parse({
    version: 1,
    rules: [
      "identity.displayName",
      "identity.language",
      "identity.tags.*",
      "identity.personaDescriptor",
      "perspective",
      "voice",
      "cadence",
      "phases.*.emphasis",
      "dimensions",
    ].map((valuePath) => ({
      valuePath,
      channel: "profile",
      target: { kind: "public" },
      prerequisites: [],
    })),
  });
}

export function projectNarrationStyleSourceV2(
  definition: NarrationDefinitionV2,
  policy: AssetDisclosurePolicyV1,
): NarrationStyleSourceProjectionV2 {
  const paths = publicProfilePaths(policy);
  const facts: z.infer<typeof NarrationStyleSourceFactV2Schema>[] = [];
  const add = (supportRef: string, valuePath: string, text: string) => {
    if (paths.has(valuePath) && text.trim()) {
      facts.push({ supportRef, valuePath, text: text.trim() });
    }
  };
  add("identity.displayName", "identity.displayName", definition.identity.displayName);
  add("identity.language", "identity.language", definition.identity.language);
  definition.identity.tags.forEach((tag, index) =>
    add(`identity.tags.${index}`, "identity.tags.*", tag));
  add(
    "identity.personaDescriptor",
    "identity.personaDescriptor",
    definition.identity.personaDescriptor,
  );
  add("perspective", "perspective", definition.perspective);
  add(
    "voice",
    "voice",
    `${definition.voice.register}/${definition.voice.audienceDistance}/${definition.voice.subjectivity}/${definition.voice.addressMode}`,
  );
  add(
    "cadence",
    "cadence",
    `${definition.cadence.sentenceLength}; paragraphs<=${definition.cadence.paragraphBudget}; lines<=${definition.cadence.lineBudget}; dialogue=${definition.cadence.dialoguePlacement}`,
  );
  for (const phase of NarrationPhaseSchema.options) {
    add(
      `phases.${phase}.emphasis`,
      "phases.*.emphasis",
      `${phase}:${definition.phases[phase].emphasis}`,
    );
  }
  add(
    "dimensions",
    "dimensions",
    Object.entries(definition.dimensions).map(([key, value]) => `${key}:${value}`)
      .join(","),
  );
  return NarrationStyleSourceProjectionV2Schema.parse({
    contractVersion: 2,
    displayName: definition.identity.displayName,
    facts,
  });
}

export function validateNarrationPublicPresentationV2(
  projection: NarrationStyleSourceProjectionV2,
  presentation: AssetPublicPresentationV2,
): AssetPublicPresentationV2 {
  const parsed = AssetPublicPresentationV2Schema.parse(presentation);
  const allowed = new Set(projection.facts.map((fact) => fact.supportRef));
  for (const segment of parsed.segments) {
    if (segment.supportRefs.some((ref) => !allowed.has(ref))) {
      throw new Error(`NARRATION_STYLE_UNKNOWN_SUPPORT:${segment.id}`);
    }
    if (segment.kind === "fact" && segment.supportRefs.length === 0) {
      throw new Error(`NARRATION_STYLE_FACT_WITHOUT_SUPPORT:${segment.id}`);
    }
    if (segment.kind === "flavor" && segment.supportRefs.length > 0) {
      throw new Error(`NARRATION_STYLE_FLAVOR_HAS_SUPPORT:${segment.id}`);
    }
  }
  return parsed;
}

export function validateNarrationStyleClaimAssessmentV2(
  projection: NarrationStyleSourceProjectionV2,
  presentation: AssetPublicPresentationV2,
  receipt: AssetClaimValidationReceiptV1,
): AssetPublicPresentationV2 {
  const parsed = validateNarrationPublicPresentationV2(projection, presentation);
  const validated = AssetClaimValidationReceiptV1Schema.parse(receipt);
  if (validated.projectionDigest !== parsed.projectionDigest) {
    throw new Error("NARRATION_STYLE_CLAIM_PROJECTION_DRIFT");
  }
  const projectionRefs = new Set(projection.facts.map((fact) => fact.supportRef));
  const candidates = new Map(parsed.segments.map((segment) => [segment.id, segment]));
  const seen = new Set<string>();
  for (const result of validated.segments) {
    const candidate = candidates.get(result.segmentId);
    if (!candidate || seen.has(result.segmentId)) {
      throw new Error(`NARRATION_STYLE_CLAIM_UNKNOWN_SEGMENT:${result.segmentId}`);
    }
    seen.add(result.segmentId);
    if (result.supportRefs.some((ref) => !projectionRefs.has(ref))) {
      throw new Error(`NARRATION_STYLE_CLAIM_UNKNOWN_SUPPORT:${result.segmentId}`);
    }
    if (result.riskCodes.some((risk) =>
      risk === "mechanics" || risk === "control_metadata" ||
      risk === "information_right" || risk === "contradiction")) {
      throw new Error(`NARRATION_STYLE_CLAIM_RISK:${result.segmentId}`);
    }
    if (candidate.kind === "fact" &&
        (result.verdict !== "supported" || result.supportRefs.length === 0)) {
      throw new Error(`NARRATION_STYLE_FACT_NOT_VALIDATED:${result.segmentId}`);
    }
    if (result.verdict === "flavor_only" &&
        (candidate.kind !== "flavor" || result.supportRefs.length > 0)) {
      throw new Error(`NARRATION_STYLE_INVALID_FLAVOR:${result.segmentId}`);
    }
  }
  if (seen.size !== parsed.segments.length) {
    throw new Error("NARRATION_STYLE_CLAIM_MISSING_SEGMENT");
  }
  return AssetPublicPresentationV2Schema.parse({
    ...parsed,
    claimValidation: validated,
  });
}

export function assertNarrationGenerationReadyV2(
  envelope: NarrationGenerationEnvelopeV2,
): NarrationGenerationEnvelopeV2 {
  const parsed = NarrationGenerationEnvelopeV2Schema.parse(envelope);
  for (const required of REQUIRED_NARRATION_COMPILERS_V2) {
    if (!parsed.compilerCompatibility.some((compiler) =>
      compiler.consumer === required.consumer &&
      compiler.version === required.version)) {
      throw new Error(`NARRATION_REQUIRED_COMPILER_MISSING:${required.consumer}`);
    }
  }
  if (!parsed.publicPresentation.claimValidation) {
    throw new Error("NARRATION_STYLE_CLAIM_RECEIPT_MISSING");
  }
  const projection = projectNarrationStyleSourceV2(
    parsed.definition,
    parsed.disclosurePolicy,
  );
  validateNarrationStyleClaimAssessmentV2(
    projection,
    parsed.publicPresentation,
    parsed.publicPresentation.claimValidation,
  );
  return parsed;
}

function defaultPhasePolicy(
  emphasis: NarrationPhasePolicyV2["emphasis"] = "balanced",
): NarrationPhasePolicyV2 {
  return {
    enabled: true,
    emphasis,
    energy: 2,
    explanation: 2,
    imagery: 2,
    dialogueDensity: 2,
  };
}

export function legacyNarrationStyleToDefinitionV2(style: {
  id: string;
  displayName: string;
  instruction: string;
  perspective?: z.infer<typeof NarrationPerspectiveSchema>;
  tags: string[];
}): NarrationDefinitionV2 {
  const register = style.id === "nst_broadcast"
    ? "broadcast"
    : style.id === "nst_detailed"
      ? "analytical"
      : style.id === "nst_novel"
        ? "literary"
        : style.id === "nst_friendly"
          ? "casual"
          : "plain";
  const short = style.id === "nst_laconic" || style.id === "nst_broadcast";
  return NarrationDefinitionV2Schema.parse({
    identity: {
      displayName: style.displayName,
      language: "ja",
      tags: style.tags.slice(0, 12),
      personaDescriptor: style.instruction.slice(0, 600),
    },
    perspective: style.perspective ?? "external",
    voice: {
      register,
      audienceDistance: style.id === "nst_subjective" ? "intimate" : "neutral",
      subjectivity: style.id === "nst_novel" || style.id === "nst_subjective"
        ? "expressive"
        : style.id === "nst_broadcast"
          ? "dramatic"
          : "restrained",
      addressMode: style.id === "nst_broadcast" ? "spectator" : "none",
    },
    cadence: {
      sentenceLength: short ? "short" : style.id === "nst_novel" ? "mixed" : "balanced",
      paragraphBudget: style.id === "nst_detailed" ? 6 : short ? 3 : 5,
      lineBudget: style.id === "nst_detailed" ? 8 : short ? 4 : 6,
      dialoguePlacement: short ? "minimal" : "separate_speeches",
    },
    phases: {
      prologue: defaultPhasePolicy("supporting"),
      action: defaultPhasePolicy("featured"),
      impact: defaultPhasePolicy("featured"),
      release: defaultPhasePolicy("balanced"),
      judgment: defaultPhasePolicy("supporting"),
      aftermath: defaultPhasePolicy("balanced"),
    },
    dimensions: {
      explanation: style.id === "nst_detailed" ? 4 : style.id === "nst_laconic" ? 0 : 2,
      imagery: style.id === "nst_novel" ? 4 : style.id === "nst_laconic" ? 0 : 2,
      metaphor: style.id === "nst_novel" ? 3 : 1,
      humor: style.id === "nst_friendly" ? 2 : 0,
      violence: 2,
      explicitness: 0,
    },
    preferredRhetoric: [],
    forbiddenRhetoric: [{
      id: "rhetoric.no-uncommitted-facts",
      technique: "technical_analysis",
      guidance: "確定していない数値・内心・因果を断定しない",
    }],
    examples: [],
    counterexamples: [],
  });
}

export function narrationDefinitionV2ToLegacyStyle(input: {
  styleId: string;
  ownerUserId: string | null;
  isSystem: boolean;
  definition: NarrationDefinitionV2;
  publicPresentation: AssetPublicPresentationV2;
  createdAt: string;
  updatedAt: string;
  visibility?: "public" | "friends" | "private";
}): {
  id: string;
  ownerUserId: string | null;
  isSystem: boolean;
  visibility: "public" | "friends" | "private";
  displayName: string;
  description: string;
  instruction: string;
  perspective: z.infer<typeof NarrationPerspectiveSchema>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: input.styleId,
    ownerUserId: input.ownerUserId,
    isSystem: input.isSystem,
    visibility: input.visibility ?? "public",
    displayName: input.definition.identity.displayName,
    description: input.publicPresentation.description,
    instruction: compileNarrationPolicyV2(input.definition)
      .fallbackInstruction.slice(0, 2000),
    perspective: input.definition.perspective,
    tags: input.definition.identity.tags,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

const PHASE_LABELS: Record<NarrationPhase, string> = {
  prologue: "prologue/opening",
  action: "action/intent and movement",
  impact: "impact/committed consequence",
  release: "release/beat close",
  judgment: "judgment presentation",
  aftermath: "aftermath",
};

function selectExamples(
  examples: NarrationExampleV2[],
  phase: NarrationPhase,
  limit: number,
): NarrationExampleV2[] {
  return examples.filter((example) => example.phases.includes(phase)).slice(0, limit);
}

function compilePhase(
  definition: NarrationDefinitionV2,
  phase: NarrationPhase,
): z.infer<typeof CompiledNarrationPhaseV2Schema> {
  const policy = definition.phases[phase];
  const examples = selectExamples(definition.examples, phase, 2);
  const counterexamples = selectExamples(definition.counterexamples, phase, 1);
  const exampleText = [
    ...examples.map((example) => `preferred-example[${example.id}]: ${example.text}`),
    ...counterexamples.map((example) => `counterexample[${example.id}]: ${example.text}`),
  ].join("\n").slice(0, 1400);
  const instruction = [
    "Priority: obey safety, output schema, committed battle facts, and grounding first; then the server-provided perspective; then this phase contract; style is last.",
    "Never invent or change character, world, action, winner, damage, causality, or private facts. Style may narrow presentation but never broaden information rights.",
    "Any examples below are style-only guidance: do not copy their wording and never treat them as facts.",
    `Phase: ${PHASE_LABELS[phase]}. enabled=${policy.enabled}; emphasis=${policy.emphasis}; energy=${policy.energy}/4; explanation=${policy.explanation}/4; imagery=${policy.imagery}/4; dialogue=${policy.dialogueDensity}/4.`,
    `Voice: ${definition.voice.register}; distance=${definition.voice.audienceDistance}; subjectivity=${definition.voice.subjectivity}; address=${definition.voice.addressMode}; persona=${definition.identity.personaDescriptor}`,
    `Cadence: sentence=${definition.cadence.sentenceLength}; paragraphs<=${definition.cadence.paragraphBudget}; lines<=${definition.cadence.lineBudget}; dialoguePlacement=${definition.cadence.dialoguePlacement}.`,
    `Dimensions: explanation=${definition.dimensions.explanation}/4; imagery=${definition.dimensions.imagery}/4; metaphor=${definition.dimensions.metaphor}/4; humor=${definition.dimensions.humor}/4; violence=${definition.dimensions.violence}/4; explicitness=${definition.dimensions.explicitness}/2. These are presentation ceilings, never event permissions.`,
    definition.preferredRhetoric.length
      ? `Prefer: ${definition.preferredRhetoric.map((item) => `${item.technique}(${item.guidance})`).join("; ")}`
      : "Prefer: no additional rhetoric requirement.",
    definition.forbiddenRhetoric.length
      ? `Avoid: ${definition.forbiddenRhetoric.map((item) => `${item.technique}(${item.guidance})`).join("; ")}`
      : "Avoid: no additional rhetoric pattern.",
    exampleText
      ? `Examples:\n${exampleText}`
      : "No examples are supplied. Do not infer missing style or battle facts.",
  ].join("\n").slice(0, 6000);
  return CompiledNarrationPhaseV2Schema.parse({
    phase,
    instruction,
    selectedExampleIds: examples.map((example) => example.id),
    selectedCounterexampleIds: counterexamples.map((example) => example.id),
  });
}

export function compileNarrationPolicyV2(
  definition: NarrationDefinitionV2,
): CompiledNarrationPolicyV2 {
  const parsed = NarrationDefinitionV2Schema.parse(definition);
  const phases = Object.fromEntries(
    NarrationPhaseSchema.options.map((phase) => [phase, compilePhase(parsed, phase)]),
  );
  return CompiledNarrationPolicyV2Schema.parse({
    compilerContract: NARRATION_PROMPT_COMPILER_V2,
    perspective: parsed.perspective,
    fallbackInstruction: [
      phases.action!.instruction.slice(0, 1900),
      phases.impact!.instruction.slice(0, 1900),
      phases.release!.instruction.slice(0, 1900),
    ].join("\n\n").slice(0, 6000),
    phases,
  });
}
