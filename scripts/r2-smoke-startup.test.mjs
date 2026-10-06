// R: Verify standalone R2 smoke startup excludes application dependencies while cutover remains fail closed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("../backend/src/scripts/r2-smoke.ts", import.meta.url));
function run(overrides = {}) {
  const result = spawnSync(process.execPath, ["--import", "tsx", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 15000,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "", CUTOVER_ID: "", CUTOVER_ARTIFACT_ID: "",
      R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET: "", R2_PUBLIC_BASE_URL: "",
      ...overrides },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  return result.stderr;
}
test("ordinary production startup without database configuration reaches the R2-specific guard", () => {
  assert.match(run(), /R2_ACCOUNT_ID is required/);
});
test("either explicit cutover identity retains production application configuration validation", () => {
  for (const identity of [{ CUTOVER_ID: "trial" }, { CUTOVER_ARTIFACT_ID: "artifact" }]) {
    assert.match(run(identity), /DATABASE_URL is required when NODE_ENV=production/);
  }
});
test("cutover identity pair is still validated by the original configuration", () => {
  const production = { DATABASE_URL: "postgres://invalid.invalid/test", AUTH_PROVIDER: "supabase",
    SUPABASE_URL: "https://auth.invalid", SUPABASE_JWKS_URL: "https://auth.invalid/jwks", MEDIA_STORAGE: "r2",
    R2_ACCOUNT_ID: "test", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_BUCKET: "test", R2_PUBLIC_BASE_URL: "https://r2.invalid",
    NARRATION_TASK_PROJECT: "test", NARRATION_TASK_LOCATION: "test", NARRATION_TASK_QUEUE: "test",
    NARRATION_TASK_TARGET_URL: "https://task.invalid", NARRATION_TASK_SERVICE_ACCOUNT_EMAIL: "test@example.invalid",
    NARRATION_TASK_AUDIENCE: "https://task.invalid" };
  for (const identity of [{ CUTOVER_ID: "trial" }, { CUTOVER_ARTIFACT_ID: "artifact" }]) {
    assert.match(run({ ...production, ...identity }), /CUTOVER_ID and CUTOVER_ARTIFACT_ID must be configured together/);
  }
});
