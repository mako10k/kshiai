/** R: Canonically serialize and hash immutable JSON values used by trial fixtures. */
import { createHash } from "node:crypto";

function canonicalFixtureJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFixtureJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalFixtureJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fixtureContentDigest(value: unknown): string {
  return createHash("sha256").update(canonicalFixtureJson(value)).digest("hex");
}
