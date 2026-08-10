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
              anticipatedImpact: "相手の足運びを変えさせる",
              observedImpact: "前の問いでは相手の構えは変わらなかった",
              anticipatedSocialCost: "観察を重ねすぎれば相手に見切られる",
              observedSocialCost: "前の問いは構えを変える力を持たなかった",
              nextApproach: "観察を脅しではなく誘いとして使う",
              continuityPosture: "fraying",
              continuityDecision: "reframe",
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
            anticipatedImpact: "相手の返答を得る",
            observedImpact: "",
            anticipatedSocialCost: "問いだけでは相手の警戒を強める",
            observedSocialCost: "まだ前の言葉はない",
            nextApproach: "問いかける",
            continuityPosture: "opening",
            continuityDecision: "advance",
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
        contextProjectionMode: "legacy",
        recentExchangeLimit: 4,
        relevantMemoryLimit: 1,
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
      contextProjectionMode: "legacy",
      recentExchangeLimit: 4,
      relevantMemoryLimit: 1,
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
      anticipatedImpact: "相手の足運びを変えさせる",
      observedImpact: "前の問いでは相手の構えは変わらなかった",
      anticipatedSocialCost: "観察を重ねすぎれば相手に見切られる",
      observedSocialCost: "前の問いは構えを変える力を持たなかった",
      nextApproach: "観察を脅しではなく誘いとして使う",
      continuityPosture: "fraying",
      continuityDecision: "reframe",
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
    assert.match(system, /speechAppraisal\.nextApproach and continuityDecision are the committed character-authored approach/);
    assert.match(system, /observedImpact says the prior approach failed, stalled, or was ignored/);
    assert.match(system, /rather than merely restating the previous line/);
    assert.match(system, /continuityDecision=advance must develop the prior approach/);
    assert.equal(expression.speech, "水音の向こうで、足運びだけが答えを残した。");
  });

  it("requires compact psyche to carry a private appraisal into expression", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4-fast-non-reasoning",
      modelFast: "grok-4-fast-non-reasoning",
    });
    let system = "";
    const privateProvider = provider as unknown as {
      chatJson(system: string, user: string): Promise<unknown>;
    };
    privateProvider.chatJson = async (prompt) => {
      system = prompt;
      return {
        delta: {
          interior: {
            speechAppraisal: {
              anticipatedImpact: "相手に端末から手を離させる",
              observedImpact: "脅しは聞かれたが、相手の行動は変わらなかった",
              anticipatedSocialCost: "直接脅せば相手の反発を強める",
              observedSocialCost: "脅しの威力は相手の注意を動かさなかった",
              nextApproach: "端末そのものではなく相手の構えを崩す",
              continuityPosture: "fraying",
              continuityDecision: "reframe",
            },
          },
          dialogueThread: {
            topic: "端末を巡る対立",
            unresolvedMove: "相手は脅しを受け流している",
            anchoredExchange: null,
          },
        },
        expressionBrief: {
          sourceThread: "weave",
          continuityDecision: "reframe",
          focus: ["self_result", "counterpart_speech"],
          observedImpact: "脅しは相手の姿勢を変えなかった",
          relationshipMove: "端末への執着を退き、構えの隙を探る",
          publicAim: "相手の反応を別の角度から揺らす",
        },
      };
    };

    const compactInput = {
      contextMode: "compact",
      phase: "turn",
      character: {
        schemaVersion: 1,
        displayName: "ガク",
        identity: { realName: null, nicknames: [], selfNames: ["俺"], epithets: [], gender: null, age: null },
        tags: [],
        appearanceSummary: "大剣を持つ剣士",
        traits: ["頑固"],
        narrativeBlurb: "圧力で道を開く剣士。",
        basicAction: { name: "斬る", description: "大剣を振るう。" },
        skills: [],
        equipment: { weapon: null, armor: null },
      },
      previous: {
        privateMemory: "",
        currentGoal: "相手の構えを崩す",
        emotion: "苛立ち",
        beliefs: [],
        observations: [],
        speechStyle: "短く言い切る",
        selfReference: "俺",
        lastSpeech: "端末を置け。",
        lastActionResult: "斬撃は届かなかった。",
        conversationHistory: [],
        dialogueThread: { topic: "端末", unresolvedMove: "手放さない", anchoredExchange: null },
        interior: {
          primaryEmotion: "苛立ち",
          concealedEmotion: null,
          coreNeed: "主導権を渡さない",
          protectiveStance: "圧力を保つ",
          eventAppraisal: "届かなかった",
          unspokenIntent: "構えを崩す",
          currentConcern: "脅しが効いたか",
          attitudeTowardCounterpart: "押し返している",
          confidence: "steady",
          relationshipTension: "張りつめている",
          speechMode: "weave",
          speechAppraisal: {
            anticipatedImpact: "端末を置かせる",
            observedImpact: "変化がない",
            anticipatedSocialCost: "同じ要求は相手に見切られる",
            observedSocialCost: "要求の効力は薄れている",
            nextApproach: "構えを揺らす",
            continuityPosture: "fraying",
            continuityDecision: "advance",
          },
        },
      },
      turnObservation: {
        schemaVersion: 1,
        turn: 2,
        observerSide: "b",
        selfResult: [{ phenomenon: "斬撃は届かなかった", certainty: "certain", sourceEventIds: ["evt.1"] }],
        counterpartResult: [],
        ambientChange: [],
      },
      conversation: { recentExchange: [{ turn: 1, speaker: "self", text: "端末を置け。" }] },
      dialoguePipeline: {
        schemaVersion: 1,
        enabled: true,
        conversationHistoryLimit: 12,
        contextProjectionMode: "compact",
        recentExchangeLimit: 4,
        relevantMemoryLimit: 1,
        psychologyGuidance: "",
        revision: 1,
        updatedAt: "2026-08-10T00:00:00.000Z",
        updatedBy: null,
      },
    };
    const psyche = await provider.advanceCharacterPsyche(compactInput as never);

    assert.match(system, /anticipatedImpact is the intent of the already-spoken previous expression/);
    assert.match(system, /attention, credibility, or emotional force/);
    assert.match(system, /anticipatedSocialCost forecast this current expression/);
    assert.match(system, /Do not treat a familiar unresolved demand as development/);
    assert.deepEqual(psyche.delta?.interior?.speechAppraisal, {
      anticipatedImpact: "相手に端末から手を離させる",
      observedImpact: "脅しは聞かれたが、相手の行動は変わらなかった",
      anticipatedSocialCost: "直接脅せば相手の反発を強める",
      observedSocialCost: "脅しの威力は相手の注意を動かさなかった",
      nextApproach: "端末そのものではなく相手の構えを崩す",
      continuityPosture: "fraying",
      continuityDecision: "reframe",
    });

    privateProvider.chatJson = async (prompt) => {
      system = prompt;
      return { speech: "端末ではない。お前の足が止まる場所を見ている。" };
    };
    const expression = await provider.advanceCharacterAgent({
      ...compactInput,
      psyche: {
        emotion: compactInput.previous.emotion,
        speechStyle: compactInput.previous.speechStyle,
        interior: {
          ...compactInput.previous.interior,
          ...psyche.delta?.interior,
        },
        selfReference: "俺",
      },
      expressionBrief: psyche.expressionBrief!,
      relevantMemory: null,
    } as never);
    assert.match(system, /speechAppraisal privately assesses the prior expression's effect and social cost/);
    assert.match(system, /through expression rather than naming it/);
    assert.equal(expression.speech, "端末ではない。お前の足が止まる場所を見ている。");
  });
});
