import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function workflow(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url)),
    "utf8",
  );
}

describe("persistent E2E workflow contract", () => {
  it("binds the administrator in Stage and verifies it before Promote", () => {
    const stage = workflow("stage-release.yml");
    const promote = workflow("promote-release.yml");
    assert.match(stage, /ADMIN_EMAILS: mako10k@mk10\.org/);
    assert.match(stage, /ADMIN_EMAILS=\$ADMIN_EMAILS/);
    assert.match(promote, /EXPECTED_ADMIN_EMAIL: mako10k@mk10\.org/);
    assert.match(promote, /missing the expected administrator email/);
  });

  it("freezes the selected pacing policy into Stage and verifies it before Promote", () => {
    const stage = workflow("stage-release.yml");
    const promote = workflow("promote-release.yml");
    for (const source of [stage, promote]) {
      assert.match(source, /battle_pacing_policy:/);
      assert.match(source, /candidate-12-v2/);
      assert.match(source, /current/);
    }
    assert.match(stage, /BATTLE_PACING_POLICY=\$PACING_POLICY/);
    assert.match(promote, /candidate\.name === "BATTLE_PACING_POLICY"/);
    assert.match(
      promote,
      /test "\$pacing_policy" = "\$EXPECTED_BATTLE_PACING_POLICY"/,
    );
  });

  it("runs the observer only against a confirmed immutable production revision", () => {
    const observe = workflow("observe-persistent-e2e.yml");
    assert.match(observe, /refs\/tags\/\$RELEASE_TAG/);
    assert.match(observe, /verify-release\.mjs/);
    assert.match(observe, /entry\.percent === 100/);
    assert.match(observe, /BATTLE_CAUSAL_NARRATION_MODE/);
    assert.match(observe, /container\?\.image\?\.includes\("@sha256:"\)/);
    assert.match(observe, /persistent-battle-e2e\.js/);
    assert.match(observe, /--max-retries=0/);
    assert.match(observe, /E2E_RUN_ID=\$OBSERVATION_RUN_ID/);
    assert.match(observe, /cloud_run_job_exit_success/);
    assert.match(observe, /postgres\.balance_events:persistent_e2e_observation/);
    assert.match(observe, /retention-days: 90/);
    assert.doesNotMatch(observe, /gcloud logging read/);
    assert.doesNotMatch(observe, /DELETE FROM|admin\/users\/\$.*DELETE/);
  });

  it("proves narration queue OIDC delivery against the staged revision", () => {
    const stage = workflow("stage-release.yml");
    const promote = workflow("promote-release.yml");
    assert.match(stage, /Prove Cloud Tasks OIDC delivery to staged revision/);
    assert.match(stage, /gcloud tasks create-http-task/);
    assert.match(stage, /--oidc-service-account-email/);
    assert.match(stage, /task smoke ok/);
    assert.match(stage, /narration_task_target_url=.*alias/);
    assert.match(promote, /Narration task target is not bound to the staged revision tag/);
  });
});
