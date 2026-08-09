import type {
  BattleAction,
  BattlePolicyOption,
  BattleStance,
  BattleState,
  BattleTurnRecord,
  CharacterAgentState,
  CharacterAgentStateChange,
  CharacterActionIntent,
  CombatantState,
  FinisherState,
  PolicyBias,
  ResolvedBattleAction,
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
  buildSemanticObservationState,
  createBattleSemanticState,
} from "./semantic-state.js";
import {
  createBattleWorldState,
  type BattleWorldState,
  type WorldCausalBand,
} from "./battle-world.js";
import { normalizeDramaState, parseActionSignature } from "./drama.js";
import {
  isSkillOnCooldown,
  markSkillUsed,
  skillCooldownTurns,
} from "./skill-cooldown.js";
import {
  balanceBasicAttack,
  balanceEquipment,
  softenCombatDamage,
} from "./balance.js";
import {
  CommittedMechanicalEvidenceSetSchema,
  type CommittedMechanicalEvidence,
} from "./perception.js";
import { buildServerOnlyReserveCues } from "./perception-quantization.js";
import {
  buildInitialObserverPerception,
  buildMinimalObserverPerception,
} from "./perception-projection.js";
import { revalidateCharacterAction } from "./action-feasibility.js";
import { applyBattleCausalCoefficients } from "./battle-causality.js";
import {
  buildBattleTemporalPlan,
  type BattleTemporalSide,
} from "./battle-temporal-rules.js";
import {
  buildBattleEncounterContext,
  buildLegacyBattleEncounterContext,
  type BattleEncounterContext,
  updateBattleNarratorContinuity,
} from "./battle-social.js";

function nowIso(): string {
  return new Date().toISOString();
}

function cloneCombatant(c: CombatantState): CombatantState {
  return {
    ...c,
    parameters: { ...c.parameters },
    baseParameters: c.baseParameters ? { ...c.baseParameters } : undefined,
    skillLastUsedTurn: c.skillLastUsedTurn
      ? { ...c.skillLastUsedTurn }
      : undefined,
  };
}

function mergeSkillLastUsedTurn(
  base: CombatantState,
  proposals: readonly CombatantState[],
): void {
  let merged = base.skillLastUsedTurn
    ? { ...base.skillLastUsedTurn }
    : undefined;
  for (const proposal of proposals) {
    if (!proposal.skillLastUsedTurn) continue;
    merged = { ...(merged ?? {}), ...proposal.skillLastUsedTurn };
  }
  if (merged) base.skillLastUsedTurn = merged;
}

export function perceivedCondition(combatant: CombatantState) {
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

type MechanicalResolutionSpan = {
  sourceActionId: string | null;
  actorSide: "a" | "b" | null;
  beforeA: Parameters;
  beforeB: Parameters;
  afterA: Parameters;
  afterB: Parameters;
  attempts: MechanicalAttempt[];
  eventStart: number;
  eventEnd: number;
};

type MechanicalAttempt = {
  targetSide: "a" | "b";
  parameterKey: ParamKey;
  attemptedDelta: number;
  beforeValue: number;
  afterValue: number;
  delta: number;
  relativeReferenceBeforeValue: number;
  relativeReferenceAfterValue: number;
};

type MechanicalAttemptRecorder = (
  target: CombatantState,
  parameterKey: ParamKey,
  attemptedDelta: number,
  before: Parameters,
  after: Parameters,
) => void;

function parametersSnapshot(combatant: CombatantState): Parameters {
  return { ...combatant.parameters };
}

function mechanicalResolutionSpan(input: {
  sourceActionId?: string | null;
  actorSide?: "a" | "b" | null;
  beforeA: Parameters;
  beforeB: Parameters;
  sideA: CombatantState;
  sideB: CombatantState;
  attempts?: MechanicalAttempt[];
  eventStart: number;
  eventEnd: number;
}): MechanicalResolutionSpan {
  return {
    sourceActionId: input.sourceActionId ?? null,
    actorSide: input.actorSide ?? null,
    beforeA: input.beforeA,
    beforeB: input.beforeB,
    afterA: parametersSnapshot(input.sideA),
    afterB: parametersSnapshot(input.sideB),
    attempts: input.attempts ?? [],
    eventStart: input.eventStart,
    eventEnd: input.eventEnd,
  };
}

function relativeReferenceValue(
  parameters: Parameters,
  parameterKey: ParamKey,
): number {
  switch (parameterKey) {
    case "hp":
      return Math.max(0, parameters.maxHp ?? 0);
    case "mp":
      return Math.max(0, parameters.maxMp ?? 0);
    case "stamina":
      return Math.max(0, parameters.maxStamina ?? 0);
    default:
      return Math.abs(parameters[parameterKey] ?? 0);
  }
}

function createMechanicalAttemptRecorder(
  sideA: CombatantState,
  sideB: CombatantState,
  attempts: MechanicalAttempt[],
): MechanicalAttemptRecorder {
  return (target, parameterKey, attemptedDelta, before, after) => {
    const targetSide = target === sideA ? "a" : target === sideB ? "b" : null;
    if (targetSide === null) {
      throw new Error("mechanical attempt target is outside the resolved battle");
    }
    const record = (
      key: ParamKey,
      requested: number,
      beforeValue: number,
      afterValue: number,
    ) => {
      const delta = afterValue - beforeValue;
      if (requested === 0 && delta === 0) return;
      attempts.push({
        targetSide,
        parameterKey: key,
        attemptedDelta: requested,
        beforeValue,
        afterValue,
        delta,
        relativeReferenceBeforeValue: relativeReferenceValue(before, key),
        relativeReferenceAfterValue: relativeReferenceValue(after, key),
      });
    };
    record(
      parameterKey,
      attemptedDelta,
      before[parameterKey] ?? 0,
      after[parameterKey] ?? 0,
    );
    for (const key of PARAMETER_KEYS) {
      if (key === parameterKey) continue;
      const beforeValue = before[key] ?? 0;
      const afterValue = after[key] ?? 0;
      if (beforeValue !== afterValue) {
        record(key, afterValue - beforeValue, beforeValue, afterValue);
      }
    }
  };
}

function applyTrackedParameterDelta(
  combatant: CombatantState,
  effect: ParameterDelta,
  record: MechanicalAttemptRecorder,
): number {
  const before = parametersSnapshot(combatant);
  const actual = applyParameterDelta(combatant, effect);
  record(
    combatant,
    effect.parameter,
    effect.delta,
    before,
    parametersSnapshot(combatant),
  );
  return actual;
}

function committedMechanicalEvidence(input: {
  turn: number;
  spans: MechanicalResolutionSpan[];
  events: TurnEvent[];
}): CommittedMechanicalEvidence[] {
  const evidence: CommittedMechanicalEvidence[] = [];
  for (const span of input.spans) {
    const basisEventIds = input.events
      .slice(span.eventStart, span.eventEnd)
      .flatMap((event) => event.id ? [event.id] : []);
    const append = (item: Omit<
      CommittedMechanicalEvidence,
      | "evidenceId"
      | "turn"
      | "sourceActionId"
      | "basisEventIds"
      | "actorSide"
    >) => {
      evidence.push({
        evidenceId: `turn-${input.turn}-mechanical-${evidence.length + 1}`,
        turn: input.turn,
        sourceActionId: span.sourceActionId,
        basisEventIds,
        actorSide: span.actorSide,
        ...item,
      });
    };
    const accounted = new Map<string, number>();
    for (const attempt of span.attempts) {
      append({
        target: {
          side: attempt.targetSide,
          entityId: `character.${attempt.targetSide}`,
        },
        parameterKey: attempt.parameterKey,
        attemptedDelta: attempt.attemptedDelta,
        beforeValue: attempt.beforeValue,
        afterValue: attempt.afterValue,
        delta: attempt.delta,
        relativeReferenceBeforeValue: attempt.relativeReferenceBeforeValue,
        relativeReferenceAfterValue: attempt.relativeReferenceAfterValue,
      });
      const key = `${attempt.targetSide}:${attempt.parameterKey}`;
      accounted.set(key, (accounted.get(key) ?? 0) + attempt.delta);
    }
    for (const side of ["a", "b"] as const) {
      const before = side === "a" ? span.beforeA : span.beforeB;
      const after = side === "a" ? span.afterA : span.afterB;
      for (const parameterKey of PARAMETER_KEYS) {
        const beforeValue = before[parameterKey] ?? 0;
        const afterValue = after[parameterKey] ?? 0;
        const delta = afterValue - beforeValue -
          (accounted.get(`${side}:${parameterKey}`) ?? 0);
        if (delta === 0) continue;
        append({
          target: {
            side,
            entityId: `character.${side}`,
          },
          parameterKey,
          attemptedDelta: delta,
          beforeValue: beforeValue +
            (accounted.get(`${side}:${parameterKey}`) ?? 0),
          afterValue,
          delta,
          relativeReferenceBeforeValue: relativeReferenceValue(before, parameterKey),
          relativeReferenceAfterValue: relativeReferenceValue(after, parameterKey),
        });
      }
    }
  }
  return CommittedMechanicalEvidenceSetSchema.parse(evidence);
}

/** Build the persisted, perspective-aware facts after deterministic resolution. */
export function buildBattleTurnRecord(input: {
  before: BattleState;
  after: BattleState;
  events: TurnEvent[];
  actions?: ResolvedBattleAction[];
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
    ...(input.after.latestTemporalResolution
      ? { temporalResolution: input.after.latestTemporalResolution }
      : {}),
    ...(input.after.latestWorldTransition?.turn === input.after.turn
      ? {
          worldImpact: {
            status: input.after.latestWorldTransition.status,
            operationKinds:
              input.after.latestWorldTransition.transition?.operations.map(
                (operation) => operation.op,
              ) ?? [],
          },
        }
      : {}),
    actions: input.actions ?? [],
    freeActionReceipts: input.after.latestFreeActionReceipts ?? [],
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
  encounterContext?: BattleEncounterContext;
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
  const semanticState = createBattleSemanticState({
    scene: bf?.scene ?? input.scene ?? "対決の舞台",
    notes:
      bf?.narrativeSetup ??
      bf?.terrain ??
      "互いの存在が場の空気を少しずつ変えている。",
    terrain: bf?.terrain,
    obstacles: bf?.obstacles,
    conditions: bf?.conditions,
    seed: bf?.semanticSeed,
    sideA: {
      displayName: input.sideA.displayName,
      appearanceSummary: input.sideA.appearance.summary,
    },
    sideB: {
      displayName: input.sideB.displayName,
      appearanceSummary: input.sideB.appearance.summary,
    },
  });
  const sideA = combatantFromSheet(input.sideA);
  const sideB = combatantFromSheet(input.sideB);
  const encounterContext = input.encounterContext ?? buildBattleEncounterContext({
    sideA: input.sideA,
    sideB: input.sideB,
    priorMatchSummary: input.priorMatchSummary,
  });
  const worldState = createBattleWorldState({ semanticState });
  const perceptionRegistryA = {
    schemaVersion: 1 as const,
    observerSide: "a" as const,
    nextContactSequence: 1,
    contacts: [],
  };
  const perceptionRegistryB = {
    schemaVersion: 1 as const,
    observerSide: "b" as const,
    nextContactSequence: 1,
    contacts: [],
  };
  const initialProjection = (observerSide: "a" | "b") =>
    buildInitialObserverPerception({
      observerSide,
      turn: 0,
      semanticState,
      worldState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: buildServerOnlyReserveCues({
        side: observerSide,
        parameters: observerSide === "a" ? sideA.parameters : sideB.parameters,
        baseParameters: observerSide === "a"
          ? sideA.baseParameters
          : sideB.baseParameters,
      }),
      previousRegistry: observerSide === "a"
        ? perceptionRegistryA
        : perceptionRegistryB,
      legacyCounterpartIdentified:
        encounterContext.social[observerSide].initialIdentityKnowledge ===
          "identified",
    });
  const projectedA = initialProjection("a");
  const projectedB = initialProjection("b");
  const agentStateA: CharacterAgentState = {
    privateMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference: encounterContext.social.a.selfReference,
    lastSpeech: null,
    conversationHistory: [],
    interior: {
      primaryEmotion: "平静",
      concealedEmotion: null,
      unspokenIntent: "",
      currentConcern: "",
      attitudeTowardCounterpart: encounterContext.social.a.relationshipLabel,
      confidence: "steady",
      relationshipTension: "",
    },
  };
  const agentStateB: CharacterAgentState = {
    privateMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference: encounterContext.social.b.selfReference,
    lastSpeech: null,
    conversationHistory: [],
    interior: {
      primaryEmotion: "平静",
      concealedEmotion: null,
      unspokenIntent: "",
      currentConcern: "",
      attitudeTowardCounterpart: encounterContext.social.b.relationshipLabel,
      confidence: "steady",
      relationshipTension: "",
    },
  };
  const narratorContinuity = updateBattleNarratorContinuity({
    turn: 0,
    encounter: encounterContext,
    frameA: projectedA.frame,
    frameB: projectedB.frame,
    agentStateA,
    agentStateB,
  });

  return {
    id: input.id,
    pipelineAuthorityVersion: 1,
    status: "active",
    turn: 0,
    turnLimit: input.turnLimit,
    sideA,
    sideB,
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
    semanticState,
    worldState,
    observationStateA: buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "a",
    }),
    observationStateB: buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "b",
    }),
    observationStatePublic: buildSemanticObservationState({
      before: semanticState,
      after: semanticState,
      observer: "public",
    }),
    perceptionFrameA: projectedA.frame,
    perceptionFrameB: projectedB.frame,
    perceptionRegistryA: projectedA.registry,
    perceptionRegistryB: projectedB.registry,
    supervisor: {
      quietTurns: 0,
      passiveTurns: 0,
      turnsSinceHappeni…13172 tokens truncated…urceActionId = input.actionId;
    event.actorSide ??= input.actorSide;
    if (event.targetName === input.targetName) {
      event.targetSides ??= [input.targetSide];
    } else if (event.targetName === input.actorName || !event.targetName) {
      event.targetSides ??= [input.actorSide];
    }
  }
}

function combatScore(c: CombatantState): number {
  const p = c.parameters;
  return (p.hp ?? 0) * 2 + (p.mp ?? 0) + (p.stamina ?? 0) + (p.atk ?? 0) + (p.def ?? 0);
}

function envAmount(intensity: "minor" | "moderate"): number {
  return intensity === "moderate" ? 14 : 7;
}

type DecisiveContext = {
  battleId: string;
  turn: number;
  turnLimit: number;
  actorSide: "a" | "b";
};

function deterministicRoll(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * From turn 10, finishing pressure rises without changing earlier balance.
 * At turn 10 the multiplier/chance are unchanged; at turn 20 (or a shorter
 * configured limit) specials reach 2x and deterministic critical chance 40%.
 */
export function decisivePressure(input: DecisiveContext): {
  progress: number;
  criticalChance: number;
  specialMultiplier: number;
} {
  if (input.turn <= 10) {
    return { progress: 0, criticalChance: 0, specialMultiplier: 1 };
  }
  const maximumTurn = Math.max(11, Math.min(20, input.turnLimit));
  const progress = Math.min(
    1,
    Math.max(0, (input.turn - 10) / (maximumTurn - 10)),
  );
  return {
    progress,
    criticalChance: progress * 0.4,
    specialMultiplier: 1 + progress,
  };
}

export type FinisherWindow = {
  skillId: string;
  skillName: string;
  source: "explicit" | "derived";
  unlocked: boolean;
  turnsUntilUnlock: number;
  remainingUses: 0 | 1;
  currentMultiplier: number;
  maxMultiplier: 2;
  criticalChance: number;
  turnsUntilMax: number;
};

/** Compact, character-visible facts for deciding whether to spend the finisher. */
export function buildFinisherWindow(input: {
  finisher?: FinisherState;
  turn: number;
  turnLimit: number;
}): FinisherWindow | null {
  if (!input.finisher) return null;
  const pressure = decisivePressure({
    battleId: "window",
    turn: input.turn,
    turnLimit: input.turnLimit,
    actorSide: "a",
  });
  const maximumTurn = Math.max(11, Math.min(20, input.turnLimit));
  return {
    skillId: input.finisher.skillId,
    skillName: input.finisher.skillName,
    source: input.finisher.source,
    unlocked: input.turn >= 10,
    turnsUntilUnlock: Math.max(0, 10 - input.turn),
    remainingUses: input.finisher.used ? 0 : 1,
    currentMultiplier: pressure.specialMultiplier,
    maxMultiplier: 2,
    criticalChance: pressure.criticalChance,
    turnsUntilMax: Math.max(0, maximumTurn - input.turn),
  };
}

function applyDecisivePressure(input: {
  amount: number;
  targetMaxHp: number;
  special: boolean;
  context: DecisiveContext;
}): { amount: number; critical: boolean } {
  const pressure = decisivePressure(input.context);
  const critical = pressure.criticalChance > 0 && deterministicRoll(
    `${input.context.battleId}:${input.context.turn}:${input.context.actorSide}`,
  ) < pressure.criticalChance;
  const multiplier =
    (input.special ? pressure.specialMultiplier : 1) *
    (critical ? 1.5 : 1);
  const maximumRatio = 0.26 *
    (input.special ? pressure.specialMultiplier : 1) *
    (critical ? 1.5 : 1);
  return {
    amount: Math.max(
      1,
      Math.min(
        Math.round(input.targetMaxHp * maximumRatio),
        Math.round(input.amount * multiplier),
      ),
    ),
    critical,
  };
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
  mechanicalSpans: MechanicalResolutionSpan[],
): void {
  for (const hit of hits) {
    const targets: CombatantState[] =
      hit.target === "both"
        ? [sideA, sideB]
        : hit.target === "a"
          ? [sideA]
          : [sideB];
    for (const t of targets) {
      const beforeA = parametersSnapshot(sideA);
      const beforeB = parametersSnapshot(sideB);
      const eventStart = events.length;
      const targetSide = t === sideA ? "a" : "b";
      const attempts: MechanicalAttempt[] = [];
      const record = createMechanicalAttemptRecorder(sideA, sideB, attempts);
      const amount = envAmount(hit.intensity);
      if (hit.kind === "heal") {
        applyTrackedParameterDelta(
          t,
          { parameter: "hp", delta: amount },
          record,
        );
        events.push({
          type: "heal",
          actorName: t.displayName,
          targetName: t.displayName,
          targetSides: [targetSide],
          parameterKey: "hp",
          parameterDirection: "gain",
          intensity: hit.intensity,
          summary:
            hit.intensity === "moderate"
              ? `${t.displayName} は環境の幸いで息を吹き返した。`
              : `${t.displayName} はわずかに体勢を立て直した。`,
        });
      } else if (hit.kind === "disrupt") {
        // Soft pressure: small HP chip + stigma in narration
        const chip = applyHpDamage(t, Math.floor(amount * 0.5), record);
        events.push({
          type: "status",
          actorName: t.displayName,
          targetName: t.displayName,
          targetSides: [targetSide],
          parameterKey: "hp",
          parameterDirection: "loss",
          intensity: hit.intensity,
          summary: chip.finishing
            ? `${t.displayName} は場の圧力にとどめを刺され、決戦を続けられなくなった。`
            : hit.intensity === "moderate"
              ? `${t.displayName} は大きく体勢を崩した。`
              : `${t.displayName} の動きが一瞬乱れた。`,
        });
      } else {
        const env = applyHpDamage(t, amount, record);
        events.push({
          type: "damage",
          targetName: t.displayName,
          targetSides: [targetSide],
          parameterKey: "hp",
          parameterDirection: "loss",
          intensity: hit.intensity,
          summary: env.finishing
            ? `${t.displayName} は環境の変化にとどめを刺された——それが決め手となった。`
            : hit.intensity === "moderate"
              ? `${t.displayName} は環境の変化に大きく揺さぶられた。`
              : `${t.displayName} は環境の余波を浴びた。`,
        });
      }
      mechanicalSpans.push(mechanicalResolutionSpan({
        beforeA,
        beforeB,
        sideA,
        sideB,
        attempts,
        eventStart,
        eventEnd: events.length,
      }));
    }
  }
}

function repeatedActionCount(input: {
  side: BattleTemporalSide;
  action: BattleAction;
  drama: ReturnType<typeof normalizeDramaState>;
}): number {
  const previous = parseActionSignature(
    input.side === "a"
      ? input.drama.lastActionSignatureA
      : input.drama.lastActionSignatureB,
  );
  const same = previous?.kind === input.action.kind &&
    (previous.skillId ?? null) === (input.action.skillId ?? null);
  const count = input.side === "a"
    ? input.drama.repeatedActionA
    : input.drama.repeatedActionB;
  return same ? count + 1 : 1;
}

function repetitionEffectMultiplier(input: { repeatCount: number }): number {
  if (input.repeatCount < 3) return 1;
  return Math.max(0.7, 1 - (input.repeatCount - 2) * 0.1);
}

function applyAction(
  actor: CombatantState,
  target: CombatantState,
  action: BattleAction,
  skills: Skill[],
  basicAttack: BasicAttackProfile,
  situation: Situation,
  events: TurnEvent[],
  recordMechanicalAttempt: MechanicalAttemptRecorder,
  decisive: DecisiveContext,
  finisher?: FinisherState,
  repeatCount = 1,
): boolean {
  if (repeatCount >= 2 && ["basic_attack", "skill", "free_action"].includes(action.kind)) {
    const fatigue = Math.min(actor.parameters.stamina ?? 0, repeatCount >= 4 ? 4 : 2);
    if (fatigue > 0) {
      applyTrackedParameterDelta(
        actor,
        { parameter: "stamina", delta: -fatigue },
        recordMechanicalAttempt,
      );
    }
    events.push({
      type: "status",
      actorName: actor.displayName,
      summary: repeatCount >= 3
        ? `${actor.displayName} の動きは読まれ、同じ手の勢いが鈍る。`
        : `${actor.displayName} は同じ手を重ね、わずかに息が乱れる。`,
    });
  }
  if (action.kind === "free_action") {
    events.push({
      type: "free_action",
      actorName: actor.displayName,
      summary: `${actor.displayName} は「${action.description ?? "自由な試み"}」を実行しようとした。`,
    });
    return false;
  }

  if (action.kind === "basic_attack") {
    const stamina = actor.parameters.stamina ?? 0;
    applyTrackedParameterDelta(
      actor,
      { parameter: "stamina", delta: -Math.min(3, stamina) },
      recordMechanicalAttempt,
    );
    applyBasicAttack(
      actor,
      target,
      basicAttack,
      situation,
      events,
      recordMechanicalAttempt,
      decisive,
    );
    return false;
  }

  if (action.kind === "rest") {
    const maxMp = actor.parameters.maxMp ?? 0;
    const maxStamina = actor.parameters.maxStamina ?? 0;
    applyTrackedParameterDelta(
      actor,
      {
        parameter: "mp",
        delta: Math.max(4, Math.round(maxMp * 0.12)),
      },
      recordMechanicalAttempt,
    );
    applyTrackedParameterDelta(
      actor,
      {
        parameter: "stamina",
        delta: Math.max(6, Math.round(maxStamina * 0.18)),
      },
      recordMechanicalAttempt,
    );
    events.push({
      type: "rest",
      actorName: actor.displayName,
      summary: `${actor.displayName} は一度間合いを切り、呼吸と力を取り戻した。`,
    });
    return false;
  }

  if (action.kind === "wait") {
    events.push({
      type: "wait",
      actorName: actor.displayName,
      summary: `${actor.displayName} は様子をうかがった。`,
    });
    return false;
  }

  if (action.kind === "defend") {
    actor.defending = true;
    events.push({
      type: "defend",
      actorName: actor.displayName,
      summary: `${actor.displayName} は自分の態勢を整えた。`,
    });
    return false;
  }

  const skill = findSkill(skills, action.skillId);
  if (!skill) {
    events.push({
      type: "info",
      actorName: actor.displayName,
      summary: `${actor.displayName} は技を繰り出せなかった。`,
    });
    return false;
  }
  if (
    skill.kind === "special" &&
    (decisive.turn < 10 || finisher?.used || skill.id !== finisher?.skillId)
  ) {
    events.push({
      type: "info",
      actorName: actor.displayName,
      skillName: skill.name,
      summary: finisher?.used
        ? `${actor.displayName} は、すでに放った ${skill.name} を再び使うことはできなかった。`
        : `${actor.displayName} は ${skill.name} の機を待った。`,
    });
    return false;
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
    return false;
  }
  if (
    isSkillOnCooldown({
      skillId: skill.id,
      power: skill.power,
      currentTurn: decisive.turn,
      lastUsedTurnBySkill: actor.skillLastUsedTurn,
    })
  ) {
    const cd = skillCooldownTurns(skill.power);
    events.push({
      type: "info",
      actorName: actor.displayName,
      skillName: skill.name,
      summary: `${actor.displayName} は ${skill.name} の余韻が残り、${cd}ターン級の間合いを待たねばならなかった。`,
    });
    return false;
  }

  applyTrackedParameterDelta(
    actor,
    { parameter: "mp", delta: -skill.costMp },
    recordMechanicalAttempt,
  );
  applyTrackedParameterDelta(
    actor,
    { parameter: "stamina", delta: -skill.costStamina },
    recordMechanicalAttempt,
  );
  actor.skillLastUsedTurn = markSkillUsed(
    actor.skillLastUsedTurn,
    skill.id,
    decisive.turn,
  );

  if (
    skill.kind === "defend" ||
    skill.kind === "support" ||
    skill.kind === "status"
  ) {
    actor.defending = skill.kind === "defend";
    const heal = Math.round(8 * skill.power * coeff(situation, "heal"));
    if (skill.kind === "support" && heal > 0) {
      applyTrackedParameterDelta(
        actor,
        { parameter: "hp", delta: heal },
        recordMechanicalAttempt,
      );
      events.push({
        type: "heal",
        actorName: actor.displayName,
        skillName: skill.name,
        parameterKey: "hp",
        parameterDirection: "gain",
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
    applySkillEffects(
      actor,
      target,
      skill,
      events,
      recordMechanicalAttempt,
    );
    return false;
  }

  const activateFinisher = Boolean(
    finisher &&
    !finisher.used &&
    decisive.turn >= 10 &&
    skill.id === finisher.skillId &&
    (skill.kind === "special" || action.useFinisher === true),
  );
  if (activateFinisher) {
    events.push({
      type: "status",
      actorName: actor.displayName,
      skillName: skill.name,
      summary: `${actor.displayName} は勝負を決めるため、${skill.name} に蓄えたすべてを注いだ。`,
    });
  }
  applyAttackSkill(
    actor,
    target,
    skill,
    situation,
    events,
    recordMechanicalAttempt,
    decisive,
    activateFinisher,
  );
  applySkillEffects(
    actor,
    target,
    skill,
    events,
    recordMechanicalAttempt,
  );
  return activateFinisher;
}

function applyBasicAttack(
  actor: CombatantState,
  target: CombatantState,
  profile: BasicAttackProfile,
  situation: Situation,
  events: TurnEvent[],
  recordMechanicalAttempt: MechanicalAttemptRecorder,
  decisive: DecisiveContext,
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
  let critical = false;
  if (parameter === "hp") {
    if (target.defending) amount = Math.round(amount * 0.55);
    amount = softenCombatDamage({
      rawDamage: amount,
      targetMaxHp: target.parameters.maxHp ?? 100,
      skillPower: power,
    });
    const pressure = applyDecisivePressure({
      amount,
      targetMaxHp: target.parameters.maxHp ?? 100,
      special: false,
      context: decisive,
    });
    amount = pressure.amount;
    critical = pressure.critical;
  } else {
    const reference = Math.abs(
      target.baseParameters?.[parameter] ?? target.parameters[parameter] ?? 10,
    );
    amount = Math.min(amount, Math.max(2, Math.round(reference * 0.2)));
  }
  const actual = applyTrackedParameterDelta(
    target,
    { parameter, delta: -amount },
    recordMechanicalAttempt,
  );
  const intensity = parameter === "hp" && critical
    ? "critical"
    : intensityFromDamage(Math.abs(actual));
  const finishing =
    parameter === "hp" &&
    actual < 0 &&
    (target.parameters.hp ?? 0) <= 0;
  events.push({
    type: parameter === "hp" ? "damage" : "parameter",
    actorName: actor.displayName,
    targetName: target.displayName,
    skillName: profile.name,
    parameterKey: parameter,
    parameterDirection: "loss",
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
  recordMechanicalAttempt: MechanicalAttemptRecorder,
): void {
  for (const effect of skill.effects ?? []) {
    const recipient = effect.target === "self" ? actor : foe;
    const actual = applyTrackedParameterDelta(
      recipient,
      effect,
      recordMechanicalAttempt,
    );
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
      parameterKey: effect.parameter,
      parameterDirection: actual > 0 ? "gain" : "loss",
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
  recordMechanicalAttempt: MechanicalAttemptRecorder,
  decisive: DecisiveContext,
  activateFinisher: boolean,
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
  const pressure = applyDecisivePressure({
    amount: dmg,
    targetMaxHp: target.parameters.maxHp ?? 100,
    special: activateFinisher,
    context: decisive,
  });
  dmg = pressure.amount;

  const { actual, finishing } = applyHpDamage(
    target,
    dmg,
    recordMechanicalAttempt,
  );
  const intensity = pressure.critical ? "critical" : intensityFromDamage(actual);
  events.push({
    type: "damage",
    actorName: actor.displayName,
    targetName: target.displayName,
    skillName: skill.name,
    parameterKey: "hp",
    parameterDirection: "loss",
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
