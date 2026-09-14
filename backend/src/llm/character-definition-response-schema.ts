import { assertXaiResponseSchema } from "./provider-response-schema.js";

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schemaObject(value: unknown, label: string): Record<string, unknown> {
  if (!isSchemaObject(value)) {
    throw new Error(`Character definition schema lacks ${label}`);
  }
  // A checked identity-preserving narrowing, not Zod.parse's detached copy.
  return value;
}

function nestedSchema(root: Record<string, unknown>, path: readonly string[]) {
  let current = root;
  for (const segment of path) current = schemaObject(current[segment], path.join("."));
  return current;
}

/** Repair the SDK's duplicate-default aliases using the generated concrete type. */
export function characterDefinitionResponseSchema(
  generated: unknown, formatName: string, definitionPath: readonly string[],
) {
  const schema = schemaObject(structuredClone(generated), "root");
  const definitions = nestedSchema(schema, ["definitions"]);
  const path = [...definitionPath, "properties", "capabilities", "properties", "basicAction",
    "properties", "mechanics", "properties", "constraints", "properties"];
  const constraints = nestedSchema(schema, path);
  const fields = ["reach", "requiresSight", "mobility", "requiresSpeech", "requiresUsableHeldObject"];
  const names = new Map(fields.map((field) => [[formatName, ...path, field].join("_"), field]));
  for (const [name, value] of Object.entries(definitions)) {
    const direct = schemaObject(value, `definitions.${name}`);
    if (direct.$ref !== `#/definitions/${name}`) continue;
    const field = names.get(name);
    if (!field) throw new Error(`Unsupported self-referenced character schema: ${name}`);
    definitions[name] = structuredClone(schemaObject(constraints[field], `constraints.${field}`));
  }
  // Never erase an unrelated recursive definition or return a detached repair.
  assertXaiResponseSchema(schema);
  return schema;
}
