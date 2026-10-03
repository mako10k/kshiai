// R: Verify the actual existing-account auth CLI with a loopback Supabase fixture and isolated ledger.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import type { CutoverControlPolicy } from "../repositories/cutover-control.js";

const directory = mkdtempSync(join(tmpdir(), "stage-auth-cli-"));
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.DATABASE_PATH = join(directory, "auth.sqlite");
process.env.AUTH_PROVIDER = "legacy";
process.env.CUTOVER_ID = "auth-cli-control";
process.env.CUTOVER_ARTIFACT_ID = "auth-cli-artifact";
const db = await import("../db.js"); db.getDb({ initializeSchema: true });
const storage = await import("../repositories/cutover-control.js");
const smoke = await import("../services/cutover-stage-smoke.js");
const authSmoke = await import("../services/stage-auth-smoke.js");
const execute = promisify(execFile);
after(async () => { await db.closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

test("the email CLI signs in once, verifies a real signed token, reads existing mapping, and provisions nothing", async () => {
  const subject = "11111111-1111-4111-8111-111111111111";
  const keys = await generateKeyPair("ES256");
  const jwk = { ...await exportJWK(keys.publicKey), kid: "fixture", alg: "ES256" };
  const requests: string[] = [];
  let token = "";
  const server = createServer(async (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("Content-Type", "application/json");
    if (request.method === "POST" && request.url === "/auth/v1/token?grant_type=password") {
      let body = ""; for await (const chunk of request) body += String(chunk);
      assert.deepEqual(JSON.parse(body), { email: "existing@example.test", password: "synthetic-pass" });
      response.end(JSON.stringify({ access_token: token }));
    } else if (request.url === "/auth/v1/.well-known/jwks.json") {
      response.end(JSON.stringify({ keys: [jwk] }));
    } else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const supabaseUrl = `http://127.0.0.1:${address.port}`;
  token = await new SignJWT({ sub: subject, role: "authenticated", email: "existing@example.test" })
    .setProtectedHeader({ alg: "ES256", kid: "fixture" }).setIssuer(`${supabaseUrl}/auth/v1`)
    .setAudience("authenticated").setExpirationTime("5m").sign(keys.privateKey);
  await db.query("INSERT INTO users (id,username,password_hash,auth_user_id,email,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
    ["existing-email-user", "existing-email-user", "!fixture", subject, "existing@example.test", new Date().toISOString()]);
  const target = { supabaseUrl, expectedSubject: subject, expectedApplicationUserId: "existing-email-user", authentication: "email" as const };
  const manifest = { runId: "auth-cli-run", ownerUserId: "owner", kind: "email" as const,
    steps: authSmoke.stageAuthSmokeSteps(target) };
  const { actorId: _actorId, ...binding } = smoke.stageSmokeOperation(manifest);
  const policy: CutoverControlPolicy = {
    cutoverId: "auth-cli-control", artifactId: "auth-cli-artifact", ownerUserId: "owner",
    ownerCandidates: [{ attemptId: "a", candidateDigest: "a".repeat(64) }, { attemptId: "b", candidateDigest: "b".repeat(64) }],
    trialBindings: null, taskBattleIds: [], productionReceipt: null,
    stageAcceptance: { health: null, postgres: null, email: null, google: null, ownership: null, r2: null, sse: null, directProtection: null },
  };
  await storage.initializeCutoverControl({ policy, phase: "closed", operationId: "init", operatorId: "operator" });
  policy.trialBindings = { generationIds: ["a", "b"], ownerConfirmationReceiptIds: ["a", "b"],
    cutoverReadbackReceiptId: "fixture", stoppedBarrierReceiptId: "fixture", requests: [{ ...binding, maximumReservations: 1 }] };
  // Only trial admission is seeded; real confirmation transition is tested separately.
  await db.query("UPDATE cutover_control_revisions SET phase='trial',policy_json=$1", [JSON.stringify(policy)]);
  const manifestPath = join(directory, "manifest.json"); writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    const result = await execute(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./stage-auth-smoke.ts", import.meta.url))], {
      env: { ...process.env, AUTH_PROVIDER: "supabase", SUPABASE_URL: supabaseUrl,
        SUPABASE_JWKS_URL: `${supabaseUrl}/auth/v1/.well-known/jwks.json`, SUPABASE_PUBLISHABLE_KEY: "fixture-key",
        STAGE_SMOKE_MANIFEST_FILE: manifestPath, STAGE_SMOKE_AUTH_SUBJECT: subject,
        STAGE_SMOKE_APPLICATION_USER_ID: "existing-email-user", STAGE_SMOKE_EMAIL: "existing@example.test",
        STAGE_SMOKE_PASSWORD: "synthetic-pass" }, timeout: 30_000,
    });
    assert.equal(result.stdout.includes(token), false);
    assert.equal(result.stdout.includes("synthetic-pass"), false);
    assert.deepEqual(requests, ["POST /auth/v1/token?grant_type=password", "GET /auth/v1/.well-known/jwks.json"]);
    const permit = await db.query<{ state: string }>("SELECT state FROM cutover_operation_permits");
    assert.equal(permit.rows[0]?.state, "settled");
    const users = await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM users");
    assert.equal(users.rows[0]?.count, 1);
    const characters = await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM characters");
    assert.equal(characters.rows[0]?.count, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
