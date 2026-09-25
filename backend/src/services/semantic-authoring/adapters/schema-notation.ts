import { z } from "zod";
import {
  CharacterDescriptionV2Schema,
  CharacterNormClauseV2Schema,
  CharacterRelationshipTargetV2Schema,
} from "@kshiai/shared";

const schemaAliases = {
  NormClause: CharacterNormClauseV2Schema,
  Description: CharacterDescriptionV2Schema,
  RelationshipTarget: CharacterRelationshipTargetV2Schema,
};

function schemaAliasNotation(schema: z.ZodTypeAny, expandAlias: boolean): string | undefined {
  if (!expandAlias) {
    for (const [name, alias] of Object.entries(schemaAliases)) if (schema === alias) return name;
  }
  return undefined;
}

function wrappedSchemaNotation(schema: z.ZodTypeAny): string | undefined {
  if (schema instanceof z.ZodEffects) return schemaNotation(schema.innerType());
  if (schema instanceof z.ZodOptional) return `${schemaNotation(schema.unwrap())}?`;
  if (schema instanceof z.ZodNullable) return `${schemaNotation(schema.unwrap())}|null`;
  if (schema instanceof z.ZodDefault) return schemaNotation(schema.removeDefault());
  return undefined;
}

function primitiveSchemaNotation(schema: z.ZodTypeAny): string | undefined {
  if (schema instanceof z.ZodLiteral) return JSON.stringify(schema.value);
  if (schema instanceof z.ZodEnum) {
    return schema.options.map((value: string) => JSON.stringify(value)).join("|");
  }
  if (schema instanceof z.ZodString || schema instanceof z.ZodNumber) {
    const limits = schema._def.checks.map((check) => {
      if (check.kind === "min") return `>=${check.value}`;
      if (check.kind === "max") return `<=${check.value}`;
      if (check.kind === "int") return "integer";
      if (check.kind === "regex") return String(check.regex);
      return check.kind;
    });
    return `${schema instanceof z.ZodString ? "string" : "number"}(${limits.join(",")})`;
  }
  if (schema instanceof z.ZodBoolean) return "boolean";
  return undefined;
}

function collectionSchemaNotation(schema: z.ZodTypeAny): string | undefined {
  if (schema instanceof z.ZodArray) return `[${schemaNotation(schema.element)}]`
    + (schema._def.minLength ? `min${schema._def.minLength.value}` : "")
    + (schema._def.maxLength ? `max${schema._def.maxLength.value}` : "");
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodTypeAny> = schema.shape;
    return `{${Object.entries(shape).map(([key, child]) => `${key}:${schemaNotation(child)}`).join(",")}}`;
  }
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const options: z.ZodTypeAny[] = schema.options;
    return options.map((option) => schemaNotation(option)).join(" OR ");
  }
  return undefined;
}

/** Compact notation is generated from the decoder schemas, never maintained as a second contract. */
export function schemaNotation(schema: z.ZodTypeAny, expandAlias = false): string {
  const notation = schemaAliasNotation(schema, expandAlias)
    ?? wrappedSchemaNotation(schema)
    ?? primitiveSchemaNotation(schema)
    ?? collectionSchemaNotation(schema);
  if (notation !== undefined) return notation;
  throw new Error("FOCUSED_CHARACTER_SCHEMA_NOTATION_UNSUPPORTED");
}

export const characterSchemaAliases = schemaAliases;
