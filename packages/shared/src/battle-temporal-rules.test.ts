import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATTLE_TEMPORAL_RULESET,
  buildBattleTemporalPlan,
  resolveBattleTemporalExclusiveClaims,
} from "./battle-temporal-rules.js";

describe("buildBattleTemporalPlan", () => {
  it("places equal and near-equal initiative in one atomic bucket", () => {
    for (const [speedA, speedB, score] of [
      [12, 12, 12],
      [12, 13, 13],
      [13, 12, 13],
    ]) {
      const plan = buildBattleTemporalPlan({
        effectiveSpeedA: speedA!,
        effectiveSpeedB: speedB!,
      });

      assert.deepEqual(plan.buckets, [{
        index: 0,
        actorSides: ["a", "b"],
        initiativeScore: score!,
        simultaneous: true,
        readsFrom: "turn_start",
        commitMode: "atomic",
      }]);
    }
  });

  it("orders a clearly faster side before the slower side", () => {
    const plan = buildBattleTemporalPlan({
      effectiveSpeedA: 15,
      effectiveSpeedB: 12,
    });

    assert.deepEqual(
      plan.buckets.map((bucket) => ({
        actorSides: bucket.actorSides,
        readsFrom: bucket.readsFrom,
      })),
      [
        { actorSides: ["a"], readsFrom: "turn_start" },
        { actorSides: ["b"], readsFrom: "previous_bucket_commit" },
      ],
    );
  });

  it("is invariant when side labels and speeds are swapped", () => {
    const original = buildBattleTemporalPlan({
      effectiveSpeedA: 7,
      effectiveSpeedB: 14,
    });
    const swapped = buildBattleTemporalPlan({
      effectiveSpeedA: 14,
      effectiveSpeedB: 7,
    });
    const swapSide = (side: "a" | "b") => side === "a" ? "b" : "a";

    assert.deepEqual(
      original.buckets.map((bucket) => bucket.actorSides.map(swapSide)),
      swapped.buckets.map((bucket) => bucket.actorSides),
    );
  });

  it("rounds final effective speed before applying the simultaneity window", () => {
    const plan = buildBattleTemporalPlan({
      effectiveSpeedA: 10.49,
      effectiveSpeedB: 11.51,
    });

    assert.deepEqual(plan.initiativeScores, { a: 10, b: 12 });
    assert.equal(plan.buckets.length, 2);
    assert.deepEqual(plan.buckets[0]?.actorSides, ["b"]);
  });

  it("rejects non-finite initiative instead of inventing an order", () => {
    assert.throws(
      () => buildBattleTemporalPlan({
        effectiveSpeedA: Number.NaN,
        effectiveSpeedB: 10,
      }),
      /effective initiative must be finite/,
    );
  });

  it("forbids random ordering and defines the shared conflict outcomes", () => {
    assert.equal(BATTLE_TEMPORAL_RULESET.orderingRandomness, "forbidden");
    assert.equal(BATTLE_TEMPORAL_RULESET.mutualIncapacitation, "draw");
    assert.equal(BATTLE_TEMPORAL_RULESET.exclusiveConflict, "contested");
    assert.equal(BATTLE_TEMPORAL_RULESET.sameBucketDefense, "applies");
  });
});

describe("resolveBattleTemporalExclusiveClaims", () => {
  it("contests same-bucket movement and object claims without side priority", () => {
    const original = resolveBattleTemporalExclusiveClaims([
      { side: "a", resourceId: "area.high-ground", operation: "move" },
      { side: "b", resourceId: "area.high-ground", operation: "move" },
      { side: "a", resourceId: "object.key", operation: "take" },
      { side: "b", resourceId: "object.key", operation: "take" },
    ]);
    assert.ok(original.every((claim) => claim.outcome === "contested"));

    const swapped = resolveBattleTemporalExclusiveClaims(
      [...original].reverse().map(({ outcome: _outcome, ...claim }) => ({
        ...claim,
        side: claim.side === "a" ? "b" as const : "a" as const,
      })),
    );
    assert.ok(swapped.every((claim) => claim.outcome === "contested"));
  });

  it("commits independent exclusive claims", () => {
    assert.deepEqual(resolveBattleTemporalExclusiveClaims([
      { side: "a", resourceId: "object.key", operation: "take" },
      { side: "b", resourceId: "area.exit", operation: "move" },
    ]).map((claim) => claim.outcome), ["committed", "committed"]);
  });
});
