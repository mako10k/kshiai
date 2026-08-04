import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalObserverPerception,
  buildNarrationPerceptionView,
  buildNarrationTurnView,
  buildSemanticObservationState,
  createBattleSemanticState,
} from "@kshiai/shared";
import { MockLlmProvider } from "./mock.js";

describe("mock LLM natural-language handling", () => {
  it("keeps self-reference in isolated character-agent continuity", async () => {
    const provider = new MockLlmProvider();
    const semanticState = createBattleSemanticState({
      scene: "闘技場",
      sideA: { displayName: "姫騎士" },
      sideB: { displayName: "挑戦者" },
    });
    const observation = buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "public",
    });
    const frameA = buildMinimalObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      legacyCounterpartIdentified: true,
    }).frame;
    const frameB = buildMinimalObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      legacyCounterpartIdentified: true,
    }).frame;
    const agentInput: Parameters<MockLlmProvider["advanceCharacterAgent"]>[0] = {
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
      perception: frameA,
      counterpart: {
        displayName: "挑戦者",
        condition: "strained",
      },
      decision: {
        nextTurn: 2,
        turnsRemaining: 19,
        availableActions: [
          { kind: "basic_attack", name: "基本攻撃" },
        ],
        finisher: null,
      },
    };
    const result = await provider.advanceCharacterAgent(agentInput);
    assert.equal(result.state.selfReference, "わたくし");
    assert.match(result.speech ?? "", /わたくし/);
    assert.deepEqual(result.nextAction, { kind: "basic_attack" });

    const finisherResult = await provider.advanceCharacterAgent({
      ...agentInput,
      perception: { ...agentInput.perception, turn: 19 },
      counterpart: { displayName: "挑戦者", condition: "critical" },
      decision: {
        nextTurn: 20,
        turnsRemaining: 1,
        availableActions: [
          { kind: "basic_attack", name: "基本攻撃" },
          {
            kind: "skill",
            skillId: "slash",
            name: "斬撃",
            skillKind: "attack",
            costMp: 0,
            costStamina: 5,
            finisherCandidate: true,
          },
        ],
        finisher: {
          skillId: "slash",
          skillName: "斬撃",
          source: "derived",
          unlocked: true,
          turnsUntilUnlock: 0,
          remainingUses: 1,
          currentMultiplier: 2,
          maxMultiplier: 2,
          criticalChance: 0.4,
          turnsUntilMax: 0,
        },
      },
    });
    assert.deepEqual(finisherResult.nextAction, {
      kind: "skill",
      skillId: "slash",
      useFinisher: true,
    });

    const perceptionView = buildNarrationPerceptionView({
      perspective: "external",
      focus: "external",
      sideALabel: "姫騎士",
      sideBLabel: "挑戦者",
      frameA,
      frameB,
      semanticState,
      publicObservation: observation,
    });
    const narration = await provider.narrateTurn({
      view: buildNarrationTurnView({
        turn: 1,
        scene: "闘技場",
        perspective: "external",
        focus: "external",
        sideALabel: "姫騎士",
        sideBLabel: "挑戦者",
        perception: perceptionView,
        semanticState,
        publicObservation: observation,
        frameA,
        frameB,
        events: [],
        actionBeats: [],
      }),
    });
    assert.ok(narration.narrator.length >= 2);
    assert.equal(
      narration.narrator.some((line) => /を起こす|を捉えた|を起こした/.test(line)),
      false,
    );
    // Last-resort mock may omit speeches rather than invent stock lines.
    assert.equal(Array.isArray(narration.speeches), true);

    const unknownFrameA = buildMinimalObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
    }).frame;
    const selfView = buildNarrationPerceptionView({
      perspective: "self",
      focus: "self",
      sideALabel: "姫騎士",
      sideBLabel: "挑戦者",
      frameA: unknownFrameA,
      frameB,
      semanticState,
      publicObservation: observation,
    });
    const subjective = await provider.narrateTurn({
      view: buildNarrationTurnView({
        turn: 1,
        scene: "闘技場",
        perspective: "self",
        focus: "self",
        sideALabel: "姫騎士",
        sideBLabel: "挑戦者",
        perception: selfView,
        semanticState,
        publicObservation: observation,
        frameA: unknownFrameA,
        frameB,
        events: [],
        actionBeats: [],
      }),
    });
    assert.equal(
      subjective.narrator.some((line) => /を起こす|を捉えた|を起こした/.test(line)),
      false,
    );
    assert.equal(
      subjective.speeches.some((line) => line.speaker === "挑戦者"),
      false,
    );
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

  it("does not reuse an owner-scoped reserved name", async () => {
    const provider = new MockLlmProvider();
    const generated = await provider.generateCharacter({
      prompt: "テストキャラ",
      reservedNames: ["テストキャラ"],
    });
    assert.equal(generated.sheet.displayName, "テストキャラ 2");
  });

  it("analyzes battles via tools and builds a concept-safe improvement prompt", async () => {
    const provider = new MockLlmProvider();
    const analysis = await provider.analyzeCharacterImprovement({
      character: {
        displayName: "アオイ",
        traits: ["慎重", "観察眼"],
        narrativeBlurb: "観察してから動く挑戦者。",
        skillNames: ["先手のひらめき"],
        basicAttackName: "自分らしい働きかけ",
        weaponName: null,
        armorName: null,
      },
      previousMemo: {
        strengths: [],
        improvements: [],
        summary: "",
        lastAnalyzedAt: null,
        lastAnalyzedBattleCount: 0,
        analysisCount: 0,
      },
      finishedBattles: 5,
      battleTools: {
        search: async () => [
          {
            battleId: "bat_1",
            result: "win",
            resultLabel: "アオイ の勝ち",
            opponentName: "カゲ",
            turn: 6,
            turnLimit: 20,
            battlefieldName: "練習場",
            scene: "練習場",
            finishReason: "incapacitated",
            updatedAt: "2026-08-02T00:00:00.000Z",
            skillMentions: ["先手のひらめき"],
            eventHighlights: ["T1: 先手"],
          },
        ],
        get: async () => null,
      },
    });
    assert.ok(analysis.strengths.length > 0);
    assert.ok(analysis.improvements.length > 0);

    const prompt = await provider.generateImprovementPrompt({
      character: {
        displayName: "アオイ",
        traits: ["慎重", "観察眼"],
        narrativeBlurb: "観察してから動く挑戦者。",
        skillNames: ["先手のひらめき"],
        basicAttackName: "自分らしい働きかけ",
        weaponName: null,
        armorName: null,
      },
      memo: {
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        summary: analysis.summary,
        lastAnalyzedAt: "2026-08-02T00:00:00.000Z",
        lastAnalyzedBattleCount: 5,
        analysisCount: 1,
      },
    });
    assert.match(prompt.prompt, /コンセプト|特徴/);
    assert.ok(prompt.prompt.length > 20);
  });

  it("returns three genre-neutral two-choice policy perspectives", async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateBattlePolicies({
      self: {
        displayName: "おしゃべりロボ",
        traits: ["ゆるい", "機械"],
        skillNames: ["なぞなぞ通信"],
        narrativeBlurb: "会話で相手の調子を崩すロボット。",
      },
      foe: null,
      field: { displayName: "宇宙カフェ", category: "custom" },
    });
    const groups = new Map<string, number>();
    for (const option of result.options) {
      groups.set(
        option.perspectiveId,
        (groups.get(option.perspectiveId) ?? 0) + 1,
      );
    }
    assert.equal(groups.size, 3);
    assert.deepEqual([...groups.values()], [2, 2, 2]);
    assert.doesNotMatch(
      result.options.map((option) => `${option.title}${option.then}`).join(""),
      /剣|斬|刃/,
    );
  });
});
