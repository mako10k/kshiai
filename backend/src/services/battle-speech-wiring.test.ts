import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCharacterSelfProfileAnchor,
  buildBattleTurnRecord,
  buildNarrationPerceptionView,
  createBattleState,
  defaultDialoguePipelineSettings,
  defaultParameters,
  PSYCHE_REACTION_POLICY_V1,
  type BattleState,
  type CharacterSheet,
} from "@kshiai/shared";
import {
  acceptCharacterAgentResult,
  advanceCharacterAgents,
  applyDialogueContextProjectionOverride,
  applyNarratorRecognitionResult,
  applyReflectMemoryWrites,
  buildAftermathNarrativeBlock,
  buildBattleAdjudication,
  buildCharacterAgentConsumerInput,
  buildJudgmentNarrativeBlock,
  buildNarratorCharacterSpeeches,
  buildRefereeFinalState,
  buildRefereeTurnFacts,
  finalizeCharacterSpeeches,
  reconcileSemanticState,
  validateCharacterActionProposal,
} from "./battle-service.js";
import { MockLlmProvider } from "../llm/mock.js";
import { OpenAiCompatibleProvider } from "../llm/openai-compatible.js";

function enableDeterministicPsyche(state: BattleState): void {
  state.assetManifest = {
    rules: {
      battleEngine: "battle-engine-v1",
      temporalRules: "initiative-window-v2",
      psycheReaction: PSYCHE_REACTION_POLICY_V1,
    },
  } as BattleState["assetManifest"];
}

function sheet(
  id: string,
  displayName: string,
  selfNames: string[] = [],
): CharacterSheet {
  return {
    id,
    ownerUserId: "owner",
    displayName,
    identity: {
      realName: null,
      nicknames: [],
      selfNames,
      epithets: [],
      gender: null,
      age: null,
    },
    tags: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    appearance: { summary: `${displayName}の姿`, visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: `${displayName}の物語。`,
  };
}

function profile(selfNames: string[]) {
  return buildCharacterSelfProfileAnchor(sheet("a", "A", selfNames));
}

describe("character-authored public speech", () => {
  it("runs only the selected isolated character context", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const before = createBattleState({
      id: "single-side-character-agent",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    enableDeterministicPsyche(before);
    before.plannedActionA = { kind: "wait" };
    before.plannedActionB = { kind: "basic_attack" };
    const provider = new MockLlmProvider();
    let psycheCalls = 0;
    let agentCalls = 0;
    const originalPsyche = provider.advanceCharacterPsyche.bind(provider);
    const originalAgent = provider.advanceCharacterAgent.bind(provider);
    provider.advanceCharacterPsyche = async (input) => {
      psycheCalls += 1;
      return originalPsyche(input);
    };
    provider.advanceCharacterAgent = async (input) => {
      agentCalls += 1;
      return originalAgent(input);
    };

    const result = await advanceCharacterAgents({
      llm: provider,
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [],
      actions: [],
      activeSides: ["b"],
    });

    assert.equal(psycheCalls, 0);
    assert.equal(agentCalls, 1);
    assert.equal(result.state.plannedActionA?.kind, "wait");
    assert.equal(
      result.state.turnRecords.at(-1)?.pipelineTrace?.characterAgents?.a.providerStatus,
      "skipped",
    );
    assert.equal(
      result.state.turnRecords.at(-1)?.pipelineTrace?.deepPsyche?.a.providerStatus,
      "skipped",
    );
  });

  it("uses a revision-local projection override without mutating admin settings", () => {
    const settings = {
      ...defaultDialoguePipelineSettings(),
      contextProjectionMode: "legacy" as const,
      revision: 5,
    };
    const compact = applyDialogueContextProjectionOverride(settings, "compact");
    assert.equal(compact.contextProjectionMode, "compact");
    assert.equal(compact.revision, 5);
    assert.equal(settings.contextProjectionMode, "legacy");
    assert.equal(applyDialogueContextProjectionOverride(settings, null), settings);
  });

  it("persists narrator recognition only for subjects in the selected view", () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const state = createBattleState({
      id: "narrator-recognition-wiring",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const view = buildNarrationPerceptionView({
      perspective: "self",
      focus: "self",
      sideALabel: "アオ",
      sideBLabel: "クロ",
      frameA: state.perceptionFrameA!,
      frameB: state.perceptionFrameB!,
      semanticState: state.semanticState!,
      publicObservation: state.observationStatePublic!,
    });
    const updated = applyNarratorRecognitionResult({
      state,
      view,
      turn: 1,
      updates: [{
        subjectRef: "opponent",
        recognizedAs: "正体不明の声の主",
        identityKnowledge: "suspected",
        continuity: "same_entity",
      }, {
        subjectRef: "not-in-view",
        recognizedAs: "場外の人物",
        identityKnowledge: "identified",
        continuity: "same_entity",
      }],
    });
    assert.equal(
      updated.narratorContinuity?.a.recognitions.find((item) =>
        item.subjectRef === "opponent"
      )?.recognizedAs,
      "クロ",
    );
    assert.equal(
      updated.narratorContinuity?.a.recognitions.some((item) =>
        item.subjectRef === "not-in-view"
      ),
      false,
    );
  });

  it("commits accepted character speech before narration and projects it to each frame", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const before = createBattleState({
      id: "utterance-wiring",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    enableDeterministicPsyche(before);
    const environmentEvent = {
      id: "hap_llm_1",
      type: "situation" as const,
      summary: "雨水が路地へ流れ込んだ。",
    };
    const result = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [
        { id: "event.wait", type: "wait", summary: "両者が間合いを測った。" },
        environmentEvent,
      ],
      actions: [],
      environmentProcessReceipt: {
        status: "accepted",
        reason: "accepted_canonical_change",
        decisionReason: "路地の排水条件から成立する",
        proposal: {
          id: "hap_llm_1",
          title: "流入",
          summary: "雨水が路地へ流れ込む",
          notes: "浅い水が足元に残る",
        },
        resolvedEvent: environmentEvent,
        sourceEventIds: ["hap_llm_1"],
        effectKeys: ["/entities/environment.effect.1"],
      },
    });
    const utterances = result.state.turnRecords.at(-1)?.events.filter(
      (event) => event.type === "utterance",
    ) ?? [];
    assert.equal(utterances.length, 2);
    assert.deepEqual(
      utterances.map((event) => event.utterance?.text),
      result.characterSpeeches.map((speech) => speech.text),
    );
    assert.equal(
      result.state.perceptionFrameA?.counterpart.percepts.some((percept) =>
        percept.modality === "sound"
      ),
      true,
    );
    assert.equal(
      result.state.perceptionFrameB?.counterpart.percepts.some((percept) =>
        percept.modality === "sound"
      ),
      true,
    );
    assert.equal(
      JSON.stringify(result.state.turnRecords).includes("公開用の偽台詞"),
      false,
    );
    assert.equal(result.state.narratorContinuity?.a.turn, 1);
    assert.equal(result.state.narratorContinuity?.b.turn, 1);
    assert.notEqual(
      result.state.narratorContinuity?.a.viewpointSide,
      result.state.narratorContinuity?.b.viewpointSide,
    );
    const pipelineTrace = result.state.turnRecords.at(-1)?.pipelineTrace;
    assert.equal(pipelineTrace?.dialogueProjection?.mode, "shadow");
    assert.equal(pipelineTrace?.dialogueProjection?.a.observerSide, "a");
    assert.equal(pipelineTrace?.dialogueProjection?.b.observerSide, "b");
    assert.equal(pipelineTrace?.deepPsyche?.a.providerStatus, "skipped");
    assert.equal(pipelineTrace?.deepPsyche?.b.providerStatus, "skipped");
    assert.equal(
      (pipelineTrace?.deepPsyche?.a.acceptedOutput as {
        reactionReceiptV1?: { route?: string };
      } | null)?.reactionReceiptV1?.route,
      "deterministic_no_call",
    );
    assert.equal(
      "dialoguePipeline" in ((pipelineTrace?.deepPsyche?.a.input as object | null) ?? {}),
      false,
    );
    assert.equal(
      "turnObservation" in ((pipelineTrace?.deepPsyche?.a.input as object | null) ?? {}),
      false,
    );
    assert.equal(
      "dialoguePipeline" in ((pipelineTrace?.characterAgents?.a.input as object | null) ?? {}),
      false,
    );
    assert.equal(pipelineTrace?.characterAgents?.phase, "turn");
    assert.equal(pipelineTrace?.characterAgents?.a.providerStatus, "fulfilled");
    assert.equal(pipelineTrace?.characterAgents?.b.providerStatus, "fulfilled");
    assert.equal(
      (pipelineTrace?.characterAgents?.a.input as { phase?: string } | null)?.phase,
      "turn",
    );
    assert.ok(pipelineTrace?.characterAgents?.a.providerOutput);
    assert.equal(
      pipelineTrace?.characterAgents?.a.actionProposalValidation?.status,
      "accepted",
    );
    assert.ok(pipelineTrace?.characterAgents?.a.acceptedOutput);
    assert.equal(pipelineTrace?.environmentProcess?.status, "accepted");
    assert.equal(
      pipelineTrace?.environmentProcess?.resolvedEvent?.id,
      "hap_llm_1",
    );
    const narratorSpeeches = buildNarratorCharacterSpeeches({
      state: result.state,
      sources: result.characterSpeeches,
      events: result.state.turnRecords.at(-1)?.events ?? [],
      perspective: "self",
      focus: "self",
    });
    const perceivedB = narratorSpeeches.find((speech) => speech.side === "b");
    assert.equal(perceivedB?.displayContext?.mode, "self");
    assert.equal(perceivedB?.displayContext?.identityKnowledge, "identified");
    assert.equal(perceivedB?.displayContext?.relationshipAddress, "クロ");
  });

  it("projects deterministic psyche and compact expression contexts without a psyche model call", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const before = createBattleState({
      id: "compact-dialogue-context",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    enableDeterministicPsyche(before);
    const result = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [{ id: "event.compact", type: "wait", summary: "両者が様子をうかがう。" }],
      actions: [],
      dialoguePipeline: {
        ...defaultDialoguePipelineSettings(),
        contextProjectionMode: "compact",
        recentExchangeLimit: 2,
        relevantMemoryLimit: 1,
      },
    });
    const trace = result.state.turnRecords.at(-1)?.pipelineTrace;
    const psycheInput = trace?.deepPsyche?.a.input;
    const expressionInput = trace?.characterAgents?.a.input as Record<string, unknown>;
    assert.equal(psycheInput, null);
    assert.equal(trace?.deepPsyche?.a.providerStatus, "skipped");
    assert.equal(result.state.agentStateA?.reactionReceiptV1?.route, "deterministic_no_call");
    assert.equal(result.state.agentStateA?.reactionReceiptV1?.observerSide, "a");
    assert.equal(result.state.agentStateA?.reactionReceiptV1?.reason, "committed_observation");
    assert.equal(expressionInput.contextMode, "compact");
    assert.ok(expressionInput.expressionBrief);
    assert.ok(expressionInput.turnObservation);
    assert.equal("perception" in expressionInput, false);
    assert.equal("compactRecentExchange" in expressionInput, false);
    assert.equal("anchoredExchange" in expressionInput, false);
    assert.equal(
      "anchoredExchange" in ((expressionInput.conversation as Record<string, unknown>) ?? {}),
      true,
    );
    assert.equal(result.state.agentStateA?.dialogueThread?.topic, "");
    assert.equal(trace?.deepPsyche?.a.providerStatus, "skipped");
    assert.equal(trace?.characterAgents?.a.providerStatus, "fulfilled");
  });

  it("keeps matchup memory separate from compact battle-private memory", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    sideA.opponentMemories = {
      b: {
        preBattlePlan: "足を止めず、間合いの変化を測る。",
        postBattleReflection: "前回は急ぎすぎて相手の誘いに乗った。",
        battleCount: 3,
        lastBattleAt: "2026-08-10T00:00:00.000Z",
      },
    };
    const opening = createBattleState({
      id: "compact-matchup-memory",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: true,
    });
    opening.agentStateA!.privateMemory = "この相手への過去方針: 古い計画";

    const result = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before: opening,
      after: opening,
      mine: sideA,
      opp: sideB,
      events: [],
      actions: [],
      phase: "prologue",
      dialoguePipeline: {
        ...defaultDialoguePipelineSettings(),
        contextProjectionMode: "compact",
      },
    });

    const psycheInput = result.state.turnRecords.at(-1)?.pipelineTrace?.deepPsyche?.a.input as
      { previous?: { privateMemory?: string }; matchupMemory?: unknown };
    assert.equal(psycheInput.previous?.privateMemory, "");
    assert.deepEqual(psycheInput.matchupMemory, {
      preBattlePlan: "足を止めず、間合いの変化を測る。",
      postBattleReflection: "前回は急ぎすぎて相手の誘いに乗った。",
      battleCount: 3,
    });
    assert.equal(result.state.agentStateA?.privateMemory, "");
  });

  it("clears inherited compact private memory when prologue psyche is unavailable", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const opening = createBattleState({
      id: "compact-matchup-memory-rejected-prologue",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: true,
    });
    opening.agentStateA!.privateMemory = "この相手への過去方針: 古い計画";
    const provider = new MockLlmProvider();
    provider.advanceCharacterPsyche = async () => {
      throw new Error("simulated unavailable psyche");
    };

    const result = await advanceCharacterAgents({
      llm: provider,
      before: opening,
      after: opening,
      mine: sideA,
      opp: sideB,
      events: [],
      actions: [],
      phase: "prologue",
      dialoguePipeline: {
        ...defaultDialoguePipelineSettings(),
        contextProjectionMode: "compact",
      },
    });

    assert.equal(result.state.agentStateA?.privateMemory, "");
    assert.equal(result.state.turnRecords.at(-1)?.pipelineTrace?.deepPsyche?.a.providerStatus, "rejected");
  });

  it("uses initial perception for prologue decisions and reaction-only aftermath", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const opening = createBattleState({
      id: "phase-alignment",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: true,
    });
    const prologueInput = buildCharacterAgentConsumerInput({
      state: opening,
      sheet: sideA,
      side: "a",
      previous: opening.agentStateA!,
      phase: "prologue",
    });
    assert.ok(prologueInput);
    assert.equal(prologueInput.phase, "prologue");
    assert.equal(prologueInput.perception.turn, 0);
    assert.notEqual(prologueInput.perception.counterpart.currentAccess, "none");
    assert.ok(prologueInput.decision);
    assert.equal(prologueInput.social?.counterpartAddress, "クロ");
    assert.equal(prologueInput.social?.selfReference, "私");

    opening.turn = 1;
    opening.prologuePending = false;
    opening.aftermathPending = true;
    opening.winnerSide = "a";
    opening.finishReason = "incapacitated";
    opening.sideB.parameters.hp = 0;
    opening.sideB.canFight = false;
    opening.plannedActionA = { kind: "basic_attack" };
    opening.plannedActionB = { kind: "wait" };
    const terminalRecord = buildBattleTurnRecord({
      before: opening,
      after: opening,
      events: [{ id: "event.terminal", type: "status", summary: "決着した。" }],
      actions: [],
    });
    opening.turnRecords = [terminalRecord];
    const aftermathInput = buildCharacterAgentConsumerInput({
      state: opening,
      sheet: sideB,
      side: "b",
      previous: opening.agentStateB!,
      phase: "aftermath",
    });
    assert.ok(aftermathInput);
    assert.equal(aftermathInput.phase, "aftermath");
    assert.equal(aftermathInput.decision, undefined);

    const aftermath = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before: opening,
      after: opening,
      mine: sideA,
      opp: sideB,
      events: terminalRecord.events,
      actions: terminalRecord.actions,
      phase: "aftermath",
      replaceLastRecord: true,
    });
    assert.equal(aftermath.state.turnRecords.length, 1);
    assert.equal(aftermath.state.plannedActionA, undefined);
    assert.equal(aftermath.state.plannedActionB, undefined);
    assert.ok(aftermath.characterSpeeches.length > 0);
    assert.ok(aftermath.state.turnRecords[0]?.events.some((event) =>
      event.id?.includes(".aftermath.")
    ));
  });

  it("applies the administrator history window only to character context", () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const state = createBattleState({
      id: "dialogue-history-window",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const consumerInput = buildCharacterAgentConsumerInput({
      state,
      sheet: sideA,
      counterpartSheet: sideB,
      side: "a",
      previous: {
        ...state.agentStateA!,
        lastActionResult: "アオは足元を確かめ、クロとの距離を保った。",
        conversationHistory: Array.from({ length: 18 }, (_, index) => ({
          turn: index + 1,
          speaker: index % 2 === 0 ? "self" as const : "counterpart" as const,
          text: `会話 ${index + 1}`,
        })),
      },
      dialoguePipeline: {
        schemaVersion: 1,
        enabled: true,
        conversationHistoryLimit: 16,
        contextProjectionMode: "legacy",
        recentExchangeLimit: 4,
        relevantMemoryLimit: 1,
        psychologyGuidance: "性格と相手への手応えを踏まえて話す。",
        revision: 3,
        updatedAt: "2026-08-09T00:00:00.000Z",
        updatedBy: "operator",
      },
      phase: "turn",
    });
    assert.ok(consumerInput);
    assert.equal(consumerInput.conversation.history.length, 16);
    assert.equal(consumerInput.conversation.history[0]?.turn, 3);
    assert.equal(consumerInput.psyche.conversationHistory, undefined);
    assert.equal(consumerInput.psyche.lastActionResult, undefined);
    assert.equal(
      consumerInput.actionReaction.latestCommittedResult,
      "アオは足元を確かめ、クロとの距離を保った。",
    );
    assert.equal(consumerInput.dialoguePipeline?.conversationHistoryLimit, 16);
  });

  it("does not publish or remember an agent line that the world blocks", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const before = createBattleState({
      id: "utterance-blocked",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    before.worldState!.entities["character.a"]!.actorState!.speech = "blocked";
    const result = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [],
      actions: [],
    });
    assert.deepEqual(
      result.characterSpeeches.map((speech) => speech.side),
      ["b"],
    );
    assert.equal(result.state.agentStateA?.lastSpeech, null);
    assert.equal(
      result.state.turnRecords.at(-1)?.events.some((event) =>
        event.type === "utterance" && event.actorSide === "a"
      ),
      false,
    );
  });

  it("continues the eligible side when the other side has no self-directed action", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const before = createBattleState({
      id: "one-side-actionable",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    before.worldState!.entities["character.b"]!.actorState!.agency = "uncontrolled";
    const provider = new MockLlmProvider();
    const calls: string[] = [];
    const original = provider.advanceCharacterAgent.bind(provider);
    provider.advanceCharacterAgent = async (input) => {
      calls.push(input.perception.observer.side);
      return original(input);
    };
    const result = await advanceCharacterAgents({
      llm: provider,
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [],
      actions: [],
    });
    assert.deepEqual(calls, ["a"]);
    assert.deepEqual(result.characterSpeeches.map((speech) => speech.side), ["a"]);
    assert.equal(result.state.plannedActionB, undefined);
  });

  it("carries committed utterances into the next agent perception without a provider", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const before = createBattleState({
      id: "utterance-next-perception",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const first = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [],
      actions: [],
    });
    const actualA = first.characterSpeeches.find((speech) => speech.side === "a")
      ?.text;
    assert.ok(actualA);
    const unavailable = new MockLlmProvider();
    unavailable.reconcileTurnSemanticState = async () => {
      throw new Error("provider unavailable");
    };
    const next = await reconcileSemanticState({
      llm: unavailable,
      stateBeforeTurn: {
        ...first.state,
        log: [{
          turn: 1,
          narrator: ["公開ナレータによる文章。"],
          speeches: [{
            sourceSide: "a",
            speaker: "アオ",
            text: "公開用の偽台詞",
          }],
        }],
      },
      resolvedState: { ...first.state, turn: 2 },
      mine: sideA,
      opp: sideB,
      actions: [],
      events: [],
      mechanicalEvidence: [],
    });
    const heardByB = next.state.perceptionFrameB?.counterpart.percepts.find(
      (percept) => percept.modality === "sound",
    )?.phenomenon;
    assert.match(heardByB ?? "", new RegExp(actualA));
    assert.doesNotMatch(heardByB ?? "", /公開用の偽台詞|公開ナレータ/);
    assert.equal(next.status, "skipped");
  });

  it("keeps character facts authoritative while accepting placement and punctuation", () => {
    const speeches = finalizeCharacterSpeeches({
      narrative: {
        turn: 1,
        narrator: ["両者が動く。", "攻防が交差する。", "距離が開く。"],
        speeches: [
          {
            sourceSide: "a",
            speaker: "A",
            text: "もう勝った。",
            afterNarratorLine: 0,
          },
          {
            sourceSide: "b",
            speaker: "B",
            text: "まだ、終わらない！",
            afterNarratorLine: 1,
          },
        ],
      },
      sources: [
        { side: "a", speaker: "A", text: "まだ決着ではない。" },
        { side: "b", speaker: "B", text: "まだ終わらない。" },
      ],
    });

    assert.deepEqual(speeches, [
      {
        sourceSide: "a",
        speaker: "A",
        text: "まだ決着ではない。",
        afterNarratorLine: 0,
      },
      {
        sourceSide: "b",
        speaker: "B",
        text: "まだ、終わらない！",
        afterNarratorLine: 1,
      },
    ]);
  });

  it("accepts narrator-authored display labels without changing canonical speech", () => {
    const source = {
      side: "a" as const,
      speaker: "明良",
      text: "まだ終わらない。",
      displayLabel: "明良かもしれない声",
    };
    const accepted = finalizeCharacterSpeeches({
      narrative: {
        turn: 1,
        narrator: ["声が響く。"],
        speeches: [{
          sourceSide: "a",
          speaker: "白狼の姿をした声の主",
          text: source.text,
        }],
      },
      sources: [source],
    });
    assert.equal(accepted[0]?.speaker, "白狼の姿をした声の主");

    const fallback = finalizeCharacterSpeeches({
      narrative: {
        turn: 1,
        narrator: ["声が響く。"],
        speeches: [{
          sourceSide: "a",
          speaker: "\n\t",
          text: source.text,
        }],
      },
      sources: [source],
    });
    assert.equal(fallback[0]?.speaker, "明良かもしれない声");
  });

  it("keeps scene-grounded third-party speech without treating it as canonical A/B speech", () => {
    assert.deepEqual(
      finalizeCharacterSpeeches({
        narrative: {
          turn: 2,
          narrator: ["余韻が残る。"],
          speeches: [{
            speaker: "観客席の審判",
            text: "そこまで。",
            afterNarratorLine: 0,
          }],
        },
        sources: [],
      }),
      [{
        speaker: "観客席の審判",
        text: "そこまで。",
        afterNarratorLine: 0,
      }],
    );
  });

  it("keeps actual speech in private continuity regardless of public rendering", () => {
    const previous = {
      privateMemory: "",
      currentGoal: "様子を見る",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "簡潔",
      selfReference: "私",
      lastSpeech: null,
    };
    const accepted = acceptCharacterAgentResult({
      side: "a",
      speaker: "A",
      previous,
      profile: profile(["私"]),
      result: {
        state: {
          ...previous,
          lastSpeech: "provider内の不一致な文",
          interior: {
            primaryEmotion: "静かな苛立ち",
            concealedEmotion: null,
            coreNeed: "反応を確かめる",
            protectiveStance: "問いを重ねる",
            eventAppraisal: "返答がなかった",
            unspokenIntent: "反応を引き出す",
            currentConcern: "前の言葉は届いたか",
            attitudeTowardCounterpart: "試している",
            confidence: "steady",
            relationshipTension: "張りつめている",
            speechMode: "weave",
            speechAppraisal: {
              anticipatedImpact: "相手の構えを動かす",
              observedImpact: "前の問いには返答がなかった",
              anticipatedSocialCost: "問いを重ねれば警戒される",
              observedSocialCost: "前の問いは注意を動かさなかった",
              nextApproach: "別の角度から相手の反応を探る",
              continuityPosture: "fraying",
              continuityDecision: "reframe",
            },
          },
        },
        speech: "まだ決着ではない。",
        proposedAction: { kind: "wait" },
      },
    });

    const publicSpeeches = finalizeCharacterSpeeches({
      narrative: {
        turn: 1,
        narrator: ["静寂が落ちる。"],
        speeches: [{
          sourceSide: "a",
          speaker: "A",
          text: "もう勝った。",
          afterNarratorLine: 0,
        }],
      },
      sources: accepted.speech ? [accepted.speech] : [],
    });

    assert.equal(accepted.state.lastSpeech, "まだ決着ではない。");
    assert.equal(accepted.state.selfReference, "私");
    assert.equal(accepted.state.interior, undefined);
    assert.equal(publicSpeeches[0]?.text, "まだ決着ではない。");
    assert.equal(accepted.state.lastSpeech, "まだ決着ではない。");
  });

  it("accepts actual speech but rejects an action outside the server list", () => {
    const previous = {
      privateMemory: "",
      currentGoal: "",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "",
      selfReference: "私",
      lastSpeech: null,
    };
    const accepted = acceptCharacterAgentResult({
      side: "a",
      speaker: "A",
      previous,
      profile: profile(["私"]),
      decision: {
        nextTurn: 2,
        turnsRemaining: 19,
        availableActions: [{
          kind: "wait",
          name: "様子を見る",
          target: { kind: "self", perceivedAs: "自分" },
        }],
        finisher: null,
      },
      result: {
        state: previous,
        speech: "ここで待つ。",
        proposedAction: { kind: "skill", skillId: "hidden-skill" },
      },
    });
    assert.equal(accepted.speech?.text, "ここで待つ。");
    assert.equal(accepted.nextAction, undefined);
    assert.equal(
      accepted.actionProposalValidation?.reason,
      "unavailable_action",
    );
  });

  it("records action proposal acceptance and targeted rejection reasons", () => {
    const decision: NonNullable<
      Parameters<typeof validateCharacterActionProposal>[0]["decision"]
    > = {
      nextTurn: 3,
      turnsRemaining: 18,
      availableActions: [{
        kind: "skill",
        skillId: "slash",
        name: "斬撃",
        skillKind: "attack",
        finisherCandidate: true,
        target: { kind: "counterpart", perceivedAs: "相手" },
      }, {
        kind: "basic_attack",
        name: "基本攻撃",
        target: { kind: "counterpart", perceivedAs: "相手" },
      }, {
        kind: "defend",
        name: "防御",
        target: { kind: "self", perceivedAs: "自分" },
      }, {
        kind: "free_action",
        name: "自由行動",
        target: { kind: "self", perceivedAs: "自分" },
      }, {
        kind: "reflect",
        name: "戦況を省みる",
        target: { kind: "self", perceivedAs: "自分" },
      }],
      finisher: {
        skillId: "slash",
        skillName: "斬撃",
        source: "derived",
        unlocked: false,
        turnsUntilUnlock: 1,
        remainingUses: 1,
        currentMultiplier: 1.5,
        maxMultiplier: 2,
        criticalChance: 0.2,
        turnsUntilMax: 2,
      },
      affordances: [{
        ref: "object.rock",
        perceivedAs: "石",
        relation: "足元にある",
        certainty: "clear",
        possiblePreparations: [],
        possibleUses: [],
      }],
      opportunityChains: [{
        id: "chain.rock",
        objectiveHint: "石を使う",
        prerequisites: [],
        continuation: {
          actionKind: "basic_attack",
          instrumentRef: "object.rock",
          description: "石で攻める",
        },
        setupTurns: 0,
        expectedProgress: "攻撃手段を増やす",
        expectedCausalPotential: { damage: "minor" },
        risks: [],
      }],
      lastAction: { kind: "defend" },
      varietyPressure: "require_change",
    };
    const validate = (proposedAction: unknown) =>
      validateCharacterActionProposal({ proposedAction, decision });

    assert.deepEqual(validate({ kind: "skill", skillId: "slash" }), {
      status: "accepted",
      reason: null,
      proposedAction: { kind: "skill", skillId: "slash" },
      acceptedAction: { kind: "skill", skillId: "slash" },
    });
    assert.equal(
      validate({ kind: "skill", skillId: "slash", unexpected: true }).reason,
      "schema_invalid",
    );
    assert.equal(
      validate({ kind: "skill", skillId: "hidden" }).reason,
      "unavailable_action",
    );
    assert.equal(
      validate({ kind: "skill", skillId: "slash", useFinisher: true }).reason,
      "unavailable_finisher",
    );
    assert.equal(
      validate({
        kind: "free_action",
        description: "見えない物をつかむ",
        subjectRefs: ["object.hidden"],
      }).reason,
      "ungrounded_free_action",
    );
    assert.equal(
      validate({ kind: "basic_attack", instrumentRef: "object.hidden" }).reason,
      "unavailable_instrument",
    );
    assert.equal(
      validate({ kind: "defend" }).reason,
      "repeated_action_requires_change",
    );
    assert.equal(
      validate({ kind: "basic_attack", instrumentRef: "object.rock" }).status,
      "accepted",
    );
    assert.equal(
      validate({ kind: "reflect" }).reason,
      "schema_invalid",
    );
    assert.deepEqual(
      validate({
        kind: "reflect",
        reflectionAnalysis: "形勢が悪い",
        reflectionGuideline: "守りから立て直す",
      }),
      {
        status: "accepted",
        reason: null,
        proposedAction: {
          kind: "reflect",
          reflectionAnalysis: "形勢が悪い",
          reflectionGuideline: "守りから立て直す",
        },
        acceptedAction: {
          kind: "reflect",
          reflectionAnalysis: "形勢が悪い",
          reflectionGuideline: "守りから立て直す",
        },
      },
    );
  });

  it("writes reflect analysis into battle-volatile memory only", () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const state = createBattleState({
      id: "reflect-memory",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    state.agentStateA = {
      privateMemory: "既存の記憶",
      battleVolatileMemory: "",
      currentGoal: "勝つ",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "短く",
      selfReference: "私",
      lastSpeech: null,
    };
    const actions = [{
      id: "turn-1-action-a",
      actorSide: "a" as const,
      kind: "reflect" as const,
      reflectionAnalysis: "相手の間合いが読めない",
      reflectionGuideline: "次は様子を見てから踏み込む",
      executed: true,
      skippedReason: null,
    }];
    const once = applyReflectMemoryWrites(state, actions);
    assert.equal(once.agentStateA?.privateMemory, "既存の記憶");
    assert.match(once.agentStateA?.battleVolatileMemory ?? "", /【省察】相手の間合いが読めない/);
    assert.match(once.agentStateA?.battleVolatileMemory ?? "", /【指針】次は様子を見てから踏み込む/);
    assert.equal(once.agentStateA?.currentGoal, "次は様子を見てから踏み込む");
    const twice = applyReflectMemoryWrites(once, actions);
    assert.equal(
      ((twice.agentStateA?.battleVolatileMemory ?? "").match(/【省察】/g) ?? []).length,
      1,
    );
    assert.equal(twice.agentStateA?.privateMemory, "既存の記憶");
  });

  it("keeps valid state and speech when an OpenAI-compatible action proposal is invalid", async () => {
    const sideA = sheet("a", "アオ", ["私"]);
    const sideB = sheet("b", "クロ", ["俺"]);
    const state = createBattleState({
      id: "invalid-proposal-isolated",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const consumerInput = buildCharacterAgentConsumerInput({
      state,
      sheet: sideA,
      counterpartSheet: sideB,
      side: "a",
      previous: state.agentStateA!,
      phase: "turn",
    });
    assert.ok(consumerInput?.decision);
    const provider = new OpenAiCompatibleProvider({
      name: "test-provider",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "test-engine",
      modelFast: "test-fast",
    });
    const privateProvider = provider as unknown as {
      chatJson(): Promise<unknown>;
    };
    privateProvider.chatJson = async () => ({
      speech: "まだ動ける。",
      nextAction: { kind: "skill", skillId: "slash", unexpected: true },
    });

    const providerResult = await provider.advanceCharacterAgent(consumerInput!);
    const accepted = acceptCharacterAgentResult({
      result: providerResult,
      previous: state.agentStateA!,
      side: "a",
      speaker: sideA.displayName,
      profile: consumerInput!.character,
      decision: consumerInput!.decision,
    });

    assert.equal(providerResult.state.privateMemory, consumerInput!.psyche.privateMemory);
    assert.equal(providerResult.speech, "まだ動ける。");
    assert.deepEqual(providerResult.proposedAction, {
      kind: "skill",
      skillId: "slash",
      unexpected: true,
    });
    assert.equal(accepted.state.privateMemory, state.agentStateA!.privateMemory);
    assert.equal(accepted.speech?.text, "まだ動ける。");
    assert.equal(accepted.actionProposalValidation?.reason, "schema_invalid");
    assert.equal(accepted.nextAction, undefined);
  });

  it("overrides contradictory continuity with canonical self names", () => {
    const previous = {
      privateMemory: "",
      currentGoal: "",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "",
      selfReference: "俺",
      lastSpeech: null,
    };
    const accepted = acceptCharacterAgentResult({
      side: "a",
      speaker: "A",
      previous,
      profile: profile(["わたし", "A"]),
      result: {
        state: { ...previous, selfReference: "僕" },
        speech: "まだ続けられる。",
        proposedAction: { kind: "wait" },
      },
    });
    const missing = acceptCharacterAgentResult({
      side: "a",
      speaker: "A",
      previous,
      profile: profile([]),
      result: null,
    });

    assert.equal(accepted.state.selfReference, "わたし");
    assert.equal(missing.state.selfReference, null);
  });

  it("bounds invalid or out-of-range narrator placement", () => {
    assert.deepEqual(
      finalizeCharacterSpeeches({
        narrative: {
          turn: 1,
          narrator: ["一行だけ。"],
          speeches: [{
            sourceSide: "a",
            speaker: "A",
            text: "行く。",
            afterNarratorLine: 99,
          }],
        },
        sources: [{ side: "a", speaker: "A", text: "行く。" }],
      }),
      [{
        sourceSide: "a",
        speaker: "A",
        text: "行く。",
        afterNarratorLine: 0,
      }],
    );
  });

  it("builds turn-limit input only from committed records", () => {
    const facts = buildRefereeTurnFacts([{
      turn: 3,
      actions: [{
        id: "turn-3-action-a",
        actorSide: "a",
        kind: "wait",
        executed: true,
        skippedReason: null,
      }],
      events: [{
        id: "turn-3-event-1",
        type: "damage",
        actorSide: "a",
        targetSides: ["b"],
        parameterKey: "hp",
        parameterDirection: "loss",
        intensity: "moderate",
        summary: "確定した出来事",
      }, {
        id: "turn-3-event-2",
        type: "utterance",
        actorSide: "a",
        utterance: {
          text: "裁定へ渡してはいけない台詞",
          delivery: "spoken",
          volume: "normal",
          articulation: "clear",
          language: "ja",
        },
        summary: "Aが話した。",
      }],
      sideAChange: {
        parameterChanges: {},
        defendingBefore: false,
        defendingAfter: false,
        canFightBefore: true,
        canFightAfter: true,
      },
      sideBChange: {
        parameterChanges: { hp: -8 },
        defendingBefore: false,
        defendingAfter: false,
        canFightBefore: true,
        canFightAfter: true,
      },
      worldImpact: {
        status: "applied",
        operationKinds: ["set_pair_relation"],
      },
    } as unknown as Parameters<typeof buildRefereeTurnFacts>[0][number]]);

    assert.deepEqual(facts, [{
      turn: 3,
      actions: [{
        actorSide: "a",
        kind: "wait",
        executed: true,
        skippedReason: null,
        resolutionReason: null,
      }],
      effects: [{
        type: "damage",
        actorSide: "a",
        targetSides: ["b"],
        parameterKey: "hp",
        parameterDirection: "loss",
        intensity: "moderate",
      }],
      stateChanges: {
        a: { canFightBefore: true, canFightAfter: true },
        b: { canFightBefore: true, canFightAfter: true },
      },
      worldImpact: {
        status: "applied",
        operationKinds: ["set_pair_relation"],
      },
    }]);
    assert.equal("narrator" in facts[0]!, false);
    assert.equal("speeches" in facts[0]!, false);
    assert.doesNotMatch(JSON.stringify(facts), /確定した出来事|裁定へ渡してはいけない台詞/);
  });

  it("persists one canonical adjudication independent of presentation inputs", () => {
    const state = createBattleState({
      id: "adjudication-state",
      sideA: sheet("a", "A"),
      sideB: sheet("b", "B"),
      turnLimit: 20,
      prologuePending: false,
    });
    state.turn = 20;
    const finalState = buildRefereeFinalState(state);
    assert.deepEqual(finalState.a.reserves, {
      hp: "ample",
      mp: "ample",
      stamina: "ample",
    });
    assert.doesNotMatch(JSON.stringify(finalState), /100|50/);

    const result = {
      winnerSide: "b" as const,
      reason: "確定した世界への働きかけが上回った。",
      reasonFacts: [{
        factor: "world_impact" as const,
        favoredSide: "b" as const,
        statement: "B側の働きかけが場に残った。",
      }],
    };
    const adjudication = buildBattleAdjudication({
      turn: 20,
      engineWinnerSide: "a",
      turnFacts: [],
      result,
    });
    assert.equal(adjudication.winnerSide, "b");
    assert.equal(adjudication.engineFallbackSide, "a");
    assert.equal(adjudication.source, "semantic_adjudicator");
    assert.deepEqual(adjudication.reasonFacts, result.reasonFacts);

    const fallback = buildBattleAdjudication({
      turn: 20,
      engineWinnerSide: "a",
      turnFacts: [],
    });
    assert.equal(fallback.winnerSide, "a");
    assert.equal(fallback.source, "deterministic_fallback");
  });

  it("keeps the raw judgment immutable across narration styles", () => {
    const quiet = buildJudgmentNarrativeBlock({
      turn: 20,
      sideAName: "A",
      sideBName: "B",
      winnerSide: "a",
      adjudicationReason: "確定した働きかけが上回った。",
      presentation: {
        before: ["場が静まる。"],
        after: ["余韻が残る。"],
      },
    });
    const dramatic = buildJudgmentNarrativeBlock({
      turn: 20,
      sideAName: "A",
      sideBName: "B",
      winnerSide: "a",
      adjudicationReason: "確定した働きかけが上回った。",
      presentation: {
        before: ["長い時を経て、宣告の瞬間が来る。"],
        after: ["熱気だけが場に残った。"],
      },
    });

    const verdict = "判定は A の勝利。確定した働きかけが上回った。";
    assert.equal(quiet.narrator.includes(verdict), true);
    assert.equal(dramatic.narrator.includes(verdict), true);
    assert.deepEqual(quiet.speeches, []);
    assert.deepEqual(dramatic.speeches, []);
  });

  it("inserts one immutable aftermath result and rejects invented outcomes or speech", () => {
    const source = { side: "a" as const, speaker: "A", text: "終わった。" };
    const quiet = buildAftermathNarrativeBlock({
      turn: 7,
      winnerName: "A",
      fallenNames: ["B"],
      characterSpeeches: [source],
      presentation: {
        before: ["夜の風が静まる。", "Bが勝者として立つ。"],
        after: ["余韻が残る。", "Bが復活した。"],
        speeches: [{
          sourceSide: "a",
          speaker: "A",
          text: "終わった!",
          afterNarratorLine: 1,
        }, {
          sourceSide: "b",
          speaker: "B",
          text: "私の勝ちだ。",
          afterNarratorLine: 1,
        }],
      },
    });
    assert.ok(quiet.narrator.includes(
      "B は対決を続けられない。結果は A の勝利として確定した。",
    ));
    assert.doesNotMatch(quiet.narrator.join(" "), /Bが勝者|復活/);
    assert.deepEqual(quiet.speeches, [{
      sourceSide: "a",
      speaker: "A",
      text: "終わった!",
      afterNarratorLine: 1,
    }]);
  });
});
