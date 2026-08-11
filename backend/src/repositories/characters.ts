import type { CharacterSheet } from "@kshiai/shared";
import {
  CharacterSheetSchema,
  defaultRecord,
  ensureRecord,
  ensureRecordOverall,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  summarizeRatingPopulation,
  toPublicCharacter,
  type RatingDisplayContext,
  OpponentBattleMemorySchema,
  type OpponentBattleMemory,
} from "@kshiai/shared";
import type { CharacterReference } from "../llm/types.js";
import { normalizeCharacterName } from "../character-name-uniqueness.js";
import { query } from "../db.js";
import { newId } from "../id.js";
import {
  accountRealm,
  canAccessAccountKind,
  canUserAccessOwner,
  getUserAccessProfile,
  normalizeAccountKind,
  type AccountRealm,
} from "../account-access.js";

function parseSheet(json: unknown): CharacterSheet {
  const value = typeof json === "string" ? JSON.parse(json) : json;
  const raw = ensureCharacterIdentityProperties(
    ensureCharacterCombatProperties(CharacterSheetSchema.parse(value)),
  );
  if (!raw.record) {
    return { ...raw, record: defaultRecord() };
  }
  return raw;
}

function toReference(sheet: CharacterSheet): CharacterReference {
  const hydrated = ensureCharacterIdentityProperties(sheet);
  return {
    id: hydrated.id,
    displayName: hydrated.displayName,
    identity: hydrated.identity!,
    appearanceSummary: hydrated.appearance.summary,
    traits: hydrated.traits,
    narrativeBlurb: hydrated.narrativeBlurb,
    skillNames: hydrated.skills.map((skill) => skill.name),
    weaponName: hydrated.weapon?.name ?? null,
    armorName: hydrated.armor?.name ?? null,
  };
}

/** Search only characters owned by userId; safe to expose to generation tools. */
export function searchOwnedCharacterReferences(
  userId: string,
  query: string,
  limit = 8,
): Promise<CharacterReference[]> {
  const needle = query.trim().toLowerCase();
  return listOwnedSheets(userId).then((sheets) => sheets
    .filter(isActive)
    .filter((sheet) => {
      if (!needle) return true;
      const identity = ensureCharacterIdentityProperties(sheet).identity!;
      return [
        sheet.displayName,
        sheet.narrativeBlurb,
        ...sheet.tags,
        ...sheet.traits,
        identity.realName ?? "",
        ...identity.nicknames,
        ...identity.selfNames,
        ...identity.epithets,
      ].some((value) => value.toLowerCase().includes(needle));
    })
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map(toReference));
}

/** Fetch a generation reference only when it belongs to userId. */
export async function getOwnedCharacterReference(
  userId: string,
  characterId: string,
): Promise<CharacterReference | null> {
  const sheet = await getSheet(characterId);
  return sheet?.ownerUserId === userId ? toReference(sheet) : null;
}

/** Internal migration support; never returned by an API route. */
export async function listAllSheetsIncludingDeleted(): Promise<CharacterSheet[]> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters ORDER BY updated_at ASC`,
  );
  return rows.map((row) => parseSheet(row.sheet_json));
}

/** Population totals used only to center visible ratings on 1500. */
export async function getRatingDisplayContext(
  realm: AccountRealm = "general",
): Promise<RatingDisplayContext> {
  const { rows } = await query<{
    sheet_json: unknown;
    account_kind: string | null;
  }>(
    `SELECT c.sheet_json, u.account_kind
     FROM characters c
     JOIN users u ON u.id = c.owner_user_id`,
  );
  const active = rows
    .filter((row) => accountRealm(normalizeAccountKind(row.account_kind)) === realm)
    .map((row) => parseSheet(row.sheet_json))
    .filter(isActive);
  return {
    public: summarizeRatingPopulation(
      active.map((sheet) => ensureRecord(sheet).rating),
    ),
    overall: summarizeRatingPopulation(
      active.map((sheet) => ensureRecordOverall(sheet).rating),
    ),
  };
}

export async function toPublicCharacterForViewer(
  sheet: CharacterSheet,
  viewerUserId?: string | null,
  ratingDisplay?: RatingDisplayContext,
) {
  const display = ratingDisplay ?? (await getRatingDisplayContext(
    (await getUserAccessProfile(sheet.ownerUserId)).realm,
  ));
  return toPublicCharacter(sheet, viewerUserId, display);
}

export async function listSheetsMissingIdentity(): Promise<CharacterSheet[]> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters ORDER BY updated_at ASC`,
  );
  return rows
    .filter((row) => {
      const value = (typeof row.sheet_json === "string"
        ? JSON.parse(row.sheet_json)
        : row.sheet_json) as Record<string, unknown>;
      return value.identity === undefined || value.identity === null;
    })
    .map((row) => parseSheet(row.sheet_json));
}

async function listOwnedSheets(userId: string): Promise<CharacterSheet[]> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE owner_user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((row) => parseSheet(row.sheet_json));
}

function isActive(sheet: CharacterSheet): boolean {
  return !sheet.deletedAt;
}

/** All owner-scoped identifying names, used to prevent accidental reuse. */
export async function listOwnedCharacterReservedNames(userId: string): Promise<string[]> {
  const unique = new Map<string, string>();
  for (const sheet of (await listOwnedSheets(userId)).filter(isActive)) {
    const identity = ensureCharacterIdentityProperties(sheet).identity!;
    const names = [
      sheet.displayName,
      identity.realName,
      ...identity.nicknames,
      ...identity.epithets,
    ];
    for (const name of names) {
      if (!name) continue;
      const normalized = normalizeCharacterName(name);
      if (normalized && !unique.has(normalized)) unique.set(normalized, name);
    }
  }
  return [...unique.values()];
}

export type CharacterListPage = {
  characters: ReturnType<typeof toPublicCharacter>[];
  total: number;
  limit: number;
  offset: number;
};

function clampPage(limit?: number, offset?: number) {
  const safeLimit = Math.max(1, Math.min(50, limit ?? 20));
  const safeOffset = Math.max(0, offset ?? 0);
  return { limit: safeLimit, offset: safeOffset };
}

export async function listCharactersForUser(
  userId: string,
  q?: string,
  page?: { limit?: number; offset?: number },
): Promise<CharacterListPage> {
  let sheets = (await listOwnedSheets(userId)).filter(isActive);
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter(
      (s) =>
        s.displayName.toLowerCase().includes(needle) ||
        s.narrativeBlurb.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }
  // Sort by public ranked rating, then overall for owner list
  sheets.sort((a, b) => {
    const ra = a.record?.rating ?? a.recordOverall?.rating ?? 1500;
    const rb = b.record?.rating ?? b.recordOverall?.rating ?? 1500;
    if (rb !== ra) return rb - ra;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const { limit, offset } = clampPage(page?.limit, page?.offset);
  const total = sheets.length;
  const pageSheets = sheets.slice(offset, offset + limit);
  const ratingDisplay = await getRatingDisplayContext(
    (await getUserAccessProfile(userId)).realm,
  );
  // Owner always sees private overall stats
  return {
    characters: pageSheets.map((s) => toPublicCharacter(s, userId, ratingDisplay)),
    total,
    limit,
    offset,
  };
}

/** Hide early mock-test junk (e.g. 「はアキ」) from matchmaking. */
function isPlayableOpponent(sheet: CharacterSheet): boolean {
  if (!isActive(sheet)) return false;
  // Old mock provider tagged these.
  if (sheet.tags?.includes("mock")) return false;
  return true;
}

export async function listPublicOpponents(
  excludeUserId: string,
  q?: string,
  page?: { limit?: number; offset?: number },
): Promise<CharacterListPage> {
  let sheets = await listPlayableOpponentSheets(excludeUserId);
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter((s) => s.displayName.toLowerCase().includes(needle));
  }
  sheets.sort((a, b) => {
    const ra = a.record?.rating ?? 1500;
    const rb = b.record?.rating ?? 1500;
    if (rb !== ra) return rb - ra;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const { limit, offset } = clampPage(page?.limit ?? 10, page?.offset);
  const total = sheets.length;
  const pageSheets = sheets.slice(offset, offset + limit);
  const ratingDisplays = new Map<AccountRealm, RatingDisplayContext>();
  for (const realm of ["general", "test"] as const) {
    ratingDisplays.set(realm, await getRatingDisplayContext(realm));
  }
  const viewer = await getUserAccessProfile(excludeUserId);
  // Viewer is excludeUserId: own chars get overall; others public-only
  const characters = await Promise.all(pageSheets.map(async (sheet) => {
    const realm = viewer.isAdmin
      ? (await getUserAccessProfile(sheet.ownerUserId)).realm
      : viewer.realm;
    return toPublicCharacter(
      sheet,
      excludeUserId,
      ratingDisplays.get(realm),
    );
  }));
  return { characters, total, limit, offset };
}

/** Engine-only sheets available as opponents; never expose directly from routes. */
export async function listPlayableOpponentSheets(
  excludeUserId: string,
): Promise<CharacterSheet[]> {
  const viewer = await getUserAccessProfile(excludeUserId);
  const { rows } = await query<{
    sheet_json: unknown;
    account_kind: string | null;
  }>(
    `SELECT c.sheet_json, u.account_kind
     FROM characters c
     JOIN users u ON u.id = c.owner_user_id
     WHERE c.owner_user_id != $1
     ORDER BY c.updated_at DESC
     LIMIT 200`,
    [excludeUserId],
  );
  const { isViewerFriendedByOwner } = await import("./friends.js");
  const friendCache = new Map<string, boolean>();
  const canViewVisibility = async (sheet: CharacterSheet): Promise<boolean> => {
    if (!isPlayableOpponent(sheet)) return false;
    const visibility = sheet.visibility ?? "public";
    if (visibility === "public") return true;
    if (visibility === "private") return false;
    let ok = friendCache.get(sheet.ownerUserId);
    if (ok === undefined) {
      ok = await isViewerFriendedByOwner(sheet.ownerUserId, excludeUserId);
      friendCache.set(sheet.ownerUserId, ok);
    }
    return ok;
  };
  const sheets: CharacterSheet[] = [];
  for (const row of rows) {
    if (!canAccessAccountKind(viewer, normalizeAccountKind(row.account_kind))) {
      continue;
    }
    const sheet = parseSheet(row.sheet_json);
    if (await canViewVisibility(sheet)) sheets.push(sheet);
  }
  // Include own characters as sparring partners
  const { rows: own } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE owner_user_id = $1`,
    [excludeUserId],
  );
  for (const row of own) {
    const sheet = parseSheet(row.sheet_json);
    if (isActive(sheet)) sheets.push(sheet);
  }
  const map = new Map(sheets.map((s) => [s.id, s]));
  return [...map.values()];
}

export async function updateCharacterVisibility(
  characterId: string,
  ownerUserId: string,
  visibility: "public" | "friends" | "private",
): Promise<CharacterSheet | null> {
  const sheet = await getSheet(characterId);
  if (!sheet || sheet.ownerUserId !== ownerUserId) return null;
  const next = {
    ...sheet,
    visibility,
    updatedAt: new Date().toISOString(),
  };
  await saveSheet(next);
  return next;
}

export async function canViewCharacter(
  viewerUserId: string,
  sheet: Pick<CharacterSheet, "ownerUserId">,
): Promise<boolean> {
  return canUserAccessOwner(viewerUserId, sheet.ownerUserId);
}

export async function getSheet(id: string): Promise<CharacterSheet | null> {
  const sheet = await getSheetIncludingDeleted(id);
  if (!sheet || sheet.deletedAt) return null;
  return sheet;
}

export async function getSheetIncludingDeleted(id: string): Promise<CharacterSheet | null> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return parseSheet(row.sheet_json);
}

export async function saveSheet(sheet: CharacterSheet): Promise<void> {
  const withRecord: CharacterSheet = {
    ...ensureCharacterIdentityProperties(
      ensureCharacterCombatProperties(sheet),
    ),
    record: sheet.record ?? defaultRecord(),
  };
  const json = JSON.stringify(withRecord);
  await query(
    `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           sheet_json = EXCLUDED.sheet_json,
           updated_at = EXCLUDED.updated_at`,
    [
      withRecord.id,
      withRecord.ownerUserId,
      json,
      withRecord.createdAt,
      withRecord.updatedAt,
    ],
  );
}

/** Persist bounded owner-private notes for a specific opponent. */
export async function saveOpponentBattleMemory(input: {
  characterId: string;
  opponentId: string;
  preBattlePlan?: string;
  postBattleReflection?: string;
  battledAt?: string;
}): Promise<OpponentBattleMemory | null> {
  const sheet = await getSheetIncludingDeleted(input.characterId);
  if (!sheet) return null;
  const previous = sheet.opponentMemories?.[input.opponentId];
  const next = OpponentBattleMemorySchema.parse({
    ...(previous ?? {}),
    ...(input.preBattlePlan !== undefined
      ? { preBattlePlan: input.preBattlePlan.slice(0, 1200) }
      : {}),
    ...(input.postBattleReflection !== undefined
      ? { postBattleReflection: input.postBattleReflection.slice(0, 1200) }
      : {}),
    battleCount: (previous?.battleCount ?? 0) + 1,
    lastBattleAt: input.battledAt ?? new Date().toISOString(),
  });
  await saveSheet({
    ...sheet,
    opponentMemories: {
      ...(sheet.opponentMemories ?? {}),
      [input.opponentId]: next,
    },
    updatedAt: new Date().toISOString(),
  });
  return next;
}

/** Soft-delete: hide from lists without modifying any battle ratings. */
export async function softDeleteCharacter(
  id: string,
  ownerUserId: string,
): Promise<CharacterSheet | null> {
  const sheet = await getSheet(id);
  if (!sheet || sheet.ownerUserId !== ownerUserId) return null;
  const next: CharacterSheet = {
    ...sheet,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveSheet(next);
  return next;
}

/** @deprecated use softDeleteCharacter */
export async function deleteCharacter(id: string, ownerUserId: string): Promise<boolean> {
  return (await softDeleteCharacter(id, ownerUserId)) != null;
}

export async function copyCharacter(
  id: string,
  ownerUserId: string,
): Promise<CharacterSheet | null> {
  const src = await getSheet(id);
  if (!src || src.ownerUserId !== ownerUserId) return null;
  const t = new Date().toISOString();
  const copy: CharacterSheet = {
    ...src,
    id: newId("chr"),
    displayName: `${src.displayName} の写し`,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    parameters: { ...src.parameters },
    skills: src.skills.map((s) => ({ ...s, id: newId("sk") })),
    tags: [...src.tags, "copy"],
    // Fresh rating — no carry-over from original (anti-clone farming)
    record: defaultRecord(),
    recordOverall: defaultRecord(),
    // Coaching memo is battle-history bound; start empty on copy.
    improvementMemo: undefined,
    // Undo buffer is character-instance specific.
    revisionSnapshot: null,
  };
  await saveSheet(copy);
  return copy;
}
