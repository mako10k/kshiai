import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyTurnSemanticPatch,
  buildSemanticObservationState,
  createBattleSemanticState,
  diffBattleSemanticStates,
  semanticValueAtPointer,
  validateBattleSemanticState,
  type BattleSemanticState,
} from "./semantic-state.js";

function state(): BattleSemanticState {
  return {
    schemaVersion: 1,
    revision: 0,
    scene: {
      summary: "雨の廃ビル",
      facts: {
        weather: "rain",
      },
    },
    entities: {
      "character.a": {
        kind: "character",
        label: "A",
        location: { type: "scene", area: "中央" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {
          visible_conditions: {},
        },
      },
      "character.b": {
        kind: "character",
        label: "B",
        location: { type: "scene", area: "階段" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {
          visible_conditions: {},
        },
      },
      "window.north": {
        kind: "object",
        label: "北の窓",
        location: { type: "scene", area: "北壁" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {
          integrity: "intact",
        },
      },
      "iron_pipe.1": {
        kind: "object",
        label: "鉄パイプ",
        location: { type: "scene", area: "床" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {},
      },
    },
  };
}

describe("battle semantic state", () => {
  it("moves a field entity to a holder with an auditable revision", () => {
    const before = state();
    const result = applyTurnSemanticPatch({
      state: before,
      turn: 1,
      patch: {
        baseRevision: 0,
        turn: 1,
        sourceEventIds: ["turn-1-action-a"],
        operations: [{
          op: "replace",
          path: "/entities/iron_pipe.1/location",
          value: { type: "held", side: "a" },
        }],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.state.entities["iron_pipe.1"]?.location, {
      type: "held",
      side: "a",
    });
    assert.equal(result.state.entities["iron_pipe.1"]?.updatedTurn, 1);
    assert.equal(result.state.revision, 1);
    assert.deepEqual(before.entities["iron_pipe.1"]?.location, {
      type: "scene",
      area: "床",
    });
  });

  it("applies pickup and drop symmetrically for both character sides", () => {
    for (const side of ["a", "b"] as const) {
      const picked = applyTurnSemanticPatch({
        state: state(),
        turn: 1,
        patch: {
          baseRevision: 0,
          turn: 1,
          operations: [{
            op: "replace",
            path: "/entities/iron_pipe.1/location",
            value: { type: "held", side },
          }],
        },
      });
      assert.equal(picked.ok, true);
      if (!picked.ok) continue;
      assert.deepEqual(picked.state.entities["iron_pipe.1"]?.location, {
        type: "held",
        side,
      });
      const dropped = applyTurnSemanticPatch({
        state: picked.state,
        turn: 2,
        patch: {
          baseRevision: 1,
          turn: 2,
          operations: [{
            op: "replace",
            path: "/entities/iron_pipe.1/location",
            value: { type: "scene", area: `${side}側の足元` },
          }],
        },
      });
      assert.equal(dropped.ok, true);
      if (dropped.ok) {
        assert.deepEqual(dropped.state.entities["iron_pipe.1"]?.location, {
          type: "scene",
          area: `${side}側の足元`,
        });
      }
    }
  });

  it("persists breakage and creates debris atomically", () => {
    const result = applyTurnSemanticPatch({
      state: state(),
      turn: 2,
      patch: {
        baseRevision: 0,
        turn: 2,
        sourceEventIds: ["turn-2-hit-b"],
        operations: [
          {
            op: "replace",
            path: "/entities/window.north/facts/integrity",
            value: "broken",
          },
          {
            op: "add",
            path: "/entities/glass_fragments.1",
            value: {
              kind: "object",
              label: "ガラス片",
              location: { type: "scene", area: "北壁の足元" },
              active: true,
              createdTurn: 999,
              updatedTurn: 999,
              facts: { hazard: "sharp" },
            },
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.state.entities["window.north"]?.facts.integrity,
      "broken",
    );
    assert.equal(result.state.entities["glass_fragments.1"]?.createdTurn, 2);
    assert.equal(result.state.entities["glass_fragments.1"]?.updatedTurn, 2);
  });

  it("does not resurrect an inactive entity tombstone", () => {
    const before = state();
    before.entities["window.north"]!.active = false;
    const result = applyTurnSemanticPatch({
      state: before,
      turn: 3,
      patch: {
        baseRevision: 0,
        turn: 3,
        operations: [{
          op: "replace",
          path: "/entities/window.north/active",
          value: true,
        }],
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "protected_path");
    assert.equal(before.entities["window.north"]?.active, false);
  });

  it("rejects stale revisions without partially applying earlier operations", () => {
    const before = state();
    const result = applyTurnSemanticPatch({
      state: before,
      turn: 1,
      patch: {
        baseRevision: 4,
        turn: 1,
        operations: [{
          op: "replace",
          path: "/entities/window.north/facts/integrity",
          value: "broken",
        }],
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "stale_revision");
    assert.equal(result.state, before);
    assert.equal(before.entities["window.north"]?.facts.integrity, "intact");
  });

  it("rejects causal references outside the resolved turn", () => {
    const before = state();
    const result = applyTurnSemanticPatch({
      state: before,
      turn: 1,
      allowedSourceEventIds: new Set(["turn-1-hit-a"]),
      patch: {
        baseRevision: 0,
        turn: 1,
        sourceEventIds: ["invented-event"],
        operations: [{
          op: "replace",
          path: "/scene/summary",
          value: "変更後",
        }],
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.state, before);
    if (!result.ok) assert.equal(result.error.code, "invalid_patch");
  });

  it("rejects a later invalid operation without committing an earlier change", () => {
    const before = state();
    const result = applyTurnSemanticPatch({
      state: before,
      turn: 1,
      patch: {
        baseRevision: 0,
        turn: 1,
        operations: [
          {
            op: "replace",
            path: "/entities/window.north/facts/integrity",
            value: "broken",
          },
          {
            op: "replace",
            path: "/sideA/parameters/hp",
            value: 0,
          },
        ],
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "protected_path");
    assert.equal(before.entities["window.north"]?.facts.integrity, "intact");
  });

  it("protects character identity and entity lifecycle fields", () => {
    for (const path of [
      "/entities/character.a/active",
      "/entities/character.a/kind",
      "/entities/window.north/createdTurn",
      "/entities/window.north",
    ]) {
      const result = applyTurnSemanticPatch({
        state: state(),
        turn: 1,
        patch: {
          baseRevision: 0,
          turn: 1,
          operations: path === "/entities/window.north"
            ? [{ op: "remove", path }]
            : [{ op: "replace", path, value: false }],
        },
      });
      assert.equal(result.ok, false, path);
      if (!result.ok) assert.equal(result.error.code, "protected_path", path);
    }
  });

  it("allows leaf fact removal but rejects array-index mutation", () => {
    const base = state();
    base.entities["window.north"]!.facts.notes = ["wet", "cold"];
    const removed = applyTurnSemanticPatch({
      state: base,
      turn: 1,
      patch: {
        baseRevision: 0,
        turn: 1,
        operations: [{
          op: "remove",
          path: "/entities/window.north/facts/integrity",
        }],
      },
    });
    assert.equal(removed.ok, true);
    if (removed.ok) {
      assert.equal(
        Object.hasOwn(removed.state.entities["window.north"]!.facts, "integrity"),
        false,
      );
    }

    const indexed = applyTurnSemanticPatch({
      state: base,
      turn: 1,
      patch: {
        baseRevision: 0,
        turn: 1,
        operations: [{
          op: "replace",
          path: "/entities/window.north/facts/notes/0",
          value: "dry",
        }],
      },
    });
    assert.equal(indexed.ok, false);
    if (!indexed.ok) assert.equal(indexed.error.code, "missing_path");
  });

  it("validates required symmetric character entities and bounded depth", () => {
    const missing = state();
    delete missing.entities["character.b"];
    const missingResult = validateBattleSemanticState(missing);
    assert.equal(missingResult.success, false);

    const deep = state();
    deep.entities["window.north"]!.facts.deep = {
      one: { two: { three: { four: "too deep" } } },
    };
    const deepResult = validateBattleSemanticState(deep);
    assert.equal(deepResult.success, false);
    if (!deepResult.success) assert.equal(deepResult.error.code, "state_limit");
  });

  it("rejects semantic snapshots beyond the prompt and persistence budget", () => {
    const oversized = state();
    oversized.scene.facts = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `large_fact_${index}`,
        "x".repeat(2000),
      ]),
    );
    assert.equal(validateBattleSemanticState(oversized).success, false);
  });

  it("reads JSON Pointer values and produces compact diffs", () => {
    const before = state();
    const after = structuredClone(before);
    after.scene.summary = "割れた窓から雨が吹き込む廃ビル";
    after.entities["window.north"]!.facts.integrity = "broken";
    assert.equal(
      semanticValueAtPointer(after, "/entities/window.north/facts/integrity"),
      "broken",
    );
    assert.deepEqual(diffBattleSemanticStates(before, after), [
      {
        op: "replace",
        path: "/scene/summary",
        value: "割れた窓から雨が吹き込む廃ビル",
      },
      {
        op: "replace",
        path: "/entities/window.north/facts/integrity",
        value: "broken",
      },
    ]);
  });

  it("creates a structured initial world from a battlefield seed", () => {
    const initial = createBattleSemanticState({
      scene: "雨の廃ビル",
      notes: "窓の外では雨が強まっている。",
      terrain: "濡れた床",
      obstacles: ["古い机"],
      conditions: ["暗い"],
      seed: {
        sceneFacts: { visibility: "low" },
        entities: {
          "window.north": {
            kind: "object",
            label: "北の窓",
            location: { type: "scene", area: "北壁" },
            active: true,
            facts: { integrity: "intact" },
          },
        },
      },
      sideA: { displayName: "A", appearanceSummary: "黒いコート" },
      sideB: { displayName: "B", appearanceSummary: "白い外套" },
    });
    assert.equal(initial.revision, 0);
    assert.equal(initial.scene.facts.visibility, "low");
    assert.equal(initial.entities["window.north"]?.facts.integrity, "intact");
    assert.equal(
      initial.entities["character.a"]?.facts.baseline_appearance,
      "黒いコート",
    );
  });

  it("deterministically seeds legacy obstacle strings without an LLM", () => {
    const initial = createBattleSemanticState({
      scene: "旧戦場",
      obstacles: ["倒木", "石壁"],
      sideA: { displayName: "A" },
      sideB: { displayName: "B" },
    });
    assert.equal(initial.entities["obstacle.1"]?.label, "倒木");
    assert.equal(initial.entities["obstacle.2"]?.label, "石壁");
    assert.equal(initial.entities["character.a"]?.kind, "character");
    assert.equal(initial.entities["character.b"]?.kind, "character");
  });

  it("projects side-specific current observations and only their latest diff", () => {
    const before = state();
    const after = structuredClone(before);
    after.revision = 1;
    after.entities["iron_pipe.1"]!.visibleTo = ["a"];
    after.entities["iron_pipe.1"]!.location = { type: "held", side: "a" };
    after.entities["iron_pipe.1"]!.updatedTurn = 1;

    const observedA = buildSemanticObservationState({
      before,
      after,
      observer: "a",
    });
    const observedB = buildSemanticObservationState({
      before,
      after,
      observer: "b",
    });
    const observedPublic = buildSemanticObservationState({
      before,
      after,
      observer: "public",
    });

    assert.deepEqual(
      observedA.snapshot.entities["iron_pipe.1"]?.location,
      { type: "held", side: "a" },
    );
    assert.equal(observedB.snapshot.entities["iron_pipe.1"], undefined);
    assert.equal(observedPublic.snapshot.entities["iron_pipe.1"], undefined);
    assert.ok(
      observedB.latestDiff.operations.some(
        (operation) => operation.path === "/entities/iron_pipe.1" && operation.op === "remove",
      ),
    );
    assert.equal(JSON.stringify(observedA).includes("visibleTo"), false);
  });

  it("bounds observations while retaining the latest changed entity", () => {
    const before = state();
    for (let index = 0; index < 40; index += 1) {
      before.entities[`object.${index}`] = {
        kind: "object",
        label: `物体${index}`,
        location: { type: "scene", area: "倉庫" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {},
      };
    }
    const after = structuredClone(before);
    after.revision = 1;
    after.entities["object.39"]!.location = { type: "held", side: "b" };
    after.entities["object.39"]!.updatedTurn = 1;
    const observed = buildSemanticObservationState({
      before,
      after,
      observer: "b",
    });
    assert.equal(Object.keys(observed.snapshot.entities).length, 32);
    assert.deepEqual(observed.snapshot.entities["object.39"]?.location, {
      type: "held",
      side: "b",
    });
  });

  it("diffs against the actually retained previous observation", () => {
    const before = state();
    for (let index = 0; index < 40; index += 1) {
      before.entities[`object.${index}`] = {
        kind: "object",
        label: `物体${index}`,
        location: { type: "scene", area: "倉庫" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {},
      };
    }
    const previous = buildSemanticObservationState({
      before,
      after: before,
      observer: "a",
    });
    assert.equal(previous.snapshot.entities["object.39"], undefined);

    const after = structuredClone(before);
    after.revision = 1;
    after.entities["object.39"]!.facts.changed = true;
    after.entities["object.39"]!.updatedTurn = 1;
    const observed = buildSemanticObservationState({
      before,
      after,
      observer: "a",
      previousSnapshot: previous.snapshot,
    });

    assert.ok(observed.snapshot.entities["object.39"]);
    assert.ok(observed.latestDiff.operations.some(
      (operation) =>
        operation.op === "add" && operation.path === "/entities/object.39",
    ));
    const removed = observed.latestDiff.operations.find(
      (operation) => operation.op === "remove" &&
        operation.path.startsWith("/entities/object."),
    );
    assert.ok(removed, "the displaced prior observation must be removed");
  });

  it("keeps an unchanged retained snapshot stable on a rejected transition", () => {
    const current = state();
    const previous = buildSemanticObservationState({
      before: current,
      after: current,
      observer: "public",
    });
    const observed = buildSemanticObservationState({
      before: current,
      after: current,
      observer: "public",
      previousSnapshot: previous.snapshot,
    });
    assert.deepEqual(observed.snapshot, previous.snapshot);
    assert.deepEqual(observed.latestDiff, {
      fromRevision: 0,
      toRevision: 0,
      operations: [],
    });
  });

  it("preserves attachment references without leaking a hidden parent", () => {
    const current = state();
    current.entities["hidden_parent.1"] = {
      kind: "object",
      label: "隠れた台座",
      location: { type: "scene", area: "暗がり" },
      active: true,
      createdTurn: 0,
      updatedTurn: 0,
      facts: {},
      visibleTo: ["a"],
    };
    current.entities["attached_marker.1"] = {
      kind: "effect",
      label: "付着した印",
      location: { type: "attached", entityId: "hidden_parent.1" },
      active: true,
      createdTurn: 0,
      updatedTurn: 0,
      facts: {},
    };
    const validation = validateBattleSemanticState(current);
    assert.equal(validation.success, false);

    const sideA = buildSemanticObservationState({
      before: current,
      after: current,
      observer: "a",
    });
    assert.ok(sideA.snapshot.entities["hidden_parent.1"]);
    assert.ok(sideA.snapshot.entities["attached_marker.1"]);

    const publicState = buildSemanticObservationState({
      before: current,
      after: current,
      observer: "public",
    });
    assert.equal(publicState.snapshot.entities["hidden_parent.1"], undefined);
    assert.equal(publicState.snapshot.entities["attached_marker.1"], undefined);
  });

  it("rejects cyclic attachment chains", () => {
    const invalid = state();
    invalid.entities["window.north"]!.location = {
      type: "attached",
      entityId: "iron_pipe.1",
    };
    invalid.entities["iron_pipe.1"]!.location = {
      type: "attached",
      entityId: "window.north",
    };
    const validated = validateBattleSemanticState(invalid);
    assert.equal(validated.success, false);
    if (!validated.success) {
      assert.match(validated.error.message, /cyclic attachment chain/);
    }
  });

  it("keeps both character roots at symmetric scene locations", () => {
    for (const id of ["character.a", "character.b"] as const) {
      const invalid = state();
      invalid.entities[id]!.location = { type: "absent" };
      const validated = validateBattleSemanticState(invalid);
      assert.equal(validated.success, false);
      if (!validated.success) {
        assert.match(validated.error.message, /must use a scene location/);
      }
    }
  });
});
