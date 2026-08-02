import type {
  BattleAction,
  BattleState,
  CombatantState,
  Situation,
  TurnEvent,
} from "./battle.js";
import { clampCoefficient, isCombatantDown } from "./battle.js";
import type { CharacterSheet, Skill } from "./character.js";

function nowIso(): string {
  return new Date().toISOString();
}

function cloneCombatant(c: CombatantState): CombatantState {
  return {
    ...c,
    parameters: { ...c.parameters },
  };
}

export function combatantFromSheet(sheet: CharacterSheet): CombatantState {
  return {
    characterId: sheet.id,
    displayName: sheet.displayName,
    parameters: { ...sheet.parameters },
    defending: false,
    canFight: sheet.combatFlags.canFight,
    irreversibleIncapacitated: sheet.combatFlags.irreversibleIncapacitated,
  };
}

export function createBattleState(input: {
  id: string;
  sideA: CharacterSheet;
  sideB: CharacterSheet;
  turnLimit: number;
  scene?: string;
}): BattleState {
  const t = nowIso();
  return {
    id: input.id,
    status: "active",
    turn: 0,
    turnLimit: input.turnLimit,
    sideA: combatantFromSheet(input.sideA),
    sideB: combatantFromSheet(input.sideB),
    situation: {
      scene: input.scene ?? "黄昏の闘技場",
      notes: "観客の熱気が立ちこめている。",
      coefficients: {},
    },
    log: [],
    winnerSide: null,
    finishReason: null,
    createdAt: t,
    updatedAt: t,
  };
}

export function applySituationCoefficients(
  current: Situation,
  proposed: Partial<Situation> | undefined,
): Situation {
  if (!proposed) return current;
  const coefficients: Record<string, number> = { ...current.coefficients };
  if (proposed.coefficients) {
    for (const [k, v] of Object.entries(proposed.coefficients)) {
      coefficients[k] = clampCoefficient(v);
    }
  }
  return {
    scene: proposed.scene?.trim() ? proposed.scene : current.scene,
    notes: proposed.notes ?? current.notes,
    coefficients,
  };
}

function coeff(situation: Situation, key: string, fallback = 1): number {
  const v = situation.coefficients[key];
  return v === undefined ? fallback : clampCoefficient(v);
}

function findSkill(sheetSkills: Skill[], skillId: string | undefined): Skill | undefined {
  if (!skillId) return sheetSkills[0];
  return sheetSkills.find((s) => s.id === skillId) ?? sheetSkills[0];
}

function intensityFromDamage(dmg: number): TurnEvent["intensity"] {
  if (dmg >= 40) return "critical";
  if (dmg >= 25) return "heavy";
  if (dmg >= 12) return "moderate";
  return "minor";
}

/**
 * Resolve one player action for side A, then a simple AI response for side B.
 * Pure function — no LLM.
 */
export function resolveTurn(input: {
  state: BattleState;
  playerAction: BattleAction;
  sideASkills: Skill[];
  sideBSkills: Skill[];
  situationUpdate?: Partial<Situation>;
}): { state: BattleState; events: TurnEvent[] } {
  if (input.state.status !== "active") {
    return { state: input.state, events: [] };
  }

  let sideA = cloneCombatant(input.state.sideA);
  let sideB = cloneCombatant(input.state.sideB);
  sideA.defending = false;
  sideB.defending = false;

  const situation = applySituationCoefficients(input.state.situation, input.situationUpdate);
  const events: TurnEvent[] = [];
  const turn = input.state.turn + 1;

  // Player (side A)
  applyAction(sideA, sideB, input.playerAction, input.sideASkills, situation, events);

  // AI (side B) if still up
  if (!isCombatantDown(sideB) && !isCombatantDown(sideA)) {
    const aiSkill = pickAiSkill(input.sideBSkills, sideB);
    const aiAction: BattleAction = aiSkill
      ? { actorSide: "b", kind: "skill", skillId: aiSkill.id }
      : { actorSide: "b", kind: "wait" };
    applyAction(sideB, sideA, aiAction, input.sideBSkills, situation, events);
  }

  // Incapacity flags
  if ((sideA.parameters.hp ?? 0) <= 0) {
    sideA.canFight = false;
    sideA.irreversibleIncapacitated = true;
    events.push({
      type: "status",
      actorName: sideA.displayName,
      summary: `${sideA.displayName} は戦闘不能に陥った。`,
    });
  }
  if ((sideB.parameters.hp ?? 0) <= 0) {
    sideB.canFight = false;
    sideB.irreversibleIncapacitated = true;
    events.push({
      type: "status",
      actorName: sideB.displayName,
      summary: `${sideB.displayName} は戦闘不能に陥った。`,
    });
  }

  let status: BattleState["status"] = "active";
  let winnerSide: BattleState["winnerSide"] = null;
  let finishReason: BattleState["finishReason"] = null;

  const aDown = isCombatantDown(sideA);
  const bDown = isCombatantDown(sideB);

  if (aDown && bDown) {
    status = "finished";
    winnerSide = "draw";
    finishReason = "incapacitated";
  } else if (aDown) {
    status = "finished";
    winnerSide = "b";
    finishReason = "incapacitated";
  } else if (bDown) {
    status = "finished";
    winnerSide = "a";
    finishReason = "incapacitated";
  } else if (turn >= input.state.turnLimit) {
    status = "finished";
    finishReason = "turn_limit";
    // Hidden score for turn-limit tie-break (engine-side); referee LLM may override later.
    const scoreA = combatScore(sideA);
    const scoreB = combatScore(sideB);
    if (scoreA === scoreB) winnerSide = "draw";
    else winnerSide = scoreA > scoreB ? "a" : "b";
  }

  const state: BattleState = {
    ...input.state,
    turn,
    sideA,
    sideB,
    situation,
    status,
    winnerSide,
    finishReason,
    updatedAt: nowIso(),
  };

  return { state, events };
}

function combatScore(c: CombatantState): number {
  const p = c.parameters;
  return (p.hp ?? 0) * 2 + (p.mp ?? 0) + (p.stamina ?? 0) + (p.atk ?? 0) + (p.def ?? 0);
}

function pickAiSkill(skills: Skill[], self: CombatantState): Skill | undefined {
  const usable = skills.filter(
    (s) => (self.parameters.mp ?? 0) >= s.costMp && (self.parameters.stamina ?? 0) >= s.costStamina,
  );
  if (usable.length === 0) return undefined;
  return usable[Math.floor(Math.random() * usable.length)] ?? usable[0];
}

function applyAction(
  actor: CombatantState,
  target: CombatantState,
  action: BattleAction,
  skills: Skill[],
  situation: Situation,
  events: TurnEvent[],
): void {
  if (action.kind === "wait") {
    events.push({
      type: "wait",
      actorName: actor.displayName,
      summary: `${actor.displayName} は様子をうかがった。`,
    });
    return;
  }

  if (action.kind === "defend") {
    actor.defending = true;
    events.push({
      type: "defend",
      actorName: actor.displayName,
      summary: `${actor.displayName} は守りを固めた。`,
    });
    return;
  }

  const skill = findSkill(skills, action.skillId);
  if (!skill) {
    events.push({
      type: "info",
      actorName: actor.displayName,
      summary: `${actor.displayName} は技を繰り出せなかった。`,
    });
    return;
  }

  const mp = actor.parameters.mp ?? 0;
  const sta = actor.parameters.stamina ?? 0;
  if (mp < skill.costMp || sta < skill.costStamina) {
    events.push({
      type: "info",
      actorName: actor.displayName,
      skillName: skill.name,
      summary: `${actor.displayName} は力及ばず ${skill.name} を使えなかった。`,
    });
    return;
  }

  actor.parameters.mp = mp - skill.costMp;
  actor.parameters.stamina = sta - skill.costStamina;

  if (skill.kind === "defend" || skill.kind === "support") {
    actor.defending = skill.kind === "defend";
    const heal = Math.round(8 * skill.power * coeff(situation, "heal"));
    if (skill.kind === "support" && heal > 0) {
      const maxHp = actor.parameters.maxHp ?? 100;
      actor.parameters.hp = Math.min(maxHp, (actor.parameters.hp ?? 0) + heal);
      events.push({
        type: "heal",
        actorName: actor.displayName,
        skillName: skill.name,
        intensity: intensityFromDamage(heal),
        summary: `${actor.displayName} の ${skill.name} が傷を癒やした。`,
      });
    } else {
      events.push({
        type: "defend",
        actorName: actor.displayName,
        skillName: skill.name,
        summary: `${actor.displayName} は ${skill.name} で身を守った。`,
      });
    }
    return;
  }

  const atkStat = skill.kind === "magic" ? (actor.parameters.mag ?? 10) : (actor.parameters.atk ?? 10);
  const defStat = skill.kind === "magic" ? (target.parameters.res ?? 10) : (target.parameters.def ?? 10);
  const wAtk = 0; // equipment already baked into sheet params for scaffold
  const base = Math.max(1, atkStat + wAtk - defStat * 0.5);
  let dmg = Math.round(base * skill.power * coeff(situation, "damage") * coeff(situation, skill.element ?? "neutral", 1));
  if (target.defending) dmg = Math.round(dmg * 0.5);
  dmg = Math.max(1, dmg);

  target.parameters.hp = Math.max(0, (target.parameters.hp ?? 0) - dmg);
  events.push({
    type: "damage",
    actorName: actor.displayName,
    targetName: target.displayName,
    skillName: skill.name,
    intensity: intensityFromDamage(dmg),
    summary: `${actor.displayName} の ${skill.name} が ${target.displayName} を捉えた。`,
  });
}
