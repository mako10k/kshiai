import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCharacterSelfProfileAnchor,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import {
  acceptCharacterAgentResult,
  buildJudgmentNarrativeBlock,
  buildRefereeTurnFacts,
  finalizeCharacterSpeeches,
} from "./battle-service.js";

function profile(selfNames: string[]) {
  const sheet: CharacterSheet = {
    id: "a",
    ownerUserId: "owner",
    displayName: "A",
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
    appearance: { summary: "Aの姿", visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "Aの物語。",
  };
  return buildCharacterSelfProfileAnchor(sheet);
}

describe("character-authored public speech", () => {
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
