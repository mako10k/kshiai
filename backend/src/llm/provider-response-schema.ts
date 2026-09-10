// Provider grammar is not the application's value validator. xAI rejects
// circular local references; other providers may legitimately support them.
// This is a graph check, not a complete implementation of xAI's schema dialect.
export class ProviderResponseSchemaError extends Error {
  constructor(detail: string) {
    super(`XAI_RESPONSE_SCHEMA_INVALID:${detail}`);
    this.name = "ProviderResponseSchemaError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function localReference(root: unknown, reference: string): unknown {
  if (reference === "#") return root;
  let node = root;
  for (const part of decodeURIComponent(reference.slice(2)).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(node) && /^(0|[1-9][0-9]*)$/.test(key)) {
      const values: readonly unknown[] = node;
      node = values[Number(key)];
    } else if (record(node) && Object.hasOwn(node, key)) node = node[key];
    else throw new ProviderResponseSchemaError(`unresolved reference ${reference}`);
  }
  if (node === undefined) throw new ProviderResponseSchemaError(`unresolved reference ${reference}`);
  return node;
}

function childSchemas(node: Record<string, unknown>): unknown[] {
  const children: unknown[] = [];
  for (const keyword of ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]) {
    const map = node[keyword];
    if (record(map)) children.push(...Object.values(map));
  }
  for (const keyword of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
    const list = node[keyword];
    if (Array.isArray(list)) children.push(...list);
  }
  for (const keyword of ["items", "additionalItems", "additionalProperties", "not", "if", "then",
    "else", "contains", "propertyNames", "unevaluatedProperties", "unevaluatedItems"]) {
    children.push(node[keyword]);
  }
  // const/default/examples are data, even when they contain a literal "$ref".
  return children;
}

export function assertXaiResponseSchema(schema: unknown): void {
  const visiting = new Set<object>();
  const visited = new Set<object>();
  const visit = (node: unknown, origin: string): void => {
    if (!record(node)) return;
    if (visiting.has(node)) throw new ProviderResponseSchemaError(`circular reference ${origin}`);
    if (visited.has(node)) return;
    visiting.add(node);
    const reference = node.$ref;
    if (typeof reference === "string" && (reference === "#" || reference.startsWith("#/"))) {
      visit(localReference(schema, reference), reference);
    }
    for (const child of childSchemas(node)) visit(child, origin);
    visiting.delete(node);
    visited.add(node);
  };
  visit(schema, "#");
}
