export type MatchSelectionKind =
  | "mine"
  | "opponent"
  | "battlefield"
  | "narrationStyle";

export type MatchSelectionUsage = Partial<
  Record<MatchSelectionKind, Record<string, number>>
>;

const MAX_ENTRIES_PER_KIND = 100;

export function recordMatchSelectionUsage(
  usage: MatchSelectionUsage,
  selections: Partial<Record<MatchSelectionKind, string>>,
  usedAt = Date.now(),
): MatchSelectionUsage {
  const next = { ...usage };

  for (const [kind, id] of Object.entries(selections) as Array<
    [MatchSelectionKind, string | undefined]
  >) {
    if (!id) continue;
    const entries = {
      ...(usage[kind] ?? {}),
      [id]: usedAt,
    };
    next[kind] = Object.fromEntries(
      Object.entries(entries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ENTRIES_PER_KIND),
    );
  }

  return next;
}

export function sortByRecentUsage<T extends { id: string }>(
  items: readonly T[],
  kind: MatchSelectionKind,
  usage: MatchSelectionUsage,
): T[] {
  const timestamps = usage[kind] ?? {};
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (timestamps[b.item.id] ?? 0) - (timestamps[a.item.id] ?? 0) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[ァ-ヶ]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSelectionSearch(
  query: string,
  values: Array<string | null | undefined>,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return values.some((value) =>
    normalizeSearchText(value ?? "").includes(normalizedQuery),
  );
}
