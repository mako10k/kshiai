import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  NarrationCausalProjection,
  NarrationTurnView,
} from "@kshiai/shared";
import { NARRATION_PRESENTATION_FOCUS_MODE_V1 } from "@kshiai/shared";
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

    await provider.narrateTurn({
      view,
      structuredCharacterContexts: {
        a: {
          staticProjection: {
            contractVersion: 2,
            access: "external",
            appearance: ["白い外套"],
            innerBackground: [],
            innerDisposition: [],
            observablePatterns: [],
            behaviorPrinciples: [],
          },
          narrativeCues: [{
            access: "external_observable",
            description: "一瞬だけ眉が揺れる。",
            sourceEventIds: ["event.manifestation.1.a.1"],
          }],
        },
      },
    });
    await provider.narrateTurn({
      view: { ...view, causalProjection },
    });
    await provider.narrateTurn({
      view: {
        ...view,
        causalProjection: {
          ...causalProjection,
          causalChains: [{
            ...causalProjection.causalChains[0]!,
            resolution: {
              status: "known",
              outcome: "failed",
              reason: "actor_unavailable",
            },
          }],
        },
      },
      presentationFocusMode: NARRATION_PRESENTATION_FOCUS_MODE_V1,
    });

    assert.equal(systems.length, 3);
    assert.match(
      systems[0]!,
      /consequence grounded in those events\.\nDo not invent/,
    );
    assert.doesNotMatch(systems[0]!, /authoritative cause-to-result supplement/);
    assert.doesNotMatch(users[0]!, /causalProjection/);
    assert.match(users[0]!, /"brief"/);
    assert.match(users[0]!, /"turnResult"/);
    assert.match(users[0]!, /"canonicalChange"/);
    assert.match(users[0]!, /structuredCharacterContexts/);
    assert.match(users[0]!, /一瞬だけ眉が揺れる/);
    assert.match(systems[0]!, /Never infer omitted fields, raw dynamics/);
    assert.match(systems[1]!, /structured causality/);
    assert.match(
      systems[1]!,
      /never connect them to an action by guesswork\.\nDo not invent/,
    );
    assert.doesNotMatch(users[1]!, /causalProjection/);
    assert.match(users[1]!, /"causality"/);
    assert.match(users[1]!, /participantConditions/);
    assert.doesNotMatch(users[1]!, /重複させない結果文/);
    assert.doesNotMatch(systems[1]!, /audience-facing emphasis/);
    assert.doesNotMatch(users[1]!, /presentationFocus/);
    assert.match(systems[2]!, /single primary result legible/);
    assert.match(users[2]!, /"presentationFocus"/);
    assert.match(users[2]!, /"source":"action_resolution"/);
    assert.match(users[2]!, /行動者が現在行動できない状態だった/);
  });
});

describe("OpenAI-compatible judgment presentation input", () => {
  it("admits the public projection but not raw adjudication prose", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4.3",
      modelFast: "grok-4.3",
    });
    let observedSystem = "";
    let observedUser = "";
    const privateProvider = provider as unknown as {
      chatJson(system: string, user: string): Promise<unknown>;
    };
    privateProvider.chatJson = async (system, user) => {
      observedSystem = system;
      observedUser = user;
      return { before: ["宣告の時が来る。"], after: ["余韻が残る。"] };
    };

    const result = await provider.narrateJudgment({
      turn: 20,
      scene: "雨の浮橋",
      sideAName: "アオ",
      sideBName: "クロ",
      winnerSide: "a",
      winnerName: "アオ",
      presentationProjection: {
        schemaVersion: 1,
        verdictKind: "win",
        winnerLabel: "アオ",
        basisLines: ["アオは場の流れをより強く動かした。"],
      },
      recentPublicNarration: [],
      ...({ adjudicationReason: "INTERNAL_REASON_MUST_NOT_LEAK" } as Record<string, string>),
    });

    assert.match(observedSystem, /audience-safe projection/);
    assert.match(observedSystem, /Never expose JSON keys, scoring criteria/);
    assert.match(observedUser, /アオは場の流れをより強く動かした/);
    assert.doesNotMatch(observedUser, /INTERNAL_REASON_MUST_NOT_LEAK/);
    assert.doesNotMatch(observedUser, /reasonFacts|engineFallbackSide|inputTurnRange/);
    assert.deepEqual(result, {
      before: ["宣告の時が来る。"],
      after: ["余韻が残る。"],
    });
  });
});
