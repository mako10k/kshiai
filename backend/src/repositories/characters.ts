import type { CharacterSheet } from "@kshiai/shared";
import {
  CharacterSheetSchema,
  defaultRecord,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  toPublicCharacter,
} from "@kshiai/shared";
import type { CharacterReference } from "../llm/types.js";
import { getDb } from "../db.js";
import { newId } from "../id.js";

function parseSheet(json: string): CharacterSheet {
  const raw = ensureCharacterIdentityProperties(
    ensureCharacterCombatProperties(CharacterSheetSchema.parse(JSON.parse(json))),
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
): CharacterReference[] {
  const needle = query.trim().toLowerCase();
  return listOwnedSheets(userId)
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
    .map(toReference);
}

/** Fetch a generation reference only when it belongs to userId. */
export function getOwnedCharacterReference(
  userId: string,
  characterId: string,
): CharacterReference | null {
  const sheet = getSheet(characterId);
  return sheet?.ownerUserId === userId ? toReference(sheet) : null;
}

/** Internal migration support; never returned by an API route. */
export function listAllSheetsIncludingDeleted(): CharacterSheet[] {
  const rows = getDb()
    .prepare(`SELECT sheet_json FROM characters ORDER BY updated_at ASC`)
    .all() as { sheet_json: string }[];
  return rows.map((row) => parseSheet(row.sheet_json));
}

export function listSheetsMissingIdentity(): CharacterSheet[] {
  const rows = getDb()
    .prepare(`SELECT sheet_json FROM characters ORDER BY updated_at ASC`)
    .all() as { sheet_json: string }[];
  return rows
    .filter((row) => {
      const value = JSON.parse(row.sheet_json) as Record<string, unknown>;
      return value.identity === undefined || value.identity === null;
    })
    .map((row) => parseSheet(row.sheet_json));
}

function listOwnedSheets(userId: string): CharacterSheet[] {
  const rows = getDb()
    .prepare(
      `SELECT sheet_json FROM characters WHERE owner_user_id = ? ORDER BY updated_at DESC`,
    )
    .all(userId) as { sheet_json: string }[];
  return rows.map((row) => parseSheet(row.sheet_json));
}

function isActive(sheet: CharacterSheet): boolean {
  return !sheet.deletedAt;
}

export function listCharactersForUser(userId: string, q?: string) {
  let sheets = listOwnedSheets(userId).filter(isActive);
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

export function listPublicOpponents(excludeUserId: string, q?: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT sheet_json FROM characters WHERE owner_user_id != ? ORDER BY updated_at DESC LIMIT 200`,
    )
    .all(excludeUserId) as { sheet_json: string }[];
  let sheets = rows
    .map((r) => parseSheet(r.sheet_json))
    .filter(isPlayableOpponent);
  // Include own characters as sparring partners
  const own = db
    .prepare(`SELECT sheet_json FROM characters WHERE owner_user_id = ?`)
    .all(excludeUserId) as { sheet_json: string }[];
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

export function getSheet(id: string): CharacterSheet | null {
  const sheet = getSheetIncludingDeleted(id);
  if (!sheet || sheet.deletedAt) return null;
  return sheet;
}

export function getSheetIncludingDeleted(id: string): CharacterSheet | null {
  const row = getDb()
    .prepare(`SELECT sheet_json FROM characters WHERE id = ?`)
    .get(id) as { sheet_json: string } | undefined;
  if (!row) return null;
  return parseSheet(row.sheet_json);
}

export function saveSheet(sheet: CharacterSheet): void {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM characters WHERE id = ?`)
    .get(sheet.id);
  const withRecord: CharacterSheet = {
    ...ensureCharacterIdentityProperties(
      ensureCharacterCombatProperties(sheet),
    ),
    record: sheet.record ?? defaultRecord(),
  };
  const json = JSON.stringify(withRecord);
  if (existing) {
    db.prepare(
      `UPDATE characters SET sheet_json = ?, updated_at = ? WHERE id = ?`,
    ).run(json, withRecord.updatedAt, withRecord.id);
  } else {
    db.prepare(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      withRecord.id,
      withRecord.ownerUserId,
      json,
      withRecord.createdAt,
      withRecord.updatedAt,
    );
  }
}

/** Soft-delete: hide from lists; rating impact is voided separately. */
export function softDeleteCharacter(
  id: string,
  ownerUserId: string,
): CharacterSheet | null {
  const sheet = getSheet(id);
  if (!sheet || sheet.ownerUserId !== ownerUserId) return null;
  const next: CharacterSheet = {
    ...sheet,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveSheet(next);
  return next;
}

/** @deprecated use softDeleteCharacter */
export function deleteCharacter(id: string, ownerUserId: string): boolean {
  return softDeleteCharacter(id, ownerUserId) != null;
}

export function copyCharacter(
  id: string,
  ownerUserId: string,
): CharacterSheet | null {
  const src = getSheet(id);
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
  };
  saveSheet(copy);
  return copy;
}
