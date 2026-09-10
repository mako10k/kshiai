import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CharacterSemanticMigrationChangeSetV1Schema } from "@kshiai/shared";
import { assertXaiResponseSchema } from "./provider-response-schema.js";

const FORMAT_NAME = "character_semantic_migration_change_set_v1";
const VALUE_DEFINITION = `${FORMAT_NAME}_properties_operations_items_properties_value`;

/** Same JSON value domain, different grammar representation; no depth cap. */
export function characterMigrationChangeSetResponseSchema() {
  const schema = z.object({ definitions: z.record(z.unknown()) }).passthrough().parse(
    zodResponseFormat(CharacterSemanticMigrationChangeSetV1Schema, FORMAT_NAME).json_schema.schema,
  );
  const reference = { $ref: `#/definitions/${VALUE_DEFINITION}` };
  const expectedJsonDefinition = { anyOf: [
    { type: "null" }, { type: "boolean" }, { type: "number" }, { type: "string" },
    { type: "array", items: reference }, { type: "object", additionalProperties: reference },
  ] };
  // Only this proven generic-JSON definition has an equivalent unrestricted
  // JSON Schema. Never delete arbitrary cycles or widen a constrained field.
  if (!isDeepStrictEqual(schema.definitions[VALUE_DEFINITION], expectedJsonDefinition)) {
    throw new Error("CHARACTER_MIGRATION_JSON_PROJECTION_DRIFT");
  }
  // {} admits every JSON value. Explicit additionalProperties:true also avoids
  // xAI's implicit closed-object default, without limiting scalar/array values.
  // Required fields, six operations and the strict surrounding object stay intact.
  // The shared recursive schema remains the authoritative received-value validator.
  schema.definitions[VALUE_DEFINITION] = { additionalProperties: true };
  assertXaiResponseSchema(schema);
  return schema;
}
