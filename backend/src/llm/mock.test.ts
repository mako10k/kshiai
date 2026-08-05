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
      phase: "turn",
      character: {
        schemaVersion: 1,
        displayName: "姫騎士",
        identity: {
          realName: null,
          nicknames: [],
          selfNames: ["わたくし"],
          epithets: [],
          gender: "女性",
          age: null,
        },
        tags: [],
        appearanceSummary: "礼装をまとった騎士",
        traits: ["誇り高い"],
        narrativeBlurb: "礼節を重んじる騎士。",
        basicAction: { name: "基本攻撃", description: "踏み込んで攻める。" },
        skills: [{ name: "斬撃", description: "鋭く切り込む。" }],
        equipment: { weapon: null, armor: null },
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
          {
            kind: "basic_attack",
            name: "基本攻撃",
            target: { kind: "counterpart", perceivedAs: "挑戦者" },
          },
        ],
        finisher: null,
      },
    };
    const result = await provider.advanceCharacterAgent(agentInput);
    assert.equal(result.state.selfReference, "わたくし");
    assert.match(result.speech ?? "", /わたくし/);
    assert.deepEqual(result.nextAction, { kind: "basic_attack" });

    const humane = await provider.advanceCharacterAgent({
      ...agentInput,
      decision: {
        ...agentInput.decision!,
        availableActions: [
          ...agentInput.decision!.availableActions,
          {
            kind: "defend",
            name: "防御",
            target: { kind: "self", perceivedAs: "自分" },
          },
        ],
        decisionProfile: {
          defaultObjective: {
            id: "victory",
            statement: "この対戦に勝つ",
            priority: 70,
          },
          principles: [{
            id: "compassion",
            statement: "勝負より人情を優先し、相手を傷つけない",
            priority: 95,
            force: "commitment",
          }],
        },
      },
    });
    assert.deepEqual(humane.nextAction, { kind: "defend" });
    assert.equal(
      humane.state.currentGoal,
      "勝負より人情を優先し、相手を傷つけない",
    );

    const corrected = await provider.advanceCharacterAgent({
      ...agentInput,
      previous: { ...agentInput.previous, selfReference: "俺" },
    });
    assert.equal(corrected.state.selfReference, "わたくし");
    assert.match(corrected.speech, /わたくし/);

    const unknownSelfName = await provider.advanceCharacterAgent({
      ...agentInput,
      character: {
        ...agentInput.character,
        identity: {
          ...agentInput.character.identity,
          selfNames: [],
          gender: null,
        },
      },
      previous: { ...agentInput.previous, selfReference: "私" },
    });
    assert.equal(unknownSelfName.state.selfReference, null);
    assert.doesNotMatch(unknownSelfName.speech, /私|俺|僕|わたくし/);

    const finisherResult = await provider.advanceCharacterAgent({
      ...agentInput,
      perception: { ...agentInput.perception, turn: 19 },
      counterpart: { displayName: "挑戦者", condition: "critical" },
      decision: {
        nextTurn: 20,
        turnsRemaining: 1,
        availableActions: [
          {
            kind: "basic_attack",
            name: "基本攻撃",
            target: { kind: "counterpart", perceivedAs: "挑戦者" },
          },
          {
            kind: "skill",
            skillId: "slash",
            name: "斬撃",
            skillKind: "attack",
            costMp: 0,
            costStamina: 5,
            finisherCandidate: true,
            target: { kind: "counterpart", perceivedAs: "挑戦者" },
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
        profileAnchorA: {
          schemaVersion: 1,
          side: "a",
          displayName: "姫騎士",
          selfNames: ["わたくし"],
          gender: null,
          age: null,
          appearanceSummary: "礼装をまとった騎士",
        },
        profileAnchorB: {
          schemaVersion: 1,
          side: "b",
          displayName: "挑戦者",
          selfNames: [],
          gender: null,
          age: null,
          appearanceSummary: "挑戦者の姿",
        },
        perception: perceptionView,
        semanticState,
        publicObservation: observation,
        frameA,
        frameB,
        events: [],
        actionBeats: [],
      }),
      characterSpeeches: [
        { side: "a", speaker: "姫騎士", text: result.speech },
        { side: "b", speaker: "挑戦者", text: "まだ終わらない。" },
      ],
    });
    assert.ok(narration.narrator.length >= 2);
    assert.equal(
      narration.narrator.some((line) => /を起こす|を捉えた|を起こした/.test(line)),
      false,
    );
    assert.deepEqual(
      narration.speeches.map(({ speaker, text, sourceSide }) => ({
        speaker,
        text,
        sourceSide,
      })),
      [
        { speaker: "姫騎士", text: result.speech, sourceSide: "a" },
        { speaker: "挑戦者", text: "まだ終わらない。", sourceSide: "b" },
      ],
    );

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
        profileAnchorA: {
          schemaVersion: 1,
          side: "a",
          displayName: "姫騎士",
          selfNames: ["わたくし"],
          gender: null,
          age: null,
          appearanceSummary: "礼装をまとった騎士",
        },
        profileAnchorB: {
          schemaVersion: 1,
          side: "b",
          displayName: "挑戦者",
          selfNames: [],
          gender: null,
          age: null,
          appearanceSummary: "挑戦者の姿",
        },
        perception: selfView,
        semanticState,
        publicObservation: observation,
        frameA: unknownFrameA,
        frameB,
        events: [],
        actionBeats: [],
      }),
      characterSpeeches: [
        { side: "a", speaker: "姫騎士", text: result.speech },
      ],
    });
    assert.equal(
      subjective.narrator.some((line) => /を起こす|を捉えた|を起こした/.test(line)),
      false,
    );
    assert.equal(
      subjective.speeches.some((line) => line.speaker === "挑戦者"),
      false,
    );
    assert.deepEqual(
      subjective.speeches.map(({ speaker, text, sourceSide }) => ({
        speaker,
        text,
        sourceSide,
      })),
      [{ speaker: "姫騎士", text: result.speech, sourceSide: "a" }],
    );
  });

  it("renders explicit and unknown identity profiles without inventing gender", async () => {
    const provider = new MockLlmProvider();
    const profileAnchors = {
      a: {
        schemaVersion: 1 as const,
        side: "a" as const,
        displayName: "鈴鳴り",
        selfNames: ["わたし", "鈴鳴り"],
        gender: "女性",
        age: null,
        appearanceSummary: "光の輪だけが浮かぶ非人型の精霊",
      },
      b: {
        schemaVersion: 1 as const,
        side: "b" as const,
        displayName: "無名の光",
        selfNames: [],
        gender: null,
        age: null,
        appearanceSummary: "輪郭を固定しない光",
      },
    };
    const prologue = await provider.narratePrologue({
      scene: "共鳴室",
      sideAName: "鈴鳴り",
      sideBName: "無名の光",
      sideABlurb: "人型を取らない音の精霊。",
      sideBBlurb: "輪郭を固定しない発光体。",
      characterSpeeches: [],
      profileAnchors,
      focus: "external",
      perspective: "external",
    });
    const aftermath = await provider.narrateAftermath({
      turn: 3,
      scene: "共鳴室",
      sideAName: "鈴鳴り",
      sideBName: "無名の光",
      winnerSide: "a",
      winnerName: "鈴鳴り",
      fallenNames: ["無名の光"],
      characterSpeeches: [],
      profileAnchors,
      focus: "external",
      perspective: "external",
    });

    const rendered = [
      ...prologue.narrator,
      ...aftermath.before,
      ...aftermath.after,
    ].join("\n");
    assert.match(rendered, /鈴鳴り/);
    assert.match(rendered, /無名の光/);
    assert.doesNotMatch(rendered, /彼女|彼氏|男性|少年|少女/);
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

  it("stores an explicitly requested humane priority in the private decision profile", async () => {
    const provider = new MockLlmProvider();
    const generated = await provider.generateCharacter({ prompt: "テストキャラ" });
    const current = {
      ...generated.sheet,
      id: "char-values",
      ownerUserId: "user-test",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    };
    const adjusted = await provider.adjustCharacter(
      current,
      "勝負より人情を優先し、相手を傷つけないでほしい",
    );
    assert.equal(
      adjusted.sheetPatch.decisionProfile?.principles[0]?.force,
      "commitment",
    );
    assert.ok(
      adjusted.sheetPatch.decisionProfile!.principles[0]!.priority >
        adjusted.sheetPatch.decisionProfile!.defaultObjective.priority,
    );
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
