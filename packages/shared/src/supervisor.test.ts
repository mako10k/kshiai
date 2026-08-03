import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceSupervisorClock,
  defaultSupervisor,
  happeningToEvents,
  isQuietTurn,
  isPassiveTurn,
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
    sup = advanceSupervisorClock(sup, true, true, null, 100, 100);
    assert.equal(shouldInjectHappening(sup, 2, 20), false);
    sup = advanceSupervisorClock(sup, true, true, null, 100, 100);
    assert.equal(sup.quietTurns, 2);
    assert.equal(sup.passiveTurns, 2);
    assert.equal(sup.turnsSinceHappening, 2);
    assert.equal(shouldInjectHappening(sup, 3, 20), true);

    // After inject, cooldown
    sup = advanceSupervisorClock(
      sup,
      false,
      false,
      { title: "霧の変化", summary: "霧が流れ、視界が開ける。" },
      90,
      90,
    );
    assert.equal(sup.happenings, 1);
    assert.equal(sup.turnsSinceHappening, 0);
    assert.deepEqual(sup.recentHappenings, [
      { title: "霧の変化", summary: "霧が流れ、視界が開ける。" },
    ]);
    assert.equal(shouldInjectHappening(sup, 4, 20), false);
  });

  it("never injects merely because many active turns passed", () => {
    const sup = {
      ...defaultSupervisor(),
      quietTurns: 0,
      turnsSinceHappening: 12,
    };
    assert.equal(shouldInjectHappening(sup, 13, 20), false);
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

  it("does not expose an internal happening label in the event summary", () => {
    const [event] = happeningToEvents({
      id: "generated-1",
      title: "霧が割れる",
      summary: "視界が開け、両者に新しい経路が見える。",
      notes: "開けた視界を双方が利用できる。",
      coefficients: { focus: 1.1 },
    });
    assert.equal(
      event?.summary,
      "霧が割れる — 視界が開け、両者に新しい経路が見える。",
    );
    assert.doesNotMatch(event?.summary ?? "", /ハプニング/);
  });
});
