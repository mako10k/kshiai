import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBattlePacingPolicy,
  parseCharacterFocusShadowMode,
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
