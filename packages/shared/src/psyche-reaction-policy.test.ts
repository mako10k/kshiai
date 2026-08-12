import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advancePsycheReactionV1,
  initialPsycheReactionStateV1,
  NEUTRAL_PSYCHE_TRAITS_V1,
} from "./psyche-reaction-policy.js";

describe("deterministic psyche reaction policy V1", () => {
  it("is deterministic and uses only structured certainty and source IDs", () => {
    const packet = {
      schemaVersion: 1 as const,
      turn: 3,
      observerSide: "b" as const,
      selfResult: [{
        phenomenon: "arbitrary prose must not be classified",
        certainty: "unknown" as const,
        sourceEventIds: ["evt-2", "evt-1"],
      }],
      counterpartResult: [],
      ambientChange: [],
    };
    const first = advancePsycheReactionV1({ packet });
    const second = advancePsycheReactionV1({
      packet: {
        ...packet,
        selfResult: [{ ...packet.selfResult[0]!, phenomenon: "completely different prose" }],
      },
    });

    assert.deepEqual(first.state, second.state);
    assert.deepEqual(first.receipt.sourceEventIds, ["evt-1", "evt-2"]);
    assert.equal(first.receipt.route, "deterministic_no_call");
    assert.equal(first.receipt.observerSide, "b");
    assert.ok(first.state.interpretation.uncertain > 0);
  });

  it("decays without inventing a new reaction when features are unavailable", () => {
    const prior = initialPsycheReactionStateV1();
    prior.emotion.anxiety = 800;
    prior.interpretation.uncertain = 600;
    prior.impulse.withdraw = 500;
    prior.arousal = 700;

    const result = advancePsycheReactionV1({ prior, packet: null });

    assert.equal(result.receipt.reason, "feature_unavailable_hold");
    assert.equal(result.receipt.sourceEventIds.length, 0);
    assert.ok(result.state.emotion.anxiety < prior.emotion.anxiety);
    assert.ok(result.state.interpretation.uncertain < prior.interpretation.uncertain);
    assert.ok(result.state.arousal < prior.arousal);
  });

  it("keeps impulse separate from action and applies inhibition monotonically", () => {
    const packet = {
      schemaVersion: 1 as const,
      turn: 1,
      observerSide: "a" as const,
      selfResult: [{ phenomenon: "x", certainty: "unknown" as const, sourceEventIds: ["e"] }],
      counterpartResult: [],
      ambientChange: [],
    };
    const lowInhibition = advancePsycheReactionV1({
      packet,
      traits: { ...NEUTRAL_PSYCHE_TRAITS_V1, impulseInhibition: 0, withdrawalTendency: 1000 },
    });
    const highInhibition = advancePsycheReactionV1({
      packet,
      traits: { ...NEUTRAL_PSYCHE_TRAITS_V1, impulseInhibition: 1000, withdrawalTendency: 1000 },
    });

    assert.ok(lowInhibition.state.impulse.withdraw > highInhibition.state.impulse.withdraw);
    assert.equal(highInhibition.state.impulse.withdraw, 0);
    assert.equal("action" in highInhibition.actionProjection, false);
  });
});
