import type { CharacterSheet, Equipment, Parameters, Skill } from "./character.js";
import { defaultParameters } from "./character.js";

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
  if (power > 1.45) {
    // Strong skills cost more
    return {
      ...skill,
      power,
      costMp: Math.max(skill.costMp, power > 1.6 ? 12 : 6),
      costStamina: Math.max(skill.costStamina, power > 1.6 ? 10 : 5),
      description: skill.description?.includes("隙")
        ? skill.description
        : `${skill.description || skill.name}（強力なぶん隙を晒しやすい）`,
    };
  }
  return { ...skill, power };
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
  const desc =
    atk >= 5 || mag >= 5
      ? eq.description?.includes("隙") || eq.description?.includes("脆")
        ? eq.description
        : `${eq.description || eq.name}（強力だが扱いに癖があり、隙を突かれやすい）`
      : eq.description;
  return { ...eq, atkBonus: atk, defBonus: def, magBonus: mag, description: desc };
}

function needsWeaknessTrait(traits: string[]): boolean {
  const powerWords =
    /無敵|絶対|最強|無双|不滅|完全|万能|圧倒|必殺|即死|不敗|無敗|神|チート/;
  const hasPower = traits.some((t) => powerWords.test(t));
  const hasWeak = traits.some((t) =>
    /弱|脆|隙|不運|鈍|遅い|脆|消耗|過信|頼り/.test(t),
  );
  return hasPower || (!hasWeak && traits.length >= 2);
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
    traits?: string[];
    narrativeBlurb?: string;
  },
>(sheet: T): T {
  const parameters = balanceParameters(sheet.parameters);
  const skills = (sheet.skills ?? []).map(balanceSkill);
  const weapon = balanceEquipment(sheet.weapon ?? null);
  const armor = balanceEquipment(sheet.armor ?? null);
  let traits = [...(sheet.traits ?? [])];
  if (needsWeaknessTrait(traits)) {
    const pick =
      WEAKNESS_TRAITS[Math.floor(Math.random() * WEAKNESS_TRAITS.length)]!;
    if (!traits.includes(pick)) traits = [...traits.slice(0, 6), pick];
  }
  let narrativeBlurb = sheet.narrativeBlurb ?? "";
  if (
    narrativeBlurb &&
    !/隙|弱点|脆|代償|裏腹|しかし|ただし|一方で/.test(narrativeBlurb)
  ) {
    narrativeBlurb = `${narrativeBlurb.replace(/。?$/, "。")}ただしその強さには必ず隙があり、戦場の流れ次第では一気に崩れる。`;
  }
  return {
    ...sheet,
    parameters,
    skills,
    weapon,
    armor,
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
