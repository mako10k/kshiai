import type { Situation, SupervisorState, TurnEvent } from "./battle.js";
import { clampCoefficient } from "./battle.js";

export type HappeningIntensity = "minor" | "moderate";

export type HappeningEnvHit = {
  target: "both";
  kind: "damage" | "heal" | "disrupt";
  intensity: HappeningIntensity;
};

/** A generated, battlefield-grounded change that can break a stalemate. */
export type HappeningPlan = {
  id: string;
  title: string;
  summary: string;
  notes: string;
  coefficients: Record<string, number>;
  tags?: string[];
  envHits?: HappeningEnvHit[];
};

export function defaultSupervisor(): SupervisorState {
  return {
    quietTurns: 0,
    passiveTurns: 0,
    turnsSinceHappening: 0,
    lastHpA: null,
    lastHpB: null,
    happenings: 0,
    recentHappenings: [],
  };
}

export function normalizeSupervisor(
  raw: Partial<SupervisorState> | null | undefined,
): SupervisorState {
  const defaults = defaultSupervisor();
  if (!raw) return defaults;
  return {
    quietTurns: Math.max(0, Number(raw.quietTurns ?? 0) || 0),
    passiveTurns: Math.max(0, Number(raw.passiveTurns ?? 0) || 0),
    turnsSinceHappening: Math.max(
      0,
      Number(raw.turnsSinceHappening ?? 0) || 0,
    ),
    lastHpA:
      typeof raw.lastHpA === "number" && Number.isFinite(raw.lastHpA)
        ? raw.lastHpA
        : null,
    lastHpB:
      typeof raw.lastHpB === "number" && Number.isFinite(raw.lastHpB)
        ? raw.lastHpB
        : null,
    happenings: Math.max(0, Number(raw.happenings ?? 0) || 0),
    recentHappenings: Array.isArray(raw.recentHappenings)
      ? raw.recentHappenings
          .filter((item) => item && item.title && item.summary)
          .map((item) => ({
            title: String(item.title).slice(0, 40),
            summary: String(item.summary).slice(0, 160),
          }))
          .slice(-5)
      : defaults.recentHappenings,
  };
}

/** True when the last resolved turn barely changed either side's condition. */
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
  const damageEvents = input.events.filter((event) => event.type === "damage");
  const heavyHit = damageEvents.some(
    (event) =>
      event.intensity === "heavy" || event.intensity === "critical",
  );
  const waitDefendOnly =
    input.events.length > 0 &&
    input.events
      .filter((event) => event.type !== "situation" && event.type !== "info")
      .every(
        (event) =>
          event.type === "wait" ||
          event.type === "defend" ||
          event.type === "status",
      );

  if (waitDefendOnly && swungRatio < 0.08) return true;
  if (swungRatio < 0.06 && !heavyHit) return true;
  if (damageEvents.length === 0 && swungRatio < 0.1) return true;
  return false;
}

/** True when neither participant produced a condition-changing event. */
export function isPassiveTurn(events: TurnEvent[]): boolean {
  return !events.some(
    (event) =>
      Boolean(event.actorName) &&
      (event.type === "damage" ||
        event.type === "heal" ||
        event.type === "parameter"),
  );
}

/** Inject only after two resolved quiet turns, never merely because time passed. */
export function shouldInjectHappening(
  supervisor: SupervisorState,
  upcomingTurn: number,
  turnLimit: number,
): boolean {
  if (upcomingTurn <= 2) return false;
  if (supervisor.quietTurns < 2) return false;
  if (supervisor.turnsSinceHappening < 2) return false;
  const maxHappenings = Math.max(1, Math.floor(turnLimit / 4));
  return supervisor.happenings < maxHappenings;
}

export function advanceSupervisorClock(
  supervisor: SupervisorState,
  quiet: boolean,
  passive: boolean,
  happening: Pick<HappeningPlan, "title" | "summary"> | null,
  hpA: number,
  hpB: number,
): SupervisorState {
  if (happening) {
    return {
      quietTurns: 0,
      passiveTurns: passive ? supervisor.passiveTurns + 1 : 0,
      turnsSinceHappening: 0,
      lastHpA: hpA,
      lastHpB: hpB,
      happenings: supervisor.happenings + 1,
      recentHappenings: [
        ...supervisor.recentHappenings,
        { title: happening.title, summary: happening.summary },
      ].slice(-5),
    };
  }
  return {
    quietTurns: quiet ? supervisor.quietTurns + 1 : 0,
    passiveTurns: passive ? supervisor.passiveTurns + 1 : 0,
    turnsSinceHappening: supervisor.turnsSinceHappening + 1,
    lastHpA: hpA,
    lastHpB: hpB,
    happenings: supervisor.happenings,
    recentHappenings: supervisor.recentHappenings,
  };
}

export function happeningToSituationPatch(
  happening: HappeningPlan,
): Partial<Situation> {
  return {
    notes: happening.notes,
    coefficients: Object.fromEntries(
      Object.entries(happening.coefficients).map(([key, value]) => [
        key,
        clampCoefficient(value),
      ]),
    ),
    tags: happening.tags,
  };
}

export function happeningToEvents(happening: HappeningPlan): TurnEvent[] {
  return [{
    type: "situation",
    summary: `${happening.title} — ${happening.summary}`,
  }];
}

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
      ? `${displayName} は環境の後押しで大きく持ち直した。`
      : `${displayName} はわずかに調子を整えた。`;
  }
  if (kind === "disrupt") {
    return intensity === "moderate"
      ? `${displayName} は環境の変化に大きく調子を乱された。`
      : `${displayName} の動きが一瞬乱れた。`;
  }
  return intensity === "moderate"
    ? `${displayName} は環境の変化に大きく揺さぶられた。`
    : `${displayName} は環境の余波を受けた。`;
}
