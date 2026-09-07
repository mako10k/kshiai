import type {
  ActionResolution,
  ActionResolutionReason,
  BattleAction,
  CharacterActionIntent,
  CombatantState,
  FinisherState,
} from "./battle.js";
import type {
  ActionFeasibilityConstraints,
  BasicAttackProfile,
  CombatReadyCharacterSheet,
  Skill,
} from "./character.js";
import type { CharacterPerceptionFrame } from "./perception.js";
import {
  readBattleWorldPair,
  type BattleWorldState,
} from "./battle-world.js";
import {
  reachMaxRank,
  reachMinRank,
  inAreaDistanceRank,
} from "./reposition-transition.js";
import { deriveBattleActorCausality } from "./battle-causality.js";
import {
  isSkillOnCooldown,
  skillCooldownRemaining,
  skillCooldownTurns,
} from "./skill-cooldown.js";

export type ObserverSafeAvailableAction = {
  kind: CharacterActionIntent["kind"];
  skillId?: string;
  name: string;
  description?: string;
  skillKind?: Skill["kind"];
  costMp?: number;
  costStamina?: number;
  finisherCandidate?: boolean;
  /** Present on skills: full cooldown length derived from power (1–9). */
  cooldownTurns?: number;
  /** Turns until this skill is usable again (0 = ready). */
  cooldownRemaining?: number;
  target: {
    kind: "self" | "counterpart";
    perceivedAs: string;
  };
};

export type ActionFeasibilityResult =
  | { feasible: true }
  | { feasible: false; reason: ActionResolutionReason };

export type RevalidatedCharacterAction = {
  action: BattleAction | null;
  resolution: ActionResolution;
};

function characterId(side: "a" | "b"): `character.${"a" | "b"}` {
  return `character.${side}`;
}

function counterpartSide(side: "a" | "b"): "a" | "b" {
  return side === "a" ? "b" : "a";
}

function actionSkill(
  intent: CharacterActionIntent,
  skills: readonly Skill[],
): Skill | null {
  if (intent.kind !== "skill") return null;
  return skills.find((skill) => skill.id === intent.skillId) ?? null;
}

function targetsCounterpart(
  intent: CharacterActionIntent,
  skill: Skill | null,
): boolean {
  if (intent.kind === "basic_attack") return true;
  if (intent.kind !== "skill" || !skill) return false;
  if (["attack", "magic", "special"].includes(skill.kind)) return true;
  return (skill.effects ?? []).some((effect) => effect.target === "foe");
}

function inferredConstraints(
  intent: CharacterActionIntent,
  skill: Skill | null,
  basicAttack: BasicAttackProfile,
): ActionFeasibilityConstraints {
  if (intent.kind === "basic_attack") {
    return basicAttack.constraints ?? {
      reach: "same_area",
      requiresSight: false,
      mobility: "limited",
      requiresSpeech: false,
      requiresUsableHeldObject: false,
    };
  }
  if (intent.kind === "skill" && skill) {
    return skill.constraints ?? {
      reach: "same_area",
      requiresSight: false,
      mobility: ["attack", "special"].includes(skill.kind) ? "limited" : "none",
      requiresSpeech: false,
      requiresUsableHeldObject: false,
    };
  }
  if (intent.kind === "free_action") {
    return {
      reach: "same_area",
      requiresSight: false,
      mobility: "limited",
      requiresSpeech: false,
      requiresUsableHeldObject: false,
    };
  }
  if (intent.kind === "reposition") {
    return {
      reach: "same_area",
      requiresSight: false,
      mobility: "limited",
      requiresSpeech: false,
      requiresUsableHeldObject: false,
    };
  }
  return {
    reach: "same_area",
    requiresSight: false,
    mobility: "none",
    requiresSpeech: false,
    requiresUsableHeldObject: false,
  };
}

function actorWorldFailure(input: {
  actorSide: "a" | "b";
  actor: CombatantState;
  worldState?: BattleWorldState;
  constraints: ActionFeasibilityConstraints;
}): ActionResolutionReason | null {
  if (!input.actor.canFight || (input.actor.parameters.hp ?? 0) <= 0) {
    return "actor_unavailable";
  }
  if (!input.worldState) return null;
  const entity = input.worldState.entities[characterId(input.actorSide)];
  if (!entity?.active || entity.presence !== "present" || !entity.actorState) {
    return "actor_unavailable";
  }
  const actorState = deriveBattleActorCausality({
    worldState: input.worldState,
    actorSide: input.actorSide,
  }).effectiveActorState ?? entity.actorState;
  if (["unconscious", "incapacitated"].includes(actorState.consciousness)) {
    return "actor_unavailable";
  }
  if (actorState.agency !== "self_directed") return "agency_blocked";
  if (
    input.constraints.requiresSpeech &&
    ["blocked", "absent"].includes(actorState.speech ?? "normal")
  ) {
    return "speech_blocked";
  }
  if (input.constraints.mobility !== "none") {
    const blocked = actorState.mobility === "immobilized" ||
      actorState.restraint === "restrained";
    const fullBlocked = input.constraints.mobility === "full" &&
      (actorState.mobility !== "mobile" || actorState.restraint !== "free");
    const area = entity.placement.type === "scene"
      ? input.worldState.areas[entity.placement.areaId]
      : null;
    const areaBlocked = area?.movement === "blocked" ||
      (input.constraints.mobility === "full" && area?.movement === "restricted");
    if (blocked || fullBlocked || areaBlocked) return "movement_blocked";
  }
  if (input.constraints.requiresUsableHeldObject) {
    const actorId = characterId(input.actorSide);
    const usable = Object.entries(input.worldState.entities).some(([, candidate]) =>
      candidate.active &&
      candidate.presence === "present" &&
      candidate.objectState?.usable &&
      (candidate.objectState.usableBy.length === 0 ||
        candidate.objectState.usableBy.includes(actorId)) &&
      (
        (candidate.placement.type === "held" && candidate.placement.holderId === actorId) ||
        (candidate.placement.type === "worn" && candidate.placement.wearerId === actorId)
      )
    );
    if (!usable) return "required_object_unavailable";
  }
  return null;
}

function observerLocalizesCounterpart(
  frame: CharacterPerceptionFrame,
): boolean {
  return frame.counterpart.currentAccess === "coarse" ||
    frame.counterpart.currentAccess === "clear";
}

function targetWorldFailure(input: {
  actorSide: "a" | "b";
  worldState?: BattleWorldState;
  constraints: ActionFeasibilityConstraints;
}): ActionResolutionReason | null {
  if (!input.worldState) return null;
  const actorId = characterId(input.actorSide);
  const targetId = characterId(counterpartSide(input.actorSide));
  const actor = input.worldState.entities[actorId];
  const target = input.worldState.entities[targetId];
  if (!target?.active || target.presence !== "present") return "target_unavailable";
  const pair = readBattleWorldPair(input.worldState, actorId, targetId);
  if (
    !pair ||
    pair.distance === "separate_area" ||
    pair.distance === "out_of_scene"
  ) {
    return "out_of_range";
  }
  const rank = inAreaDistanceRank(pair.distance);
  if (rank === null) return "out_of_range";
  if (rank > reachMaxRank(input.constraints.reach)) {
    return "out_of_range";
  }
  if (rank < reachMinRank(input.constraints.minReach)) {
    return "out_of_range";
  }
  if (input.constraints.requiresSight) {
    const actorState = deriveBattleActorCausality({
      worldState: input.worldState,
      actorSide: input.actorSide,
    }).effectiveActorState ?? actor?.actorState;
    if (
      ["blocked", "absent"].includes(actorState?.vision ?? "blocked") ||
      ["hidden", "invisible"].includes(target.exposure)
    ) {
      return "line_of_sight_blocked";
    }
  }
  if (actor?.actorState?.mentalClarity === "delirious") {
    return "target_unlocalized";
  }
  return null;
}

export function assessCharacterActionFeasibility(input: {
  actorSide: "a" | "b";
  intent: CharacterActionIntent;
  actor: CombatantState;
  skills: readonly Skill[];
  basicAttack: BasicAttackProfile;
  finisher?: FinisherState;
  turn: number;
  worldState?: BattleWorldState;
}): ActionFeasibilityResult {
  if (input.intent.kind !== "skill" && (input.intent.skillId || input.intent.useFinisher)) {
    return { feasible: false, reason: "invalid_intent" };
  }
  if (input.intent.instrumentRef) {
    const actorId = characterId(input.actorSide);
    const instrument = input.worldState
      ? Object.entries(input.worldState.entities).find(([id, entity]) =>
          id === input.intent.instrumentRef?.replace(/^entity:/, "") ||
          entity.objectProfile?.observerRefs[input.actorSide] ===
            input.intent.instrumentRef
        )
      : null;
    const entity = instrument?.[1];
    const controlled = entity && (
      (entity.placement.type === "held" && entity.placement.holderId === actorId) ||
      (entity.placement.type === "worn" && entity.placement.wearerId === actorId)
    );
    if (
      !controlled ||
      !entity?.active ||
      entity.presence !== "present" ||
      !entity.objectState?.usable
    ) {
      return { feasible: false, reason: "required_object_unavailable" };
    }
  }
  const skill = actionSkill(input.intent, input.skills);
  if (input.intent.kind === "skill" && !skill) {
    return { feasible: false, reason: "skill_unavailable" };
  }
  if (skill) {
    if (
      (input.actor.parameters.mp ?? 0) < skill.costMp ||
      (input.actor.parameters.stamina ?? 0) < skill.costStamina
    ) {
      return { feasible: false, reason: "insufficient_resource" };
    }
    if (
      isSkillOnCooldown({
        skillId: skill.id,
        power: skill.power,
        currentTurn: input.turn,
        lastUsedTurnBySkill: input.actor.skillLastUsedTurn,
      })
    ) {
      return { feasible: false, reason: "skill_on_cooldown" };
    }
    const finisherReady = Boolean(
      input.finisher &&
      !input.finisher.used &&
      input.turn >= 10 &&
      input.finisher.skillId === skill.id,
    );
    if (skill.kind === "special" && !finisherReady) {
      return { feasible: false, reason: "finisher_unavailable" };
    }
    if (input.intent.useFinisher && !finisherReady) {
      return { feasible: false, reason: "finisher_unavailable" };
    }
  }
  const constraints = inferredConstraints(input.intent, skill, input.basicAttack);
  const actorFailure = actorWorldFailure({
    actorSide: input.actorSide,
    actor: input.actor,
    worldState: input.worldState,
    constraints,
  });
  if (actorFailure) return { feasible: false, reason: actorFailure };
  if (targetsCounterpart(input.intent, skill)) {
    const targetFailure = targetWorldFailure({
      actorSide: input.actorSide,
      worldState: input.worldState,
      constraints,
    });
    if (targetFailure) return { feasible: false, reason: targetFailure };
  }
  return { feasible: true };
}

type ObserverSafeActionCandidate = {
  intent: CharacterActionIntent;
  option: Omit<ObserverSafeAvailableAction, "target">;
};

function observerSafeActionCandidates(input: {
  actor: CombatantState;
  sheet: CombatReadyCharacterSheet;
  finisher?: FinisherState;
  turn: number;
  basicAttack: BasicAttackProfile;
}): ObserverSafeActionCandidate[] {
  return [
    { intent: { kind: "basic_attack" }, option: { kind: "basic_attack", name: input.basicAttack.name } },
    { intent: { kind: "defend" }, option: { kind: "defend", name: "防御" } },
    { intent: { kind: "rest" }, option: { kind: "rest", name: "休息" } },
    { intent: { kind: "wait" }, option: { kind: "wait", name: "様子を見る" } },
    {
      intent: { kind: "reposition" },
      option: {
        kind: "reposition",
        name: "間合いを変える",
        description: "適切な間合いまで一歩動く。攻撃は届く距離でのみ当たる。",
      },
    },
    {
      intent: {
        kind: "reflect",
        reflectionAnalysis: "ここまでの戦況を整理する",
        reflectionGuideline: "次の一手の方針を立てる",
      },
      option: {
        kind: "reflect",
        name: "戦況を省みる",
        description:
          "1ターンを費やして戦況を分析し、今後の行動指針を戦闘中の揮発メモリへ書き込む（試合後の反省では参照可能。キャラ永続メモリには直接書かない）。慎重な判断や不利な局面、他に有効な手が薄いときに向く。短気・直情的な性格では通常選ばない。",
      },
    },
    {
      intent: { kind: "free_action", description: "場面へ現実的に働きかける" },
      option: {
        kind: "free_action",
        name: "自由行動",
        description: "知覚している相手や物、場面へ自然文で働きかける。",
      },
    },
    ...input.sheet.skills.map((skill) => ({
      intent: { kind: "skill" as const, skillId: skill.id },
      option: {
        kind: "skill" as const,
        skillId: skill.id,
        name: skill.name,
        skillKind: skill.kind,
        costMp: skill.costMp,
        costStamina: skill.costStamina,
        finisherCandidate: skill.id === input.finisher?.skillId,
        cooldownTurns: skillCooldownTurns(skill.power),
        cooldownRemaining: skillCooldownRemaining({
          skillId: skill.id,
          power: skill.power,
          currentTurn: input.turn,
          lastUsedTurnBySkill: input.actor.skillLastUsedTurn,
        }),
      },
    })),
  ];
}

function withObserverSafeTarget(
  intent: CharacterActionIntent,
  option: Omit<ObserverSafeAvailableAction, "target">,
  skills: readonly Skill[],
  perceivedAs: string,
): ObserverSafeAvailableAction {
  const counterpartTarget = targetsCounterpart(intent, actionSkill(intent, skills));
  return {
    ...option,
    target: counterpartTarget
      ? { kind: "counterpart", perceivedAs }
      : { kind: "self", perceivedAs: "自分" },
  };
}

export function buildObserverSafeAvailableActions(input: {
  actorSide: "a" | "b";
  actor: CombatantState;
  sheet: CombatReadyCharacterSheet;
  finisher?: FinisherState;
  turn: number;
  worldState?: BattleWorldState;
  perception: CharacterPerceptionFrame;
}): ObserverSafeAvailableAction[] {
  const basicAttack = input.sheet.basicAttack;
  return observerSafeActionCandidates({
    actor: input.actor,
    sheet: input.sheet,
    finisher: input.finisher,
    turn: input.turn,
    basicAttack,
  }).flatMap(({ intent, option }) => {
    const assessed = assessCharacterActionFeasibility({
      actorSide: input.actorSide,
      intent,
      actor: input.actor,
      skills: input.sheet.skills,
      basicAttack,
      finisher: input.finisher,
      turn: input.turn,
      worldState: input.worldState,
    });
    if (!assessed.feasible) return [];
    if (
      targetsCounterpart(intent, actionSkill(intent, input.sheet.skills)) &&
      !observerLocalizesCounterpart(input.perception)
    ) {
      return [];
    }
    return [withObserverSafeTarget(
      intent,
      option,
      input.sheet.skills,
      input.perception.counterpart.perceivedAs,
    )];
  });
}

export function revalidateCharacterAction(input: {
  actorSide: "a" | "b";
  requested: CharacterActionIntent;
  actor: CombatantState;
  skills: readonly Skill[];
  basicAttack: BasicAttackProfile;
  finisher?: FinisherState;
  turn: number;
  worldState?: BattleWorldState;
  spacingEnabled?: boolean;
}): RevalidatedCharacterAction {
  const assess = (intent: CharacterActionIntent) =>
    assessCharacterActionFeasibility({
      actorSide: input.actorSide,
      intent,
      actor: input.actor,
      skills: input.skills,
      basicAttack: input.basicAttack,
      finisher: input.finisher,
      turn: input.turn,
      worldState: input.worldState,
    });
  const initial = assess(input.requested);
  if (initial.feasible) {
    return {
      action: { actorSide: input.actorSide, ...input.requested },
      resolution: { requested: input.requested, outcome: "accepted", reason: null },
    };
  }
  if (
    initial.reason === "finisher_unavailable" &&
    input.requested.kind === "skill" &&
    input.requested.useFinisher
  ) {
    const downgraded: CharacterActionIntent = {
      kind: "skill",
      ...(input.requested.skillId ? { skillId: input.requested.skillId } : {}),
    };
    const retried = assess(downgraded);
    if (retried.feasible) {
      return {
        action: { actorSide: input.actorSide, ...downgraded },
        resolution: {
          requested: input.requested,
          outcome: "partial",
          reason: "finisher_unavailable",
        },
      };
    }
  }
  const maxMp = input.actor.parameters.maxMp ?? 0;
  const maxStamina = input.actor.parameters.maxStamina ?? 0;
  const needsRest = (input.actor.parameters.mp ?? 0) < maxMp ||
    (input.actor.parameters.stamina ?? 0) < maxStamina;
  const spacingSubstitute = input.spacingEnabled &&
    (initial.reason === "out_of_range" || initial.reason === "target_unlocalized") &&
    targetsCounterpart(input.requested, actionSkill(input.requested, input.skills));
  const fallbacks: CharacterActionIntent[] = [
    ...(spacingSubstitute
      ? [{ kind: "reposition" as const }]
      : []),
    ...(needsRest ? [{ kind: "rest" as const }] : []),
    { kind: "defend" },
    { kind: "wait" },
  ];
  for (const fallback of fallbacks) {
    if (assess(fallback).feasible) {
      return {
        action: { actorSide: input.actorSide, ...fallback },
        resolution: {
          requested: input.requested,
          outcome: "substituted",
          reason: initial.reason,
        },
      };
    }
  }
  return {
    action: null,
    resolution: {
      requested: input.requested,
      outcome: "failed",
      reason: initial.reason,
    },
  };
}
