import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalObserverPerception,
  createBattleSemanticState,
} from "@kshiai/shared";
import {
  CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
  OpenAiCompatibleProvider,
} from "./openai-compatible.js";

describe("character-agent action proposal prompt", () => {
  it("defines mutually exclusive action-kind output shapes", () => {
    for (const kind of [
      "skill",
      "basic_attack",
      "defend",
      "rest",
      "wait",
      "free_action",
    ]) {
      assert.match(
        CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
        new RegExp(`- ${kind}:`),
      );
    }
    assert.match(
      CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
      /description, desiredOutcome, subjectRefs, and opportunityId are free_action-only/,
    );
    assert.match(
      CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
      /useFinisher and skillId are skill-only/,
    );
    assert.match(
      CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
      /instrumentRef is allowed only for skill, basic_attack, or defend/,
    );
  });

  it("receives administrator dialogue psychology as runtime pipeline context", async () => {
    const semanticState = createBattleSemanticState({
      scene: "雨の路地",
      sideA: { displayName: "ナギ" },
      sideB: { displayName: "ガク" },
    });
    const perception = buildMinimalObserverPerception({
      observerSide: "a",
      turn: 2,
      semanticState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      legacyCounterpartIdentified: true,
    }).frame;
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4-fast-non-reasoning",
      modelFast: "grok-4-fast-non-reasoning",
    });
    let system = "";
    let user = "";
    const privateProvider = provider as unknown as {
      chatJson(system: string, user: string): Promise<unknown>;
    };
    privateProvider.chatJson = async (prompt, request) => {
      system = prompt;
      user = request;
      return {
          privateMemory: "前の問いに返答はなかった。",
          currentGoal: "相手の構えを崩す",
          emotion: "集中",
          beliefs: [],
          observations: ["相手は剣を下げない"],
          speechStyle: "観察を交えて短く話す",
          interior: {
            primaryEmotion: "集中",
            concealedEmotion: null,
            coreNeed: "答えを確かめる",
            protectiveStance: "問いを重ねる",
            eventAppraisal: "足元の水が距離を知らせた",
            unspokenIntent: "別の反応を引き出す",
            currentConcern: "言葉が届いたか",
            attitudeTowardCounterpart: "試している",
            confidence: "steady",
            relationshipTension: "張りつめている",
            speechMode: "weave",
            speechAppraisal: {
              expectedImpact: "相手の足運びを変えさせる",
              observedImpact: "前の問いでは相手の構えは変わらなかった",
              nextApproach: "観察を脅しではなく誘いとして使う",
            },
          },
      };
    };

    const result = await provider.advanceCharacterPsyche({
      phase: "turn",
      character: {
        schemaVersion: 1,
        displayName: "ナギ",
        identity: {
          realName: null,
          nicknames: [],
          selfNames: ["私"],
          epithets: [],
          gender: null,
          age: null,
        },
        tags: [],
        appearanceSummary: "濡れた外套の観測者",
        traits: ["粘り強い", "観察好き"],
        narrativeBlurb: "相手の反応から答えを探す観測者。",
        basicAction: { name: "杖で払う", description: "水を払って距離を測る。" },
        skills: [],
        equipment: { weapon: null, armor: null },
      },
      previous: {
        privateMemory: "",
        currentGoal: "様子を見る",
        emotion: "平静",
        beliefs: [],
        observations: [],
        speechStyle: "観察を交えて短く話す",
        selfReference: "私",
        lastSpeech: "前の問い",
        interior: {
          primaryEmotion: "平静",
          concealedEmotion: null,
          coreNeed: "答えを確かめる",
          protectiveStance: "問いを重ねる",
          eventAppraisal: "",
          unspokenIntent: "様子を見る",
          currentConcern: "相手の反応",
          attitudeTowardCounterpart: "対峙している",
          confidence: "steady",
          relationshipTension: "",
          speechMode: "conversation_continuation",
          speechAppraisal: {
            expectedImpact: "相手の返答を得る",
            observedImpact: "",
            nextApproach: "問いかける",
          },
        },
      },
      actionReaction: {
        schemaVersion: 1,
        turn: 2,
        latestCommittedResult: "足元の水が跳ね、相手は距離を保った。",
      },
      conversation: {
        schemaVersion: 1,
        history: [{ turn: 1, speaker: "counterpart", text: "答えろ。" }],
      },
      dialoguePipeline: {
        schemaVersion: 1,
        enabled: true,
        conversationHistoryLimit: 16,
        psychologyGuidance: "言葉の手応えを自分の気持ちとして受け止める。",
        revision: 4,
        updatedAt: "2026-08-09T00:00:00.000Z",
        updatedBy: "operator",
      },
      perception,
      counterpart: { displayName: "ガク" },
    });

    assert.match(system, /deep-psyche stage/);
    assert.match(system, /separate bounded relationship-continuity thread/);
    assert.match(system, /trusted administrator-authored context/);
    const pipeline = JSON.parse(user).dialoguePipeline;
    assert.deepEqual(pipeline, {
      schemaVersion: 1,
      enabled: true,
      conversationHistoryLimit: 16,
      psychologyGuidance: "言葉の手応えを自分の気持ちとして受け止める。",
      revision: 4,
      updatedAt: "2026-08-09T00:00:00.000Z",
      updatedBy: "operator",
    });
    const input = JSON.parse(user);
    assert.deepEqual(input.actionReaction, {
      schemaVersion: 1,
      turn: 2,
      latestCommittedResult: "足元の水が跳ね、相手は距離を保った。",
    });
    assert.deepEqual(input.conversation, {
      schemaVersion: 1,
      history: [{ turn: 1, speaker: "counterpart", text: "答えろ。" }],
    });
    assert.deepEqual(result.interior.speechAppraisal, {
      expectedImpact: "相手の足運びを変えさせる",
      observedImpact: "前の問いでは相手の構えは変わらなかった",
      nextApproach: "観察を脅しではなく誘いとして使う",
    });
    assert.equal(result.interior.speechMode, "weave");

    privateProvider.chatJson = async (prompt, request) => {
      system = prompt;
      user = request;
      return {
        speech: "水音の向こうで、足運びだけが答えを残した。",
      };
    };
    const expression = await provider.advanceCharacterAgent({
      phase: "turn",
      character: JSON.parse(user).character,
      psyche: {
        ...JSON.parse(user).previous,
        ...result,
        interior: result.interior,
      },
      actionReaction: {
        schemaVersion: 1,
        turn: 2,
        latestCommittedResult: "足元の水が跳ね、相手は距離を保った。",
      },
      conversation: {
        schemaVersion: 1,
        history: [{ turn: 1, speaker: "counterpart", text: "答えろ。" }],
      },
      perception,
      counterpart: { displayName: "ガク" },
    });

    assert.match(system, /expression stage, not a second private deliberation/);
    assert.match(system, /speechAppraisal\.nextApproach is the committed character-authored approach/);
    assert.match(system, /observedImpact says the prior approach failed, stalled, or was ignored/);
    assert.match(system, /rather than merely restating the previous line/);
    assert.equal(expression.speech, "水音の向こうで、足運びだけが答えを残した。");
  });
});
