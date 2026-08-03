import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockLlmProvider } from "./mock.js";

describe("mock LLM natural-language handling", () => {
  it("keeps self-reference in isolated character-agent continuity", async () => {
    const provider = new MockLlmProvider();
    const result = await provider.advanceCharacterAgent({
      character: {
        displayName: "姫騎士",
        identity: {
          realName: null,
          nicknames: [],
          selfNames: ["わたくし"],
          epithets: [],
          gender: null,
          age: null,
        },
        traits: ["誇り高い"],
        narrativeBlurb: "礼節を重んじる騎士。",
        skillNames: ["斬撃"],
      },
      foeName: "挑戦者",
      previous: {
        privateMemory: "",
        currentGoal: "",
        emotion: "平静",
        beliefs: [],
        observations: [],
        speechStyle: "丁寧に話す",
        selfReference: "わたくし",
        lastSpeech: null,
      },
      cognition: {
        turn: 1,
        scene: "闘技場",
        ownCondition: "steady",
        foeCondition: "strained",
        parameterChanges: {},
        observedEvents: [],
      },
    });
    assert.equal(result.state.selfReference, "わたくし");
    assert.match(result.speech ?? "", /わたくし/);

    const narration = await provider.narrateTurn({
      turn: 1,
      scene: "闘技場",
      sideAName: "姫騎士",
      sideBName: "挑戦者",
      events: [],
      agentSpeeches: [{ speaker: "姫騎士", text: result.speech ?? "" }],
    });
    assert.deepEqual(narration.speeches, [
      { speaker: "姫騎士", text: result.speech ?? "" },
    ]);
  });

  it("does not change structured combat fields from keyword matches", async () => {
    const provider = new MockLlmProvider();
    const generated = await provider.generateCharacter({ prompt: "テストキャラ" });
    assert.notEqual(
      generated.sheet.appearance.summary,
      generated.sheet.narrativeBlurb,
    );
    assert.equal(generated.sheet.narrativeBlurb.includes("外見詳細"), false);
    const now = "2026-08-02T00:00:00.000Z";
    const current = {
      ...generated.sheet,
      id: "char-test",
      ownerUserId: "user-test",
      createdAt: now,
      updatedAt: now,
    };
    const adjusted = await provider.adjustCharacter(
      current,
      "防御を最強にして夜と雨にも強くする",
    );
    assert.equal(adjusted.sheetPatch.parameters, undefined);
    assert.equal(adjusted.sheetPatch.traits, undefined);
    assert.equal(adjusted.sheetPatch.displayName, undefined);
  });
});
