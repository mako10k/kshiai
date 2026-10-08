import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBattleState, ensureBattleWorldState } from "./battle-engine.js";
import { applyBattleWorldTransition } from "./battle-world.js";
import {
  planRepositionTransition,
  spacingForConstraints,
  worldCounterpartUnlocalized,
} from "./reposition-transition.js";
import type { CharacterSheet } from "./character.js";

function sheet(id: string, displayName: string): CharacterSheet {
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName,
    tags: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    appearance: { summary: `${displayName}の姿`, visualPrompt: displayName },
    traits: [],
    parameters: {
      hp: 100, maxHp: 100, mp: 30, maxMp: 30, stamina: 30, maxStamina: 30,
      atk: 10, def: 10, spd: 10, mag: 10, res: 10, focus: 10, luck: 10,
    },
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: displayName,
  };
}

describe("reposition transition", () => {
  it("hops one adjacent area toward the counterpart", () => {
    const state = createBattleState({
      id: "reposition-hop",
      sideA: sheet("a", "アルファ"),
      sideB: sheet("b", "ベータ"),
      turnLimit: 12,
      prologuePending: false,
      battlefield: { kind: "legacy", instance: {
        sourcePresetId: null,
        category: "arena",
        displayName: "三場",
        scene: "闘技場",
        narrativeSetup: "三つの場が連なる",
        terrain: "砂",
        obstacles: [],
        conditions: [],
        coefficients: {},
        areas: [
          { id: "area.1", name: "砂地" },
          { id: "area.2", name: "石畳" },
          { id: "area.3", name: "中央" },
        ],
        entryAreas: { a: "area.1", b: "area.3" },
        topology: [
          {
            id: "e1",
            fromAreaId: "area.1",
            toAreaId: "area.2",
            movement: "open",
            sight: "clear",
            sound: "clear",
          },
          {
            id: "e2",
            fromAreaId: "area.2",
            toAreaId: "area.3",
            movement: "open",
            sight: "clear",
            sound: "clear",
          },
        ],
      } },
    });
    assert.equal(state.pacingPolicy?.spacingSchemaVersion, 1);
    const world = state.worldState!;
    const actorArea = world.entities["character.a"]!.placement;
    const targetArea = world.entities["character.b"]!.placement;
    assert.equal(actorArea.type, "scene");
    assert.equal(targetArea.type, "scene");
    assert.deepEqual(Object.keys(world.areas).sort(), ["area.1", "area.2", "area.3"]);
    assert.deepEqual(actorArea, { type: "scene", areaId: "area.1" });
    assert.deepEqual(targetArea, { type: "scene", areaId: "area.3" });
    const planned = planRepositionTransition({
      worldState: world,
      actorSide: "a",
      actorName: "アルファ",
      turn: 1,
      correction: "close",
      desired: { reach: "same_area" },
      topology: state.battlefield?.topology,
    });
    assert.equal(planned.summaryKind, "area_hop");
    const applied = applyBattleWorldTransition({
      state: world,
      turn: 1,
      transition: {
        baseRevision: world.revision,
        turn: 1,
        sourceEventIds: [],
        operations: planned.operations,
      },
    });
    assert.equal(applied.ok, true);
    assert.equal(applied.changed, true);
    if (!applied.ok) return;
    const next = applied.state.entities["character.a"]!.placement;
    assert.equal(next.type, "scene");
    if (next.type === "scene" && targetArea.type === "scene") {
      assert.notEqual(
        next.areaId,
        actorArea.type === "scene" ? actorArea.areaId : "",
      );
      assert.equal(next.areaId, "area.2");
      assert.notEqual(next.areaId, targetArea.areaId);
    }
    const secondPlan = planRepositionTransition({
      worldState: applied.state, actorSide: "a", actorName: "アルファ", turn: 2,
      correction: "close", desired: { reach: "same_area" }, topology: state.battlefield?.topology,
    });
    const second = applyBattleWorldTransition({
      state: applied.state, turn: 2,
      transition: { baseRevision: applied.state.revision, turn: 2, sourceEventIds: [], operations: secondPlan.operations },
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.deepEqual(second.state.entities["character.a"]?.placement, { type: "scene", areaId: "area.3" });
    const saved = { ...state, worldState: second.state };
    assert.equal(ensureBattleWorldState(saved), saved);
    assert.deepEqual(ensureBattleWorldState(saved).worldState, second.state);
  });

  it("opens an in-area rank when too close", () => {
    const state = createBattleState({
      id: "reposition-open",
      sideA: sheet("a", "アルファ"),
      sideB: sheet("b", "ベータ"),
      turnLimit: 12,
      prologuePending: false,
    });
    const world = structuredClone(state.worldState!);
    world.pairRelations[0]!.distance = "contact";
    const spacing = spacingForConstraints({
      worldState: world,
      actorSide: "a",
      unlocalized: false,
      constraints: { reach: "far", minReach: "medium" },
    });
    assert.equal(spacing.relation, "too_close");
    assert.equal(spacing.correction, "open");
    const planned = planRepositionTransition({
      worldState: world,
      actorSide: "a",
      actorName: "アルファ",
      turn: 1,
      correction: "open",
      desired: { reach: "far", minReach: "medium" },
    });
    assert.equal(planned.summaryKind, "rank_change");
    assert.match(planned.event.summary ?? "", /広げた/);
  });

  it("treats a present scene counterpart as localized in unique world", () => {
    const state = createBattleState({
      id: "reposition-localized",
      sideA: sheet("a", "アルファ"),
      sideB: sheet("b", "ベータ"),
      turnLimit: 12,
      prologuePending: false,
    });
    assert.equal(worldCounterpartUnlocalized(state.worldState, "a"), false);
    const missing = structuredClone(state.worldState!);
    missing.entities["character.b"]!.presence = "absent";
    missing.entities["character.b"]!.placement = { type: "absent" };
    missing.pairRelations[0]!.distance = "out_of_scene";
    missing.pairRelations[0]!.sight = "blocked";
    missing.pairRelations[0]!.sound = "blocked";
    assert.equal(worldCounterpartUnlocalized(missing, "a"), true);
  });
});

it("preserves a declared area ID that is also an inherited object property", () => {
  const state = createBattleState({
    id: "own-constructor-area", sideA: sheet("own-a", "A"), sideB: sheet("own-b", "B"), turnLimit: 12,
    battlefield: { kind: "legacy", instance: {
      sourcePresetId: null, displayName: "単一の場", category: "arena", scene: "単一の場", terrain: "石床",
      obstacles: [], conditions: [], coefficients: {}, narrativeSetup: "開始",
      areas: [{ id: "constructor", name: "単一の場" }],
      entryAreas: { a: "constructor", b: "constructor" }, topology: [],
    } },
  });
  assert.deepEqual(Object.keys(state.worldState!.areas), ["constructor"]);
  assert.deepEqual(state.worldState?.entities["character.a"]?.placement, { type: "scene", areaId: "constructor" });
  assert.deepEqual(state.worldState?.entities["character.b"]?.placement, { type: "scene", areaId: "constructor" });
});
