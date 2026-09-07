import { z } from "zod";
import {
  compileCharacterActionNormProgramV2,
  compileCharacterRelationshipProgramV2,
} from "./character-definition-rules.js";
import {
  CharacterDefinitionV2ObjectSchema,
  CharacterDefinitionV2Schema,
  CharacterActionNormV2Schema,
  LEGACY_SPEECH_UNSPECIFIED,
  RegisteredCharacterConsumerSchema,
  type CharacterDefinitionV2,
  type CharacterDescriptionV2,
  type RegisteredCharacterConsumer,
} from "./structured-character.js";

export const CHARACTER_DEFINITION_GAP_KEYS = [
  "profileBackground",
  "appearanceDetails",
  "psycheCoreNeeds",
  "speechPolicy",
  "relationshipSeeds",
  "actionNorms",
  "expressionNotes",
] as const;
export type CharacterDefinitionGapKey =
  typeof CHARACTER_DEFINITION_GAP_KEYS[number];

export type CharacterDefinitionSourceKind =
  | "create_instruction"
  | "revision_instruction"
  | "upgrade_description"
  | "import";

export type CharacterDefinitionCheckFinding = {
  code: string;
  path: string;
  message: string;
};

const speechPolicyShape = CharacterDefinitionV2ObjectSchema.shape.speechPolicy;
const psycheShape = CharacterDefinitionV2ObjectSchema.shape.psycheDisposition;

export const CharacterDefinitionGapFillV2Schema = CharacterDefinitionV2ObjectSchema
  .pick({
    profileBackground: true,
    relationshipSeeds: true,
    actionNorms: true,
    expressionNotes: true,
  })
  .extend({
    appearanceDetails: CharacterDefinitionV2ObjectSchema.shape.appearance.shape.details,
    psycheDisposition: psycheShape.pick({
      coreNeeds: true,
      description: true,
    }).strict(),
    speechPolicy: speechPolicyShape.partial(),
  })
  .partial()
  .strict();
export type CharacterDefinitionGapFillV2 = z.infer<
  typeof CharacterDefinitionGapFillV2Schema
>;

const LlmFillTextSchema = z.string().min(1).max(600);
const LlmOptionalTextSchema = z.string().max(600).nullable();
const LlmAwarenessSchema = z.enum(["unaware", "partial", "aware"]);
const LlmBackgroundKindSchema = z.enum([
  "origin",
  "formative_event",
  "role",
  "affiliation",
  "belief_context",
  "relationship_history",
  "other",
]);
const LlmAppearanceRegionSchema = z.enum([
  "face",
  "hair",
  "body",
  "clothing",
  "accessory",
  "aura",
  "form",
  "other",
]);
const LlmRoleSchema = z.enum([
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
const LLM_ROLES = new Set<string>(LlmRoleSchema.options);

/**
 * Provider-facing upgrade/create fill. Strings stand in for description
 * objects, every key is required+nullable for strict structured output, and
 * consumer-tag internals are not asked of the model. Action norms remain fully
 * structured because the server must not invent conditions or action selectors.
 */
export const CharacterDefinitionLlmFillV2Schema = z.object({
  profileBackground: z.array(z.object({
    id: z.string().min(1).max(120),
    kind: LlmBackgroundKindSchema,
    summary: z.string().min(1).max(240),
    description: LlmFillTextSchema,
    selfAwareness: LlmAwarenessSchema,
  }).strict()).max(16).nullable(),
  appearanceDetails: z.array(z.object({
    id: z.string().min(1).max(120),
    region: LlmAppearanceRegionSchema,
    description: LlmFillTextSchema,
  }).strict()).max(16).nullable(),
  psycheCoreNeeds: z.array(z.object({
    id: z.string().min(1).max(120),
    description: LlmFillTextSchema,
    selfAwareness: LlmAwarenessSchema,
  }).strict()).max(6).nullable(),
  speech: z.object({
    register: z.string().min(1).max(160),
    cadence: z.string().min(1).max(160),
  }).strict().nullable(),
  relationshipSeeds: z.array(z.object({
    id: z.string().min(1).max(120),
    role: LlmRoleSchema,
    relationKinds: z.array(z.string().min(1).max(80)).max(6),
    historySummary: LlmOptionalTextSchema,
    defaultAddress: z.string().max(80).nullable(),
    selfAwareness: LlmAwarenessSchema,
    priority: z.number().int().min(0).max(100),
  }).strict()).max(24).nullable(),
  actionNorms: z.array(CharacterActionNormV2Schema).max(12).nullable(),
  expressionNotes: LlmOptionalTextSchema,
}).strict();
export type CharacterDefinitionLlmFillV2 = z.infer<
  typeof CharacterDefinitionLlmFillV2Schema
>;

function trimText(value: unknown, max: number): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text.slice(0, max) : null;
  }
  if (!value || typeof value !== "object") return null;
  const text = Reflect.get(value, "text");
  return typeof text === "string" ? trimText(text, max) : null;
}

function awarenessOf(value: unknown): "unaware" | "partial" | "aware" {
  return value === "unaware" || value === "partial" ? value : "aware";
}

function stableId(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, 120);
}

function uniqueById<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    let id = item.id.trim() || `${prefix}-${index + 1}`;
    if (seen.has(id)) id = `${prefix}-${index + 1}`;
    if (seen.has(id)) id = `${id}-${seen.size + 1}`;
    seen.add(id);
    return { ...item, id: id.slice(0, 120) };
  });
}

function asEntryArray(value: unknown): object[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is object =>
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
}

function speechFromUnknown(
  value: unknown,
): { register: string; cadence: string } | null {
  if (!value || typeof value !== "object") return null;
  const register = trimText(Reflect.get(value, "register"), 160);
  const cadence = trimText(Reflect.get(value, "cadence"), 160);
  if (!register && !cadence) return null;
  return {
    register: (register ?? cadence) as string,
    cadence: (cadence ?? register) as string,
  };
}

function descriptionFromText(
  text: string,
  tags: RegisteredCharacterConsumer[],
): CharacterDescriptionV2 {
  return {
    text: text.trim().slice(0, 600),
    consumerTags: tags,
    sourceSupportRefs: [],
  };
}

function coerceDescription(
  value: unknown,
  tags: RegisteredCharacterConsumer[],
): CharacterDescriptionV2 | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text ? descriptionFromText(text, tags) : null;
  }
  if (typeof value !== "object") return undefined;
  const rawText = Reflect.get(value, "text");
  if (typeof rawText !== "string") return undefined;
  const text = rawText.trim();
  if (!text) return null;
  const consumerTags = Reflect.get(value, "consumerTags");
  const tagsIn = Array.isArray(consumerTags)
    ? consumerTags.flatMap((tag) => {
      const parsed = RegisteredCharacterConsumerSchema.safeParse(tag);
      return parsed.success ? [parsed.data] : [];
    }).slice(0, 6)
    : [];
  return {
    text: text.slice(0, 600),
    consumerTags: tagsIn.length > 0 ? tagsIn : tags,
    sourceSupportRefs: [],
  };
}

function normalizeBackground(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const description = trimText(Reflect.get(entry, "description"), 600);
    const summary = trimText(Reflect.get(entry, "summary"), 240);
    if (!description || !summary) return [];
    const kind = LlmBackgroundKindSchema.safeParse(Reflect.get(entry, "kind"));
    if (!kind.success) return [];
    return [{
      id: stableId(Reflect.get(entry, "id"), `background-${index + 1}`),
      kind: kind.data,
      summary,
      description,
      selfAwareness: awarenessOf(Reflect.get(entry, "selfAwareness")),
    }];
  });
}

function normalizeAppearance(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const description = trimText(Reflect.get(entry, "description"), 600);
    const region = LlmAppearanceRegionSchema.safeParse(Reflect.get(entry, "region"));
    if (!description || !region.success) return [];
    return [{
      id: stableId(Reflect.get(entry, "id"), `appearance-${index + 1}`),
      region: region.data,
      description,
    }];
  });
}

function normalizeCoreNeeds(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const description = trimText(Reflect.get(entry, "description"), 600);
    if (!description) return [];
    return [{
      id: stableId(Reflect.get(entry, "id"), `need-${index + 1}`),
      description,
      selfAwareness: awarenessOf(Reflect.get(entry, "selfAwareness")),
    }];
  });
}

function normalizeSeeds(value: unknown) {
  const entries = asEntryArray(value);
  if (!entries) return value == null ? null : value;
  return entries.flatMap((entry, index) => {
    const target = Reflect.get(entry, "target");
    const role = target && typeof target === "object" &&
        Reflect.get(target, "kind") === "role"
      ? Reflect.get(target, "role")
      : Reflect.get(entry, "role");
    if (typeof role !== "string" || !LLM_ROLES.has(role)) return [];
    const rawPriority = Reflect.get(entry, "priority");
    const priority = typeof rawPriority === "number" && Number.isFinite(rawPriority)
      ? Math.max(0, Math.min(100, Math.round(rawPriority)))
      : 10;
    const relationKinds = Reflect.get(entry, "relationKinds");
    const kinds = Array.isArray(relationKinds)
      ? relationKinds.flatMap((kind) => {
        const text = trimText(kind, 80);
        return text ? [text] : [];
      }).slice(0, 6)
      : [];
    return [{
      id: stableId(Reflect.get(entry, "id"), `rel-${index + 1}`),
      role,
      relationKinds: kinds,
      historySummary: trimText(Reflect.get(entry, "historySummary"), 600),
      defaultAddress: trimText(Reflect.get(entry, "defaultAddress"), 80),
      selfAwareness: awarenessOf(Reflect.get(entry, "selfAwareness")),
      priority,
    }];
  });
}

function normalizeLlmFillInput(raw: object) {
  const psycheDisposition = Reflect.get(raw, "psycheDisposition");
  const psycheSource = Reflect.get(raw, "psycheCoreNeeds") ?? (
    psycheDisposition && typeof psycheDisposition === "object"
      ? Reflect.get(psycheDisposition, "coreNeeds")
      : null
  );
  return {
    profileBackground: normalizeBackground(Reflect.get(raw, "profileBackground")),
    appearanceDetails: normalizeAppearance(Reflect.get(raw, "appearanceDetails")),
    psycheCoreNeeds: normalizeCoreNeeds(psycheSource),
    speech: speechFromUnknown(
      Reflect.get(raw, "speech") ?? Reflect.get(raw, "speechPolicy"),
    ),
    relationshipSeeds: normalizeSeeds(Reflect.get(raw, "relationshipSeeds")),
    actionNorms: Reflect.get(raw, "actionNorms") ?? null,
    expressionNotes: trimText(Reflect.get(raw, "expressionNotes"), 600),
  };
}

export function llmFillToGapFillV2(
  fill: CharacterDefinitionLlmFillV2,
): CharacterDefinitionGapFillV2 {
  const next: CharacterDefinitionGapFillV2 = {};
  if (fill.profileBackground) {
    next.profileBackground = uniqueById(fill.profileBackground, "background").map((entry) => ({
      ...entry,
      description: descriptionFromText(entry.description, [
        "profile-generator",
        "deep-psyche",
        "narrator-external",
      ]),
    }));
  }
  if (fill.appearanceDetails) {
    next.appearanceDetails = uniqueById(fill.appearanceDetails, "appearance").map((entry) => ({
      ...entry,
      description: descriptionFromText(entry.description, [
        "character-image",
        "profile-generator",
      ]),
    }));
  }
  if (fill.psycheCoreNeeds) {
    next.psycheDisposition = {
      coreNeeds: uniqueById(fill.psycheCoreNeeds, "need").map((entry) => ({
        ...entry,
        description: descriptionFromText(entry.description, [
          "deep-psyche",
          "conscious-action",
        ]),
      })),
      description: null,
    };
  }
  if (fill.speech) {
    next.speechPolicy = {
      register: fill.speech.register,
      cadence: fill.speech.cadence,
    };
  }
  if (fill.relationshipSeeds) {
    next.relationshipSeeds = uniqueById(fill.relationshipSeeds, "rel").map((entry) => ({
      id: entry.id,
      target: { kind: "role" as const, role: entry.role },
      relationKinds: entry.relationKinds,
      historySummary: trimText(entry.historySummary, 600)
        ? descriptionFromText(entry.historySummary ?? "", ["deep-psyche", "conscious-action"])
        : null,
      defaultAddress: trimText(entry.defaultAddress, 80),
      selfAwareness: entry.selfAwareness,
      dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 0 },
      priority: entry.priority,
    }));
  }
  if (fill.actionNorms) {
    next.actionNorms = fill.actionNorms;
  }
  if (trimText(fill.expressionNotes, 600)) {
    next.expressionNotes = descriptionFromText(fill.expressionNotes ?? "", [
      "conscious-expression",
      "narrator-external",
    ]);
  }
  return next;
}

function coerceGapFillObject(raw: object): unknown {
  const next = {
    profileBackground: Reflect.get(raw, "profileBackground"),
    appearanceDetails: Reflect.get(raw, "appearanceDetails"),
    psycheDisposition: Reflect.get(raw, "psycheDisposition"),
    speechPolicy: Reflect.get(raw, "speechPolicy"),
    relationshipSeeds: Reflect.get(raw, "relationshipSeeds"),
    actionNorms: Reflect.get(raw, "actionNorms"),
    expressionNotes: Reflect.get(raw, "expressionNotes"),
  };
  if (Array.isArray(next.profileBackground)) {
    next.profileBackground = next.profileBackground.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const description = coerceDescription(
        Reflect.get(entry, "description"),
        ["profile-generator", "deep-psyche", "narrator-external"],
      );
      return description === undefined ? entry : { ...entry, description };
    });
  }
  if (Array.isArray(next.appearanceDetails)) {
    next.appearanceDetails = next.appearanceDetails.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const description = coerceDescription(
        Reflect.get(entry, "description"),
        ["character-image", "profile-generator"],
      );
      return description === undefined ? entry : { ...entry, description };
    });
  }
  if (next.psycheDisposition && typeof next.psycheDisposition === "object") {
    const psyche = {
      coreNeeds: Reflect.get(next.psycheDisposition, "coreNeeds"),
      description: Reflect.get(next.psycheDisposition, "description"),
    };
    if (Array.isArray(psyche.coreNeeds)) {
      psyche.coreNeeds = psyche.coreNeeds.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const description = coerceDescription(
          Reflect.get(entry, "description"),
          ["deep-psyche", "conscious-action"],
        );
        return description === undefined ? entry : { ...entry, description };
      });
    }
    if ("description" in psyche) {
      const description = coerceDescription(psyche.description, ["deep-psyche"]);
      if (description !== undefined) psyche.description = description;
    }
    next.psycheDisposition = psyche;
  }
  if ("expressionNotes" in next) {
    const notes = coerceDescription(next.expressionNotes, [
      "conscious-expression",
      "narrator-external",
    ]);
    if (notes !== undefined) next.expressionNotes = notes;
  }
  return next;
}

export function parseCharacterDefinitionGapFillV2(
  raw: unknown,
): CharacterDefinitionGapFillV2 {
  const llm = CharacterDefinitionLlmFillV2Schema.safeParse(raw);
  if (llm.success) return llmFillToGapFillV2(llm.data);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const normalized = CharacterDefinitionLlmFillV2Schema.safeParse(
      normalizeLlmFillInput(raw),
    );
    if (normalized.success) return llmFillToGapFillV2(normalized.data);
    const strict = CharacterDefinitionGapFillV2Schema.safeParse(raw);
    if (strict.success) return strict.data;
    return CharacterDefinitionGapFillV2Schema.parse(coerceGapFillObject(raw));
  }
  return CharacterDefinitionGapFillV2Schema.parse(raw);
}

export function formatDefinitionSchemaIssues(error: z.ZodError): string {
  return error.issues.slice(0, 4).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  }).join("; ").slice(0, 240);
}

export function listCharacterDefinitionGapsV2(
  definition: CharacterDefinitionV2,
): CharacterDefinitionGapKey[] {
  const gaps: CharacterDefinitionGapKey[] = [];
  if (definition.profileBackground.length === 0) gaps.push("profileBackground");
  if (definition.appearance.details.length === 0) gaps.push("appearanceDetails");
  if (definition.psycheDisposition.coreNeeds.length === 0) {
    gaps.push("psycheCoreNeeds");
  }
  if (
    definition.speechPolicy.register === LEGACY_SPEECH_UNSPECIFIED ||
    definition.speechPolicy.cadence === LEGACY_SPEECH_UNSPECIFIED
  ) {
    gaps.push("speechPolicy");
  }
  if (definition.relationshipSeeds.length === 0) gaps.push("relationshipSeeds");
  if (definition.actionNorms.length === 0) gaps.push("actionNorms");
  if (!definition.expressionNotes) gaps.push("expressionNotes");
  return gaps;
}

export function characterDefinitionPreservedSnapshotV2(
  definition: CharacterDefinitionV2,
) {
  return {
    displayName: definition.identity.displayName,
    names: definition.identity.names.map((name) => ({
      id: name.id,
      kind: name.kind,
      value: name.value,
    })),
    tags: definition.identity.tags,
    presentation: definition.identity.presentation,
    appearanceSummary: definition.appearance.publicSummary,
    tendencies: definition.psycheDisposition.tendencies.map((tendency) => ({
      id: tendency.id,
      label: tendency.label,
    })),
    actionNorms: definition.actionNorms.map((norm) => ({
      id: norm.id,
      statement: norm.response.statement,
      force: norm.force,
    })),
    speech: {
      register: definition.speechPolicy.register,
      cadence: definition.speechPolicy.cadence,
      selfReferenceNameId: definition.speechPolicy.selfReferenceNameId,
    },
    capabilityNames: [
      definition.capabilities.basicAction.name,
      ...definition.capabilities.skills.map((skill) => skill.name),
    ],
  };
}

function dropExactCharacterTargets<T extends {
  target: CharacterDefinitionV2["relationshipSeeds"][number]["target"];
}>(items: readonly T[]): T[] {
  return items.filter((item) => item.target.kind !== "character");
}

function applyOneGapFill(
  next: CharacterDefinitionV2,
  fill: CharacterDefinitionGapFillV2,
  allow: (key: CharacterDefinitionGapKey) => boolean,
): CharacterDefinitionV2 {
  const patched = { ...next };
  if (fill.profileBackground && allow("profileBackground")) {
    patched.profileBackground = fill.profileBackground;
  }
  if (fill.appearanceDetails && allow("appearanceDetails")) {
    patched.appearance = { ...patched.appearance, details: fill.appearanceDetails };
  }
  if (fill.relationshipSeeds && allow("relationshipSeeds")) {
    patched.relationshipSeeds = dropExactCharacterTargets(fill.relationshipSeeds);
  }
  if (fill.actionNorms && allow("actionNorms")) {
    patched.actionNorms = fill.actionNorms;
  }
  if (fill.expressionNotes !== undefined && allow("expressionNotes")) {
    patched.expressionNotes = fill.expressionNotes;
  }
  return patched;
}

function applyPsycheAndSpeechFill(
  next: CharacterDefinitionV2,
  fill: CharacterDefinitionGapFillV2,
  allow: (key: CharacterDefinitionGapKey) => boolean,
): CharacterDefinitionV2 {
  const patched = { ...next };
  if (fill.psycheDisposition && allow("psycheCoreNeeds")) {
    patched.psycheDisposition = {
      ...patched.psycheDisposition,
      coreNeeds: fill.psycheDisposition.coreNeeds ??
        patched.psycheDisposition.coreNeeds,
      description: fill.psycheDisposition.description !== undefined
        ? fill.psycheDisposition.description
        : patched.psycheDisposition.description,
    };
  }
  if (fill.speechPolicy && allow("speechPolicy")) {
    patched.speechPolicy = {
      ...patched.speechPolicy,
      ...fill.speechPolicy,
      addressRules: dropExactCharacterTargets(
        fill.speechPolicy.addressRules ?? patched.speechPolicy.addressRules,
      ),
    };
  }
  return patched;
}

export function applyCharacterDefinitionGapFillV2(
  base: CharacterDefinitionV2,
  fill: CharacterDefinitionGapFillV2,
  sourceKind: CharacterDefinitionSourceKind,
): CharacterDefinitionV2 {
  const gaps = new Set(listCharacterDefinitionGapsV2(base));
  const allow = (key: CharacterDefinitionGapKey) =>
    sourceKind !== "upgrade_description" || gaps.has(key);
  return CharacterDefinitionV2Schema.parse(
    applyPsycheAndSpeechFill(
      applyOneGapFill(structuredClone(base), fill, allow),
      fill,
      allow,
    ),
  );
}

export function restoreAuthoritativeCharacterDefinitionV2(
  base: CharacterDefinitionV2,
  candidate: CharacterDefinitionV2,
  sourceKind: CharacterDefinitionSourceKind,
): CharacterDefinitionV2 {
  const upgrade = sourceKind === "upgrade_description";
  const next: CharacterDefinitionV2 = {
    ...candidate,
    combat: structuredClone(base.combat),
    capabilities: structuredClone(base.capabilities),
    inventory: structuredClone(base.inventory),
    initialLoadout: structuredClone(base.initialLoadout),
    psycheDisposition: {
      ...candidate.psycheDisposition,
      dynamics: structuredClone(base.psycheDisposition.dynamics),
      tendencies: candidate.psycheDisposition.tendencies.length > 0
        ? candidate.psycheDisposition.tendencies
        : structuredClone(base.psycheDisposition.tendencies),
    },
    relationshipSeeds: dropExactCharacterTargets(candidate.relationshipSeeds),
    speechPolicy: {
      ...candidate.speechPolicy,
      addressRules: dropExactCharacterTargets(candidate.speechPolicy.addressRules),
    },
  };
  if (upgrade) {
    next.identity = structuredClone(base.identity);
    next.appearance = {
      ...structuredClone(base.appearance),
      details: candidate.appearance.details,
    };
    if (base.actionNorms.length > 0 && candidate.actionNorms !== base.actionNorms) {
      const candidateIds = new Set(candidate.actionNorms.map((norm) => norm.id));
      const missing = base.actionNorms.some((norm) => !candidateIds.has(norm.id));
      if (missing) next.actionNorms = structuredClone(base.actionNorms);
    }
  }
  const nameIds = new Set(next.identity.names.map((name) => name.id));
  if (
    next.speechPolicy.selfReferenceNameId &&
    !nameIds.has(next.speechPolicy.selfReferenceNameId)
  ) {
    next.speechPolicy = {
      ...next.speechPolicy,
      selfReferenceNameId: base.speechPolicy.selfReferenceNameId &&
          nameIds.has(base.speechPolicy.selfReferenceNameId)
        ? base.speechPolicy.selfReferenceNameId
        : null,
    };
  }
  return CharacterDefinitionV2Schema.parse(next);
}

function mechanicsEqual(
  left: CharacterDefinitionV2,
  right: CharacterDefinitionV2,
): boolean {
  return JSON.stringify({
    combat: left.combat,
    capabilities: left.capabilities,
    inventory: left.inventory,
    initialLoadout: left.initialLoadout,
  }) === JSON.stringify({
    combat: right.combat,
    capabilities: right.capabilities,
    inventory: right.inventory,
    initialLoadout: right.initialLoadout,
  });
}

function compileFindings(
  definition: CharacterDefinitionV2,
): CharacterDefinitionCheckFinding[] {
  const findings: CharacterDefinitionCheckFinding[] = [];
  try {
    compileCharacterActionNormProgramV2(definition);
  } catch (error) {
    findings.push({
      code: "action_norm_compile_failed",
      path: "actionNorms",
      message: error instanceof Error ? error.message : "action norm compile failed",
    });
  }
  try {
    compileCharacterRelationshipProgramV2(definition);
  } catch (error) {
    findings.push({
      code: "relationship_compile_failed",
      path: "relationshipSeeds",
      message: error instanceof Error ? error.message : "relationship compile failed",
    });
  }
  return findings;
}

function referenceFindings(
  definition: CharacterDefinitionV2,
): CharacterDefinitionCheckFinding[] {
  const findings: CharacterDefinitionCheckFinding[] = [];
  for (const [index, seed] of definition.relationshipSeeds.entries()) {
    if (seed.target.kind === "character") {
      findings.push({
        code: "unsupported_character_target",
        path: `relationshipSeeds.${index}.target`,
        message: "exact character targets require a known asset id",
      });
    }
  }
  for (const [index, rule] of definition.speechPolicy.addressRules.entries()) {
    if (rule.target.kind === "character") {
      findings.push({
        code: "unsupported_character_target",
        path: `speechPolicy.addressRules.${index}.target`,
        message: "exact character address targets require a known asset id",
      });
    }
  }
  const nameIds = new Set(definition.identity.names.map((name) => name.id));
  if (
    definition.speechPolicy.selfReferenceNameId &&
    !nameIds.has(definition.speechPolicy.selfReferenceNameId)
  ) {
    findings.push({
      code: "unknown_self_reference",
      path: "speechPolicy.selfReferenceNameId",
      message: "selfReferenceNameId must point at an identity name",
    });
  }
  return findings;
}

function authorityFindings(
  definition: CharacterDefinitionV2,
  options?: {
    base?: CharacterDefinitionV2;
    sourceKind?: CharacterDefinitionSourceKind;
  },
): CharacterDefinitionCheckFinding[] {
  const findings: CharacterDefinitionCheckFinding[] = [];
  if (options?.base && !mechanicsEqual(options.base, definition)) {
    findings.push({
      code: "authoritative_mechanics_drift",
      path: "combat",
      message: "combat, capabilities, inventory, and loadout must stay on the base",
    });
  }
  if (
    options?.sourceKind === "upgrade_description" &&
    options.base &&
    definition.identity.displayName !== options.base.identity.displayName
  ) {
    findings.push({
      code: "authoritative_identity_drift",
      path: "identity.displayName",
      message: "upgrade must keep the existing display name",
    });
  }
  return findings;
}

export function checkCharacterDefinitionV2(
  definition: CharacterDefinitionV2,
  options?: {
    base?: CharacterDefinitionV2;
    sourceKind?: CharacterDefinitionSourceKind;
  },
): CharacterDefinitionCheckFinding[] {
  return [
    ...compileFindings(definition),
    ...referenceFindings(definition),
    ...authorityFindings(definition, options),
  ];
}

export function normalizeCharacterDefinitionV2(input: {
  base: CharacterDefinitionV2;
  candidate: CharacterDefinitionV2;
  sourceKind: CharacterDefinitionSourceKind;
  fill?: CharacterDefinitionGapFillV2 | null;
}): {
  definition: CharacterDefinitionV2;
  findings: CharacterDefinitionCheckFinding[];
} {
  let candidate = input.candidate;
  if (input.fill) {
    try {
      candidate = applyCharacterDefinitionGapFillV2(
        candidate,
        input.fill,
        input.sourceKind,
      );
    } catch (error) {
      const definition = restoreAuthoritativeCharacterDefinitionV2(
        input.base,
        input.candidate,
        input.sourceKind,
      );
      return {
        definition,
        findings: [{
          code: "schema_invalid",
          path: "fill",
          message: error instanceof Error ? error.message : "invalid definition fill",
        }],
      };
    }
  }
  const definition = restoreAuthoritativeCharacterDefinitionV2(
    input.base,
    candidate,
    input.sourceKind,
  );
  return {
    definition,
    findings: checkCharacterDefinitionV2(definition, {
      base: input.base,
      sourceKind: input.sourceKind,
    }),
  };
}
