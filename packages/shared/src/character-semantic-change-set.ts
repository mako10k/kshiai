import { z } from "zod";
import { CharacterDeferredValueV1Schema } from "./character-definition-v3.js";
import { CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1 } from "./character-semantic-migration.js";

export type CharacterMigrationJson =
  | null | boolean | number | string
  | CharacterMigrationJson[]
  | { [key: string]: CharacterMigrationJson };

// Validates received JSON and preserves typed internal values. This recursive
// runtime validator is NOT a provider output grammar: xAI disallows circular
// references. The backend projects generic JSON without changing this contract.
export const CharacterMigrationJsonSchema: z.ZodType<CharacterMigrationJson> =
  z.lazy(() => z.union([
    z.null(), z.boolean(), z.number().finite(), z.string(),
    z.array(CharacterMigrationJsonSchema),
    z.record(CharacterMigrationJsonSchema),
  ]));

export const CharacterMigrationPathSchema = z.string().min(1).max(240)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/)
  .refine((path) => !path.split(".").some((part) =>
    ["__proto__", "prototype", "constructor"].includes(part)), "unsafe path");

const CharacterSemanticMigrationOperationV1ObjectSchema = z.object({
  operation: z.enum(["copy", "move", "transform", "synthesize", "retire_to_capsule", "defer"]),
  targetPath: CharacterMigrationPathSchema,
  sourcePaths: z.array(CharacterMigrationPathSchema).max(64),
  value: CharacterMigrationJsonSchema,
  deferred: CharacterDeferredValueV1Schema.nullable(),
  explanation: z.string().min(1).max(600),
  provenance: z.enum(["unchanged", "source_derived", "model_created", "retired", "deferred"]),
  semanticDependants: z.array(CharacterMigrationPathSchema).max(64),
}).strict();
type OperationShape = z.infer<typeof CharacterSemanticMigrationOperationV1ObjectSchema>;

const OPERATION_PROVENANCE: Record<OperationShape["operation"], OperationShape["provenance"][]> = {
  copy: ["unchanged"], move: ["source_derived"], transform: ["source_derived"],
  synthesize: ["source_derived", "model_created"], retire_to_capsule: ["retired"], defer: ["deferred"],
};

function operationProvenanceIssues(operation: OperationShape): string[] {
  const issues: string[] = [];
  if (!OPERATION_PROVENANCE[operation.operation].includes(operation.provenance)) {
    issues.push("provenance does not match the declared operation");
  }
  if (!["synthesize", "defer"].includes(operation.operation) && operation.sourcePaths.length === 0) {
    issues.push("source paths required except for explicitly model-created synthesis or defer");
  }
  if (operation.provenance === "source_derived" && operation.sourcePaths.length === 0) {
    issues.push("derivation requires evidence");
  }
  return issues;
}

function operationPayloadIssues(operation: OperationShape): string[] {
  const issues: string[] = [];
  if (operation.operation === "defer") {
    if (!operation.deferred || operation.value !== null ||
        operation.deferred.targetPath !== operation.targetPath) issues.push("invalid deferred operation");
  } else if (operation.deferred !== null) issues.push("only defer may carry deferred metadata");
  if (operation.operation === "retire_to_capsule" && operation.value !== null) {
    issues.push("retirement must preserve source without a replacement value");
  }
  if (["copy", "move"].includes(operation.operation) &&
      (operation.sourcePaths.length !== 1 || operation.value !== null)) {
    issues.push("copy/move read one registered source; do not echo the value");
  }
  return issues;
}

export const CharacterSemanticMigrationOperationV1Schema = CharacterSemanticMigrationOperationV1ObjectSchema
  .superRefine((operation, context) => {
    for (const message of [...operationProvenanceIssues(operation), ...operationPayloadIssues(operation)]) {
      context.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
export type CharacterSemanticMigrationOperationV1 = z.infer<
  typeof CharacterSemanticMigrationOperationV1Schema
>;

export const CharacterSemanticMigrationChangeSetV1Schema = z.object({
  schema: z.literal(CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1),
  operations: z.array(CharacterSemanticMigrationOperationV1Schema).max(128),
  uncertainties: z.array(z.string().min(1).max(400)).max(16),
}).strict();
export type CharacterSemanticMigrationChangeSetV1 = z.infer<
  typeof CharacterSemanticMigrationChangeSetV1Schema
>;

export const CharacterSemanticConsistencyReviewV1Schema = z.object({
  schema: z.literal("character_semantic_consistency_review_v1"),
  verdict: z.enum(["consistent", "repair_required", "unresolved"]),
  findings: z.array(z.object({
    code: z.string().min(1).max(120),
    targetPaths: z.array(CharacterMigrationPathSchema).min(1).max(64),
    sourcePaths: z.array(CharacterMigrationPathSchema).max(64),
    explanation: z.string().min(1).max(600),
    semanticDependants: z.array(CharacterMigrationPathSchema).max(64),
  }).strict()).max(64),
  summary: z.string().min(1).max(1000),
  uncertainties: z.array(z.string().min(1).max(400)).max(16),
}).strict().superRefine((review, context) => {
  if ((review.verdict === "consistent") !== (review.findings.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: "consistent requires no findings; other verdicts require findings" });
  }
});
export type CharacterSemanticConsistencyReviewV1 = z.infer<
  typeof CharacterSemanticConsistencyReviewV1Schema
>;

export type CharacterMigrationFinding = {
  code: string;
  targetPaths: string[];
  sourcePaths: string[];
  explanation: string;
  semanticDependants: string[];
};

export type CharacterMigrationOwnerDiff = {
  operationId: string;
  category: "unchanged" | "moved" | "transformed" | "synthesized" | "retired" | "deferred";
  targetPath: string;
  sourcePaths: string[];
  before: CharacterMigrationJson | null;
  after: CharacterMigrationJson | null;
  explanation: string;
  provenance: CharacterSemanticMigrationOperationV1["provenance"];
  behavioralEffect: string;
  disclosureEffect: string;
};
