import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBattleSemanticState } from "./semantic-state.js";
import {
  PERCEPTION_LIMITS,
  type BattleSide,
  type ObserverContactRegistry,
  type PerceptionAccess,
  type PerceptionEvidence,
  type QuantizedMechanicalEvidence,
  type ServerOnlyReserveCue,
} from "./perception.js";
import {
  buildMinimalObserverPerception,
  projectObserverPerception,
} from "./perception-projection.js";

function access(
  currentAccess: PerceptionAccess["currentAccess"],
  identityKnowledge: PerceptionAccess["identityKnowledge"],
  perceivedAs: string,
): PerceptionAccess {
  return {
    currentAccess,
    identityKnowledge,
    perceivedAs,
    direction: currentAccess === "none" ? "unknown" : "front",
    distance: currentAccess === "none" ? "unknown" : "mid",
    occurrenceCertainty: currentAccess === "none" ? "unknown" : "certain",
    attributionCertainty: identityKnowledge === "identified"
      ? "certain"
      : identityKnowledge === "suspected"
        ? "possible"
        : "unknown",
  };
}

function evidence(input: {
  id: string;
  source: PerceptionEvidence["source"];
  a: PerceptionAccess;
  b?: PerceptionAccess;
  modality?: PerceptionEvidence["modality"];
  eventId?: string;
  phenomenon?: string;
}): PerceptionEvidence {
  return {
    evidenceId: input.id,
    basisEventIds: input.eventId ? [input.eventId] : [],
    modality: input.modality ?? "sound",
    phenomenon: input.phenomenon ?? "何かが動く気配を感じる",
    source: input.source,
    accessBySide: {
      a: input.a,
      b: input.b ?? access("none", "unknown", "知覚できない"),
    },
    publicAccess: access("none", "unknown", "知覚できない"),
  };
}

function semanticState(extraEntityIds: string[] = []) {
  return createBattleSemanticState({
    scene: "暗い石造りの広間",
    sideA: { displayName: "観測者アルファ" },
    sideB: { displayName: "秘匿名ベータ" },
    seed: {
      sceneFacts: {},
      entities: Object.fromEntries(extraEntityIds.map((id) => [id, {
        kind: "other" as const,
        label: `存在 ${id}`,
        location: { type: "scene" as const, area: "広間" },
        active: true,
        facts: {},
      }])),
    },
  });
}

function mechanical(input: {
  id: string;
  actorSide: BattleSide | null;
  targetSide: BattleSide;
  eventId: string;
  direction?: "loss" | "gain" | "unchanged";
}): QuantizedMechanicalEvidence {
  const direction = input.direction ?? "loss";
  return {
    evidenceId: input.id,
    turn: 1,
    sourceActionId: input.actorSide ? `action.${input.id}` : null,
    basisEventIds: [input.eventId],
    actorSide: input.actorSide,
    target: {
      side: input.targetSide,
      entityId: `character.${input.targetSide}`,
    },
    change: {
      parameterKey: "hp",
      parameterClass: "vitality",
      direction,
      absoluteBand: direction === "unchanged" ? "none" : "heavy",
      relativeBand: direction === "unchanged" ? "none" : "solid",
      outcome: direction === "unchanged" ? "immune" : "effective",
    },
  };
}

function reserves(side: BattleSide): ServerOnlyReserveCue[] {
  return ["hp", "mp", "stamina", "focus"].map((parameterKey) => ({
    side,
    targetEntityId: `character.${side}`,
    parameterKey: parameterKey as ServerOnlyReserveCue["parameterKey"],
    absoluteBand: "taxed" as const,
    relativeBand: "low" as const,
  }));
}

function emptyRegistry(side: BattleSide): ObserverContactRegistry {
  return {
    schemaVersion: 1,
    observerSide: side,
    nextContactSequence: 1,
    contacts: [],
  };
}

describe("observer perception projection", () => {
  it("separates self, an unknown counterpart contact, ambient cues, and raw-free mechanics", () => {
    const projected = projectObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState: semanticState(),
      events: [{
        id: "event.hit",
        type: "damage",
        intensity: "heavy",
        summary: "構造化イベント",
      }],
      quantizedMechanicalEvidence: [
        mechanical({
          id: "mechanical.delivered",
          actorSide: "a",
          targetSide: "b",
          eventId: "event.hit",
        }),
        mechanical({
          id: "mechanical.received",
          actorSide: "b",
          targetSide: "a",
          eventId: "event.hit",
        }),
      ],
      reserveEvidence: reserves("a"),
      previousRegistry: emptyRegistry("a"),
      sensoryEvidence: [
        evidence({
          id: "evidence.self.touch",
          source: { kind: "entity", entityId: "character.a" },
          a: access("clear", "identified", "自分の腕"),
          modality: "proprioception",
          eventId: "event.hit",
          phenomenon: "腕に強い反動を感じる",
        }),
        evidence({
          id: "evidence.unknown.sound",
          source: { kind: "entity", entityId: "character.b" },
          a: access(
            "trace",
            "unknown",
            "秘匿名ベータらしきcharacter.bの衝突音",
          ),
          eventId: "event.hit",
          phenomenon: "秘匿名ベータが暗い石造りの広間にいる音が聞こえる",
        }),
        evidence({
          id: "evidence.unknown.smell",
          source: { kind: "entity", entityId: "character.b" },
          a: access("coarse", "unknown", "焦げた匂いを伴う気配"),
          modality: "smell",
          eventId: "event.hit",
          phenomenon: "焦げた匂いが漂う",
        }),
        evidence({
          id: "evidence.ambient",
          source: { kind: "ambient" },
          a: access("trace", "unknown", "場を満たす圧迫感"),
          modality: "atmosphere",
          phenomenon: "空気が重く沈む",
        }),
      ],
    });

    assert.equal(projected.frame.self.percepts.length, 1);
    assert.equal(projected.frame.counterpart.currentAccess, "none");
    assert.equal(projected.frame.counterpart.identityKnowledge, "unknown");
    const contact = projected.frame.others.find((slot) =>
      slot.subject.kind === "contact"
    );
    assert.equal(contact?.percepts.length, 2);
    assert.equal(contact?.currentAccess, "coarse");
    assert.ok(projected.frame.others.some((slot) =>
      slot.subject.kind === "ambient"
    ));
    assert.deepEqual(
      projected.frame.qualitativeChanges.map((change) => [
        change.sourceKnowledge,
        change.targetKnowledge,
      ]),
      [["self", "contact"], ["contact", "self"]],
    );
    assert.equal(projected.frame.reserveCues.length, 4);
    assert.equal(JSON.stringify(projected.frame).includes("character.b"), false);
    assert.equal(
      JSON.stringify(projected.frame).includes("evidence.unknown.sound"),
      false,
    );
    assert.equal(JSON.stringify(projected.frame).includes("秘匿名ベータ"), false);
    assert.equal(
      JSON.stringify(projected.frame).includes("暗い石造りの広間"),
      false,
    );
    assert.equal(
      projected.registry.contacts[0]?.sourceSet[0]?.kind,
      "entity",
    );
    assert.equal(Object.isFrozen(projected.frame), true);
    assert.equal(Object.isFrozen(projected.frame.self.percepts), true);
  });

  it("reuses contacts, preserves lost identity, and promotes a later identification prospectively", () => {
    const state = semanticState();
    const first = projectObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousRegistry: emptyRegistry("a"),
      sensoryEvidence: [evidence({
        id: "evidence.step.1",
        source: { kind: "entity", entityId: "character.b" },
        a: access("trace", "unknown", "正体不明の足音"),
      })],
    });
    const second = projectObserverPerception({
      observerSide: "a",
      turn: 2,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousFrame: first.frame,
      previousRegistry: first.registry,
      sensoryEvidence: [evidence({
        id: "evidence.step.2",
        source: { kind: "entity", entityId: "character.b" },
        a: access("coarse", "unknown", "闇の中の人影"),
      })],
    });
    assert.equal(second.registry.contacts[0]?.contactId, "contact.a.1");
    assert.equal(second.registry.nextContactSequence, 2);

    const lost = projectObserverPerception({
      observerSide: "a",
      turn: 3,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousFrame: second.frame,
      previousRegistry: second.registry,
      sensoryEvidence: [],
    });
    assert.equal(lost.registry.contacts[0]?.currentAccess, "none");
    assert.equal(lost.frame.others[0]?.currentAccess, "none");

    const identified = projectObserverPerception({
      observerSide: "a",
      turn: 4,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousFrame: lost.frame,
      previousRegistry: lost.registry,
      sensoryEvidence: [evidence({
        id: "evidence.reveal",
        source: { kind: "entity", entityId: "character.b" },
        a: access("clear", "identified", "B"),
        modality: "vision",
      })],
    });
    assert.equal(identified.frame.counterpart.identityKnowledge, "identified");
    assert.equal(identified.frame.counterpart.currentAccess, "clear");
    assert.equal(identified.registry.contacts[0]?.contactId, "contact.a.1");
    assert.equal(identified.registry.contacts[0]?.identifiedRef, "character.b");
    assert.equal(
      identified.frame.others.some((slot) => slot.subject.kind === "contact"),
      false,
    );

    const obscuredAgain = projectObserverPerception({
      observerSide: "a",
      turn: 5,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousFrame: identified.frame,
      previousRegistry: identified.registry,
      sensoryEvidence: [evidence({
        id: "evidence.obscured.again",
        source: { kind: "entity", entityId: "character.b" },
        a: access("trace", "unknown", "誰のものか分からない足音"),
      })],
    });
    assert.equal(obscuredAgain.frame.counterpart.identityKnowledge, "identified");
    assert.equal(obscuredAgain.frame.counterpart.currentAccess, "none");
    assert.equal(
      obscuredAgain.frame.others.find((slot) => slot.subject.kind === "contact")
        ?.subject.kind,
      "contact",
    );
    assert.equal(obscuredAgain.registry.nextContactSequence, 3);

    const identifiedButLost = projectObserverPerception({
      observerSide: "a",
      turn: 6,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousFrame: obscuredAgain.frame,
      previousRegistry: obscuredAgain.registry,
      sensoryEvidence: [],
    });
    assert.equal(
      identifiedButLost.frame.counterpart.identityKnowledge,
      "identified",
    );
    assert.equal(identifiedButLost.frame.counterpart.currentAccess, "none");
  });

  it("splits an ambiguous group only into newly numbered future contacts", () => {
    const state = semanticState(["hidden.one", "hidden.two"]);
    const ambiguous = projectObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState: state,
      events: [{ id: "event.shared", type: "info", summary: "重なる影" }],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousRegistry: emptyRegistry("a"),
      sensoryEvidence: [
        evidence({
          id: "evidence.ambiguous.one",
          source: { kind: "entity", entityId: "hidden.one" },
          a: access("coarse", "unknown", "重なって見える複数の影"),
          eventId: "event.shared",
        }),
        evidence({
          id: "evidence.ambiguous.two",
          source: { kind: "entity", entityId: "hidden.two" },
          a: access("coarse", "unknown", "重なって見える複数の影"),
          eventId: "event.shared",
        }),
      ],
    });
    assert.equal(ambiguous.registry.contacts.length, 1);
    assert.equal(ambiguous.registry.contacts[0]?.sourceSet.length, 2);
    assert.equal(ambiguous.frame.others[0]?.percepts.length, 2);

    const projected = projectObserverPerception({
      observerSide: "a",
      turn: 2,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousFrame: ambiguous.frame,
      previousRegistry: ambiguous.registry,
      sensoryEvidence: [
        evidence({
          id: "evidence.one",
          source: { kind: "entity", entityId: "hidden.one" },
          a: access("clear", "unknown", "左側の影"),
        }),
        evidence({
          id: "evidence.two",
          source: { kind: "entity", entityId: "hidden.two" },
          a: access("clear", "unknown", "右側の影"),
        }),
      ],
    });
    assert.deepEqual(
      projected.registry.contacts.map((entry) => [
        entry.contactId,
        entry.currentAccess,
      ]),
      [
        ["contact.a.1", "none"],
        ["contact.a.2", "clear"],
        ["contact.a.3", "clear"],
      ],
    );
    assert.equal(projected.registry.nextContactSequence, 4);
  });

  it("evicts the oldest low-salience lost unknown contact without reusing ids", () => {
    const ids = Array.from(
      { length: PERCEPTION_LIMITS.maxContactRegistryEntries + 1 },
      (_, index) => `hidden.${index + 1}`,
    );
    const previousRegistry: ObserverContactRegistry = {
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: PERCEPTION_LIMITS.maxContactRegistryEntries + 1,
      contacts: ids.slice(0, -1).map((entityId, index) => ({
        contactId: `contact.a.${index + 1}`,
        currentAccess: "none",
        identityKnowledge: "unknown",
        identifiedRef: null,
        perceivedAs: `以前の気配 ${index + 1}`,
        salience: index === 0 ? "background" : "noticeable",
        lastObservedTurn: index === 0 ? 0 : 1,
        sourceSet: [{ kind: "entity", entityId }],
      })),
    };
    const projected = projectObserverPerception({
      observerSide: "a",
      turn: 2,
      semanticState: semanticState(ids),
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousRegistry,
      sensoryEvidence: [evidence({
        id: "evidence.new",
        source: { kind: "entity", entityId: ids.at(-1)! },
        a: access("trace", "unknown", "新しい気配"),
      })],
    });
    assert.equal(projected.registry.contacts.length, 64);
    assert.equal(
      projected.registry.contacts.some((entry) => entry.contactId === "contact.a.1"),
      false,
    );
    assert.ok(projected.registry.contacts.some((entry) =>
      entry.contactId === "contact.a.65"
    ));
    assert.equal(projected.registry.nextContactSequence, 66);
  });

  it("keeps an untracked cue ambient when no lost unknown contact can be evicted", () => {
    const ids = Array.from(
      { length: PERCEPTION_LIMITS.maxContactRegistryEntries + 1 },
      (_, index) => `known.${index + 1}`,
    );
    const previousRegistry: ObserverContactRegistry = {
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: PERCEPTION_LIMITS.maxContactRegistryEntries + 1,
      contacts: ids.slice(0, -1).map((entityId, index) => ({
        contactId: `contact.a.${index + 1}`,
        currentAccess: "none",
        identityKnowledge: "identified",
        identifiedRef: entityId,
        perceivedAs: `既知の存在 ${index + 1}`,
        salience: "background",
        lastObservedTurn: 1,
        sourceSet: [{ kind: "entity", entityId }],
      })),
    };
    const projected = projectObserverPerception({
      observerSide: "a",
      turn: 2,
      semanticState: semanticState(ids),
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousRegistry,
      sensoryEvidence: [evidence({
        id: "evidence.untracked",
        source: { kind: "entity", entityId: ids.at(-1)! },
        a: access("trace", "unknown", "追跡できない新しい気配"),
      })],
    });
    assert.equal(projected.registry.contacts.length, 64);
    assert.equal(projected.registry.nextContactSequence, 65);
    const ambient = projected.frame.others.find((slot) =>
      slot.subject.kind === "ambient"
    );
    assert.match(ambient?.percepts[0]?.perceptId ?? "", /^percept\.a\./);
    assert.equal(
      ambient?.percepts[0]?.perceptId.includes("evidence.untracked"),
      false,
    );
  });

  it("is symmetric when A and B roles are swapped", () => {
    const state = semanticState();
    const project = (side: BattleSide) => {
      const counterpart = side === "a" ? "b" : "a";
      const eventId = `event.${side}`;
      return projectObserverPerception({
        observerSide: side,
        turn: 1,
        semanticState: state,
        events: [{ id: eventId, type: "damage", summary: "hit" }],
        quantizedMechanicalEvidence: [mechanical({
          id: `mechanical.${side}`,
          actorSide: side,
          targetSide: counterpart,
          eventId,
        })],
        reserveEvidence: reserves(side),
        previousRegistry: emptyRegistry(side),
        sensoryEvidence: [evidence({
          id: `evidence.${side}`,
          source: { kind: "entity", entityId: `character.${counterpart}` },
          a: side === "a"
            ? access("trace", "unknown", "正体不明の影")
            : access("none", "unknown", "知覚できない"),
          b: side === "b"
            ? access("trace", "unknown", "正体不明の影")
            : access("none", "unknown", "知覚できない"),
          eventId,
        })],
      });
    };
    const a = project("a");
    const b = project("b");
    assert.equal(a.frame.counterpart.identityKnowledge, b.frame.counterpart.identityKnowledge);
    assert.equal(a.frame.others[0]?.currentAccess, b.frame.others[0]?.currentAccess);
    assert.deepEqual(a.frame.qualitativeChanges, b.frame.qualitativeChanges);
    assert.deepEqual(a.frame.reserveCues, b.frame.reserveCues);
    assert.equal(a.registry.contacts[0]?.contactId, "contact.a.1");
    assert.equal(b.registry.contacts[0]?.contactId, "contact.b.1");
  });

  it("retains the registry in the engine-only fallback and seeds legacy identity without access", () => {
    const state = semanticState();
    const previous = projectObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      previousRegistry: emptyRegistry("a"),
      sensoryEvidence: [evidence({
        id: "evidence.previous",
        source: { kind: "event", eventId: "event.previous" },
        a: access("trace", "unknown", "以前の気配"),
      })],
    });
    const fallback = buildMinimalObserverPerception({
      observerSide: "a",
      turn: 2,
      semanticState: state,
      quantizedMechanicalEvidence: [mechanical({
        id: "mechanical.environment",
        actorSide: null,
        targetSide: "a",
        eventId: "event.environment",
      })],
      reserveEvidence: reserves("a"),
      previousFrame: previous.frame,
      previousRegistry: previous.registry,
    });
    assert.deepEqual(fallback.registry, previous.registry);
    assert.deepEqual(fallback.frame.others, []);
    assert.equal(fallback.frame.qualitativeChanges[0]?.sourceKnowledge, "ambient");
    assert.equal(fallback.frame.qualitativeChanges[0]?.targetKnowledge, "self");
    assert.equal(fallback.frame.reserveCues.length, 4);

    const legacy = projectObserverPerception({
      observerSide: "a",
      turn: 1,
      semanticState: state,
      events: [],
      quantizedMechanicalEvidence: [],
      reserveEvidence: [],
      sensoryEvidence: [],
      legacyCounterpartIdentified: true,
    });
    assert.equal(legacy.frame.counterpart.identityKnowledge, "identified");
    assert.equal(legacy.frame.counterpart.currentAccess, "none");
  });
});
