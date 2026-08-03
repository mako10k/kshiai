import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

export type MediaKind = "characters" | "battlefields";

type ObjectWriter = {
  send(command: PutObjectCommand): Promise<unknown>;
};

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
  return client;
}

export function buildR2ObjectKey(
  kind: MediaKind,
  id: string,
  now = new Date(),
  suffix: string = randomUUID(),
): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("invalid_media_id");
  const day = now.toISOString().slice(0, 10);
  return `${kind}/${id}/${day}/${suffix}.jpg`;
}

export function r2PublicUrl(baseUrl: string, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/${encoded}`;
}

export async function putR2Image(
  input: {
    kind: MediaKind;
    id: string;
    body: Uint8Array;
  },
  writer: ObjectWriter = getClient(),
  settings = config.r2,
): Promise<string> {
  const key = buildR2ObjectKey(input.kind, input.id);
  await writer.send(new PutObjectCommand({
    Bucket: settings.bucket,
    Key: key,
    Body: input.body,
    ContentType: "image/jpeg",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return r2PublicUrl(settings.publicBaseUrl, key);
}
