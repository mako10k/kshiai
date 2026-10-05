// R: Verify trial target isolation, fixed candidate integrity, bounded progression, and failed-call readback without real HTTP.
import assert from "node:assert/strict";
import { it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { readAwarenessTrialCandidate } from "./awareness-trial-candidate.js";

const root = resolve(import.meta.dirname, "../../..");
const candidatePath = join(root, "docs/evidence/awareness-real-trial-candidate-2026-10-05.json");
const OutputSchema = z.object({ directory: z.string(), mode: z.string(), generationCount: z.number().optional(), completedCombatTicks: z.number().optional(), missingUsageAttemptCount: z.number().optional(), errorClass: z.string().nullable().optional() });
function run(mode?: string, failure?: string, long = false) {
  const sentinel = mkdtempSync(join(tmpdir(), "kshiai-trial-protected-"));
  const protectedDb = join(sentinel, "normal.db");
  writeFileSync(protectedDb, "untouched normal database");
  const trace = join(sentinel, "trace.jsonl");
  const args = ["--import", "tsx"];
  if (mode === "--execute") args.push("--import", join(root, "backend/src/testing/awareness-trial-http-fixture.ts"));
  args.push(join(root, "backend/src/scripts/run-awareness-trial.ts"));
  if (mode) args.push(mode);
  if (long) args.push("--long-timeouts");
  const child = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 60000,
    env: { ...process.env, DATABASE_URL: "postgres://unreachable.invalid/production", DATABASE_PATH: protectedDb,
      OPENAI_API_KEY: "test-only", XAI_API_KEY: "test-only", TRIAL_TEST_TRACE_PATH: trace, TRIAL_TEST_FAILURE: failure ?? "" } });
  assert.equal(readFileSync(protectedDb, "utf8"), "untouched normal database");
  const last = child.stdout.trim().split("\n").at(-1);
  assert.ok(last, child.stderr);
  return { child, output: OutputSchema.parse(JSON.parse(last)), trace };
}
it("rejects changed candidate input before execution", () => {
  const directory = mkdtempSync(join(tmpdir(), "kshiai-candidate-check-"));
  const candidate = readFileSync(candidatePath, "utf8").replace("アオ", "改変");
  const path = join(directory, "candidate.json");
  writeFileSync(path, candidate);
  assert.throws(() => readAwarenessTrialCandidate(path), /DIGEST_MISMATCH/);
});
it("defaults to offline validation and ignores inherited normal database targets", () => {
  const { child, output } = run();
  assert.equal(child.status, 0, child.stderr);
  assert.equal(output.mode, "validate");
  assert.equal(output.generationCount, 3);
});
it("runs exactly three combat ticks and drains narration with fixed actual SDK routes", () => {
  const { child, output, trace } = run("--execute");
  assert.equal(child.status, 0, child.stderr + child.stdout);
  assert.equal(output.completedCombatTicks, 3);
  const report = z.object({ attempts: z.array(z.object({ provider: z.string(), requestedModel: z.string(), status: z.string(), totalTokens: z.number().nullable() })), snapshots: z.array(z.object({ phase: z.string() })), narrationQueue: z.array(z.object({ status: z.string() })) }).parse(JSON.parse(readFileSync(join(output.directory, "readback.json"), "utf8")));
  assert.equal(report.snapshots.filter((item) => item.phase.startsWith("tick-")).length, 3);
  assert.ok(report.narrationQueue.every((item) => item.status === "completed"));
  assert.ok(report.attempts.every((item) => item.status === "completed" && item.totalTokens === 20));
  assert.ok(report.attempts.some((item) => item.requestedModel === "gpt-6-luna"));
  assert.ok(report.attempts.some((item) => item.requestedModel === "grok-4.3"));
  const calls = readFileSync(trace, "utf8").trim().split("\n").map((line) => z.object({ model: z.string(), reasoning: z.string().optional() }).parse(JSON.parse(line)));
  assert.ok(calls.filter((call) => call.model === "gpt-6-luna").every((call) => call.reasoning === "none"));
});
it("retains failed encounter usage without creating another battle or sending later ticks", () => {
  const { child, output, trace } = run("--execute", "encounter");
  assert.equal(child.status, 1);
  assert.equal(output.completedCombatTicks, 0);
  assert.ok(output.missingUsageAttemptCount && output.missingUsageAttemptCount > 0);
  assert.equal(readFileSync(trace, "utf8").trim().split("\n").length, 1);
});
it("stops new combat ticks after narration fails and preserves failed readback", () => {
  const { child, output } = run("--execute", "narration");
  assert.equal(child.status, 1);
  assert.equal(output.completedCombatTicks, 0);
  assert.equal(output.errorClass, "NarrationFailed");
});

it("binds long measurement timing to the new trial and counts actual wire input without retaining prompts", () => {
  const { child, output } = run("--execute", undefined, true);
  assert.equal(child.status, 0, child.stderr + child.stdout);
  assert.equal(output.completedCombatTicks, 3);
  const policy = z.object({ revision: z.literal("awareness-v5-measurement-v1"), maxDurationMs: z.literal(600000) }).parse(JSON.parse(readFileSync(join(output.directory, "measurement-policy.json"), "utf8")));
  const report = z.object({ snapshots: z.array(z.object({ battle: z.object({ assetManifest: z.object({ awarenessPolicy: z.object({ revision: z.string() }) }) }), awareness: z.object({ runtime: z.object({ startedAt: z.number(), deadlineAt: z.number(), policy: z.object({ revision: z.string() }) }) }) })) }).parse(JSON.parse(readFileSync(join(output.directory, "readback.json"), "utf8")));
  for (const snapshot of report.snapshots) {
    assert.equal(snapshot.battle.assetManifest.awarenessPolicy.revision, policy.revision);
    assert.equal(snapshot.awareness.runtime.policy.revision, policy.revision);
    assert.equal(snapshot.awareness.runtime.deadlineAt - snapshot.awareness.runtime.startedAt, policy.maxDurationMs);
  }
  const sizes = readFileSync(join(output.directory, "input-sizes.jsonl"), "utf8");
  const records = sizes.trim().split("\n").map((line) => z.object({ totalCharacters: z.number(), scope: z.object({ role: z.string() }), model: z.string() }).parse(JSON.parse(line)));
  assert.ok(records.some((record) => record.scope.role === "subconscious" && record.totalCharacters > 0));
  assert.equal(sizes.includes("ざわざわ"), false);
  assert.equal(sizes.includes("test-only"), false);
});

it("releases completed SDK slots after invalid latent and late conscious shapes while retaining unknown cost", () => {
  const { child, output, trace } = run("--execute", "shape");
  assert.equal(child.status, 1, child.stderr + child.stdout);
  assert.equal(output.completedCombatTicks, 0);
  const report = z.object({ attempts: z.array(z.object({ status: z.literal("completed"), totalTokens: z.literal(20) })),
    unresolvedReservationIds: z.array(z.string()), missingUsageAttemptIds: z.array(z.string()),
    snapshots: z.array(z.object({ awareness: z.object({ runtime: z.object({ status: z.string(), incompleteReason: z.string().nullable(),
      budget: z.object({ physicalOutstanding: z.number(), unknownAttemptIds: z.array(z.string()) }),
      sides: z.object({ a: z.object({ job: z.object({ status: z.string(), physicalStatus: z.string() }).nullable() }), b: z.object({ job: z.object({ status: z.string(), physicalStatus: z.string() }).nullable() }) }) }) }) }))
  }).parse(JSON.parse(readFileSync(join(output.directory, "readback.json"), "utf8")));
  assert.equal(report.attempts.length, 5);
  assert.equal(readFileSync(trace, "utf8").trim().split("\n").length, 5);
  assert.deepEqual(report.unresolvedReservationIds, []);
  assert.deepEqual(report.missingUsageAttemptIds, []);
  const final = report.snapshots.at(-1)?.awareness.runtime; assert.ok(final);
  assert.equal(final.status, "incomplete"); assert.match(final.incompleteReason ?? "", /Expected object, received/);
  assert.equal(final.budget.physicalOutstanding, 0); assert.equal(final.budget.unknownAttemptIds.length, 5);
  for (const side of ["a", "b"] as const) {
    assert.equal(final.sides[side].job?.physicalStatus, "finished");
    assert.equal(final.sides[side].job?.status, "cancelled");
  }
});

it("closes SDK-completed narration format rejection without inventing a narrative or zero cost", () => {
  const { child, output } = run("--execute", "narration-shape");
  assert.equal(child.status, 1); assert.equal(output.errorClass, "NarrationFailed");
  const report = z.object({ attempts: z.array(z.object({ status: z.string(), role: z.string() })), unresolvedReservationIds: z.array(z.string()),
    narrationQueue: z.array(z.object({ status: z.string() })), snapshots: z.array(z.object({ awareness: z.object({ runtime: z.object({ budget: z.object({ physicalOutstanding: z.number(), unknownAttemptIds: z.array(z.string()) }) }) }) }))
  }).parse(JSON.parse(readFileSync(join(output.directory, "readback.json"), "utf8")));
  assert.ok(report.attempts.some((attempt) => attempt.role === "narration" && attempt.status === "completed"));
  assert.ok(report.narrationQueue.some((receipt) => receipt.status === "failed"));
  assert.deepEqual(report.unresolvedReservationIds, []);
  const final = report.snapshots.at(-1)?.awareness.runtime; assert.ok(final);
  assert.equal(final.budget.physicalOutstanding, 0); assert.ok(final.budget.unknownAttemptIds.length > 0);
});
