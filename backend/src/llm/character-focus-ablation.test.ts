import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHARACTER_FOCUS_ABLATION_INPUT_REVISION,
  CHARACTER_FOCUS_ABLATION_SCENARIOS,
  buildCharacterFocusAblationRequests,
  characterFocusAblationProtocolMaterial,
  characterFocusAblationReviewContext,
} from "./character-focus-ablation.js";
import { CHARACTER_EXPRESSION_COMPACT_SYSTEM_PROMPT } from "./character-expression-prompt.js";

describe("character-focus expression ablation protocol", () => {
  it("freezes 144 randomized calls with balanced arms and samples", () => {
    const requests = buildCharacterFocusAblationRequests();
    assert.equal(requests.length, 144);
    assert.equal(new Set(requests.map((item) => item.outputId)).size, 144);
    assert.deepEqual(
      [...new Set(requests.map((item) => item.outputId))].sort().slice(0, 2),
      ["R001", "R002"],
    );
    for (const arm of ["A", "B", "C", "D"] as const) {
      assert.equal(requests.filter((item) => item.arm === arm).length, 36);
    }
    for (const scenario of CHARACTER_FOCUS_ABLATION_SCENARIOS) {
      for (const arm of ["A", "B", "C", "D"] as const) {
        const samples = requests
          .filter((item) => item.scenarioCode === scenario.scenarioCode && item.arm === arm)
          .map((item) => item.sample)
          .sort();
        assert.deepEqual(samples, [1, 2, 3], `${scenario.scenarioCode}:${arm}`);
      }
    }
  });

  it("keeps control exact and places ID-free focus last only in treatment inputs", () => {
    const requests = buildCharacterFocusAblationRequests();
    for (const request of requests) {
      const user = JSON.parse(request.user) as Record<string, unknown>;
      if (request.arm === "A") {
        assert.equal(request.system, CHARACTER_EXPRESSION_COMPACT_SYSTEM_PROMPT);
        assert.equal("characterFocus" in user, false);
        assert.equal(request.focusPacket, null);
      } else {
        assert.equal(Object.keys(user).at(-1), "characterFocus");
        assert.deepEqual(user.characterFocus, request.focusPacket);
        assert.equal(JSON.stringify(request.focusPacket).includes("focus.a."), false);
        assert.equal(JSON.stringify(request.focusPacket).includes("event."), false);
      }
    }
  });

  it("isolates foregrounding, state persistence, and focus-band modulation", () => {
    const requests = buildCharacterFocusAblationRequests();
    const one = (fixtureId: string, arm: "B" | "C" | "D") =>
      requests.find((item) =>
        item.fixtureId === fixtureId && item.arm === arm && item.sample === 1
      )!;

    assert.equal(one("no-new-evidence", "B").focusPacket?.primary, null);
    assert.equal(
      one("no-new-evidence", "C").focusPacket?.primary?.kind,
      "counterpart_result",
    );
    assert.equal(
      one("subtle-counterpart-gesture", "C").focusPacket?.primary?.kind,
      "counterpart_result",
    );
    assert.equal(one("subtle-counterpart-gesture", "D").focusPacket?.primary, null);
    assert.equal(one("ambient-microchange", "C").focusPacket?.primary, null);
    assert.equal(
      one("ambient-microchange", "D").focusPacket?.primary?.kind,
      "ambient_change",
    );
  });

  it("does not reveal the arm in the blinded review context", () => {
    const context = characterFocusAblationReviewContext("R001");
    assert.equal("arm" in context, false);
    assert.equal("replayEffectiveness" in context, false);
    assert.match(context.outputId, /^R\d{3}$/);
    assert.ok(context.forbiddenEvidence.length >= 3);
  });

  it("exports one serializable immutable protocol material", () => {
    const material = characterFocusAblationProtocolMaterial() as {
      inputRevision: string;
      requests: unknown[];
    };
    assert.equal(material.inputRevision, CHARACTER_FOCUS_ABLATION_INPUT_REVISION);
    assert.equal(material.requests.length, 144);
    assert.doesNotThrow(() => JSON.stringify(material));
  });
});
