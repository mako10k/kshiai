import {
  PendingBattleEffectSchema,
  type BattleState,
  type CombatantState,
  type PendingBattleEffect,
} from "./battle.js";

export function schedulePendingEffect(
  state: BattleState,
  rawEffect: PendingBattleEffect,
): BattleState {
  const effect = PendingBattleEffectSchema.parse(rawEffect);
  if (effect.createdTurn !== state.turn) throw new Error("EFFECT_CREATED_TURN_MISMATCH");
  if ((state.pendingEffects ?? []).some((item) => item.effectId === effect.effectId)) {
    throw new Error("DUPLICATE_PENDING_EFFECT_ID");
  }
  if ((state.pendingEffects ?? []).length >= 32) throw new Error("PENDING_EFFECT_LIMIT");
  return {
    ...state,
    pendingEffects: [...(state.pendingEffects ?? []), effect],
  };
}

export type PendingEffectResolution = {
  effect: PendingBattleEffect;
  status: "applied" | "cancelled" | "expired" | "pending";
  reason: "due_turn" | "predicate_met" | "source_incapacitated" | "expired" | "not_due";
};

export function resolvePendingEffectSchedule(input: {
  turn: number;
  effects: readonly PendingBattleEffect[];
  sideA: CombatantState;
  sideB: CombatantState;
}): { resolutions: PendingEffectResolution[]; pendingEffects: PendingBattleEffect[] } {
  const seen = new Set<string>();
  const resolutions = input.effects.map((raw): PendingEffectResolution => {
    const effect = PendingBattleEffectSchema.parse(raw);
    if (seen.has(effect.effectId)) throw new Error("DUPLICATE_PENDING_EFFECT_ID");
    seen.add(effect.effectId);
    const source = effect.sourceSide === "a" ? input.sideA
      : effect.sourceSide === "b" ? input.sideB : null;
    if (effect.cancelIfSourceIncapacitated && source && !source.canFight) {
      return { effect, status: "cancelled", reason: "source_incapacitated" };
    }
    if (input.turn > effect.expiresTurn) {
      return { effect, status: "expired", reason: "expired" };
    }
    const target = effect.targetSide === "a" ? input.sideA : input.sideB;
    const triggered = effect.trigger.kind === "due_turn"
      ? input.turn >= effect.trigger.dueTurn
      : (target.parameters.hp ?? 0) * 100 <=
        (target.parameters.maxHp ?? target.baseParameters?.maxHp ?? 1) * effect.trigger.percent;
    return triggered
      ? {
          effect,
          status: "applied",
          reason: effect.trigger.kind === "due_turn" ? "due_turn" : "predicate_met",
        }
      : { effect, status: "pending", reason: "not_due" };
  });
  return {
    resolutions,
    pendingEffects: resolutions.flatMap((resolution) =>
      resolution.status === "pending" ? [resolution.effect] : []
    ),
  };
}
