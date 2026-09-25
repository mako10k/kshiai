/** Preserve the byte-level digest contract used by already persisted migration candidates. */
export function canonicalPendingPreservationJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalPendingPreservationJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalPendingPreservationJson(item)}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("PENDING_PRESERVATION_NOT_JSON");
  return serialized;
}
