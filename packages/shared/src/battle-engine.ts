import type {
  BattleAction,
  BattlePolicyOption,
  BattleStance,
  BattleState,
  CombatantState,
  PolicyBias,
  Situation,
  TurnEvent,
} from "./battle.js";
import { clampCoefficient, isCombatantDown } from "./battle.js";
import type { CharacterSheet, Skill } from "./character.js";
import type { BattlefieldInstance } from "./battlefield.js";
import { clampCoefficientMap, mergeCoefficients } from "./battlefield.js";

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
  battlefield?: BattlefieldInstance;
  stanceA?: BattleStance;
  stanceB?: BattleStance;
  policiesA?: BattlePolicyOption[];
  selectedPolicyIdsA?: string[];
  policiesB?: BattlePolicyOption[];
  selectedPolicyIdsB?: string[];
}): BattleState {
  const t = nowIso();
  const bf = input.battlefield;
  const baseCoeffs = clampCoefficientMap(bf?.coefficients ?? {});
  const tags = [
    ...(bf?.obstacles ?? []),
    ...(bf?.conditions ?? []),
    bf?.terrain ?? "",
  ].filter(Boolean);

  const policiesA = input.policiesA ?? [];
  const policiesB = input.policiesB ?? [];
  const selectedPolicyIdsA =
    input.selectedPolicyIdsA ??
    policiesA.filter((p) => p.defaultSelected).map((p) => p.id);
  const selectedPolicyIdsB =
    input.selectedPolicyIdsB ??
    policiesB.filter((p) => p.defaultSelected).map((p) => p.id);

  return {
    id: input.id,
    status: "active",
    turn: 0,
    turnLimit: input.turnLimit,
    sideA: combatantFromSheet(input.sideA),
    sideB: combatantFromSheet(input.sideB),
    stanceA: input.stanceA,
    stanceB: input.stanceB,
    policiesA,
    selectedPolicyIdsA,
    policiesB,
    selectedPolicyIdsB,
    battlefield: bf,
    situation: {
      scene: bf?.scene ?? input.scene ?? "黄昏の闘技場",
      notes:
        bf?.narrativeSetup ??
        bf?.terrain ??
        "観客の熱気が立ちこめている。",
      coefficients: baseCoeffs,
      tags,
    },
    log: [],
    winnerSide: null,
    finishReason: null,
    createdAt: t,
    updatedAt: t,
  };
}

function hpRatio(c: CombatantState): number {
  const max = c.parameters.maxHp ?? 100;
  const hp = c.parameters.hp ?? 0;
  return max > 0 ? hp / max : 0;
}

function usableSkills(skills: Skill[], self: CombatantState): Skill[] {
  return skills.filter(
    (s) =>
      (self.parameters.mp ?? 0) >= s.costMp &&
      (self.parameters.stamina ?? 0) >= s.costStamina,
  );
}

function pickOffensiveSkill(skills: Skill[], self: CombatantState): Skill | undefined {
  const usable = usableSkills(skills, self).filter(
    (s) => s.kind === "attack" || s.kind === "magic" || s.kind === "special",
  );
  if (usable.length === 0) return usableSkills(skills, self)[0];
  // Prefer higher power
  return [...usable].sort((a, b) => b.power - a.power)[0];
}

function pickSupportSkill(skills: Skill[], self: CombatantState): Skill | undefined {
  const usable = usableSkills(skills, self).filter(
    (s) => s.kind === "support" || s.kind === "defend",
  );
  return usable[0];
}

function actionFromBias(
  bias: PolicyBias,
  actorSide: "a" | "b",
  self: CombatantState,
  skills: Skill[],
  myHp: number,
): BattleAction {
  const offense = pickOffensiveSkill(skills, self);
  const support = pickSupportSkill(skills, self);

  const attack = (): BattleAction =>
    offense
      ? { actorSide, kind: "skill", skillId: offense.id }
      : { actorSide, kind: "wait" };

  const defend = (): BattleAction =>
    support && support.kind === "defend"
      ? { actorSide, kind: "skill", skillId: support.id }
      : { actorSide, kind: "defend" };

  const healOrDefend = (): BattleAction => {
    if (myHp < 0.5 && support && support.kind === "support") {
      return { actorSide, kind: "skill", skillId: support.id };
    }
    return defend();
  };

  switch (bias) {
    case "attack":
      return attack();
    case "defend":
      return defend();
    case "support":
      return support
        ? { actorSide, kind: "skill", skillId: support.id }
        : healOrDefend();
    case "wait":
      return { actorSide, kind: "wait" };
    case "mixed":
    default:
      if (myHp < 0.35) return healOrDefend();
      return attack();
  }
}

function ruleMatches(
  rule: BattlePolicyOption,
  ctx: { turn: number; myHp: number; foeHp: number },
): boolean {
  const t = rule.triggers ?? {};
  if (t.always) return true;
  if (t.earlyTurn && ctx.turn > 3) return false;
  if (t.earlyTurn && ctx.turn <= 3) {
    // earlyTurn alone can match; still check other constraints
  }
  if (t.lateTurn && ctx.turn < 4) return false;
  if (t.myHpBelow !== undefined && !(ctx.myHp < t.myHpBelow)) return false;
  if (t.myHpAbove !== undefined && !(ctx.myHp > t.myHpAbove)) return false;
  if (t.foeHpBelow !== undefined && !(ctx.foeHp < t.foeHpBelow)) return false;
  if (t.foeHpAbove !== undefined && !(ctx.foeHp > t.foeHpAbove)) return false;

  // If only earlyTurn without other numeric triggers, match early turns
  if (t.earlyTurn && ctx.turn <= 3) return true;
  if (t.lateTurn && ctx.turn >= 4) return true;
  if (
    t.myHpBelow !== undefined ||
    t.myHpAbove !== undefined ||
    t.foeHpBelow !== undefined ||
    t.foeHpAbove !== undefined
  ) {
    return true; // already passed constraints above
  }
  if (t.always) return true;
  // No concrete triggers → treat as soft always if selected
  return Object.keys(t).length === 0;
}

/**
 * Choose action from multi-selected case policies (LLM-generated).
 * Highest priority matching rule wins; fallback to mixed/balanced.
 */
export function chooseActionFromPolicies(input: {
  policies: BattlePolicyOption[];
  selectedIds: string[];
  actorSide: "a" | "b";
  self: CombatantState;
  foe: CombatantState;
  skills: Skill[];
  turn: number;
  /** Fallback when no policies selected. */
  legacyStance?: BattleStance;
}): BattleAction {
  const myHp = hpRatio(input.self);
  const foeHp = hpRatio(input.foe);
  const selected = new Set(input.selectedIds);
  const active = input.policies.filter((p) => selected.has(p.id));

  const matching = active
    .filter((p) => ruleMatches(p, { turn: input.turn, myHp, foeHp }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  if (matching.length > 0) {
    return actionFromBias(
      matching[0]!.bias ?? "mixed",
      input.actorSide,
      input.self,
      input.skills,
      myHp,
    );
  }

  // Soft fallback: any always rules, then legacy stance
  const always = active
    .filter((p) => p.triggers?.always || Object.keys(p.triggers ?? {}).length === 0)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (always.length > 0) {
    return actionFromBias(
      always[0]!.bias ?? "mixed",
      input.actorSide,
      input.self,
      input.skills,
      myHp,
    );
  }

  return chooseActionFromStance({
    stance: input.legacyStance ?? "balanced",
    actorSide: input.actorSide,
    self: input.self,
    foe: input.foe,
    skills: input.skills,
    turn: input.turn,
  });
}

/**
 * @deprecated Prefer chooseActionFromPolicies.
 */
export function chooseActionFromStance(input: {
  stance: BattleStance;
  actorSide: "a" | "b";
  self: CombatantState;
  foe: CombatantState;
  skills: Skill[];
  turn: number;
}): BattleAction {
  const { stance, actorSide, self, skills, turn } = input;
  const myHp = hpRatio(self);
  const foeHp = hpRatio(input.foe);

  switch (stance) {
    case "aggressive":
      return actionFromBias(
        myHp < 0.2 ? "defend" : "attack",
        actorSide,
        self,
        skills,
        myHp,
      );
    case "defensive":
      if (myHp < 0.55) return actionFromBias("defend", actorSide, self, skills, myHp);
      if (foeHp < 0.35 || turn % 3 === 0) {
        return actionFromBias("attack", actorSide, self, skills, myHp);
      }
      return actionFromBias("defend", actorSide, self, skills, myHp);
    case "opportunistic":
      if (turn <= 2) return actionFromBias(turn === 1 ? "wait" : "defend", actorSide, self, skills, myHp);
      if (foeHp < 0.5 || myHp > 0.7) {
        return actionFromBias("attack", actorSide, self, skills, myHp);
      }
      return actionFromBias("mixed", actorSide, self, skills, myHp);
    case "balanced":
    default:
      return actionFromBias("mixed", actorSide, self, skills, myHp);
  }
}

export function pickOpponentStance(): BattleStance {
  const options: BattleStance[] = [
    "aggressive",
    "balanced",
    "defensive",
    "opportunistic",
  ];
  return options[Math.floor(Math.random() * options.length)]!;
}

export function applySituationCoefficients(
  current: Situation,
  proposed: Partial<Situation> | undefined,
  battlefieldBase?: Record<string, number>,
): Situation {
  if (!proposed) return current;
  const merged = mergeCoefficients(
    { ...(battlefieldBase ?? {}), ...current.coefficients },
    proposed.coefficients,
  );
  return {
    scene: proposed.scene?.trim() ? proposed.scene : current.scene,
    notes: proposed.notes ?? current.notes,
    coefficients: merged,
    tags: proposed.tags ?? current.tags ?? [],
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
 * Resolve one turn. Actions are chosen from stances unless an explicit
 * playerAction override is supplied (tests / legacy).
 * Pure function — no LLM.
 */
export function resolveTurn(input: {
  state: BattleState;
  /** Optional override; when omitted, stanceA drives side A. */
  playerAction?: BattleAction;
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

  const bfBase = input.state.battlefield?.coefficients;
  const situation = applySituationCoefficients(
    input.state.situation,
    input.situationUpdate,
    bfBase,
  );
  const events: TurnEvent[] = [];
  const turn = input.state.turn + 1;

  // Battlefield flavor event occasionally when obstacles/conditions matter
  if (turn === 1 && input.state.battlefield) {
    const bf = input.state.battlefield;
    const bits = [
      bf.terrain,
      bf.obstacles.slice(0, 2).join("・"),
      bf.conditions.slice(0, 2).join("・"),
    ].filter(Boolean);
    if (bits.length) {
      events.push({
        type: "situation",
        summary: `戦場の気配 — ${bits.join(" / ")}`,
      });
    }
  }

  const playerAction =
    input.playerAction ??
    chooseActionFromPolicies({
      policies: input.state.policiesA ?? [],
      selectedIds: input.state.selectedPolicyIdsA ?? [],
      actorSide: "a",
      self: sideA,
      foe: sideB,
      skills: input.sideASkills,
      turn,
      legacyStance: input.state.stanceA ?? "balanced",
    });

  // Player (side A)
  applyAction(sideA, sideB, playerAction, input.sideASkills, situation, events);

  // Opponent (side B) from policies / stance if still up
  if (!isCombatantDown(sideB) && !isCombatantDown(sideA)) {
    const aiAction = chooseActionFromPolicies({
      policies: input.state.policiesB ?? [],
      selectedIds: input.state.selectedPolicyIdsB ?? [],
      actorSide: "b",
      self: sideB,
      foe: sideA,
      skills: input.sideBSkills,
      turn,
      legacyStance: input.state.stanceB ?? "balanced",
    });
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
