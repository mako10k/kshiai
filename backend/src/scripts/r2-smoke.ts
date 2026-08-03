import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET");
  const publicBaseUrl = required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
