import { createHash } from "node:crypto";
import {
  databaseKind,
  query,
  withTransaction,
  type DatabaseConnection,
} from "../db.js";

export type AssetGeneration = {
  assetType: string;
  assetId: string;
  generation: number;
  generationId: string;
  schemaVersion: number;
  content: unknown;
  contentDigest: string;
  createdAt: string;
};

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return value;
}

export function canonicalAssetJson(content: unknown): string {
  return JSON.stringify(normalizeJson(content));
}

export function assetContentDigest(content: unknown): string {
  return createHash("sha256").update(canonicalAssetJson(content)).digest("hex");
}

function parseRow(row: {
  asset_type: string;
  asset_id: string;
  generation: number;
  generation_id: string;
  schema_version: number;
  content_json: unknown;
  content_digest: string;
  created_at: string | Date;
}): AssetGeneration {
  return {
    assetType: row.asset_type,
    assetId: row.asset_id,
    generation: Number(row.generation),
    generationId: row.generation_id,
    schemaVersion: Number(row.schema_version),
    content: typeof row.content_json === "string"
      ? JSON.parse(row.content_json)
      : row.content_json,
    contentDigest: row.content_digest,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

export async function writeAssetGeneration(
  connection: DatabaseConnection,
  input: {
    assetType: string;
    assetId: string;
    schemaVersion: number;
    content: unknown;
    createdAt?: string;
  },
): Promise<AssetGeneration> {
  const contentJson = canonicalAssetJson(input.content);
  const contentDigest = assetContentDigest(input.content);
  if (databaseKind() === "postgres") {
    await connection.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [input.assetType, input.assetId],
    );
  }
  const current = await connection.query<{
    generation: number;
    generation_id: string;
    content_digest: string;
  }>(
    `SELECT c.generation, c.generation_id, g.content_digest
       FROM asset_current_generations c
       JOIN asset_generations g
         ON g.asset_type = c.asset_type
        AND g.asset_id = c.asset_id
        AND g.generation = c.generation
      WHERE c.asset_type = $1 AND c.asset_id = $2`,
    [input.assetType, input.assetId],
  );
  const existing = current.rows[0];
  if (existing?.content_digest === contentDigest) {
    const retained = await connection.query<Parameters<typeof parseRow>[0]>(
      `SELECT asset_type, asset_id, generation, generation_id, schema_version,
              content_json, content_digest, created_at
         FROM asset_generations WHERE generation_id = $1`,
      [existing.generation_id],
    );
    return parseRow(retained.rows[0]!);
  }
  const generation = Number(existing?.generation ?? 0) + 1;
  const generationId = `${input.assetType}:${input.assetId}:g${generation}:${contentDigest.slice(0, 16)}`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  await connection.query(
    `INSERT INTO asset_generations
      (asset_type, asset_id, generation, generation_id, schema_version,
       content_json, content_digest, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.assetType,
      input.assetId,
      generation,
      generationId,
      input.schemaVersion,
      contentJson,
      contentDigest,
      createdAt,
    ],
  );
  await connection.query(
    `INSERT INTO asset_current_generations
      (asset_type, asset_id, generation, generation_id, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (asset_type, asset_id) DO UPDATE
       SET generation = EXCLUDED.generation,
           generation_id = EXCLUDED.generation_id,
           updated_at = EXCLUDED.updated_at`,
    [input.assetType, input.assetId, generation, generationId, createdAt],
  );
  return {
    assetType: input.assetType,
    assetId: input.assetId,
    generation,
    generationId,
    schemaVersion: input.schemaVersion,
    content: JSON.parse(contentJson),
    contentDigest,
    createdAt,
  };
}

export function createAssetGeneration(input: {
  assetType: string;
  assetId: string;
  schemaVersion: number;
  content: unknown;
  createdAt?: string;
}): Promise<AssetGeneration> {
  return withTransaction((connection) => writeAssetGeneration(connection, input));
}

export async function getAssetGeneration(
  generationId: string,
): Promise<AssetGeneration | null> {
  const result = await query<Parameters<typeof parseRow>[0]>(
    `SELECT asset_type, asset_id, generation, generation_id, schema_version,
            content_json, content_digest, created_at
       FROM asset_generations WHERE generation_id = $1`,
    [generationId],
  );
  return result.rows[0] ? parseRow(result.rows[0]) : null;
}

export async function getCurrentAssetGeneration(
  assetType: string,
  assetId: string,
): Promise<AssetGeneration | null> {
  const result = await query<Parameters<typeof parseRow>[0]>(
    `SELECT g.asset_type, g.asset_id, g.generation, g.generation_id,
            g.schema_version, g.content_json, g.content_digest, g.created_at
       FROM asset_current_generations c
       JOIN asset_generations g
         ON g.asset_type = c.asset_type
        AND g.asset_id = c.asset_id
        AND g.generation = c.generation
      WHERE c.asset_type = $1 AND c.asset_id = $2`,
    [assetType, assetId],
  );
  return result.rows[0] ? parseRow(result.rows[0]) : null;
}
