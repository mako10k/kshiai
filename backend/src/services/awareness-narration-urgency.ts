// R: Identify confirmed capability changes that require immediate awareness narration delivery.
import type { BattleState } from "@kshiai/shared";
function participantCapabilitiesChanged(before: BattleState, after: BattleState, side: "a" | "b"): boolean {
  const previous = side === "a" ? before.sideA : before.sideB;
  const current = side === "a" ? after.sideA : after.sideB;
  if (previous.canFight !== current.canFight) return true;
  const previousBody = before.worldState?.entities[`character.${side}`]?.actorState;
  const currentBody = after.worldState?.entities[`character.${side}`]?.actorState;
  for (const capability of ["consciousness", "mobility", "restraint", "vision", "hearing", "mentalClarity", "agency"] as const) {
    if (previousBody?.[capability] !== currentBody?.[capability]) return true;
  }
  return (previousBody?.speech ?? "normal") !== (currentBody?.speech ?? "normal");
}
export function awarenessNarrationUrgent(before: BattleState, after: BattleState): boolean {
  if (after.status === "finished" || after.aftermathPending || before.winnerSide !== after.winnerSide) return true;
  return (["a", "b"] as const).some((side) => participantCapabilitiesChanged(before, after, side));
}
