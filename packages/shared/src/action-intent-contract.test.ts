import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleActionSchema,
  CharacterActionIntentSchema,
  ResolvedBattleActionSchema,
  projectCharacterActionIntent,
  type BattleAction,
  type CharacterActionIntent,
  type ResolvedBattleAction,
} from "./battle.js";

type Fits<Input, Contract> = Input extends Contract ? true : false;
const missingFreeDescription: Fits<{
  kind: "free_action"; subjectRefs: [string];
}, CharacterActionIntent> = false;
const missingFreeSubjects: Fits<{
  kind: "free_action"; description: string;
}, CharacterActionIntent> = false;
const emptyFreeSubjects: Fits<{
  kind: "free_action"; description: string; subjectRefs: [];
}, CharacterActionIntent> = false;
const missingReflectGuideline: Fits<{
  kind: "reflect"; reflectionAnalysis: string;
}, CharacterActionIntent> = false;
const missingReflectAnalysis: Fits<{
  kind: "reflect"; reflectionGuideline: string;
}, CharacterActionIntent> = false;
const incompleteBattleAction: Fits<{
  kind: "free_action"; actorSide: "a";
}, BattleAction> = false;
const incompleteResolvedAction: Fits<{
  kind: "reflect"; actorSide: "a"; id: string; executed: true; skippedReason: null;
}, ResolvedBattleAction> = false;
const completeFreeAction: Fits<{
  kind: "free_action"; description: string; subjectRefs: [string];
}, CharacterActionIntent> = true;
const freeActionWithSkillAuthority: Fits<{
  kind: "free_action"; description: string; subjectRefs: [string]; skillId: string;
}, CharacterActionIntent> = false;

describe("discriminated action intent contracts", () => {
  it("rejects incomplete and mixed branches statically", () => {
    assert.deepEqual([
      missingFreeDescription, missingFreeSubjects, emptyFreeSubjects,
      missingReflectGuideline, missingReflectAnalysis,
      incompleteBattleAction, incompleteResolvedAction, freeActionWithSkillAuthority,
    ], Array(8).fill(false));
    assert.equal(completeFreeAction, true);
  });

  it("requires the same branch payload at every runtime boundary", () => {
    for (const intent of [
      { kind: "free_action" },
      { kind: "free_action", description: "柱を支えにする", subjectRefs: [] },
      { kind: "reflect", reflectionAnalysis: "間合いを整理する" },
      { kind: "reflect", reflectionGuideline: "届く距離を保つ" },
    ]) {
      assert.equal(CharacterActionIntentSchema.safeParse(intent).success, false);
      assert.equal(BattleActionSchema.safeParse({ ...intent, actorSide: "a" }).success, false);
      assert.equal(ResolvedBattleActionSchema.safeParse({
        ...intent, actorSide: "a", id: "action-1", executed: true,
      }).success, false);
    }
  });

  it("preserves full free-action and reflect payloads through resolved projection", () => {
    const intents: CharacterActionIntent[] = [
      {
        kind: "free_action", description: "柱を支えにする",
        subjectRefs: ["pillar"], desiredOutcome: "姿勢を保つ", opportunityId: "brace",
      },
      {
        kind: "reflect", reflectionAnalysis: "間合いを整理する",
        reflectionGuideline: "届く距離を保つ",
      },
      { kind: "skill", skillId: "strike", useFinisher: false, instrumentRef: "sword" },
      { kind: "basic_attack" }, { kind: "defend" }, { kind: "rest" },
      { kind: "wait" }, { kind: "reposition" },
    ];
    for (const intent of intents) {
      const resolved = ResolvedBattleActionSchema.parse({
        ...intent, actorSide: "a", id: "action-1", executed: true,
      });
      assert.deepEqual(projectCharacterActionIntent(resolved), intent);
      assert.deepEqual(CharacterActionIntentSchema.parse(intent), intent);
    }
  });

  it("rejects forbidden authority, excess references and unknown fields", () => {
    const free = { kind: "free_action", description: "柱を支えにする", subjectRefs: ["pillar"] };
    for (const extra of [
      { skillId: "strike" }, { useFinisher: true }, { instrumentRef: "sword" },
      { reflectionAnalysis: "分析" }, { unexpected: "field" },
      { subjectRefs: ["a", "b", "c", "d", "e"] },
    ]) assert.equal(CharacterActionIntentSchema.safeParse({ ...free, ...extra }).success, false);
    assert.equal(CharacterActionIntentSchema.safeParse({
      kind: "reposition", description: "move",
    }).success, false);
  });
});
