import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParameters, type Parameters } from "./character.js";
import {
  buildServerOnlyReserveCues,
  quantizeCommittedMechanicalEvidence,
} from "./perception-quantization.js";
import type { CommittedMechanicalEvidence } from "./perception.js";

function evidence(
  overrides: Partial<CommittedMechanicalEvidence> = {},
): CommittedMechanicalEvidence {
  return {
    evidenceId: "turn-1-mechanical-1",
    turn: 1,
    sourceActionId: "turn-1-action-a",
    basisEventIds: ["turn-1-event-1"],
    actorSide: "a",
    target: { side: "b", entityId: "character.b" },
    parameterKey: "hp",
    attemptedDelta: -10,
    beforeValue: 100,
    afterValue: 90,
    delta: -10,
    relativeReferenceBeforeValue: 100,
    relativeReferenceAfterValue: 100,
    ...overrides,
  };
}

describe("deterministic perception quantization", () => {
  it("keeps every absolute threshold monotonic and inclusive at its upper bound", () => {
    const samples = [0, 3.3, 3.31, 8.8, 8.81, 19.8, 19.81, 38.5, 38.51];
    const expected = [
      "none",
      "trace",
      "light",
      "light",
      "solid",
      "solid",
      "heavy",
      "heavy",
      "extreme",
    ];
    const actual = samples.map((amount, index) =>
      quantizeCommittedMechanicalEvidence([evidence({
        evidenceId: `turn-1-mechanical-${index + 1}`,
        attemptedDelta: amount === 0 ? -1 : -amount,
        beforeValue: 100,
        afterValue: 100 - amount,
        delta: -amount,
        relativeReferenceBeforeValue: 110,
        relativeReferenceAfterValue: 110,
      })])[0]!.change.absoluteBand
    );
    assert.deepEqual(actual, expected);
  });

  it("calculates absolute and target-relative axes independently", () => {
    const result = quantizeCommittedMechanicalEvidence([evidence({
      attemptedDelta: -22,
      beforeValue: 900,
      afterValue: 878,
      delta: -22,
      relativeReferenceBeforeValue: 1000,
      relativeReferenceAfterValue: 1000,
    })])[0]!;
    assert.equal(result.change.absoluteBand, "heavy");
    assert.equal(result.change.relativeBand, "trace");
  });

  it("keeps every relative threshold monotonic and inclusive at its upper bound", () => {
    const samples = [0, 3, 3.01, 8, 8.01, 18, 18.01, 35, 35.01];
    const expected = [
      "none",
      "trace",
      "light",
      "light",
      "solid",
      "solid",
      "heavy",
      "heavy",
      "extreme",
    ];
    const actual = samples.map((amount, index) =>
      quantizeCommittedMechanicalEvidence([evidence({
        evidenceId: `turn-1-mechanical-${index + 1}`,
        attemptedDelta: amount === 0 ? -1 : -amount,
        beforeValue: 100,
        afterValue: 100 - amount,
        delta: -amount,
        relativeReferenceBeforeValue: 100,
        relativeReferenceAfterValue: 100,
      })])[0]!.change.relativeBand
    );
    assert.deepEqual(actual, expected);
  });

  it("distinguishes no effect, immunity, incapacity, and overkill", () => {
    const quantified = quantizeCommittedMechanicalEvidence([
      evidence({
        evidenceId: "turn-1-mechanical-1",
        attemptedDelta: 10,
        beforeValue: 100,
        afterValue: 100,
        delta: 0,
      }),
      evidence({
        evidenceId: "turn-1-mechanical-2",
        attemptedDelta: 10,
        beforeValue: 50,
        afterValue: 60,
        delta: 10,
      }),
      evidence({
        evidenceId: "turn-1-mechanical-3",
        attemptedDelta: -10,
        beforeValue: 0,
        afterValue: 0,
        delta: 0,
      }),
      evidence({
        evidenceId: "turn-1-mechanical-4",
        attemptedDelta: -20,
        beforeValue: 20,
        afterValue: 0,
        delta: -20,
      }),
      evidence({
        evidenceId: "turn-1-mechanical-5",
        attemptedDelta: -30,
        beforeValue: 20,
        afterValue: 0,
        delta: -20,
      }),
    ]);
    assert.deepEqual(
      quantified.map((item) => item.change.outcome),
      ["none", "effective", "immune", "incapacitated", "overkill"],
    );
    assert.equal(quantified[1]!.change.direction, "gain");
    assert.deepEqual(
      [quantified[0]!, quantified[2]!].map((item) => ({
        direction: item.change.direction,
        absoluteBand: item.change.absoluteBand,
        relativeBand: item.change.relativeBand,
      })),
      [
        { direction: "unchanged", absoluteBand: "none", relativeBand: "none" },
        { direction: "unchanged", absoluteBand: "none", relativeBand: "none" },
      ],
    );
  });

  it("keeps A/B side swaps and simultaneous targets mechanically symmetric", () => {
    const original = evidence();
    const swapped = evidence({
      evidenceId: "turn-1-mechanical-2",
      sourceActionId: "turn-1-action-b",
      actorSide: "b",
      target: { side: "a", entityId: "character.a" },
    });
    const quantified = quantizeCommittedMechanicalEvidence([original, swapped]);
    assert.deepEqual(quantified[0]!.change, quantified[1]!.change);
    assert.deepEqual(
      quantified.map((item) => item.target.side),
      ["b", "a"],
    );
    assert.equal(JSON.stringify(quantified).includes("beforeValue"), false);
    assert.equal(JSON.stringify(quantified).includes("attemptedDelta"), false);
  });

  it("bands absolute and relative self reserves independently at every boundary", () => {
    const samples = [0, 16.5, 16.51, 38.5, 38.51, 66, 66.01, 93.5, 93.51];
    const expected = [
      "empty",
      "critical",
      "low",
      "low",
      "taxed",
      "taxed",
      "ready",
      "ready",
      "full",
    ];
    const actual = samples.map((hp) => {
      const parameters: Parameters = {
        ...defaultParameters(),
        hp,
        maxHp: 110,
      };
      return buildServerOnlyReserveCues({ side: "a", parameters })
        .find((cue) => cue.parameterKey === "hp")!;
    });
    assert.deepEqual(actual.map((cue) => cue.absoluteBand), expected);
    assert.deepEqual(actual.map((cue) => cue.relativeBand), expected);

    const independent = buildServerOnlyReserveCues({
      side: "b",
      parameters: { ...defaultParameters(), hp: 40, maxHp: 200 },
    }).find((cue) => cue.parameterKey === "hp")!;
    assert.equal(independent.absoluteBand, "taxed");
    assert.equal(independent.relativeBand, "low");
    assert.equal(independent.targetEntityId, "character.b");

    const focus = buildServerOnlyReserveCues({
      side: "a",
      parameters: { ...defaultParameters(), focus: 6 },
      baseParameters: { ...defaultParameters(), focus: 24 },
    }).find((cue) => cue.parameterKey === "focus")!;
    assert.equal(focus.absoluteBand, "taxed");
    assert.equal(focus.relativeBand, "low");
  });
});
