import {
  CharacterGenerationEnvelopeV3Schema, CharacterMigrationJsonSchema,
  compileCharacterActionNormProgramV3, compileCharacterConsciousGuidanceV1,
  compileCharacterMechanicalConflictFallbacksV1,
  projectCharacterCompilerCompatibilityV1,
  type CharacterCompilerCapabilityV1, type CharacterCompilerCompatibilityV1,
  type CharacterGenerationEnvelopeV3, type CharacterMigrationFinding,
} from "@kshiai/shared";
import { assetContentDigest } from "../repositories/asset-generations.js";
import {
  migrationPaths, migrationRead, migrationTargetPaths,
  migrationWrite, pathContains, SEMANTIC_COLLECTIONS, type CharacterMigrationContext,
} from "./character-migration-context.js";
import {
  migrationCapsuleFinding, migrationFinding, migrationPreservationEntries,
  type CharacterMigrationMerge,
} from "./character-migration-merge.js";
import { validateCharacterMigrationDeferred } from "./character-migration-deferred.js";
import { characterMigrationReferenceFindings } from "./character-migration-references.js";

function changed(
  context: CharacterMigrationContext, state: CharacterMigrationMerge, path: string,
): boolean {
  return assetContentDigest(migrationRead(context.sources, path) ?? null) !==
    assetContentDigest(migrationRead(state.candidate, path) ?? null);
}

function coverageFindings(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationFinding[] {
  const findings: CharacterMigrationFinding[] = [];
  const registered = migrationTargetPaths(state.candidate);
  for (const path of context.sourcePaths) {
    if (!path.startsWith("definition.") || path === "definition.schemaVersion") continue;
    const value = migrationRead(context.sources, path);
    if (value !== null && typeof value === "object" && Object.keys(value ?? {}).length) continue;
    if (!changed(context, state, path)) continue;
    if (state.operations.some((operation) =>
      operation.sourcePaths.some((source) => pathContains(source, path)) ||
      pathContains(operation.targetPath, path))) continue;
    const target = registered.includes(path) ? path :
      registered.filter((entry) => pathContains(entry, path)).at(-1) ?? "definition.actionNorms";
    findings.push({ ...migrationFinding("source_not_accounted", target,
      "A changed or removed source value needs an explicit source-derived or retirement operation."),
    sourcePaths: [path] });
  }
  return findings;
}

function idFindings(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationFinding[] {
  return migrationPaths(state.candidate).filter((path) =>
    path.startsWith("definition.") && path.endsWith(".id")).flatMap((path) => {
    const value = migrationRead(state.candidate, path);
    if (value === migrationRead(context.sources, path)) return [];
    const collection = Object.keys(context.allocatedIds).find((root) => pathContains(root, path));
    const existing = collection ? context.sourcePaths.filter((source) =>
      pathContains(collection, source) && source.endsWith(".id")).map((source) =>
      migrationRead(context.sources, source)) : [];
    if (collection && typeof value === "string" &&
        (context.allocatedIds[collection].includes(value) || existing.includes(value))) return [];
    return [migrationFinding("unregistered_stable_id", path,
      "Use an existing ID at its source location or the server-allocated ID pool.")];
  });
}

function mechanicalPaths(context: CharacterMigrationContext): string[] {
  return [
    "definition.combat", "definition.initialLoadout",
    "definition.capabilities.basicAction.id", "definition.capabilities.basicAction.kind",
    "definition.capabilities.basicAction.mechanics", "definition.capabilities.basicAction.tacticTags",
    ...context.source.definition.capabilities.skills.flatMap((_, index) =>
      ["id", "kind", "mechanics", "tacticTags"].map((key) =>
        `definition.capabilities.skills.${index}.${key}`)),
    ...context.source.definition.inventory.flatMap((_, index) =>
      ["id", "equipmentBonuses", "battleStartEffects", "affordance"].map((key) =>
        `definition.inventory.${index}.${key}`)),
  ];
}

function mechanicsFindings(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationFinding[] {
  const changedPaths = mechanicalPaths(context).filter((path) => changed(context, state, path));
  for (const path of ["definition.capabilities.skills", "definition.inventory"]) {
    const source = migrationRead(context.sources, path);
    const target = migrationRead(state.candidate, path);
    if (Array.isArray(source) && Array.isArray(target) && source.length !== target.length) {
      changedPaths.push(path);
    }
  }
  return changedPaths.map((path) => migrationFinding("mechanics_not_authorized", path,
    "Semantic migration cannot invent or change frozen combat mechanics, action catalogs or loadout."));
}

function fallbackFindings(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
  candidate: CharacterGenerationEnvelopeV3,
): CharacterMigrationFinding[] {
  return context.source.definition.actionNorms.flatMap((norm, index) => {
    const ref = norm.response.fallbackActionRef;
    if (ref === null || candidate.definition.mechanicalConflictFallbacks.some((entry) =>
      entry.orderedActionRefs.includes(ref))) return [];
    const sourcePath = `definition.actionNorms.${index}.response.fallbackActionRef`;
    if (state.operations.some((entry) => entry.operation === "retire_to_capsule" &&
        entry.sourcePaths.some((path) => pathContains(path, sourcePath)))) return [];
    return [{ ...migrationFinding("fallback_not_accounted",
      "definition.mechanicalConflictFallbacks",
      "A non-null source fallback must be represented or explicitly retired, never silently discarded."),
    sourcePaths: [sourcePath] }];
  });
}

function ruleMatches(pattern: string, path: string): boolean {
  const normalized = path.replace(/^definition\./, "").replace(/\.text$/, "");
  const patterns = pattern.includes("/") ? pattern.split("/").map((ending, index, all) =>
    index === 0 ? ending : all[0].replace(/[^.]+$/, ending)) : [pattern];
  return patterns.some((entry) => {
    const parts = entry.split(".");
    const target = normalized.split(".");
    return parts.length <= target.length && parts.every((part, index) =>
      part === "*" || part === target[index]);
  });
}

function grantKey(rule: CharacterMigrationContext["source"]["disclosurePolicy"]["rules"][number]): string {
  return assetContentDigest({ channel: rule.channel, target: rule.target,
    prerequisites: [...rule.prerequisites].sort() });
}

function disclosureFindings(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationFinding[] {
  const rules = context.source.disclosurePolicy.rules;
  return state.operations.flatMap((operation) => {
    if (["copy", "retire_to_capsule", "defer"].includes(operation.operation)) return [];
    const targets = migrationPaths(state.candidate).filter((path) =>
      pathContains(operation.targetPath, path) &&
      typeof migrationRead(state.candidate, path) === "string" &&
      changed(context, state, path));
    return targets.flatMap((path) => {
      const grants = rules.filter((rule) => ruleMatches(rule.valuePath, path));
      if (grants.length === 0) return [];
      // Creating an absent value under an existing field-level grant does not
      // add a right. Its declared provenance still requires whole-source review.
      if (operation.provenance === "model_created" && operation.sourcePaths.length === 0 &&
          migrationRead(context.sources, path) === undefined) return [];
      const permitted = grants.every((grant) => operation.sourcePaths.length > 0 &&
        operation.sourcePaths.every((sourcePath) => rules.some((rule) =>
          ruleMatches(rule.valuePath, sourcePath) && grantKey(rule) === grantKey(grant))));
      return permitted ? [] : [migrationFinding("disclosure_ceiling_exceeded", path,
        "Use exact source paths with matching disclosure grants; private sources cannot widen public access.")];
    });
  });
}

function consumerTagFindings(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationFinding[] {
  return migrationPaths(state.candidate).filter((path) => path.endsWith(".consumerTags"))
    .flatMap((path) => {
      if (!changed(context, state, path)) return [];
      const target = migrationRead(state.candidate, path);
      const operation = [...state.operations].reverse().find((entry) => pathContains(entry.targetPath, path));
      const sources = operation?.sourcePaths.flatMap((source) =>
        context.sourcePaths.filter((entry) => pathContains(source, entry) &&
          entry.endsWith(".consumerTags"))) ?? [];
      const allowed = sources.flatMap((source) => {
        const value = migrationRead(context.sources, source);
        return Array.isArray(value) ? value : [];
      });
      return Array.isArray(target) && target.every((tag) => allowed.includes(tag)) ? [] :
        [migrationFinding("consumer_access_widened", path,
          "Generated consumerTags must not grant new access; use source-supported tags or none.")];
    });
}

export function carryCharacterMigrationDisclosure(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): void {
  // Rules for removed V2 statements cannot accidentally address V3 executable norms.
  // New text is private unless its operation identifies an equally disclosed source.
  const rules = context.source.disclosurePolicy.rules.filter((rule) =>
    !rule.valuePath.startsWith("actionNorms."));
  for (const path of migrationPaths(state.candidate)) {
    if (!SEMANTIC_COLLECTIONS.some((root) => pathContains(root, path)) ||
        !(path.endsWith(".statement") || path.endsWith(".description.text"))) continue;
    const operation = [...state.operations].reverse().find((entry) => pathContains(entry.targetPath, path));
    if (!operation || operation.sourcePaths.length === 0) continue;
    const candidates = context.source.disclosurePolicy.rules.filter((rule) =>
      operation.sourcePaths.every((source) => ruleMatches(rule.valuePath, source)));
    for (const rule of candidates) {
      rules.push({ ...rule, valuePath: path.replace(/^definition\./, "").replace(/\.text$/, "") });
    }
  }
  migrationWrite(state.candidate, "disclosurePolicy", CharacterMigrationJsonSchema.parse({
    version: 1, rules,
  }));
}

export type CharacterMigrationValidation = {
  candidate: CharacterGenerationEnvelopeV3 | null;
  findings: CharacterMigrationFinding[];
  compatibility: CharacterCompilerCompatibilityV1 | null;
};

export function validateCharacterMigrationCandidate(input: {
  context: CharacterMigrationContext;
  state: CharacterMigrationMerge;
  availableCapabilities: CharacterCompilerCapabilityV1[];
}): CharacterMigrationValidation {
  const { context, state } = input;
  const deferred = validateCharacterMigrationDeferred(state.deferred);
  const findings = [...state.findings, ...coverageFindings(context, state),
    ...idFindings(context, state), ...mechanicsFindings(context, state),
    ...disclosureFindings(context, state), ...consumerTagFindings(context, state),
    ...migrationCapsuleFinding(migrationPreservationEntries(context, state)), ...deferred.findings];
  const parsed = CharacterGenerationEnvelopeV3Schema.safeParse(state.candidate);
  if (!parsed.success) {
    findings.push(...parsed.error.issues.map((issue) =>
      migrationFinding("candidate_schema_invalid", issue.path.join("."), issue.message)));
    return { candidate: null, findings, compatibility: null };
  }
  findings.push(...fallbackFindings(context, state, parsed.data));
  findings.push(...characterMigrationReferenceFindings({ context, state, candidate: parsed.data }));
  compileCharacterActionNormProgramV3(parsed.data.definition);
  compileCharacterConsciousGuidanceV1(parsed.data.definition);
  compileCharacterMechanicalConflictFallbacksV1(parsed.data.definition);
  const compatibility = projectCharacterCompilerCompatibilityV1({
    required: context.attempt.compilerCapabilities, available: input.availableCapabilities,
    deferredValues: deferred.expanded, blocked: [],
  });
  return { candidate: parsed.data, findings, compatibility };
}
