import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInnerDigest,
  lockedFocusFromPerspective,
  needsFocusChoice,
  selectDigestsForFocus,
} from "./narration-perspective.js";
import type { CharacterAgentState, CharacterCognition } from "./battle.js";

const agent = (over: Partial<CharacterAgentState> = {}): CharacterAgentState => ({
  privateMemory: "秘密の計画",
  currentGoal: "守りを固める",
  emotion: "警戒",
  beliefs: ["相手は消耗している"],
  observations: ["波が近い"],
  speechStyle: "短く",
  selfReference: "私",
  lastSpeech: "…",
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

describe("narration perspective digests", () => {
  it("maps locked perspectives to focus", () => {
    assert.equal(lockedFocusFromPerspective("self"), "self");
    assert.equal(lockedFocusFromPerspective("foe"), "foe");
    assert.equal(lockedFocusFromPerspective("external"), "external");
    assert.equal(lockedFocusFromPerspective("omniscient"), "both");
    assert.equal(lockedFocusFromPerspective("fluid"), null);
    assert.equal(needsFocusChoice("fluid"), true);
    assert.equal(needsFocusChoice("self"), false);
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

    const none = selectDigestsForFocus({
      focus: "external",
      detailA,
      detailB,
    });
    assert.deepEqual(none, []);
  });
});
