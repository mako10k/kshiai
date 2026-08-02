import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  balanceCharacterCombatFields,
  balanceParameters,
  softenCombatDamage,
} from "./balance.js";
import { defaultParameters } from "./character.js";

describe("balance", () => {
  it("soft-caps extreme parameters", () => {
    const p = balanceParameters({
      ...defaultParameters(),
      atk: 99,
      def: 99,
      mag: 99,
      maxHp: 500,
      hp: 500,
    });
    assert.ok((p.atk ?? 0) <= 20);
    assert.ok((p.maxHp ?? 0) <= 140);
    assert.ok((p.def ?? 0) <= 16);
  });

  it("adds weakness when power-fantasy traits present", () => {
    const sheet = balanceCharacterCombatFields({
      parameters: defaultParameters(),
      skills: [
        {
          id: "s1",
          name: "滅殺",
          description: "全てを壊す",
          costMp: 0,
          costStamina: 0,
          power: 3,
          kind: "attack",
        },
      ],
      weapon: {
        name: "神剣",
        description: "最強",
        atkBonus: 20,
        defBonus: 10,
        magBonus: 10,
      },
      armor: null,
      traits: ["無敵", "最強"],
      narrativeBlurb: "誰にも負けない戦士。",
    });
    assert.ok((sheet.skills?.[0]?.power ?? 0) <= 1.85);
    assert.ok((sheet.weapon?.atkBonus ?? 0) <= 6);
    assert.ok(sheet.traits && sheet.traits.length >= 3);
    assert.match(sheet.narrativeBlurb ?? "", /隙|脆|崩れる/);
  });

  it("caps per-hit damage vs max HP", () => {
    const dmg = softenCombatDamage({
      rawDamage: 200,
      targetMaxHp: 100,
      skillPower: 1.8,
    });
    assert.ok(dmg <= 26);
    assert.ok(dmg >= 1);
  });
});
