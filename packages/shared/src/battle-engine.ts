import type {
  BattleAction,
  BattleBucketMechanicalCommit,
  BattlePolicyOption,
  BattleStance,
  BattleState,
  BattleTurnRecord,
  BattleTurnEngineContinuation,
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
import {
  BattleTurnEngineContinuationSchema,
  clampCoefficient,
  isCombatantDown,
} from "./battle.js";
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
  buildSequentialBattleTemporalPlan,
  buildBattleTemporalPlan,
  selectSequentialInitiativeOrder,
  type BattleTemporalBucket,
  type BattleTemporalPlan,
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
  evidenceOffset?: number;
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
        evidenceId: `turn-${input.turn}-mechanical-${
          (input.evidenceOffset ?? 0) + evidence.length + 1
        }`,
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
    ...(
      input.after.latestSemanticTransition?.turn === input.after.turn ||
        input.after.latestWorldTransition?.turn === input.after.turn
        ? {
            canonicalTransition: {
              ...(input.after.latestSemanticTransition?.turn === input.after.turn
                ? { semantic: input.after.latestSemanticTransition }
                : {}),
              ...(input.after.latestWorldTransition?.turn === input.after.turn
                ? { world: input.after.latestWorldTransition }
                : {}),
            },
          }
        : {}
    ),
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
    battleVolatileMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference: encounterContext.social.a.selfReference,
    lastSpeech: null,
    conversationHistory: [],
    dialogueThread: {
      topic: "",
      unresolvedMove: "",
      anchoredExchange: null,
    },
    interior: {
      primaryEmotion: "平静",
      concealedEmotion: null,
      coreNeed: "",
      protectiveStance: "",
      eventAppraisal: "",
      unspokenIntent: "",
      currentConcern: "",
      attitudeTowardCounterpart: encounterContext.social.a.relationshipLabel,
      confidence: "steady",
      relationshipTension: "",
      speechMode: "weave",
      speechAppraisal: {
        anticipatedImpact: "",
        observedImpact: "",
        anticipatedSocialCost: "",
        observedSocialCost: "",
        nextApproach: "",
        continuityPosture: "opening",
        continuityDecision: "advance",
      },
    },
  };
  const agentStateB: CharacterAgentState = {
    privateMemory: "",
    battleVolatileMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference: encounterContext.social.b.selfReference,
    lastSpeech: null,
    conversationHistory: [],
    dialogueThread: {
      topic: "",
      unresolvedMove: "",
      anchoredExchange: null,
    },
    interior: {
      primaryEmotion: "平静",
      concealedEmotion: null,
      coreNeed: "",
      protectiveStance: "",
      eventAppraisal: "",
      unspokenIntent: "",
      currentConcern: "",
      attitudeTowardCounterpart: encounterContext.social.b.relationshipLabel,
      confidence: "steady",
      relationshipTension: "",
      speechMode: "weave",
      speechAppraisal: {
        anticipatedImpact: "",
        observedImpact: "",
        anticipatedSocialCost: "",
        observedSocialCost: "",
        nextApproach: "",
        continuityPosture: "opening",
        continuityDecision: "advance",
      },
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
      turnsSinceHappening: 0,
      lastHpA: null,
      lastHpB: null,
      happenings: 0,
      recentHappenings: [],
    },
    dramaState: normalizeDramaState(null),
    prologuePending: input.prologuePending ?? true,
    aftermathPending: false,
    narrationStyle: input.narrationStyle ?? defaultNarrationSnapshot(),
    priorMatchSummary: input.priorMatchSummary ?? null,
    encounterContext,
    narratorContinuity,
    agentStateA,
    agentStateB,
    finisherA: selectFinisherSkill(input.sideA.skills),
    finisherB: selectFinisherSkill(input.sideB.skills),
    turnRecords: [],
    log: [],
    winnerSide: null,
    finishReason: null,
    createdAt: t,
    updatedAt: t,
  };
}

/**
 * Seed observer perception for battles created before this layer existed.
 * Active legacy battles keep counterpart identity known from setup; new battles
 * already carry encounter-derived frames and must not call this path.
 */
export function ensureBattlePerceptionState(state: BattleState): BattleState {
  if (
    state.perceptionFrameA &&
    state.perceptionFrameB &&
    state.perceptionRegistryA &&
    state.perceptionRegistryB
  ) {
    return state;
  }
  const semanticState = state.semanticState;
  if (!semanticState) return state;

  const seedSide = (observerSide: "a" | "b") => {
    const combatant = observerSide === "a" ? state.sideA : state.sideB;
    return buildMinimalObserverPerception({
      observerSide,
      turn: state.turn,
      semanticState,
      worldState: state.worldState,
      quantizedMechanicalEvidence: [],
      reserveEvidence: buildServerOnlyReserveCues({
        side: observerSide,
        parameters: combatant.parameters,
        baseParameters: combatant.baseParameters,
      }),
      previousFrame: observerSide === "a"
        ? state.perceptionFrameA
        : state.perceptionFrameB,
      previousRegistry: observerSide === "a"
        ? state.perceptionRegistryA
        : state.perceptionRegistryB,
      // Missing perception means a pre-perception battle still in flight.
      legacyCounterpartIdentified: true,
    });
  };
  const projectedA = seedSide("a");
  const projectedB = seedSide("b");
  return {
    ...state,
    perceptionFrameA: projectedA.frame,
    perceptionFrameB: projectedB.frame,
    perceptionRegistryA: projectedA.registry,
    perceptionRegistryB: projectedB.registry,
  };
}

/** Deterministically supplies the server-owned coarse world for legacy battles. */
export function ensureBattleWorldState(state: BattleState): BattleState {
  if (state.worldState || !state.semanticState) return state;
  return {
    ...state,
    worldState: createBattleWorldState({ semanticState: state.semanticState }),
  };
}

/**
 * Deterministic next-save migration for battles created before role boundaries.
 * Historical public log remains display-only. Unknown-provenance lastSpeech and
 * any action planned from it are discarded instead of entering new cognition.
 */
export function ensureBattleCompatibilityState(state: BattleState): BattleState {
  const withWorld = ensureBattleWorldState(state);
  const withPerception = ensureBattlePerceptionState(withWorld);
  if (
    withPerception.pipelineAuthorityVersion === 1 &&
    withPerception.encounterContext &&
    withPerception.narratorContinuity &&
    withPerception.agentStateA?.interior &&
    withPerception.agentStateB?.interior &&
    withPerception.agentStateA.dialogueThread &&
    withPerception.agentStateB.dialogueThread
  ) {
    return withPerception;
  }
  const encounterContext = withPerception.encounterContext ??
    buildLegacyBattleEncounterContext({
      sideAName: withPerception.sideA.displayName,
      sideBName: withPerception.sideB.displayName,
      selfReferenceA: withPerception.agentStateA?.selfReference,
      selfReferenceB: withPerception.agentStateB?.selfReference,
      priorMatchSummary: withPerception.priorMatchSummary,
    });
  const agentStateA = withPerception.agentStateA
    ? {
        ...withPerception.agentStateA,
        battleVolatileMemory: withPerception.agentStateA.battleVolatileMemory ?? "",
        ...(withPerception.pipelineAuthorityVersion === 1
          ? {}
          : { lastSpeech: null }),
        dialogueThread: withPerception.agentStateA.dialogueThread ?? {
          topic: "",
          unresolvedMove: "",
          anchoredExchange: null,
        },
        interior: withPerception.agentStateA.interior ?? {
          primaryEmotion: withPerception.agentStateA.emotion || "平静",
          concealedEmotion: null,
          coreNeed: "",
          protectiveStance: "",
          eventAppraisal: "",
          unspokenIntent: "",
          currentConcern: withPerception.agentStateA.currentGoal,
          attitudeTowardCounterpart: encounterContext.social.a.relationshipLabel,
          confidence: "steady" as const,
          relationshipTension: "",
          speechMode: "weave" as const,
        },
      }
    : {
        privateMemory: "",
        battleVolatileMemory: "",
        currentGoal: "",
        emotion: "平静",
        beliefs: [],
        observations: [],
        speechStyle: "",
        selfReference: encounterContext.social.a.selfReference,
        lastSpeech: null,
        conversationHistory: [],
        dialogueThread: {
          topic: "",
          unresolvedMove: "",
          anchoredExchange: null,
        },
        interior: {
          primaryEmotion: "平静",
          concealedEmotion: null,
          coreNeed: "",
          protectiveStance: "",
          eventAppraisal: "",
          unspokenIntent: "",
          currentConcern: "",
          attitudeTowardCounterpart: encounterContext.social.a.relationshipLabel,
          confidence: "steady" as const,
          relationshipTension: "",
          speechMode: "weave" as const,
        },
      };
  const agentStateB = withPerception.agentStateB
    ? {
        ...withPerception.agentStateB,
        battleVolatileMemory: withPerception.agentStateB.battleVolatileMemory ?? "",
        ...(withPerception.pipelineAuthorityVersion === 1
          ? {}
          : { lastSpeech: null }),
        dialogueThread: withPerception.agentStateB.dialogueThread ?? {
          topic: "",
          unresolvedMove: "",
          anchoredExchange: null,
        },
        interior: withPerception.agentStateB.interior ?? {
          primaryEmotion: withPerception.agentStateB.emotion || "平静",
          concealedEmotion: null,
          coreNeed: "",
          protectiveStance: "",
          eventAppraisal: "",
          unspokenIntent: "",
          currentConcern: withPerception.agentStateB.currentGoal,
          attitudeTowardCounterpart: encounterContext.social.b.relationshipLabel,
          confidence: "steady" as const,
          relationshipTension: "",
          speechMode: "weave" as const,
        },
      }
    : {
        privateMemory: "",
        battleVolatileMemory: "",
        currentGoal: "",
        emotion: "平静",
        beliefs: [],
        observations: [],
        speechStyle: "",
        selfReference: encounterContext.social.b.selfReference,
        lastSpeech: null,
        conversationHistory: [],
        dialogueThread: {
          topic: "",
          unresolvedMove: "",
          anchoredExchange: null,
        },
        interior: {
          primaryEmotion: "平静",
          concealedEmotion: null,
          coreNeed: "",
          protectiveStance: "",
          eventAppraisal: "",
          unspokenIntent: "",
          currentConcern: "",
          attitudeTowardCounterpart: encounterContext.social.b.relationshipLabel,
          confidence: "steady" as const,
          relationshipTension: "",
          speechMode: "weave" as const,
        },
      };
  const narratorContinuity = withPerception.narratorContinuity ?? (
    withPerception.perceptionFrameA && withPerception.perceptionFrameB
      ? updateBattleNarratorContinuity({
          turn: withPerception.turn,
          encounter: encounterContext,
          frameA: withPerception.perceptionFrameA,
          frameB: withPerception.perceptionFrameB,
          agentStateA,
          agentStateB,
        })
      : undefined
  );
  return {
    ...withPerception,
    pipelineAuthorityVersion: 1,
    encounterContext,
    narratorContinuity,
    agentStateA,
    agentStateB,
    plannedActionA: withPerception.pipelineAuthorityVersion === 1
      ? withPerception.plannedActionA
      : undefined,
    plannedActionB: withPerception.pipelineAuthorityVersion === 1
      ? withPerception.plannedActionB
      : undefined,
    turnRecords: (withPerception.turnRecords ?? []).slice(-50),
  };
}

function hpRatio(c: CombatantState): number {
  const max = c.parameters.maxHp ?? 100;
  const hp = c.parameters.hp ?? 0;
  return max > 0 ? hp / max : 0;
}

function observerSafeFoeHpRatio(
  frame: BattleState["perceptionFrameA"] | BattleState["perceptionFrameB"],
  foe: CombatantState,
): number {
  if (!frame || !["coarse", "clear"].includes(frame.counterpart.currentAccess)) {
    return 0.7;
  }
  const condition = perceivedCondition(foe);
  if (condition === "incapacitated") return 0;
  if (condition === "critical") return 0.15;
  if (condition === "strained") return 0.45;
  return 0.8;
}

function intentFromBattleAction(action: BattleAction): CharacterActionIntent {
  return {
    kind: action.kind,
    ...(action.skillId ? { skillId: action.skillId } : {}),
    ...(action.useFinisher ? { useFinisher: true } : {}),
    ...(action.description ? { description: action.description } : {}),
    ...(action.desiredOutcome ? { desiredOutcome: action.desiredOutcome } : {}),
    ...(action.subjectRefs ? { subjectRefs: action.subjectRefs } : {}),
    ...(action.instrumentRef ? { instrumentRef: action.instrumentRef } : {}),
    ...(action.opportunityId ? { opportunityId: action.opportunityId } : {}),
    ...(action.reflectionAnalysis
      ? { reflectionAnalysis: action.reflectionAnalysis }
      : {}),
    ...(action.reflectionGuideline
      ? { reflectionGuideline: action.reflectionGuideline }
      : {}),
  };
}

const INSTRUMENT_MULTIPLIER: Record<WorldCausalBand, number> = {
  none: 1,
  minor: 1.1,
  moderate: 1.2,
};

function instrumentEntity(input: {
  worldState?: BattleWorldState;
  actorSide: "a" | "b";
  instrumentRef?: string;
}) {
  if (!input.worldState || !input.instrumentRef) return null;
  const directId = input.instrumentRef.startsWith("entity:")
    ? input.instrumentRef.slice("entity:".length)
    : null;
  const entry = Object.entries(input.worldState.entities).find(([id, entity]) =>
    id === directId || entity.objectProfile?.observerRefs[input.actorSide] ===
      input.instrumentRef
  );
  if (!entry) return null;
  const [entityId, entity] = entry;
  const actorId = `character.${input.actorSide}`;
  const controlled =
    (entity.placement.type === "held" && entity.placement.holderId === actorId) ||
    (entity.placement.type === "worn" && entity.placement.wearerId === actorId);
  if (
    !controlled ||
    !entity.active ||
    entity.presence !== "present" ||
    !entity.objectState?.usable
  ) {
    return null;
  }
  return { entityId, entity };
}

function instrumentBand(input: {
  worldState?: BattleWorldState;
  actorSide: "a" | "b";
  action?: BattleAction | null;
  channel: "damage" | "defense";
}): WorldCausalBand {
  const entity = instrumentEntity({
    worldState: input.worldState,
    actorSide: input.actorSide,
    instrumentRef: input.action?.instrumentRef,
  });
  return entity?.entity.objectState?.causalEnvelope?.[input.channel] ?? "none";
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

/** Merge same-snapshot action proposals, then apply parameter bounds once. */
function applyAtomicMechanicalAttempts(
  sideA: CombatantState,
  sideB: CombatantState,
  attempts: MechanicalAttempt[],
): void {
  const totals = new Map<string, number>();
  for (const attempt of attempts) {
    const key = `${attempt.targetSide}:${attempt.parameterKey}`;
    totals.set(key, (totals.get(key) ?? 0) + attempt.attemptedDelta);
  }
  const orderedKeys: ParamKey[] = [
    "maxHp",
    "maxMp",
    "maxStamina",
    ...PARAMETER_KEYS.filter((key) =>
      key !== "maxHp" && key !== "maxMp" && key !== "maxStamina"
    ),
  ];
  for (const side of ["a", "b"] as const) {
    const combatant = side === "a" ? sideA : sideB;
    for (const parameterKey of orderedKeys) {
      const delta = totals.get(`${side}:${parameterKey}`) ?? 0;
      if (delta === 0) continue;
      const current = combatant.parameters[parameterKey] ?? 0;
      const consumable = parameterKey === "hp" ||
        parameterKey === "mp" ||
        parameterKey === "stamina";
      combatant.parameters[parameterKey] = Math.max(
        consumable ? 0 : 1,
        current + delta,
      );
    }
    clampCurrentToMaximums(combatant.parameters);
  }
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

function usableSkills(
  skills: Skill[],
  self: CombatantState,
  turn = 0,
): Skill[] {
  return skills.filter(
    (s) =>
      (self.parameters.mp ?? 0) >= s.costMp &&
      (self.parameters.stamina ?? 0) >= s.costStamina &&
      !isSkillOnCooldown({
        skillId: s.id,
        power: s.power,
        currentTurn: turn,
        lastUsedTurnBySkill: self.skillLastUsedTurn,
      }),
  );
}

function isOffensiveSkill(skill: Skill): boolean {
  return skill.kind === "attack" ||
    skill.kind === "magic" ||
    skill.kind === "special" ||
    (skill.kind === "status" &&
      (skill.effects ?? []).some(
        (effect) => effect.target === "foe" && effect.delta < 0,
      ));
}

/** Pick one stable finisher without inventing a new skill for legacy sheets. */
export function selectFinisherSkill(skills: Skill[]): FinisherState | undefined {
  const ranked = skills
    .filter((skill) =>
      skill.kind === "attack" || skill.kind === "magic" || skill.kind === "special"
    )
    .sort((a, b) => {
      if (a.kind === "special" && b.kind !== "special") return -1;
      if (b.kind === "special" && a.kind !== "special") return 1;
      return b.power - a.power || a.id.localeCompare(b.id);
    });
  const selected = ranked[0];
  if (!selected) return undefined;
  return {
    skillId: selected.id,
    skillName: selected.name,
    source: selected.kind === "special" ? "explicit" : "derived",
    used: false,
    usedTurn: null,
  };
}

function normalizeFinisher(
  current: FinisherState | undefined,
  skills: Skill[],
): FinisherState | undefined {
  if (current && skills.some((skill) => skill.id === current.skillId)) {
    return current;
  }
  return selectFinisherSkill(skills);
}

function rankOffensiveSkills(
  skills: Skill[],
  self: CombatantState,
  turn = 0,
): Skill[] {
  // Static policy fallback never spends the one-use finisher. Only a validated
  // character reservation (or explicit player action) may select `special`.
  return usableSkills(skills, self, turn)
    .filter(
      (s) =>
        s.kind === "attack" ||
        s.kind === "magic" ||
        (s.kind === "status" &&
          (s.effects ?? []).some(
            (effect) => effect.target === "foe" && effect.delta < 0,
          )),
    )
    .sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
}

function pickOffensiveSkill(
  skills: Skill[],
  self: CombatantState,
  options?: { avoidSkillId?: string | null; turn?: number },
): Skill | undefined {
  const ranked = rankOffensiveSkills(skills, self, options?.turn ?? 0);
  if (ranked.length === 0) return undefined;
  if (options?.avoidSkillId && ranked.length > 1) {
    const alternates = ranked.filter((skill) => skill.id !== options.avoidSkillId);
    if (alternates.length > 0) {
      const index = Math.abs(options.turn ?? 0) % alternates.length;
      return alternates[index];
    }
  }
  if ((options?.turn ?? 0) > 0 && ranked.length > 1) {
    // Rotate among the top two strongest options so policy fallback is not
    // locked to a single strongest skill every turn.
    const top = ranked.slice(0, Math.min(2, ranked.length));
    return top[Math.abs(options!.turn!) % top.length];
  }
  return ranked[0];
}

function pickSupportSkill(
  skills: Skill[],
  self: CombatantState,
  options?: { avoidSkillId?: string | null; turn?: number },
): Skill | undefined {
  const usable = usableSkills(skills, self, options?.turn ?? 0).filter(
    (s) =>
      s.kind === "support" ||
      s.kind === "defend" ||
      (s.kind === "status" &&
        (s.effects ?? []).some(
          (effect) => effect.target === "self" && effect.delta > 0,
        )),
  );
  if (usable.length === 0) return undefined;
  if (options?.avoidSkillId && usable.length > 1) {
    const alternates = usable.filter((skill) => skill.id !== options.avoidSkillId);
    if (alternates.length > 0) {
      return alternates[Math.abs(options.turn ?? 0) % alternates.length];
    }
  }
  return usable[Math.abs(options?.turn ?? 0) % usable.length];
}

function actionFromBias(
  bias: PolicyBias,
  actorSide: "a" | "b",
  self: CombatantState,
  skills: Skill[],
  myHp: number,
  turn: number,
  avoidSkillId?: string | null,
): BattleAction {
  const offense = pickOffensiveSkill(skills, self, { avoidSkillId, turn });
  const support = pickSupportSkill(skills, self, { avoidSkillId, turn });

  const attack = (): BattleAction =>
    offense
      ? {
          actorSide,
          kind: "skill",
          skillId: offense.id,
        }
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
      // When mixed and already low on vitality, keep pressure with cadence:
      // occasionally step, rest, or basic attack so every turn is not one skill.
      if (myHp > 0.55 && turn % 5 === 0) return { actorSide, kind: "wait" };
      if (myHp > 0.45 && turn % 4 === 3) return defend();
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
  /** When set, prefer a different skill/kind than the last repeated action. */
  avoidSkillId?: string | null;
  avoidKind?: string | null;
  /** repeatedAction count from drama; >=2 enables stronger variety. */
  actionRepeatCount?: number;
  /** Observer-safe coarse estimate; omit only for legacy direct callers. */
  foeHpRatio?: number;
}): BattleAction {
  const myHp = hpRatio(input.self);
  const foeHp = input.foeHpRatio ?? hpRatio(input.foe);
  const selected = new Set(input.selectedIds);
  const active = input.policies.filter((p) => selected.has(p.id));
  const avoidSkillId = input.actionRepeatCount && input.actionRepeatCount >= 2
    ? input.avoidSkillId
    : null;
  const forceOffWait = input.avoidKind === "wait" &&
    (input.actionRepeatCount ?? 0) >= 2;

  const matching = active
    .filter((p) => ruleMatches(p, { turn: input.turn, myHp, foeHp }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const pick = (bias: PolicyBias): BattleAction => {
    let action = actionFromBias(
      forceOffWait && bias === "wait" ? "mixed" : bias,
      input.actorSide,
      input.self,
      input.skills,
      myHp,
      input.turn,
      avoidSkillId,
    );
    // Never answer a multi-wait streak with another wait when offense exists.
    if (
      forceOffWait &&
      action.kind === "wait"
    ) {
      action = actionFromBias(
        "attack",
        input.actorSide,
        input.self,
        input.skills,
        myHp,
        input.turn,
        avoidSkillId,
      );
    }
    return action;
  };

  if (matching.length > 0) {
    return pick(matching[0]!.bias ?? "mixed");
  }

  // Soft fallback: any always rules, then legacy stance
  const always = active
    .filter((p) => p.triggers?.always || Object.keys(p.triggers ?? {}).length === 0)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (always.length > 0) {
    return pick(always[0]!.bias ?? "mixed");
  }

  return chooseActionFromStance({
    stance: input.legacyStance ?? "balanced",
    actorSide: input.actorSide,
    self: input.self,
    foe: input.foe,
    skills: input.skills,
    turn: input.turn,
    foeHpRatio: foeHp,
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
  /** Observer-safe coarse estimate; omit only for legacy direct callers. */
  foeHpRatio?: number;
}): BattleAction {
  const { stance, actorSide, self, skills, turn } = input;
  const myHp = hpRatio(self);
  const foeHp = input.foeHpRatio ?? hpRatio(input.foe);

  switch (stance) {
    case "aggressive":
      return actionFromBias(
        myHp < 0.2 ? "defend" : "attack",
        actorSide,
        self,
        skills,
        myHp,
        turn,
      );
    case "defensive":
      if (myHp < 0.55) return actionFromBias("defend", actorSide, self, skills, myHp, turn);
      if (foeHp < 0.35 || turn % 3 === 0) {
        return actionFromBias("attack", actorSide, self, skills, myHp, turn);
      }
      return actionFromBias("defend", actorSide, self, skills, myHp, turn);
    case "opportunistic":
      if (turn <= 2) return actionFromBias(turn === 1 ? "wait" : "defend", actorSide, self, skills, myHp, turn);
      if (foeHp < 0.5 || myHp > 0.7) {
        return actionFromBias("attack", actorSide, self, skills, myHp, turn);
      }
      return actionFromBias("mixed", actorSide, self, skills, myHp, turn);
    case "balanced":
    default:
      return actionFromBias("mixed", actorSide, self, skills, myHp, turn);
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

/** Stable 0..n-1 pick from action/skill text so templates vary without RNG. */
function varietyIndex(seed: string, modulo: number): number {
  if (modulo <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % modulo;
}

/** Abstract HP-hit prose: finishing blows are explicitly marked for narration. */
function hitSummary(input: {
  actorName: string;
  skillName: string;
  targetName: string;
  intensity?: TurnEvent["intensity"];
  finishing: boolean;
  varietySeed?: string;
}): string {
  const { actorName, skillName, targetName, intensity, finishing } = input;
  const seed = input.varietySeed ??
    `${actorName}|${skillName}|${targetName}|${intensity ?? "moderate"}`;
  if (finishing) {
    const templates = [
      `${actorName} の ${skillName} が ${targetName} をとどめとして捉えた——それが決め手となった。`,
      `${actorName} は ${skillName} をとどめの一手に変え、${targetName} の勢いを断ち切った。`,
      `${skillName} が ${targetName} の継戦を許さず、${actorName} が決め手を決めた。`,
    ];
    return templates[varietyIndex(seed, templates.length)]!;
  }
  const byIntensity: Record<string, string[]> = {
    critical: [
      `${actorName} の ${skillName} が ${targetName} を大きく揺るがした。`,
      `${skillName} が場の空気を割り、${targetName} の体勢が崩れる。`,
      `${actorName} は間を詰めて ${skillName} を通し、${targetName} を大きく揺さぶった。`,
    ],
    heavy: [
      `${actorName} の ${skillName} が ${targetName} を強く捉えた。`,
      `${targetName} は ${skillName} の勢いをまともに受け、一歩押し返される。`,
      `${actorName} の ${skillName} が角度を変え、${targetName} の守りを抉った。`,
    ],
    moderate: [
      `${actorName} の ${skillName} が ${targetName} を捉えた。`,
      `${actorName} は ${skillName} で流れを作り、${targetName} に応答を迫る。`,
      `${skillName} が交差し、${targetName} の間合いがわずかに乱れる。`,
    ],
    minor: [
      `${actorName} の ${skillName} が ${targetName} に軽く触れた。`,
      `${actorName} は ${skillName} で探りを入れ、${targetName} の反応を見る。`,
      `${skillName} が掠め、${targetName} は小さく体をさばいた。`,
    ],
  };
  const templates = byIntensity[intensity ?? "moderate"] ?? byIntensity.moderate!;
  return templates[varietyIndex(seed, templates.length)]!;
}

function applyHpDamage(
  target: CombatantState,
  amount: number,
  recordMechanicalAttempt: MechanicalAttemptRecorder,
): { actual: number; finishing: boolean } {
  const before = target.parameters.hp ?? 0;
  const delta = applyTrackedParameterDelta(
    target,
    { parameter: "hp", delta: -Math.max(0, amount) },
    recordMechanicalAttempt,
  );
  const after = target.parameters.hp ?? 0;
  return {
    actual: -delta,
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
export type ResolveTurnInput = {
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
  /** Persisted ADR-0001 plan selected before any action provider call. */
  temporalResolutionOverride?: BattleTemporalPlan;
  executionId?: string;
  /** Internal durable resume point used by resolveNextBattleTurnBucket. */
  engineContinuation?: BattleTurnEngineContinuation;
  /** Resolve only the next temporal bucket and return a continuation. */
  stopAfterNextBucket?: boolean;
  /** Prepare a durable continuation without resolving a temporal bucket. */
  prepareOnly?: boolean;
  /** Return a continuation after the selected buckets, including at finalize. */
  deferFinalize?: boolean;
};

type PreparedBattleTurnStart = {
  sideA: CombatantState;
  sideB: CombatantState;
  situation: Situation;
  events: TurnEvent[];
  mechanicalSpans: MechanicalResolutionSpan[];
  turn: number;
};

export type PreparedBattleTurnInitiative = {
  turn: number;
  sideA: CombatantState;
  sideB: CombatantState;
  situation: Situation;
  temporalResolution: BattleTemporalPlan;
};

export type PreparedSequentialBattleTurnInitiative = PreparedBattleTurnInitiative & {
  temporalResolution: Extract<BattleTemporalPlan, {
    rulesetId: "initiative-sequential-v2";
  }>;
};

/**
 * Materialize the exact committed mechanics visible at a durable bucket
 * boundary. Semantic/world state remains the caller's last committed snapshot
 * until the service reconciles this bucket; unresolved action placeholders are
 * never exposed through this helper.
 */
export function materializeBattleStateAtBucketBoundary(input: {
  state: BattleState;
  continuation: BattleTurnEngineContinuation;
}): BattleState {
  const continuation = BattleTurnEngineContinuationSchema.parse(input.continuation);
  return {
    ...input.state,
    turn: continuation.turn,
    sideA: structuredClone(continuation.sideA),
    sideB: structuredClone(continuation.sideB),
    situation: structuredClone(continuation.situation),
    finisherA: continuation.finisherA
      ? structuredClone(continuation.finisherA)
      : input.state.finisherA,
    finisherB: continuation.finisherB
      ? structuredClone(continuation.finisherB)
      : input.state.finisherB,
    latestTemporalResolution: structuredClone(continuation.temporalResolution),
  };
}

/** Only already-executed actions may enter a bucket observer projection. */
export function committedActionsAtBucketBoundary(
  continuation: BattleTurnEngineContinuation,
): ResolvedBattleAction[] {
  return BattleTurnEngineContinuationSchema.parse(continuation).actions
    .filter((action) => action.executed)
    .map((action) => structuredClone(action));
}

/** Deterministically applies the once-per-turn setup before initiative. */
function prepareBattleTurnStart(input: ResolveTurnInput): PreparedBattleTurnStart {
  const sideA = cloneCombatant(input.state.sideA);
  const sideB = cloneCombatant(input.state.sideB);
  sideA.defending = false;
  sideB.defending = false;

  const bfBase = input.state.battlefield?.coefficients;
  const situation = applySituationCoefficients(
    input.state.situation,
    input.situationUpdate,
    bfBase,
  );
  const events: TurnEvent[] = [];
  const mechanicalSpans: MechanicalResolutionSpan[] = [];
  const turn = input.state.turn + 1;

  if (turn > 1) {
    for (const [combatant, actorSide] of [
      [sideA, "a"],
      [sideB, "b"],
    ] as const) {
      const beforeA = parametersSnapshot(sideA);
      const beforeB = parametersSnapshot(sideB);
      const eventStart = events.length;
      const restored = restoreTowardBase(combatant);
      if (restored.length > 0) {
        events.push({
          type: "status",
          actorName: combatant.displayName,
          actorSide,
          targetSides: [actorSide],
          summary: `${combatant.displayName} の変化した状態が、本来の調子へ少し戻った。`,
        });
        mechanicalSpans.push(mechanicalResolutionSpan({
          beforeA,
          beforeB,
          sideA,
          sideB,
          eventStart,
          eventEnd: events.length,
        }));
      }
    }
  }

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

  if (input.preEvents?.length) events.push(...input.preEvents);
  if (input.envHits?.length) {
    applyEnvHits(sideA, sideB, input.envHits, events, mechanicalSpans);
  }

  return { sideA, sideB, situation, events, mechanicalSpans, turn };
}

function buildPreparedTemporalResolution(input: {
  state: BattleState;
  sideA: CombatantState;
  sideB: CombatantState;
  situation: Situation;
}): BattleTemporalPlan {
  const causalSituationA = applyBattleCausalCoefficients({
    situation: input.situation,
    worldState: input.state.worldState,
    actorSide: "a",
    targetSide: "b",
  });
  const causalSituationB = applyBattleCausalCoefficients({
    situation: input.situation,
    worldState: input.state.worldState,
    actorSide: "b",
    targetSide: "a",
  });
  return buildBattleTemporalPlan({
    effectiveSpeedA: (input.sideA.parameters.spd ?? 0) *
      coeff(causalSituationA, "spd"),
    effectiveSpeedB: (input.sideB.parameters.spd ?? 0) *
      coeff(causalSituationB, "spd"),
  });
}

/**
 * Produces the committed turn-start snapshot and initiative buckets without
 * mutating the persisted battle state or selecting either combatant's action.
 */
export function prepareBattleTurnInitiative(
  input: ResolveTurnInput,
): PreparedBattleTurnInitiative | null {
  if (
    input.state.status !== "active" ||
    input.state.prologuePending ||
    input.state.aftermathPending
  ) {
    return null;
  }
  const prepared = prepareBattleTurnStart(input);
  return {
    turn: prepared.turn,
    sideA: prepared.sideA,
    sideB: prepared.sideB,
    situation: prepared.situation,
    temporalResolution: buildPreparedTemporalResolution({
      state: input.state,
      sideA: prepared.sideA,
      sideB: prepared.sideB,
      situation: prepared.situation,
    }),
  };
}

function previousResolvedInitiativeOrder(
  state: BattleState,
): [BattleTemporalSide, BattleTemporalSide] | null {
  const order = state.latestTemporalResolution?.buckets.flatMap(
    (bucket) => bucket.actorSides,
  );
  return order?.length === 2 && order[0] !== order[1]
    ? [order[0]!, order[1]!]
    : null;
}

/** Prepares ADR-0001 ordering for persistence before any action provider call. */
export function prepareSequentialBattleTurnInitiative(
  input: ResolveTurnInput & {
    tieDrawSample?: number;
    redrawWeights?: { a: number; b: number } | null;
  },
): PreparedSequentialBattleTurnInitiative | null {
  if (
    input.state.status !== "active" ||
    input.state.prologuePending ||
    input.state.aftermathPending
  ) {
    return null;
  }
  const prepared = prepareBattleTurnStart(input);
  const causalSituationA = applyBattleCausalCoefficients({
    situation: prepared.situation,
    worldState: input.state.worldState,
    actorSide: "a",
    targetSide: "b",
  });
  const causalSituationB = applyBattleCausalCoefficients({
    situation: prepared.situation,
    worldState: input.state.worldState,
    actorSide: "b",
    targetSide: "a",
  });
  const initiativeOrder = selectSequentialInitiativeOrder({
    effectiveSpeedA: (prepared.sideA.parameters.spd ?? 0) *
      coeff(causalSituationA, "spd"),
    effectiveSpeedB: (prepared.sideB.parameters.spd ?? 0) *
      coeff(causalSituationB, "spd"),
    previousOrder: previousResolvedInitiativeOrder(input.state),
    redrawWeights: input.redrawWeights,
    drawSample: input.tieDrawSample,
  });
  const temporalResolution = buildSequentialBattleTemporalPlan(initiativeOrder);
  if (temporalResolution.rulesetId !== "initiative-sequential-v2") {
    throw new Error("sequential initiative preparation produced a legacy plan");
  }
  return {
    turn: prepared.turn,
    sideA: prepared.sideA,
    sideB: prepared.sideB,
    situation: prepared.situation,
    temporalResolution,
  };
}

export function resolveTurn(input: ResolveTurnInput): {
  state: BattleState;
  events: TurnEvent[];
  actions: ResolvedBattleAction[];
  mechanicalEvidence: CommittedMechanicalEvidence[];
  bucketCommits?: BattleBucketMechanicalCommit[];
  engineContinuation?: BattleTurnEngineContinuation;
} {
  if (input.state.status !== "active") {
    return {
      state: input.state,
      events: [],
      actions: [],
      mechanicalEvidence: [],
    };
  }
  // Prologue / aftermath are resolved outside the combat engine (LLM beats).
  if (input.state.prologuePending || input.state.aftermathPending) {
    return {
      state: input.state,
      events: [],
      actions: [],
      mechanicalEvidence: [],
    };
  }

  const resumed = input.engineContinuation
    ? BattleTurnEngineContinuationSchema.parse(input.engineContinuation)
    : null;
  const prepared = resumed ? null : prepareBattleTurnStart(input);
  let sideA = cloneCombatant(resumed?.sideA ?? prepared!.sideA);
  let sideB = cloneCombatant(resumed?.sideB ?? prepared!.sideB);
  const situation = resumed?.situation ?? prepared!.situation;
  const events = resumed ? [...resumed.events] : prepared!.events;
  const mechanicalSpans = resumed ? [] : prepared!.mechanicalSpans;
  const accumulatedMechanicalEvidence = resumed?.mechanicalEvidence ?? [];
  const turn = resumed?.turn ?? prepared!.turn;
  let finisherA = resumed?.finisherA ??
    normalizeFinisher(input.state.finisherA, input.sideASkills);
  let finisherB = resumed?.finisherB ??
    normalizeFinisher(input.state.finisherB, input.sideBSkills);

  const forceOffense = (input.state.supervisor?.passiveTurns ?? 0) >= 2;
  if (!resumed && forceOffense) {
    events.push({
      type: "status",
      summary: "膠着打破 — 両者は間合いを捨て、強制的に打ち合いへ踏み込む。",
    });
  }

  const drama = normalizeDramaState(input.state.dramaState);
  const avoidA = parseActionSignature(drama.lastActionSignatureA);
  const avoidB = parseActionSignature(drama.lastActionSignatureB);
  const varietyA = drama.repeatedActionA >= 2;
  const varietyB = drama.repeatedActionB >= 2;

  const plannedActionA = input.state.plannedActionA;
  const plannedActionB = input.state.plannedActionB;

  const intentMatchesAvoid = (
    action: CharacterActionIntent | undefined,
    avoid: ReturnType<typeof parseActionSignature>,
    requireVariety: boolean,
  ): boolean => {
    if (!requireVariety || !action || !avoid) return false;
    if (avoid.skillId) return action.kind === "skill" && action.skillId === avoid.skillId;
    return action.kind === avoid.kind;
  };

  const policyA = () =>
    forceOffense
      ? { actorSide: "a" as const, kind: "basic_attack" as const }
      : chooseActionFromPolicies({
          policies: input.state.policiesA ?? [],
          selectedIds: input.state.selectedPolicyIdsA ?? [],
          actorSide: "a",
          self: sideA,
          foe: sideB,
          skills: input.sideASkills,
          turn,
          legacyStance: input.state.stanceA ?? "balanced",
          avoidSkillId: varietyA ? avoidA?.skillId : null,
          avoidKind: varietyA ? avoidA?.kind : null,
          actionRepeatCount: drama.repeatedActionA,
          foeHpRatio: observerSafeFoeHpRatio(input.state.perceptionFrameA, sideB),
        });
  const policyB = () =>
    forceOffense
      ? { actorSide: "b" as const, kind: "basic_attack" as const }
      : chooseActionFromPolicies({
          policies: input.state.policiesB ?? [],
          selectedIds: input.state.selectedPolicyIdsB ?? [],
          actorSide: "b",
          self: sideB,
          foe: sideA,
          skills: input.sideBSkills,
          turn,
          legacyStance: input.state.stanceB ?? "balanced",
          avoidSkillId: varietyB ? avoidB?.skillId : null,
          avoidKind: varietyB ? avoidB?.kind : null,
          actionRepeatCount: drama.repeatedActionB,
          foeHpRatio: observerSafeFoeHpRatio(input.state.perceptionFrameB, sideA),
        });

  const requestedActionA = input.playerAction ??
    (intentMatchesAvoid(plannedActionA, avoidA, varietyA)
      ? policyA()
      : plannedActionA
        ? { actorSide: "a" as const, ...plannedActionA }
        : policyA());

  const requestedActionB: BattleAction =
    intentMatchesAvoid(plannedActionB, avoidB, varietyB)
      ? policyB()
      : plannedActionB
        ? { actorSide: "b", ...plannedActionB }
        : policyB();
  const actionAId = `turn-${turn}-action-a`;
  const actionBId = `turn-${turn}-action-b`;
  const requestedActions = {
    a: requestedActionA,
    b: requestedActionB,
  } as const;
  const actionIds = { a: actionAId, b: actionBId } as const;
  const causalSituations = {
    a: applyBattleCausalCoefficients({
      situation,
      worldState: input.state.worldState,
      actorSide: "a",
      targetSide: "b",
    }),
    b: applyBattleCausalCoefficients({
      situation,
      worldState: input.state.worldState,
      actorSide: "b",
      targetSide: "a",
    }),
  } as const;
  const defensiveInstrumentMultipliers: Record<BattleTemporalSide, number> = resumed
    ? { ...resumed.defensiveInstrumentMultipliers }
    : { a: 1, b: 1 };
  const temporalResolution = resumed?.temporalResolution ??
    input.temporalResolutionOverride ??
    buildPreparedTemporalResolution({
      state: input.state,
      sideA,
      sideB,
      situation,
    });
  if (input.temporalResolutionOverride && !resumed) {
    const expectedScores = buildPreparedTemporalResolution({
      state: input.state,
      sideA,
      sideB,
      situation,
    }).initiativeScores;
    if (
      temporalResolution.initiativeScores.a !== expectedScores.a ||
      temporalResolution.initiativeScores.b !== expectedScores.b
    ) {
      throw new Error("temporal resolution override does not match prepared initiative");
    }
  }
  const actions: ResolvedBattleAction[] = resumed
    ? [...resumed.actions]
    : [
    {
      ...requestedActionA,
      id: actionAId,
      executed: false,
      skippedReason: "incapacitated_before_action",
      resolution: {
        requested: intentFromBattleAction(requestedActionA),
        outcome: "failed",
        reason: "actor_unavailable",
      },
    },
    {
      ...requestedActionB,
      id: actionBId,
      executed: false,
      skippedReason: "incapacitated_before_action",
      resolution: {
        requested: intentFromBattleAction(requestedActionB),
        outcome: "failed",
        reason: "actor_unavailable",
      },
    },
      ];
  const bucketCommits: BattleBucketMechanicalCommit[] = [];

  const sideIndex = (side: BattleTemporalSide) => side === "a" ? 0 : 1;
  const skillsFor = (side: BattleTemporalSide) =>
    side === "a" ? input.sideASkills : input.sideBSkills;
  const basicAttackFor = (side: BattleTemporalSide) =>
    balanceBasicAttack(
      side === "a"
        ? input.sideABasicAttack ?? defaultBasicAttack()
        : input.sideBBasicAttack ?? defaultBasicAttack(),
    );
  const finisherFor = (side: BattleTemporalSide) =>
    side === "a" ? finisherA : finisherB;
  const perceptionFor = (side: BattleTemporalSide) =>
    side === "a"
      ? input.state.perceptionFrameA
      : input.state.perceptionFrameB;
  const updateFinisher = (side: BattleTemporalSide, used: boolean) => {
    if (!used) return;
    if (side === "a" && finisherA) {
      finisherA = { ...finisherA, used: true, usedTurn: turn };
    }
    if (side === "b" && finisherB) {
      finisherB = { ...finisherB, used: true, usedTurn: turn };
    }
  };
  const revalidate = (
    side: BattleTemporalSide,
    currentA: CombatantState,
    currentB: CombatantState,
  ) => revalidateCharacterAction({
    actorSide: side,
    requested: intentFromBattleAction(requestedActions[side]),
    actor: side === "a" ? currentA : currentB,
    skills: skillsFor(side),
    basicAttack: basicAttackFor(side),
    finisher: finisherFor(side),
    turn,
    worldState: input.state.worldState,
    perception: perceptionFor(side),
  });
  const setResolvedAction = (
    side: BattleTemporalSide,
    result: ReturnType<typeof revalidateCharacterAction>,
  ) => {
    const effective = result.action;
    actions[sideIndex(side)] = {
      ...(effective ?? requestedActions[side]),
      id: actionIds[side],
      executed: effective !== null,
      skippedReason: effective ? null : "action_infeasible",
      resolution: result.resolution,
    };
  };
  const executeAction = (inputAction: {
    side: BattleTemporalSide;
    effectiveAction: BattleAction | null;
    currentA: CombatantState;
    currentB: CombatantState;
    targetEvents: TurnEvent[];
    attempts: MechanicalAttempt[];
  }): boolean => {
    const actor = inputAction.side === "a"
      ? inputAction.currentA
      : inputAction.currentB;
    const target = inputAction.side === "a"
      ? inputAction.currentB
      : inputAction.currentA;
    if (!inputAction.effectiveAction) {
      inputAction.targetEvents.push({
        type: "info",
        actorName: actor.displayName,
        actorSide: inputAction.side,
        summary: `${actor.displayName} は意図した行動を成立させられなかった。`,
      });
      return false;
    }
    const damageBand = instrumentBand({
      worldState: input.state.worldState,
      actorSide: inputAction.side,
      action: inputAction.effectiveAction,
      channel: "damage",
    });
    const targetSide = inputAction.side === "a" ? "b" : "a";
    const baseSituation = causalSituations[inputAction.side];
    const actionSituation: Situation = {
      ...baseSituation,
      coefficients: {
        ...baseSituation.coefficients,
        damage: clampCoefficient(
          (baseSituation.coefficients.damage ?? 1) *
            INSTRUMENT_MULTIPLIER[damageBand] *
            defensiveInstrumentMultipliers[targetSide] *
            repetitionEffectMultiplier({
              repeatCount: repeatedActionCount({
                side: inputAction.side,
                action: inputAction.effectiveAction,
                drama,
              }),
            }),
        ),
      },
    };
    return applyAction(
      actor,
      target,
      inputAction.effectiveAction,
      skillsFor(inputAction.side),
      basicAttackFor(inputAction.side),
      actionSituation,
      inputAction.targetEvents,
      createMechanicalAttemptRecorder(
        inputAction.currentA,
        inputAction.currentB,
        inputAction.attempts,
      ),
      {
        battleId: input.state.id,
        turn,
        turnLimit: input.state.turnLimit,
        actorSide: inputAction.side,
      },
      finisherFor(inputAction.side),
      repeatedActionCount({
        side: inputAction.side,
        action: inputAction.effectiveAction,
        drama,
      }),
    );
  };
  const tagFor = (
    targetEvents: TurnEvent[],
    side: BattleTemporalSide,
    currentA: CombatantState,
    currentB: CombatantState,
  ) => {
    const actor = side === "a" ? currentA : currentB;
    const target = side === "a" ? currentB : currentA;
    tagActionEvents(targetEvents, 0, {
      actionId: actionIds[side],
      actorSide: side,
      targetSide: side === "a" ? "b" : "a",
      actorName: actor.displayName,
      targetName: target.displayName,
    });
  };

  const resolveTemporalBucket = (bucket: BattleTemporalBucket): void => {
    if (bucket.simultaneous) {
      const bucketStartA = cloneCombatant(sideA);
      const bucketStartB = cloneCombatant(sideB);
      const proposals: Array<{
        side: BattleTemporalSide;
        sideA: CombatantState;
        sideB: CombatantState;
        attempts: MechanicalAttempt[];
        events: TurnEvent[];
        usedFinisher: boolean;
      }> = [];
      const effectiveBySide: Partial<Record<BattleTemporalSide, BattleAction>> = {};
      if (!isCombatantDown(bucketStartA) && !isCombatantDown(bucketStartB)) {
        for (const side of bucket.actorSides) {
          const result = revalidate(side, bucketStartA, bucketStartB);
          setResolvedAction(side, result);
          if (result.action) effectiveBySide[side] = result.action;
        }
      }
      const defends = (side: BattleTemporalSide): boolean => {
        const action = effectiveBySide[side];
        if (!action) return false;
        if (action.kind === "defend") return true;
        return action.kind === "skill" &&
          skillsFor(side).find((skill) => skill.id === action.skillId)?.kind === "defend";
      };
      for (const side of bucket.actorSides) {
        if (!defends(side)) continue;
        const band = instrumentBand({
          worldState: input.state.worldState,
          actorSide: side,
          action: effectiveBySide[side],
          channel: "defense",
        });
        defensiveInstrumentMultipliers[side] = band === "moderate"
          ? 0.82
          : band === "minor"
            ? 0.9
            : 1;
      }
      for (const side of bucket.actorSides) {
        if (!effectiveBySide[side] && actions[sideIndex(side)].skippedReason !== "action_infeasible") {
          continue;
        }
        const proposalA = cloneCombatant(bucketStartA);
        const proposalB = cloneCombatant(bucketStartB);
        proposalA.defending = defends("a");
        proposalB.defending = defends("b");
        const proposalEvents: TurnEvent[] = [];
        const attempts: MechanicalAttempt[] = [];
        const usedFinisher = executeAction({
          side,
          effectiveAction: effectiveBySide[side] ?? null,
          currentA: proposalA,
          currentB: proposalB,
          targetEvents: proposalEvents,
          attempts,
        });
        tagFor(proposalEvents, side, proposalA, proposalB);
        proposals.push({
          side,
          sideA: proposalA,
          sideB: proposalB,
          attempts,
          events: proposalEvents,
          usedFinisher,
        });
      }
      sideA = cloneCombatant(bucketStartA);
      sideB = cloneCombatant(bucketStartB);
      sideA.defending = defends("a");
      sideB.defending = defends("b");
      applyAtomicMechanicalAttempts(sideA, sideB, proposals.flatMap((item) => item.attempts));
      // Cooldown stamps live on combatants, not parameter attempts — merge from
      // each simultaneous proposal after the shared mechanical apply.
      mergeSkillLastUsedTurn(sideA, proposals.map((item) => item.sideA));
      mergeSkillLastUsedTurn(sideB, proposals.map((item) => item.sideB));
      for (const proposal of proposals) {
        const eventStart = events.length;
        events.push(...proposal.events);
        mechanicalSpans.push(mechanicalResolutionSpan({
          sourceActionId: actionIds[proposal.side],
          actorSide: proposal.side,
          beforeA: parametersSnapshot(bucketStartA),
          beforeB: parametersSnapshot(bucketStartB),
          sideA: proposal.sideA,
          sideB: proposal.sideB,
          attempts: proposal.attempts,
          eventStart,
          eventEnd: events.length,
        }));
        updateFinisher(proposal.side, proposal.usedFinisher);
      }
      return;
    }

    const side = bucket.actorSides[0]!;
    if (isCombatantDown(sideA) || isCombatantDown(sideB)) return;
    const result = revalidate(side, sideA, sideB);
    setResolvedAction(side, result);
    if (result.action?.kind === "defend") {
      const band = instrumentBand({
        worldState: input.state.worldState,
        actorSide: side,
        action: result.action,
        channel: "defense",
      });
      defensiveInstrumentMultipliers[side] = band === "moderate"
        ? 0.82
        : band === "minor"
          ? 0.9
          : 1;
    }
    const eventStart = events.length;
    const beforeA = parametersSnapshot(sideA);
    const beforeB = parametersSnapshot(sideB);
    const actionEvents: TurnEvent[] = [];
    const attempts: MechanicalAttempt[] = [];
    const usedFinisher = executeAction({
      side,
      effectiveAction: result.action,
      currentA: sideA,
      currentB: sideB,
      targetEvents: actionEvents,
      attempts,
    });
    tagFor(actionEvents, side, sideA, sideB);
    events.push(...actionEvents);
    updateFinisher(side, usedFinisher);
    mechanicalSpans.push(mechanicalResolutionSpan({
      sourceActionId: actionIds[side],
      actorSide: side,
      beforeA,
      beforeB,
      sideA,
      sideB,
      attempts,
      eventStart,
      eventEnd: events.length,
    }));
  };

  const firstBucketIndex = resumed?.nextBucketIndex ?? 0;
  const bucketsToResolve = input.prepareOnly
    ? []
    : input.stopAfterNextBucket
      ? temporalResolution.buckets.slice(firstBucketIndex, firstBucketIndex + 1)
      : temporalResolution.buckets.slice(firstBucketIndex);
  for (const bucket of bucketsToResolve) {
    const eventStart = events.length;
    const spanStart = mechanicalSpans.length;
    resolveTemporalBucket(bucket);
    const finalizedSoFar = events.map((event, index) => ({
      ...event,
      id: event.id ?? `turn-${turn}-event-${index + 1}`,
    }));
    bucketCommits.push({
      schemaVersion: 1,
      executionId: input.executionId ?? `${input.state.id}:turn:${turn}`,
      turn,
      bucketIndex: bucket.index,
      actorSides: [...bucket.actorSides],
      sideA: cloneCombatant(sideA),
      sideB: cloneCombatant(sideB),
      situation,
      finisherA: finisherA ?? null,
      finisherB: finisherB ?? null,
      actions: bucket.actorSides.map((side) => actions[sideIndex(side)]!),
      events: finalizedSoFar.slice(eventStart),
      mechanicalEvidence: committedMechanicalEvidence({
        turn,
        spans: mechanicalSpans.slice(spanStart),
        events: finalizedSoFar,
        evidenceOffset: accumulatedMechanicalEvidence.length +
          committedMechanicalEvidence({
            turn,
            spans: mechanicalSpans.slice(0, spanStart),
            events: finalizedSoFar,
          }).length,
      }),
      defensiveInstrumentMultipliers: { ...defensiveInstrumentMultipliers },
    });
  }

  const newMechanicalEvidence = committedMechanicalEvidence({
    turn,
    spans: mechanicalSpans,
    events: events.map((event, index) => ({
      ...event,
      id: event.id ?? `turn-${turn}-event-${index + 1}`,
    })),
    evidenceOffset: accumulatedMechanicalEvidence.length,
  });
  const mechanicalEvidence = CommittedMechanicalEvidenceSetSchema.parse([
    ...accumulatedMechanicalEvidence,
    ...newMechanicalEvidence,
  ]);
  const nextBucketIndex = firstBucketIndex + bucketsToResolve.length;
  if (
    input.prepareOnly ||
    (input.deferFinalize && (
      input.stopAfterNextBucket ||
      nextBucketIndex === temporalResolution.buckets.length
    )) ||
    (input.stopAfterNextBucket && nextBucketIndex < temporalResolution.buckets.length)
  ) {
    const engineContinuation = BattleTurnEngineContinuationSchema.parse({
      schemaVersion: 1,
      executionId: input.executionId ?? resumed?.executionId ??
        `${input.state.id}:turn:${turn}`,
      turn,
      temporalResolution,
      nextBucketIndex,
      sideA,
      sideB,
      situation,
      finisherA: finisherA ?? null,
      finisherB: finisherB ?? null,
      actions,
      events: events.map((event, index) => ({
        ...event,
        id: event.id ?? `turn-${turn}-event-${index + 1}`,
      })),
      mechanicalEvidence,
      defensiveInstrumentMultipliers,
    });
    return {
      state: input.state,
      events: engineContinuation.events,
      actions,
      mechanicalEvidence,
      bucketCommits,
      engineContinuation,
    };
  }

  // Incapacity flags
  if ((sideA.parameters.hp ?? 0) <= 0) {
    sideA.canFight = false;
    sideA.irreversibleIncapacitated = true;
    events.push({
      type: "status",
      actorName: sideA.displayName,
      actorSide: "a",
      targetSides: ["a"],
      summary: `${sideA.displayName} は戦闘不能に陥った。`,
    });
  }
  if ((sideB.parameters.hp ?? 0) <= 0) {
    sideB.canFight = false;
    sideB.irreversibleIncapacitated = true;
    events.push({
      type: "status",
      actorName: sideB.displayName,
      actorSide: "b",
      targetSides: ["b"],
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
    finisherA,
    finisherB,
    latestTemporalResolution: temporalResolution,
    plannedActionA: undefined,
    plannedActionB: undefined,
    updatedAt: nowIso(),
  };

  const finalizedEvents = events.map((event, index) => ({
    ...event,
    id: event.id ?? `turn-${turn}-event-${index + 1}`,
  }));
  return {
    state,
    events: finalizedEvents,
    actions,
    mechanicalEvidence,
    bucketCommits,
  };
}

/** Prepares turn-start state, actions, and ordering without resolving a bucket. */
export function prepareBattleTurnExecution(
  input: Omit<ResolveTurnInput, "engineContinuation" | "stopAfterNextBucket" | "prepareOnly" | "deferFinalize">,
): BattleTurnEngineContinuation | null {
  const prepared = resolveTurn({
    ...input,
    prepareOnly: true,
    deferFinalize: true,
  });
  return prepared.engineContinuation ?? null;
}

export type BattleTurnBucketExecutionResult = {
  continuation: BattleTurnEngineContinuation;
  commit: BattleBucketMechanicalCommit;
};

/** Resolves exactly one pending bucket and always stops before finalization. */
export function resolveBattleTurnBucket(
  input: Omit<ResolveTurnInput, "stopAfterNextBucket" | "prepareOnly" | "deferFinalize"> & {
    engineContinuation: BattleTurnEngineContinuation;
  },
): BattleTurnBucketExecutionResult {
  const continuation = BattleTurnEngineContinuationSchema.parse(
    input.engineContinuation,
  );
  if (continuation.nextBucketIndex >= continuation.temporalResolution.buckets.length) {
    throw new Error("battle turn continuation has no pending bucket");
  }
  const resolved = resolveTurn({
    ...input,
    stopAfterNextBucket: true,
    deferFinalize: true,
  });
  const next = resolved.engineContinuation;
  const commit = resolved.bucketCommits?.[0];
  if (!next || !commit) {
    throw new Error("battle turn bucket did not produce a continuation and commit");
  }
  return { continuation: next, commit };
}

/** Finalizes terminal flags and the BattleState after every bucket committed. */
export function finalizeBattleTurnExecution(
  input: Omit<ResolveTurnInput, "stopAfterNextBucket" | "prepareOnly" | "deferFinalize"> & {
    engineContinuation: BattleTurnEngineContinuation;
  },
): ReturnType<typeof resolveTurn> {
  const continuation = BattleTurnEngineContinuationSchema.parse(
    input.engineContinuation,
  );
  if (continuation.nextBucketIndex !== continuation.temporalResolution.buckets.length) {
    throw new Error("battle turn continuation still has pending buckets");
  }
  return resolveTurn(input);
}

/** Resolves exactly one bucket without replaying any committed predecessor. */
export function resolveNextBattleTurnBucket(
  input: Omit<ResolveTurnInput, "stopAfterNextBucket" | "prepareOnly" | "deferFinalize">,
): ReturnType<typeof resolveTurn> {
  const prepared = input.engineContinuation ?? prepareBattleTurnExecution(input);
  if (!prepared) {
    return resolveTurn(input);
  }
  const bucket = resolveBattleTurnBucket({
    ...input,
    engineContinuation: prepared,
  });
  if (
    bucket.continuation.nextBucketIndex <
      bucket.continuation.temporalResolution.buckets.length
  ) {
    return {
      state: input.state,
      events: bucket.continuation.events,
      actions: bucket.continuation.actions,
      mechanicalEvidence: bucket.continuation.mechanicalEvidence,
      bucketCommits: [bucket.commit],
      engineContinuation: bucket.continuation,
    };
  }
  const finalized = finalizeBattleTurnExecution({
    ...input,
    engineContinuation: bucket.continuation,
  });
  return {
    ...finalized,
    bucketCommits: [bucket.commit],
  };
}

function tagActionEvents(
  events: TurnEvent[],
  startIndex: number,
  input: {
    actionId: string;
    actorSide: "a" | "b";
    targetSide: "a" | "b";
    actorName: string;
    targetName: string;
  },
): void {
  for (const event of events.slice(startIndex)) {
    event.sourceActionId = input.actionId;
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
  if (
    repeatCount >= 2 &&
    ["basic_attack", "skill", "free_action", "reflect"].includes(action.kind)
  ) {
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

  if (action.kind === "reflect") {
    // Public observation is opaque; inner analysis is applied to agent memory after resolve.
    events.push({
      type: "reflect",
      actorName: actor.displayName,
      actorSide: action.actorSide,
      summary: `${actor.displayName} は一瞬動きを止め、何かを考え込んでいる。`,
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
