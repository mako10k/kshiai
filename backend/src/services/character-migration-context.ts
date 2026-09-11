import {
  CharacterGenerationEnvelopeV2Schema,
  CharacterMigrationJsonSchema,
  type CharacterGenerationEnvelopeV2,
  type CharacterMigrationJson,
  type CharacterSemanticMigrationAttemptV1,
} from "@kshiai/shared";
import { assetContentDigest } from "../repositories/asset-generations.js";

export const CHARACTER_MIGRATION_PROMPT_V1 = "character-semantic-migration-prompt-v1";
export const CHARACTER_MIGRATION_PROMPT_V2 = "character-semantic-migration-prompt-v2";
export const CHARACTER_MIGRATION_PROMPT_V3 = "character-semantic-migration-prompt-v3";
export const CHARACTER_MIGRATION_PROMPT_V4 = "character-semantic-migration-prompt-v4";
export function usesCharacterMigrationV3Diagnostics(promptIdentity: string): boolean {
  return [CHARACTER_MIGRATION_PROMPT_V3, CHARACTER_MIGRATION_PROMPT_V4].includes(promptIdentity);
}
export const SEMANTIC_COLLECTIONS = [
  "definition.actionNorms", "definition.consciousGuidance",
  "definition.mechanicalConflictFallbacks",
];
const ID_COLLECTION_LIMITS: Record<string, number> = {
  "definition.identity.names": 12, "definition.appearance.details": 16,
  "definition.profileBackground": 16, "definition.psycheDisposition.coreNeeds": 6,
  "definition.psycheDisposition.tendencies": 12, "definition.actionNorms": 12,
  "definition.consciousGuidance": 12, "definition.mechanicalConflictFallbacks": 8,
  "definition.speechPolicy.silenceRules": 8, "definition.speechPolicy.addressRules": 12,
  "definition.speechPolicy.examples": 6, "definition.speechPolicy.counterexamples": 6,
  "definition.relationshipSeeds": 24,
};

export function migrationObject(
  value: CharacterMigrationJson | undefined,
): value is { [key: string]: CharacterMigrationJson } {
  return value !== undefined && value !== null && typeof value === "object" &&
    !Array.isArray(value);
}

export function migrationRead(
  value: CharacterMigrationJson, path: string,
): CharacterMigrationJson | undefined {
  let current: CharacterMigrationJson | undefined = value;
  for (const part of path.split(".")) {
    if (Array.isArray(current)) {
      current = /^(0|[1-9][0-9]*)$/.test(part) ? current[Number(part)] : undefined;
    } else if (migrationObject(current) && Object.hasOwn(current, part)) {
      current = current[part];
    } else return undefined;
  }
  return current;
}

export function migrationWrite(
  root: CharacterMigrationJson, path: string, value: CharacterMigrationJson,
): void {
  const parts = path.split(".");
  const leaf = parts.pop();
  const parent = parts.length ? migrationRead(root, parts.join(".")) : root;
  if (leaf && Array.isArray(parent) && /^(0|[1-9][0-9]*)$/.test(leaf) &&
      Number(leaf) < parent.length) {
    parent[Number(leaf)] = structuredClone(value);
  } else if (leaf && migrationObject(parent) && Object.hasOwn(parent, leaf)) {
    parent[leaf] = structuredClone(value);
  } else throw new Error("CHARACTER_MIGRATION_TARGET_PARENT_MISSING");
}

export function migrationPaths(value: CharacterMigrationJson, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return prefix ? [prefix] : [];
  return [
    ...(prefix ? [prefix] : []),
    ...Object.entries(value).flatMap(([key, child]) =>
      migrationPaths(child, prefix ? `${prefix}.${key}` : key)),
  ].sort();
}

export function pathContains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}.`);
}

export function migrationTargetPaths(candidate: CharacterMigrationJson): string[] {
  return migrationPaths(candidate).filter((path) =>
    path.startsWith("definition.") && path !== "definition.schemaVersion");
}

export type CharacterMigrationContext = {
  attempt: CharacterSemanticMigrationAttemptV1;
  source: CharacterGenerationEnvelopeV2;
  sources: CharacterMigrationJson;
  baseline: CharacterMigrationJson;
  sourcePaths: string[];
  allocatedIds: Record<string, string[]>;
};

export function createCharacterMigrationContext(
  attempt: CharacterSemanticMigrationAttemptV1,
): CharacterMigrationContext {
  if (![CHARACTER_MIGRATION_PROMPT_V1, CHARACTER_MIGRATION_PROMPT_V2,
    CHARACTER_MIGRATION_PROMPT_V3, CHARACTER_MIGRATION_PROMPT_V4].includes(attempt.promptIdentity)) {
    throw new Error("CHARACTER_MIGRATION_PROMPT_IDENTITY_UNSUPPORTED");
  }
  const source = CharacterGenerationEnvelopeV2Schema.parse(attempt.sourceContent);
  const { actionNorms: _norms, schemaVersion: _schema, ...stable } = source.definition;
  const baseline = CharacterMigrationJsonSchema.parse({
    ...source,
    definitionSchema: { family: "character", version: 3 },
    definition: { ...stable, schemaVersion: 3, actionNorms: [],
      consciousGuidance: [], mechanicalConflictFallbacks: [] },
    deferredValues: { contractVersion: 1, values: [] },
    compilerCompatibility: attempt.compilerCapabilities.required,
    provenance: {
      ...source.provenance, sourceKind: "import",
      sourceDigest: attempt.sourceContentDigest, attemptId: attempt.migrationAttemptId,
      structureGeneratorContract: attempt.promptIdentity,
    },
  });
  const natural = Object.fromEntries(
    attempt.naturalSource?.fragments.map((fragment, index) =>
      [`fragment${index}`, fragment.value]) ?? [],
  );
  const sources = CharacterMigrationJsonSchema.parse({ ...source, natural });
  const allocatedIds = Object.fromEntries(Object.entries(ID_COLLECTION_LIMITS).map(([path, limit]) => [
    path,
    Array.from({ length: limit }, (_, slot) =>
      `migration-${assetContentDigest({
        attempt: attempt.migrationAttemptId, path, slot,
      }).slice(0, 32)}`),
  ]));
  return { attempt, source, sources, baseline, sourcePaths: migrationPaths(sources),
    allocatedIds };
}

// Structural neighbours are permissions to repair, not a demand to rewrite them.
// Model/reviewer-declared dependants extend this set even when already schema-valid.
const DEPENDENCY_GROUPS = [
  [...SEMANTIC_COLLECTIONS, "definition.capabilities"],
  ["definition.relationshipSeeds", "definition.speechPolicy", ...SEMANTIC_COLLECTIONS],
  ["definition.identity", "definition.speechPolicy"],
  ["definition.inventory", "definition.initialLoadout", "definition.combat"],
  ["definition.profileBackground", "definition.psycheDisposition", "definition.expressionNotes"],
];

export function characterMigrationRepairClosure(
  paths: string[], candidate: CharacterMigrationJson,
): string[] {
  const registered = migrationTargetPaths(candidate);
  const seeds = paths.filter((path) => registered.includes(path));
  const neighbours = DEPENDENCY_GROUPS.filter((group) =>
    group.some((root) => seeds.some((path) => pathContains(root, path))));
  return [...new Set([...seeds, ...neighbours.flat()])].sort();
}
