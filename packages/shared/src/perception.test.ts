import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CharacterPerceptionFrameASchema,
  CharacterPerceptionFrameSchema,
  NarrationPerceptionViewSchema,
  ObserverContactRegistrySchema,
  PERCEPTION_LIMITS,
  PerceptionEvidenceSchema,
  QuantizedChangeSchema,
  type CharacterPerceptionFrame,
  type Percept,
} from "./perception.js";

function percept(id: string): Percept {
  return {
    perceptId: id,
    modality: "sound",
    phenomenon: "暗がりから鈍い衝突音が響く",
    direction: "front",
    distance: "mid",
    salience: "prominent",
    occurrenceCertainty: "certain",
    attributionCertainty: "possible",
  };
}

function frame(side: "a" | "b" = "a"): CharacterPerceptionFrame {
  return {
    schemaVersion: 1,
    observer: { side, self: "self" },
    turn: 3,
    revision: 2,
    self: {
      subject: { kind: "self" },
      currentAccess: "clear",
      identityKnowledge: "identified",
      perceivedAs: "自分自身",
      percepts: [{
        ...percept("percept.self.1"),
        modality: "proprioception",
        phenomenon: "腕に重い衝撃と痺れを感じる",
        attributionCertainty: "certain",
      }],
    },
    counterpart: {
      subject: { kind: "counterpart" },
      currentAccess: "none",
      identityKnowledge: "unknown",
      perceivedAs: "知覚できない",
      percepts: [],
    },
    others: [{
      subject: { kind: "contact", contactId: `contact.${side}.1` },
      currentAccess: "trace",
      identityKnowledge: "unknown",
      perceivedAs: "どこからともなく聞こえる足音",
      percepts: [percept("percept.contact.1")],
    }],
    qualitativeChanges: [{
      parameterKey: "hp",
      parameterClass: "vitality",
      direction: "loss",
      absoluteBand: "heavy",
      relativeBand: "light",
      sourceKnowledge: "unknown",
      targetKnowledge: "self",
      outcome: "effective",
    }],
    reserveCues: [{
      subject: { kind: "self" },
      parameterKey: "stamina",
      absoluteBand: "taxed",
      relativeBand: "low",
      certainty: "certain",
    }],
    latestDiff: {
      fromRevision: 1,
      toRevision: 2,
      addedOrUpdatedPerceptIds: [
        "percept.self.1",
        "percept.contact.1",
      ],
      removedPerceptIds: [],
    },
  };
}

describe("observer-relative perception schemas", () => {
  it("accepts explicit self and an inaccessible unidentified counterpart", () => {
    const parsed = CharacterPerceptionFrameSchema.parse(frame());
    assert.equal(parsed.self.subject.kind, "self");
    assert.equal(parsed.self.identityKnowledge, "identified");
    assert.equal(parsed.counterpart.currentAccess, "none");
    assert.equal(parsed.counterpart.identityKnowledge, "unknown");
    assert.equal(parsed.others[0]?.subject.kind, "contact");
  });

  it("rejects hidden canonical source mappings in character-facing percepts", () => {
    const candidate = structuredClone(frame()) as unknown as Record<string, unknown>;
    const others = candidate.others as Array<Record<string, unknown>>;
    const percepts = others[0]?.percepts as Array<Record<string, unknown>>;
    percepts[0]!.entityId = "character.b";
    assert.equal(CharacterPerceptionFrameSchema.safeParse(candidate).success, false);
  });

  it("requires the self and counterpart subject roles", () => {
    const candidate = frame();
    candidate.self = {
      ...candidate.self,
      subject: { kind: "counterpart" },
    };
    assert.equal(CharacterPerceptionFrameSchema.safeParse(candidate).success, false);
  });

  it("bounds percepts across all frame slots rather than per slot only", () => {
    const candidate = frame();
    candidate.self.percepts = Array.from(
      { length: PERCEPTION_LIMITS.maxPerceptsPerFrame },
      (_, index) => percept(`percept.self.${index + 1}`),
    );
    assert.equal(CharacterPerceptionFrameSchema.safeParse(candidate).success, false);
  });

  it("keeps observer-local contact ids side scoped", () => {
    assert.equal(CharacterPerceptionFrameASchema.safeParse(frame("a")).success, true);
    assert.equal(CharacterPerceptionFrameASchema.safeParse(frame("b")).success, false);

    const candidate = frame("a");
    candidate.others[0]!.subject = {
      kind: "contact",
      contactId: "contact.b.1",
    };
    assert.equal(CharacterPerceptionFrameSchema.safeParse(candidate).success, false);
  });

  it("separates unchanged and effective qualitative outcomes", () => {
    assert.equal(QuantizedChangeSchema.safeParse({
      parameterKey: "stamina",
      parameterClass: "stamina",
      direction: "unchanged",
      absoluteBand: "none",
      relativeBand: "none",
      sourceKnowledge: "unknown",
      targetKnowledge: "self",
      outcome: "immune",
    }).success, true);
    assert.equal(QuantizedChangeSchema.safeParse({
      parameterKey: "hp",
      parameterClass: "stamina",
      direction: "loss",
      absoluteBand: "none",
      relativeBand: "solid",
      sourceKnowledge: "identified",
      targetKnowledge: "self",
      outcome: "effective",
    }).success, false);
  });

  it("keeps canonical evidence sources in the server-only contract", () => {
    const result = PerceptionEvidenceSchema.safeParse({
      evidenceId: "evidence.sound.1",
      basisEventIds: ["event.turn.3"],
      modality: "sound",
      phenomenon: "階段の方角から足音が響く",
      source: { kind: "entity", entityId: "character.b" },
      accessBySide: {
        a: {
          currentAccess: "trace",
          identityKnowledge: "unknown",
          perceivedAs: "どこからともなく聞こえる足音",
          occurrenceCertainty: "certain",
          attributionCertainty: "unknown",
        },
        b: {
          currentAccess: "clear",
          identityKnowledge: "identified",
          perceivedAs: "自分の足音",
          occurrenceCertainty: "certain",
          attributionCertainty: "certain",
        },
      },
      publicAccess: {
        currentAccess: "trace",
        identityKnowledge: "unknown",
        perceivedAs: "響く足音",
        occurrenceCertainty: "certain",
        attributionCertainty: "unknown",
      },
    });
    assert.equal(result.success, true);
  });

  it("bounds contact continuity and requires a strictly increasing sequence", () => {
    const contact = (sequence: number) => ({
      contactId: `contact.a.${sequence}`,
      currentAccess: "none" as const,
      identityKnowledge: "unknown" as const,
      identifiedRef: null,
      perceivedAs: "見失った気配",
      salience: "background" as const,
      lastObservedTurn: 2,
      sourceSet: [{ kind: "evidence" as const, evidenceId: `evidence.${sequence}` }],
    });
    assert.equal(ObserverContactRegistrySchema.safeParse({
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: 3,
      contacts: [contact(1), contact(2)],
    }).success, true);
    assert.equal(ObserverContactRegistrySchema.safeParse({
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: 2,
      contacts: [contact(2)],
    }).success, false);
    assert.equal(ObserverContactRegistrySchema.safeParse({
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: PERCEPTION_LIMITS.maxContactRegistryEntries + 2,
      contacts: Array.from(
        { length: PERCEPTION_LIMITS.maxContactRegistryEntries + 1 },
        (_, index) => contact(index + 1),
      ),
    }).success, false);
  });

  it("allows control ids for omniscient narration but forbids them externally", () => {
    assert.equal(NarrationPerceptionViewSchema.safeParse({
      schemaVersion: 1,
      mode: "omniscient",
      viewpointSide: null,
      references: [{
        controlId: "character.a",
        renderLabel: "剣士",
        relation: "self",
      }],
    }).success, true);
    assert.equal(NarrationPerceptionViewSchema.safeParse({
      schemaVersion: 1,
      mode: "external",
      viewpointSide: null,
      references: [{
        controlId: "character.a",
        renderLabel: "剣士",
        relation: "self",
      }],
    }).success, false);
  });
});
