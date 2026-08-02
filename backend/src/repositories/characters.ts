import type { CharacterSheet } from "@kshiai/shared";
import { CharacterSheetSchema, toPublicCharacter } from "@kshiai/shared";
import { getDb } from "../db.js";
import { newId } from "../id.js";

export function listCharactersForUser(userId: string, q?: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT sheet_json FROM characters WHERE owner_user_id = ? ORDER BY updated_at DESC`,
    )
    .all(userId) as { sheet_json: string }[];
  let sheets = rows.map((r) => CharacterSheetSchema.parse(JSON.parse(r.sheet_json)));
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter(
      (s) =>
        s.displayName.toLowerCase().includes(needle) ||
        s.narrativeBlurb.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }
  return sheets.map(toPublicCharacter);
}

export function listPublicOpponents(excludeUserId: string, q?: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT sheet_json FROM characters WHERE owner_user_id != ? ORDER BY updated_at DESC LIMIT 100`,
    )
    .all(excludeUserId) as { sheet_json: string }[];
  let sheets = rows.map((r) => CharacterSheetSchema.parse(JSON.parse(r.sheet_json)));
  // Include own characters as possible sparring partners too
  const own = db
    .prepare(`SELECT sheet_json FROM characters WHERE owner_user_id = ?`)
    .all(excludeUserId) as { sheet_json: string }[];
  sheets = [
    ...sheets,
    ...own.map((r) => CharacterSheetSchema.parse(JSON.parse(r.sheet_json))),
  ];
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter((s) => s.displayName.toLowerCase().includes(needle));
  }
  // de-dupe by id
  const map = new Map(sheets.map((s) => [s.id, s]));
  return [...map.values()].map(toPublicCharacter);
}

export function getSheet(id: string): CharacterSheet | null {
  const row = getDb()
    .prepare(`SELECT sheet_json FROM characters WHERE id = ?`)
    .get(id) as { sheet_json: string } | undefined;
  if (!row) return null;
  return CharacterSheetSchema.parse(JSON.parse(row.sheet_json));
}

export function saveSheet(sheet: CharacterSheet): void {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM characters WHERE id = ?`)
    .get(sheet.id);
  const json = JSON.stringify(sheet);
  if (existing) {
    db.prepare(
      `UPDATE characters SET sheet_json = ?, updated_at = ? WHERE id = ?`,
    ).run(json, sheet.updatedAt, sheet.id);
  } else {
    db.prepare(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sheet.id, sheet.ownerUserId, json, sheet.createdAt, sheet.updatedAt);
  }
}

export function deleteCharacter(id: string, ownerUserId: string): boolean {
  const r = getDb()
    .prepare(`DELETE FROM characters WHERE id = ? AND owner_user_id = ?`)
    .run(id, ownerUserId);
  return r.changes > 0;
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
    parameters: { ...src.parameters },
    skills: src.skills.map((s) => ({ ...s, id: newId("sk") })),
    tags: [...src.tags, "copy"],
  };
  saveSheet(copy);
  return copy;
}
