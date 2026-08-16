import type { CharacterActionIntent } from "./battle.js";

export const DEFAULT_SCENE_BEAT_K = 3;
export const SCENE_BEAT_HP_DELTA_RATIO = 0.15;

export type SceneBeatClock = "micro-turn" | "public-turn";

export type SceneBeatState = {
  schemaVersion: 1;
  k: number;
  receiptIds: string[];
  reservedA: CharacterActionIntent[];
  reservedB: CharacterActionIntent[];
  /** Absent or micro-turn: ADR-0016 increment. public-turn: ADR-0017. */
  clock?: SceneBeatClock;
};

export function openSceneBeat(
  k = DEFAULT_SCENE_BEAT_K,
  clock: SceneBeatClock | undefined = "public-turn",
): SceneBeatState {
  return {
    schemaVersion: 1,
    k,
    receiptIds: [],
    reservedA: [],
    reservedB: [],
    ...(clock ? { clock } : {}),
  };
}

export function usesPublicTurnClock(state: {
  sceneBeat?: SceneBeatState;
}): boolean {
  return state.sceneBeat?.clock === "public-turn";
}

/** Next public combat turn. Continuing intra-turn beats keep the same number. */
export function nextPublicCombatTurn(state: {
  turn: number;
  sceneBeat?: SceneBeatState;
}): number {
  if (!usesPublicTurnClock(state)) return state.turn + 1;
  if ((state.sceneBeat?.receiptIds.length ?? 0) > 0) return state.turn;
  return state.turn + 1;
}

export function nextCombatTick(state: { combatTick?: number }): number {
  return (state.combatTick ?? 0) + 1;
}

export function publicTurnBeatIndex(state: {
  sceneBeat?: SceneBeatState;
}): number {
  return (state.sceneBeat?.receiptIds.length ?? 0) + 1;
}

export function sceneBeatK(state: { sceneBeat?: SceneBeatState }): number {
  return state.sceneBeat?.k ?? 1;
}

export function sceneBeatsEnabled(state: { sceneBeat?: SceneBeatState }): boolean {
  return sceneBeatK(state) > 1;
}

export function shouldCloseSceneBeat(input: {
  beat: SceneBeatState;
  nextReceiptCount: number;
  terminal: boolean;
  reservationInfeasible?: boolean;
  sceneDelta?: boolean;
}): boolean {
  if (input.terminal || input.reservationInfeasible || input.sceneDelta) {
    return true;
  }
  return input.nextReceiptCount >= input.beat.k;
}

export function hpSwingClosesSceneBeat(input: {
  hpBeforeA: number;
  hpBeforeB: number;
  hpAfterA: number;
  hpAfterB: number;
  maxHpA: number;
  maxHpB: number;
}): boolean {
  const ratioA = input.maxHpA > 0
    ? Math.abs(input.hpBeforeA - input.hpAfterA) / input.maxHpA
    : 0;
  const ratioB = input.maxHpB > 0
    ? Math.abs(input.hpBeforeB - input.hpAfterB) / input.maxHpB
    : 0;
  return ratioA >= SCENE_BEAT_HP_DELTA_RATIO || ratioB >= SCENE_BEAT_HP_DELTA_RATIO;
}

export function nextReservedAction(
  reserved: readonly CharacterActionIntent[],
): {
  next: CharacterActionIntent | undefined;
  remaining: CharacterActionIntent[];
} {
  const [next, ...remaining] = reserved;
  return { next, remaining };
}

export function recordSceneBeatReceipt(
  beat: SceneBeatState,
  receiptId: string,
): SceneBeatState {
  return {
    ...beat,
    receiptIds: [...beat.receiptIds, receiptId].slice(-beat.k),
  };
}
