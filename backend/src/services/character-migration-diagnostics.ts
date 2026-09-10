import {
  CharacterDefinitionV3Schema, CharacterSemanticConsistencyReviewV1Schema,
  type CharacterMigrationFinding, type CharacterMigrationJson,
  type CharacterSemanticMigrationOperationV1,
} from "@kshiai/shared";
import { z } from "zod";
import {
  migrationPaths, migrationRead, migrationWrite, pathContains,
  type CharacterMigrationContext,
} from "./character-migration-context.js";

// Diagnostic locations cover the whole inspected envelope, not just writable
// definition fields. This registry grants no write permission.
export function characterMigrationReviewPaths(candidate: CharacterMigrationJson): string[] {
  return migrationPaths(candidate);
}

const ReviewObjectSchema = CharacterSemanticConsistencyReviewV1Schema.innerType();
const ReviewEnvelopeSchema = ReviewObjectSchema.extend({ findings: z.array(z.unknown()).max(64) });
const ReviewFindingSchema = ReviewObjectSchema.shape.findings.element;

function diagnostic(code: string, explanation: string): CharacterMigrationFinding {
  return { code, targetPaths: ["definition.actionNorms"], sourcePaths: [],
    semanticDependants: [], explanation };
}

export function parseCharacterMigrationReview(
  response: unknown, context: CharacterMigrationContext, candidate: CharacterMigrationJson,
) {
  const parsed = ReviewEnvelopeSchema.safeParse(response);
  const findings: CharacterMigrationFinding[] = [];
  if (!parsed.success) return { review: null, findings: [diagnostic("review_schema_invalid",
    "The review envelope did not satisfy CharacterSemanticConsistencyReviewV1.")] };
  const registered = characterMigrationReviewPaths(candidate);
  let invalidFinding = false;
  for (const [index, item] of parsed.data.findings.entries()) {
    const finding = ReviewFindingSchema.safeParse(item);
    if (!finding.success) {
      invalidFinding = true;
      findings.push(diagnostic("review_schema_invalid",
        `Finding ${index}: ${finding.error.issues.map((issue) => issue.message).join("; ").slice(0, 500)}`));
      continue;
    }
    const invalid = [
      ...finding.data.targetPaths.filter((path) => !registered.includes(path)),
      ...finding.data.semanticDependants.filter((path) => !registered.includes(path)),
      ...finding.data.sourcePaths.filter((path) => !context.sourcePaths.includes(path)),
    ];
    if (invalid.length) {
      invalidFinding = true;
      findings.push(diagnostic("review_path_invalid",
        `Finding ${index} (${finding.data.code}) has unregistered paths: ${invalid.join(", ").slice(0, 350)}. Other valid findings are retained.`));
    } else findings.push(finding.data);
  }
  const complete = CharacterSemanticConsistencyReviewV1Schema.safeParse(response);
  if (!complete.success && !invalidFinding) findings.push(diagnostic("review_schema_invalid",
    "Review verdict and findings must agree; this is not a consistency approval."));
  return { review: complete.success && !invalidFinding ? complete.data : null, findings };
}

// Inspect a rejected fragment without applying it or normalizing away old keys.
// This prevents an overlap finding from hiding the next schema error.
export function rejectedCharacterMigrationFragmentFindings(input: {
  context: CharacterMigrationContext;
  candidate: CharacterMigrationJson;
  operation: CharacterSemanticMigrationOperationV1;
}): CharacterMigrationFinding[] {
  const { operation, context } = input;
  if (!["copy", "move", "transform", "synthesize"].includes(operation.operation)) return [];
  const value = ["copy", "move"].includes(operation.operation)
    ? migrationRead(context.sources, operation.sourcePaths[0]) : operation.value;
  if (value === undefined) return [];
  const candidate = structuredClone(input.candidate);
  migrationWrite(candidate, operation.targetPath, value);
  const parsed = CharacterDefinitionV3Schema.safeParse(migrationRead(candidate, "definition"));
  if (parsed.success) return [];
  return parsed.error.issues.flatMap((issue) => {
    const path = ["definition", ...issue.path].join(".");
    if (!pathContains(operation.targetPath, path)) return [];
    return [{ code: "rejected_fragment_schema_invalid", targetPaths: [path],
      sourcePaths: operation.sourcePaths, semanticDependants: operation.semanticDependants,
      explanation: `Rejected ${operation.operation} fragment: ${issue.message}` }];
  });
}
