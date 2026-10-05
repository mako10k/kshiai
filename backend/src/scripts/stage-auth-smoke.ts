// R: Run bounded existing-account Supabase authentication checks without user or asset provisioning.
import { decodeJwt } from "jose";
import { config } from "../config.js";
import { query, closeDatabase } from "../db.js";
import { createSupabaseIdentityVerifier } from "../services/supabase-identity.js";
import { runStageAuthSmoke, stageAuthSmokeSteps } from "../services/stage-auth-smoke.js";
import { readStageSmokeManifest } from "../services/stage-smoke-manifest.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
async function main(): Promise<void> {
  const manifest = readStageSmokeManifest(process.env.STAGE_SMOKE_MANIFEST_FILE);
  if (manifest.kind !== "email" && manifest.kind !== "google") throw new Error("auth smoke kind required");
  const target = {
    supabaseUrl: config.supabaseUrl,
    expectedSubject: required("STAGE_SMOKE_AUTH_SUBJECT"),
    expectedApplicationUserId: required("STAGE_SMOKE_APPLICATION_USER_ID"),
    authentication: manifest.kind,
  };
  if (!config.cutover || !target.supabaseUrl) throw new Error("configured cutover and Supabase are required");
  if (JSON.stringify(manifest.steps) !== JSON.stringify(stageAuthSmokeSteps(target))) {
    throw new Error("stage_auth_target_mismatch");
  }
  const verify = createSupabaseIdentityVerifier(config);
  try {
    const result = await runStageAuthSmoke(manifest, target, {
      signIn: async () => {
        if (target.authentication === "google") return required("STAGE_SMOKE_ACCESS_TOKEN");
        const response = await fetch(`${target.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: required("SUPABASE_PUBLISHABLE_KEY"), "Content-Type": "application/json" },
          body: JSON.stringify({ email: required("STAGE_SMOKE_EMAIL"), password: required("STAGE_SMOKE_PASSWORD") }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`stage_email_signin_failed:${response.status}`);
        const body: unknown = await response.json();
        const token = body && typeof body === "object" ? Reflect.get(body, "access_token") : null;
        if (typeof token !== "string" || !token) throw new Error("stage_email_token_missing");
        return token;
      },
      verifyIdentity: async (token) => {
        const identity = await verify(token);
        if (!identity) return null;
        if (target.authentication === "google") {
          const metadata = decodeJwt(token).app_metadata;
          if (!metadata || typeof metadata !== "object" || Reflect.get(metadata, "provider") !== "google") return null;
          required("STAGE_SMOKE_GOOGLE_SIGNIN_RECEIPT");
        }
        return identity;
      },
      readApplicationMapping: async (subject) => {
        const result = await query<{ id: string }>("SELECT id FROM users WHERE auth_user_id=$1", [subject]);
        return result.rows[0]?.id ?? null;
      },
    });
    console.log(JSON.stringify({ ...result.result, receiptDigest: result.receiptDigest,
      googleSignInReceipt: target.authentication === "google" ? required("STAGE_SMOKE_GOOGLE_SIGNIN_RECEIPT") : null,
      scope: "existing-account authentication and mapping; owner-only API admission checked separately" }));
  } finally { await closeDatabase(); }
}
main().catch(() => { console.error("stage_auth_smoke_failed; inspect exact permit readback"); process.exitCode = 1; });
