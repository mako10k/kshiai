import { z } from "zod";
import {
  compileCharacterActionNormProgramV2,
  compileCharacterRelationshipProgramV2,
} from "./character-definition-rules.js";
import {
  CharacterDefinitionV2ObjectSchema,
  CharacterDefinitionV2Schema,
  LEGACY_SPEECH_UNSPECIFIED,
  type CharacterDefinitionV2,
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
