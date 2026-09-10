import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CharacterDefinitionV3Schema } from "@kshiai/shared";
import { characterDefinitionResponseSchema } from "./character-definition-response-schema.js";
import { assertXaiResponseSchema } from "./provider-response-schema.js";

const NAME = "character_definition_v3";
const PREFIX = `${NAME}_properties_capabilities_properties_basicAction_properties_mechanics_properties_constraints_properties_`;

describe("shared character-definition alias projection", () => {
  it("repairs only the five aliases, retains defaults and leaves input untouched", () => {
    const original = zodResponseFormat(CharacterDefinitionV3Schema, NAME).json_schema.schema;
    const before = structuredClone(original);
    assert.throws(() => assertXaiResponseSchema(original), /circular reference/);
    const normalized = characterDefinitionResponseSchema(original, NAME, []);
    assert.deepEqual(original, before);
    assertXaiResponseSchema(normalized);
    const shape = z.object({ definitions: z.record(z.unknown()) }).passthrough();
    const old = shape.parse(original);
    const restored = shape.parse(normalized);
    const expected = {
      reach: { type: "string", enum: ["contact", "near", "medium", "far", "same_area"], default: "same_area" },
      requiresSight: { type: "boolean", default: false },
      mobility: { type: "string", enum: ["none", "limited", "full"], default: "limited" },
      requiresSpeech: { type: "boolean", default: false },
      requiresUsableHeldObject: { type: "boolean", default: false },
    };
    for (const [field, concrete] of Object.entries(expected)) {
      const key = `${PREFIX}${field}`;
      assert.deepEqual(restored.definitions[key], concrete);
      restored.definitions[key] = old.definitions[key];
    }
    assert.deepEqual(restored, old);
  });
  it("does not reinterpret an unrelated self-reference as a character constraint", () => {
    const original = zodResponseFormat(CharacterDefinitionV3Schema, NAME).json_schema.schema;
    const modified = z.object({ definitions: z.record(z.unknown()) }).passthrough().parse(original);
    modified.definitions.unrelated_properties_reach = { $ref: "#/definitions/unrelated_properties_reach" };
    assert.throws(() => characterDefinitionResponseSchema(modified, NAME, []),
      /Unsupported self-referenced character schema/);
  });
});
