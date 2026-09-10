import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CharacterMigrationJsonSchema, CharacterSemanticMigrationChangeSetV1Schema,
  type CharacterMigrationJson } from "@kshiai/shared";
import { characterMigrationChangeSetResponseSchema } from "./character-migration-response-schema.js";
import { assertXaiResponseSchema } from "./provider-response-schema.js";

const NAME = "character_semantic_migration_change_set_v1";
const VALUE_KEY = `${NAME}_properties_operations_items_properties_value`;

describe("migration provider projection without recursive grammar", () => {
  it("reproduces the retained failing schema, then changes only generic JSON's representation", () => {
    const evidence = z.object({ call: z.object({ responseSchema: z.unknown() }) }).parse(
      JSON.parse(readFileSync(new URL(
        "../../../docs/evidence/semantic-migration-grok-2026-09-10-v1/call-1-before.json",
        import.meta.url), "utf8")),
    );
    const old = zodResponseFormat(CharacterSemanticMigrationChangeSetV1Schema, NAME).json_schema.schema;
    assert.deepEqual(old, evidence.call.responseSchema);
    assert.throws(() => assertXaiResponseSchema(old), /circular reference/);
    const projected = characterMigrationChangeSetResponseSchema();
    assert.doesNotThrow(() => assertXaiResponseSchema(projected));
    const restored = structuredClone(projected);
    const previous = z.object({ definitions: z.record(z.unknown()) }).passthrough().parse(old);
    assert.deepEqual(restored.definitions[VALUE_KEY], { additionalProperties: true });
    restored.definitions[VALUE_KEY] = previous.definitions[VALUE_KEY];
    assert.deepEqual(restored, old); // includes required fields, limits, strictness and six operations
  });
  it("keeps deeply nested typed values, while still rejecting non-JSON values", () => {
    let value: CharacterMigrationJson = { scalar: [null, true, 1.5, "text", {}, []] };
    for (let depth = 0; depth < 80; depth++) value = { child: [value] };
    const change = { schema: NAME, operations: [{ operation: "synthesize",
      targetPath: "definition.profileBackground", sourcePaths: [], value, deferred: null,
      explanation: "Synthetic nested value preservation.", provenance: "model_created",
      semanticDependants: [] }], uncertainties: [] };
    assert.deepEqual(CharacterSemanticMigrationChangeSetV1Schema.parse(change), change);
    for (const bad of [undefined, Infinity, NaN, () => null, { x: undefined }]) {
      assert.equal(CharacterMigrationJsonSchema.safeParse(bad).success, false);
    }
    assert.equal(CharacterSemanticMigrationChangeSetV1Schema.safeParse({
      ...change, operations: [{ ...change.operations[0], value: undefined }],
    }).success, false);
  });
});
