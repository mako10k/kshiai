import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCharacterSelfProfileAnchor,
  createBattleState,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import {
  acceptCharacterAgentResult,
  advanceCharacterAgents,
  buildJudgmentNarrativeBlock,
  buildRefereeTurnFacts,
  finalizeCharacterSpeeches,
  reconcileSemanticState,
} from "./battle-service.js";
import { MockLlmProvider } from "../llm/mock.js";

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
    const result = await advanceCharacterAgents({
      llm: new MockLlmProvider(),
      before,
      after: { ...before, turn: 1 },
      mine: sideA,
      opp: sideB,
      events: [{ id: "event.wait", type: "wait", summary: "両者が間合いを測った。" }],
      actions: [],
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
          { speaker: "ナレータ", text: "追加の台詞" },
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

  it("does not allow narration to invent speech without a character source", () => {
    assert.deepEqual(
      finalizeCharacterSpeeches({
        narrative: {
          turn: 2,
          narrator: ["余韻が残る。"],
          speeches: [{ speaker: "A", text: "勝った。" }],
        },
        sources: [],
      }),
      [],
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
        },
        speech: "まだ決着ではない。",
        nextAction: { kind: "wait" },
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
        nextAction: { kind: "skill", skillId: "hidden-skill" },
      },
    });
    assert.equal(accepted.speech?.text, "ここで待つ。");
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
        nextAction: { kind: "wait" },
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
        type: "info",
        summary: "確定した出来事",
      }],
    } as Parameters<typeof buildRefereeTurnFacts>[0][number]]);

    assert.deepEqual(facts, [{
      turn: 3,
      actions: [{
        actorSide: "a",
        kind: "wait",
        executed: true,
        skippedReason: null,
      }],
      eventSummaries: ["確定した出来事"],
    }]);
    assert.equal("narrator" in facts[0]!, false);
    assert.equal("speeches" in facts[0]!, false);
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
});
