import type { CharacterSheet } from "@kshiai/shared";
import {
  CharacterSheetSchema,
  defaultRecord,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  toPublicCharacter,
} from "@kshiai/shared";
import type { CharacterReference } from "../llm/types.js";
import { normalizeCharacterName } from "../character-name-uniqueness.js";
import { query } from "../db.js";
import { newId } from "../id.js";

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

export async function listCharactersForUser(userId: string, q?: string) {
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
  // Owner always sees private overall stats
  return sheets.map((s) => toPublicCharacter(s, userId));
}

/** Hide early mock-test junk (e.g. 「はアキ」) from matchmaking. */
function isPlayableOpponent(sheet: CharacterSheet): boolean {
  if (!isActive(sheet)) return false;
  // Old mock provider tagged these.
  if (sheet.tags?.includes("mock")) return false;
  return true;
}

export async function listPublicOpponents(excludeUserId: string, q?: string) {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE owner_user_id != $1 ORDER BY updated_at DESC LIMIT 200`,
    [excludeUserId],
  );
  let sheets = rows
    .map((r) => parseSheet(r.sheet_json))
    .filter(isPlayableOpponent);
  // Include own characters as sparring partners
  const { rows: own } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE owner_user_id = $1`,
    [excludeUserId],
  );
  sheets = [
    ...sheets,
    ...own
      .map((r) => parseSheet(r.sheet_json))
      .filter(isActive), // own list may still show mock during dev; opponents hide them
  ];
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter((s) => s.displayName.toLowerCase().includes(needle));
  }
  const map = new Map(sheets.map((s) => [s.id, s]));
  // Viewer is excludeUserId: own chars get overall; others public-only
  return [...map.values()].map((s) => toPublicCharacter(s, excludeUserId));
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

/** Soft-delete: hide from lists; rating impact is voided separately. */
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
