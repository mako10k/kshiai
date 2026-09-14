import { z } from "zod";
import {
  CharacterMigrationPathSchema, CharacterSemanticMigrationChangeSetV1Schema,
  CharacterSemanticMigrationOperationV1Schema,
  type CharacterMigrationFinding, type CharacterSemanticMigrationOperationV1,
} from "@kshiai/shared";
import { migrationFinding } from "./character-migration-merge.js";

// The outer contract stays strict. An invalid operation must not erase its
// structurally valid siblings before the bounded repair request is constructed.
const ResponseEnvelopeSchema = CharacterSemanticMigrationChangeSetV1Schema.extend({
  operations: z.array(z.unknown()).max(128),
});
const TargetHintSchema = z.object({ targetPath: CharacterMigrationPathSchema }).passthrough();

export function parseCharacterMigrationResponse(response: unknown) {
  const outer = ResponseEnvelopeSchema.safeParse(response);
  const operations: CharacterSemanticMigrationOperationV1[] = [];
  const findings: CharacterMigrationFinding[] = [];
  if (!outer.success) {
    return { changeSet: null, findings: [migrationFinding("change_set_schema_invalid",
      "definition.actionNorms", outer.error.issues.map((issue) =>
        `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 2000))] };
  }
  for (const [index, candidate] of outer.data.operations.entries()) {
    const parsed = CharacterSemanticMigrationOperationV1Schema.safeParse(candidate);
    if (parsed.success) operations.push(parsed.data);
    else {
      const target = TargetHintSchema.safeParse(candidate);
      findings.push(migrationFinding("operation_schema_invalid",
        target.success ? target.data.targetPath : "definition.actionNorms",
        `Operation ${index}: ${parsed.error.issues.map((issue) => issue.message).join("; ").slice(0, 1500)}`));
    }
  }
  return { changeSet: { ...outer.data, operations }, findings };
}
