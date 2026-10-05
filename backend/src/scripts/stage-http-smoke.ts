// R: Run one exact Stage HTTP acceptance check with explicitly selected endpoint and identity.
import { closeDatabase } from "../db.js";
import { readStageSmokeManifest } from "../services/stage-smoke-manifest.js";
import { runStageHttpSmoke, type StageHttpSmokeTarget } from "../services/stage-http-smoke.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
async function main(): Promise<void> {
  const manifest = readStageSmokeManifest(process.env.STAGE_SMOKE_MANIFEST_FILE);
  const url = required("STAGE_SMOKE_HTTP_URL");
  let target: StageHttpSmokeTarget;
  if (manifest.kind === "health") target = { kind: "health", url, expectedRevision: required("STAGE_SMOKE_EXPECTED_REVISION") };
  else if (manifest.kind === "ownership") target = { kind: "ownership", url, expectedOwnerUserId: manifest.ownerUserId };
  else if (manifest.kind === "direct-protection") target = { kind: "direct-protection", url };
  else throw new Error("HTTP smoke kind required");
  try {
    const result = await runStageHttpSmoke(manifest, target, (url, authenticated) => fetch(url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: authenticated ? { Authorization: `Bearer ${required("STAGE_SMOKE_ACCESS_TOKEN")}` } : {},
    }));
    console.log(JSON.stringify({ ...result.result, receiptDigest: result.receiptDigest }));
  } finally { await closeDatabase(); }
}
main().catch(() => { console.error("stage_http_smoke_failed; inspect exact permit readback"); process.exitCode = 1; });
