import {
  BattlePolicyOptionSchema,
  BattleAdjudicationSchema,
  accumulateBattleBalanceTrace,
  advanceSupervisorClock,
  applyBattleWorldTransition,
  applySituationCoefficients,
  applyTurnSemanticPatch,
  balanceSkill,
  buildBattleTurnRecord,
  buildBattleEncounterContext,
  applyBattleNarratorRecognitionUpdates,
  updateBattleNarratorContinuity,
  selectNarratorContinuityForFocus,
  buildFinisherWindow,
  buildObserverSafeAvailableActions,
  buildMinimalObserverPerception,
  buildCommittedUtteranceEvents,
  buildUtterancePerceptionEvidence,
  buildSemanticObservationState,
  buildServerOnlyReserveCues,
  createBattleState,
  deriveBattleWorldTransitionFromSemanticState,
  happeningToEvents,
  happeningToSituationPatch,
  isPassiveTurn,
  isQuietTurn,
  normalizeSupervisor,
  ratingForDisplay,
  resolveTurn,
  sheetCombatProfile,
  shouldInjectHappening,
  stanceLabel,
  summarizeSelectedPolicies,
  selectPolicyIdsByPerspective,
  toPublicInstance,
  toPublicPolicyOption,
  type BattlePolicyOption,
  type BattlePublic,
  type BattleStance,
  type BattleState,
  type BattleAdjudication,
  type BattleEncounterProposal,
  type BattleTurnRecord,
  type ResolvedBattleAction,
  type CharacterAgentState,
  type CharacterCognition,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type CharacterSheet,
  type CommittedMechanicalEvidence,
  type PerceptionEvidence,
  type TurnEvent,
  type TurnSemanticPatch,
  type Skill,
  toNarrationSnapshot,
  type HappeningPlan,
  type Situation,
  type BattleAdvanceStreamEvent,
  type InnerDigest,
  type NarrationFocus,
  type NarrationPerspective,
  type NarratorRecognitionUpdate,
  type RatingDisplayContext,
  buildInnerDigest,
  lockedFocusFromPerspective,
  needsFocusChoice,
  selectDigestsForFocus,
  defaultBasicAttack,
  buildCharacterSelfProfileAnchor,
  buildNarratorRenderingProfileAnchor,
  canonicalSelfReference,
  deriveBattleProfileStateOverrides,
  deriveBattleSceneStateFacts,
  narratorProfileAccessMode,
  selectNarratorRenderingProfileAnchors,
  advanceDramaState,
  dramaPhaseForTurn,
  dramaProgressionHint,
  normalizeDramaState,
  parseActionSignature,
  quantizeCommittedMechanicalEvidence,
  projectObserverPerception,
  type QuantizedMechanicalEvidence,
  type ServerOnlyReserveCue,
  type NarrationPerceptionView,
  buildNarrationIdentifierCatalog,
  buildNarrationPerceptionView,
  buildNarrationTurnView,
  composeNarratorTurn,
  narrationParticipantLabels,
  narratorRecognitionSubjects,
  perceivedCondition,
  repairNarrationIdentifierText,
  repairNarrativeBlockIdentifiers,
  coerceCharacterSpeech,
  coerceSpeakerDisplayLabel,
  isStageReaction,
  type NarrativeBlock,
  type SpeechLine,
} from "@kshiai/shared";
import {
  recordBattleFinished,
  recordSheetSnapshot,
} from "./balance-observe.js";
import { config } from "../config.js";
import { newId } from "../id.js";
import type { LlmProvider } from "../llm/index.js";
import type {
  AftermathNarrationResult,
  CharacterSpeechSource,
  JudgmentNarrationResult,
  NarrationActionBeat,
  NarrationResult,
  RefereeFinalState,
  RefereeResult,
  RefereeTurnFact,
} from "../llm/types.js";
import {
  buildPromptMechanicalEvidence,
  validateCommittedMechanicalEvidence,
  validateSensoryEvidence,
  type EvidenceValidationStatus,
} from "../llm/perception-evidence.js";
import * as battleRepo from "../repositories/battles.js";
import * as bfRepo from "../repositories/battlefields.js";
import * as charRepo from "../repositories/characters.js";
import * as styleRepo from "../repositories/narration-styles.js";
import { withBattleLease } from "./distributed-guard.js";
import {
  buildFreeActionCanonicalRoots,
  buildLatentAffordances,
  buildOpportunityChains,
  buildTacticalNeedFrame,
  commitFreeActionAdjudications,
  decisionProfileForSheet,
  prepareFreeActionsForTurn,
} from "./free-action-service.js";

export function toBattlePublic(
  state: BattleState,
  mySheet: CharacterSheet,
  resultSummary?: string | null,
  oppSheet?: CharacterSheet | null,
  ratingDisplay?: RatingDisplayContext,
): BattlePublic {
  const selected = new Set(state.selectedPolicyIdsA ?? []);
  const selectedPolicies = (state.policiesA ?? []).filter((p) =>
    selected.has(p.id),
  );

  const imgFor = (
    combatant: BattleState["sideA"],
    sheet: CharacterSheet | null | undefined,
  ) =>
    combatant.imageUrl ??
    (sheet && sheet.id === combatant.characterId
      ? (sheet.appearance?.imageUrl ?? null)
      : null);

  const sideASheet =
    mySheet.id === state.sideA.characterId ? mySheet : oppSheet;
  const sideBSheet =
    mySheet.id === state.sideB.characterId ? mySheet : oppSheet;

  return {
    id: state.id,
    status: state.status,
    turn: state.turn,
    turnLimit: state.turnLimit,
    sideA: {
      characterId: state.sideA.characterId,
      displayName: state.sideA.displayName,
      canFight: state.sideA.canFight,
      imageUrl: imgFor(state.sideA, sideASheet),
    },
    sideB: {
      characterId: state.sideB.characterId,
      displayName: state.sideB.displayName,
      canFight: state.sideB.canFight,
      imageUrl: imgFor(state.sideB, sideBSheet),
    },
    policies: selectedPolicies.map(toPublicPolicyOption),
    policySummary: summarizeSelectedPolicies(
      state.policiesA,
      state.selectedPolicyIdsA,
    ),
    opponentPolicySummary: summarizeSelectedPolicies(
      state.policiesB,
      state.selectedPolicyIdsB,
    ),
    stanceA: state.stanceA,
    stanceALabel: state.stanceA ? stanceLabel(state.stanceA) : undefined,
    stanceB: state.stanceB,
    stanceBLabel: state.stanceB ? stanceLabel(state.stanceB) : undefined,
    scene: state.situation.scene,
    situationNotes: state.situation.notes,
    battlefield: state.battlefield
      ? toPublicInstance(state.battlefield)
      : null,
    semanticState: state.observationStatePublic ?? null,
    log: state.log,
    availableActions: [],
    winnerSide: state.winnerSide,
    finishReason: state.finishReason,
    aftermathPending: Boolean(state.aftermathPending),
    prologuePending: Boolean(state.prologuePending),
    narrationStyleName: state.narrationStyle?.displayName,
    priorMatchSummary: state.priorMatchSummary ?? null,
    resultSummary: resultSummary ?? null,
    ratingSettlement: (() => {
      const s = state.ratingSettlement;
      if (!s?.applied) return null;
      const overall = s.overall ?? { sideA: s.sideA, sideB: s.sideB };
      const pub = s.public ?? null;
      const slim = (
        x: {
          before: number;
          after: number;
          delta: number;
          provisionalAfter: boolean;
        },
        population: RatingDisplayContext["public"] | undefined,
      ) => ({
        before: ratingForDisplay(x.before, population),
        after: ratingForDisplay(x.after, population),
        delta: x.delta,
        provisionalAfter: x.provisionalAfter,
      });
      return {
        applied: s.applied,
        ranked: s.ranked,
        sameOwner: s.sameOwner,
        overall: {
          sideA: slim(overall.sideA, ratingDisplay?.overall),
          sideB: slim(overall.sideB, ratingDisplay?.overall),
        },
        public: pub
          ? {
              sideA: slim(pub.sideA, ratingDisplay?.public),
              sideB: slim(pub.sideB, ratingDisplay?.public),
            }
          : null,
        sideA: slim(overall.sideA, ratingDisplay?.overall),
        sideB: slim(overall.sideB, ratingDisplay?.overall),
      };
    })(),
  };
}

export async function toBattlePublicForViewer(
  state: BattleState,
  mySheet: CharacterSheet,
  resultSummary?: string | null,
  oppSheet?: CharacterSheet | null,
): Promise<BattlePublic> {
  const ratingDisplay = state.ratingSettlement?.applied
    ? await charRepo.getRatingDisplayContext()
    : undefined;
  return toBattlePublic(
    state,
    mySheet,
    resultSummary,
    oppSheet,
    ratingDisplay,
  );
}

async function resolveBattlefieldInstance(input: {
  llm: LlmProvider;
  battlefieldPresetId?: string;
  battlefieldMode?: "random" | "preset";
  userId: string;
}): Promise<BattlefieldInstance> {
  const mode =
    input.battlefieldMode ?? (input.battlefieldPresetId ? "preset" : "random");

  if (mode === "preset" && input.battlefieldPresetId) {
    const preset = await bfRepo.getPreset(input.battlefieldPresetId);
    if (!preset) throw new Error("BATTLEFIELD_NOT_FOUND");
    if (!preset.isSystem && preset.ownerUserId !== input.userId) {
      throw new Error("BATTLEFIELD_FORBIDDEN");
    }
    return input.llm.concretizeBattlefield({ preset, random: false });
  }

  const seed = await bfRepo.pickRandomSystemPreset();
  return input.llm.concretizeBattlefield({
    preset: seed,
    random: true,
  });
}

function fieldHintFromPreset(preset: BattlefieldPreset | null): {
  displayName: string;
  category: string;
  terrain?: string;
  obstacles?: string[];
  conditions?: string[];
  narrativeBlurb?: string;
} {
  if (!preset) {
    return {
      displayName: "未定の戦場",
      category: "custom",
      narrativeBlurb: "試合直前に状況が決まる。",
    };
  }
  return {
    displayName: preset.displayName,
    category: preset.category,
    terrain: preset.terrainHints[0],
    obstacles: preset.obstacleHints,
    conditions: preset.conditionHints,
    narrativeBlurb: preset.narrativeBlurb,
  };
}

function charPublicCtx(sheet: CharacterSheet) {
  return {
    displayName: sheet.displayName,
    traits: sheet.traits,
    skillNames: sheet.skills.map((s) => s.name),
    narrativeBlurb: sheet.narrativeBlurb,
    weaponName: sheet.weapon?.name ?? null,
  };
}

export async function generateMatchPolicies(input: {
  userId: string;
  myCharacterId: string;
  opponentCharacterId?: string;
  battlefieldPresetId?: string;
  battlefieldMode?: "random" | "preset";
  llm: LlmProvider;
}): Promise<{
  options: ReturnType<typeof toPublicPolicyOption>[];
  /** Full options for createBattle (includes engine fields). */
  engineOptions: BattlePolicyOption[];
  defaultSelectedIds: string[];
  rationale: string;
  fieldHint: string;
}> {
  const mine = await charRepo.getSheet(input.myCharacterId);
  if (!mine || mine.ownerUserId !== input.userId) {
    throw new Error("MY_CHARACTER_NOT_FOUND");
  }
  const foe = input.opponentCharacterId
    ? await charRepo.getSheet(input.opponentCharacterId)
    : null;

  let fieldPreset: BattlefieldPreset | null = null;
  if (input.battlefieldMode === "preset" && input.battlefieldPresetId) {
    fieldPreset = await bfRepo.getPreset(input.battlefieldPresetId);
  } else if (input.battlefieldPresetId) {
    fieldPreset = await bfRepo.getPreset(input.battlefieldPresetId);
  } else {
    fieldPreset = await bfRepo.pickRandomSystemPreset();
  }

  const field = fieldHintFromPreset(fieldPreset);
  const gen = await input.llm.generateBattlePolicies({
    self: charPublicCtx(mine),
    foe: foe
      ? {
          displayName: foe.displayName,
          traits: foe.traits,
          narrativeBlurb: foe.narrativeBlurb,
        }
      : null,
    field,
  });

  const defaultSelectedIds = gen.options
    .filter((o) => o.defaultSelected)
    .map((o) => o.id);

  return {
    options: gen.options.map(toPublicPolicyOption),
    engineOptions: gen.options,
    defaultSelectedIds,
    rationale: gen.rationale,
    fieldHint: `${field.displayName}${field.narrativeBlurb ? ` — ${field.narrativeBlurb}` : ""}`,
  };
}

function normalizePolicies(
  raw: unknown[] | undefined,
): BattlePolicyOption[] {
  if (!raw?.length) return [];
  const out: BattlePolicyOption[] = [];
  for (const r of raw) {
    try {
      out.push(
        BattlePolicyOptionSchema.parse({
          ...(r as object),
          id: (r as { id?: string }).id ?? newId("pol"),
        }),
      );
    } catch (e) {
      // Skip malformed client/LLM policy rows rather than aborting match start
      console.warn(
        "[battle] skip bad policy",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return out;
}

export async function startBattle(input: {
  userId: string;
  myCharacterId: string;
  opponentCharacterId: string;
  battlefieldPresetId?: string;
  battlefieldMode?: "random" | "preset";
  stance?: BattleStance;
  policies?: unknown[];
  selectedPolicyIds?: string[];
  narrationStyleId?: string;
  llm: LlmProvider;
}): Promise<BattlePublic> {
  const mine = await charRepo.getSheet(input.myCharacterId);
  const opp = await charRepo.getSheet(input.opponentCharacterId);
  if (!mine || mine.ownerUserId !== input.userId) {
    throw new Error("MY_CHARACTER_NOT_FOUND");
  }
  if (!opp) throw new Error("OPPONENT_NOT_FOUND");
  if (mine.id === opp.id) throw new Error("SAME_CHARACTER");

  const battlefield = await resolveBattlefieldInstance({
    llm: input.llm,
    battlefieldPresetId: input.battlefieldPresetId,
    battlefieldMode: input.battlefieldMode,
    userId: input.userId,
  });

  // Tactical policy cards are no longer selected/generated at match setup.
  // Each isolated character agent chooses its own opening strategy at turn 0.
  const policiesA: BattlePolicyOption[] = [];
  const selectedPolicyIdsA: string[] = [];
  const policiesB: BattlePolicyOption[] = [];
  const selectedPolicyIdsB: string[] = [];

  const narrationStyle = await styleRepo.resolveNarrationStyleForUser(
    input.userId,
    input.narrationStyleId,
  );
  const narrationSnap = toNarrationSnapshot(narrationStyle);
  const priorMatchSummary = await battleRepo.findPriorMatchSummary(
    mine.id,
    opp.id,
  );
  let encounterProposal: BattleEncounterProposal | null = null;
  try {
    encounterProposal = await withTimeout(input.llm.prepareBattleEncounter({
      sideA: {
        displayName: mine.displayName,
        nicknames: mine.identity?.nicknames ?? [],
        selfNames: mine.identity?.selfNames ?? [],
        epithets: mine.identity?.epithets ?? [],
        traits: mine.traits,
        narrativeBlurb: mine.narrativeBlurb,
      },
      sideB: {
        displayName: opp.displayName,
        nicknames: opp.identity?.nicknames ?? [],
        selfNames: opp.identity?.selfNames ?? [],
        epithets: opp.identity?.epithets ?? [],
        traits: opp.traits,
        narrativeBlurb: opp.narrativeBlurb,
      },
      field: {
        displayName: battlefield.displayName,
        scene: battlefield.scene,
        terrain: battlefield.terrain,
        conditions: battlefield.conditions,
        narrativeSetup: battlefield.narrativeSetup,
      },
      priorMatchSummary,
    }), 12_000, "prepareBattleEncounter");
  } catch (error) {
    console.warn(
      "[battle] encounter proposal unavailable; using deterministic context",
      error instanceof Error ? error.message : error,
    );
  }
  const encounterContext = buildBattleEncounterContext({
    sideA: mine,
    sideB: opp,
    priorMatchSummary,
    proposal: encounterProposal,
  });

  const id = newId("btl");
  let state = createBattleState({
    id,
    sideA: mine,
    sideB: opp,
    turnLimit: config.battleTurnLimit,
    battlefield,
    stanceA: input.stance,
    policiesA,
    selectedPolicyIdsA,
    policiesB,
    selectedPolicyIdsB:
      selectedPolicyIdsB.length > 0
        ? selectedPolicyIdsB
        : selectPolicyIdsByPerspective(
            policiesB,
            policiesB.map((policy) => policy.id),
          ),
    narrationStyle: narrationSnap,
    priorMatchSummary,
    encounterContext,
  });

  state = {
    ...state,
    agentStateA: {
      ...(state.agentStateA as CharacterAgentState),
      privateMemory: mine.opponentMemories?.[opp.id]
        ? `この相手への過去方針: ${mine.opponentMemories[opp.id]!.preBattlePlan}\n過去の反省: ${mine.opponentMemories[opp.id]!.postBattleReflection}`
        : state.agentStateA?.privateMemory ?? "",
    },
    agentStateB: {
      ...(state.agentStateB as CharacterAgentState),
      privateMemory: opp.opponentMemories?.[mine.id]
        ? `この相手への過去方針: ${opp.opponentMemories[mine.id]!.preBattlePlan}\n過去の反省: ${opp.opponentMemories[mine.id]!.postBattleReflection}`
        : state.agentStateB?.privateMemory ?? "",
    },
    prologuePending: true,
    log: [],
    updatedAt: new Date().toISOString(),
  };

  await battleRepo.saveBattle(state, {
    sideAUserId: input.userId,
    sideACharacterId: mine.id,
    sideBCharacterId: opp.id,
  });

  return toBattlePublicForViewer(state, mine, null, opp);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timeout:${label}:${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Retry a timed operation a few times. Each attempt gets a fresh timeout so a
 * slow primary provider can fail and a routed secondary (or a second try) still
 * has budget — unlike a single outer race that expires mid-failover.
 */
async function withTimeoutAttempts<T>(
  factory: () => Promise<T>,
  opts: {
    timeoutMs: number;
    attempts: number;
    label: string;
    gapMs?: number;
  },
): Promise<T> {
  const attempts = Math.max(1, opts.attempts);
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await withTimeout(factory(), opts.timeoutMs, opts.label);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[battle] ${opts.label} attempt ${i + 1}/${attempts} failed: ${msg.slice(0, 160)}`,
      );
      if (i + 1 < attempts) {
        const gap = opts.gapMs ?? 350;
        if (gap > 0) {
          await new Promise((resolve) => setTimeout(resolve, gap));
        }
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? `${opts.label} failed`));
}

function initialAgentState(
  sheet: CharacterSheet,
  selfReference = sheet.identity?.selfNames[0] ?? null,
): CharacterAgentState {
  return {
    privateMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference,
    lastSpeech: null,
    lastActionResult: "",
    conversationHistory: [],
    interior: {
      primaryEmotion: "平静",
      concealedEmotion: null,
      unspokenIntent: "",
      currentConcern: "",
      attitudeTowardCounterpart: "対峙している",
      confidence: "steady",
      relationshipTension: "",
    },
  };
}

function groundCharacterAgentState(
  sheet: CharacterSheet,
  state: CharacterAgentState,
  preferredSelfReference?: string | null,
): CharacterAgentState {
  const canonical = canonicalSelfReference(buildCharacterSelfProfileAnchor(sheet));
  const permitted = sheet.identity?.selfNames ?? [];
  const selfReference = preferredSelfReference && permitted.includes(preferredSelfReference)
    ? preferredSelfReference
    : canonical;
  return {
    ...state,
    selfReference,
    conversationHistory: state.conversationHistory ?? [],
    lastActionResult: state.lastActionResult ?? "",
    interior: state.interior ?? {
      primaryEmotion: state.emotion || "平静",
      concealedEmotion: null,
      unspokenIntent: "",
      currentConcern: state.currentGoal,
      attitudeTowardCounterpart: "対峙している",
      confidence: "steady",
      relationshipTension: "",
    },
  };
}

function refreshNarratorContinuity(state: BattleState): BattleState {
  if (
    !state.encounterContext ||
    !state.perceptionFrameA ||
    !state.perceptionFrameB
  ) {
    return state;
  }
  return {
    ...state,
    narratorContinuity: updateBattleNarratorContinuity({
      turn: state.turn,
      encounter: state.encounterContext,
      frameA: state.perceptionFrameA,
      frameB: state.perceptionFrameB,
      agentStateA: state.agentStateA,
    …19784 tokens truncated…t.sideB.displayName
            : null;
      resultSummary = winner
        ? `${winner} の勝利。相手は戦闘を続けられなくなった。`
        : "相打ち — 両者とも戦闘不能となった。";
    }

    // Elo + W-L (same-owner matches unranked for Elo)
    const { settleBattleRating } = await import("./rating-service.js");
    next = await settleBattleRating(next);
    try {
      await recordBattleFinished({
        state: next,
        sameOwner: next.ratingSettlement?.sameOwner,
        ranked: next.ratingSettlement?.ranked,
        sideAProfile: sheetCombatProfile(mine),
        sideBProfile: sheetCombatProfile(opp),
      });
    } catch (e) {
      console.warn(
        "[balance] recordBattleFinished skipped",
        e instanceof Error ? e.message : e,
      );
    }
  }

  await battleRepo.saveBattle(next, {
    sideAUserId: meta.side_a_user_id,
    sideACharacterId: meta.side_a_character_id,
    sideBCharacterId: meta.side_b_character_id,
  });

  return toBattlePublicForViewer(next, mine, resultSummary, opp);
}

async function runPrologueTurn(input: {
  state: BattleState;
  meta: {
    side_a_user_id: string;
    side_a_character_id: string;
    side_b_character_id: string;
  };
  mine: CharacterSheet;
  opp: CharacterSheet;
  llm: LlmProvider;
  emit?: (event: BattleAdvanceStreamEvent) => void;
}): Promise<BattlePublic> {
  const emit = input.emit ?? (() => undefined);
  let state = input.state;
  const policyLine = summarizeSelectedPolicies(
    state.policiesA,
    state.selectedPolicyIdsA,
  );
  const perspective: NarrationPerspective =
    state.narrationStyle?.perspective ?? "external";
  const openEvents: TurnEvent[] = [
    {
      type: "situation",
      summary: `${state.situation.scene}で両者が対峙した。`,
    },
  ];
  emit({ type: "phase", phase: "agents" });
  const prologueAgents = await advanceCharacterAgents({
    llm: input.llm,
    before: state,
    after: state,
    mine: input.mine,
    opp: input.opp,
    events: openEvents,
    actions: [],
    phase: "prologue",
  });
  state = prologueAgents.state;
  const rec = (state.turnRecords ?? [])[(state.turnRecords ?? []).length - 1];
  const { focus, digests } = await resolveNarrationFocusAndDigests({
    llm: input.llm,
    perspective,
    turn: 0,
    scene: state.situation.scene,
    sideAName: state.sideA.displayName,
    sideBName: state.sideB.displayName,
    events: openEvents,
    agentStateA: state.agentStateA,
    agentStateB: state.agentStateB,
    cognitionA: rec?.cognitionA,
    cognitionB: rec?.cognitionB,
    perceptionFrameA: state.perceptionFrameA,
    perceptionFrameB: state.perceptionFrameB,
  });
  const characterSpeeches = buildNarratorCharacterSpeeches({
    state,
    sources: prologueAgents.characterSpeeches,
    events: rec?.events ?? openEvents,
    perspective,
    focus,
  });
  const prologuePerceptionView = narrationPerceptionViewForState({
    state,
    perspective,
    focus,
  });
  const narratorParticipantLabels = narratorParticipantLabelsForState({
    state,
    perspective,
    focus,
  });
  const identifierCatalog = narrationIdentifierCatalog({
    state,
    perspective,
    focus,
  });
  const profileAnchors = buildNarratorProfileAnchors({
    mine: input.mine,
    opp: input.opp,
    perspective,
    focus,
    state,
  });

  emit({ type: "phase", phase: "narrating" });
  let narrationResult: NarrationResult;
  try {
    narrationResult = await withTimeout(
      input.llm.narratePrologue({
        scene: state.situation.scene,
        sideAName: narratorParticipantLabels.a,
        sideBName: narratorParticipantLabels.b,
        sideABlurb: profileAnchors.a
          ? input.mine.narrativeBlurb
          : undefined,
        sideBBlurb: profileAnchors.b
          ? input.opp.narrativeBlurb
          : undefined,
        sideATraits: profileAnchors.a ? input.mine.traits : undefined,
        sideBTraits: profileAnchors.b ? input.opp.traits : undefined,
        policySummary: policyLine,
        priorMatchSummary: state.priorMatchSummary ?? undefined,
        battlefield: state.battlefield,
        innerDigests: digests,
        characterSpeeches,
        profileAnchors,
        sceneStateFacts: buildNarratorSceneStateFacts({
          state,
          mine: input.mine,
          opp: input.opp,
          perspective,
          focus,
        }),
        focus,
        perspective,
        narratorContinuity: state.narratorContinuity
          ? selectNarratorContinuityForFocus({
              continuity: state.narratorContinuity,
              focus,
            })
          : null,
        recognitionSubjects: prologuePerceptionView
          ? narratorRecognitionSubjects(prologuePerceptionView)
          : [],
        styleInstruction: state.narrationStyle?.instruction,
        styleName: state.narrationStyle?.displayName,
        onProgress: (progress) => {
          emit({
            type: "narrator",
            lines: progress.lines.map((line) =>
              repairNarrationIdentifierText(line, identifierCatalog)
            ),
            draft: progress.draft
              ? repairNarrationIdentifierText(progress.draft, identifierCatalog)
              : null,
            turn: 0,
          });
        },
      }),
      16_000,
      "narratePrologue",
    );
  } catch (e) {
    console.warn("[battle] narratePrologue failed", e);
    const place =
      state.battlefield?.displayName ?? state.situation.scene;
    narrationResult = {
      turn: 0,
      narrator: [
        "——開幕——",
        state.encounterContext?.openingSummary ??
          `${place}で ${state.sideA.displayName} と ${state.sideB.displayName} が対峙する。`,
        ...(state.narratorContinuity?.reader.disclosedTerms ?? []),
        state.battlefield?.narrativeSetup || state.situation.notes || "",
        state.priorMatchSummary
          ? `因縁 — ${state.priorMatchSummary}`
          : "",
        policyLine ? `${battleNarratorLabel(state, "a")} の方針: ${policyLine}` : "",
      ].filter(Boolean),
      speeches: characterSpeeches.map((speech) => ({
        sourceSide: speech.side,
        speaker: speech.displayLabel ?? speech.speaker,
        text: speech.text,
      })),
    };
    emit({
      type: "narrator",
      lines: narrationResult.narrator.map((line) =>
        repairNarrationIdentifierText(line, identifierCatalog)
      ),
      draft: null,
      turn: 0,
    });
  }
  state = applyNarratorRecognitionResult({
    state,
    view: prologuePerceptionView,
    turn: 0,
    updates: narrationResult.recognitionUpdates,
  });
  let narrative = publicNarrativeBlock(narrationResult);
  narrative = repairNarrativeBlockIdentifiers(narrative, identifierCatalog);
  if (
    narrative.narrator[0] &&
    !narrative.narrator[0].includes("開幕") &&
    !narrative.narrator[0].includes("プロローグ")
  ) {
    narrative = {
      ...narrative,
      narrator: ["——開幕——", ...narrative.narrator],
    };
  }
  const missingDisclosures = (state.narratorContinuity?.reader.disclosedTerms ?? [])
    .filter((term) => !narrative.narrator.some((line) =>
      normalizePublicText(line).includes(normalizePublicText(term))
    ));
  if (missingDisclosures.length > 0) {
    narrative = {
      ...narrative,
      narrator: [
        narrative.narrator[0] ?? "——開幕——",
        ...missingDisclosures,
        ...narrative.narrator.slice(1),
      ],
    };
  }
  narrative.speeches = finalizeCharacterSpeeches({
    narrative,
    sources: characterSpeeches,
  });

  if (narrative.speeches.length) {
    emit({ type: "speeches", speeches: narrative.speeches });
  }
  emit({ type: "phase", phase: "finalizing" });

  const next: BattleState = {
    ...state,
    openingPlanA: state.agentStateA?.currentGoal?.slice(0, 1200),
    openingPlanB: state.agentStateB?.currentGoal?.slice(0, 1200),
    turn: 0,
    prologuePending: false,
    log: [...state.log, narrative],
    updatedAt: new Date().toISOString(),
  };

  await battleRepo.saveBattle(next, {
    sideAUserId: input.meta.side_a_user_id,
    sideACharacterId: input.meta.side_a_character_id,
    sideBCharacterId: input.meta.side_b_character_id,
  });

  return toBattlePublicForViewer(next, input.mine, null, input.opp);
}

async function runAftermathTurn(input: {
  state: BattleState;
  meta: {
    side_a_user_id: string;
    side_a_character_id: string;
    side_b_character_id: string;
  };
  mine: CharacterSheet;
  opp: CharacterSheet;
  llm: LlmProvider;
  emit?: (event: BattleAdvanceStreamEvent) => void;
}): Promise<BattlePublic> {
  const emit = input.emit ?? (() => undefined);
  let state = input.state;
  const terminalRecord = (state.turnRecords ?? []).at(-1);
  emit({ type: "phase", phase: "agents" });
  const aftermathAgents = await advanceCharacterAgents({
    llm: input.llm,
    before: state,
    after: state,
    mine: input.mine,
    opp: input.opp,
    events: terminalRecord?.events ?? [],
    actions: terminalRecord?.actions ?? [],
    phase: "aftermath",
    replaceLastRecord: Boolean(terminalRecord),
  });
  state = aftermathAgents.state;
  const fallen: string[] = [];
  if (!state.sideA.canFight || (state.sideA.parameters.hp ?? 0) <= 0) {
    fallen.push(state.sideA.displayName);
  }
  if (!state.sideB.canFight || (state.sideB.parameters.hp ?? 0) <= 0) {
    fallen.push(state.sideB.displayName);
  }
  const winnerName =
    state.winnerSide === "a"
      ? state.sideA.displayName
      : state.winnerSide === "b"
        ? state.sideB.displayName
        : null;

  const aftermathTurn = state.turn; // epilogue shares the KO turn number for log grouping
  const perspective: NarrationPerspective =
    state.narrationStyle?.perspective ?? "external";
  const rec = (state.turnRecords ?? [])[(state.turnRecords ?? []).length - 1];
  const { focus, digests } = await resolveNarrationFocusAndDigests({
    llm: input.llm,
    perspective,
    turn: aftermathTurn,
    scene: state.situation.scene,
    sideAName: state.sideA.displayName,
    sideBName: state.sideB.displayName,
    events: rec?.events ?? [],
    agentStateA: state.agentStateA,
    agentStateB: state.agentStateB,
    cognitionA: rec?.cognitionA,
    cognitionB: rec?.cognitionB,
    perceptionFrameA: state.perceptionFrameA,
    perceptionFrameB: state.perceptionFrameB,
  });
  const characterSpeeches = buildNarratorCharacterSpeeches({
    state,
    sources: aftermathAgents.characterSpeeches,
    events: rec?.events ?? [],
    perspective,
    focus,
  });
  const aftermathPerceptionView = narrationPerceptionViewForState({
    state,
    perspective,
    focus,
  });
  const narratorParticipantLabels = aftermathPerceptionView
    ? narrationParticipantLabels(aftermathPerceptionView)
    : {
        a: battleNarratorLabel(state, "a"),
        b: battleNarratorLabel(state, "b"),
      };
  const narratorWinnerName = state.winnerSide === "a" || state.winnerSide === "b"
    ? narratorParticipantLabels[state.winnerSide]
    : null;
  const narratorFallenNames = [
    ...(!state.sideA.canFight || (state.sideA.parameters.hp ?? 0) <= 0
      ? [narratorParticipantLabels.a]
      : []),
    ...(!state.sideB.canFight || (state.sideB.parameters.hp ?? 0) <= 0
      ? [narratorParticipantLabels.b]
      : []),
  ];
  const identifierCatalog = narrationIdentifierCatalog({
    state,
    perspective,
    focus,
  });
  emit({ type: "phase", phase: "narrating" });
  let presentation: AftermathNarrationResult | undefined;
  try {
    presentation = await withTimeout(
      input.llm.narrateAftermath({
        turn: aftermathTurn,
        scene: state.situation.scene,
        sideAName: narratorParticipantLabels.a,
        sideBName: narratorParticipantLabels.b,
        winnerSide: state.winnerSide,
        winnerName: narratorWinnerName,
        fallenNames: narratorFallenNames,
        battlefield: state.battlefield,
        recentNarration: aftermathPerceptionView?.mode === "self" ||
            aftermathPerceptionView?.mode === "opponent"
          ? []
          : state.log
              .slice(-2)
              .flatMap((b) => b.narrator)
              .slice(-8),
        innerDigests: digests,
        characterSpeeches,
        profileAnchors: buildNarratorProfileAnchors({
          mine: input.mine,
          opp: input.opp,
          perspective,
          focus,
          state,
        }),
        sceneStateFacts: buildNarratorSceneStateFacts({
          state,
          mine: input.mine,
          opp: input.opp,
          perspective,
          focus,
        }),
        focus,
        perspective,
        narratorContinuity: state.narratorContinuity
          ? selectNarratorContinuityForFocus({
              continuity: state.narratorContinuity,
              focus,
            })
          : null,
        recognitionSubjects: aftermathPerceptionView
          ? narratorRecognitionSubjects(aftermathPerceptionView)
          : [],
        styleInstruction: state.narrationStyle?.instruction,
        styleName: state.narrationStyle?.displayName,
        onProgress: (progress) => {
          emit({
            type: "narrator",
            lines: progress.lines.map((line) =>
              repairNarrationIdentifierText(line, identifierCatalog)
            ),
            draft: progress.draft
              ? repairNarrationIdentifierText(progress.draft, identifierCatalog)
              : null,
            turn: aftermathTurn,
          });
        },
      }),
      18_000,
      "narrateAftermath",
    );
  } catch (e) {
    console.warn("[battle] narrateAftermath failed", e);
    presentation = {
      before: ["場には、対決の余韻だけが静かに残った。"],
      after: ["幕は、そこで静かに下りた。"],
      speeches: characterSpeeches.map((speech, index) => ({
        sourceSide: speech.side,
        speaker: speech.speaker,
        text: speech.text,
        afterNarratorLine: index === 0 ? 1 : 2,
      })),
    };
  }

  state = applyNarratorRecognitionResult({
    state,
    view: aftermathPerceptionView,
    turn: aftermathTurn,
    updates: presentation.recognitionUpdates,
  });

  let narrative = repairNarrativeBlockIdentifiers(
    buildAftermathNarrativeBlock({
      turn: aftermathTurn,
      winnerName,
      fallenNames: fallen,
      presentation,
      characterSpeeches,
    }),
    identifierCatalog,
  );
  narrative.speeches = finalizeCharacterSpeeches({
    narrative,
    sources: characterSpeeches,
  });
  emit({
    type: "narrator",
    lines: narrative.narrator,
    draft: null,
    turn: aftermathTurn,
  });
  if (narrative.speeches.length) {
    emit({ type: "speeches", speeches: narrative.speeches });
  }

  emit({ type: "phase", phase: "finalizing" });

  let next: BattleState = {
    ...state,
    status: "finished",
    aftermathPending: false,
    log: [...state.log, narrative],
    updatedAt: new Date().toISOString(),
  };

  const { settleBattleRating } = await import("./rating-service.js");
  next = await settleBattleRating(next);
  try {
    await recordBattleFinished({
      state: next,
      sameOwner: next.ratingSettlement?.sameOwner,
      ranked: next.ratingSettlement?.ranked,
      sideAProfile: sheetCombatProfile(input.mine),
      sideBProfile: sheetCombatProfile(input.opp),
    });
  } catch (e) {
    console.warn(
      "[balance] recordBattleFinished skipped",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    const finishedAt = next.updatedAt;
    await Promise.all([
      charRepo.saveOpponentBattleMemory({
        characterId: input.meta.side_a_character_id,
        opponentId: input.meta.side_b_character_id,
        preBattlePlan: next.openingPlanA ?? next.agentStateA?.currentGoal ?? "",
        postBattleReflection: next.agentStateA?.privateMemory ?? "",
        battledAt: finishedAt,
      }),
      charRepo.saveOpponentBattleMemory({
        characterId: input.meta.side_b_character_id,
        opponentId: input.meta.side_a_character_id,
        preBattlePlan: next.openingPlanB ?? next.agentStateB?.currentGoal ?? "",
        postBattleReflection: next.agentStateB?.privateMemory ?? "",
        battledAt: finishedAt,
      }),
    ]);
  } catch (e) {
    console.warn(
      "[battle] opponent memory save skipped",
      e instanceof Error ? e.message : e,
    );
  }

  await battleRepo.saveBattle(next, {
    sideAUserId: input.meta.side_a_user_id,
    sideACharacterId: input.meta.side_a_character_id,
    sideBCharacterId: input.meta.side_b_character_id,
  });

  // The winner card already states the mechanical result. The aftermath log is
  // LLM-authored, so do not append a second fixed-prose result summary here.
  return toBattlePublicForViewer(next, input.mine, null, input.opp);
}

export async function advanceTurn(input: {
  userId: string;
  battleId: string;
  llm: LlmProvider;
  /** Optional progressive updates (SSE). */
  onProgress?: (event: BattleAdvanceStreamEvent) => void;
}): Promise<BattlePublic> {
  const meta = await battleRepo.getBattleMeta(input.battleId);
  if (!meta) throw new Error("BATTLE_NOT_FOUND");
  if (meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  return withBattleLease(input.battleId, () => advanceTurnWithLease(input));
}

export async function performAction(input: {
  userId: string;
  battleId: string;
  llm: LlmProvider;
}): Promise<BattlePublic> {
  return advanceTurn(input);
}

export async function pickRandomOpponent(userId: string, myCharacterId: string) {
  const all = await charRepo.listPublicOpponents(userId);
  const candidates = all.filter((c) => c.id !== myCharacterId);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

/** Pick the nearest opponent by public rating and a hidden coarse combat profile. */
export async function pickAutoMatchedOpponent(
  userId: string,
  myCharacterId: string,
) {
  const mine = await charRepo.getSheet(myCharacterId);
  if (!mine || mine.ownerUserId !== userId) return null;
  const candidates = (await charRepo.listPlayableOpponentSheets(userId))
    .filter((sheet) => sheet.id !== myCharacterId);
  if (candidates.length === 0) return null;

  const { ensureRecord, sheetCombatProfile } = await import("@kshiai/shared");
  const myRating = ensureRecord(mine).rating;
  const myProfile = sheetCombatProfile(mine);
  const distance = (candidate: CharacterSheet) => {
    const profile = sheetCombatProfile(candidate);
    const ratingDistance = Math.abs(ensureRecord(candidate).rating - myRating) / 20;
    const profileDistance =
      Math.abs(profile.offense - myProfile.offense) * 1.4 +
      Math.abs(profile.defense - myProfile.defense) * 1.2 +
      Math.abs(profile.maxHp - myProfile.maxHp) / 8 +
      Math.abs(profile.maxSkillPower - myProfile.maxSkillPower) * 8 +
      Math.abs(profile.sharpness - myProfile.sharpness) / 5;
    return ratingDistance + profileDistance;
  };
  candidates.sort((a, b) => {
    const delta = distance(a) - distance(b);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
  return charRepo.toPublicCharacterForViewer(candidates[0]!, userId);
}

export function instanceToPreset(
  inst: BattlefieldInstance,
  ownerUserId: string,
  displayName?: string,
): BattlefieldPreset {
  const t = new Date().toISOString();
  return {
    id: newId("bfp"),
    ownerUserId,
    isSystem: false,
    displayName: displayName?.trim() || inst.displayName,
    category: inst.category,
    tags: ["from-battle", inst.category],
    createdAt: t,
    updatedAt: t,
    appearance: inst.appearance ?? {
      summary: inst.terrain,
      visualPrompt: `${inst.scene}, ${inst.terrain}, anime battlefield`,
      imageUrl: null,
    },
    terrainHints: [inst.terrain].filter(Boolean),
    obstacleHints: [...inst.obstacles],
    conditionHints: [...inst.conditions],
    baseCoefficients: { ...inst.coefficients },
    narrativeBlurb: inst.narrativeSetup || inst.scene,
  };
}
