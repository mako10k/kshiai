import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Client } from "pg";
import { config } from "../config.js";
import { readSourceSnapshot } from "./sqlite-to-postgres.js";
import { createPostgresClient } from "./postgres-migrations.js";

type Row = Record<string, unknown>;
type MediaItem = {
  pathname: string;
  kind: "characters" | "battlefields";
  file: string;
  sourcePath: string;
  key: string;
  publicUrl: string;
};
type OwnershipCounts = {
  characters: number;
  battles: number;
  battlefields: number;
  styles: number;
  imageEvents: number;
};

const importSpecs = [
  { name: "users", columns: ["id", "username", "password_hash", "created_at"], key: "id" },
  { name: "characters", columns: ["id", "owner_user_id", "sheet_json", "created_at", "updated_at"], key: "id" },
  { name: "battles", columns: ["id", "state_json", "side_a_user_id", "side_a_character_id", "side_b_character_id", "created_at", "updated_at"], key: "id" },
  { name: "battlefields", columns: ["id", "owner_user_id", "is_system", "sheet_json", "created_at", "updated_at"], key: "id" },
  { name: "narration_styles", columns: ["id", "owner_user_id", "is_system", "sheet_json", "created_at", "updated_at"], key: "id" },
  { name: "image_gen_events", columns: ["id", "user_id", "character_id", "created_at", "ok"], key: "id" },
  { name: "balance_events", columns: ["id", "kind", "created_at", "battle_id", "character_id", "payload_json"], key: "id" },
] as const;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`unsafe identifier: ${value}`);
  return value;
}

function mediaDescriptor(value: string): {
  pathname: string;
  kind: "characters" | "battlefields";
  file: string;
} | null {
  let pathname: string;
  try {
    pathname = new URL(value, "http://local.invalid").pathname;
  } catch {
    return null;
  }
  const match = pathname.match(
    /^\/api\/media\/(characters|battlefields)\/([a-zA-Z0-9_.-]+\.jpe?g)$/i,
  );
  if (!match) return null;
  return {
    pathname,
    kind: match[1] as "characters" | "battlefields",
    file: match[2]!,
  };
}

function collectMediaPaths(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const descriptor = mediaDescriptor(value);
    if (descriptor) result.add(descriptor.pathname);
  } else if (Array.isArray(value)) {
    for (const item of value) collectMediaPaths(item, result);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectMediaPaths(item, result);
    }
  }
  return result;
}

export function rewriteLegacyValue(
  value: unknown,
  oldUserId: string,
  newUserId: string,
  mediaUrls: Map<string, string>,
): unknown {
  if (typeof value === "string") {
    if (value === oldUserId) return newUserId;
    const descriptor = mediaDescriptor(value);
    return descriptor ? mediaUrls.get(descriptor.pathname) ?? value : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteLegacyValue(item, oldUserId, newUserId, mediaUrls));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        rewriteLegacyValue(item, oldUserId, newUserId, mediaUrls),
      ]),
    );
  }
  return value;
}

export function normalizeLegacyBattleState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const state = { ...(value as Record<string, unknown>) };
  if (state.battlefield && typeof state.battlefield === "object") {
    const battlefield = { ...(state.battlefield as Record<string, unknown>) };
    if (battlefield.category === "カスタム") battlefield.category = "custom";
    state.battlefield = battlefield;
  }
  return state;
}

function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
}

function buildMediaManifest(sourcePath: string, tables: Map<string, Row[]>): MediaItem[] {
  const paths = new Set<string>();
  for (const table of ["characters", "battles", "battlefields"]) {
    for (const row of tables.get(table) ?? []) {
      collectMediaPaths(row.sheet_json ?? row.state_json, paths);
    }
  }
  const mediaRoot = path.join(path.dirname(sourcePath), "media");
  return [...paths].sort().map((pathname) => {
    const descriptor = mediaDescriptor(pathname);
    if (!descriptor) throw new Error(`invalid local media URL: ${pathname}`);
    const localPath = path.join(mediaRoot, descriptor.kind, descriptor.file);
    if (!fs.existsSync(localPath)) throw new Error(`missing local media: ${localPath}`);
    const key = `legacy/${descriptor.kind}/${descriptor.file}`;
    const publicUrl = `${config.r2.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
    return { ...descriptor, sourcePath: localPath, key, publicUrl };
  });
}

async function uploadMedia(
  client: S3Client,
  items: MediaItem[],
  created: string[],
): Promise<void> {
  for (const item of items) {
    const stat = fs.statSync(item.sourcePath);
    let exists = false;
    try {
      const head = await client.send(new HeadObjectCommand({
        Bucket: config.r2.bucket,
        Key: item.key,
      }));
      if (head.ContentLength !== stat.size) {
        throw new Error(`R2 object size mismatch: ${item.key}`);
      }
      exists = true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404) throw error;
    }
    if (exists) continue;
    await client.send(new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: item.key,
      Body: fs.readFileSync(item.sourcePath),
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }));
    created.push(item.key);
  }
  for (const item of items) {
    const response = await fetch(`${item.publicUrl}?migration_verify=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.arrayBuffer();
    if (!response.ok || body.byteLength !== fs.statSync(item.sourcePath).size) {
      throw new Error(`R2 public media verification failed: ${item.key}`);
    }
  }
}

async function deleteMedia(client: S3Client, keys: string[]): Promise<void> {
  for (const key of keys) {
    await client.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  }
}

async function upsertRows(
  client: Client,
  spec: (typeof importSpecs)[number],
  rows: Row[],
): Promise<void> {
  const table = safeIdentifier(spec.name);
  const columns = spec.columns.map(safeIdentifier);
  const primaryKey = safeIdentifier(spec.key);
  const assignments = columns
    .filter((column) => column !== primaryKey)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `INSERT INTO public.${table} (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (${primaryKey}) DO UPDATE SET ${assignments}`;
  for (const row of rows) {
    await client.query(sql, columns.map((column) => row[column]));
  }
}

async function validateTarget(
  client: Client,
  targetUserId: string,
  oldUserId: string,
  expected: Record<string, number>,
  expectedOwned: OwnershipCounts,
): Promise<void> {
  const tables = ["users", "characters", "battles", "battlefields", "image_gen_events", "narration_styles", "balance_events"];
  for (const table of tables) {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM public.${safeIdentifier(table)}`);
    if (Number(result.rows[0]?.count ?? -1) !== expected[table]) {
      throw new Error(`${table} target count mismatch`);
    }
  }
  const owned = await client.query<{
    characters: string;
    battles: string;
    battlefields: string;
    styles: string;
    image_events: string;
  }>(
    `SELECT
       (SELECT count(*) FROM characters WHERE owner_user_id = $1)::text AS characters,
       (SELECT count(*) FROM battles WHERE side_a_user_id = $1)::text AS battles,
       (SELECT count(*) FROM battlefields WHERE owner_user_id = $1)::text AS battlefields,
       (SELECT count(*) FROM narration_styles WHERE owner_user_id = $1)::text AS styles,
       (SELECT count(*) FROM image_gen_events WHERE user_id = $1)::text AS image_events`,
    [targetUserId],
  );
  const counts = owned.rows[0];
  if (Number(counts?.characters) !== expectedOwned.characters ||
      Number(counts?.battles) !== expectedOwned.battles ||
      Number(counts?.battlefields) !== expectedOwned.battlefields ||
      Number(counts?.styles) !== expectedOwned.styles ||
      Number(counts?.image_events) !== expectedOwned.imageEvents) {
    throw new Error("target ownership counts do not match the legacy account");
  }
  const stale = await client.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM users WHERE id = $1) +
       (SELECT count(*) FROM characters WHERE owner_user_id = $1) +
       (SELECT count(*) FROM battles WHERE side_a_user_id = $1) +
       (SELECT count(*) FROM battlefields WHERE owner_user_id = $1) +
       (SELECT count(*) FROM narration_styles WHERE owner_user_id = $1) +
       (SELECT count(*) FROM image_gen_events WHERE user_id = $1)
     )::text AS count`,
    [oldUserId],
  );
  if (Number(stale.rows[0]?.count ?? -1) !== 0) throw new Error("legacy user references remain");
  const staleJson = await client.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM characters WHERE sheet_json::text LIKE $1) +
       (SELECT count(*) FROM battles WHERE state_json::text LIKE $1) +
       (SELECT count(*) FROM battlefields WHERE sheet_json::text LIKE $1) +
       (SELECT count(*) FROM narration_styles WHERE sheet_json::text LIKE $1) +
       (SELECT count(*) FROM balance_events WHERE payload_json::text LIKE $1)
     )::text AS count`,
    [`%${oldUserId}%`],
  );
  if (Number(staleJson.rows[0]?.count ?? -1) !== 0) {
    throw new Error("legacy user references remain in JSON data");
  }
  const localUrls = await client.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM characters WHERE sheet_json::text LIKE '%/api/media/%') +
       (SELECT count(*) FROM battles WHERE state_json::text LIKE '%/api/media/%') +
       (SELECT count(*) FROM battlefields WHERE sheet_json::text LIKE '%/api/media/%')
     )::text AS count`,
  );
  if (Number(localUrls.rows[0]?.count ?? -1) !== 0) throw new Error("local media URLs remain");
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(argument("--source") ?? config.databasePath);
  const legacyUsername = argument("--legacy-username");
  const targetEmail = argument("--target-email");
  const apply = process.argv.includes("--apply");
  if (!legacyUsername) throw new Error("--legacy-username is required");
  if (!targetEmail) throw new Error("--target-email is required");
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required");
  if (config.mediaStorage !== "r2") throw new Error("R2 storage must be configured");

  const snapshot = readSourceSnapshot(sourcePath);
  if (snapshot.inspection.errors.length > 0) {
    throw new Error(`source inspection failed: ${snapshot.inspection.errors.join("; ")}`);
  }
  const sourceUsers = snapshot.tables.get("users") ?? [];
  const legacyUser = sourceUsers.find((row) => row.username === legacyUsername);
  if (!legacyUser || typeof legacyUser.id !== "string") throw new Error("legacy user not found");

  const media = buildMediaManifest(sourcePath, snapshot.tables);
  const mediaUrls = new Map(media.map((item) => [item.pathname, item.publicUrl]));
  const r2 = createR2Client();
  let createdKeys: string[] = [];
  const database = createPostgresClient(process.env.DIRECT_URL);
  await database.connect();
  try {
    await uploadMedia(r2, media, createdKeys);
    await database.query("BEGIN");
    await database.query(`SELECT pg_advisory_xact_lock(hashtext('kshiai_legacy_account_migration'))`);
    const target = await database.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND auth_user_id IS NOT NULL`,
      [targetEmail],
    );
    const targetUserId = target.rows[0]?.id;
    if (!targetUserId) throw new Error("linked Supabase application user not found");
    const currentOwned = await database.query<{ count: string }>(
      `SELECT ((SELECT count(*) FROM characters WHERE owner_user_id = $1) +
               (SELECT count(*) FROM battles WHERE side_a_user_id = $1) +
               (SELECT count(*) FROM battlefields WHERE owner_user_id = $1) +
               (SELECT count(*) FROM narration_styles WHERE owner_user_id = $1) +
               (SELECT count(*) FROM image_gen_events WHERE user_id = $1))::text AS count`,
      [targetUserId],
    );
    if (Number(currentOwned.rows[0]?.count ?? -1) !== 0) {
      throw new Error("target Supabase user already owns application data");
    }
    const oldUserId = legacyUser.id;
    const expectedOwned: OwnershipCounts = {
      characters: (snapshot.tables.get("characters") ?? [])
        .filter((row) => row.owner_user_id === oldUserId).length,
      battles: (snapshot.tables.get("battles") ?? [])
        .filter((row) => row.side_a_user_id === oldUserId).length,
      battlefields: (snapshot.tables.get("battlefields") ?? [])
        .filter((row) => row.owner_user_id === oldUserId).length,
      styles: (snapshot.tables.get("narration_styles") ?? [])
        .filter((row) => row.owner_user_id === oldUserId).length,
      imageEvents: (snapshot.tables.get("image_gen_events") ?? [])
        .filter((row) => row.user_id === oldUserId).length,
    };
    // Battlefield system IDs were generated per database in the legacy code.
    // Replace the empty target's seed set so the migrated source remains one
    // coherent catalog instead of accumulating duplicate system presets.
    await database.query(`DELETE FROM battlefields WHERE is_system = TRUE`);
    for (const spec of importSpecs) {
      let rows = (snapshot.tables.get(spec.name) ?? []).map((sourceRow) => {
        const row = { ...sourceRow };
        if (spec.name === "characters") {
          if (row.owner_user_id === oldUserId) row.owner_user_id = targetUserId;
          row.sheet_json = rewriteLegacyValue(row.sheet_json, oldUserId, targetUserId, mediaUrls);
        } else if (spec.name === "battles") {
          if (row.side_a_user_id === oldUserId) row.side_a_user_id = targetUserId;
          row.state_json = normalizeLegacyBattleState(
            rewriteLegacyValue(row.state_json, oldUserId, targetUserId, mediaUrls),
          );
        } else if (spec.name === "battlefields" || spec.name === "narration_styles") {
          if (row.owner_user_id === oldUserId) row.owner_user_id = targetUserId;
          row.sheet_json = rewriteLegacyValue(row.sheet_json, oldUserId, targetUserId, mediaUrls);
        } else if (spec.name === "image_gen_events") {
          if (row.user_id === oldUserId) row.user_id = targetUserId;
        } else if (spec.name === "balance_events") {
          row.payload_json = rewriteLegacyValue(row.payload_json, oldUserId, targetUserId, mediaUrls);
        }
        return row;
      });
      if (spec.name === "users") rows = rows.filter((row) => row.id !== oldUserId);
      await upsertRows(database, spec, rows);
    }
    await database.query(`DELETE FROM sessions`);
    await database.query(`SELECT setval(pg_get_serial_sequence('public.image_gen_events', 'id'), COALESCE((SELECT max(id) FROM image_gen_events), 1), EXISTS (SELECT 1 FROM image_gen_events))`);
    await database.query(`SELECT setval(pg_get_serial_sequence('public.balance_events', 'id'), COALESCE((SELECT max(id) FROM balance_events), 1), EXISTS (SELECT 1 FROM balance_events))`);

    const expected = { ...snapshot.inspection.counts, users: sourceUsers.length, sessions: 0 };
    await validateTarget(database, targetUserId, oldUserId, expected, expectedOwned);
    if (apply) {
      await database.query("COMMIT");
      console.log(`Legacy account migration committed: media=${media.length} created=${createdKeys.length}`);
    } else {
      await database.query("ROLLBACK");
      await deleteMedia(r2, createdKeys);
      createdKeys = [];
      console.log(`Legacy account migration verified and rolled back: media=${media.length}`);
    }
  } catch (error) {
    await database.query("ROLLBACK").catch(() => undefined);
    await deleteMedia(r2, createdKeys).catch(() => undefined);
    throw error;
  } finally {
    await database.end();
    r2.destroy();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
