import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildManifestationPerceptionEvidenceV2,
  buildUtterancePerceptionEvidence,
  commitCharacterObservableManifestationsV2,
  selectCharacterNarrativeCuesV2,
  validateCharacterPsycheProjectionEvidenceV2,
  type CharacterObservableManifestationV2,
  type TurnEvent,
  type TurnObservationPacket,
} from "./index.js";

const packet: TurnObservationPacket = {
  schemaVersion: 1,
  turn: 3,
  observerSide: "a",
  selfResult: [{
    phenomenon: "攻撃を受け止めた",
    certainty: "certain",
    sourceEventIds: ["event.hit.3"],
  }],
  counterpartResult: [],
  ambientChange: [],
};

const proposal: CharacterObservableManifestationV2 = {
  modality: "expression",
  proposal: "一瞬だけ眉が揺れる。",
  sourceEventIds: ["event.hit.3"],
};

function expressionEvents(side: "a" | "b"): TurnEvent[] {
  return [{
    id: "event.hit.3",
    type: "damage",
    actorSide: side === "a" ? "b" : "a",
    targetSides: [side],
    summary: "攻撃が命中した。",
  }, {
    id: `event.utterance.3.${side}`,
    type: "utterance",
    actorSide: side,
    actorName: side.toUpperCase(),
    utterance: {
      text: "まだだ。",
      delivery: "spoken",
      volume: "normal",
      articulation: "clear",
      language: "ja",
    },
    summary: `${side.toUpperCase()}が発話した。`,
  }];
}

describe("structured character manifestation boundary", () => {
  it("drops a private proposal that is not grounded in the observer packet", () => {
    const result = validateCharacterPsycheProjectionEvidenceV2({
      packet,
      manifestations: [
        proposal,
        { ...proposal, sourceEventIds: ["event.hidden"] },
      ],
      narrativeCues: [{
        access: "self_inner",
        description: "受け止めた衝撃を意識する。",
        sourceEventIds: ["event.hit.3"],
      }],
    });
    assert.deepEqual(result.manifestations, [proposal]);
    assert.equal(result.narrativeCues.length, 1);
  });

  it("keeps a proposal invisible until a carrier expression commits", () => {
    assert.deepEqual(commitCharacterObservableManifestationsV2({
      turn: 3,
      actorSide: "a",
      actorName: "A",
      proposals: [proposal],
      committedEvents: expressionEvents("a").slice(0, 1),
    }), []);

    const committedEvents = expressionEvents("a");
    const committed = commitCharacterObservableManifestationsV2({
      turn: 3,
      actorSide: "a",
      actorName: "A",
      proposals: [proposal],
      committedEvents,
    });
    assert.equal(committed[0]?.type, "manifestation");
    const carrierEvidence = buildUtterancePerceptionEvidence({
      events: committedEvents,
    });
    const evidence = buildManifestationPerceptionEvidenceV2({
      events: committed,
      carrierEvidence,
    });
    assert.equal(evidence[0]?.phenomenon, proposal.proposal);
    assert.equal(evidence[0]?.accessBySide.b.currentAccess, "clear");
    assert.equal(
      evidence[0]?.accessBySide.b.perceivedPhenomenon,
      proposal.proposal,
    );
    assert.deepEqual(selectCharacterNarrativeCuesV2({
      side: "a",
      focus: "external",
      proposedCues: [{
        access: "external_observable",
        description: proposal.proposal,
        sourceEventIds: [committed[0]!.id!],
      }],
      committedEvents: [...committedEvents, ...committed],
      manifestationEvidence: evidence,
    }).map((cue) => cue.description), [proposal.proposal]);
  });

  it("preserves structure when A and B are swapped", () => {
    const normalize = (side: "a" | "b") => commitCharacterObservableManifestationsV2({
      turn: 3,
      actorSide: side,
      actorName: side.toUpperCase(),
      proposals: [proposal],
      committedEvents: expressionEvents(side),
    }).map((event) => ({
      type: event.type,
      actor: "self",
      modality: event.manifestation?.modality,
      description: event.manifestation?.description,
      sources: event.manifestation?.sourceEventIds,
    }));
    assert.deepEqual(normalize("a"), normalize("b"));
  });
});
