import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TurnEventSchema, type TurnEvent } from "./battle.js";

type Fits<T> = T extends TurnEvent ? true : false;
const missingUtterance: Fits<{ type: "utterance"; summary: string }> = false;
const mixedSources: Fits<{ type: "info"; summary: string; sourceActionId: string; sourceEffectId: string }> = false;
const wrongPayload: Fits<{ type: "info"; summary: string; utterance: { text: string } }> = false;

describe("turn event conditional contracts", () => {
  it("rejects missing expression payloads and mixed source ownership", () => {
    assert.deepEqual([missingUtterance, mixedSources, wrongPayload], [false, false, false]);
    for (const event of [
      { type: "utterance", summary: "spoken" },
      { type: "manifestation", summary: "visible" },
      { type: "info", summary: "cause", sourceActionId: "a", sourceEffectId: "e" },
    ]) assert.equal(TurnEventSchema.safeParse(event).success, false);
  });

  it("preserves producer expression and source fields", () => {
    const event: TurnEvent = {
      type: "utterance", id: "utterance.a", actorSide: "a", summary: "expression",
      sourceActionId: "action.original",
      utterance: { text: "生成元の発話", delivery: "spoken", volume: "quiet", articulation: "impaired", language: "original" },
    };
    assert.deepEqual(TurnEventSchema.parse(event), event);
    const manifestation: TurnEvent = {
      type: "manifestation", id: "manifestation.b", actorSide: "b", summary: "expression",
      sourceEffectId: "effect.original",
      manifestation: { modality: "posture", description: "生成元の動作", sourceEventIds: ["event.original"], carrierEventId: "event.original" },
    };
    assert.deepEqual(TurnEventSchema.parse(manifestation), manifestation);
  });
});
