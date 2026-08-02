import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  balanceCharacterCombatFields,
  balanceEquipment,
  balanceParameters,
  balanceSkill,
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

  it("caps peaked mechanics without rewriting LLM-authored prose", () => {
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
    assert.deepEqual(sheet.traits, ["無敵", "最強"]);
    assert.equal(sheet.narrativeBlurb, "誰にも負けない戦士。");
    assert.equal(sheet.skills?.[0]?.description, "全てを壊す");
    assert.equal(sheet.weapon?.description, "最強");
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

  it("adds costs to free status skills and tradeoffs to positive equipment", () => {
    const skill = balanceSkill({
      id: "status",
      name: "強化",
      description: "攻撃を高める。",
      costMp: 0,
      costStamina: 0,
      power: 1,
      kind: "status",
      effects: [{ target: "self", parameter: "atk", delta: 99 }],
    });
    assert.ok(skill.costMp > 0 || skill.costStamina > 0);
    assert.equal(skill.effects?.[0]?.delta, 10);
    assert.equal(skill.description, "攻撃を高める。");

    const equipment = balanceEquipment({
        name: "強化剣",
        description: "攻撃を高める。",
        atkBonus: 4,
        defBonus: 0,
        magBonus: 0,
    });
    assert.ok(equipment?.effects?.some((effect) => effect.delta < 0));
    assert.equal(equipment?.description, "攻撃を高める。");
  });
});
