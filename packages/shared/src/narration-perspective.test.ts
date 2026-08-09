import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInnerDigest,
  agentsUsefulForPerspective,
  lockedFocusFromPerspective,
  needsFocusChoice,
  selectDigestsForFocus,
} from "./narration-perspective.js";
import type { CharacterAgentState, CharacterCognition } from "./battle.js";
import type { CharacterPerceptionFrame } from "./perception.js";

const agent = (over: Partial<CharacterAgentState> = {}): CharacterAgentState => ({
  privateMemory: "秘密の計画",
  currentGoal: "守りを固める",
  emotion: "警戒",
  beliefs: ["相手は消耗している"],
  observations: ["波が近い"],
  speechStyle: "短く",
  selfReference: "私",
  lastSpeech: "…",
  interior: {
    primaryEmotion: "警戒",
    concealedEmotion: "焦り",
    coreNeed: "主導を手放さない",
    protectiveStance: "平静を装う",
    eventAppraisal: "相手の一手を警戒する",
    unspokenIntent: "間合いを誘導する",
    currentConcern: "足場の波",
    attitudeTowardCounterpart: "好敵手として見る",
    confidence: "steady",
    relationshipTension: "互いに譲らない",
    speechMode: "weave",
  },
  ...over,
});

const cog = (over: Partial<CharacterCognition> = {}): CharacterCognition => ({
  turn: 3,
  scene: "浜辺",
  ownCondition: "strained",
  foeCondition: "steady",
  parameterChanges: {},
  observedEvents: [],
  ...over,
});

const perception = (
  currentAccess: CharacterPerceptionFrame["counterpart"]["currentAccess"],
  identityKnowledge: CharacterPerceptionFrame["counterpart"]["identityKnowledge"],
): CharacterPerceptionFrame => ({
  schemaVersion: 1,
  observer: { side: "a", self: "self" },
  turn: 3,
  revision: 1,
  self: {
    subject: { kind: "self" },
    currentAccess: "clear",
    identityKnowledge: "identified",
    perceivedAs: "自分自身",
    percepts: [],
  },
  counterpart: {
    subject: { kind: "counterpart" },
    currentAccess,
    identityKnowledge,
    perceivedAs: identityKnowledge === "identified" ? "楓" : "判別できない",
    percepts: [],
  },
  others: [],
  qualitativeChanges: [],
  reserveCues: [],
  latestDiff: {
    fromRevision: 1,
    toRevision: 1,
    addedOrUpdatedPerceptIds: [],
    removedPerceptIds: [],
  },
});

describe("narration perspective digests", () => {
  it("maps locked perspectives to focus", () => {
    assert.equal(lockedFocusFromPerspective("self"), "self");
    assert.equal(lockedFocusFromPerspective("foe"), "foe");
    assert.equal(lockedFocusFromPerspective("external"), "external");
    assert.equal(lockedFocusFromPerspective("omniscient"), "both");
    assert.equal(lockedFocusFromPerspective("fluid"), null);
    assert.equal(needsFocusChoice("fluid"), true);
    assert.equal(needsFocusChoice("self"), false);
    assert.equal(agentsUsefulForPerspective("external"), true);
  });

  it("summary digests omit private detail", () => {
    const d = buildInnerDigest({
      side: "a",
      displayName: "まこと",
      agent: agent(),
      cognition: cog(),
      level: "summary",
    });
    assert.equal(d.emotion, "警戒");
    assert.equal(d.privateHint, undefined);
    assert.equal(d.beliefs, undefined);
    assert.equal(d.foeCondition, undefined);
  });

  it("includes counterpart condition only when identity and current access allow it", () => {
    const identified = buildInnerDigest({
      side: "a",
      displayName: "まこと",
      agent: agent(),
      cognition: cog({ foeCondition: "critical" }),
      perception: perception("coarse", "identified"),
      level: "summary",
    });
    const outOfView = buildInnerDigest({
      side: "a",
      displayName: "まこと",
      agent: agent(),
      cognition: cog({ foeCondition: "critical" }),
      perception: perception("none", "identified"),
      level: "summary",
    });
    assert.equal(identified.foeCondition, "critical");
    assert.equal(outOfView.foeCondition, undefined);
  });

  it("strips disallowed detail after focus", () => {
    const detailA = buildInnerDigest({
      side: "a",
      displayName: "まこと",
      agent: agent(),
      cognition: cog(),
      level: "detail",
    });
    const detailB = buildInnerDigest({
      side: "b",
      displayName: "楓",
      agent: agent({ emotion: "平静", privateMemory: "楓の秘密" }),
      cognition: cog({ ownCondition: "steady" }),
      level: "detail",
    });
    const onlyA = selectDigestsForFocus({
      focus: "self",
      detailA,
      detailB,
    });
    assert.equal(onlyA.length, 1);
    assert.equal(onlyA[0]?.displayName, "まこと");
    assert.ok(onlyA[0]?.privateHint?.includes("秘密"));
    assert.equal(detailA.primaryEmotion, "警戒");
    assert.equal(detailA.concealedEmotion, "焦り");
    assert.equal(detailA.unspokenIntent, "間合いを誘導する");

    const none = selectDigestsForFocus({
      focus: "external",
      detailA,
      detailB,
    });
    assert.deepEqual(none, []);
  });
});
