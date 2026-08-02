/**
 * Balance observability — pure helpers only.
 * No game rules change; used to record and aggregate fight health metrics.
 */

import type { Parameters, Skill } from "./character.js";

/** In-battle running metrics (engine-internal, not shown in UI). */
export type BattleBalanceTrace = {
  /** Combat turns advanced (excludes pure prologue/aftermath if not counted). */
  combatTurns: number;
  /** Damage dealt by side A (HP lost on B). */
  totalDamageA: number;
  /** Damage dealt by side B (HP lost on A). */
  totalDamageB: number;
  maxTurnDamageA: number;
  maxTurnDamageB: number;
  /** maxTurnDamageA / opponent maxHp at that time (peak). */
  maxTurnDamageRatioA: number;
  maxTurnDamageRatioB: number;
  /** Turns where either side took damage. */
  hitTurns: number;
  /** True if any single turn removed ≥90% of a side's maxHp. */
  oneShotSuspect: boolean;
  /** First combat turn index where a side reached 0 HP (null if none yet). */
  firstKoCombatTurn: number | null;
};

export function emptyBattleBalanceTrace(): BattleBalanceTrace {
  return {
    combatTurns: 0,
    totalDamageA: 0,
    totalDamageB: 0,
    maxTurnDamageA: 0,
    maxTurnDamageB: 0,
    maxTurnDamageRatioA: 0,
    maxTurnDamageRatioB: 0,
    hitTurns: 0,
    oneShotSuspect: false,
    firstKoCombatTurn: null,
  };
}

export function accumulateBattleBalanceTrace(
  prev: BattleBalanceTrace | null | undefined,
  input: {
    hpBeforeA: number;
    hpBeforeB: number;
    hpAfterA: number;
    hpAfterB: number;
    maxHpA: number;
    maxHpB: number;
  },
): BattleBalanceTrace {
  const t = prev ? { ...prev } : emptyBattleBalanceTrace();
  t.combatTurns += 1;

  const dmgToB = Math.max(0, input.hpBeforeB - input.hpAfterB);
  const dmgToA = Math.max(0, input.hpBeforeA - input.hpAfterA);

  t.totalDamageA += dmgToB;
  t.totalDamageB += dmgToA;

  if (dmgToB > 0 || dmgToA > 0) t.hitTurns += 1;

  if (dmgToB > t.maxTurnDamageA) t.maxTurnDamageA = dmgToB;
  if (dmgToA > t.maxTurnDamageB) t.maxTurnDamageB = dmgToA;

  const maxHpB = Math.max(1, input.maxHpB);
  const maxHpA = Math.max(1, input.maxHpA);
  const ratioA = dmgToB / maxHpB;
  const ratioB = dmgToA / maxHpA;
  if (ratioA > t.maxTurnDamageRatioA) t.maxTurnDamageRatioA = ratioA;
  if (ratioB > t.maxTurnDamageRatioB) t.maxTurnDamageRatioB = ratioB;

  if (ratioA >= 0.9 || ratioB >= 0.9) t.oneShotSuspect = true;

  const koA = input.hpBeforeA > 0 && input.hpAfterA <= 0;
  const koB = input.hpBeforeB > 0 && input.hpAfterB <= 0;
  if ((koA || koB) && t.firstKoCombatTurn == null) {
    t.firstKoCombatTurn = t.combatTurns;
  }

  return t;
}

/** Finished-match flags derived from the running trace. */
export function battleBalanceFlags(trace: BattleBalanceTrace | null | undefined): {
  earlyKo: boolean;
  oneShotSuspect: boolean;
  shortMatch: boolean;
  maxHitRatio: number;
} {
  const t = trace ?? emptyBattleBalanceTrace();
  const maxHitRatio = Math.max(t.maxTurnDamageRatioA, t.maxTurnDamageRatioB);
  return {
    earlyKo: t.firstKoCombatTurn != null && t.firstKoCombatTurn <= 2,
    oneShotSuspect: t.oneShotSuspect,
    shortMatch: t.combatTurns > 0 && t.combatTurns <= 2,
    maxHitRatio,
  };
}

/** Snapshot of a sheet's combat "shape" for generation-time observation. */
export type SheetCombatProfile = {
  maxHp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  focus: number;
  luck: number;
  /** max(atk, mag) */
  offense: number;
  /** max(def, res) */
  defense: number;
  /** Highest skill.power after typical clamps (raw stored value). */
  maxSkillPower: number;
  avgSkillPower: number;
  skillCount: number;
  /**
   * 0–100-ish: how peaked the build is.
   * High = glass cannon / tank-only extremes. For observation only.
   */
  sharpness: number;
};

export function sheetCombatProfile(input: {
  parameters?: Partial<Parameters> | null;
  skills?: Skill[] | null;
}): SheetCombatProfile {
  const p = input.parameters ?? {};
  const skills = input.skills ?? [];
  const n = (k: keyof Parameters, d: number) => {
    const v = Number(p[k]);
    return Number.isFinite(v) ? v : d;
  };
  const maxHp = n("maxHp", 100);
  const atk = n("atk", 10);
  const def = n("def", 10);
  const mag = n("mag", 10);
  const res = n("res", 10);
  const spd = n("spd", 10);
  const focus = n("focus", 10);
  const luck = n("luck", 10);
  const offense = Math.max(atk, mag);
  const defense = Math.max(def, res);
  const powers = skills.map((s) => Number(s.power)).filter((x) => Number.isFinite(x));
  const maxSkillPower = powers.length ? Math.max(...powers) : 1;
  const avgSkillPower = powers.length
    ? powers.reduce((a, b) => a + b, 0) / powers.length
    : 1;

  // Sharpness: spread of combat stats + inflated skill power signal
  const combat = [atk, def, mag, res, spd];
  const mean = combat.reduce((a, b) => a + b, 0) / combat.length;
  const variance =
    combat.reduce((a, b) => a + (b - mean) ** 2, 0) / combat.length;
  const spread = Math.sqrt(variance);
  const powerInflation = maxSkillPower > 2 ? Math.min(40, (maxSkillPower - 1) * 8) : 0;
  const dualPeak =
    offense >= 16 && defense >= 16 ? 18 : offense >= 16 || defense >= 16 ? 8 : 0;
  const sharpness = Math.round(
    Math.min(100, spread * 4 + powerInflation + dualPeak + (maxHp >= 130 ? 8 : 0)),
  );

  return {
    maxHp,
    atk,
    def,
    mag,
    res,
    spd,
    focus,
    luck,
    offense,
    defense,
    maxSkillPower,
    avgSkillPower: Math.round(avgSkillPower * 100) / 100,
    skillCount: skills.length,
    sharpness,
  };
}
