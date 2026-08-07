import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  NarrationCausalProjection,
  NarrationTurnView,
} from "@kshiai/shared";
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

describe("OpenAI-compatible causal narration input", () => {
  it("sends a role-labelled brief and adds causal facts only with a projection", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4-fast-non-reasoning",
      modelFast: "grok-4-fast-non-reasoning",
    });
    const systems: string[] = [];
    const users: string[] = [];
    const privateProvider = provider as unknown as {
      chatJson(system: string, user: string): Promise<unknown>;
    };
    privateProvider.chatJson = async (system, user) => {
      systems.push(system);
      users.push(user);
      return { narrator: ["確定した一手が次の攻防へ残る。"], speeches: [] };
    };
    const view: NarrationTurnView = {
      schemaVersion: 1,
      turn: 1,
      scene: "雨の路地",
      perception: {
        schemaVersion: 1,
        mode: "external",
        viewpointSide: null,
        resolvedFromFluid: false,
        references: [],
      },
      participantLabels: { a: "アオ", b: "クロ" },
      profileAnchors: {},
      sceneStateFacts: [],
      continuity: null,
      recognitionSubjects: [],
      events: [],
      actionBeats: [{
        actorLabel: "アオ",
        actionName: "短い打撃",
        description: "間合いへ踏み込む",
        outcomes: ["重複させない結果文"],
      }],
      canonicalChange: {
        semantic: { status: "applied", changed: false },
        world: { status: "applied", changed: false, operationKinds: [] },
      },
      battlefield: null,
    };
    const causalProjection: NarrationCausalProjection = {
      schemaVersion: 1,
      turn: 1,
      causalChains: [{
        actorLabel: "アオ",
        requestedKind: "basic_attack",
        effectiveKind: "basic_attack",
        executed: true,
        skippedReason: null,
        resolution: { status: "known", outcome: "accepted", reason: null },
        events: [],
        mechanicalConsequences: [],
        semanticChangeKinds: [],
      }],
      observedConsequences: [],
      observedSemanticChangeKinds: [],
      continuingConditions: [{
        participantLabel: "クロ",
        canFight: true,
        defending: false,
        reserveCues: [{
          parameterKey: "hp",
          absoluteBand: "taxed",
          relativeBand: "low",
        }],
      }],
    };

    await provider.narrateTurn({ view });
    await provider.narrateTurn({
      view: { ...view, causalProjection },
    });

    assert.equal(systems.length, 2);
    assert.match(
      systems[0]!,
      /consequence grounded in those events\.\nDo not invent/,
    );
    assert.doesNotMatch(systems[0]!, /authoritative cause-to-result supplement/);
    assert.doesNotMatch(users[0]!, /causalProjection/);
    assert.match(users[0]!, /"brief"/);
    assert.match(users[0]!, /"turnResult"/);
    assert.match(users[0]!, /"canonicalChange"/);
    assert.match(systems[1]!, /structured causality/);
    assert.match(
      systems[1]!,
      /never connect them to an action by guesswork\.\nDo not invent/,
    );
    assert.doesNotMatch(users[1]!, /causalProjection/);
    assert.match(users[1]!, /"causality"/);
    assert.match(users[1]!, /participantConditions/);
    assert.doesNotMatch(users[1]!, /重複させない結果文/);
  });
});
