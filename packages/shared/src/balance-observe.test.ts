import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accumulateBattleBalanceTrace,
  battleBalanceFlags,
  emptyBattleBalanceTrace,
  sheetCombatProfile,
} from "./balance-observe.js";

describe("balance-observe", () => {
  it("flags one-shot and early KO from HP deltas", () => {
    let t = emptyBattleBalanceTrace();
    t = accumulateBattleBalanceTrace(t, {
      hpBeforeA: 120,
      hpBeforeB: 95,
      hpAfterA: 0,
      hpAfterB: 95,
      maxHpA: 120,
      maxHpB: 95,
    });
    assert.equal(t.combatTurns, 1);
    assert.equal(t.oneShotSuspect, true);
    assert.equal(t.firstKoCombatTurn, 1);
    assert.ok(t.maxTurnDamageRatioB >= 0.9);
    const flags = battleBalanceFlags(t);
    assert.equal(flags.earlyKo, true);
    assert.equal(flags.oneShotSuspect, true);
    assert.equal(flags.shortMatch, true);
  });

  it("computes sheet sharpness higher for peaked builds", () => {
    const flat = sheetCombatProfile({
      parameters: {
        maxHp: 100,
        atk: 12,
        def: 12,
        mag: 12,
        res: 12,
        spd: 12,
        focus: 12,
        luck: 12,
      },
      skills: [{ id: "s1", name: "a", description: "", costMp: 0, costStamina: 5, power: 1.1, kind: "attack" }],
    });
    const peaked = sheetCombatProfile({
      parameters: {
        maxHp: 140,
        atk: 20,
        def: 6,
        mag: 6,
        res: 6,
        spd: 18,
        focus: 8,
        luck: 8,
      },
      skills: [
        {
          id: "s1",
          name: "nuke",
          description: "",
          costMp: 0,
          costStamina: 5,
          power: 40,
          kind: "attack",
        },
      ],
    });
    assert.ok(peaked.sharpness > flat.sharpness);
    assert.equal(peaked.maxSkillPower, 40);
  });
});
