import type {
  BasicAttackProfile,
  CharacterSheet,
  Equipment,
  ParameterDelta,
  Parameters,
  Skill,
} from "./character.js";
import { defaultBasicAttack, defaultParameters } from "./character.js";

/** Soft ranges so no sheet can hard-stomp every matchup. */
const PARAM_SOFT: Record<string, { min: number; max: number; soft: number }> = {
  hp: { min: 70, max: 140, soft: 110 },
  maxHp: { min: 70, max: 140, soft: 110 },
  mp: { min: 20, max: 70, soft: 45 },
  maxMp: { min: 20, max: 70, soft: 45 },
  stamina: { min: 30, max: 70, soft: 50 },
  maxStamina: { min: 30, max: 70, soft: 50 },
  atk: { min: 6, max: 20, soft: 14 },
  def: { min: 6, max: 20, soft: 13 },
  spd: { min: 6, max: 20, soft: 13 },
  mag: { min: 6, max: 20, soft: 13 },
  res: { min: 6, max: 20, soft: 13 },
  focus: { min: 6, max: 18, soft: 12 },
  luck: { min: 4, max: 18, soft: 12 },
};

const WEAKNESS_TRAITS = [
  "隙が多い",
  "打たれ弱い",
  "集中が切れやすい",
  "運に頼りがち",
  "消耗が早い",
  "近接に脆い",
  "遠距離に弱い",
  "精神攻撃に弱い",
  "足場に左右される",
  "過信しやすい",
];

function softClamp(value: number, min: number, max: number, soft: number): number {
  if (!Number.isFinite(value)) return soft;
  let v = value;
  if (v > max) v = max;
  if (v < min) v = min;
  // Pull extremes gently toward soft center so no absolute god-stats
  if (v > soft) v = soft + (v - soft) * 0.55;
  if (v < soft) v = soft - (soft - v) * 0.55;
  return Math.round(v);
}

export function balanceParameters(raw: Partial<Parameters> | undefined): Parameters {
  const base = defaultParameters(raw ?? {});
  const out: Parameters = { ...base };
  for (const [key, lim] of Object.entries(PARAM_SOFT)) {
    const v = Number((out as Record<string, number>)[key] ?? lim.soft);
    (out as Record<string, number>)[key] = softClamp(v, lim.min, lim.max, lim.soft);
  }
  // Keep current hp within max
  out.hp = Math.min(out.hp ?? out.maxHp ?? 100, out.maxHp ?? 100);
  out.mp = Math.min(out.mp ?? out.maxMp ?? 40, out.maxMp ?? 40);
  out.stamina = Math.min(out.stamina ?? out.maxStamina ?? 50, out.maxStamina ?? 50);
  // No free lunch: if offense is high, defense or focus must not also peak
  const offense = Math.max(out.atk ?? 0, out.mag ?? 0);
  if (offense >= 16) {
    out.def = Math.min(out.def ?? 10, 14);
    out.res = Math.min(out.res ?? 10, 14);
  }
  if ((out.def ?? 0) >= 16 && (out.res ?? 0) >= 16) {
    out.spd = Math.min(out.spd ?? 10, 12);
    out.atk = Math.min(out.atk ?? 12, 14);
  }
  return out;
}

export function balanceSkill(skill: Skill): Skill {
  let power = Number(skill.power);
  if (!Number.isFinite(power)) power = 1;
  // Absolute nuke prevention
  power = Math.min(1.85, Math.max(0.55, power));
  const effects = (skill.effects ?? []).map(balanceParameterDelta);
  const effectWeight = effects.reduce((sum, effect) => sum + Math.abs(effect.delta), 0);
  const effectCost = effectWeight > 0 && skill.costMp === 0 && skill.costStamina === 0;
  if (power > 1.45) {
    // Strong skills cost more
    return {
      ...skill,
      power,
      costMp: Math.max(skill.costMp, power > 1.6 ? 12 : 6),
      costStamina: Math.max(
        skill.costStamina,
        power > 1.6 ? 10 : effectCost ? 6 : 5,
      ),
      effects,
      description: `${skill.description || skill.name}（高出力のため使用時に隙が生じる）`,
    };
  }
  return {
    ...skill,
    power,
    costStamina: effectCost ? Math.max(skill.costStamina, 6) : skill.costStamina,
    effects,
  };
}

export function balanceParameterDelta<T extends ParameterDelta>(effect: T): T {
  const wide = ["hp", "maxHp", "mp", "maxMp", "stamina", "maxStamina"].includes(
    effect.parameter,
  );
  const limit = wide ? 25 : 10;
  return {
    ...effect,
    delta: Math.max(-limit, Math.min(limit, Math.round(Number(effect.delta) || 0))),
  };
}

export function balanceBasicAttack(
  raw: BasicAttackProfile | null | undefined,
): BasicAttackProfile {
  const attack = raw ?? defaultBasicAttack();
  const targetsMaximum = ["maxHp", "maxMp", "maxStamina"].includes(
    attack.targetParameter,
  );
  return {
    ...attack,
    power: Math.min(targetsMaximum ? 0.7 : 1, Math.max(0.55, Number(attack.power) || 0.75)),
  };
}

export function balanceEquipment(eq: Equipment | null | undefined): Equipment | null {
  if (!eq) return null;
  const clampB = (n: number) => Math.min(6, Math.max(-2, Math.round(Number(n) || 0)));
  let atk = clampB(eq.atkBonus);
  let def = clampB(eq.defBonus);
  let mag = clampB(eq.magBonus);
  // No all-bonus weapon
  if (atk >= 5 && def >= 4) def = 2;
  if (atk >= 5 && mag >= 4) mag = 2;
  let effects = (eq.effects ?? []).map(balanceParameterDelta);
  const positive = Math.max(0, atk) + Math.max(0, def) + Math.max(0, mag) +
    effects.reduce((sum, effect) => sum + Math.max(0, effect.delta), 0);
  const hasTradeoff =
    atk < 0 || def < 0 || mag < 0 || effects.some((effect) => effect.delta < 0);
  const addedTradeoff = positive > 0 && !hasTradeoff;
  if (addedTradeoff) {
    effects = [
      ...effects.slice(0, 3),
      { parameter: "stamina", delta: -Math.min(12, Math.max(2, Math.ceil(positive / 3))) },
    ];
  }
  let desc = eq.description;
  if (atk >= 5 || mag >= 5) {
    desc = `${desc || eq.name}（高出力のため扱いに明確な隙が生じる）`;
  }
  if (addedTradeoff) {
    desc = `${desc || eq.name}（付与効果の代償として持久力を消耗する）`;
  }
  return {
    ...eq,
    atkBonus: atk,
    defBonus: def,
    magBonus: mag,
    effects,
    description: desc,
  };
}

function hasMechanicalPeak(input: {
  parameters: Parameters;
  skills: Skill[];
  weapon: Equipment | null;
  armor: Equipment | null;
}): boolean {
  const combatPeak = Math.max(
    input.parameters.atk ?? 0,
    input.parameters.def ?? 0,
    input.parameters.spd ?? 0,
    input.parameters.mag ?? 0,
    input.parameters.res ?? 0,
    input.parameters.focus ?? 0,
    input.parameters.luck ?? 0,
  ) >= 16;
  const skillPeak = input.skills.some((skill) => skill.power >= 1.45);
  const equipmentPeak = [input.weapon, input.armor].some(
    (equipment) =>
      equipment != null &&
      Math.max(equipment.atkBonus, equipment.defBonus, equipment.magBonus) >= 5,
  );
  return combatPeak || skillPeak || equipmentPeak;
}

/**
 * Post-process a generated / adjusted sheet so absolute strengths
 * always carry implicit costs and soft caps.
 */
export function balanceCharacterCombatFields<
  T extends {
    parameters?: Parameters;
    skills?: Skill[];
    weapon?: Equipment | null;
    armor?: Equipment | null;
    basicAttack?: BasicAttackProfile;
    traits?: string[];
    narrativeBlurb?: string;
  },
>(sheet: T): T {
  const parameters = balanceParameters(sheet.parameters);
  const skills = (sheet.skills ?? []).map(balanceSkill);
  const weapon = balanceEquipment(sheet.weapon ?? null);
  const armor = balanceEquipment(sheet.armor ?? null);
  const basicAttack = balanceBasicAttack(sheet.basicAttack);
  let traits = [...(sheet.traits ?? [])];
  const addMechanicalWeakness = hasMechanicalPeak({
    parameters,
    skills,
    weapon,
    armor,
  });
  if (addMechanicalWeakness) {
    const pick =
      WEAKNESS_TRAITS[Math.floor(Math.random() * WEAKNESS_TRAITS.length)]!;
    if (!traits.includes(pick)) traits = [...traits.slice(0, 6), pick];
  }
  let narrativeBlurb = sheet.narrativeBlurb ?? "";
  if (narrativeBlurb && addMechanicalWeakness) {
    narrativeBlurb = `${narrativeBlurb.replace(/。?$/, "。")}ただしその強さには必ず隙があり、戦場の流れ次第では一気に崩れる。`;
  }
  return {
    ...sheet,
    parameters,
    skills,
    weapon,
    armor,
    basicAttack,
    traits,
    narrativeBlurb,
  };
}

/**
 * Soften raw damage so stat/skill edges don't end fights in one or two hits.
 * Caps per-hit damage relative to target max HP.
 */
export function softenCombatDamage(input: {
  rawDamage: number;
  targetMaxHp: number;
  skillPower: number;
}): number {
  let dmg = Math.max(1, Math.round(input.rawDamage));
  // Diminishing on high skill power
  if (input.skillPower > 1.3) {
    const over = input.skillPower - 1.3;
    dmg = Math.round(dmg * (1 - Math.min(0.25, over * 0.35)));
  }
  const maxHit = Math.max(8, Math.round(input.targetMaxHp * 0.26));
  dmg = Math.min(dmg, maxHit);
  return Math.max(1, dmg);
}
