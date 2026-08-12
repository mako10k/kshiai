import {
  DialoguePipelineSettingsSchema,
  DialoguePipelineValuesSchema,
  defaultDialoguePipelineSettings,
  type DialoguePipelineSettings,
  type UpdateDialoguePipelineSettings,
} from "@kshiai/shared";
import { query, withTransaction } from "../db.js";
import { writeAssetGeneration } from "./asset-generations.js";

const GLOBAL_SETTINGS_ID = "global";

type SettingsRow = {
  settings_json: unknown;
  revision: number;
  updated_at: string | Date;
  updated_by: string | null;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseSettings(row: SettingsRow): DialoguePipelineSettings {
  const raw = typeof row.settings_json === "string"
    ? JSON.parse(row.settings_json)
    : row.settings_json;
  return DialoguePipelineSettingsSchema.parse({
    ...DialoguePipelineValuesSchema.parse(raw),
    revision: row.revision,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  });
}

async function readSettings(): Promise<SettingsRow | null> {
  const { rows } = await query<SettingsRow>(
    `SELECT s.settings_json, s.revision, s.updated_at, u.username AS updated_by
     FROM dialogue_pipeline_settings s
     LEFT JOIN users u ON u.id = s.updated_by_user_id
     WHERE s.id = $1`,
    [GLOBAL_SETTINGS_ID],
  );
  return rows[0] ?? null;
}

/** Returns the runtime default until an administrator saves an override. */
export async function getDialoguePipelineSettings(): Promise<DialoguePipelineSettings> {
  const row = await readSettings();
  return row ? parseSettings(row) : defaultDialoguePipelineSettings();
}

export async function updateDialoguePipelineSettings(input: {
  userId: string;
  patch: UpdateDialoguePipelineSettings;
}): Promise<DialoguePipelineSettings | null> {
  const values = DialoguePipelineValuesSchema.parse({
    schemaVersion: 1,
    enabled: input.patch.enabled,
    conversationHistoryLimit: input.patch.conversationHistoryLimit,
    contextProjectionMode: input.patch.contextProjectionMode,
    recentExchangeLimit: input.patch.recentExchangeLimit,
    relevantMemoryLimit: input.patch.relevantMemoryLimit,
    psychologyGuidance: input.patch.psychologyGuidance.trim(),
  });
  const updatedAt = new Date().toISOString();
  const nextRevision = input.patch.expectedRevision + 1;
  const next = await withTransaction(async (connection) => {
    const current = await connection.query<{ revision: number }>(
      `SELECT revision
       FROM dialogue_pipeline_settings
       WHERE id = $1`,
      [GLOBAL_SETTINGS_ID],
    );
    const currentRevision = current.rows[0]?.revision;
    if (currentRevision == null) {
      if (input.patch.expectedRevision !== 0) return null;
      try {
        await connection.query(
          `INSERT INTO dialogue_pipeline_settings
            (id, settings_json, revision, updated_at, updated_by_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            GLOBAL_SETTINGS_ID,
            JSON.stringify(values),
            nextRevision,
            updatedAt,
            input.userId,
          ],
        );
      } catch (error) {
        // A concurrent administrator may have created the singleton first.
        // Treat that as an optimistic-lock conflict without masking other errors.
        if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
          return null;
        }
        throw error;
      }
    } else {
      if (currentRevision !== input.patch.expectedRevision) return null;
      const updated = await connection.query(
        `UPDATE dialogue_pipeline_settings
         SET settings_json = $1,
             revision = $2,
             updated_at = $3,
             updated_by_user_id = $4
         WHERE id = $5 AND revision = $6`,
        [
          JSON.stringify(values),
          nextRevision,
          updatedAt,
          input.userId,
          GLOBAL_SETTINGS_ID,
          input.patch.expectedRevision,
        ],
      );
      if (updated.rowCount !== 1) return null;
    }
    const generationContent = DialoguePipelineSettingsSchema.parse({
      ...values,
      revision: nextRevision,
      updatedAt,
      updatedBy: null,
    });
    await writeAssetGeneration(connection, {
      assetType: "dialogue-pipeline",
      assetId: GLOBAL_SETTINGS_ID,
      schemaVersion: 1,
      content: generationContent,
      createdAt: updatedAt,
    });
    return generationContent;
  });
  if (!next) return null;
  const saved = await getDialoguePipelineSettings();
  return saved.revision === next.revision ? saved : next;
}
