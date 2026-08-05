import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBattleSemanticState } from "./semantic-state.js";
import { createBattleWorldState } from "./battle-world.js";
import {
  buildInitialObserverPerception,
  projectObserverPerception,
} from "./perception-projection.js";
import {
  buildCommittedUtteranceEvents,
  buildUtterancePerceptionEvidence,
} from "./utterance-perception.js";

function setup() {
  const semanticState = createBattleSemanticState({
    scene: "静かな円形闘技場",
    sideA: { displayName: "アオ", appearanceSummary: "青い外套の人物" },
    sideB: { displayName: "クロ", appearanceSummary: "黒い鎧の人物" },
  });
  const worldState = createBattleWorldState({ semanticState });
  const initialA = buildInitialObserverPerception({
    observerSide: "a",
    turn: 0,
    semanticState,
    worldState,
    quantizedMechanicalEvidence: [],
    reserveEvidence: [],
  });
  const initialB = buildInitialObserverPerception({
    observerSide: "b",
    turn: 0,
    semanticState,
    worldState,
    quantizedMechanicalEvidence: [],
    reserveEvidence: [],
  });
  return { semanticState, worldState, initialA, initialB };
}

describe("committed utterance perception", () => {
  it("commits character-authored speech and projects exact hearing without identity leakage", () => {
    const state = setup();
    const events = buildCommittedUtteranceEvents({
      turn: 1,
      worldState: state.worldState,
      sources: [{
        side: "a",
        speaker: "アオ",
        text: "ここからが本番だ。",
        delivery: "spoken",
      }],
    });
    const evidence = buildUtterancePerceptionEvidence({
      events,
      worldState: state.worldState,
      previousFrameA: state.initialA.frame,
      previousFrameB: state.initialB.frame,
    });
    const projectedB = projectObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState,
      worldState: state.worldState,
      events,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      sensoryEvidence: evidence,
      previousFrame: state.initialB.frame,
      previousRegistry: state.initialB.registry,
    });

    assert.equal(events[0]?.type, "utterance");
    assert.equal(events[0]?.utterance?.text, "ここからが本番だ。");
    assert.equal(evidence[0]?.accessBySide.b.currentAccess, "clear");
    assert.equal(projectedB.frame.counterpart.identityKnowledge, "suspected");
    assert.match(
      projectedB.frame.counterpart.percepts[1]?.phenomenon ?? "",
      /ここからが本番だ/,
    );
    assert.doesNotMatch(
      JSON.stringify(projectedB.frame.counterpart),
      /アオ/,
    );
  });

  it("projects partial, misunderstood, unattributed, and unheard speech separately", () => {
    const state = setup();
    const events = buildCommittedUtteranceEvents({
      turn: 1,
      worldState: state.worldState,
      sources: [{
        side: "a",
        speaker: "アオ",
        text: "北門の仕掛けを止めろ。",
        delivery: "spoken",
      }],
    });

    const partialWorld = structuredClone(state.worldState);
    partialWorld.entities["character.b"]!.actorState!.languageUnderstanding =
      "partial";
    const partial = buildUtterancePerceptionEvidence({
      events,
      worldState: partialWorld,
      previousFrameB: state.initialB.frame,
    })[0]!.accessBySide.b;
    assert.equal(partial.currentAccess, "clear");
    assert.match(partial.perceivedPhenomenon ?? "", /北門の仕…/);
    assert.doesNotMatch(
      partial.perceivedPhenomenon ?? "",
      /北門の仕掛けを止めろ/,
    );

    const misunderstoodWorld = structuredClone(state.worldState);
    misunderstoodWorld.entities["character.b"]!.actorState!
      .languageUnderstanding = "none";
    const misunderstood = buildUtterancePerceptionEvidence({
      events,
      worldState: misunderstoodWorld,
      previousFrameB: state.initialB.frame,
    })[0]!.accessBySide.b;
    assert.equal(misunderstood.currentAccess, "clear");
    assert.match(misunderstood.perceivedPhenomenon ?? "", /意味は分からない/);
    assert.doesNotMatch(
      misunderstood.perceivedPhenomenon ?? "",
      /北門の仕掛け/,
    );

    const hiddenWorld = structuredClone(state.worldState);
    hiddenWorld.entities["character.a"]!.exposure = "hidden";
    const hiddenFrameB = buildInitialObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState,
      worldState: hiddenWorld,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
    });
    const unattributedEvidence = buildUtterancePerceptionEvidence({
      events,
      worldState: hiddenWorld,
      previousFrameB: hiddenFrameB.frame,
    });
    const unattributed = projectObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState,
      worldState: hiddenWorld,
      events,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      sensoryEvidence: unattributedEvidence,
      previousFrame: hiddenFrameB.frame,
      previousRegistry: hiddenFrameB.registry,
    });
    assert.equal(unattributed.frame.counterpart.currentAccess, "none");
    assert.equal(unattributed.frame.others[0]?.subject.kind, "contact");
    assert.equal(unattributed.frame.others[0]?.identityKnowledge, "unknown");

    const deafWorld = structuredClone(state.worldState);
    deafWorld.entities["character.b"]!.actorState!.hearing = "blocked";
    const unheardEvidence = buildUtterancePerceptionEvidence({
      events,
      worldState: deafWorld,
      previousFrameB: state.initialB.frame,
    });
    const unheard = projectObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState,
      worldState: deafWorld,
      events,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      sensoryEvidence: unheardEvidence,
      previousFrame: state.initialB.frame,
      previousRegistry: state.initialB.registry,
    });
    assert.equal(unheardEvidence[0]?.accessBySide.b.currentAccess, "none");
    assert.equal(unheard.frame.counterpart.currentAccess, "clear");
    assert.equal(
      unheard.frame.counterpart.percepts.some((percept) =>
        percept.modality === "sound"
      ),
      false,
    );
  });

  it("rejects physically impossible expressions and stays symmetric by side", () => {
    const state = setup();
    const unavailable = structuredClone(state.worldState);
    unavailable.entities["character.a"]!.actorState!.speech = "blocked";
    const rejected = buildCommittedUtteranceEvents({
      turn: 1,
      worldState: unavailable,
      sources: [{
        side: "a",
        speaker: "アオ",
        text: "聞こえるはずがない。",
        delivery: "spoken",
      }],
    });
    assert.deepEqual(rejected, []);

    const events = buildCommittedUtteranceEvents({
      turn: 1,
      worldState: state.worldState,
      sources: [
        { side: "a", speaker: "アオ", text: "行くぞ。", delivery: "spoken" },
        { side: "b", speaker: "クロ", text: "来い。", delivery: "spoken" },
      ],
    });
    const evidence = buildUtterancePerceptionEvidence({
      events,
      worldState: state.worldState,
      previousFrameA: state.initialA.frame,
      previousFrameB: state.initialB.frame,
    });
    assert.equal(evidence[0]?.accessBySide.b.currentAccess, "clear");
    assert.equal(evidence[1]?.accessBySide.a.currentAccess, "clear");
    assert.equal(evidence[0]?.accessBySide.b.identityKnowledge, "suspected");
    assert.equal(evidence[1]?.accessBySide.a.identityKnowledge, "suspected");
  });

  it("does not relink an unwitnessed transformed speaker by canonical voice label", () => {
    const state = setup();
    state.semanticState.entities["character.a"]!.facts.appearance_changes = {
      current_form: "銀色の鳥の姿",
      apparent_identity: "銀翼",
      witnessed_by: ["a"],
    };
    const frameB = buildInitialObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState,
      worldState: state.worldState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      legacyCounterpartIdentified: true,
    });
    assert.equal(frameB.frame.counterpart.identityKnowledge, "identified");
    assert.equal(
      frameB.frame.counterpart.apparentIdentity?.continuity,
      "unlinked",
    );
    const events = buildCommittedUtteranceEvents({
      turn: 1,
      worldState: state.worldState,
      sources: [{
        side: "a",
        speaker: "アオ",
        text: "こちらを見ろ。",
        delivery: "spoken",
      }],
    });
    const evidence = buildUtterancePerceptionEvidence({
      events,
      worldState: state.worldState,
      previousFrameB: frameB.frame,
    });
    assert.equal(evidence[0]?.accessBySide.b.identityKnowledge, "suspected");
    assert.doesNotMatch(evidence[0]?.accessBySide.b.perceivedAs ?? "", /アオ/);
    const projected = projectObserverPerception({
      observerSide: "b",
      turn: 1,
      semanticState: state.semanticState,
      worldState: state.worldState,
      events,
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      sensoryEvidence: evidence,
      previousFrame: frameB.frame,
      previousRegistry: frameB.registry,
    });
    assert.equal(projected.frame.counterpart.identityKnowledge, "identified");
    assert.equal(projected.frame.counterpart.perceivedAs, "対峙する相手らしい声の主");
    assert.doesNotMatch(JSON.stringify(projected.frame.counterpart), /アオ/);
  });
});
