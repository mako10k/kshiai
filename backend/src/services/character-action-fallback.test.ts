import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CharacterActionIntentSchema } from "@kshiai/shared";
import { buildDeterministicActionFallback } from "./character-action-fallback.js";

type Decision = Parameters<typeof buildDeterministicActionFallback>[0];
const freeCapability = {
  kind: "free_action" as const, name: "自由行動",
  target: { kind: "self" as const, perceivedAs: "自分" },
};

describe("complete deterministic action fallback", () => {
  it("does not synthesize a free attempt from a capability or borrow capability prose", () => {
    assert.equal(buildDeterministicActionFallback({ availableActions: [freeCapability] }), null);
    assert.deepEqual(buildDeterministicActionFallback({ availableActions: [
      { ...freeCapability, description: "知覚している場面へ働きかける" },
      { kind: "wait", name: "待機", target: freeCapability.target },
    ] }), { kind: "wait" });
  });

  it("does not invent reflection content when only the reflect capability is available", () => {
    assert.equal(buildDeterministicActionFallback({ availableActions: [{
      kind: "reflect", name: "省察", target: freeCapability.target,
    }] }), null);
  });

  it("preserves attack and spacing preferences without spending finishers", () => {
    const actions: Decision["availableActions"] = [
      freeCapability,
      { kind: "skill", skillId: "strike", name: "技", finisherCandidate: true, target: freeCapability.target },
      { kind: "basic_attack", name: "通常攻撃", target: freeCapability.target },
      { kind: "reposition", name: "移動", target: freeCapability.target },
    ];
    assert.deepEqual(buildDeterministicActionFallback({ availableActions: actions }), { kind: "basic_attack" });
    assert.deepEqual(buildDeterministicActionFallback({
      availableActions: actions,
      actionFeedback: {
        lastRequested: { kind: "basic_attack" }, lastOutcome: "failed", lastReason: "out_of_range",
        observerSafeCause: "遠い", spacing: { perceivedDistance: "far", relation: "too_far", correction: "close" },
      },
    }), { kind: "reposition" });
    assert.deepEqual(buildDeterministicActionFallback({ availableActions: [actions[1]!] }), {
      kind: "skill", skillId: "strike",
    });
    const skill = buildDeterministicActionFallback({ availableActions: [actions[1]!] });
    assert.equal(CharacterActionIntentSchema.safeParse(skill).success, true);
    assert.equal(buildDeterministicActionFallback({ availableActions: [] }), null);
  });
});
