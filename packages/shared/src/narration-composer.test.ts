import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalObserverPerception,
  createBattleSemanticState,
  buildSemanticObservationState,
} from "./index.js";
import { composeNarratorTurn } from "./narration-composer.js";
import { buildNarrationPerceptionView, buildNarrationTurnView } from "./narration-perception.js";

describe("composeNarratorTurn", () => {
  it("writes narrator-shaped prose without engine event summaries or outcomes", () => {
    const semanticState = createBattleSemanticState({
      scene: "霧の橋",
      sideA: { displayName: "アオ" },
      sideB: { displayName: "クロ" },
    });
    const publicObservation = buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "public",
    });
    const frameA = buildMinimalObserverPerception({
      observerSide: "a",
      turn: 3,
      semanticState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
    }).frame;
    const frameB = buildMinimalObserverPerception({
      observerSide: "b",
      turn: 3,
      semanticState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
    }).frame;
    const perception = buildNarrationPerceptionView({
      perspective: "external",
      focus: "external",
      sideALabel: "アオ",
      sideBLabel: "クロ",
      frameA,
      frameB,
      semanticState,
      publicObservation,
    });
    const view = buildNarrationTurnView({
      turn: 3,
      scene: "霧の橋",
      perspective: "external",
      focus: "external",
      sideALabel: "アオ",
      sideBLabel: "クロ",
      perception,
      semanticState,
      publicObservation,
      frameA,
      frameB,
      events: [{
        type: "damage",
        summary: "アオ の 斬撃 が クロ を捉えた。",
        actorName: "アオ",
        targetName: "クロ",
        skillName: "斬撃",
        intensity: "moderate",
      }],
      actionBeats: [{
        actionId: "a1",
        actorSide: "a",
        actorName: "アオ",
        actionName: "斬撃",
        description: "素早い斬り下ろし。",
        outcomes: ["アオ の 斬撃 が クロ を捉えた。"],
      }],
    });

    const composed = composeNarratorTurn({
      view,
      drama: { phase: "rising", environmentBeatDue: false },
    });

    assert.equal(composed.turn, 3);
    assert.ok(composed.narrator.length >= 2);
    assert.equal(composed.narrator.some((line) => line.includes("を捉えた")), false);
    assert.equal(
      composed.narrator.some((line) => line.includes("を起こした")),
      false,
    );
    assert.ok(composed.narrator.some((line) => line.includes("斬撃")));
    // Last-resort composition omits speeches rather than inventing stock lines.
    assert.deepEqual(composed.speeches, []);
    const joined = composed.narrator.join("\n");
    assert.equal(joined.includes("アオ の 斬撃 が クロ を捉えた。"), false);
  });
});
