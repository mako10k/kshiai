// R: Preserve established incapacitation precedence and deterministic turn-limit scoring.
import { combatScore, type BattleState, type CombatantState } from "@kshiai/shared";
type Actor = Pick<CombatantState, "parameters" | "canFight">;
export function reservedTurnOutcome(a: Actor, b: Actor, turn: number, maxTurns: number, turnLimitEnabled: boolean): Pick<BattleState, "status" | "winnerSide" | "finishReason"> {
  if (!a.canFight || !b.canFight) return { status: "finished", finishReason: "incapacitated", winnerSide: a.canFight ? "a" : b.canFight ? "b" : "draw" };
  if (!turnLimitEnabled || turn < maxTurns) return { status: "active", winnerSide: null, finishReason: null };
  const scoreA = combatScore(a); const scoreB = combatScore(b);
  return { status: "finished", finishReason: "turn_limit", winnerSide: scoreA === scoreB ? "draw" : scoreA > scoreB ? "a" : "b" };
}
