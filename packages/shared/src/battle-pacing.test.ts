import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_TWELVE_TURN_PACING_CANDIDATE,
  BattlePacingPolicySchema,
  currentBattlePacingPolicy,
} from "./battle-pacing.js";
import { measureBattlePacing } from "./battle-pacing-observe.js";

describe("battle pacing policy", () => {
  it("keeps all pacing thresholds in one validated snapshot", () => {
    assert.equal(BattlePacingPolicySchema.safeParse(currentBattlePacingPolicy(20)).success, true);
    assert.equal(BattlePacingPolicySchema.safeParse(LOCAL_TWELVE_TURN_PACING_CANDIDATE).success, true);
    assert.equal(LOCAL_TWELVE_TURN_PACING_CANDIDATE.turnLimit, 12);
  });

  it("produces reproducible local measurements without speech generation", () => {
    const input = {
      policy: LOCAL_TWELVE_TURN_PACING_CANDIDATE,
      sampleSize: 12,
      seed: 98,
    };
    const first = measureBattlePacing(input);
    const second = measureBattlePacing(input);
    assert.deepEqual(first, second);
    assert.equal(first.repeatedSpeech.status, "not_measured");
    assert.equal(first.delayedEffectResolutionRate, 1);
  });
});
