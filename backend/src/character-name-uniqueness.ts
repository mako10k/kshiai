export function normalizeCharacterName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\s・･_.\-‐‑‒–—―「」『』【】()[\]（）]/g, "");
}

export function findCharacterNameConflict(
  candidates: Array<string | null | undefined>,
  reservedNames: readonly string[],
): { candidate: string; reservedName: string } | null {
  const reserved = new Map<string, string>();
  for (const name of reservedNames) {
    const normalized = normalizeCharacterName(name);
    if (normalized && !reserved.has(normalized)) reserved.set(normalized, name);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const reservedName = reserved.get(normalizeCharacterName(candidate));
    if (reservedName) return { candidate, reservedName };
  }
  return null;
}

export function makeUniqueCharacterName(
  requestedName: string,
  reservedNames: readonly string[],
): string {
  const base = requestedName.trim() || "無名の挑戦者";
  if (!findCharacterNameConflict([base], reservedNames)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!findCharacterNameConflict([candidate], reservedNames)) return candidate;
  }
  throw new Error("Could not allocate a unique character name");
}
