import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSkillOnCooldown,
  markSkillUsed,
  skillCooldownRemaining,
  skillCooldownTurns,
} from "./skill-cooldown.js";

describe("skill cooldown", () => {
  it("maps power into 1–9 turns monotonically", () => {
    const weak = skillCooldownTurns(0.5);
    const mid = skillCooldownTurns(1);
    const strong = skillCooldownTurns(2);
    assert.equal(weak, 1);
    assert.ok(mid >= weak && mid <= strong);
    assert.equal(strong, 9);
    assert.equal(skillCooldownTurns(0.1), 1);
    assert.equal(skillCooldownTurns(99), 9);
  });

  it("blocks reuse until the cooldown window elapses", () => {
    const lastUsed = markSkillUsed(undefined, "slash", 5);
    // power 1.0 → mid cooldown
    const cd = skillCooldownTurns(1);
    assert.equal(isSkillOnCooldown({
      skillId: "slash",
      power: 1,
      currentTurn: 5,
      lastUsedTurnBySkill: lastUsed,
    }), true);
    assert.equal(isSkillOnCooldown({
      skillId: "slash",
      power: 1,
      currentTurn: 5 + cd,
      lastUsedTurnBySkill: lastUsed,
    }), true);
    assert.equal(isSkillOnCooldown({
      skillId: "slash",
      power: 1,
      currentTurn: 5 + cd + 1,
      lastUsedTurnBySkill: lastUsed,
    }), false);
    assert.equal(skillCooldownRemaining({
      skillId: "slash",
      power: 1,
      currentTurn: 5 + 1,
      lastUsedTurnBySkill: lastUsed,
    }), cd);
  });

  it("CD=1 blocks the next turn only", () => {
    const lastUsed = markSkillUsed({}, "poke", 3);
    // Force weak power → CD 1
    assert.equal(skillCooldownTurns(0.5), 1);
    assert.equal(isSkillOnCooldown({
      skillId: "poke",
      power: 0.5,
      currentTurn: 4,
      lastUsedTurnBySkill: lastUsed,
    }), true);
    assert.equal(isSkillOnCooldown({
      skillId: "poke",
      power: 0.5,
      currentTurn: 5,
      lastUsedTurnBySkill: lastUsed,
    }), false);
  });
});
