import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBattlePacingPolicy,
  parseCharacterFocusShadowMode,
  parseDialogueContextProjectionOverride,
  parseDialogueContextProjectionOverrideDeployment,
} from "./config.js";

describe("battle pacing configuration", () => {
  it("defaults to current and accepts only the named candidate", () => {
    assert.equal(parseBattlePacingPolicy(undefined), "current");
    assert.equal(
      parseBattlePacingPolicy("candidate-12-v2"),
      "candidate-12-v2",
    );
    assert.throws(
      () => parseBattlePacingPolicy("candidate-latest"),
      /BATTLE_PACING_POLICY/,
    );
  });
});

describe("character focus shadow configuration", () => {
  it("defaults off and accepts only the explicit shadow mode", () => {
    assert.equal(parseCharacterFocusShadowMode(undefined), "off");
    assert.equal(parseCharacterFocusShadowMode("shadow"), "shadow");
    assert.throws(
      () => parseCharacterFocusShadowMode("enabled"),
      /CHARACTER_FOCUS_SHADOW_MODE/,
    );
  });
});

describe("dialogue context projection override configuration", () => {
  it("accepts only an explicitly named projection", () => {
    assert.equal(parseDialogueContextProjectionOverride(undefined), null);
    assert.equal(parseDialogueContextProjectionOverride("compact"), "compact");
    assert.equal(parseDialogueContextProjectionOverride("legacy"), "legacy");
    assert.throws(
      () => parseDialogueContextProjectionOverride("current"),
      /DIALOGUE_CONTEXT_PROJECTION_OVERRIDE/,
    );
  });

  it("requires an immutable deployment identity exactly when override is active", () => {
    const commitSha = "a".repeat(40);
    const artifactRef = `example.invalid/kshiai/backend@sha256:${"b".repeat(64)}`;
    assert.deepEqual(parseDialogueContextProjectionOverrideDeployment({
      override: "compact",
      commitSha,
      artifactRef,
    }), { commitSha, artifactRef });
    assert.equal(parseDialogueContextProjectionOverrideDeployment({
      override: null,
      commitSha: undefined,
      artifactRef: undefined,
    }), null);
    assert.throws(
      () => parseDialogueContextProjectionOverrideDeployment({
        override: "compact",
        commitSha: undefined,
        artifactRef,
      }),
      /full commit SHA/,
    );
    assert.throws(
      () => parseDialogueContextProjectionOverrideDeployment({
        override: "compact",
        commitSha,
        artifactRef: "example.invalid/kshiai/backend:mutable",
      }),
      /digest-bound/,
    );
    assert.throws(
      () => parseDialogueContextProjectionOverrideDeployment({
        override: null,
        commitSha,
        artifactRef,
      }),
      /requires an override/,
    );
  });
});
