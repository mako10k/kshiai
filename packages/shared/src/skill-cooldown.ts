/**
 * Skill cooldown from relative power.
 * Stronger skills rest longer (1–9 turns of lockout after use).
 *
 * Availability: after using on turn T with cooldown C, the skill is unavailable
 * while currentTurn < T + C + 1 (i.e. C full subsequent turns are blocked).
 * Example: T=5, C=1 → blocked turn 6, available turn 7.
 */

/** Map skill.power into cooldown turns in [1, 9]. */
export function skillCooldownTurns(power: number): number {
  const p = Number.isFinite(power) ? power : 1;
  // Observed skill powers cluster roughly in 0.55–1.85; clamp wider for safety.
  const minP = 0.5;
  const maxP = 2.0;
  const clamped = Math.max(minP, Math.min(maxP, p));
  const ratio = (clamped - minP) / (maxP - minP);
  return Math.max(1, Math.min(9, 1 + Math.round(ratio * 8)));
}

/** True when the skill cannot be used on currentTurn. */
export function isSkillOnCooldown(input: {
  skillId: string;
  power: number;
  currentTurn: number;
  lastUsedTurnBySkill?: Record<string, number> | null;
}): boolean {
  const last = input.lastUsedTurnBySkill?.[input.skillId];
  if (last == null || !Number.isFinite(last)) return false;
  const cd = skillCooldownTurns(input.power);
  return input.currentTurn < last + cd + 1;
}

/** Turns remaining until the skill is usable (0 = ready now). */
export function skillCooldownRemaining(input: {
  skillId: string;
  power: number;
  currentTurn: number;
  lastUsedTurnBySkill?: Record<string, number> | null;
}): number {
  const last = input.lastUsedTurnBySkill?.[input.skillId];
  if (last == null || !Number.isFinite(last)) return 0;
  const readyTurn = last + skillCooldownTurns(input.power) + 1;
  return Math.max(0, readyTurn - input.currentTurn);
}

/** Record successful skill use on the combatant's cooldown map. */
export function markSkillUsed(
  lastUsedTurnBySkill: Record<string, number> | null | undefined,
  skillId: string,
  turn: number,
): Record<string, number> {
  return {
    ...(lastUsedTurnBySkill ?? {}),
    [skillId]: turn,
  };
}
