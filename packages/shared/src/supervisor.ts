import type { BattlefieldInstance } from "./battlefield.js";
import type { Situation, SupervisorState, TurnEvent } from "./battle.js";
import { clampCoefficient } from "./battle.js";
import { clampCoefficientMap } from "./battlefield.js";

export type HappeningIntensity = "minor" | "moderate";

export type HappeningEnvHit = {
  target: "a" | "b" | "both";
  kind: "damage" | "heal" | "disrupt";
  intensity: HappeningIntensity;
};

/**
 * A supervisor-injected environmental beat.
 * Mechanical enough to break stalemates; narrative stays high-level.
 */
export type HappeningPlan = {
  id: string;
  title: string;
  /** User-facing event line (no raw stats). */
  summary: string;
  /** Updates situation.notes. */
  notes: string;
  coefficients: Record<string, number>;
  tags?: string[];
  envHits?: HappeningEnvHit[];
};

export function defaultSupervisor(): SupervisorState {
  return {
    quietTurns: 0,
    turnsSinceHappening: 0,
    lastHpA: null,
    lastHpB: null,
    happenings: 0,
  };
}

export function normalizeSupervisor(
  raw: Partial<SupervisorState> | null | undefined,
): SupervisorState {
  const d = defaultSupervisor();
  if (!raw) return d;
  return {
    quietTurns: Math.max(0, Number(raw.quietTurns ?? d.quietTurns) || 0),
    turnsSinceHappening: Math.max(
      0,
      Number(raw.turnsSinceHappening ?? d.turnsSinceHappening) || 0,
    ),
    lastHpA:
      typeof raw.lastHpA === "number" && Number.isFinite(raw.lastHpA)
        ? raw.lastHpA
        : null,
    lastHpB:
      typeof raw.lastHpB === "number" && Number.isFinite(raw.lastHpB)
        ? raw.lastHpB
        : null,
    happenings: Math.max(0, Number(raw.happenings ?? d.happenings) || 0),
  };
}

/** True when the last resolved turn barely moved the fight. */
export function isQuietTurn(input: {
  events: TurnEvent[];
  hpBeforeA: number;
  hpBeforeB: number;
  hpAfterA: number;
  hpAfterB: number;
  maxHpA: number;
  maxHpB: number;
}): boolean {
  const totalMax = Math.max(1, input.maxHpA + input.maxHpB);
  const swung =
    Math.abs(input.hpBeforeA - input.hpAfterA) +
    Math.abs(input.hpBeforeB - input.hpAfterB);
  const swungRatio = swung / totalMax;

  const damageEvents = input.events.filter((e) => e.type === "damage");
  const heavyHit = damageEvents.some(
    (e) => e.intensity === "heavy" || e.intensity === "critical",
  );
  const waitDefendOnly =
    input.events.length > 0 &&
    input.events
      .filter((e) => e.type !== "situation" && e.type !== "info")
      .every((e) => e.type === "wait" || e.type === "defend" || e.type === "status");

  // Quiet if little HP movement and no heavy hits, or pure stall actions
  if (waitDefendOnly && swungRatio < 0.08) return true;
  if (swungRatio < 0.06 && !heavyHit) return true;
  if (damageEvents.length === 0 && swungRatio < 0.1) return true;
  return false;
}

/**
 * Decide whether to inject a happening before the upcoming turn.
 * Prefer stagnation; also soft-nudge after a long dry spell.
 */
export function shouldInjectHappening(
  sup: SupervisorState,
  upcomingTurn: number,
  turnLimit: number,
): boolean {
  // Not on the absolute first action turn (opening narration already exists)
  if (upcomingTurn <= 1) return false;
  // Cooldown: at least 2 turns between happenings
  if (sup.turnsSinceHappening < 2) return false;
  // Cap density
  const maxHappenings = Math.max(2, Math.floor(turnLimit / 4));
  if (sup.happenings >= maxHappenings) return false;

  // Clear stagnation
  if (sup.quietTurns >= 2 && sup.turnsSinceHappening >= 2) return true;
  // Mild stall
  if (sup.quietTurns >= 1 && sup.turnsSinceHappening >= 3) return true;
  // Long dry spell even if some chip damage (keeps midgame lively)
  if (sup.turnsSinceHappening >= 5 && upcomingTurn >= 4) return true;
  return false;
}

export function advanceSupervisorClock(
  sup: SupervisorState,
  quiet: boolean,
  injected: boolean,
  hpA: number,
  hpB: number,
): SupervisorState {
  if (injected) {
    return {
      quietTurns: 0,
      turnsSinceHappening: 0,
      lastHpA: hpA,
      lastHpB: hpB,
      happenings: sup.happenings + 1,
    };
  }
  return {
    quietTurns: quiet ? sup.quietTurns + 1 : 0,
    turnsSinceHappening: sup.turnsSinceHappening + 1,
    lastHpA: hpA,
    lastHpB: hpB,
    happenings: sup.happenings,
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

type Template = Omit<HappeningPlan, "id">;

const GENERIC: Template[] = [
  {
    title: "地響き",
    summary: "足元が鳴り、両者が一瞬バランスを崩す。",
    notes: "地盤が不安定で、攻防のリズムが乱れている。",
    coefficients: { damage: 1.1, spd: 0.9 },
    tags: ["地響き"],
    envHits: [{ target: "both", kind: "disrupt", intensity: "minor" }],
  },
  {
    title: "突風",
    summary: "突風が戦場を横切り、間合いが一気に詰まる。",
    notes: "強い風が刃と姿勢を揺らしている。",
    coefficients: { wind: 1.35, damage: 1.05 },
    tags: ["突風"],
  },
  {
    title: "影の揺らぎ",
    summary: "見えない気配が立ちこめ、双方の息が荒くなる。",
    notes: "不穏な気配が集中を削る。",
    coefficients: { focus: 0.85, damage: 1.05 },
    tags: ["気配"],
  },
];

const BY_CATEGORY: Record<string, Template[]> = {
  forest: [
    {
      title: "折れ枝",
      summary: "頭上の枝が折れ、木屑が舞い散る。",
      notes: "森の枝葉が視界と足場を邪魔している。",
      coefficients: { damage: 0.95, spd: 0.9 },
      tags: ["枝"],
      envHits: [{ target: "both", kind: "damage", intensity: "minor" }],
    },
    {
      title: "獣の遠吠え",
      summary: "森の奥で獣が吠え、緊張が一気に高まる。",
      notes: "外敵の気配に双方が神経をとがらせている。",
      coefficients: { damage: 1.15, focus: 0.9 },
      tags: ["獣"],
    },
    {
      title: "濃霧",
      summary: "霧が一気に濃くなり、姿がぼやける。",
      notes: "濃い霧が狙いを難しくしている。",
      coefficients: { damage: 0.9, mag: 1.1 },
      tags: ["霧"],
    },
  ],
  arena: [
    {
      title: "観客の熱狂",
      summary: "観客の怒号が場を揺らし、決着を急かす。",
      notes: "熱狂が攻勢を煽っている。",
      coefficients: { damage: 1.2, def: 0.95 },
      tags: ["観客"],
    },
    {
      title: "床のひび",
      summary: "闘技場の床が軋み、足元が危うい。",
      notes: "ひび割れた床が立ち回りを制限する。",
      coefficients: { spd: 0.85, damage: 1.05 },
      tags: ["床"],
      envHits: [{ target: "both", kind: "disrupt", intensity: "minor" }],
    },
  ],
  sea: [
    {
      title: "大波",
      summary: "大波が甲板を洗い、両者が踏ん張る。",
      notes: "波しぶきで足場が滑りやすい。",
      coefficients: { water: 1.3, fire: 0.7, spd: 0.85 },
      tags: ["波"],
      envHits: [{ target: "both", kind: "damage", intensity: "minor" }],
    },
    {
      title: "潮風",
      summary: "塩を含んだ風が刃を冷やし、息を整える隙を生む。",
      notes: "潮風が戦場の空気を一変させた。",
      coefficients: { water: 1.15, heal: 1.1 },
      tags: ["潮風"],
    },
  ],
  urban: [
    {
      title: "崩落",
      summary: "頭上の破片が落ち、街路がざわつく。",
      notes: "崩落の危険が攻防を急かす。",
      coefficients: { damage: 1.15, def: 0.9 },
      tags: ["崩落"],
      envHits: [
        { target: "a", kind: "damage", intensity: "minor" },
        { target: "b", kind: "damage", intensity: "minor" },
      ],
    },
    {
      title: "警報",
      summary: "遠くで警報が鳴り、焦燥が広がる。",
      notes: "時間がない空気が戦場を支配する。",
      coefficients: { damage: 1.1, focus: 0.9 },
      tags: ["警報"],
    },
  ],
  school: [
    {
      title: "チャイム",
      summary: "校内放送が流れ、妙な緊張が走る。",
      notes: "日常の音が戦場の空気を歪める。",
      coefficients: { focus: 0.9, damage: 1.05 },
      tags: ["チャイム"],
    },
    {
      title: "滑る床",
      summary: "濡れた廊下で足を取られそうになる。",
      notes: "滑りやすい床が動きを鈍らせる。",
      coefficients: { spd: 0.85, damage: 1.0 },
      tags: ["床"],
      envHits: [{ target: "both", kind: "disrupt", intensity: "minor" }],
    },
  ],
  mountain: [
    {
      title: "落石",
      summary: "崖上から小石が転がり落ちる。",
      notes: "落石の気配が間合いを狭める。",
      coefficients: { damage: 1.1, spd: 0.9 },
      tags: ["落石"],
      envHits: [{ target: "both", kind: "damage", intensity: "minor" }],
    },
    {
      title: "山風",
      summary: "稜線の風が刃を煽り、体勢が揺らぐ。",
      notes: "強い山風が攻防を乱す。",
      coefficients: { wind: 1.4, damage: 1.05 },
      tags: ["山風"],
    },
  ],
  ruins: [
    {
      title: "崩落音",
      summary: "廃墟の奥で崩落が響き、砂塵が舞う。",
      notes: "砂塵で視界が悪い。",
      coefficients: { damage: 0.95, focus: 0.85 },
      tags: ["砂塵"],
    },
    {
      title: "古代の気配",
      summary: "古い力の残滓が肌を刺すように高まる。",
      notes: "魔力じみた気配が技の精度を揺らす。",
      coefficients: { mag: 1.25, res: 0.9 },
      tags: ["古代"],
      envHits: [{ target: "both", kind: "disrupt", intensity: "minor" }],
    },
  ],
  custom: GENERIC,
};

/**
 * Deterministic-enough template pick from battlefield category / tags.
 */
export function pickTemplateHappening(input: {
  battlefield?: BattlefieldInstance | null;
  turn: number;
  rng?: () => number;
}): HappeningPlan {
  const rng = input.rng ?? Math.random;
  const cat = input.battlefield?.category ?? "custom";
  const pool = [
    ...(BY_CATEGORY[cat] ?? GENERIC),
    ...GENERIC,
  ];
  // Lightly prefer templates whose tags overlap field obstacles/conditions
  const fieldBits = new Set(
    [
      ...(input.battlefield?.obstacles ?? []),
      ...(input.battlefield?.conditions ?? []),
      input.battlefield?.terrain ?? "",
    ]
      .join(" ")
      .split(/[\s・、,]/)
      .filter(Boolean),
  );
  const scored = pool.map((t) => {
    const hit = (t.tags ?? []).some((tag) =>
      [...fieldBits].some((b) => b.includes(tag) || tag.includes(b)),
    );
    return { t, score: hit ? 2 : 1 };
  });
  const total = scored.reduce((s, x) => s + x.score, 0);
  let r = rng() * total;
  let chosen = scored[0]!.t;
  for (const row of scored) {
    r -= row.score;
    if (r <= 0) {
      chosen = row.t;
      break;
    }
  }
  // Occasionally moderate escalation on later turns
  const escalated: Template = { ...chosen };
  if (input.turn >= 6 && rng() < 0.35 && escalated.envHits) {
    escalated.envHits = escalated.envHits.map((h) => ({
      ...h,
      intensity: "moderate" as const,
    }));
    escalated.coefficients = clampCoefficientMap({
      ...escalated.coefficients,
      damage: (escalated.coefficients.damage ?? 1) * 1.1,
    });
  }

  return {
    id: `hap_t${input.turn}_${Math.floor(rng() * 1e6)}`,
    ...escalated,
    coefficients: clampCoefficientMap(escalated.coefficients),
  };
}

/** Merge happening into a situation proposal patch. */
export function happeningToSituationPatch(
  h: HappeningPlan,
): Partial<Situation> {
  return {
    notes: h.notes,
    coefficients: Object.fromEntries(
      Object.entries(h.coefficients).map(([k, v]) => [k, clampCoefficient(v)]),
    ),
    tags: h.tags,
  };
}

export function happeningToEvents(h: HappeningPlan): TurnEvent[] {
  return [
    {
      type: "situation",
      summary: `【ハプニング】${h.title} — ${h.summary}`,
    },
  ];
}

/** Map intensity to abstract engine damage (hidden numbers). */
export function envHitAmount(intensity: HappeningIntensity): number {
  return intensity === "moderate" ? 14 : 7;
}

export function envHitSummary(
  displayName: string,
  kind: HappeningEnvHit["kind"],
  intensity: HappeningIntensity,
): string {
  if (kind === "heal") {
    return intensity === "moderate"
      ? `${displayName} は環境の幸いで息を吹き返した。`
      : `${displayName} はわずかに体勢を立て直した。`;
  }
  if (kind === "disrupt") {
    return intensity === "moderate"
      ? `${displayName} は大きく体勢を崩した。`
      : `${displayName} の動きが一瞬乱れた。`;
  }
  return intensity === "moderate"
    ? `${displayName} は環境の衝撃をまともに受けた。`
    : `${displayName} は環境の余波を浴びた。`;
}

// silence unused pick if tree-shaken oddly
void pick;
