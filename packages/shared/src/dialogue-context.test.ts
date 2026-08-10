import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleDialoguePipelineSnapshotSchema,
  CharacterDeepPsycheDeltaSchema,
  CharacterExpressionBriefSchema,
  DialogueThreadStateSchema,
  TurnObservationPacketSchema,
  buildTurnObservationPacket,
  defaultDialoguePipelineSettings,
  snapshotDialoguePipelineSettings,
  type CharacterPerceptionFrame,
} from "./index.js";

describe("dialogue context contracts", () => {
  it("bounds observer packet material without accepting an ambiguous side", () => {
    const packet = TurnObservationPacketSchema.parse({
      schemaVersion: 1,
      turn: 4,
      observerSide: "a",
      selfResult: [{
        phenomenon: "腕に衝撃が残る",
        certainty: "certain",
        sourceEventIds: ["turn-4-event-1"],
      }],
      counterpartResult: [],
      ambientChange: [],
    });
    assert.equal(packet.observerSide, "a");
    assert.equal(packet.selfResult[0]?.phenomenon, "腕に衝撃が残る");
    assert.equal(TurnObservationPacketSchema.safeParse({
      ...packet,
      observerSide: "unknown",
    }).success, false);
  });

  it("keeps expression guidance compact and private", () => {
    const brief = CharacterExpressionBriefSchema.parse({
      sourceThread: "weave",
      continuityDecision: "reframe",
      focus: ["counterpart_result", "counterpart_speech"],
      observedImpact: "前の問いには返答がなかった",
      publicAim: "相手の失敗を責めずに別の角度から探る",
    });
    const delta = CharacterDeepPsycheDeltaSchema.parse({
      dialogueThread: DialogueThreadStateSchema.parse({
        topic: "端末の所在",
        unresolvedMove: "相手は理由を明かしていない",
        anchoredExchange: null,
      }),
      interior: { speechMode: brief.sourceThread },
    });
    assert.equal(delta.interior?.speechMode, "weave");
    assert.equal(brief.continuityDecision, "reframe");
  });

  it("makes a stable battle-owned snapshot from operator settings", () => {
    const settings = {
      ...defaultDialoguePipelineSettings(),
      revision: 7,
      contextProjectionMode: "compact" as const,
      recentExchangeLimit: 6,
      relevantMemoryLimit: 2,
    };
    const snapshot = snapshotDialoguePipelineSettings(settings);
    assert.deepEqual(BattleDialoguePipelineSnapshotSchema.parse(snapshot), snapshot);
    assert.equal(snapshot.revision, 7);
    assert.equal(snapshot.contextProjectionMode, "compact");
  });

  it("projects only the observer's changed percepts and evidence references", () => {
    const frame: CharacterPerceptionFrame = {
      schemaVersion: 1,
      observer: { side: "a", self: "self" },
      turn: 4,
      revision: 2,
      self: {
        subject: { kind: "self" },
        currentAccess: "clear",
        identityKnowledge: "identified",
        perceivedAs: "自分自身",
        percepts: [{
          perceptId: "percept.a.evidence.self",
          modality: "proprioception",
          phenomenon: "腕に重い衝撃が残る",
          direction: "unknown",
          distance: "unknown",
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
      others: [],
      qualitativeChanges: [],
      reserveCues: [],
      latestDiff: {
        fromRevision: 1,
        toRevision: 2,
        addedOrUpdatedPerceptIds: ["percept.a.evidence.self"],
        removedPerceptIds: [],
      },
    };
    const packet = buildTurnObservationPacket({
      frame,
      evidence: [{
        evidenceId: "evidence.self",
        basisEventIds: ["event.self"],
        modality: "proprioception",
        phenomenon: "腕に重い衝撃が残る",
        source: { kind: "event", eventId: "event.self" },
        accessBySide: {
          a: {
            currentAccess: "clear",
            identityKnowledge: "identified",
            perceivedAs: "自分自身",
            occurrenceCertainty: "certain",
            attributionCertainty: "certain",
            direction: "unknown",
            distance: "unknown",
          },
          b: {
            currentAccess: "none",
            identityKnowledge: "unknown",
            perceivedAs: "知覚できない",
            occurrenceCertainty: "unknown",
            attributionCertainty: "unknown",
            direction: "unknown",
            distance: "unknown",
          },
        },
        publicAccess: {
          currentAccess: "none",
          identityKnowledge: "unknown",
          perceivedAs: "知覚できない",
          occurrenceCertainty: "unknown",
          attributionCertainty: "unknown",
          direction: "unknown",
          distance: "unknown",
        },
      }],
    });
    assert.deepEqual(packet.selfResult, [{
      phenomenon: "腕に重い衝撃が残る",
      certainty: "certain",
      sourceEventIds: ["event.self"],
    }]);
    assert.deepEqual(packet.counterpartResult, []);
  });

  it("does not carry unobserved evidence into the other observer packet", () => {
    const frame: CharacterPerceptionFrame = {
      schemaVersion: 1,
      observer: { side: "b", self: "self" },
      turn: 5,
      revision: 3,
      self: {
        subject: { kind: "self" },
        currentAccess: "clear",
        identityKnowledge: "identified",
        perceivedAs: "自分自身",
        percepts: [],
      },
      counterpart: {
        subject: { kind: "counterpart" },
        currentAccess: "trace",
        identityKnowledge: "unknown",
        perceivedAs: "暗がりの気配",
        percepts: [{
          perceptId: "percept.b.evidence.b",
          modality: "sound",
          phenomenon: "遠くで靴音が止まる",
          direction: "front",
          distance: "far",
          salience: "noticeable",
          occurrenceCertainty: "probable",
          attributionCertainty: "possible",
        }],
      },
      others: [],
      qualitativeChanges: [],
      reserveCues: [],
      latestDiff: {
        fromRevision: 2,
        toRevision: 3,
        addedOrUpdatedPerceptIds: ["percept.b.evidence.b"],
        removedPerceptIds: [],
      },
    };
    const packet = buildTurnObservationPacket({
      frame,
      evidence: [{
        evidenceId: "evidence.a",
        basisEventIds: ["event.hidden-from-b"],
        modality: "sound",
        phenomenon: "Aだけが聞いた物音",
        source: { kind: "event", eventId: "event.hidden-from-b" },
        accessBySide: {
          a: {
            currentAccess: "clear",
            identityKnowledge: "unknown",
            perceivedAs: "物音",
            occurrenceCertainty: "certain",
            attributionCertainty: "unknown",
            direction: "front",
            distance: "near",
          },
          b: {
            currentAccess: "none",
            identityKnowledge: "unknown",
            perceivedAs: "知覚できない",
            occurrenceCertainty: "unknown",
            attributionCertainty: "unknown",
            direction: "unknown",
            distance: "unknown",
          },
        },
        publicAccess: {
          currentAccess: "none",
          identityKnowledge: "unknown",
          perceivedAs: "知覚できない",
          occurrenceCertainty: "unknown",
          attributionCertainty: "unknown",
          direction: "unknown",
          distance: "unknown",
        },
      }],
    });
    assert.equal(packet.observerSide, "b");
    assert.deepEqual(packet.counterpartResult, [{
      phenomenon: "遠くで靴音が止まる",
      certainty: "uncertain",
      sourceEventIds: [],
    }]);
  });
});
