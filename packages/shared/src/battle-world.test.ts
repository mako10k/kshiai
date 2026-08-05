import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleWorldStateSchema,
  BattleWorldTransitionSchema,
  applyBattleWorldTransition,
  createBattleWorldState,
  readBattleWorldPair,
  type BattleWorldState,
  type WorldObjectState,
} from "./battle-world.js";
import { createBattleSemanticState } from "./semantic-state.js";

function world(): BattleWorldState {
  return createBattleWorldState({
    semanticState: createBattleSemanticState({
      scene: "石造りの訓練場",
      obstacles: ["低い石壁"],
      sideA: { displayName: "A" },
      sideB: { displayName: "B" },
    }),
  });
}

function objectState(
  changes: Partial<WorldObjectState> = {},
): WorldObjectState {
  return {
    portable: true,
    usable: false,
    exclusiveUse: false,
    usableBy: [],
    cover: "none",
    blocksMovement: false,
    visionEffect: "none",
    hearingEffect: "none",
    mobilityEffect: "none",
    ...changes,
  };
}

describe("server-owned battle world", () => {
  it("starts exposed opponents near each other with working senses", () => {
    const state = world();

    assert.equal(BattleWorldStateSchema.safeParse(state).success, true);
    assert.deepEqual(state.entities["character.a"]?.actorState, {
      consciousness: "alert",
      mobility: "mobile",
      restraint: "free",
      posture: "standing",
      vision: "normal",
      hearing: "normal",
      mentalClarity: "clear",
      agency: "self_directed",
    });
    assert.equal(state.entities["character.b"]?.exposure, "exposed");
    assert.deepEqual(state.pairRelations[0], {
      firstEntityId: "character.a",
      secondEntityId: "character.b",
      distance: "near",
      sight: "clear",
      sound: "clear",
      firstOrientation: "facing",
      secondOrientation: "facing",
      updatedTurn: 0,
    });
  });

  it("commits sensory mental object and pair changes atomically", () => {
    const before = world();
    const result = applyBattleWorldTransition({
      state: before,
      turn: 1,
      allowedSourceEventIds: new Set(["turn.1.effect"]),
      transition: {
        baseRevision: 0,
        turn: 1,
        sourceEventIds: ["turn.1.effect"],
        operations: [
          {
            op: "set_exposure",
            entityId: "character.b",
            exposure: "hidden",
          },
          {
            op: "set_actor_state",
            entityId: "character.a",
            changes: { vision: "blocked", mentalClarity: "confused" },
          },
          {
            op: "set_object_state",
            entityId: "obstacle.1",
            changes: {
              usable: true,
              exclusiveUse: true,
              usableBy: ["character.a"],
              cover: "full",
              visionEffect: "block",
            },
          },
          {
            op: "set_pair_relation",
            entityAId: "character.b",
            entityBId: "character.a",
            distance: "near",
            sight: "blocked",
            sound: "clear",
            orientationA: "away",
            orientationB: "facing",
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.revision, 1);
    assert.equal(result.state.entities["character.b"]?.exposure, "hidden");
    assert.equal(
      result.state.entities["character.a"]?.actorState?.vision,
      "blocked",
    );
    assert.equal(
      result.state.entities["obstacle.1"]?.objectState?.exclusiveUse,
      true,
    );
    assert.deepEqual(result.state.pairRelations[0], {
      firstEntityId: "character.a",
      secondEntityId: "character.b",
      distance: "near",
      sight: "blocked",
      sound: "clear",
      firstOrientation: "facing",
      secondOrientation: "away",
      updatedTurn: 1,
    });
    assert.deepEqual(
      readBattleWorldPair(
        result.state,
        "character.b",
        "character.a",
      ),
      {
        entityAId: "character.b",
        entityBId: "character.a",
        distance: "near",
        sight: "blocked",
        sound: "clear",
        orientationA: "away",
        orientationB: "facing",
        updatedTurn: 1,
      },
    );
    assert.equal(before.entities["character.a"]?.actorState?.vision, "normal");
  });

  it("represents a worn blindfold and its server-derived vision constraint", () => {
    const result = applyBattleWorldTransition({
      state: world(),
      turn: 1,
      transition: {
        baseRevision: 0,
        turn: 1,
        operations: [
          {
            op: "add_entity",
            entityId: "blindfold.1",
            entity: {
              kind: "object",
              active: true,
              presence: "present",
              placement: {
                type: "worn",
                wearerId: "character.a",
                slot: "eyes",
              },
              exposure: "exposed",
              actorState: null,
              objectState: objectState({ visionEffect: "block" }),
            },
          },
          {
            op: "set_actor_state",
            entityId: "character.a",
            changes: { vision: "blocked" },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.state.entities["blindfold.1"]?.placement, {
      type: "worn",
      wearerId: "character.a",
      slot: "eyes",
    });
    assert.equal(
      result.state.entities["character.a"]?.actorState?.vision,
      "blocked",
    );
  });

  it("rejects an inconsistent disappearance without partially changing state", () => {
    const before = world();
    const rejected = applyBattleWorldTransition({
      state: before,
      turn: 1,
      transition: {
        baseRevision: 0,
        turn: 1,
        operations: [{
          op: "set_placement",
          entityId: "character.b",
          placement: { type: "absent" },
        }],
      },
    });

    assert.equal(rejected.ok, false);
    assert.equal(rejected.state, before);
    if (!rejected.ok) assert.equal(rejected.error.code, "invalid_state");
    assert.equal(before.entities["character.b"]?.presence, "present");

    const accepted = applyBattleWorldTransition({
      state: before,
      turn: 1,
      transition: {
        baseRevision: 0,
        turn: 1,
        operations: [
          {
            op: "set_placement",
            entityId: "character.b",
            placement: { type: "absent" },
          },
          {
            op: "set_pair_relation",
            entityAId: "character.a",
            entityBId: "character.b",
            distance: "out_of_scene",
            sight: "blocked",
            sound: "blocked",
            orientationA: "indeterminate",
            orientationB: "indeterminate",
          },
        ],
      },
    });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.state.entities["character.b"]?.presence, "absent");
      assert.equal(accepted.state.pairRelations[0]?.distance, "out_of_scene");
    }
  });

  it("rejects cyclic object placement as one atomic transition", () => {
    const before = world();
    const result = applyBattleWorldTransition({
      state: before,
      turn: 1,
      transition: {
        baseRevision: 0,
        turn: 1,
        operations: [
          {
            op: "add_entity",
            entityId: "chain.1",
            entity: {
              kind: "object",
              active: true,
              presence: "present",
              placement: { type: "attached", anchorId: "chain.2" },
              exposure: "exposed",
              actorState: null,
              objectState: objectState(),
            },
          },
          {
            op: "add_entity",
            entityId: "chain.2",
            entity: {
              kind: "object",
              active: true,
              presence: "present",
              placement: { type: "attached", anchorId: "chain.1" },
              exposure: "exposed",
              actorState: null,
              objectState: objectState(),
            },
          },
        ],
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.state, before);
    if (!result.ok) assert.match(result.error.message, /cyclic placement chain/);
  });

  it("keeps narration and unknown event IDs outside world transitions", () => {
    assert.equal(BattleWorldTransitionSchema.safeParse({
      baseRevision: 0,
      turn: 1,
      sourceEventIds: [],
      operations: [],
      narration: "Aが先に動いたことにする",
    }).success, false);

    const before = world();
    const result = applyBattleWorldTransition({
      state: before,
      turn: 1,
      allowedSourceEventIds: new Set(["committed.event"]),
      transition: {
        baseRevision: 0,
        turn: 1,
        sourceEventIds: ["invented.event"],
        operations: [],
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "unknown_source_event");
  });

  it("derives separate-area distance only from structured locations", () => {
    const semantic = createBattleSemanticState({
      scene: "複数区画の遺跡",
      sideA: { displayName: "A" },
      sideB: { displayName: "B" },
    });
    semantic.entities["character.b"]!.location = {
      type: "scene",
      area: "隣の回廊",
    };
    const state = createBattleWorldState({ semanticState: semantic });

    assert.equal(state.pairRelations[0]?.distance, "separate_area");
    assert.equal(state.pairRelations[0]?.sight, "blocked");
    assert.equal(state.pairRelations[0]?.sound, "partial");
  });

  it("loads legacy dependents of absent semantic parents as absent", () => {
    const semantic = createBattleSemanticState({
      scene: "遺跡",
      obstacles: ["崩れた柱"],
      sideA: { displayName: "A" },
      sideB: { displayName: "B" },
    });
    semantic.entities["obstacle.1"]!.active = false;
    semantic.entities["effect.dust"] = {
      kind: "effect",
      label: "柱にまとわりつく砂塵",
      location: { type: "attached", entityId: "obstacle.1" },
      active: true,
      createdTurn: 0,
      updatedTurn: 0,
      facts: {},
    };

    const state = createBattleWorldState({ semanticState: semantic });
    assert.equal(state.entities["obstacle.1"]?.presence, "absent");
    assert.equal(state.entities["effect.dust"]?.presence, "absent");
    assert.deepEqual(state.entities["effect.dust"]?.placement, {
      type: "absent",
    });
  });
});
