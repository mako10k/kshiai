// R: Verify that trial operator commands cannot select an implicit or mismatched database target.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parseTrialPreparationArguments,
  readReviewedTrialPlan,
  validateTrialDatabaseTarget,
} from "./prepare-unreleased-v3-trial.js";

const project = "cvrbhpkfqkpqdegxfrlq";
const target = ["--configured-database", "--project-ref", project, "--schema", "public"];
const preview = ["preview", ...target, "--cutover-id", "trial", "--cutover-at", "2026-10-01T00:00:00Z"];
describe("explicit unreleased trial operator target", () => {
  it("rejects implicit targets, duplicate flags and mutation options on a preview", () => {
    for (const argv of [
      preview.filter((value) => value !== "--configured-database"),
      [...preview, "--configured-database"],
      [...preview, "--schema", "public"],
      [...preview, "--policy", "policy.json"],
      [...preview, "--local-test-database", "vt104_trial_disposal_test"],
      preview.map((value) => value === "public" ? "other_schema" : value),
    ]) assert.throws(() => parseTrialPreparationArguments(argv), /ARGUMENTS_INVALID/);
  });
  it("binds Supabase direct and pooler routes to the same exact project", () => {
    const args = parseTrialPreparationArguments(preview);
    validateTrialDatabaseTarget(`postgres://postgres:unused@db.${project}.supabase.co/postgres`, args);
    validateTrialDatabaseTarget(`postgres://postgres.${project}:unused@aws-1-ap.pooler.supabase.com/postgres`, args);
    for (const url of [
      "postgres://postgres:unused@db.other.supabase.co/postgres",
      `postgres://postgres.${project}:unused@pooler.supabase.com.attacker.test/postgres`,
      `postgres://postgres.other:unused@aws-1-ap.pooler.supabase.com/postgres`,
      `postgres://postgres:unused@db.${project}.supabase.co/other`,
      "sqlite:///tmp/test.sqlite",
    ]) assert.throws(() => validateTrialDatabaseTarget(url, args), /TARGET_(INVALID|MISMATCH)/);
  });
  it("allows only an explicitly named disposable loopback PostgreSQL database", () => {
    const args = parseTrialPreparationArguments([
      "preview", "--configured-database", "--schema", "public",
      "--local-test-database", "vt104_trial_disposal_cli",
      "--cutover-id", "trial", "--cutover-at", "2026-10-01T00:00:00Z",
    ]);
    validateTrialDatabaseTarget("postgres://operator@127.0.0.1:55443/vt104_trial_disposal_cli", args);
    assert.throws(() => validateTrialDatabaseTarget("postgres://operator@remote.example/vt104_trial_disposal_cli", args), /MISMATCH/);
    assert.throws(() => validateTrialDatabaseTarget("postgres://operator@127.0.0.1:55443/postgres", args), /MISMATCH/);
  });
  it("rejects a cached config from a different database before connecting", () => {
    const script = `
      import assert from "node:assert/strict";
      process.env.DATABASE_URL = "postgres://operator@127.0.0.1:1/vt104_trial_disposal_first";
      process.env.DATABASE_SCHEMA = "public";
      process.env.AUTH_PROVIDER = "legacy";
      await import("./backend/src/config.ts");
      process.env.DIRECT_URL = "postgres://operator@127.0.0.1:1/vt104_trial_disposal_second";
      const { runUnreleasedV3TrialPreparation } = await import("./backend/src/scripts/prepare-unreleased-v3-trial.ts");
      await assert.rejects(runUnreleasedV3TrialPreparation([
        "preview", "--configured-database", "--local-test-database", "vt104_trial_disposal_second",
        "--schema", "public", "--cutover-id", "trial", "--cutover-at", "2026-10-01T00:00:00Z",
      ]), /TRIAL_DATABASE_CONFIG_BINDING_MISMATCH/);
    `;
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script]);
  });
  it("binds reviewed plan bytes before parsing any mutable plan file", () => {
    const directory = mkdtempSync(join(tmpdir(), "vt104-plan-bytes-"));
    try {
      const path = join(directory, "plan.json");
      const bytes = '{"cutoverId":"trial"}\n';
      writeFileSync(path, bytes);
      const digest = createHash("sha256").update(bytes).digest("hex");
      assert.deepEqual(readReviewedTrialPlan(path, digest), { cutoverId: "trial" });
      writeFileSync(path, `${bytes}\n`);
      assert.throws(() => readReviewedTrialPlan(path, digest), /BYTES_MISMATCH/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
