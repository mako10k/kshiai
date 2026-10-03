// R: Execute the exact reviewed V3 battle and finite SSE Stage smoke without generating fixture assets.
import fs from "node:fs";
import { isAbsolute } from "node:path";
import { CreateBattleRequestSchema, BattleStateSchema } from "@kshiai/shared";
import { query, closeDatabase } from "../db.js";
import { readStageSmokeManifest } from "../services/stage-smoke-manifest.js";
import { runStageV3Smoke } from "../services/stage-v3-smoke.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
async function main(): Promise<void> {
  const manifest = readStageSmokeManifest(process.env.STAGE_SMOKE_MANIFEST_FILE);
  const bodyPath = required("STAGE_SMOKE_CREATE_BODY_FILE");
  if (!isAbsolute(bodyPath)) throw new Error("absolute body path required");
  const body: unknown = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
  try {
    const result = await runStageV3Smoke(manifest, {
      apiBaseUrl: required("STAGE_SMOKE_API_URL"), ownerUserId: manifest.ownerUserId,
      generationIds: [required("STAGE_SMOKE_GENERATION_A"), required("STAGE_SMOKE_GENERATION_B")],
      body: CreateBattleRequestSchema.parse(body), idempotencyKey: required("STAGE_SMOKE_CREATE_KEY"),
      advanceKey: required("STAGE_SMOKE_ADVANCE_KEY"),
    }, {
      request: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(240_000),
        headers: { ...init.headers, Authorization: `Bearer ${required("STAGE_SMOKE_ACCESS_TOKEN")}` } }),
      readState: async (id) => {
        const result = await query<{ state_json: unknown }>("SELECT state_json FROM battles WHERE id=$1", [id]);
        const raw = result.rows[0]?.state_json;
        return raw ? BattleStateSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw) : null;
      },
    });
    console.log(JSON.stringify({ ...result.result, receiptDigest: result.receiptDigest }));
  } finally { await closeDatabase(); }
}
main().catch(() => { console.error("stage_v3_smoke_failed; inspect exact battle and permit readback"); process.exitCode = 1; });
