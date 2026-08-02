import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceSupervisorClock,
  defaultSupervisor,
  isQuietTurn,
  isPassiveTurn,
  pickTemplateHappening,
  shouldInjectHappening,
} from "./supervisor.js";
import type { TurnEvent } from "./battle.js";

describe("battle supervisor", () => {
  it("detects quiet turns with little HP swing", () => {
    const events: TurnEvent[] = [
      { type: "wait", actorName: "A", summary: "様子をうかがった" },
      { type: "defend", actorName: "B", summary: "守りを固めた" },
    ];
    assert.equal(
      isQuietTurn({
        events,
        hpBeforeA: 100,
        hpBeforeB: 100,
        hpAfterA: 100,
        hpAfterB: 100,
        maxHpA: 100,
        maxHpB: 100,
      }),
      true,
    );
  });

  it("does not call heavy exchanges quiet", () => {
    const events: TurnEvent[] = [
      {
        type: "damage",
        intensity: "critical",
        summary: "痛打",
      },
    ];
    assert.equal(
      isQuietTurn({
        events,
        hpBeforeA: 100,
        hpBeforeB: 100,
        hpAfterA: 100,
        hpAfterB: 40,
        maxHpA: 100,
        maxHpB: 100,
      }),
      false,
    );
  });

  it("injects after sustained quiet with cooldown", () => {
    let sup = defaultSupervisor();
    assert.equal(shouldInjectHappening(sup, 1, 20), false);

    // Simulate two quiet turns without happening
    sup = advanceSupervisorClock(sup, true, true, false, 100, 100);
    sup = advanceSupervisorClock(sup, true, true, false, 100, 100);
    assert.equal(sup.quietTurns, 2);
    assert.equal(sup.passiveTurns, 2);
    assert.equal(sup.turnsSinceHappening, 2);
    assert.equal(shouldInjectHappening(sup, 3, 20), true);

    // After inject, cooldown
    sup = advanceSupervisorClock(sup, false, false, true, 90, 90);
    assert.equal(sup.happenings, 1);
    assert.equal(sup.turnsSinceHappening, 0);
    assert.equal(shouldInjectHappening(sup, 4, 20), false);
  });

  it("distinguishes fighter exchanges from environmental pressure", () => {
    assert.equal(
      isPassiveTurn([
        { type: "wait", actorName: "A", summary: "待機" },
        { type: "damage", targetName: "B", summary: "落石" },
      ]),
      true,
    );
    assert.equal(
      isPassiveTurn([
        { type: "damage", actorName: "A", targetName: "B", summary: "攻撃" },
      ]),
      false,
    );
  });

  it("picks category-aware templates", () => {
    const h = pickTemplateHappening({
      battlefield: {
        sourcePresetId: null,
        displayName: "鎮守の森",
        category: "forest",
        scene: "霧の森",
        terrain: "ぬかるみ",
        obstacles: ["倒木", "霧"],
        conditions: ["霧"],
        coefficients: {},
        narrativeSetup: "test",
      },
      turn: 3,
      rng: () => 0.1,
    });
    assert.ok(h.title.length > 0);
    assert.ok(h.summary.length > 0);
    assert.ok(h.coefficients);
  });

  it("does not select mechanics from free-text battlefield wording", () => {
    const base = {
      sourcePresetId: null,
      displayName: "同じ分類の戦場",
      category: "custom" as const,
      scene: "scene",
      terrain: "plain",
      obstacles: [] as string[],
      coefficients: {},
      narrativeSetup: "test",
    };
    const a = pickTemplateHappening({
      battlefield: { ...base, conditions: ["炎と最強の嵐"] },
      turn: 3,
      rng: () => 0.2,
    });
    const b = pickTemplateHappening({
      battlefield: { ...base, conditions: ["静かな庭園"] },
      turn: 3,
      rng: () => 0.2,
    });
    assert.equal(a.title, b.title);
    assert.deepEqual(a.coefficients, b.coefficients);
  });
});
