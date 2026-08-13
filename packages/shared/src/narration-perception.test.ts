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
  buildNarrationPresentationFocus,
  buildNarrationTurnBrief,
  buildNarrationTurnView,
  NARRATION_PRESENTATION_FOCUS_MODE_V1,
  narratorRecognitionSubjects,
  repairNarrativeBlockIdentifiers,
} from "./narration-perception.js";
import type {
  NarrationFocus,
  NarrationPerspective,
} from "./narration-perspective.js";
import type { NarratorRenderingProfileAnchor } from "./profile-grounding.js";
import type { NarrationCausalProjection } from "./battle-turn-causal-receipt.js";

const profileAnchorA: NarratorRenderingProfileAnchor = {
  schemaVersion: 1,
  side: "a",
  displayName: "アオ",
  selfNames: ["私"],
  gender: "女性",
  age: null,
  appearanceSummary: "青い影",
};

const profileAnchorB: NarratorRenderingProfileAnchor = {
  schemaVersion: 1,
  side: "b",
  displayName: "クロ",
  selfNames: [],
  gender: null,
  age: null,
  appearanceSummary: "黒い影",
};

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
    profileAnchorA,
    profileAnchorB,
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

  it("offers only stable view subjects for narrator recognition updates", () => {
    const view = buildNarrationPerceptionView(projectionInput("self", "self"));
    const subjects = narratorRecognitionSubjects(view);
    assert.deepEqual(
      subjects.map((subject) => subject.subjectRef).sort(),
      ["contact.a.1", "opponent", "self"],
    );
    assert.equal(
      subjects.some((subject) => subject.subjectRef.startsWith("percept.")),
      false,
    );
  });

  it("uses an unlinked apparent identity instead of the canonical name", () => {
    const input = projectionInput("self", "self");
    input.frameA.counterpart = {
      ...input.frameA.counterpart,
      currentAccess: "clear",
      identityKnowledge: "identified",
      perceivedAs: "白狼",
      apparentIdentity: {
        form: "白い狼の姿",
        identity: "白狼",
        confidence: "probable",
        continuity: "unlinked",
      },
    };
    const view = buildNarrationPerceptionView(input);
    assert.equal(view.mode, "self");
    if (view.mode !== "self") assert.fail("expected self narration view");
    assert.equal(
      view.references.find((reference) => reference.controlId === "opponent")
        ?.renderLabel,
      "白狼",
    );
    assert.equal(JSON.stringify(view).includes("クロ"), false);
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
    assert.equal(
      external.references.every((reference) =>
        reference.subjectRef?.startsWith("reader.")
      ),
      true,
    );
    assert.equal(JSON.stringify(external).includes("relic.hidden"), false);
    assert.deepEqual(
      external.references.map((reference) => reference.renderLabel).sort(),
      ["アオ", "クロ"],
    );
    assert.deepEqual(
      narratorRecognitionSubjects(external).map((subject) => subject.perceivedAs)
        .sort(),
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
    assert.deepEqual(Object.keys(self.profileAnchors), ["a"]);
    assert.equal(self.profileAnchors.a?.gender, "女性");
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
    assert.deepEqual(Object.keys(opponent.profileAnchors), ["b"]);
    assert.equal(opponent.profileAnchors.b?.gender, null);
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
    assert.deepEqual(Object.keys(external.profileAnchors).sort(), ["a", "b"]);
    assert.equal(JSON.stringify(external).includes("character."), false);
    assert.equal(JSON.stringify(external).includes("relic.hidden"), false);
    assert.equal(JSON.stringify(external).includes("event.hidden.4"), false);

    const causalProjection: NarrationCausalProjection = {
      schemaVersion: 1,
      turn: 4,
      causalChains: [{
        actorLabel: "アオ",
        requestedKind: "skill",
        effectiveKind: "defend",
        executed: true,
        skippedReason: null,
        resolution: {
          status: "known",
          outcome: "substituted",
          reason: "required_object_unavailable",
        },
        events: [],
        mechanicalConsequences: [],
        semanticChangeKinds: [],
      }],
      observedConsequences: [],
      observedSemanticChangeKinds: [],
      continuingConditions: [],
    };
    const guarded = buildNarrationTurnView({
      ...projectionInput("external", "external"),
      turn: 4,
      scene: "暗い広間",
      perception: externalPerception,
      events,
      actionBeats,
      causalProjection,
      canonicalChange: {
        semantic: { status: "applied", changed: false },
        world: { status: "applied", changed: false, operationKinds: [] },
      },
    });
    assert.equal("causalProjection" in external, false);
    assert.deepEqual(guarded.causalProjection, causalProjection);
    assert.equal(Object.isFrozen(guarded.causalProjection), true);
    const brief = buildNarrationTurnBrief(guarded);
    assert.equal(Object.isFrozen(brief), true);
    assert.equal("outcomes" in brief.turnResult.actions[0]!, false);
    assert.match(
      brief.turnResult.actions[0]?.causality?.resolutionExplanation ?? "",
      /装備または保持物/,
    );
    assert.deepEqual(brief.turnResult.unmatchedCausality, []);
    assert.deepEqual(brief.turnResult.canonicalChange, {
      semantic: { status: "applied", changed: false },
      world: { status: "applied", changed: false, operationKinds: [] },
    });
    assert.deepEqual(brief.currentState.participantConditions, []);
    assert.equal("causalProjection" in brief, false);
  });
});

describe("narrator presentation focus", () => {
  function viewWithProjection(
    causalProjection: NarrationCausalProjection,
  ) {
    const perception = buildNarrationPerceptionView(
      projectionInput("external", "external"),
    );
    return buildNarrationTurnView({
      ...projectionInput("external", "external"),
      turn: 4,
      scene: "暗い広間",
      perception,
      events: [{
        id: "event.not-ranked",
        type: "info" as const,
        summary: "自由記述の秘密を順位付けへ使わない",
      }],
      actionBeats: causalProjection.causalChains.map((chain, index) => ({
        actionId: `action.${index}`,
        actorSide: index === 0 ? "a" as const : "b" as const,
        actorName: chain.actorLabel,
        actionName: index === 0 ? "遮断" : "突進",
        description: "順位付けへ入らない自由記述",
        outcomes: ["コピーしてはならない旧結果"],
      })),
      causalProjection,
      canonicalChange: {
        semantic: { status: "applied", changed: true },
        world: {
          status: "applied",
          changed: true,
          operationKinds: ["replace"],
        },
      },
    });
  }

  it("selects one decisive committed consequence over weaker alternatives", () => {
    const view = viewWithProjection({
      schemaVersion: 1,
      turn: 4,
      causalChains: [{
        actorLabel: "アオ",
        requestedKind: "skill",
        effectiveKind: "skill",
        executed: true,
        skippedReason: null,
        resolution: { status: "known", outcome: "accepted", reason: null },
        events: [{
          type: "damage",
          actorLabel: "アオ",
          targetLabels: ["クロ"],
          parameterKey: "hp",
          parameterDirection: "loss",
          intensity: "heavy",
        }],
        mechanicalConsequences: [{
          targetLabel: "クロ",
          change: {
            parameterKey: "hp",
            parameterClass: "vitality",
            direction: "loss",
            absoluteBand: "heavy",
            relativeBand: "solid",
            outcome: "incapacitated",
          },
        }],
        semanticChangeKinds: ["location"],
      }, {
        actorLabel: "クロ",
        requestedKind: "basic_attack",
        effectiveKind: "wait",
        executed: false,
        skippedReason: "action_infeasible",
        resolution: {
          status: "known",
          outcome: "failed",
          reason: "actor_unavailable",
        },
        events: [{
          type: "wait",
          actorLabel: "クロ",
          targetLabels: [],
        }],
        mechanicalConsequences: [],
        semanticChangeKinds: [],
      }],
      observedConsequences: [],
      observedSemanticChangeKinds: ["scene"],
      continuingConditions: [],
    });

    const focus = buildNarrationPresentationFocus(view);
    assert.deepEqual(focus, {
      schemaVersion: 1,
      phase: "impact",
      primary: {
        source: "mechanical_consequence",
        actorLabel: "アオ",
        actionName: "遮断",
        targetLabel: "クロ",
        change: {
          parameterKey: "hp",
          parameterClass: "vitality",
          direction: "loss",
          absoluteBand: "heavy",
          relativeBand: "solid",
          outcome: "incapacitated",
        },
      },
    });
    assert.equal(Object.isFrozen(focus), true);
    assert.equal(JSON.stringify(focus).includes("event.not-ranked"), false);
    assert.equal(JSON.stringify(focus).includes("自由記述"), false);
    assert.deepEqual(buildNarrationPresentationFocus(view), focus);
  });

  it("uses release only for a committed quiet event", () => {
    const view = viewWithProjection({
      schemaVersion: 1,
      turn: 4,
      causalChains: [{
        actorLabel: "アオ",
        requestedKind: "reflect",
        effectiveKind: "reflect",
        executed: true,
        skippedReason: null,
        resolution: { status: "known", outcome: "accepted", reason: null },
        events: [{
          type: "reflect",
          actorLabel: "アオ",
          targetLabels: [],
        }],
        mechanicalConsequences: [],
        semanticChangeKinds: [],
      }],
      observedConsequences: [],
      observedSemanticChangeKinds: [],
      continuingConditions: [],
    });

    assert.deepEqual(buildNarrationPresentationFocus(view), {
      schemaVersion: 1,
      phase: "release",
      primary: {
        source: "causal_event",
        actorLabel: "アオ",
        actionName: "遮断",
        event: {
          type: "reflect",
          actorLabel: "アオ",
          targetLabels: [],
        },
      },
    });
  });

  it("ignores stable conditions and unattributed consequences without a safe target", () => {
    const view = viewWithProjection({
      schemaVersion: 1,
      turn: 4,
      causalChains: [{
        actorLabel: "アオ",
        requestedKind: "wait",
        effectiveKind: "wait",
        executed: true,
        skippedReason: null,
        resolution: { status: "known", outcome: "accepted", reason: null },
        events: [],
        mechanicalConsequences: [],
        semanticChangeKinds: [],
      }],
      observedConsequences: [{
        parameterKey: "hp",
        parameterClass: "vitality",
        direction: "loss",
        absoluteBand: "heavy",
        relativeBand: "solid",
        outcome: "effective",
        sourceKnowledge: "unknown",
        targetKnowledge: "unknown",
      }],
      observedSemanticChangeKinds: [],
      continuingConditions: [{
        participantLabel: "アオ",
        canFight: true,
        defending: false,
        reserveCues: [],
      }],
    });

    assert.equal(buildNarrationPresentationFocus(view), null);
    assert.equal("presentationFocus" in buildNarrationTurnBrief(view), false);
    assert.equal(
      "presentationFocus" in buildNarrationTurnBrief(view, {
        presentationFocusMode: NARRATION_PRESENTATION_FOCUS_MODE_V1,
      }),
      false,
    );
  });

  it("adds the focus only under the explicit experimental mode", () => {
    const view = viewWithProjection({
      schemaVersion: 1,
      turn: 4,
      causalChains: [{
        actorLabel: "アオ",
        requestedKind: "skill",
        effectiveKind: "defend",
        executed: true,
        skippedReason: null,
        resolution: {
          status: "known",
          outcome: "substituted",
          reason: "required_object_unavailable",
        },
        events: [],
        mechanicalConsequences: [],
        semanticChangeKinds: [],
      }],
      observedConsequences: [],
      observedSemanticChangeKinds: [],
      continuingConditions: [],
    });
    const control = buildNarrationTurnBrief(view);
    const candidate = buildNarrationTurnBrief(view, {
      presentationFocusMode: NARRATION_PRESENTATION_FOCUS_MODE_V1,
    });

    assert.equal("presentationFocus" in control, false);
    assert.equal(candidate.presentationFocus?.primary.source, "action_resolution");
    assert.equal(Object.isFrozen(candidate.presentationFocus), true);
    const { presentationFocus: _focus, ...candidateBase } = candidate;
    assert.deepEqual(candidateBase, control);
  });
});
