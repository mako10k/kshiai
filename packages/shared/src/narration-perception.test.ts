import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  BattleSemanticState,
  SemanticObservationState,
} from "./semantic-state.js";
import type {
  CharacterPerceptionFrame,
  ObserverContactRegistry,
} from "./perception.js";
import {
  buildNarrationIdentifierCatalog,
  buildNarrationPerceptionView,
  buildNarrationTurnView,
  repairNarrativeBlockIdentifiers,
} from "./narration-perception.js";
import type {
  NarrationFocus,
  NarrationPerspective,
} from "./narration-perspective.js";

function frame(side: "a" | "b"): CharacterPerceptionFrame {
  return {
    schemaVersion: 1,
    observer: { side, self: "self" },
    turn: 4,
    revision: 2,
    self: {
      subject: { kind: "self" },
      currentAccess: "clear",
      identityKnowledge: "identified",
      perceivedAs: "自分自身",
      percepts: [{
        perceptId: `percept.${side}.self`,
        modality: "proprioception",
        phenomenon: "腕に重い手応えを感じる",
        direction: "unknown",
        distance: "contact",
        salience: "prominent",
        occurrenceCertainty: "certain",
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
      perceivedAs: "暗がりから聞こえる足音",
      percepts: [{
        perceptId: `percept.${side}.footstep`,
        modality: "sound",
        phenomenon: "どこからともなく足音が聞こえる",
        direction: "unknown",
        distance: "mid",
        salience: "noticeable",
        occurrenceCertainty: "certain",
        attributionCertainty: "unknown",
      }],
    }],
    qualitativeChanges: [],
    reserveCues: [],
    latestDiff: {
      fromRevision: 1,
      toRevision: 2,
      addedOrUpdatedPerceptIds: [
        `percept.${side}.self`,
        `percept.${side}.footstep`,
      ],
      removedPerceptIds: [`percept.${side}.gone`],
    },
  };
}

const semanticState: BattleSemanticState = {
  schemaVersion: 1,
  revision: 2,
  scene: { summary: "暗い広間", facts: {} },
  entities: {
    "character.a": {
      kind: "character",
      label: "アオ",
      location: { type: "scene", area: "西側" },
      active: true,
      createdTurn: 0,
      updatedTurn: 2,
      facts: {},
    },
    "character.b": {
      kind: "character",
      label: "クロ",
      location: { type: "scene", area: "東側" },
      active: true,
      createdTurn: 0,
      updatedTurn: 2,
      facts: {},
    },
    "relic.hidden": {
      kind: "object",
      label: "秘宝",
      location: { type: "scene", area: "暗がり" },
      active: true,
      createdTurn: 1,
      updatedTurn: 2,
      facts: {},
      visibleTo: ["b"],
    },
  },
};

function observedEntity(entityId: "character.a" | "character.b") {
  const { visibleTo: _visibleTo, ...entity } = semanticState.entities[entityId]!;
  return entity;
}

const publicObservation: SemanticObservationState = {
  snapshot: {
    revision: 2,
    scene: semanticState.scene,
    entities: {
      "character.a": observedEntity("character.a"),
      "character.b": observedEntity("character.b"),
    },
  },
  latestDiff: {
    fromRevision: 1,
    toRevision: 2,
    operations: [],
  },
};

function projectionInput(
  perspective: NarrationPerspective,
  focus: NarrationFocus,
) {
  return {
    perspective,
    focus,
    sideALabel: "アオ",
    sideBLabel: "クロ",
    frameA: frame("a"),
    frameB: frame("b"),
    semanticState,
    publicObservation,
  };
}

describe("narration perception views", () => {
  it("marks the player and opponent viewpoint subjects explicitly", () => {
    const self = buildNarrationPerceptionView(projectionInput("self", "self"));
    assert.equal(self.mode, "self");
    assert.equal(self.viewpointSide, "a");
    assert.equal(self.viewpointSubject, "self");
    assert.equal(self.frame.observer.side, "a");
    assert.equal(
      self.references.find((reference) => reference.controlId === "self")
        ?.renderLabel,
      "アオ",
    );
    assert.equal(
      self.references.some((reference) => reference.controlId === "character.b"),
      false,
    );

    const opponent = buildNarrationPerceptionView(projectionInput("foe", "foe"));
    assert.equal(opponent.mode, "opponent");
    assert.equal(opponent.viewpointSide, "b");
    assert.equal(opponent.viewpointSubject, "opponent");
    assert.equal(opponent.frame.observer.side, "b");
    assert.equal(
      opponent.references.find((reference) =>
        reference.controlId === "opponent"
      )?.renderLabel,
      "クロ",
    );
  });

  it("supplies every canonical ID only to omniscient narration", () => {
    const omniscient = buildNarrationPerceptionView(
      projectionInput("omniscient", "both"),
    );
    assert.equal(omniscient.mode, "omniscient");
    assert.deepEqual(
      omniscient.references.map((reference) => reference.controlId).sort(),
      ["character.a", "character.b", "relic.hidden"],
    );
    assert.equal(
      omniscient.references.every((reference) => reference.renderLabel.length > 0),
      true,
    );

    const external = buildNarrationPerceptionView(
      projectionInput("external", "external"),
    );
    assert.equal(external.mode, "external");
    assert.equal(
      external.references.some((reference) => "controlId" in reference),
      false,
    );
    assert.equal(JSON.stringify(external).includes("relic.hidden"), false);
    assert.deepEqual(
      external.references.map((reference) => reference.renderLabel).sort(),
      ["アオ", "クロ"],
    );
  });

  it("maps every fluid focus to the matching view without another model step", () => {
    const cases: Array<[NarrationFocus, string]> = [
      ["self", "self"],
      ["foe", "opponent"],
      ["both", "omniscient"],
      ["external", "external"],
    ];
    for (const [focus, mode] of cases) {
      const view = buildNarrationPerceptionView(projectionInput("fluid", focus));
      assert.equal(view.mode, mode);
      assert.equal(view.resolvedFromFluid, true);
    }
  });

  it("repairs exact IDs in paragraphs, speaker names, and dialogue", () => {
    const view = buildNarrationPerceptionView(projectionInput("self", "self"));
    const registryA: ObserverContactRegistry = {
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: 2,
      contacts: [{
        contactId: "contact.a.1",
        currentAccess: "trace",
        identityKnowledge: "unknown",
        identifiedRef: null,
        perceivedAs: "暗がりから聞こえる足音",
        salience: "noticeable",
        lastObservedTurn: 4,
        sourceSet: [{ kind: "entity", entityId: "relic.hidden" }],
      }],
    };
    const catalog = buildNarrationIdentifierCatalog({
      ...projectionInput("self", "self"),
      registryA,
      view,
    });
    const repaired = repairNarrativeBlockIdentifiers({
      turn: 4,
      narrator: [
        "character.bの方角からcontact.a.1とpercept.a.footstepを感じた。",
      ],
      speeches: [{
        speaker: "character.a",
        text: "contact.a.1――そこにいるのか、character.b？",
      }],
    }, catalog);

    assert.equal(JSON.stringify(repaired).includes("character."), false);
    assert.equal(JSON.stringify(repaired).includes("contact.a.1"), false);
    assert.equal(JSON.stringify(repaired).includes("percept.a.footstep"), false);
    assert.equal(repaired.speeches[0]?.speaker, "アオ");
    assert.match(repaired.narrator[0]!, /知覚できない/);
    assert.match(repaired.narrator[0]!, /暗がりから聞こえる足音/);
  });

  it("derives A and B narrator inputs without crossing their observation boundary", () => {
    const actionBeats = [
      {
        actionId: "action.a.4",
        actorSide: "a" as const,
        actorName: "アオ",
        actionName: "探る一撃",
        description: "アオがクロのいる暗がりへ踏み込む",
        outcomes: ["character.bへ重い変化"],
      },
      {
        actionId: "action.b.4",
        actorSide: "b" as const,
        actorName: "クロ",
        actionName: "影の応答",
        description: "クロがrelic.hiddenの近くから応じる",
        outcomes: ["アオが反応した"],
      },
    ];
    const events = [{
      id: "event.hidden.4",
      type: "info" as const,
      summary: "クロがrelic.hiddenからアオを狙った",
    }];
    const selfPerception = buildNarrationPerceptionView(
      projectionInput("self", "self"),
    );
    const self = buildNarrationTurnView({
      ...projectionInput("self", "self"),
      turn: 4,
      scene: "暗い広間",
      perception: selfPerception,
      events,
      actionBeats,
    });
    assert.equal(self.actionBeats.length, 1);
    assert.equal(Object.isFrozen(self), true);
    assert.equal(self.perception.mode, "self");
    if (self.perception.mode === "self") {
      assert.equal(Object.isFrozen(self.perception.frame), true);
    }
    assert.equal(self.actionBeats[0]?.actorLabel, "アオ");
    assert.equal(self.participantLabels.b, "知覚できない");
    assert.equal(JSON.stringify(self).includes("character.b"), false);
    assert.equal(JSON.stringify(self).includes("relic.hidden"), false);
    assert.equal(JSON.stringify(self).includes("クロ"), false);

    const opponentPerception = buildNarrationPerceptionView(
      projectionInput("foe", "foe"),
    );
    const opponent = buildNarrationTurnView({
      ...projectionInput("foe", "foe"),
      turn: 4,
      scene: "暗い広間",
      perception: opponentPerception,
      events,
      actionBeats,
    });
    assert.equal(opponent.actionBeats.length, 1);
    assert.equal(opponent.actionBeats[0]?.actorLabel, "クロ");
    assert.equal(opponent.participantLabels.a, "知覚できない");
    assert.equal(JSON.stringify(opponent).includes("character.a"), false);

    const externalPerception = buildNarrationPerceptionView(
      projectionInput("external", "external"),
    );
    const external = buildNarrationTurnView({
      ...projectionInput("external", "external"),
      turn: 4,
      scene: "暗い広間",
      perception: externalPerception,
      events,
      actionBeats,
    });
    assert.equal(external.actionBeats.length, 2);
    assert.equal(JSON.stringify(external).includes("character."), false);
    assert.equal(JSON.stringify(external).includes("relic.hidden"), false);
    assert.equal(JSON.stringify(external).includes("event.hidden.4"), false);
  });
});
