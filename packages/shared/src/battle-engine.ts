import type {
  BattleAction,
  BattlePolicyOption,
  BattleStance,
  BattleState,
  BattleTurnRecord,
  CharacterAgentState,
  CharacterAgentStateChange,
  CombatantState,
  PolicyBias,
  Situation,
  TurnEvent,
} from "./battle.js";
import { clampCoefficient, isCombatantDown } from "./battle.js";
import type {
  BasicAttackProfile,
  CharacterSheet,
  Equipment,
  ParameterDelta,
  ParamKey,
  Parameters,
  Skill,
} from "./character.js";
import { defaultBasicAttack } from "./character.js";
import type { BattlefieldInstance } from "./battlefield.js";
import { clampCoefficientMap, mergeCoefficients } from "./battlefield.js";
import type { NarrationStyleSnapshot } from "./narration-style.js";
import { defaultNarrationSnapshot } from "./narration-style.js";
import {
  balanceBasicAttack,
  balanceEquipment,
  softenCombatDamage,
} from "./balance.js";

function nowIso(): string {
  return new Date().toISOString();
}

function cloneCombatant(c: CombatantState): CombatantState {
  return {
    ...c,
    parameters: { ...c.parameters },
    baseParameters: c.baseParameters ? { ...c.baseParameters } : undefined,
  };
}

function perceivedCondition(combatant: CombatantState) {
  if (!combatant.canFight || (combatant.parameters.hp ?? 0) <= 0) {
    return "incapacitated" as const;
  }
  const maxHp = Math.max(1, combatant.parameters.maxHp ?? 100);
  const ratio = (combatant.parameters.hp ?? 0) / maxHp;
  if (ratio <= 0.25) return "critical" as const;
  if (ratio <= 0.6) return "strained" as const;
  return "steady" as const;
}

function parameterChanges(before: CombatantState, after: CombatantState) {
  const changes: Partial<Record<ParamKey, number>> = {};
  for (const key of Object.keys(after.parameters) as ParamKey[]) {
    const delta = (after.parameters[key] ?? 0) - (before.parameters[key] ?? 0);
    if (delta !== 0) changes[key] = delta;
  }
  return changes;
}

/** Build the persisted, perspective-aware facts after deterministic resolution. */
export function buildBattleTurnRecord(input: {
  before: BattleState;
  after: BattleState;
  events: TurnEvent[];
}): BattleTurnRecord {
  const changeA = parameterChanges(input.before.sideA, input.after.sideA);
  const changeB = parameterChanges(input.before.sideB, input.after.sideB);
  const base = {
    turn: input.after.turn,
    scene: input.after.situation.scene,
    observedEvents: input.events,
  };
  return {
    turn: input.after.turn,
    events: input.events,
    sideAChange: {
      parameterChanges: changeA,
      defendingBefore: input.before.sideA.defending,
      defendingAfter: input.after.sideA.defending,
      canFightBefore: input.before.sideA.canFight,
      canFightAfter: input.after.sideA.canFight,
    },
    sideBChange: {
      parameterChanges: changeB,
      defendingBefore: input.before.sideB.defending,
      defendingAfter: input.after.sideB.defending,
      canFightBefore: input.before.sideB.canFight,
      canFightAfter: input.after.sideB.canFight,
    },
    cognitionA: {
      ...base,
      ownCondition: perceivedCondition(input.after.sideA),
      foeCondition: perceivedCondition(input.after.sideB),
      parameterChanges: changeA,
    },
    cognitionB: {
      ...base,
      ownCondition: perceivedCondition(input.after.sideB),
      foeCondition: perceivedCondition(input.after.sideA),
      parameterChanges: changeB,
    },
    agentStateChangeA: null,
    agentStateChangeB: null,
  };
}

/** Detect structured private-state changes without interpreting free-form prose. */
export function buildCharacterAgentStateChange(
  before: CharacterAgentState,
  after: CharacterAgentState,
): CharacterAgentStateChange {
  const beforeBeliefs = new Set(before.beliefs);
  const afterBeliefs = new Set(after.beliefs);
  const beforeObservations = new Set(before.observations);
  return {
    goalBefore: before.currentGoal,
    goalAfter: after.currentGoal,
    emotionBefore: before.emotion,
    emotionAfter: after.emotion,
    beliefsAdded: after.beliefs.filter((item) => !beforeBeliefs.has(item)),
    beliefsRemoved: before.beliefs.filter((item) => !afterBeliefs.has(item)),
    observationsAdded: after.observations.filter(
      (item) => !beforeObservations.has(item),
    ),
    speechStyleBefore: before.speechStyle,
    speechStyleAfter: after.speechStyle,
    selfReferenceBefore: before.selfReference,
    selfReferenceAfter: after.selfReference,
    lastSpeech: after.lastSpeech,
  };
}

export function combatantFromSheet(sheet: CharacterSheet): CombatantState {
  const combatant: CombatantState = {
    characterId: sheet.id,
    displayName: sheet.displayName,
    imageUrl: sheet.appearance?.imageUrl ?? null,
    parameters: { ...sheet.parameters },
    baseParameters: { ...sheet.parameters },
    defending: false,
    canFight: sheet.combatFlags.canFight,
    irreversibleIncapacitated: sheet.combatFlags.irreversibleIncapacitated,
  };
  applyEquipmentStart(combatant, sheet.weapon);
  applyEquipmentStart(combatant, sheet.armor);
  clampCurrentToMaximums(combatant.parameters);
  return combatant;
}

function applyEquipmentStart(
  combatant: CombatantState,
  equipment: Equipment | null | undefined,
): void {
  const safeEquipment = balanceEquipment(equipment);
  if (!safeEquipment) return;
  const deltas: ParameterDelta[] = [
    { parameter: "atk", delta: safeEquipment.atkBonus },
    { parameter: "def", delta: safeEquipment.defBonus },
    { parameter: "mag", delta: safeEquipment.magBonus },
    ...(safeEquipment.effects ?? []),
  ];
  for (const delta of deltas) applyParameterDelta(combatant, delta);
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
  narrationStyle?: NarrationStyleSnapshot;
  priorMatchSummary?: string | null;
  /** Defaults true for real matches; tests pass false to run combat immediately. */
  prologuePending?: boolean;
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
      scene: bf?.scene ?? input.scene ?? "対決の舞台",
      notes:
        bf?.narrativeSetup ??
        bf?.terrain ??
        "互いの存在が場の空気を少しずつ変えている。",
      coefficients: baseCoeffs,
      tags,
    },
    supervisor: {
      quietTurns: 0,
      passiveTurns: 0,
      turnsSinceHappening: 0,
      lastHpA: null,
      lastHpB: null,
      happenings: 0,
      recentHappenings: [],
    },
    prologuePending: input.prologuePending ?? true,
    aftermathPending: false,
    narrationStyle: input.narrationStyle ?? defaultNarrationSnapshot(),
    priorMatchSummary: input.priorMatchSummary ?? null,
    agentStateA: {
      privateMemory: "",
      currentGoal: "",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "",
      selfReference: input.sideA.identity?.selfNames[0] ?? null,
      lastSpeech: null,
    },
    agentStateB: {
      privateMemory: "",
      currentGoal: "",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "",
      selfReference: input.sideB.identity?.selfNames[0] ?? null,
      lastSpeech: null,
    },
    turnRecords: [],
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

const PARAMETER_LABELS: Record<ParamKey, string> = {
  hp: "生命力",
  maxHp: "生命力の上限",
  mp: "魔力",
  maxMp: "魔力の上限",
  stamina: "持久力",
  maxStamina: "持久力の上限",
  atk: "攻撃力",
  def: "防御力",
  spd: "速度",
  mag: "魔力適性",
  res: "抵抗力",
  focus: "集中力",
  luck: "運勢",
};

const PARAMETER_KEYS = Object.keys(PARAMETER_LABELS) as ParamKey[];
function clampCurrentToMaximums(parameters: Parameters): void {
  parameters.maxHp = Math.max(1, parameters.maxHp ?? 1);
  parameters.maxMp = Math.max(1, parameters.maxMp ?? 1);
  parameters.maxStamina = Math.max(1, parameters.maxStamina ?? 1);
  parameters.hp = Math.max(0, Math.min(parameters.hp ?? 0, parameters.maxHp));
  parameters.mp = Math.max(0, Math.min(parameters.mp ?? 0, parameters.maxMp));
  parameters.stamina = Math.max(
    0,
    Math.min(parameters.stamina ?? 0, parameters.maxStamina),
  );
}

function applyParameterDelta(
  combatant: CombatantState,
  effect: ParameterDelta,
): number {
  const current = combatant.parameters[effect.parameter] ?? 0;
  const isMaximum = ["maxHp", "maxMp", "maxStamina"].includes(effect.parameter);
  const isConsumable = ["hp", "mp", "stamina"].includes(effect.parameter);
  const floor = isMaximum || !isConsumable ? 1 : 0;
  const next = Math.max(floor, current + effect.delta);
  combatant.parameters[effect.parameter] = next;
  clampCurrentToMaximums(combatant.parameters);
  return (combatant.parameters[effect.parameter] ?? current) - current;
}

function restoreTowardBase(combatant: CombatantState): ParamKey[] {
  const base = combatant.baseParameters;
  if (!base || (combatant.parameters.hp ?? 0) <= 0) return [];
  const changed: ParamKey[] = [];
  const ordered: ParamKey[] = [
    "maxHp",
    "maxMp",
    "maxStamina",
    ...PARAMETER_KEYS.filter(
      (key) =>
        key !== "hp" &&
        key !== "maxHp" &&
        key !== "maxMp" &&
        key !== "maxStamina",
    ),
  ];
  for (const key of ordered) {
    const current = combatant.parameters[key] ?? 0;
    const target = base[key] ?? current;
    const gap = target - current;
    if (gap === 0) continue;
    const step = Math.max(1, Math.ceil(Math.abs(gap) * 0.2));
    combatant.parameters[key] =
      gap > 0 ? Math.min(target, current + step) : Math.max(target, current - step);
    changed.push(key);
  }
  clampCurrentToMaximums(combatant.parameters);
  return changed;
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
    (s) =>
      s.kind === "attack" ||
      s.kind === "magic" ||
      s.kind === "special" ||
      (s.kind === "status" &&
        (s.effects ?? []).some(
          (effect) => effect.target === "foe" && effect.delta < 0,
        )),
  );
  if (usable.length === 0) return undefined;
  // Prefer higher power
  return [...usable].sort((a, b) => b.power - a.power)[0];
}

function pickSupportSkill(skills: Skill[], self: CombatantState): Skill | undefined {
  const usable = usableSkills(skills, self).filter(
    (s) =>
      s.kind === "support" ||
      s.kind === "defend" ||
      (s.kind === "status" &&
        (s.effects ?? []).some(
          (effect) => effect.target === "self" && effect.delta > 0,
        )),
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
      : (self.parameters.stamina ?? 0) >= 3
        ? { actorSide, kind: "basic_attack" }
        : { actorSide, kind: "rest" };

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

/** Abstract HP-hit prose: finishing blows are explicitly marked for narration. */
function hitSummary(input: {
  actorName: string;
  skillName: string;
  targetName: string;
  intensity?: TurnEvent["intensity"];
  finishing: boolean;
}): string {
  const { actorName, skillName, targetName, intensity, finishing } = input;
  if (finishing) {
    return `${actorName} の ${skillName} が ${targetName} をとどめとして捉えた——それが決め手となった。`;
  }
  switch (intensity) {
    case "critical":
      return `${actorName} の ${skillName} が ${targetName} を大きく揺るがした。`;
    case "heavy":
      return `${actorName} の ${skillName} が ${targetName} を強く捉えた。`;
    case "minor":
      return `${actorName} の ${skillName} が ${targetName} に軽く触れた。`;
    default:
      return `${actorName} の ${skillName} が ${targetName} を捉えた。`;
  }
}

function applyHpDamage(
  target: CombatantState,
  amount: number,
): { actual: number; finishing: boolean } {
  const before = target.parameters.hp ?? 0;
  const after = Math.max(0, before - Math.max(0, amount));
  target.parameters.hp = after;
  return {
    actual: before - after,
    finishing: before > 0 && after <= 0,
  };
}

/**
 * Resolve one turn. Actions are chosen from stances unless an explicit
 * playerAction override is supplied (tests / legacy).
 * Pure function — no LLM.
 *
 * Optional supervisor injections:
 * - preEvents: environmental happenings before combat
 * - envHits: light mechanical pressure from the field
 */
export function resolveTurn(input: {
  state: BattleState;
  /** Optional override; when omitted, stanceA drives side A. */
  playerAction?: BattleAction;
  sideASkills: Skill[];
  sideBSkills: Skill[];
  sideABasicAttack?: BasicAttackProfile;
  sideBBasicAttack?: BasicAttackProfile;
  situationUpdate?: Partial<Situation>;
  /** Supervisor / environment events applied before combat actions. */
  preEvents?: TurnEvent[];
  envHits?: Array<{
    target: "a" | "b" | "both";
    kind: "damage" | "heal" | "disrupt";
    intensity: "minor" | "moderate";
  }>;
}): { state: BattleState; events: TurnEvent[] } {
  if (input.state.status !== "active") {
    return { state: input.state, events: [] };
  }
  // Prologue / aftermath are resolved outside the combat engine (LLM beats).
  if (input.state.prologuePending || input.state.aftermathPending) {
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

  if (turn > 1) {
    for (const combatant of [sideA, sideB]) {
      const restored = restoreTowardBase(combatant);
      if (restored.length > 0) {
        events.push({
          type: "status",
          actorName: combatant.displayName,
          summary: `${combatant.displayName} の変化した状態が、本来の調子へ少し戻った。`,
        });
      }
    }
  }

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

  if (input.preEvents?.length) {
    events.push(...input.preEvents);
  }

  if (input.envHits?.length) {
    applyEnvHits(sideA, sideB, input.envHits, events);
  }

  const forceOffense = (input.state.supervisor?.passiveTurns ?? 0) >= 2;
  if (forceOffense) {
    events.push({
      type: "status",
      summary: "膠着打破 — 両者は間合いを捨て、強制的に打ち合いへ踏み込む。",
    });
  }

  const playerAction =
    input.playerAction ??
    (forceOffense
      ? { actorSide: "a", kind: "basic_attack" }
      : chooseActionFromPolicies({
          policies: input.state.policiesA ?? [],
          selectedIds: input.state.selectedPolicyIdsA ?? [],
          actorSide: "a",
          self: sideA,
          foe: sideB,
          skills: input.sideASkills,
          turn,
          legacyStance: input.state.stanceA ?? "balanced",
        }));

  // Player (side A)
  applyAction(
    sideA,
    sideB,
    playerAction,
    input.sideASkills,
    balanceBasicAttack(input.sideABasicAttack ?? defaultBasicAttack()),
    situation,
    events,
  );

  // Opponent (side B) from policies / stance if still up
  if (!isCombatantDown(sideB) && !isCombatantDown(sideA)) {
    const aiAction: BattleAction = forceOffense
      ? { actorSide: "b", kind: "basic_attack" }
      : chooseActionFromPolicies({
          policies: input.state.policiesB ?? [],
          selectedIds: input.state.selectedPolicyIdsB ?? [],
          actorSide: "b",
          self: sideB,
          foe: sideA,
          skills: input.sideBSkills,
          turn,
          legacyStance: input.state.stanceB ?? "balanced",
        });
    applyAction(
      sideB,
      sideA,
      aiAction,
      input.sideBSkills,
      balanceBasicAttack(input.sideBBasicAttack ?? defaultBasicAttack()),
      situation,
      events,
    );
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
  let aftermathPending = false;

  const aDown = isCombatantDown(sideA);
  const bDown = isCombatantDown(sideB);

  if (aDown && bDown) {
    // Stay active for one epilogue beat before official finish.
    winnerSide = "draw";
    finishReason = "incapacitated";
    aftermathPending = true;
    events.push({
      type: "info",
      summary:
        "決着の余波 — 両者とも続行できなくなり、場に静けさが落ちる。その先を見届けよう。",
    });
  } else if (aDown) {
    winnerSide = "b";
    finishReason = "incapacitated";
    aftermathPending = true;
    events.push({
      type: "info",
      summary: `${sideA.displayName} は対決を続けられなくなった。${sideB.displayName} とこの場が、その後をどう迎えるか——`,
    });
  } else if (bDown) {
    winnerSide = "a";
    finishReason = "incapacitated";
    aftermathPending = true;
    events.push({
      type: "info",
      summary: `${sideB.displayName} は対決を続けられなくなった。${sideA.displayName} とこの場が、その後をどう迎えるか——`,
    });
  } else if (turn >= input.state.turnLimit) {
    status = "finished";
    finishReason = "turn_limit";
    // Hidden score for turn-limit tie-break (engine-side); referee LLM may override later.
    const scoreA = combatScore(sideA);
    const scoreB = combatScore(sideB);
    if (scoreA === scoreB) winnerSide = "draw";
    else winnerSide = scoreA > scoreB ? "a" : "b";
    events.push({
      type: "info",
      summary:
        winnerSide === "draw"
          ? "規定ターン終了 — 審判は互角と見て、最終判定に入る。"
          : `規定ターン終了 — 審判は ${winnerSide === "a" ? sideA.displayName : sideB.displayName} 優勢として最終判定に入る。`,
    });
  } else if (turn === input.state.turnLimit - 1) {
    events.push({
      type: "info",
      summary: "判定予告 — 次が最終ターン。働きかけの有効性、残力、場への影響が勝敗を分ける。",
    });
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
    aftermathPending,
    updatedAt: nowIso(),
  };

  return { state, events };
}

function combatScore(c: CombatantState): number {
  const p = c.parameters;
  return (p.hp ?? 0) * 2 + (p.mp ?? 0) + (p.stamina ?? 0) + (p.atk ?? 0) + (p.def ?? 0);
}

function envAmount(intensity: "minor" | "moderate"): number {
  return intensity === "moderate" ? 14 : 7;
}

function applyEnvHits(
  sideA: CombatantState,
  sideB: CombatantState,
  hits: Array<{
    target: "a" | "b" | "both";
    kind: "damage" | "heal" | "disrupt";
    intensity: "minor" | "moderate";
  }>,
  events: TurnEvent[],
): void {
  for (const hit of hits) {
    const targets: CombatantState[] =
      hit.target === "both"
        ? [sideA, sideB]
        : hit.target === "a"
          ? [sideA]
          : [sideB];
    for (const t of targets) {
      const amount = envAmount(hit.intensity);
      if (hit.kind === "heal") {
        const max = t.parameters.maxHp ?? 100;
        t.parameters.hp = Math.min(max, (t.parameters.hp ?? 0) + amount);
        events.push({
          type: "heal",
          actorName: t.displayName,
          targetName: t.displayName,
          intensity: hit.intensity,
          summary:
            hit.intensity === "moderate"
              ? `${t.displayName} は環境の幸いで息を吹き返した。`
              : `${t.displayName} はわずかに体勢を立て直した。`,
        });
      } else if (hit.kind === "disrupt") {
        // Soft pressure: small HP chip + stigma in narration
        const chip = applyHpDamage(t, Math.floor(amount * 0.5));
        events.push({
          type: "status",
          actorName: t.displayName,
          intensity: hit.intensity,
          summary: chip.finishing
            ? `${t.displayName} は場の圧力にとどめを刺され、決戦を続けられなくなった。`
            : hit.intensity === "moderate"
              ? `${t.displayName} は大きく体勢を崩した。`
              : `${t.displayName} の動きが一瞬乱れた。`,
        });
      } else {
        const env = applyHpDamage(t, amount);
        events.push({
          type: "damage",
          targetName: t.displayName,
          intensity: hit.intensity,
          summary: env.finishing
            ? `${t.displayName} は環境の変化にとどめを刺された——それが決め手となった。`
            : hit.intensity === "moderate"
              ? `${t.displayName} は環境の変化に大きく揺さぶられた。`
              : `${t.displayName} は環境の余波を浴びた。`,
        });
      }
    }
  }
}

function applyAction(
  actor: CombatantState,
  target: CombatantState,
  action: BattleAction,
  skills: Skill[],
  basicAttack: BasicAttackProfile,
  situation: Situation,
  events: TurnEvent[],
): void {
  if (action.kind === "basic_attack") {
    const stamina = actor.parameters.stamina ?? 0;
    actor.parameters.stamina = Math.max(0, stamina - Math.min(3, stamina));
    applyBasicAttack(actor, target, basicAttack, situation, events);
    return;
  }

  if (action.kind === "rest") {
    const maxMp = actor.parameters.maxMp ?? 0;
    const maxStamina = actor.parameters.maxStamina ?? 0;
    actor.parameters.mp = Math.min(
      maxMp,
      (actor.parameters.mp ?? 0) + Math.max(4, Math.round(maxMp * 0.12)),
    );
    actor.parameters.stamina = Math.min(
      maxStamina,
      (actor.parameters.stamina ?? 0) +
        Math.max(6, Math.round(maxStamina * 0.18)),
    );
    events.push({
      type: "rest",
      actorName: actor.displayName,
      summary: `${actor.displayName} は一度間合いを切り、呼吸と力を取り戻した。`,
    });
    return;
  }

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
      summary: `${actor.displayName} は自分の態勢を整えた。`,
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

  if (
    skill.kind === "defend" ||
    skill.kind === "support" ||
    skill.kind === "status"
  ) {
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
        summary: `${actor.displayName} の ${skill.name} が状態を持ち直した。`,
      });
    } else if (skill.kind === "defend") {
      events.push({
        type: "defend",
        actorName: actor.displayName,
        skillName: skill.name,
        summary: `${actor.displayName} は ${skill.name} で身を守った。`,
      });
    }
    applySkillEffects(actor, target, skill, events);
    return;
  }

  applyAttackSkill(actor, target, skill, situation, events);
  applySkillEffects(actor, target, skill, events);
}

function applyBasicAttack(
  actor: CombatantState,
  target: CombatantState,
  profile: BasicAttackProfile,
  situation: Situation,
  events: TurnEvent[],
): void {
  const attackStat = actor.parameters[profile.scalingParameter] ?? 10;
  const resistanceStat = target.parameters[profile.resistanceParameter] ?? 10;
  const rawGap = attackStat - resistanceStat * 0.55;
  const softGap = Math.sign(rawGap) * Math.pow(Math.abs(rawGap), 0.82);
  const power = Math.min(1, Math.max(0.55, profile.power));
  let amount = Math.round(
    Math.max(2, 6 + softGap) *
      power *
      coeff(situation, "damage") *
      coeff(situation, profile.element ?? "neutral", 1),
  );
  const parameter = profile.targetParameter;
  if (parameter === "hp") {
    amount = softenCombatDamage({
      rawDamage: amount,
      targetMaxHp: target.parameters.maxHp ?? 100,
      skillPower: power,
    });
  } else {
    const reference = Math.abs(
      target.baseParameters?.[parameter] ?? target.parameters[parameter] ?? 10,
    );
    amount = Math.min(amount, Math.max(2, Math.round(reference * 0.2)));
  }
  const actual = applyParameterDelta(target, { parameter, delta: -amount });
  const intensity = intensityFromDamage(Math.abs(actual));
  const finishing =
    parameter === "hp" &&
    actual < 0 &&
    (target.parameters.hp ?? 0) <= 0;
  events.push({
    type: parameter === "hp" ? "damage" : "parameter",
    actorName: actor.displayName,
    targetName: target.displayName,
    skillName: profile.name,
    intensity,
    summary:
      parameter === "hp"
        ? hitSummary({
            actorName: actor.displayName,
            skillName: profile.name,
            targetName: target.displayName,
            intensity,
            finishing,
          })
        : `${actor.displayName} の ${profile.name} が ${target.displayName} の ${PARAMETER_LABELS[parameter]} を削った。`,
  });
}

function applySkillEffects(
  actor: CombatantState,
  foe: CombatantState,
  skill: Skill,
  events: TurnEvent[],
): void {
  for (const effect of skill.effects ?? []) {
    const recipient = effect.target === "self" ? actor : foe;
    const actual = applyParameterDelta(recipient, effect);
    if (actual === 0) continue;
    const positive = actual > 0;
    const finishing =
      effect.parameter === "hp" &&
      !positive &&
      (recipient.parameters.hp ?? 0) <= 0;
    const label = PARAMETER_LABELS[effect.parameter];
    events.push({
      type:
        effect.parameter === "hp"
          ? positive
            ? "heal"
            : "damage"
          : "parameter",
      actorName: actor.displayName,
      targetName: recipient.displayName,
      skillName: skill.name,
      intensity: intensityFromDamage(Math.abs(actual)),
      summary: finishing
        ? `${actor.displayName} の ${skill.name} が ${recipient.displayName} の ${label}をとどめとして低下させた——それが決め手となった。`
        : `${actor.displayName} の ${skill.name} が ${recipient.displayName} の ${label}を${positive ? "高めた" : "低下させた"}。`,
    });
  }
}

function applyAttackSkill(
  actor: CombatantState,
  target: CombatantState,
  skill: Skill,
  situation: Situation,
  events: TurnEvent[],
): void {
  const atkStat =
    skill.kind === "magic" ? (actor.parameters.mag ?? 10) : (actor.parameters.atk ?? 10);
  const defStat =
    skill.kind === "magic" ? (target.parameters.res ?? 10) : (target.parameters.def ?? 10);
  // Soft gap: absolute stat edges don't delete the underdog
  const rawGap = atkStat - defStat * 0.55;
  const softGap =
    Math.sign(rawGap) *
    Math.pow(Math.abs(rawGap), 0.82) *
    (rawGap >= 0 ? 1 : 1);
  const power = Math.min(1.85, Math.max(0.55, skill.power));
  let dmg = Math.round(
    Math.max(2, 6 + softGap) *
      power *
      coeff(situation, "damage") *
      coeff(situation, skill.element ?? "neutral", 1),
  );
  if (target.defending) dmg = Math.round(dmg * 0.55);
  dmg = softenCombatDamage({
    rawDamage: dmg,
    targetMaxHp: target.parameters.maxHp ?? 100,
    skillPower: power,
  });

  const { actual, finishing } = applyHpDamage(target, dmg);
  const intensity = intensityFromDamage(actual);
  events.push({
    type: "damage",
    actorName: actor.displayName,
    targetName: target.displayName,
    skillName: skill.name,
    intensity,
    summary: hitSummary({
      actorName: actor.displayName,
      skillName: skill.name,
      targetName: target.displayName,
      intensity,
      finishing,
    }),
  });
}
