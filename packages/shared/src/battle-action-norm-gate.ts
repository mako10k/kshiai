// R: Keep engine-selected actions within the frozen character norm result.
import type { BattleAction, CharacterActionIntent } from "./battle.js";

export type BattleActionNormConstraint = {
  allowedActionKeys: readonly string[];
  fallback: CharacterActionIntent;
};

export function gateBattleActionByNorms(
  action: BattleAction,
  constraint: BattleActionNormConstraint | undefined,
): { action: BattleAction; replaced: boolean } {
  const key = action.kind === "skill" ? `skill:${action.skillId}` : action.kind;
  if (!constraint || constraint.allowedActionKeys.includes(key)) {
    return { action, replaced: false };
  }
  return { action: { actorSide: action.actorSide, ...constraint.fallback }, replaced: true };
}
