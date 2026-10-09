// R: Bind the reviewed RC2 plan and real stop-policy evidence to one admin apply and independent readback.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
try {
const required = (name) => { const value = process.env[name]; if (!value) throw new Error("TRIAL_REVIEWED_INPUT_REQUIRED"); return value; };
const planBytes = Buffer.from([0, 1, 2].map((index) => required(`TRIAL_PLAN_PART_${index}`)).join(""), "base64");
if (createHash("sha256").update(planBytes).digest("hex") !== required("TRIAL_PLAN_SHA256")) throw new Error("TRIAL_PLAN_BYTES_MISMATCH");
const policy = JSON.parse(Buffer.from(required("TRIAL_POLICY_BASE64"), "base64").toString("utf8"));
if (policy.kind !== "unreleased-initial-v3-trial" || !policy.ownerDecisionIdentity || !policy.oldWritersClosedReceiptId) throw new Error("TRIAL_STOP_EVIDENCE_REQUIRED");
writeFileSync("/tmp/vt104-reviewed-plan.json", planBytes);
writeFileSync("/tmp/vt104-real-policy.json", JSON.stringify(policy));
const { runUnreleasedV3TrialPreparation } = await import("./backend/dist/scripts/prepare-unreleased-v3-trial.js");
const common = ["--configured-database", "--project-ref", "cvrbhpkfqkpqdegxfrlq", "--schema", "public", "--plan", "/tmp/vt104-reviewed-plan.json", "--expect-plan-sha256", required("TRIAL_PLAN_SHA256")];
const applied = await runUnreleasedV3TrialPreparation(["apply", ...common, "--policy", "/tmp/vt104-real-policy.json", "--operator-id", "mako10k@mk10.org"]);
const readback = await runUnreleasedV3TrialPreparation(["readback", ...common]);
console.log(JSON.stringify({ applied, readback }));
} catch (error) {
  const reason = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "TRIAL_PREPARATION_FAILED";
  console.error(JSON.stringify({ error: reason }));
  process.exitCode = 1;
}
