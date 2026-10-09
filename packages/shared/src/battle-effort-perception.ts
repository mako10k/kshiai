// R: Project only the observer's present bodily effort and known penalty consequences.
import { SelfActionEffortPerceptionV1Schema, repeatedActionStaminaCost } from "./action-effort-policy.js";
import type { BattleState } from "./battle.js";

export function projectBattleActionEffort(state: Pick<BattleState, "sideA" | "sideB" | "dramaState" | "latestFreeActionReceipts">,
  side: "a" | "b") {
  const actor = side === "a" ? state.sideA : state.sideB;
  if (!actor.actionEffortPolicy) return null;
  const stamina = actor.parameters.stamina ?? 0;
  const maximum = Math.max(1, actor.parameters.maxStamina ?? 1);
  const fatigue = bodilyFatigue(stamina, maximum);
  const previousRepeatCount = side === "a" ? state.dramaState?.repeatedActionA : state.dramaState?.repeatedActionB;
  const nextEffort = repeatedActionStaminaCost({ kind: "skill", repeatCount: (previousRepeatCount ?? 0) + 1,
    policy: actor.actionEffortPolicy });
  const penalty = state.latestFreeActionReceipts?.find((receipt) => receipt.actorSide === side)?.penalty;
  return SelfActionEffortPerceptionV1Schema.parse({ contractVersion: actor.actionEffortPolicy.contractVersion, fatigue,
    repeatingEffort: nextEffort > 0 ? `同じ動きを続けると、いつもの負担にSTA${nextEffort}の消耗が重なりそう` : "同じ動きも、重ねれば息が乱れそう",
    freeActionRisk: actor.pendingDefenseExposure ? "体勢に隙が残り、次の攻撃で傷つきやすそう"
      : "無理に動くと息が切れ、隙が出たり途中までしか動けないことがある",
    latestPenalty: penalty ? perceivedPenaltyResult(penalty) : null });
}

function bodilyFatigue(stamina: number, maximum: number): string {
  if (stamina <= 0) return "力が入らない";
  if (stamina / maximum < 0.25) return "息が重い";
  return stamina / maximum < 0.55 ? "少し息が乱れている" : "息はまだ楽";
}

function perceivedPenaltyResult(penalty: NonNullable<NonNullable<BattleState["latestFreeActionReceipts"]>[number]["penalty"]>) {
  const proposal = penalty.proposal;
  if (proposal.kind === "extra_stamina") return `STA${penalty.paidStamina}消耗、必要量${penalty.requestedStamina}、不足${penalty.unpaidStamina}。${proposal.reason}`;
  if (proposal.kind === "defense_exposure") return `次の攻撃1回まで防御が${Math.round(penalty.defenseReduction * 100)}％低下。${proposal.reason}`;
  return proposal.execution === "partial" ? `途中までしか動けなかった：${proposal.executedDescription}。${proposal.reason}` : `動作は実行できなかった。${proposal.reason}`;
}
