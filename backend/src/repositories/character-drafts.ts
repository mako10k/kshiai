import {
  CharacterSheetSchema,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  type CharacterSheet,
} from "@kshiai/shared";
import { query } from "../db.js";

export type CharacterDraft = {
  id: string;
  ownerUserId: string;
  sheet: CharacterSheet;
  assistantMessage: string;
  createdAt: string;
  updatedAt: string;
};

function parseSheet(value: unknown): CharacterSheet {
  return ensureCharacterIdentityProperties(
    ensureCharacterCombatProperties(
      CharacterSheetSchema.parse(
        typeof value === "string" ? JSON.parse(value) : value,
      ),
    ),
  );
}

function fromRow(row: {
  id: string;
  owner_user_id: string;
  sheet_json: unknown;
  assistant_message: string;
  created_at: string | Date;
  updated_at: string | Date;
}): CharacterDraft {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    sheet: parseSheet(row.sheet_json),
    assistantMessage: row.assistant_message,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveCharacterDraft(draft: CharacterDraft): Promise<void> {
  await query(
    `DELETE FROM character_drafts WHERE owner_user_id = $1 AND id != $2`,
    [draft.ownerUserId, draft.id],
  );
  await query(
    `INSERT INTO character_drafts
      (id, owner_user_id, sheet_json, assistant_message, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
       SET sheet_json = EXCLUDED.sheet_json,
           assistant_message = EXCLUDED.assistant_message,
           updated_at = EXCLUDED.updated_at`,
    [
      draft.id,
      draft.ownerUserId,
      JSON.stringify(draft.sheet),
      draft.assistantMessage,
      draft.createdAt,
      draft.updatedAt,
    ],
  );
}

export async function getLatestCharacterDraft(
  ownerUserId: string,
): Promise<CharacterDraft | null> {
  const { rows } = await query<{
    id: string;
    owner_user_id: string;
    sheet_json: unknown;
    assistant_message: string;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `SELECT id, owner_user_id, sheet_json, assistant_message, created_at, updated_at
       FROM character_drafts
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [ownerUserId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function getCharacterDraft(
  id: string,
  ownerUserId: string,
): Promise<CharacterDraft | null> {
  const { rows } = await query<{
    id: string;
    owner_user_id: string;
    sheet_json: unknown;
    assistant_message: string;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `SELECT id, owner_user_id, sheet_json, assistant_message, created_at, updated_at
       FROM character_drafts
      WHERE id = $1 AND owner_user_id = $2`,
    [id, ownerUserId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function deleteCharacterDraft(
  id: string,
  ownerUserId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM character_drafts WHERE id = $1 AND owner_user_id = $2`,
    [id, ownerUserId],
  );
  return result.rowCount > 0;
}
