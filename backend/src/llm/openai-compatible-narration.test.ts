import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

describe("OpenAI-compatible narrator speech rendering", () => {
  it("hides canonical speaker names, accepts free labels, and keeps scene speech", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4-fast-non-reasoning",
      modelFast: "grok-4-fast-non-reasoning",
    });
    let observedSystem = "";
    let observedUser = "";
    let callCount = 0;
    const privateProvider = provider as unknown as {
      chatJson(system: string, user: string): Promise<unknown>;
    };
    privateProvider.chatJson = async (system, user) => {
      callCount += 1;
      observedSystem = system;
      observedUser = user;
      return {
        narrator: ["白い姿が振り向く。"],
        speeches: [{
          sourceSide: "a",
          speaker: "白狼の姿をした声の主",
          text: "まだ終わらない。",
          afterNarratorLine: 0,
        }, {
          sourceSide: null,
          speaker: "観客席の審判",
          text: "続行だ。",
          afterNarratorLine: 0,
        }, {
          speaker: "出力契約を満たさない声",
          text: "これは表示しない。",
          afterNarratorLine: 0,
        }],
        recognitionUpdates: [{
          subjectRef: "opponent",
          recognizedAs: "白狼",
          identityKnowledge: "suspected",
          continuity: "possibly_same_entity",
        }],
      };
    };

    const result = await provider.narratePrologue({
      scene: "観客席のある闘技場",
      sideAName: "白い挑戦者",
      sideBName: "黒い挑戦者",
      profileAnchors: {},
      recognitionSubjects: [{
        subjectRef: "opponent",
        perceivedAs: "白狼の姿",
        relation: "opponent",
        identityKnowledge: "suspected",
        continuity: "possibly_same_entity",
      }],
      characterSpeeches: [{
        side: "a",
        speaker: "SERVER_CANONICAL_SECRET",
        text: "まだ終わらない。",
        displayLabel: "白い挑戦者かもしれない声",
        displayContext: {
          mode: "self",
          perceivedAs: "白狼の姿",
          utterancePerceivedAs: "対峙する相手らしい声",
          currentAccess: "clear",
          identityKnowledge: "suspected",
          attributionCertainty: "probable",
          apparentIdentity: {
            form: "白狼の姿",
            identity: null,
            confidence: "probable",
            continuity: "unlinked",
          },
        },
      }],
    });

    assert.doesNotMatch(observedUser, /SERVER_CANONICAL_SECRET/);
    assert.match(observedUser, /白狼の姿/);
    assert.doesNotMatch(observedSystem, /allowedDisplayLabels|exact value/);
    assert.match(observedSystem, /same narration response/);
    assert.equal(callCount, 1);
    assert.deepEqual(result.speeches, [{
      sourceSide: "a",
      speaker: "白狼の姿をした声の主",
      text: "まだ終わらない。",
      afterNarratorLine: 0,
    }, {
      speaker: "観客席の審判",
      text: "続行だ。",
      afterNarratorLine: 0,
    }]);
    assert.deepEqual(result.recognitionUpdates, [{
      subjectRef: "opponent",
      recognizedAs: "白狼",
      identityKnowledge: "suspected",
      continuity: "possibly_same_entity",
    }]);
  });
});
