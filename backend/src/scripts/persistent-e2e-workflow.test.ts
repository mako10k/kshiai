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

  it("binds isolated dialogue overrides to Stage and rejects them at Promote", () => {
    const stage = workflow("stage-release.yml");
    const promote = workflow("promote-release.yml");
    for (const name of [
      "DIALOGUE_CONTEXT_PROJECTION_OVERRIDE",
      "DIALOGUE_CONTEXT_PROJECTION_OVERRIDE_COMMIT_SHA",
      "DIALOGUE_CONTEXT_PROJECTION_OVERRIDE_ARTIFACT_REF",
    ]) {
      assert.match(stage, new RegExp(name));
      assert.match(promote, new RegExp(name));
    }
    assert.match(
      stage,
      /DIALOGUE_CONTEXT_PROJECTION_OVERRIDE_COMMIT_SHA=\$GITHUB_SHA/,
    );
    assert.match(
      stage,
      /DIALOGUE_CONTEXT_PROJECTION_OVERRIDE_ARTIFACT_REF=\$IMAGE_REF/,
    );
    assert.match(
      stage,
      /--remove-env-vars="DIALOGUE_CONTEXT_PROJECTION_OVERRIDE,DIALOGUE_CONTEXT_PROJECTION_OVERRIDE_COMMIT_SHA,DIALOGUE_CONTEXT_PROJECTION_OVERRIDE_ARTIFACT_REF"/,
    );
    assert.match(
      promote,
      /Ordinary production revision carries a dialogue override/,
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
    assert.match(observe, /E2E_EXPECTED_DIALOGUE_PROJECTION=\$EXPECTED_DIALOGUE_PROJECTION/);
    assert.match(observe, /E2E_EXPECTED_DIALOGUE_ACTIVATION_SOURCE=\$EXPECTED_DIALOGUE_ACTIVATION_SOURCE/);
    assert.match(observe, /provider_operation_ceiling:[\s\S]*?default: "169"/);
    assert.match(observe, /cloud_run_job_exit_success/);
    assert.match(observe, /postgres\.balance_events:persistent_e2e_observation/);
    assert.match(observe, /retention-days: 90/);
    assert.doesNotMatch(observe, /gcloud logging read/);
    assert.doesNotMatch(observe, /DELETE FROM|admin\/users\/\$.*DELETE/);
  });

  it("requires exact Compact battle evidence before production promotion", () => {
    const stage = workflow("stage-release.yml");
    const promote = workflow("promote-release.yml");
    assert.match(stage, /alias="stage-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
    assert.match(stage, /Exercise the exact staged revision with a dialogue-bound battle/);
    assert.match(stage, /E2E_TARGET_REVISION=\$REVISION/);
    assert.match(stage, /exact_revision_health_and_battle_receipt/);
    assert.match(stage, /stage-release-evidence-\$\{\{ github\.run_id \}\}/);
    assert.match(promote, /stage_run_id:/);
    assert.match(promote, /gh run download "\$STAGE_RUN_ID"/);
    assert.match(promote, /run\.conclusion !== "success"/);
    assert.match(promote, /run\.headSha !== process\.env\.GITHUB_SHA/);
    assert.match(promote, /dialogueProjection: "compact"/);
    assert.match(promote, /dialogueActivationSource: "persisted_setting"/);
  });

  it("proves narration and authoring queue OIDC delivery against the staged revision", () => {
    const stage = workflow("stage-release.yml");
    const promote = workflow("promote-release.yml");
    assert.match(stage, /Prove narration and authoring Cloud Tasks OIDC delivery/);
    assert.match(stage, /Prove exact narration receipt lifecycle without an LLM/);
    assert.match(stage, /Prove provider attempt accounting without an LLM/);
    assert.match(
      stage,
      /Prove exact narration receipt lifecycle without an LLM[\s\S]*?npm run build --workspace=@kshiai\/shared[\s\S]*?node --import tsx --test \\\n\s+--test-name-pattern="claims only the exact receipt generation" \\\n\s+src\/services\/narration-worker\.test\.ts/,
    );
    assert.match(
      stage,
      /Prove provider attempt accounting without an LLM[\s\S]*?node --import tsx --test src\/llm\/provider-accounting\.test\.ts/,
    );
    assert.match(stage, /gcloud tasks create-http-task/);
    assert.match(stage, /--oidc-service-account-email/);
    assert.match(stage, /\[narration\] task smoke ok/);
    assert.match(stage, /\[authoring\] task smoke ok/);
    assert.match(stage, /api\/internal\/authoring\/task/);
    assert.match(stage, /--oidc-token-audience="\$authoring_target_url"/);
    assert.match(stage, /narration_task_target_url=.*alias/);
    assert.ok(
      stage.indexOf("- name: Apply forward-only migrations") <
        stage.indexOf("- name: Deploy tagged Cloud Run revision without traffic"),
      "migrations must finish before the new revision can start",
    );
    assert.match(promote, /Narration task target is not bound to the staged revision tag/);
  });
});
