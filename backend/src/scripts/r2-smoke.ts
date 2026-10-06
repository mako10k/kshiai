// R: Verify R2 access, using exact existing-object reads and permits during a cutover trial.
import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  // Only an explicitly selected cutover uses API configuration and database permits.
  const cutover = process.env.CUTOVER_ID || process.env.CUTOVER_ARTIFACT_ID
    ? (await import("../config.js")).config.cutover : null;
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET");
  const publicBaseUrl = required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const client = new S3Client({
    maxAttempts: 1,
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    if (cutover) {
      const { closeDatabase } = await import("../db.js");
      try {
        const { readStageSmokeManifest } = await import("../services/stage-smoke-manifest.js");
        const { runStageR2Smoke } = await import("../services/stage-r2-smoke.js");
        const result = await runStageR2Smoke(readStageSmokeManifest(process.env.STAGE_SMOKE_MANIFEST_FILE),
          { accountId, bucket, objectKey: required("STAGE_SMOKE_R2_OBJECT_KEY"), publicBaseUrl }, {
            headObject: async (selectedBucket, key) => {
              await client.send(new HeadObjectCommand({ Bucket: selectedBucket, Key: key }));
            },
            headPublic: async (url) => (await fetch(url, {
              method: "HEAD", signal: AbortSignal.timeout(15_000), redirect: "error",
            })).status,
          });
        console.log(JSON.stringify({ ...result.result, receiptDigest: result.receiptDigest }));
      } finally { await closeDatabase(); }
      return;
    }

    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1,
    }));
    const key = listed.Contents?.[0]?.Key;
    if (key) {
      const publicUrl = `${publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(publicUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`R2 public object smoke failed: ${response.status}`);
      }
    }
    console.log(
      key
        ? "R2 credentials, bucket listing, and public object smoke passed"
        : "R2 credentials and empty bucket listing smoke passed",
    );
  } finally { client.destroy(); }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
