import {
  createBattleState,
  prepareSequentialBattleTurnInitiative,
  resolveTurn,
} from "./battle-engine.js";
import type { BattleState } from "./battle.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import type { BattlePacingPolicy } from "./battle-pacing.js";

export type BattlePacingMeasurement = {
  policyId: string;
  sampleSize: number;
  completionTurn: {
    mean: number;
    median: number;
    variance: number;
    minimum: number;
    p90: number;
    maximum: number;
  };
  outcomes: {
    koRate: number;
    earlyKoRate: number;
    limitHitRate: number;
    forcedTerminalRate: number;
  };
  meanCommittedHpChangePerTurn: number;
  repeatedActionRate: number;
  repeatedSpeech: { status: "not_measured"; reason: string };
  firstInitiative: { a: number; b: number };
  delayedEffectResolutionRate: number;
};

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function fixtureSheet(id: string, hp: number, atk: number, def: number, spd: number): CharacterSheet {
  const timestamp = "2026-08-12T00:00:00.000Z";
  return {
    id,
    ownerUserId: "local-pacing-observer",
    displayName: id.toUpperCase(),
    tags: ["local-pacing-fixture"],
    createdAt: timestamp,
    updatedAt: timestamp,
    appearance: { summary: "measurement fixture", visualPrompt: "measurement fixture" },
    traits: [],
    parameters: defaultParameters({ hp, maxHp: hp, atk, def, spd }),
    skills: [{
      id: "finisher",
      name: "測定用必殺技",
      description: "固定seedのpacing測定専用。",
      costMp: 0,
      costStamina: 0,
      power: 1.25,
      kind: "special",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "local deterministic measurement fixture",
  };
}

function percentileMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
}

export function measureBattlePacing(input: {
  policy: BattlePacingPolicy;
  sampleSize?: number;
  seed?: number;
}): BattlePacingMeasurement {
  const sampleSize = input.sampleSize ?? 240;
  const baseSeed = input.seed ?? 0x98_12_20;
  const completionTurns: number[] = [];
  let ko = 0;
  let earlyKo = 0;
  let limitHit = 0;
  let committedHpChange = 0;
  let resolvedTurns = 0;
  let repeatedActions = 0;
  let comparableActions = 0;
  let initiativeA = 0;
  let initiativeB = 0;
  let delayedScheduled = 0;
  let delayedResolved = 0;

  for (let index = 0; index < sampleSize; index += 1) {
    // Each fixture owns its random stream so different completion lengths do
    // not shift the inputs of later fixtures in a policy comparison.
    const random = seeded(baseSeed ^ Math.imul(index + 1, 0x9e3779b1));
    const a = fixtureSheet(
      `a-${index}`,
      90 + Math.floor(random() * 41),
      22 + Math.floor(random() * 15),
      14 + Math.floor(random() * 13),
      18 + Math.floor(random() * 13),
    );
    const b = fixtureSheet(
      `b-${index}`,
      90 + Math.floor(random() * 41),
      22 + Math.floor(random() * 15),
      14 + Math.floor(random() * 13),
      18 + Math.floor(random() * 13),
    );
    let state: BattleState = createBattleState({
      id: `pacing-${input.policy.policyId}-${index}`,
      sideA: a,
      sideB: b,
      turnLimit: input.policy.turnLimit,
      prologuePending: false,
    });
    state = {
      ...state,
      pacingPolicy: input.policy,
      pendingEffects: index % 3 === 0 ? [{
        schemaVersion: 1,
        effectId: `delayed-${index}`,
        createdTurn: 0,
        source: { kind: "system_rules", ruleId: "local-pacing-fixture" },
        targetSide: index % 2 === 0 ? "a" : "b",
        payload: { kind: "parameter_delta", parameterKey: "hp", delta: -5 },
        trigger: { kind: "due_turn", dueTurn: 2 },
        expiresTurn: 3,
        cancelIfSourceIncapacitated: false,
        sourceSide: null,
        visibility: "public_on_resolution",
      }] : [],
    };
    if (state.pendingEffects?.length) delayedScheduled += 1;
    let priorA: string | null = null;
    let priorB: string | null = null;

    while (state.turn < input.policy.turnLimit && !state.aftermathPending) {
      const nextTurn = state.turn + 1;
      const actionA = nextTurn === input.policy.finisherUnlockTurn
        ? { kind: "skill" as const, skillId: "finisher", useFinisher: true }
        : random() < 0.12 ? { kind: "defend" as const } : { kind: "basic_attack" as const };
      const actionB = nextTurn === input.policy.finisherUnlockTurn
        ? { kind: "skill" as const, skillId: "finisher", useFinisher: true }
        : random() < 0.12 ? { kind: "defend" as const } : { kind: "basic_attack" as const };
      const signatureA = actionA.kind;
      const signatureB = actionB.kind;
      if (priorA !== null) {
        comparableActions += 2;
        if (priorA === signatureA) repeatedActions += 1;
        if (priorB === signatureB) repeatedActions += 1;
      }
      priorA = signatureA;
      priorB = signatureB;
      state.plannedActionA = actionA;
      state.plannedActionB = actionB;
      const hpBefore = (state.sideA.parameters.hp ?? 0) + (state.sideB.parameters.hp ?? 0);
      const initiative = prepareSequentialBattleTurnInitiative({
        state,
        sideASkills: a.skills,
        sideBSkills: b.skills,
        tieDrawSample: random(),
      });
      const resolved = resolveTurn({
        state,
        sideASkills: a.skills,
        sideBSkills: b.skills,
        temporalResolutionOverride: initiative?.temporalResolution,
      });
      const hpAfter = (resolved.state.sideA.parameters.hp ?? 0) +
        (resolved.state.sideB.parameters.hp ?? 0);
      committedHpChange += Math.abs(hpAfter - hpBefore);
      resolvedTurns += 1;
      if (nextTurn === 1) {
        const first = resolved.state.latestTemporalResolution?.buckets[0]?.actorSides[0];
        if (first === "a") initiativeA += 1;
        if (first === "b") initiativeB += 1;
      }
      if (resolved.events.some((event) => event.sourceEffectId?.startsWith("delayed-"))) {
        delayedResolved += 1;
      }
      state = resolved.state;
    }
    completionTurns.push(state.turn);
    if (state.finishReason === "incapacitated") {
      ko += 1;
      if (state.turn <= 2) earlyKo += 1;
    }
    if (state.finishReason === "turn_limit") limitHit += 1;
  }

  const mean = completionTurns.reduce((sum, value) => sum + value, 0) / sampleSize;
  const variance = completionTurns.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / sampleSize;
  return {
    policyId: input.policy.policyId,
    sampleSize,
    completionTurn: {
      mean,
      median: percentileMedian(completionTurns),
      variance,
      minimum: Math.min(...completionTurns),
      p90: percentile(completionTurns, 0.9),
      maximum: Math.max(...completionTurns),
    },
    outcomes: {
      koRate: ko / sampleSize,
      earlyKoRate: earlyKo / sampleSize,
      limitHitRate: limitHit / sampleSize,
      forcedTerminalRate: limitHit / sampleSize,
    },
    meanCommittedHpChangePerTurn: committedHpChange / Math.max(1, resolvedTurns),
    repeatedActionRate: repeatedActions / Math.max(1, comparableActions),
    repeatedSpeech: {
      status: "not_measured",
      reason: "The deterministic local harness does not call speech or narration models.",
    },
    firstInitiative: { a: initiativeA / sampleSize, b: initiativeB / sampleSize },
    delayedEffectResolutionRate: delayedResolved / Math.max(1, delayedScheduled),
  };
}
