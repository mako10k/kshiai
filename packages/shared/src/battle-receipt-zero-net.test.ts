// R: Verify cancelling mechanical sources remain attributable in persisted turn records.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBattleTurnRecord, createBattleState } from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import { BattleTurnRecordSchema, type ResolvedBattleAction } from "./battle.js";
import type { CommittedMechanicalEvidence } from "./perception.js";
function sheet(id: string, name: string, hp = 100): CharacterSheet {
  const t = new Date().toISOString();
  return {
    id,
    ownerUserId: "u1",
    displayName: name,
    tags: [],
    createdAt: t,
    updatedAt: t,
    appearance: { summary: "test", visualPrompt: "test" },
    traits: ["勇敢"],
    parameters: defaultParameters({ hp, maxHp: hp }),
    skills: [
      {
        id: "slash",
        name: "斬撃",
        description: "基本攻撃",
        costMp: 0,
        costStamina: 5,
        power: 1.2,
        kind: "attack",
      },
    ],
    weapon: { name: "剣", description: "鉄の剣", atkBonus: 0, defBonus: 0, magBonus: 0 },
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "テスト用",
  };
}

describe("zero net consequence ownership", () => {
  it("retains both cancelling action contributions and an explicit aggregate zero", () => {
    const before = createBattleState({ id: "zero-net", sideA: sheet("a", "A"), sideB: sheet("b", "B"), turnLimit: 20 });
    const after = { ...before, turn: 1 };
    const actions: ResolvedBattleAction[] = [
      { id: "action-a", actorSide: "a", kind: "wait", executed: true, skippedReason: null },
      { id: "action-b", actorSide: "b", kind: "wait", executed: true, skippedReason: null },
    ];
    const value = before.sideB.parameters.stamina ?? 0;
    const evidence: CommittedMechanicalEvidence[] = actions.map((action, index) => ({
      evidenceId: `evidence-${index}`, turn: 1, sourceActionId: action.id, basisEventIds: [], actorSide: action.actorSide,
      target: { side: "b", entityId: "character.b" }, parameterKey: "stamina",
      attemptedDelta: index === 0 ? -5 : 5,
      beforeValue: index === 0 ? value : value - 5,
      afterValue: index === 0 ? value - 5 : value,
      delta: index === 0 ? -5 : 5,
      relativeReferenceBeforeValue: value, relativeReferenceAfterValue: value,
    }));
    const record = buildBattleTurnRecord({ before, after, events: [], actions, mechanicalEvidence: evidence });
    BattleTurnRecordSchema.parse(record);
    assert.equal(record.sideBChange.parameterChanges.stamina, 0);
    assert.deepEqual(record.consequenceReceipts?.filter((receipt) => receipt.source.kind === "action").map((receipt) => receipt.parameterChanges.b.stamina), [-5, 5]);
  });
});
