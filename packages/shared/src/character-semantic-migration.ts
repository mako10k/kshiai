import { z } from "zod";
import { CharacterCompilerCapabilitySetV1Schema } from "./character-definition-v3.js";

export const CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1 =
  "character_semantic_migration_contract_v1" as const;
export const CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1 =
  "character_semantic_migration_change_set_v1" as const;
export const CHARACTER_SEMANTIC_REMIGRATION_CONSUMER_V1 =
  "character_semantic_remigration_v1" as const;
export const CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT = 6;
export const CHARACTER_MIGRATION_CAPSULE_MAX_BYTES = 256 * 1024;

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const QualifiedIdentitySchema = z.string().min(1).max(160);
const StableIdSchema = z.string().min(1).max(200);
const TimestampSchema = z.string().datetime({ offset: true });

function isJsonValue(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  ancestors.add(value);
  const valid = Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

const JsonValueSchema = z.unknown().refine(isJsonValue, "expected JSON value");

const CharacterMigrationDisclosureContractV1Schema = z.enum([
  "character_semantic_migration_owner_source_v1",
  "character_semantic_migration_public_source_v1",
]);

function disclosurePathAllowed(contractId: string, path: string): boolean {
  const prefixes = contractId === "character_semantic_migration_owner_source_v1"
    ? ["characterAuthoring.sourceText", "characterPublicProfile"]
    : ["characterPublicProfile"];
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
}

export const CharacterMigrationNaturalSourceV1Schema = z.object({
  disclosureContractId: CharacterMigrationDisclosureContractV1Schema,
  allowedSourcePaths: z.array(z.string().min(1).max(240)).max(128),
  contentDigest: DigestSchema,
  fragments: z.array(z.object({
    sourcePath: z.string().min(1).max(240),
    value: JsonValueSchema,
  }).strict()).max(128),
}).strict().superRefine((value, context) => {
  const allowed = new Set(value.allowedSourcePaths);
  const fragmentPaths = value.fragments.map((fragment) => fragment.sourcePath);
  if (allowed.size !== value.allowedSourcePaths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allowedSourcePaths"],
      message: "duplicate allowed natural-source path",
    });
  }
  if (new Set(fragmentPaths).size !== fragmentPaths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fragments"],
      message: "duplicate natural-source fragment path",
    });
  }
  if (
    fragmentPaths.length !== allowed.size
    || fragmentPaths.some((path) => !allowed.has(path))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fragments"],
      message: "natural-source fragments must exactly match allowedSourcePaths",
    });
  }
  if (value.allowedSourcePaths.some(
    (path) => !disclosurePathAllowed(value.disclosureContractId, path),
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allowedSourcePaths"],
      message: "natural-source path is not granted by the disclosure contract",
    });
  }
});

export const CharacterSemanticMigrationAttemptV1Schema = z.object({
  migrationAttemptId: StableIdSchema,
  ownerUserId: StableIdSchema,
  characterId: StableIdSchema,
  sourceGenerationId: StableIdSchema,
  sourceSchemaVersion: z.literal(2),
  sourceContentDigest: DigestSchema,
  sourceContent: JsonValueSchema,
  naturalSource: CharacterMigrationNaturalSourceV1Schema.nullable(),
  targetSchemaVersion: z.literal(3),
  migrationContractId: z.literal(CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1),
  promptIdentity: QualifiedIdentitySchema,
  responseSchemaIdentity: z.literal(
    CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
  ),
  providerRoute: QualifiedIdentitySchema,
  modelIdentity: QualifiedIdentitySchema,
  compilerCapabilities: CharacterCompilerCapabilitySetV1Schema,
  initialRequestDigest: DigestSchema,
  createdAt: TimestampSchema,
}).strict();

export type CharacterSemanticMigrationAttemptV1 = z.infer<
  typeof CharacterSemanticMigrationAttemptV1Schema
>;

export const CharacterSemanticMigrationRequestKindV1Schema = z.enum([
  "initial_generation",
  "semantic_review",
  "semantic_repair",
  "semantic_rereview",
]);

export const CharacterSemanticMigrationProviderRequestV1Schema = z.object({
  providerRequestId: StableIdSchema,
  migrationAttemptId: StableIdSchema,
  parentProviderRequestId: StableIdSchema.nullable(),
  ordinal: z.number().int().min(1).max(CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT),
  kind: CharacterSemanticMigrationRequestKindV1Schema,
  requestDigest: DigestSchema,
  createdAt: TimestampSchema,
}).strict();

export type CharacterSemanticMigrationProviderRequestV1 = z.infer<
  typeof CharacterSemanticMigrationProviderRequestV1Schema
>;

export const CharacterSemanticMigrationProviderAccountingV1Schema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  elapsedMs: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.totalTokens !== value.inputTokens + value.outputTokens) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalTokens"],
      message: "totalTokens must equal inputTokens plus outputTokens",
    });
  }
});

export const CharacterSemanticMigrationProviderReceiptV1Schema = z.discriminatedUnion(
  "outcome",
  [
    z.object({
      outcome: z.literal("succeeded"),
      responseDigest: DigestSchema,
      response: JsonValueSchema,
      accounting: CharacterSemanticMigrationProviderAccountingV1Schema,
      finishedAt: TimestampSchema,
    }).strict(),
    z.object({
      outcome: z.literal("failed"),
      failureCode: z.string().min(1).max(160),
      failureDetail: z.string().max(2000).nullable(),
      accounting: CharacterSemanticMigrationProviderAccountingV1Schema,
      finishedAt: TimestampSchema,
    }).strict(),
  ],
);

export type CharacterSemanticMigrationProviderReceiptV1 = z.infer<
  typeof CharacterSemanticMigrationProviderReceiptV1Schema
>;

export const CharacterSemanticMigrationEventTypeV1Schema = z.enum([
  "attempt_started",
  "provider_request_recorded",
  "provider_request_succeeded",
  "provider_request_failed",
]);

export const CharacterSemanticMigrationEventV1Schema = z.object({
  migrationAttemptId: StableIdSchema,
  sequence: z.number().int().positive(),
  type: CharacterSemanticMigrationEventTypeV1Schema,
  subjectId: StableIdSchema,
  details: z.record(z.unknown()).refine(isJsonValue, "expected JSON object"),
  createdAt: TimestampSchema,
}).strict();

export type CharacterSemanticMigrationEventV1 = z.infer<
  typeof CharacterSemanticMigrationEventV1Schema
>;

export const MigrationPreservationEntryV1Schema = z.object({
  sourcePath: z.string().min(1).max(240),
  value: JsonValueSchema,
  operationId: StableIdSchema,
  provenanceCategory: z.enum([
    "copied_then_changed",
    "moved",
    "transformed",
    "retired",
  ]),
}).strict();

export const MigrationPreservationCapsuleV1Schema = z.object({
  capsuleVersion: z.literal(1),
  migrationAttemptId: StableIdSchema,
  sourceGenerationId: StableIdSchema,
  targetGenerationId: StableIdSchema,
  entries: z.array(MigrationPreservationEntryV1Schema).min(1).max(512),
  createdAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  const paths = value.entries.map((entry) => entry.sourcePath);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entries"],
      message: "duplicate preserved source path",
    });
  }
});

export type MigrationPreservationCapsuleV1 = z.infer<
  typeof MigrationPreservationCapsuleV1Schema
>;
