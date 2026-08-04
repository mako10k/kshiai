import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  CommittedMechanicalEvidence,
  TurnEvent,
} from "@kshiai/shared";
import {
  buildPromptMechanicalEvidence,
  validateCommittedMechanicalEvidence,
  validateSensoryEvidence,
} from "./perception-evidence.js";
import { PERCEPTION_PROMPT_FIXTURES } from "./perception-prompt-strategy.js";

describe("perception evidence boundaries", () => {
  const fixture = PERCEPTION_PROMPT_FIXTURES[0]!;
  const committed: CommittedMechanicalEvidence = {
    evidenceId: "turn-3-mechanical-1",
    turn: 3,
    sourceActionId: "action.dark.1",
    basisEventIds: ["event.dark.impact.1"],
    actorSide: "a",
    target: { side: "b", entityId: "character.b" },
    parameterKey: "hp",
    beforeValue: 80,
    afterValue: 50,
    delta: -30,
  };

  it("accepts mechanics only when action, event, and semantic targets are committed", () => {
    const valid = validateCommittedMechanicalEvidence({
      raw: [committed],
      turn: fixture.input.turn,
      before: fixture.input.before,
      actions: fixture.input.actions,
      events: fixture.input.events,
    });
    assert.equal(valid.status, "valid");
    assert.deepEqual(valid.evidence, [committed]);

    const invalid = validateCommittedMechanicalEvidence({
      raw: [{
        ...committed,
        sourceActionId: "action.not-committed",
        target: { side: "b", entityId: "character.a" },
      }],
      turn: fixture.input.turn,
      before: fixture.input.before,
      actions: fixture.input.actions,
      events: fixture.input.events,
    });
    assert.equal(invalid.status, "rejected");
    assert.deepEqual(invalid.evidence, []);
  });

  it("derives the reviewed qualitative cue from structure, not event prose", () => {
    const changedProse: TurnEvent[] = fixture.input.events.map((event) => ({
      ...event,
      summary: "意味解析に使ってはいけない任意の文章",
    }));
    const original = buildPromptMechanicalEvidence({
      evidence: [committed],
      events: fixture.input.events,
    });
    const rewritten = buildPromptMechanicalEvidence({
      evidence: [committed],
      events: changedProse,
    });
    assert.deepEqual(rewritten, original);
    assert.deepEqual(original, [{
      eventId: "event.dark.impact.1",
      kind: "impact",
      actorSide: "a",
      targetSides: ["b"],
      parameterClass: "vitality",
      direction: "loss",
      absoluteBand: "heavy",
      relativeBand: "not_applicable",
      outcome: "effective",
      handFeelRequired: true,
    }]);
    assert.equal(JSON.stringify(original).includes("beforeValue"), false);
    assert.equal(JSON.stringify(original).includes("afterValue"), false);
    assert.equal(JSON.stringify(original).includes("delta"), false);
  });

  it("omits parameter cues when the event lacks structured key and direction", () => {
    const ambiguousEvent: TurnEvent = {
      id: "event.parameter.1",
      type: "parameter",
      actorSide: "a",
      targetSides: ["b"],
      sourceActionId: "action.dark.1",
      intensity: "heavy",
      summary: "文章から増減方向を推測してはならない",
    };
    const cues = buildPromptMechanicalEvidence({
      evidence: [{
        ...committed,
        basisEventIds: ["event.parameter.1"],
        parameterKey: "stamina",
      }],
      events: [ambiguousEvent],
    });
    assert.deepEqual(cues, []);
  });

  it("rejects the whole sensory section when a source is not committed", () => {
    const valid = validateSensoryEvidence({
      raw: fixture.expectedSensoryEvidence,
      before: fixture.input.before,
      events: fixture.input.events,
      providerStatus: "valid",
    });
    assert.equal(valid.status, "valid");

    const invalid = validateSensoryEvidence({
      raw: [{
        ...fixture.expectedSensoryEvidence[0]!,
        source: { kind: "entity", entityId: "entity.not-committed" },
      }],
      before: fixture.input.before,
      events: fixture.input.events,
      providerStatus: "valid",
    });
    assert.equal(invalid.status, "rejected");
    assert.deepEqual(invalid.evidence, []);
  });
});
