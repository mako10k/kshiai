import { randomInt } from "node:crypto";
import { requestDigest } from "./distributed-guard.js";
import {
  BattlePolicyOptionSchema,
  BattleAdjudicationSchema,
  CharacterActionIntentSchema,
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
  buildTurnObservationPacket,
  advancePsycheReactionV1,
  PSYCHE_REACTION_POLICY_V1,
  buildSemanticObservationState,
  buildServerOnlyReserveCues,
  createBattleState,
  LOCAL_TWELVE_TURN_PACING_CANDIDATE,
  createCausalTurnExecution,
  acceptCausalExecutionDecision,
  commitCausalExecutionBucket,
  finishCausalTurnExecution,
  prepareSequentialBattleTurnInitiative,
  deriveBattleWorldTransitionFromSemanticState,
  isPassiveTurn,
  isQuietTurn,
  normalizeSupervisor,
  ratingForDisplay,
  resolveNextBattleTurnBucket,
  materializeBattleStateAtBucketBoundary,
  materializeBattleTurnStartState,
  bindNextBucketDecision,
  resolveTurn,
  sheetCombatProfile,
  shouldInjectHappening,
  stanceLabel,
  summarizeSelectedPolicies,
  selectPolicyIdsByPerspective,
  projectPublicObjectStates,
  toPublicInstance,
  toPublicPolicyOption,
  type BattlePolicyOption,
  type BattlePublic,
  type BattleStance,
  type BattleState,
  type BattleAdjudication,
  type BattleEncounterProposal,
  type BattleTurnRecord,
  type BattleTurnPipelineTrace,
  type ResolvedBattleAction,
  type CharacterAgentState,
  type CharacterExpressionBrief,
  type CharacterActionProposalValidationReceipt,
  type EnvironmentProcessProposal,
  type EnvironmentProcessReceipt,
  type CharacterCognition,
  type DialoguePipelineSettings,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type CharacterSheet,
  type CommittedMechanicalEvidence,
  type PerceptionEvidence,
  type TurnEvent,
  type TurnSemanticPatch,
  type Skill,
  toNarrationSnapshot,
  toBattleCharacterSnapshot,
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
  defaultDialoguePipelineSettings,
  snapshotDialoguePipelineSettings,
  DialoguePipelineSettingsSchema,
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
  type NarrationCausalProjection,
  buildNarrationIdentifierCatalog,
  buildNarrationPerceptionView,
  buildNarrationTurnView,
  buildNarrationTurnBrief,
  buildBattleTurnCausalReceipt,
  buildNarrationCausalProjection,
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
import { config, type BattleCausalNarrationMode } from "../config.js";
import { newId } from "../id.js";
import type { LlmProvider } from "../llm/index.js";
import type {
  AftermathNarrationResult,
  CharacterDeepPsycheCompactInput,
  CharacterExpressionCompactInput,
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
import * as presentationRepo from "../repositories/battle-presentations.js";
import * as bfRepo from "../repositories/battlefields.js";
import * as charRepo from "../repositories/characters.js";
import * as styleRepo from "../repositories/narration-styles.js";
import * as dialoguePipelineRepo from "../repositories/dialogue-pipeline-settings.js";
import { createAssetGeneration } from "../repositories/asset-generations.js";
import { getUserAccessProfile } from "../account-access.js";
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

const FAST_LLM_ENVELOPE_TIMEOUT_MS = 100_000;
const SHORT_LLM_ENVELOPE_TIMEOUT_MS = 70_000;

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
    objectStates: projectPublicObjectStates({
      worldState: state.worldState,
      participantLabels: {
        a: state.sideA.displayName,
        b: state.sideB.displayName,
      },
    }),
    pendingEffects: (state.pendingEffects ?? []).flatMap((effect) =>
      effect.visibility === "public_when_scheduled"
        ? [{
            effectId: effect.effectId,
            targetSide: effect.targetSide,
            parameterKey: effect.payload.parameterKey,
            direction: effect.payload.delta < 0 ? "loss" as const : "gain" as const,
            trigger: effect.trigger.kind === "due_turn"
              ? { kind: "due_turn" as const, dueTurn: effect.trigger.dueTurn }
              : { kind: "target_hp_at_most_percent" as const },
            expiresTurn: effect.expiresTurn,
          }]
        : []
    ),
    log: state.log,
    receipts: (state.phaseReceipts ?? []).map((receipt) => ({
      turnReceiptId: receipt.id,
      sequence: receipt.sequence,
      phase: receipt.phase,
      combatTurn: receipt.combatTurn,
      stateRevision: receipt.toRevision,
    })),
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
    ? await charRepo.getRatingDisplayContext(
        (await getUserAccessProfile(mySheet.ownerUserId)).realm,
      )
    : undefined;
  const presentationLog = config.battlePresentationReadModel
    ? await presentationRepo.listBattlePresentations(state.id)
    : [];
  const presentationState = presentationLog.length > 0
    ? { ...state, log: [...state.log, ...presentationLog] }
    : state;
  return toBattlePublic(
    presentationState,
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
    const preset = await bfRepo.getPresetForUser(
      input.battlefieldPresetId,
      input.userId,
    );
    if (!preset) throw new Error("BATTLEFIELD_NOT_FOUND");
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
  if (input.opponentCharacterId && !foe) {
    throw new Error("OPPONENT_NOT_FOUND");
  }
  if (foe && !(await charRepo.canViewCharacter(input.userId, foe))) {
    throw new Error("OPPONENT_NOT_FOUND");
  }

  let fieldPreset: BattlefieldPreset | null = null;
  if (input.battlefieldMode === "preset" && input.battlefieldPresetId) {
    fieldPreset = await bfRepo.getPresetForUser(
      input.battlefieldPresetId,
      input.userId,
    );
  } else if (input.battlefieldPresetId) {
    fieldPreset = await bfRepo.getPresetForUser(
      input.battlefieldPresetId,
      input.userId,
    );
  } else {
    fieldPreset = await bfRepo.pickRandomSystemPreset();
  }
  if (input.battlefieldPresetId && !fieldPreset) {
    throw new Error("BATTLEFIELD_NOT_FOUND");
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

export function applyDialogueContextProjectionOverride(
  settings: DialoguePipelineSettings,
  override: "legacy" | "compact" | null,
): DialoguePipelineSettings {
  return override ? { ...settings, contextProjectionMode: override } : settings;
}

export async function startBattle(input: {
  userId: string;
  /** Stable resource identity supplied by the idempotent create operation. */
  battleId?: string;
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
  if (input.battleId) {
    const [existing, existingMeta] = await Promise.all([
      battleRepo.getBattle(input.battleId),
      battleRepo.getBattleMeta(input.battleId),
    ]);
    if (existing || existingMeta) {
      if (
        !existing || !existingMeta ||
        existingMeta.side_a_user_id !== input.userId ||
        existingMeta.side_a_character_id !== input.myCharacterId ||
        existingMeta.side_b_character_id !== input.opponentCharacterId
      ) {
        throw new Error("BATTLE_CREATE_IDENTITY_CONFLICT");
      }
      const existingMine = existing.assetManifest?.characters.a.snapshot ??
        await charRepo.getSheet(existingMeta.side_a_character_id);
      const existingOpp = existing.assetManifest?.characters.b.snapshot ??
        await charRepo.getSheet(existingMeta.side_b_character_id);
      if (!existingMine || !existingOpp) throw new Error("CHARACTER_MISSING");
      return toBattlePublicForViewer(existing, existingMine, null, existingOpp);
    }
  }
  const mine = await charRepo.getSheet(input.myCharacterId);
  const opp = await charRepo.getSheet(input.opponentCharacterId);
  if (!mine || mine.ownerUserId !== input.userId) {
    throw new Error("MY_CHARACTER_NOT_FOUND");
  }
  if (!opp) throw new Error("OPPONENT_NOT_FOUND");
  if (!(await charRepo.canViewCharacter(input.userId, opp))) {
    throw new Error("OPPONENT_NOT_FOUND");
  }
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
  const dialoguePipelineSnapshot = snapshotDialoguePipelineSettings(
    applyDialogueContextProjectionOverride(
      await dialoguePipelineRepo.getDialoguePipelineSettings(),
      config.dialogueContextProjectionOverride,
    ),
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
    }), FAST_LLM_ENVELOPE_TIMEOUT_MS, "prepareBattleEncounter");
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

  const id = input.battleId ?? newId("btl");
  let state = createBattleState({
    id,
    sideA: mine,
    sideB: opp,
    turnLimit: config.battleTurnLimit,
    pacingPolicy: config.battlePacingPolicy === "candidate-12-v2"
      ? LOCAL_TWELVE_TURN_PACING_CANDIDATE
      : undefined,
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

  const sourceBattlefieldPreset = battlefield.sourcePresetId
    ? await bfRepo.getPreset(battlefield.sourcePresetId)
    : null;
  const assetBoundAt = new Date().toISOString();
  const mineSnapshot = toBattleCharacterSnapshot(mine);
  const opponentSnapshot = toBattleCharacterSnapshot(opp);
  const battlefieldPresetSnapshot = sourceBattlefieldPreset
    ? {
        ...sourceBattlefieldPreset,
        updatedAt: sourceBattlefieldPreset.createdAt,
      }
    : null;
  const [mineGeneration, opponentGeneration, narrationGeneration,
    battlefieldPresetGeneration, battlefieldInstanceGeneration,
    dialogueGeneration] = await Promise.all([
    createAssetGeneration({
      assetType: "character",
      assetId: mine.id,
      schemaVersion: 1,
      content: mineSnapshot,
      createdAt: mine.updatedAt,
    }),
    createAssetGeneration({
      assetType: "character",
      assetId: opp.id,
      schemaVersion: 1,
      content: opponentSnapshot,
      createdAt: opp.updatedAt,
    }),
    createAssetGeneration({
      assetType: "narration-style",
      assetId: narrationStyle.id,
      schemaVersion: 1,
      content: narrationSnap,
      createdAt: narrationStyle.updatedAt,
    }),
    battlefieldPresetSnapshot
      ? createAssetGeneration({
          assetType: "battlefield-preset",
          assetId: battlefieldPresetSnapshot.id,
          schemaVersion: 1,
          content: battlefieldPresetSnapshot,
          createdAt: sourceBattlefieldPreset!.updatedAt,
        })
      : Promise.resolve(null),
    createAssetGeneration({
      assetType: "battlefield-instance",
      assetId: id,
      schemaVersion: 1,
      content: battlefield,
    }),
    createAssetGeneration({
      assetType: "dialogue-pipeline",
      assetId: "global",
      schemaVersion: 1,
      content: dialoguePipelineSnapshot,
      createdAt: assetBoundAt,
    }),
  ]);

  state = {
    ...state,
    assetManifest: {
      schemaVersion: 1,
      boundAt: assetBoundAt,
      characters: {
        a: {
          assetId: mine.id,
          generationId: mineGeneration.generationId,
          contentDigest: mineGeneration.contentDigest,
          snapshot: mineSnapshot,
        },
        b: {
          assetId: opp.id,
          generationId: opponentGeneration.generationId,
          contentDigest: opponentGeneration.contentDigest,
          snapshot: opponentSnapshot,
        },
      },
      narrationStyle: {
        assetId: narrationSnap.id,
        generationId: narrationGeneration.generationId,
        contentDigest: narrationGeneration.contentDigest,
        snapshot: narrationSnap,
      },
      battlefield: {
        assetId: battlefield.sourcePresetId,
        presetGenerationId: battlefieldPresetGeneration?.generationId ?? null,
        generationId: battlefieldInstanceGeneration.generationId,
        contentDigest: battlefieldInstanceGeneration.contentDigest,
        snapshot: battlefield,
      },
      dialoguePipeline: {
        generationId: dialogueGeneration.generationId,
        contentDigest: dialogueGeneration.contentDigest,
        snapshot: dialoguePipelineSnapshot,
      },
      rules: {
        battleEngine: "battle-engine-v1",
        temporalRules: "initiative-window-v2",
        psycheReaction: PSYCHE_REACTION_POLICY_V1,
      },
    },
    dialoguePipelineSnapshot,
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

function initialAgentState(
  sheet: CharacterSheet,
  selfReference = sheet.identity?.selfNames[0] ?? null,
): CharacterAgentState {
  return {
    privateMemory: "",
    battleVolatileMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference,
    lastSpeech: null,
    lastActionResult: "",
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
      attitudeTowardCounterpart: "対峙している",
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
    dialogueThread: state.dialogueThread ?? {
      topic: "",
      unresolvedMove: "",
      anchoredExchange: null,
    },
    lastActionResult: state.lastActionResult ?? "",
    interior: {
      primaryEmotion: state.interior?.primaryEmotion ?? (state.emotion || "平静"),
      concealedEmotion: state.interior?.concealedEmotion ?? null,
      coreNeed: state.interior?.coreNeed ?? "",
      protectiveStance: state.interior?.protectiveStance ?? "",
      eventAppraisal: state.interior?.eventAppraisal ?? "",
      unspokenIntent: state.interior?.unspokenIntent ?? "",
      currentConcern: state.interior?.currentConcern ?? state.currentGoal,
      attitudeTowardCounterpart: state.interior?.attitudeTowardCounterpart ?? "対峙している",
      confidence: state.interior?.confidence ?? "steady",
      relationshipTension: state.interior?.relationshipTension ?? "",
      speechMode: state.interior?.speechMode ?? "weave",
      speechAppraisal: {
        anticipatedImpact: state.interior?.speechAppraisal?.anticipatedImpact ?? "",
        observedImpact: state.interior?.speechAppraisal?.observedImpact ?? "",
        anticipatedSocialCost: state.interior?.speechAppraisal?.anticipatedSocialCost ?? "",
        observedSocialCost: state.interior?.speechAppraisal?.observedSocialCost ?? "",
        anticipatedSocialConsequence: state.interior?.speechAppraisal?.anticipatedSocialConsequence,
        observedSocialConsequence: state.interior?.speechAppraisal?.observedSocialConsequence,
        nextApproach: state.interior?.speechAppraisal?.nextApproach ?? "",
        continuityPosture: state.interior?.speechAppraisal?.continuityPosture ?? "opening",
        continuityBasis: state.interior?.speechAppraisal?.continuityBasis,
        continuityDecision: state.interior?.speechAppraisal?.continuityDecision ?? "advance",
      },
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
      agentStateB: state.agentStateB,
      previous: state.narratorContinuity,
    }),
  };
}

function publicNarrativeBlock(result: NarrationResult): NarrativeBlock {
  return {
    turn: result.turn,
    narrator: [...result.narrator],
    speeches: result.speeches.map((speech) => ({ ...speech })),
  };
}

export function applyNarratorRecognitionResult(input: {
  state: BattleState;
  view: NarrationPerceptionView | null;
  turn: number;
  updates?: readonly NarratorRecognitionUpdate[];
}): BattleState {
  if (
    !input.state.narratorContinuity ||
    !input.view ||
    !input.updates?.length
  ) {
    return input.state;
  }
  const subjects = narratorRecognitionSubjects(input.view);
  if (subjects.length === 0) return input.state;
  const target = input.view.mode === "self"
    ? "a" as const
    : input.view.mode === "opponent"
      ? "b" as const
      : "reader" as const;
  return {
    ...input.state,
    narratorContinuity: applyBattleNarratorRecognitionUpdates({
      continuity: input.state.narratorContinuity,
      target,
      turn: input.turn,
      allowedSubjectRefs: subjects.map((subject) => subject.subjectRef),
      updates: input.updates,
    }),
  };
}

export function buildNarratorProfileAnchors(input: {
  mine: CharacterSheet;
  opp: CharacterSheet;
  perspective: NarrationPerspective;
  focus: NarrationFocus;
  state?: BattleState;
}) {
  return selectNarratorRenderingProfileAnchors({
    mode: narratorProfileAccessMode({
      perspective: input.perspective,
      focus: input.focus,
    }),
    sideA: buildNarratorRenderingProfileAnchor({
      sheet: input.mine,
      side: "a",
      currentStateOverrides: deriveBattleProfileStateOverrides({
        worldState: input.state?.worldState,
        side: "a",
      }),
    }),
    sideB: buildNarratorRenderingProfileAnchor({
      sheet: input.opp,
      side: "b",
      currentStateOverrides: deriveBattleProfileStateOverrides({
        worldState: input.state?.worldState,
        side: "b",
      }),
    }),
  });
}

export function buildNarratorSceneStateFacts(input: {
  state: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
  perspective: NarrationPerspective;
  focus: NarrationFocus;
}) {
  const mode = narratorProfileAccessMode({
    perspective: input.perspective,
    focus: input.focus,
  });
  const observerSide = mode === "self"
    ? "a" as const
    : mode === "opponent"
      ? "b" as const
      : undefined;
  return deriveBattleSceneStateFacts({
    worldState: input.state.worldState,
    ...(observerSide ? { observerSide } : {}),
    participantLabels: {
      a: input.mine.displayName,
      b: input.opp.displayName,
    },
  });
}

function buildCharacterDecisionContext(input: {
  state: BattleState;
  sheet: CharacterSheet;
  counterpartSheet?: CharacterSheet;
  side: "a" | "b";
  decisionTurn?: number;
}) {
  const self = input.side === "a" ? input.state.sideA : input.state.sideB;
  const perception = input.side === "a"
    ? input.state.perceptionFrameA
    : input.state.perceptionFrameB;
  const finisher = input.side === "a"
    ? input.state.finisherA
    : input.state.finisherB;
  const nextTurn = input.decisionTurn ?? input.state.turn + 1;
  const window = buildFinisherWindow({
    finisher,
    turn: nextTurn,
    turnLimit: input.state.turnLimit,
    pacingPolicy: input.state.pacingPolicy,
  });
  const drama = normalizeDramaState(input.state.dramaState);
  const signature = input.side === "a"
    ? drama.lastActionSignatureA
    : drama.lastActionSignatureB;
  const actionRepeatCount = input.side === "a"
    ? drama.repeatedActionA
    : drama.repeatedActionB;
  const parsed = parseActionSignature(signature);
  const lastSkill = parsed?.skillId
    ? input.sheet.skills.find((skill) => skill.id === parsed.skillId)
    : null;
  const lastAction = parsed
    ? {
        kind: parsed.kind as
          | "skill"
          | "basic_attack"
          | "defend"
          | "rest"
          | "wait"
          | "reflect",
        ...(parsed.skillId ? { skillId: parsed.skillId } : {}),
        ...(lastSkill?.name
          ? { name: lastSkill.name }
          : parsed.kind === "basic_attack"
            ? { name: input.sheet.basicAttack?.name ?? "基本アクション" }
            : parsed.kind === "wait"
              ? { name: "様子を見る" }
              : parsed.kind === "reflect"
                ? { name: "戦況を省みる" }
              : parsed.kind === "defend"
                ? { name: "防御" }
                : parsed.kind === "rest"
                  ? { name: "休息" }
                  : {}),
      }
    : null;
  const varietyPressure =
    actionRepeatCount >= 3
      ? "require_change" as const
      : actionRepeatCount >= 2
        ? "prefer_change" as const
        : "none" as const;
  const predictedRepeatCount = actionRepeatCount + 1;
  if (!perception) return null;
  const roots = buildFreeActionCanonicalRoots({
    state: input.state,
    mine: input.side === "a"
      ? input.sheet
      : input.counterpartSheet ?? input.sheet,
    opp: input.side === "a"
      ? input.counterpartSheet ?? input.sheet
      : input.sheet,
  });
  const affordances = buildLatentAffordances({
    state: input.state,
    mine: input.side === "a"
      ? input.sheet
      : input.counterpartSheet ?? input.sheet,
    opp: input.side === "a"
      ? input.counterpartSheet ?? input.sheet
      : input.sheet,
    side: input.side,
    roots,
  });
  return {
    nextTurn,
    turnsRemaining: Math.max(0, input.state.turnLimit - nextTurn + 1),
    availableActions: buildObserverSafeAvailableActions({
      actorSide: input.side,
      actor: self,
      sheet: input.sheet,
      finisher,
      turn: nextTurn,
      worldState: input.state.worldState,
      perception,
    }),
    finisher: window,
    lastAction,
    actionRepeatCount,
    varietyPressure,
    decisionProfile: decisionProfileForSheet(input.sheet),
    tacticalNeed: buildTacticalNeedFrame({
      frame: perception,
      turnsRemaining: Math.max(0, input.state.turnLimit - nextTurn + 1),
    }),
    affordances,
    opportunityChains: buildOpportunityChains(affordances),
    repetitionPenalty: lastAction
      ? {
          ifRepeatedCount: predictedRepeatCount,
          staminaCost: predictedRepeatCount >= 4 ? 4 : 2,
          effectMultiplier: predictedRepeatCount >= 3
            ? Math.max(0.7, 1 - (predictedRepeatCount - 2) * 0.1)
            : 1,
          opponentRead: predictedRepeatCount >= 3,
        }
      : undefined,
  };
}

/** Build the deliberately narrow input used between sequential buckets. */
export function buildLaterBucketActionInput(input: {
  state: BattleState;
  sheet: CharacterSheet;
  counterpartSheet?: CharacterSheet;
  side: "a" | "b";
}): Parameters<LlmProvider["decideCharacterAction"]>[0] | null {
  const perception = input.side === "a"
    ? input.state.perceptionFrameA
    : input.state.perceptionFrameB;
  if (!perception || perception.observer.side !== input.side) return null;
  const decision = buildCharacterDecisionContext({
    ...input,
    decisionTurn: input.state.turn,
  });
  if (!decision || decision.availableActions.length === 0) return null;
  return deepFreezeConsumerInput({
    character: buildCharacterSelfProfileAnchor(
      input.sheet,
      deriveBattleProfileStateOverrides({
        worldState: input.state.worldState,
        side: input.side,
      }),
    ),
    perception: structuredClone(perception),
    decision,
  });
}

function deterministicLaterBucketFallback(
  decision: Parameters<LlmProvider["decideCharacterAction"]>[0]["decision"],
) {
  const selected = decision.availableActions.find((action) =>
    action.kind === "basic_attack"
  ) ?? decision.availableActions.find((action) =>
    action.kind !== "wait" && action.kind !== "reflect"
  ) ?? decision.availableActions[0];
  if (!selected) return null;
  return CharacterActionIntentSchema.parse(
    selected.kind === "skill"
      ? { kind: "skill", skillId: selected.skillId }
      : { kind: selected.kind },
  );
}

function characterActionResultSummary(
  events: TurnEvent[],
  side: "a" | "b",
): string {
  return events
    .filter((event) => event.actorSide === side || event.targetSides?.includes(side))
    .map((event) => event.summary)
    .filter(Boolean)
    .slice(-4)
    .join(" ")
    .slice(0, 600);
}

function deepFreezeConsumerInput<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreezeConsumerInput(child);
    }
  }
  return value;
}

type CharacterAgentSharedConsumerInput = Omit<
  Parameters<LlmProvider["advanceCharacterAgent"]>[0],
  "decision"
> & {
  decision?: Parameters<LlmProvider["advanceCharacterAgent"]>[0]["decision"];
};

/** Build the shared, observer-safe input for a psyche then speech/action pair. */
export function buildCharacterAgentConsumerInput(input: {
  state: BattleState;
  sheet: CharacterSheet;
  counterpartSheet?: CharacterSheet;
  side: "a" | "b";
  previous: CharacterAgentState;
  dialoguePipeline?: DialoguePipelineSettings;
  phase?: "prologue" | "turn" | "aftermath";
}): CharacterAgentSharedConsumerInput | null {
  const frame = input.side === "a"
    ? input.state.perceptionFrameA
    : input.state.perceptionFrameB;
  if (!frame || frame.observer.side !== input.side) return null;
  const counterpart = input.side === "a"
    ? input.state.sideB
    : input.state.sideA;
  const counterpartKnowledge = frame.counterpart.identityKnowledge === "identified" &&
      (!frame.counterpart.apparentIdentity ||
        frame.counterpart.apparentIdentity.continuity === "same_entity")
    ? {
        displayName: counterpart.displayName,
        ...(
          frame.counterpart.currentAccess === "coarse" ||
          frame.counterpart.currentAccess === "clear"
            ? { condition: perceivedCondition(counterpart) }
            : {}
        ),
      }
    : undefined;
  const character = buildCharacterSelfProfileAnchor(
    input.sheet,
    deriveBattleProfileStateOverrides({
      worldState: input.state.worldState,
      side: input.side,
    }),
  );
  const social = input.state.encounterContext?.social[input.side];
  const socialForCurrentPerception = social
    ? counterpartKnowledge
      ? social
      : {
          ...social,
          relationshipLabel: "現在知覚している対象との関係は未確認",
          counterpartAddress: frame.counterpart.perceivedAs.slice(0, 40),
        }
    : undefined;
  const permittedSelfReference = social?.selfReference &&
      character.identity.selfNames.includes(social.selfReference)
    ? social.selfReference
    : canonicalSelfReference(character);
  const phase = input.phase ?? "turn";
  const dialoguePipeline = DialoguePipelineSettingsSchema.parse(
    input.dialoguePipeline ?? defaultDialoguePipelineSettings(),
  );
  const {
    lastActionResult: latestCommittedResult,
    conversationHistory,
    ...previousContinuity
  } = input.previous;
  const decision = phase === "aftermath"
    ? undefined
    : buildCharacterDecisionContext({
        state: input.state,
        sheet: input.sheet,
        counterpartSheet: input.counterpartSheet,
        side: input.side,
      });
  if (decision && decision.availableActions.length === 0) return null;
  return {
    phase,
    character,
    psyche: structuredClone({
      ...previousContinuity,
      selfReference: permittedSelfReference,
    }),
    actionReaction: deepFreezeConsumerInput({
      schemaVersion: 1,
      turn: input.state.turn,
      latestCommittedResult: latestCommittedResult?.trim() || null,
    }),
    conversation: deepFreezeConsumerInput({
      schemaVersion: 1,
      history: (conversationHistory ?? [])
        .slice(-dialoguePipeline.conversationHistoryLimit),
    }),
    dialoguePipeline: deepFreezeConsumerInput(structuredClone(dialoguePipeline)),
    perception: deepFreezeConsumerInput(structuredClone(frame)),
    ...(socialForCurrentPerception
      ? { social: deepFreezeConsumerInput(structuredClone(socialForCurrentPerception)) }
      : {}),
    ...(counterpartKnowledge ? { counterpart: counterpartKnowledge } : {}),
    ...(decision ? { decision } : {}),
  };
}

function extendConversationHistory(input: {
  previous: CharacterAgentState;
  side: "a" | "b";
  turn: number;
  utteranceEvents: TurnEvent[];
  speechEvidence: PerceptionEvidence[];
  limit: number;
}): CharacterAgentState["conversationHistory"] {
  const visible = new Map(
    input.speechEvidence.map((evidence) => [evidence.basisEventIds[0], evidence]),
  );
  const additions = input.utteranceEvents.flatMap((event) => {
    if (!event.actorSide || !event.utterance?.text) return [];
    const access = event.id
      ? visible.get(event.id)?.accessBySide[input.side]
      : undefined;
    if (
      event.actorSide !== input.side &&
      !["clear", "coarse", "trace"].includes(access?.currentAccess ?? "none")
    ) {
      return [];
    }
    return [{
      turn: input.turn,
      speaker: event.actorSide === input.side ? "self" as const : "counterpart" as const,
      text: event.utterance.text.slice(0, 400),
    }];
  });
  return [...(input.previous.conversationHistory ?? []), ...additions]
    .slice(-input.limit);
}


/**
 * Append reflect notes to battle-volatile memory only.
 * Never writes character-persistent opponentMemories or privateMemory
 * (aftermath may read battleVolatileMemory when composing postBattleReflection).
 * Idempotent: re-applying the same reflect action does not duplicate markers.
 */
export function applyReflectMemoryWrites(
  state: BattleState,
  actions: ResolvedBattleAction[],
): BattleState {
  let next = state;
  for (const action of actions) {
    if (!action.executed || action.kind !== "reflect") continue;
    const analysis = action.reflectionAnalysis?.trim() ?? "";
    const guideline = action.reflectionGuideline?.trim() ?? "";
    if (!analysis && !guideline) continue;
    const key = action.actorSide === "a" ? "agentStateA" : "agentStateB";
    const agent = next[key];
    if (!agent) continue;
    const analysisMarker = analysis ? `【省察】${analysis}` : "";
    const guidelineMarker = guideline ? `【指針】${guideline}` : "";
    const volatile = agent.battleVolatileMemory ?? "";
    const alreadyHasAnalysis = Boolean(
      analysisMarker && volatile.includes(analysisMarker),
    );
    const alreadyHasGuideline = Boolean(
      guidelineMarker && volatile.includes(guidelineMarker),
    );
    const memoryBits = [
      volatile,
      !alreadyHasAnalysis && analysisMarker,
      !alreadyHasGuideline && guidelineMarker,
    ].filter((part): part is string => Boolean(part && part.trim()));
    const observationAlready = analysis
      ? agent.observations.some((item) => item === analysis.slice(0, 240))
      : true;
    next = {
      ...next,
      [key]: {
        ...agent,
        // Intentionally leave privateMemory untouched: that field may become
        // durable postBattleReflection after the match, while reflect notes
        // are match-scoped scratch only.
        battleVolatileMemory: memoryBits.join("\n").slice(0, 1200),
        currentGoal: guideline.slice(0, 240) || agent.currentGoal,
        observations: [
          ...agent.observations.slice(-6),
          ...(analysis && !observationAlready ? [analysis.slice(0, 240)] : []),
        ].slice(-8),
        interior: {
          primaryEmotion: agent.interior?.primaryEmotion ?? agent.emotion ?? "平静",
          concealedEmotion: agent.interior?.concealedEmotion ?? null,
          coreNeed: agent.interior?.coreNeed ?? "",
          protectiveStance: agent.interior?.protectiveStance ?? "",
          eventAppraisal: analysis.slice(0, 240) || agent.interior?.eventAppraisal || "",
          unspokenIntent: analysis.slice(0, 240) || agent.interior?.unspokenIntent || "",
          currentConcern: guideline.slice(0, 240) || agent.interior?.currentConcern || agent.currentGoal,
          attitudeTowardCounterpart: agent.interior?.attitudeTowardCounterpart ?? "対峙している",
          confidence: agent.interior?.confidence ?? "steady",
          relationshipTension: agent.interior?.relationshipTension ?? "",
          speechMode: agent.interior?.speechMode ?? "weave",
          speechAppraisal: agent.interior?.speechAppraisal,
        },
      },
    };
  }
  return next;
}

export async function advanceCharacterAgents(input: {
  llm: LlmProvider;
  before: BattleState;
  after: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
  events: TurnEvent[];
  actions: ResolvedBattleAction[];
  sensoryEvidence?: PerceptionEvidence[];
  quantizedMechanicalEvidence?: QuantizedMechanicalEvidence[];
  mechanicalEvidence?: CommittedMechanicalEvidence[];
  environmentProcessReceipt?: EnvironmentProcessReceipt;
  dialoguePipeline?: DialoguePipelineSettings;
  phase?: "prologue" | "turn" | "aftermath";
  /** Restrict provider work to selected isolated character contexts. */
  activeSides?: ReadonlyArray<"a" | "b">;
  /** Attach reaction-only utterances to the existing terminal turn record. */
  replaceLastRecord?: boolean;
}): Promise<{ state: BattleState; characterSpeeches: CharacterSpeechSource[] }> {
  const dialoguePipeline = DialoguePipelineSettingsSchema.parse(
    input.dialoguePipeline ?? defaultDialoguePipelineSettings(),
  );
  const previousRecords = input.replaceLastRecord
    ? (input.after.turnRecords ?? []).slice(0, -1)
    : input.after.turnRecords ?? [];
  const existingRecord = input.replaceLastRecord
    ? (input.after.turnRecords ?? []).at(-1)
    : undefined;
  const baseRecord = existingRecord ?? buildBattleTurnRecord({
    before: input.before,
    after: input.after,
    events: input.events,
    actions: input.actions,
    mechanicalEvidence: input.mechanicalEvidence,
  });
  const recordWithoutUtterances = input.environmentProcessReceipt
    ? {
        ...baseRecord,
        pipelineTrace: {
          schemaVersion: 1 as const,
          ...(baseRecord.pipelineTrace ?? {}),
          environmentProcess: structuredClone(input.environmentProcessReceipt),
        },
      }
    : baseRecord;
  const dialogueProjection = input.after.perceptionFrameA && input.after.perceptionFrameB
    ? {
        mode: "shadow" as const,
        a: buildTurnObservationPacket({
          frame: input.after.perceptionFrameA,
          evidence: input.sensoryEvidence,
        }),
        b: buildTurnObservationPacket({
          frame: input.after.perceptionFrameB,
          evidence: input.sensoryEvidence,
        }),
      }
    : undefined;
  const recordWithDialogueProjection = dialogueProjection
    ? {
        ...recordWithoutUtterances,
        pipelineTrace: {
          schemaVersion: 1 as const,
          ...(recordWithoutUtterances.pipelineTrace ?? {}),
          dialogueProjection,
        },
      }
    : recordWithoutUtterances;
  const activeSides = new Set(input.activeSides ?? ["a", "b"]);
  const deterministicPsyche =
    input.after.assetManifest?.rules.psycheReaction === PSYCHE_REACTION_POLICY_V1 &&
    (input.phase ?? "turn") === "turn";
  const previousA = groundCharacterAgentState(
    input.mine,
    input.after.agentStateA ?? initialAgentState(
      input.mine,
      input.after.encounterContext?.social.a.selfReference,
    ),
    input.after.encounterContext?.social.a.selfReference,
  );
  const previousB = groundCharacterAgentState(
    input.opp,
    input.after.agentStateB ?? initialAgentState(
      input.opp,
      input.after.encounterContext?.social.b.selfReference,
    ),
    input.after.encounterContext?.social.b.selfReference,
  );
  previousA.lastActionResult = characterActionResultSummary(input.events, "a");
  previousB.lastActionResult = characterActionResultSummary(input.events, "b");
  if (deterministicPsyche) {
    if (activeSides.has("a")) {
      const reaction = advancePsycheReactionV1({
        prior: previousA.reactionStateV1,
        packet: dialogueProjection?.a ?? null,
      });
      previousA.reactionStateV1 = reaction.state;
      previousA.reactionReceiptV1 = reaction.receipt;
    }
    if (activeSides.has("b")) {
      const reaction = advancePsycheReactionV1({
        prior: previousB.reactionStateV1,
        packet: dialogueProjection?.b ?? null,
      });
      previousB.reactionStateV1 = reaction.state;
      previousB.reactionReceiptV1 = reaction.receipt;
    }
  }
  const stateWithRecord: BattleState = {
    ...input.after,
    agentStateA: previousA,
    agentStateB: previousB,
    turnRecords: [
      ...previousRecords,
      recordWithDialogueProjection,
    ].slice(-50),
  };
  const inputA = activeSides.has("a") ? buildCharacterAgentConsumerInput({
    state: input.after,
    sheet: input.mine,
    counterpartSheet: input.opp,
    side: "a",
    previous: previousA,
    dialoguePipeline,
    phase: input.phase,
  }) : null;
  const inputB = activeSides.has("b") ? buildCharacterAgentConsumerInput({
    state: input.after,
    sheet: input.opp,
    counterpartSheet: input.mine,
    side: "b",
    previous: previousB,
    dialoguePipeline,
    phase: input.phase,
  }) : null;
  const compactContext = dialoguePipeline.contextProjectionMode === "compact";
  if (!inputA && !inputB) {
    console.warn("[battle] character agents skipped: no observer-safe action available");
    return { state: refreshNarratorContinuity(stateWithRecord), characterSpeeches: [] };
  }
  const toPsycheInput = (consumerInput: typeof inputA) => {
    if (!consumerInput) return null;
    // Accepted V1 contract: normal-turn private reaction is deterministic and
    // must not escalate to a provider when features are absent or uncertain.
    if (deterministicPsyche && consumerInput.phase === "turn") return null;
    if (compactContext) {
      const packet = consumerInput === inputA
        ? dialogueProjection?.a
        : dialogueProjection?.b;
      if (!packet) return null;
      const sheet = consumerInput === inputA ? input.mine : input.opp;
      const counterpartSheet = consumerInput === inputA ? input.opp : input.mine;
      const storedMatchupMemory = sheet.opponentMemories?.[counterpartSheet.id];
      const compactInput = {
        contextMode: "compact" as const,
        phase: consumerInput.phase,
        character: consumerInput.character,
        // Opponent memory is a durable matchup note, not a current-battle
        // thought. Do not let an old plan be copied into every inner update.
        previous: consumerInput.phase === "prologue"
          ? { ...consumerInput.psyche, privateMemory: "" }
          : consumerInput.psyche,
        turnObservation: packet,
        conversation: {
          recentExchange: consumerInput.conversation.history
            .slice(-dialoguePipeline.recentExchangeLimit),
        },
        ...(consumerInput.phase === "prologue" && storedMatchupMemory
          ? {
              matchupMemory: {
                preBattlePlan: storedMatchupMemory.preBattlePlan,
                postBattleReflection: storedMatchupMemory.postBattleReflection,
                battleCount: storedMatchupMemory.battleCount,
              },
            }
          : {}),
        dialoguePipeline: consumerInput.dialoguePipeline,
        ...(consumerInput.social ? { social: consumerInput.social } : {}),
        ...(consumerInput.counterpart ? { counterpart: consumerInput.counterpart } : {}),
      } satisfies CharacterDeepPsycheCompactInput;
      return compactInput as unknown as Parameters<LlmProvider["advanceCharacterPsyche"]>[0];
    }
    const { decision: _decision, psyche, ...shared } = consumerInput;
    return {
      ...shared,
      previous: psyche,
    } satisfies Parameters<LlmProvider["advanceCharacterPsyche"]>[0];
  };
  const psycheInputA = toPsycheInput(inputA);
  const psycheInputB = toPsycheInput(inputB);
  let psycheResults: [
    PromiseSettledResult<Awaited<ReturnType<LlmProvider["advanceCharacterPsyche"]>> | null>,
    PromiseSettledResult<Awaited<ReturnType<LlmProvider["advanceCharacterPsyche"]>> | null>,
  ];
  try {
    psycheResults = await withTimeout(Promise.allSettled([
      psycheInputA ? input.llm.advanceCharacterPsyche(psycheInputA) : Promise.resolve(null),
      psycheInputB ? input.llm.advanceCharacterPsyche(psycheInputB) : Promise.resolve(null),
    ]), FAST_LLM_ENVELOPE_TIMEOUT_MS, "advanceCharacterPsyche");
  } catch (error) {
    console.warn(
      "[battle] deep psyche stage retained prior state",
      error instanceof Error ? error.message : error,
    );
    psycheResults = [
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ];
  }
  const [psycheResultA, psycheResultB] = psycheResults;
  const defaultExpressionBrief = (state: CharacterAgentState): CharacterExpressionBrief => ({
    sourceThread: state.interior?.speechMode ?? "weave",
    continuityDecision: state.interior?.speechAppraisal?.continuityDecision ?? "advance",
    focus: ["self_result"],
    observedImpact: state.interior?.speechAppraisal?.observedImpact ?? "",
    relationshipMove: state.interior?.speechAppraisal?.nextApproach ?? "",
    publicAim: state.interior?.speechAppraisal?.nextApproach ?? "",
  });
  const applyPsyche = (
    result: PromiseSettledResult<Awaited<ReturnType<LlmProvider["advanceCharacterPsyche"]>> | null>,
    previous: CharacterAgentState,
    sheet: CharacterSheet,
    selfReference?: string | null,
  ) => {
    if (result.status !== "fulfilled" || !result.value) {
      const state = compactContext && input.phase === "prologue"
        ? groundCharacterAgentState(sheet, { ...previous, privateMemory: "" }, selfReference)
        : previous;
      return { state, expressionBrief: defaultExpressionBrief(state) };
    }
    if (result.value.delta && result.value.expressionBrief) {
      const delta = result.value.delta;
      const state = groundCharacterAgentState(sheet, {
        ...previous,
        ...delta,
        // Engine-owned in-match scratch; psyche may not rewrite or clear it.
        battleVolatileMemory: previous.battleVolatileMemory ?? "",
        // The compact prologue can consult matchupMemory, but it starts a
        // fresh private state for this battle. This prevents historical plans
        // and reflections from recursively becoming the next reflection.
        ...(compactContext && input.phase === "prologue" ? { privateMemory: "" } : {}),
        interior: {
          primaryEmotion: delta.interior?.primaryEmotion ?? previous.interior?.primaryEmotion ?? previous.emotion,
          concealedEmotion: delta.interior?.concealedEmotion ?? previous.interior?.concealedEmotion ?? null,
          coreNeed: delta.interior?.coreNeed ?? previous.interior?.coreNeed ?? "",
          protectiveStance: delta.interior?.protectiveStance ?? previous.interior?.protectiveStance ?? "",
          eventAppraisal: delta.interior?.eventAppraisal ?? previous.interior?.eventAppraisal ?? "",
          unspokenIntent: delta.interior?.unspokenIntent ?? previous.interior?.unspokenIntent ?? "",
          currentConcern: delta.interior?.currentConcern ?? previous.interior?.currentConcern ?? previous.currentGoal,
          attitudeTowardCounterpart: delta.interior?.attitudeTowardCounterpart ??
            previous.interior?.attitudeTowardCounterpart ?? "対峙している",
          confidence: delta.interior?.confidence ?? previous.interior?.confidence ?? "steady",
          relationshipTension: delta.interior?.relationshipTension ?? previous.interior?.relationshipTension ?? "",
          speechMode: delta.interior?.speechMode ?? previous.interior?.speechMode ?? "weave",
          speechAppraisal: {
            anticipatedImpact: delta.interior?.speechAppraisal?.anticipatedImpact ??
              previous.interior?.speechAppraisal?.anticipatedImpact ?? "",
            observedImpact: delta.interior?.speechAppraisal?.observedImpact ??
              previous.interior?.speechAppraisal?.observedImpact ?? "",
            anticipatedSocialCost: delta.interior?.speechAppraisal?.anticipatedSocialCost ??
              previous.interior?.speechAppraisal?.anticipatedSocialCost ?? "",
            observedSocialCost: delta.interior?.speechAppraisal?.observedSocialCost ??
              previous.interior?.speechAppraisal?.observedSocialCost ?? "",
            anticipatedSocialConsequence: delta.interior?.speechAppraisal?.anticipatedSocialConsequence ??
              previous.interior?.speechAppraisal?.anticipatedSocialConsequence,
            observedSocialConsequence: delta.interior?.speechAppraisal?.observedSocialConsequence ??
              previous.interior?.speechAppraisal?.observedSocialConsequence,
            nextApproach: delta.interior?.speechAppraisal?.nextApproach ??
              previous.interior?.speechAppraisal?.nextApproach ?? "",
            continuityPosture: delta.interior?.speechAppraisal?.continuityPosture ??
              previous.interior?.speechAppraisal?.continuityPosture ?? "opening",
            continuityBasis: delta.interior?.speechAppraisal?.continuityBasis ??
              previous.interior?.speechAppraisal?.continuityBasis,
            continuityDecision: delta.interior?.speechAppraisal?.continuityDecision ??
              previous.interior?.speechAppraisal?.continuityDecision ?? "advance",
          },
        },
      }, selfReference);
      return { state, expressionBrief: result.value.expressionBrief };
    }
    return {
      state: groundCharacterAgentState(sheet, {
        ...previous,
        ...result.value,
        battleVolatileMemory: previous.battleVolatileMemory ?? "",
        interior: result.value.interior,
      }, selfReference),
      expressionBrief: defaultExpressionBrief(previous),
    };
  };
  const psycheAResult = applyPsyche(
    psycheResultA,
    previousA,
    input.mine,
    input.after.encounterContext?.social.a.selfReference,
  );
  const psycheBResult = applyPsyche(
    psycheResultB,
    previousB,
    input.opp,
    input.after.encounterContext?.social.b.selfReference,
  );
  const psycheA = psycheAResult.state;
  const psycheB = psycheBResult.state;
  if (psycheResultA.status === "rejected") {
    console.warn("[battle] side A deep psyche retained prior state", psycheResultA.reason);
  }
  if (psycheResultB.status === "rejected") {
    console.warn("[battle] side B deep psyche retained prior state", psycheResultB.reason);
  }
  const toSpeechActionInput = (
    consumerInput: typeof inputA,
    psyche: CharacterAgentState,
    expressionBrief: CharacterExpressionBrief,
  ) => {
    if (!consumerInput) return null;
    if (compactContext) {
      const packet = consumerInput === inputA
        ? dialogueProjection?.a
        : dialogueProjection?.b;
      if (!packet) return null;
      const compactInput = {
        contextMode: "compact" as const,
        phase: consumerInput.phase,
        character: consumerInput.character,
        psyche: {
          emotion: psyche.emotion,
          speechStyle: psyche.speechStyle,
          interior: psyche.interior,
          selfReference: psyche.selfReference,
        },
        turnObservation: packet,
        conversation: {
          recentExchange: consumerInput.conversation.history
            .slice(-dialoguePipeline.recentExchangeLimit),
          anchoredExchange: psyche.dialogueThread?.anchoredExchange ?? null,
        },
        relevantMemory: dialoguePipeline.relevantMemoryLimit > 0
          ? [
              psyche.battleVolatileMemory?.trim(),
              psyche.privateMemory?.trim(),
            ].filter(Boolean).join("\n").slice(-240) || null
          : null,
        expressionBrief,
        ...(consumerInput.social ? { social: consumerInput.social } : {}),
        ...(consumerInput.counterpart ? { counterpart: consumerInput.counterpart } : {}),
        ...(consumerInput.decision ? { decision: consumerInput.decision } : {}),
      } satisfies CharacterExpressionCompactInput;
      return compactInput as unknown as Parameters<LlmProvider["advanceCharacterAgent"]>[0];
    }
    const { dialoguePipeline: _dialoguePipeline, ...speechActionInput } = consumerInput;
    return { ...speechActionInput, psyche };
  };
  const agentInputA = toSpeechActionInput(inputA, psycheA, psycheAResult.expressionBrief);
  const agentInputB = toSpeechActionInput(inputB, psycheB, psycheBResult.expressionBrief);
  let agents;
  try {
    agents = await withTimeout(Promise.allSettled([
      agentInputA ? input.llm.advanceCharacterAgent(agentInputA) : Promise.resolve(null),
      agentInputB ? input.llm.advanceCharacterAgent(agentInputB) : Promise.resolve(null),
    ]), FAST_LLM_ENVELOPE_TIMEOUT_MS, "advanceCharacterAgents");
  } catch (error) {
    console.warn(
      "[battle] character agents skipped",
      error instanceof Error ? error.message : error,
    );
    // A failed agent has no authoritative new utterance; retain prior state.
    return {
      state: refreshNarratorContinuity(stateWithRecord),
      characterSpeeches: [],
    };
  }
  const [resultA, resultB] = agents;
  const agentA = resultA.status === "fulfilled" ? resultA.value : null;
  const agentB = resultB.status === "fulfilled" ? resultB.value : null;
  if (resultA.status === "rejected") {
    console.warn("[battle] side A character agent retained previous state", resultA.reason);
  }
  if (resultB.status === "rejected") {
    console.warn("[battle] side B character agent retained previous state", resultB.reason);
  }
  const acceptedA = acceptCharacterAgentResult({
    result: agentA,
    previous: psycheA,
    side: "a",
    speaker: input.after.sideA.displayName,
    profile: agentInputA?.character ?? buildCharacterSelfProfileAnchor(
      input.mine,
      deriveBattleProfileStateOverrides({
        worldState: input.after.worldState,
        side: "a",
      }),
    ),
    preferredSelfReference: input.after.encounterContext?.social.a.selfReference,
    decision: agentInputA?.decision,
  });
  const acceptedB = acceptCharacterAgentResult({
    result: agentB,
    previous: psycheB,
    side: "b",
    speaker: input.after.sideB.displayName,
    profile: agentInputB?.character ?? buildCharacterSelfProfileAnchor(
      input.opp,
      deriveBattleProfileStateOverrides({
        worldState: input.after.worldState,
        side: "b",
      }),
    ),
    preferredSelfReference: input.after.encounterContext?.social.b.selfReference,
    decision: agentInputB?.decision,
  });
  const traceSide = (
    consumerInput: typeof agentInputA,
    providerResult: typeof resultA,
    providerOutput: CharacterAgentAdvanceResult | null,
    accepted: typeof acceptedA,
  ) => ({
    input: consumerInput ? structuredClone(consumerInput) : null,
    providerStatus: consumerInput
      ? providerResult.status === "fulfilled"
        ? "fulfilled" as const
        : "rejected" as const
      : "skipped" as const,
    providerOutput: providerOutput ? structuredClone(providerOutput) : null,
    actionProposalValidation: accepted.actionProposalValidation
      ? structuredClone(accepted.actionProposalValidation)
      : null,
    acceptedOutput: {
      state: structuredClone(accepted.state),
      nextAction: accepted.nextAction
        ? structuredClone(accepted.nextAction)
        : null,
      speech: accepted.speech ? structuredClone(accepted.speech) : null,
    },
  });
  const characterAgentTrace: NonNullable<
    BattleTurnPipelineTrace["characterAgents"]
  > = {
    phase: input.phase ?? "turn",
    a: traceSide(agentInputA, resultA, agentA, acceptedA),
    b: traceSide(agentInputB, resultB, agentB, acceptedB),
  };
  const tracePsycheSide = (
    consumerInput: typeof psycheInputA,
    providerResult: typeof psycheResultA,
    acceptedState: CharacterAgentState,
  ) => ({
    input: consumerInput ? structuredClone(consumerInput) : null,
    providerStatus: consumerInput
      ? providerResult.status === "fulfilled"
        ? "fulfilled" as const
        : "rejected" as const
      : "skipped" as const,
    providerOutput: providerResult.status === "fulfilled" && providerResult.value
      ? structuredClone(providerResult.value)
      : null,
    acceptedOutput: structuredClone(acceptedState),
  });
  const psycheTrace = {
    a: tracePsycheSide(psycheInputA, psycheResultA, psycheA),
    b: tracePsycheSide(psycheInputB, psycheResultB, psycheB),
  };
  const candidateSpeeches = [
    ...(acceptedA.speech ? [acceptedA.speech] : []),
    ...(acceptedB.speech ? [acceptedB.speech] : []),
  ];
  const utteranceEvents = buildCommittedUtteranceEvents({
    turn: input.after.turn,
    worldState: input.after.worldState,
    ...(input.phase === "aftermath" ? { scope: "aftermath" as const } : {}),
    sources: candidateSpeeches.map((speech) => ({
      ...speech,
      delivery: isStageReaction(speech.text)
        ? "visible_reaction" as const
        : "spoken" as const,
    })),
  });
  const committedSpeechSides = new Set(
    utteranceEvents.flatMap((event) => event.actorSide ? [event.actorSide] : []),
  );
  const characterSpeeches = candidateSpeeches.filter((speech) =>
    committedSpeechSides.has(speech.side)
  );
  const eventsWithUtterances = [...input.events, ...utteranceEvents];
  const speechEvidence = buildUtterancePerceptionEvidence({
    events: utteranceEvents,
    worldState: input.after.worldState,
    previousFrameA: input.after.perceptionFrameA,
    previousFrameB: input.after.perceptionFrameB,
  });
  let stateAfterUtterances: BattleState = {
    ...input.after,
    agentStateA: {
      ...acceptedA.state,
      lastSpeech: committedSpeechSides.has("a")
        ? acceptedA.state.lastSpeech
        : previousA.lastSpeech,
    },
    agentStateB: {
      ...acceptedB.state,
      lastSpeech: committedSpeechSides.has("b")
        ? acceptedB.state.lastSpeech
        : previousB.lastSpeech,
    },
    plannedActionA: input.phase === "aftermath"
      ? undefined
      : activeSides.has("a")
        ? acceptedA.nextAction
        : input.after.plannedActionA,
    plannedActionB: input.phase === "aftermath"
      ? undefined
      : activeSides.has("b")
        ? acceptedB.nextAction
        : input.after.plannedActionB,
  };
  stateAfterUtterances.agentStateA = {
    ...(stateAfterUtterances.agentStateA as CharacterAgentState),
    conversationHistory: extendConversationHistory({
      previous: previousA,
      side: "a",
      turn: input.after.turn,
      utteranceEvents,
      speechEvidence,
      limit: dialoguePipeline.conversationHistoryLimit,
    }),
  };
  stateAfterUtterances.agentStateB = {
    ...(stateAfterUtterances.agentStateB as CharacterAgentState),
    conversationHistory: extendConversationHistory({
      previous: previousB,
      side: "b",
      turn: input.after.turn,
      utteranceEvents,
      speechEvidence,
      limit: dialoguePipeline.conversationHistoryLimit,
    }),
  };
  if (stateAfterUtterances.semanticState) {
    try {
      const projectionBase = {
        turn: stateAfterUtterances.turn,
        semanticState: stateAfterUtterances.semanticState,
        worldState: stateAfterUtterances.worldState,
        events: eventsWithUtterances,
        quantizedMechanicalEvidence: input.quantizedMechanicalEvidence ?? [],
        sensoryEvidence: [
          ...(input.sensoryEvidence ?? []),
          ...speechEvidence,
        ],
      };
      const projectedA = projectObserverPerception({
        ...projectionBase,
        observerSide: "a",
        reserveEvidence: buildServerOnlyReserveCues({
          side: "a",
          parameters: stateAfterUtterances.sideA.parameters,
          baseParameters: stateAfterUtterances.sideA.baseParameters,
        }),
        previousFrame: input.before.perceptionFrameA,
        previousRegistry: input.before.perceptionRegistryA,
        legacyCounterpartIdentified:
          input.before.perceptionRegistryA === undefined,
      });
      const projectedB = projectObserverPerception({
        ...projectionBase,
        observerSide: "b",
        reserveEvidence: buildServerOnlyReserveCues({
          side: "b",
          parameters: stateAfterUtterances.sideB.parameters,
          baseParameters: stateAfterUtterances.sideB.baseParameters,
        }),
        previousFrame: input.before.perceptionFrameB,
        previousRegistry: input.before.perceptionRegistryB,
        legacyCounterpartIdentified:
          input.before.perceptionRegistryB === undefined,
      });
      stateAfterUtterances = {
        ...stateAfterUtterances,
        perceptionFrameA: projectedA.frame,
        perceptionFrameB: projectedB.frame,
        perceptionRegistryA: projectedA.registry,
        perceptionRegistryB: projectedB.registry,
      };
    } catch (error) {
      console.warn(
        "[battle] committed utterance projection retained prior frame",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const record = existingRecord
    ? {
        ...recordWithDialogueProjection,
        events: eventsWithUtterances,
        cognitionA: {
          ...recordWithDialogueProjection.cognitionA,
          observedEvents: eventsWithUtterances,
        },
        cognitionB: {
          ...recordWithDialogueProjection.cognitionB,
          observedEvents: eventsWithUtterances,
        },
        pipelineTrace: {
          schemaVersion: 1 as const,
          ...(recordWithDialogueProjection.pipelineTrace ?? {}),
          deepPsyche: psycheTrace,
          characterAgents: characterAgentTrace,
        },
      }
    : {
        ...buildBattleTurnRecord({
          before: input.before,
          after: stateAfterUtterances,
          events: eventsWithUtterances,
          actions: input.actions,
          mechanicalEvidence: input.mechanicalEvidence,
        }),
        pipelineTrace: {
          schemaVersion: 1 as const,
          ...(recordWithDialogueProjection.pipelineTrace ?? {}),
          deepPsyche: psycheTrace,
          characterAgents: characterAgentTrace,
        },
      };
  const receiptOwnedEventIds = new Set(
    record.consequenceReceipts?.flatMap((receipt) => receipt.eventIds) ?? [],
  );
  const addedEventIds = eventsWithUtterances.flatMap((event) =>
    event.id && !receiptOwnedEventIds.has(event.id) ? [event.id] : []
  );
  const recordWithUtteranceProvenance = record.consequenceReceipts &&
      addedEventIds.length > 0
    ? {
        ...record,
        consequenceReceipts: record.consequenceReceipts.map((receipt) =>
          receipt.source.kind === "system_rules" &&
            receipt.source.stage === "turn_resolution"
            ? { ...receipt, eventIds: [...receipt.eventIds, ...addedEventIds] }
            : receipt
        ),
      }
    : record;
  return {
    state: refreshNarratorContinuity({
      ...stateAfterUtterances,
      turnRecords: [
        ...previousRecords,
        recordWithUtteranceProvenance,
      ].slice(-50),
    }),
    characterSpeeches,
  };
}

type CharacterAgentAdvanceResult = Awaited<
  ReturnType<LlmProvider["advanceCharacterAgent"]>
>;

/**
 * Validate one bounded model proposal against the server-owned decision frame.
 * The proposal remains evidence even when no following-turn action is accepted.
 */
export function validateCharacterActionProposal(input: {
  proposedAction: unknown | null;
  decision?: Parameters<LlmProvider["advanceCharacterAgent"]>[0]["decision"];
}): CharacterActionProposalValidationReceipt {
  const proposedAction = input.proposedAction ?? null;
  if (!input.decision) {
    return {
      status: "omitted",
      reason: "no_decision_context",
      proposedAction,
      acceptedAction: null,
    };
  }
  if (proposedAction === null) {
    return {
      status: "rejected",
      reason: "missing_proposal",
      proposedAction: null,
      acceptedAction: null,
    };
  }
  const parsed = CharacterActionIntentSchema.safeParse(proposedAction);
  if (!parsed.success) {
    return {
      status: "rejected",
      reason: "schema_invalid",
      proposedAction,
      acceptedAction: null,
    };
  }
  const candidate = parsed.data;
  const listed = input.decision.availableActions.find((action) =>
    action.kind === candidate.kind && action.skillId === candidate.skillId
  );
  if (!listed) {
    return {
      status: "rejected",
      reason: "unavailable_action",
      proposedAction,
      acceptedAction: null,
    };
  }
  if (
    candidate.useFinisher &&
    !(
      listed.finisherCandidate &&
      input.decision.finisher?.unlocked &&
      input.decision.finisher.remainingUses > 0
    )
  ) {
    return {
      status: "rejected",
      reason: "unavailable_finisher",
      proposedAction,
      acceptedAction: null,
    };
  }
  const affordanceRefs = new Set(
    input.decision.affordances?.map((affordance) => affordance.ref) ?? [],
  );
  if (
    candidate.kind === "free_action" &&
    (!(candidate.subjectRefs ?? []).every((ref) => affordanceRefs.has(ref)) ||
      (candidate.opportunityId &&
        !input.decision.opportunityChains?.some((chain) =>
          chain.id === candidate.opportunityId
        )))
  ) {
    return {
      status: "rejected",
      reason: "ungrounded_free_action",
      proposedAction,
      acceptedAction: null,
    };
  }
  if (
    candidate.instrumentRef &&
    (!affordanceRefs.has(candidate.instrumentRef) ||
      !input.decision.opportunityChains?.some((chain) =>
        chain.setupTurns === 0 &&
        chain.continuation.actionKind === candidate.kind &&
        chain.continuation.instrumentRef === candidate.instrumentRef
      ))
  ) {
    return {
      status: "rejected",
      reason: "unavailable_instrument",
      proposedAction,
      acceptedAction: null,
    };
  }
  const last = input.decision.lastAction;
  const sameAsLast = Boolean(
    last &&
    candidate.kind === last.kind &&
    (candidate.skillId ?? null) === (last.skillId ?? null),
  );
  const hasAlternative = input.decision.availableActions.some((action) =>
    !(
      last &&
      action.kind === last.kind &&
      (action.skillId ?? null) === (last.skillId ?? null)
    )
  );
  if (
    input.decision.varietyPressure === "require_change" &&
    sameAsLast &&
    hasAlternative
  ) {
    return {
      status: "rejected",
      reason: "repeated_action_requires_change",
      proposedAction,
      acceptedAction: null,
    };
  }
  return {
    status: "accepted",
    reason: null,
    proposedAction,
    acceptedAction: candidate,
  };
}

/**
 * Accept one speech/action result. Psychological state is already committed by
 * the preceding deep-psyche stage, so this later stage cannot overwrite it.
 */
export function acceptCharacterAgentResult(input: {
  result: CharacterAgentAdvanceResult | null;
  previous: CharacterAgentState;
  side: "a" | "b";
  speaker: string;
  profile: Parameters<LlmProvider["advanceCharacterAgent"]>[0]["character"];
  preferredSelfReference?: string | null;
  decision?: Parameters<LlmProvider["advanceCharacterAgent"]>[0]["decision"];
}) {
  const selfReference = input.preferredSelfReference !== undefined &&
      (input.preferredSelfReference === null ||
        input.profile.identity.selfNames.includes(input.preferredSelfReference))
    ? input.preferredSelfReference
    : canonicalSelfReference(input.profile);
  if (!input.result) {
    return {
      state: {
        ...input.previous,
        selfReference,
      },
      nextAction: undefined,
      actionProposalValidation: null,
      speech: null,
    };
  }
  const text = coerceCharacterSpeech(input.result.speech);
  const actionProposalValidation = validateCharacterActionProposal({
    proposedAction: input.result.proposedAction,
    decision: input.decision,
  });
  const nextAction = actionProposalValidation.acceptedAction ?? undefined;
  return {
    state: {
      ...input.previous,
      selfReference,
      lastSpeech: text,
    },
    nextAction,
    actionProposalValidation,
    speech: {
      side: input.side,
      speaker: input.speaker,
      text,
    } satisfies CharacterSpeechSource,
  };
}

/** Build bounded canonical adjudication input without any public prose. */
export function buildRefereeTurnFacts(
  records: readonly BattleTurnRecord[],
): RefereeTurnFact[] {
  return records.slice(-12).map((record) => ({
    turn: record.turn,
    actions: record.actions.map((action) => ({
      actorSide: action.actorSide,
      kind: action.kind,
      executed: action.executed,
      skippedReason: action.skippedReason,
      resolutionReason: action.resolution?.reason ?? null,
    })),
    effects: record.events.flatMap((event) => event.type === "utterance"
      ? []
      : [{
          type: event.type,
          actorSide: event.actorSide ?? null,
          targetSides: event.targetSides ?? [],
          parameterKey: event.parameterKey ?? null,
          parameterDirection: event.parameterDirection ?? null,
          intensity: event.intensity ?? null,
        }]),
    stateChanges: {
      a: {
        canFightBefore: record.sideAChange.canFightBefore,
        canFightAfter: record.sideAChange.canFightAfter,
      },
      b: {
        canFightBefore: record.sideBChange.canFightBefore,
        canFightAfter: record.sideBChange.canFightAfter,
      },
    },
    worldImpact: record.worldImpact ?? null,
  }));
}

function reserveBand(current: number, maximum: number): "empty" | "low" | "available" | "ample" {
  if (current <= 0) return "empty";
  const ratio = current / Math.max(1, maximum);
  if (ratio <= 0.25) return "low";
  if (ratio <= 0.6) return "available";
  return "ample";
}

/** Final canonical condition supplied to adjudication without raw totals. */
export function buildRefereeFinalState(state: BattleState): RefereeFinalState {
  const side = (combatant: BattleState["sideA"]): RefereeFinalState["a"] => ({
    condition: perceivedCondition(combatant),
    reserves: {
      hp: reserveBand(combatant.parameters.hp ?? 0, combatant.parameters.maxHp ?? 1),
      mp: reserveBand(combatant.parameters.mp ?? 0, combatant.parameters.maxMp ?? 1),
      stamina: reserveBand(
        combatant.parameters.stamina ?? 0,
        combatant.parameters.maxStamina ?? 1,
      ),
    },
  });
  return { a: side(state.sideA), b: side(state.sideB) };
}

/** Normalize one raw semantic judgment into the persisted result authority. */
export function buildBattleAdjudication(input: {
  turn: number;
  engineWinnerSide: "a" | "b" | "draw" | null;
  turnFacts: readonly RefereeTurnFact[];
  result?: RefereeResult;
}): BattleAdjudication {
  const engineFallbackSide = input.engineWinnerSide ?? "draw";
  // ADR-0006: provider output may explain the committed result, never select it.
  const winnerSide = engineFallbackSide;
  const reason = input.result?.reason.trim().slice(0, 600) ||
    "確定した行動、影響、残力を総合して判定した。";
  const parsedFacts = (input.result?.reasonFacts ?? []).flatMap((fact) => {
    const parsed = BattleAdjudicationSchema.shape.reasonFacts.element.safeParse(fact);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 6);
  const turns = input.turnFacts.map((fact) => fact.turn);
  return BattleAdjudicationSchema.parse({
    schemaVersion: 1,
    turn: input.turn,
    winnerSide,
    reason,
    reasonFacts: parsedFacts.length > 0
      ? parsedFacts
      : [{
          factor: "overall_effectiveness",
          favoredSide: winnerSide,
          statement: reason.slice(0, 240),
        }],
    source: input.result
      ? "semantic_adjudicator"
      : "deterministic_fallback",
    engineFallbackSide,
    inputTurnRange: {
      from: turns.length > 0 ? Math.min(...turns) : input.turn,
      to: turns.length > 0 ? Math.max(...turns) : input.turn,
    },
  });
}

/**
 * Keep the adjudicator's verdict immutable while allowing the narrator to add
 * presentation-only framing based on the public story so far.
 */
export function buildJudgmentNarrativeBlock(input: {
  turn: number;
  sideAName: string;
  sideBName: string;
  winnerSide: "a" | "b" | "draw";
  adjudicationReason: string;
  presentation?: JudgmentNarrationResult;
}): NarrativeBlock {
  const winnerName = input.winnerSide === "a"
    ? input.sideAName
    : input.winnerSide === "b"
      ? input.sideBName
      : null;
  const reason = input.adjudicationReason.trim() ||
    "確定した行動と影響を総合して判定した。";
  const verdict = winnerName
    ? `判定は ${winnerName} の勝利。${reason}`
    : `判定は引き分け。${reason}`;
  const framing = (lines: readonly string[] | undefined) => (lines ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  return {
    turn: input.turn,
    narrator: [
      "——判定——",
      ...framing(input.presentation?.before),
      verdict,
      ...framing(input.presentation?.after),
    ],
    speeches: [],
  };
}

/** Insert the immutable terminal outcome between presentation-only framing. */
export function buildAftermathNarrativeBlock(input: {
  turn: number;
  winnerName: string | null;
  fallenNames: string[];
  presentation?: AftermathNarrationResult;
  characterSpeeches?: readonly CharacterSpeechSource[];
}): NarrativeBlock {
  const fallen = input.fallenNames.length > 0
    ? input.fallenNames.join("と")
    : "続行できなくなった者";
  const outcome = input.winnerName
    ? `${fallen} は対決を続けられない。結果は ${input.winnerName} の勝利として確定した。`
    : `${fallen} は対決を続けられない。結果は引き分けとして確定した。`;
  const forbidden = [
    input.winnerName,
    ...input.fallenNames,
    "勝",
    "負",
    "引き分け",
    "戦闘不能",
    "続けられ",
    "回復",
    "復活",
    "winner",
    "loser",
    "recover",
  ].filter((value): value is string => Boolean(value));
  const framing = (lines: readonly string[] | undefined) => (lines ?? [])
    .map((line) => line.trim())
    .filter((line) =>
      Boolean(line) && !forbidden.some((token) =>
        line.toLocaleLowerCase().includes(token.toLocaleLowerCase())
      )
    )
    .slice(0, 3);
  const block: NarrativeBlock = {
    turn: input.turn,
    narrator: [
      "——決着の余波——",
      ...framing(input.presentation?.before),
      outcome,
      ...framing(input.presentation?.after),
    ],
    speeches: input.presentation?.speeches ?? [],
  };
  block.speeches = finalizeCharacterSpeeches({
    narrative: block,
    sources: input.characterSpeeches ?? [],
  });
  return block;
}

function environmentProposalEvent(
  proposal: EnvironmentProcessProposal,
): TurnEvent {
  return {
    id: proposal.id,
    type: "situation",
    summary: `${proposal.title} — ${proposal.summary}`,
  };
}

function isEnvironmentOperationPath(path: string): boolean {
  if (path.startsWith("/scene/")) return true;
  if (!path.startsWith("/entities/")) return false;
  return path !== "/entities/character.a" &&
    path !== "/entities/character.b" &&
    !path.startsWith("/entities/character.a/") &&
    !path.startsWith("/entities/character.b/");
}

function isWorldProcessCanonicalOperation(
  operation: TurnSemanticPatch["operations"][number],
  before: NonNullable<BattleState["semanticState"]>,
): boolean {
  const matched = operation.path.match(
    /^\/entities\/([^/]+)(?:\/(location|active))?$/,
  );
  if (!matched) return false;
  const [, entityId, field] = matched;
  if (!entityId || entityId === "character.a" || entityId === "character.b") {
    return false;
  }
  if (!field) {
    return operation.op === "add" && before.entities[entityId] === undefined;
  }
  if (operation.op !== "replace") return false;
  const current = field === "location"
    ? before.entities[entityId]?.location
    : before.entities[entityId]?.active;
  return JSON.stringify(current) !== JSON.stringify(operation.value);
}

export async function reconcileSemanticState(input: {
  llm: LlmProvider;
  stateBeforeTurn: BattleState;
  resolvedState: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  mechanicalEvidence: CommittedMechanicalEvidence[];
  environmentBeatDue?: boolean;
  environmentProposal?: EnvironmentProcessProposal | null;
  dramaPhase?: "opening" | "rising" | "climax";
}): Promise<{
  state: BattleState;
  patch: TurnSemanticPatch | null;
  status: "applied" | "rejected" | "skipped";
  mechanicalEvidence: CommittedMechanicalEvidence[];
  mechanicalEvidenceStatus: EvidenceValidationStatus;
  sensoryEvidence: PerceptionEvidence[];
  sensoryEvidenceStatus: EvidenceValidationStatus;
  quantizedMechanicalEvidence: QuantizedMechanicalEvidence[];
  reserveEvidenceA: ServerOnlyReserveCue[];
  reserveEvidenceB: ServerOnlyReserveCue[];
  environmentProcessReceipt: EnvironmentProcessReceipt | null;
  environmentEvents: TurnEvent[];
}> {
  const environmentProposal = input.environmentProposal ?? null;
  const proposedEnvironmentEvent = environmentProposal
    ? environmentProposalEvent(environmentProposal)
    : null;
  const environmentOutcome = (input: {
    status: EnvironmentProcessReceipt["status"];
    reason: EnvironmentProcessReceipt["reason"];
    decisionReason?: string | null;
    effectKeys?: string[];
    sourceEventIds?: string[];
    accepted?: boolean;
  }) => ({
    environmentProcessReceipt: environmentProposal
      ? {
          status: input.status,
          reason: input.reason,
          decisionReason: input.decisionReason?.slice(0, 240) ?? null,
          proposal: structuredClone(environmentProposal),
          resolvedEvent: input.accepted && proposedEnvironmentEvent
            ? structuredClone(proposedEnvironmentEvent)
            : null,
          sourceEventIds: [...new Set(input.sourceEventIds ?? [])].slice(0, 32),
          effectKeys: [...new Set(input.effectKeys ?? [])].slice(0, 32),
        } satisfies EnvironmentProcessReceipt
      : null,
    environmentEvents: input.accepted && proposedEnvironmentEvent
      ? [proposedEnvironmentEvent]
      : [],
  });
  const reserveEvidenceA = buildServerOnlyReserveCues({
    side: "a",
    parameters: input.resolvedState.sideA.parameters,
    baseParameters: input.resolvedState.sideA.baseParameters,
  });
  const reserveEvidenceB = buildServerOnlyReserveCues({
    side: "b",
    parameters: input.resolvedState.sideB.parameters,
    baseParameters: input.resolvedState.sideB.baseParameters,
  });
  const semanticBefore = input.stateBeforeTurn.semanticState;
  if (!semanticBefore) {
    return {
      state: input.resolvedState,
      patch: null,
      status: "skipped",
      mechanicalEvidence: [],
      mechanicalEvidenceStatus: "unavailable",
      sensoryEvidence: [],
      sensoryEvidenceStatus: "unavailable",
      quantizedMechanicalEvidence: [],
      reserveEvidenceA,
      reserveEvidenceB,
      ...environmentOutcome({
        status: "skipped",
        reason: "semantic_unavailable",
      }),
    };
  }
  const previousUtteranceEvents = (
    input.stateBeforeTurn.turnRecords.at(-1)?.events ?? []
  ).filter((event) => event.type === "utterance" && event.utterance);
  const carriedUtteranceEvidence = buildUtterancePerceptionEvidence({
    events: previousUtteranceEvents,
    worldState: input.stateBeforeTurn.worldState,
    previousFrameA: input.stateBeforeTurn.perceptionFrameA,
    previousFrameB: input.stateBeforeTurn.perceptionFrameB,
  });
  const mechanical = validateCommittedMechanicalEvidence({
    raw: input.mechanicalEvidence,
    turn: input.resolvedState.turn,
    before: semanticBefore,
    actions: input.actions,
    events: input.events,
  });
  if (mechanical.status === "rejected") {
    console.warn(
      "[battle] committed mechanical evidence rejected",
      mechanical.issues.join("; "),
    );
  }
  const quantizedMechanicalEvidence = quantizeCommittedMechanicalEvidence(
    mechanical.evidence,
  );
  const evidenceResult = (
    sensory: ReturnType<typeof validateSensoryEvidence>,
  ) => ({
    mechanicalEvidence: mechanical.evidence,
    mechanicalEvidenceStatus: mechanical.status,
    sensoryEvidence: sensory.evidence,
    sensoryEvidenceStatus: sensory.status,
    quantizedMechanicalEvidence,
    reserveEvidenceA,
    reserveEvidenceB,
  });
  const projectPerceptionState = (
    state: BattleState,
    sensoryEvidence: PerceptionEvidence[],
    committedEvents: TurnEvent[],
  ): BattleState => {
    const semanticState = state.semanticState!;
    const projectionSensoryEvidence = [
      ...sensoryEvidence,
      ...carriedUtteranceEvidence,
    ];
    const projectionBase = {
      turn: state.turn,
      semanticState,
      worldState: state.worldState,
      quantizedMechanicalEvidence,
    };
    try {
      const projectedA = projectObserverPerception({
        ...projectionBase,
        observerSide: "a",
        events: [...committedEvents, ...previousUtteranceEvents],
        reserveEvidence: reserveEvidenceA,
        sensoryEvidence: projectionSensoryEvidence,
        previousFrame: input.stateBeforeTurn.perceptionFrameA,
        previousRegistry: input.stateBeforeTurn.perceptionRegistryA,
        legacyCounterpartIdentified:
          input.stateBeforeTurn.perceptionRegistryA === undefined,
      });
      const projectedB = projectObserverPerception({
        ...projectionBase,
        observerSide: "b",
        events: [...committedEvents, ...previousUtteranceEvents],
        reserveEvidence: reserveEvidenceB,
        sensoryEvidence: projectionSensoryEvidence,
        previousFrame: input.stateBeforeTurn.perceptionFrameB,
        previousRegistry: input.stateBeforeTurn.perceptionRegistryB,
        legacyCounterpartIdentified:
          input.stateBeforeTurn.perceptionRegistryB === undefined,
      });
      return {
        ...state,
        perceptionFrameA: projectedA.frame,
        perceptionFrameB: projectedB.frame,
        perceptionRegistryA: projectedA.registry,
        perceptionRegistryB: projectedB.registry,
      };
    } catch (error) {
      console.warn(
        "[battle] observer perception projection fell back to engine cues",
        error instanceof Error ? error.message : error,
      );
      const projectedA = buildMinimalObserverPerception({
        ...projectionBase,
        observerSide: "a",
        reserveEvidence: reserveEvidenceA,
        previousFrame: input.stateBeforeTurn.perceptionFrameA,
        previousRegistry: input.stateBeforeTurn.perceptionRegistryA,
        legacyCounterpartIdentified:
          input.stateBeforeTurn.perceptionRegistryA === undefined,
      });
      const projectedB = buildMinimalObserverPerception({
        ...projectionBase,
        observerSide: "b",
        reserveEvidence: reserveEvidenceB,
        previousFrame: input.stateBeforeTurn.perceptionFrameB,
        previousRegistry: input.stateBeforeTurn.perceptionRegistryB,
        legacyCounterpartIdentified:
          input.stateBeforeTurn.perceptionRegistryB === undefined,
      });
      return {
        ...state,
        perceptionFrameA: projectedA.frame,
        perceptionFrameB: projectedB.frame,
        perceptionRegistryA: projectedA.registry,
        perceptionRegistryB: projectedB.registry,
      };
    }
  };
  const commitObservationState = (
    after: typeof semanticBefore,
    status: "applied" | "rejected" | "skipped",
    patch: TurnSemanticPatch | null,
    sensoryEvidence: PerceptionEvidence[],
    worldState = input.resolvedState.worldState,
    latestWorldTransition: BattleState["latestWorldTransition"] = {
      turn: input.resolvedState.turn,
      status: "skipped",
      fromRevision: input.resolvedState.worldState?.revision ?? 0,
      toRevision: input.resolvedState.worldState?.revision ?? 0,
      transition: null,
    },
    committedEvents: TurnEvent[] = input.events,
  ): BattleState => projectPerceptionState({
    ...input.resolvedState,
    semanticState: after,
    worldState,
    observationStateA: buildSemanticObservationState({
      before: semanticBefore,
      after,
      observer: "a",
      previousSnapshot: input.stateBeforeTurn.observationStateA?.snapshot,
    }),
    observationStateB: buildSemanticObservationState({
      before: semanticBefore,
      after,
      observer: "b",
      previousSnapshot: input.stateBeforeTurn.observationStateB?.snapshot,
    }),
    observationStatePublic: buildSemanticObservationState({
      before: semanticBefore,
      after,
      observer: "public",
      previousSnapshot: input.stateBeforeTurn.observationStatePublic?.snapshot,
    }),
    latestSemanticTransition: {
      turn: input.resolvedState.turn,
      status,
      fromRevision: semanticBefore.revision,
      toRevision: after.revision,
      patch,
    },
    latestWorldTransition,
  }, sensoryEvidence, committedEvents);
  try {
    const proposed = await withTimeout(
      input.llm.reconcileTurnSemanticState({
        turn: input.resolvedState.turn,
        before: semanticBefore,
        actions: input.actions,
        events: input.events,
        battlefield: input.resolvedState.battlefield,
        characters: {
          a: {
            displayName: input.mine.displayName,
            appearanceSummary: input.mine.appearance.summary,
            traits: input.mine.traits,
            basicAttack: {
              name: input.mine.basicAttack?.name ?? "基本アクション",
              description: input.mine.basicAttack?.description ?? "そのキャラクターらしい基本行動。",
            },
            skills: input.mine.skills.map(({ id, name, description }) => ({
              id,
              name,
              description,
            })),
          },
          b: {
            displayName: input.opp.displayName,
            appearanceSummary: input.opp.appearance.summary,
            traits: input.opp.traits,
            basicAttack: {
              name: input.opp.basicAttack?.name ?? "基本アクション",
              description: input.opp.basicAttack?.description ?? "そのキャラクターらしい基本行動。",
            },
            skills: input.opp.skills.map(({ id, name, description }) => ({
              id,
              name,
              description,
            })),
          },
        },
        environmentBeatDue: input.environmentBeatDue,
        environmentProposal,
        dramaPhase: input.dramaPhase,
        mechanicalEvidence: buildPromptMechanicalEvidence({
          evidence: quantizedMechanicalEvidence,
          events: input.events,
        }),
      }),
      FAST_LLM_ENVELOPE_TIMEOUT_MS,
      "reconcileTurnSemanticState",
    );
    const worldProcessOperationPaths = proposed.patch?.operations
      .filter((operation) =>
        isWorldProcessCanonicalOperation(operation, semanticBefore)
      )
      .map((operation) => operation.path) ?? [];
    const environmentDecision = proposed.environmentDecision ?? null;
    const environmentAcceptedCandidate = Boolean(
      environmentProposal &&
        input.resolvedState.worldState &&
        environmentDecision?.status === "accepted" &&
        worldProcessOperationPaths.length > 0,
    );
    const environmentReason: EnvironmentProcessReceipt["reason"] =
      !environmentProposal
        ? "semantic_unavailable"
        : !environmentDecision
          ? "decision_invalid"
          : environmentDecision.status === "rejected"
            ? "decision_rejected"
            : !input.resolvedState.worldState ||
                worldProcessOperationPaths.length === 0
              ? "no_canonical_change"
              : "accepted_canonical_change";
    const patchForApply = proposed.patch && environmentProposal &&
        !environmentAcceptedCandidate
      ? {
          ...proposed.patch,
          sourceEventIds: proposed.patch.sourceEventIds.filter(
            (eventId) => eventId !== environmentProposal.id,
          ),
          operations: proposed.patch.operations.filter(
            (operation) => !isEnvironmentOperationPath(operation.path),
          ),
        }
      : proposed.patch;
    const nextSituationForApply = environmentProposal &&
        !environmentAcceptedCandidate
      ? undefined
      : proposed.nextSituation;
    const eventsForEnvironmentDecision = environmentAcceptedCandidate &&
        proposedEnvironmentEvent
      ? [...input.events, proposedEnvironmentEvent]
      : input.events;
    const sensory = validateSensoryEvidence({
      raw: proposed.sensoryEvidence,
      before: semanticBefore,
      events: eventsForEnvironmentDecision,
      providerStatus: proposed.sensoryEvidenceStatus,
    });
    if (sensory.status === "rejected") {
      console.warn(
        "[battle] sensory evidence rejected",
        sensory.issues.join("; "),
      );
    }
    const sensoryOnEnvironmentFailure = environmentProposal
      ? {
          ...sensory,
          evidence: sensory.evidence.filter(
            (item) => !item.basisEventIds.includes(environmentProposal.id),
          ),
        }
      : sensory;
    if (proposed.worldPatchStatus === "rejected" || patchForApply === null) {
      console.warn("[battle] semantic patch section rejected");
      return {
        state: commitObservationState(
          semanticBefore,
          "rejected",
          null,
          sensoryOnEnvironmentFailure.evidence,
        ),
        patch: null,
        status: "rejected",
        ...evidenceResult(sensoryOnEnvironmentFailure),
        ...environmentOutcome({
          status: "rejected",
          reason: "semantic_rejected",
          decisionReason: environmentDecision?.reason,
        }),
      };
    }
    const applied = applyTurnSemanticPatch({
      state: semanticBefore,
      patch: patchForApply,
      turn: input.resolvedState.turn,
      allowedSourceEventIds: new Set(
        eventsForEnvironmentDecision.flatMap((event) => event.id ? [event.id] : []),
      ),
    });
    if (!applied.ok) {
      console.warn(
        `[battle] semantic patch rejected ${applied.error.code}: ${applied.error.message}`,
      );
      return {
        state: commitObservationState(
          semanticBefore,
          "rejected",
          patchForApply,
          sensoryOnEnvironmentFailure.evidence,
        ),
        patch: patchForApply,
        status: "rejected",
        ...evidenceResult(sensoryOnEnvironmentFailure),
        ...environmentOutcome({
          status: "rejected",
          reason: "semantic_rejected",
          decisionReason: environmentDecision?.reason,
        }),
      };
    }
    let committedWorldState = input.resolvedState.worldState;
    let latestWorldTransition: BattleState["latestWorldTransition"] = {
      turn: input.resolvedState.turn,
      status: "skipped",
      fromRevision: committedWorldState?.revision ?? 0,
      toRevision: committedWorldState?.revision ?? 0,
      transition: null,
    };
    if (committedWorldState) {
      const derivedWorld = deriveBattleWorldTransitionFromSemanticState({
        worldState: committedWorldState,
        semanticState: applied.state,
        turn: input.resolvedState.turn,
        sourceEventIds: patchForApply.sourceEventIds,
      });
      if (!derivedWorld.ok) {
        console.warn(
          `[battle] derived world transition rejected: ${derivedWorld.error}`,
        );
        return {
          state: commitObservationState(
            semanticBefore,
            "rejected",
            patchForApply,
            sensoryOnEnvironmentFailure.evidence,
            committedWorldState,
            {
              turn: input.resolvedState.turn,
              status: "rejected",
              fromRevision: committedWorldState.revision,
              toRevision: committedWorldState.revision,
              transition: null,
            },
          ),
          patch: patchForApply,
          status: "rejected",
          ...evidenceResult(sensoryOnEnvironmentFailure),
          ...environmentOutcome({
            status: "rejected",
            reason: "semantic_rejected",
            decisionReason: environmentDecision?.reason,
          }),
        };
      }
      const appliedWorld = applyBattleWorldTransition({
        state: committedWorldState,
        transition: derivedWorld.transition,
        turn: input.resolvedState.turn,
        allowedSourceEventIds: new Set(
          eventsForEnvironmentDecision.flatMap((event) => event.id ? [event.id] : []),
        ),
      });
      if (!appliedWorld.ok) {
        console.warn(
          `[battle] world transition rejected ${appliedWorld.error.code}: ${appliedWorld.error.message}`,
        );
        return {
          state: commitObservationState(
            semanticBefore,
            "rejected",
            patchForApply,
            sensoryOnEnvironmentFailure.evidence,
            committedWorldState,
            {
              turn: input.resolvedState.turn,
              status: "rejected",
              fromRevision: committedWorldState.revision,
              toRevision: committedWorldState.revision,
              transition: derivedWorld.transition,
            },
          ),
          patch: patchForApply,
          status: "rejected",
          ...evidenceResult(sensoryOnEnvironmentFailure),
          ...environmentOutcome({
            status: "rejected",
            reason: "semantic_rejected",
            decisionReason: environmentDecision?.reason,
          }),
        };
      }
      committedWorldState = appliedWorld.state;
      latestWorldTransition = {
        turn: input.resolvedState.turn,
        status: "applied",
        fromRevision: derivedWorld.transition.baseRevision,
        toRevision: committedWorldState.revision,
        transition: derivedWorld.transition,
      };
    }
    const situation = applySituationCoefficients(
      input.resolvedState.situation,
      {
        ...nextSituationForApply,
        scene: applied.state.scene.summary || input.resolvedState.situation.scene,
      },
      input.resolvedState.battlefield?.coefficients,
    );
    const environmentEffectKeys = environmentAcceptedCandidate
      ? [
          ...worldProcessOperationPaths,
          ...Object.keys(nextSituationForApply?.coefficients ?? {}).map(
            (key) => `situation.coefficients.${key}`,
          ),
          ...(nextSituationForApply?.notes ? ["situation.notes"] : []),
          ...(nextSituationForApply?.tags?.length ? ["situation.tags"] : []),
        ]
      : [];
    return {
      state: {
        ...commitObservationState(
          applied.state,
          "applied",
          patchForApply,
          sensory.evidence,
          committedWorldState,
          latestWorldTransition,
          eventsForEnvironmentDecision,
        ),
        situation,
      },
      patch: patchForApply,
      status: "applied",
      ...evidenceResult(sensory),
      ...environmentOutcome({
        status: environmentAcceptedCandidate ? "accepted" : "rejected",
        reason: environmentReason,
        decisionReason: environmentDecision?.reason,
        effectKeys: environmentEffectKeys,
        sourceEventIds: environmentAcceptedCandidate && environmentProposal
          ? [environmentProposal.id]
          : [],
        accepted: environmentAcceptedCandidate,
      }),
    };
  } catch (error) {
    console.warn(
      "[battle] semantic reconciliation skipped",
      error instanceof Error ? error.message : error,
    );
    return {
      state: commitObservationState(semanticBefore, "skipped", null, []),
      patch: null,
      status: "skipped",
      ...evidenceResult({
        status: "unavailable",
        evidence: [],
        issues: [],
      }),
      ...environmentOutcome({
        status: "skipped",
        reason: "semantic_unavailable",
      }),
    };
  }
}

async function resolveNarrationFocusAndDigests(input: {
  llm: LlmProvider;
  perspective: NarrationPerspective;
  turn: number;
  scene: string;
  sideAName: string;
  sideBName: string;
  events: TurnEvent[];
  agentStateA: CharacterAgentState | null | undefined;
  agentStateB: CharacterAgentState | null | undefined;
  cognitionA: CharacterCognition | null | undefined;
  cognitionB: CharacterCognition | null | undefined;
  perceptionFrameA: BattleState["perceptionFrameA"];
  perceptionFrameB: BattleState["perceptionFrameB"];
}): Promise<{ focus: NarrationFocus; digests: InnerDigest[] }> {
  const summaryA = buildInnerDigest({
    side: "a",
    displayName: input.sideAName,
    agent: input.agentStateA,
    cognition: input.cognitionA,
    perception: input.perceptionFrameA,
    level: "summary",
  });
  const summaryB = buildInnerDigest({
    side: "b",
    displayName: input.sideBName,
    agent: input.agentStateB,
    cognition: input.cognitionB,
    perception: input.perceptionFrameB,
    level: "summary",
  });
  const detailA = buildInnerDigest({
    side: "a",
    displayName: input.sideAName,
    agent: input.agentStateA,
    cognition: input.cognitionA,
    perception: input.perceptionFrameA,
    level: "detail",
  });
  const detailB = buildInnerDigest({
    side: "b",
    displayName: input.sideBName,
    agent: input.agentStateB,
    cognition: input.cognitionB,
    perception: input.perceptionFrameB,
    level: "detail",
  });

  let focus = lockedFocusFromPerspective(input.perspective);
  if (focus == null || needsFocusChoice(input.perspective)) {
    // Focus is presentation-only and is resolved by the ordered narration
    // worker. Canonical advance must not invoke a narration provider.
    focus = "external";
  }

  return {
    focus,
    digests: selectDigestsForFocus({ focus, detailA, detailB }),
  };
}

function buildNarrationActionBeats(input: {
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  mine: CharacterSheet;
  opp: CharacterSheet;
  state: BattleState;
}): NarrationActionBeat[] {
  return input.actions.map((action) => {
    const sheet = action.actorSide === "a" ? input.mine : input.opp;
    const skill = action.skillId
      ? sheet.skills.find((candidate) => candidate.id === action.skillId)
      : null;
    const actionName = skill?.name ?? (
      action.kind === "basic_attack"
        ? sheet.basicAttack?.name ?? "基本アクション"
        : action.kind === "defend"
          ? "態勢を整える"
          : action.kind === "rest"
            ? "力を取り戻す"
            : action.kind === "wait"
              ? "機をうかがう"
              : action.kind === "reflect"
                ? "戦況を省みる"
              : "行動"
    );
    const description = skill?.description ?? (
      action.kind === "basic_attack"
        ? sheet.basicAttack?.description ?? "そのキャラクターらしい基本行動。"
        : actionName
    );
    const policies = action.actorSide === "a"
      ? input.state.policiesA
      : input.state.policiesB;
    const selectedIds = action.actorSide === "a"
      ? input.state.selectedPolicyIdsA
      : input.state.selectedPolicyIdsB;
    return {
      actionId: action.id,
      actorSide: action.actorSide,
      actorName: sheet.displayName,
      actionKind: action.kind,
      actionName,
      description,
      intent: summarizeSelectedPolicies(policies, selectedIds),
      outcomes: input.events
        .filter((event) => event.sourceActionId === action.id)
        .map((event) => event.summary)
        .slice(0, 4),
    };
  });
}

function semanticChangeKinds(patch: TurnSemanticPatch | null): {
  locationChanged: boolean;
  environmentChanged: boolean;
} {
  const paths = patch?.operations.map((operation) => operation.path) ?? [];
  return {
    locationChanged: paths.some((path) => path.includes("/location")),
    environmentChanged: paths.some(
      (path) =>
        path.startsWith("/scene/") ||
        (path.startsWith("/entities/") &&
          !path.startsWith("/entities/character.a/") &&
          !path.startsWith("/entities/character.b/")),
    ),
  };
}

function normalizePublicText(value: string): string {
  return value.normalize("NFKC").replace(/[\s「」『』（）()、。！？!?…・]/g, "");
}

function battleNarratorLabel(state: BattleState, side: "a" | "b"): string {
  return state.encounterContext?.participants[side].battleLabel ??
    (side === "a" ? state.sideA.displayName : state.sideB.displayName);
}

function narrationPerceptionViewForState(input: {
  state: BattleState;
  perspective: NarrationPerspective;
  focus: NarrationFocus;
}): NarrationPerceptionView | null {
  const { state } = input;
  return state.semanticState &&
    state.observationStatePublic &&
    state.perceptionFrameA &&
    state.perceptionFrameB
      ? buildNarrationPerceptionView({
          perspective: input.perspective,
          focus: input.focus,
          sideALabel: battleNarratorLabel(state, "a"),
          sideBLabel: battleNarratorLabel(state, "b"),
          frameA: state.perceptionFrameA,
          frameB: state.perceptionFrameB,
          semanticState: state.semanticState,
          publicObservation: state.observationStatePublic,
        })
      : null;
}

/** Build the optional narrator-only causal input without changing turn state. */
export function buildGuardedNarrationCausalProjection(input: {
  mode: BattleCausalNarrationMode;
  before: BattleState;
  after: BattleState;
  actions: readonly ResolvedBattleAction[];
  events: readonly TurnEvent[];
  mechanicalEvidence: readonly CommittedMechanicalEvidence[];
  mechanicalEvidenceStatus: EvidenceValidationStatus;
  perception: NarrationPerceptionView;
  participantLabels: { a: string; b: string };
}): NarrationCausalProjection | undefined {
  if (input.mode === "off") return undefined;
  const semanticTransition = input.after.latestSemanticTransition;
  if (!semanticTransition) return undefined;
  try {
    const built = buildBattleTurnCausalReceipt({
      turn: input.after.turn,
      before: input.before,
      after: input.after,
      actions: input.actions,
      events: input.events,
      mechanicalEvidence: input.mechanicalEvidence,
      mechanicalEvidenceStatus: input.mechanicalEvidenceStatus,
      semanticTransition,
    });
    if (!built.ok) return undefined;
    return buildNarrationCausalProjection({
      receipt: built.receipt,
      perception: input.perception,
      participantLabels: input.participantLabels,
      ...(input.after.observationStatePublic
        ? { publicObservation: input.after.observationStatePublic }
        : {}),
    });
  } catch {
    return undefined;
  }
}

function narrationIdentifierCatalog(input: {
  state: BattleState;
  perspective: NarrationPerspective;
  focus: NarrationFocus;
  view?: NarrationPerceptionView | null;
}) {
  const { state } = input;
  const view = input.view === undefined
    ? narrationPerceptionViewForState(input)
    : input.view;
  return buildNarrationIdentifierCatalog({
    perspective: input.perspective,
    focus: input.focus,
    sideALabel: battleNarratorLabel(state, "a"),
    sideBLabel: battleNarratorLabel(state, "b"),
    semanticState: state.semanticState,
    publicObservation: state.observationStatePublic,
    frameA: state.perceptionFrameA,
    frameB: state.perceptionFrameB,
    registryA: state.perceptionRegistryA,
    registryB: state.perceptionRegistryB,
    view: view ?? undefined,
  });
}

export function finalizeCharacterSpeeches(input: {
  narrative: NarrativeBlock;
  sources: readonly CharacterSpeechSource[];
}): SpeechLine[] {
  const committed = input.sources.map((source, index) => {
    const candidate = input.narrative.speeches.find((line) =>
      line.sourceSide === source.side
    );
    const proposedText = candidate?.text?.trim() ?? "";
    const factsPreserved = normalizePublicText(proposedText) ===
        normalizePublicText(source.text) &&
      isStageReaction(proposedText) === isStageReaction(source.text);
    const fallbackPlacement = input.narrative.narrator.length <= 0
      ? -1
      : index === 0
        ? Math.max(0, Math.floor(input.narrative.narrator.length / 2) - 1)
        : input.narrative.narrator.length - 1;
    const placement = Number.isInteger(candidate?.afterNarratorLine)
      ? candidate!.afterNarratorLine!
      : fallbackPlacement;
    const fallbackSpeaker = source.displayLabel ?? source.speaker;
    return {
      sourceSide: source.side,
      speaker: coerceSpeakerDisplayLabel(candidate?.speaker, fallbackSpeaker),
      text: factsPreserved ? proposedText : source.text,
      afterNarratorLine: Math.max(
        -1,
        Math.min(placement, input.narrative.narrator.length - 1),
      ),
    };
  });
  const sceneSpeeches = input.narrative.speeches.flatMap((line) => {
    if (line.sourceSide !== undefined) return [];
    const speaker = coerceSpeakerDisplayLabel(line.speaker, "");
    const text = line.text.trim().slice(0, 400);
    if (!speaker || !text) return [];
    const placement = Number.isInteger(line.afterNarratorLine)
      ? line.afterNarratorLine!
      : input.narrative.narrator.length - 1;
    return [{
      speaker,
      text,
      afterNarratorLine: Math.max(
        -1,
        Math.min(placement, input.narrative.narrator.length - 1),
      ),
    }];
  }).slice(0, 4);
  return [...committed, ...sceneSpeeches];
}

function fallbackSpeakerDisplayLabel(input: {
  perceivedAs: string;
  attribution?: "unknown" | "possible" | "probable" | "certain";
  identityKnown?: boolean;
}): string {
  const base = input.perceivedAs.trim() || "正体不明の声の主";
  const certainty = input.attribution ?? "certain";
  if (certainty === "certain") return base;
  if (/声|気配/.test(base)) return base;
  if (certainty === "probable") return `${base}と思われる声の主`;
  if (certainty === "possible" || input.identityKnown) {
    return `${base}かもしれない声`;
  }
  return base === "知覚できない相手" ? "正体不明の声の主" : `${base}の声`;
}

function narrationObserverSide(
  view: NarrationPerceptionView | null,
): "a" | "b" | null {
  if (view?.mode === "self") return "a";
  if (view?.mode === "opponent") return "b";
  return null;
}

function narratorParticipantLabelsForState(input: {
  state: BattleState;
  perspective: NarrationPerspective;
  focus: NarrationFocus;
}): { a: string; b: string } {
  const view = narrationPerceptionViewForState(input);
  return view
    ? narrationParticipantLabels(view)
    : {
        a: battleNarratorLabel(input.state, "a"),
        b: battleNarratorLabel(input.state, "b"),
      };
}

/**
 * Add only view-safe presentation evidence to canonical speech. The canonical
 * speaker remains server-side; adapters serialize displayContext instead.
 */
export function buildNarratorCharacterSpeeches(input: {
  state: BattleState;
  sources: readonly CharacterSpeechSource[];
  events: readonly TurnEvent[];
  perspective: NarrationPerspective;
  focus: NarrationFocus;
}): CharacterSpeechSource[] {
  const perceptionView = narrationPerceptionViewForState({
    state: input.state,
    perspective: input.perspective,
    focus: input.focus,
  });
  const mode = perceptionView?.mode ?? "external";
  const observerSide = narrationObserverSide(perceptionView);
  const participantLabels = narratorParticipantLabelsForState(input);
  const evidence = buildUtterancePerceptionEvidence({
    events: input.events,
    worldState: input.state.worldState,
    previousFrameA: input.state.perceptionFrameA,
    previousFrameB: input.state.perceptionFrameB,
  });
  const expressionAccess = (speakerSide: "a" | "b") =>
    observerSide
      ? evidence.find((item) =>
          item.source.kind === "entity" &&
          item.source.entityId === `character.${speakerSide}`
        )?.accessBySide[observerSide]
      : undefined;
  const observerFrame = observerSide === "a"
    ? input.state.perceptionFrameA
    : observerSide === "b"
      ? input.state.perceptionFrameB
      : undefined;

  return input.sources.flatMap((source) => {
    const access = expressionAccess(source.side);
    if (
      observerSide &&
      source.side !== observerSide &&
      (!access || access.currentAccess === "none")
    ) {
      return [];
    }
    const isCounterpart = observerSide !== null && source.side !== observerSide;
    const slot = observerFrame
      ? isCounterpart ? observerFrame.counterpart : observerFrame.self
      : undefined;
    const currentAccess = access?.currentAccess ?? "clear";
    const identityKnowledge = access?.identityKnowledge ?? "identified";
    const attributionCertainty = access?.attributionCertainty ?? "certain";
    const perceivedAs = participantLabels[source.side];
    const apparentIdentity = slot?.apparentIdentity;
    const relationshipAddress = isCounterpart &&
        identityKnowledge === "identified" &&
        (!apparentIdentity || apparentIdentity.continuity === "same_entity") &&
        observerSide
      ? input.state.encounterContext?.social[observerSide].counterpartAddress
      : undefined;
    return [{
      ...source,
      displayLabel: fallbackSpeakerDisplayLabel({
        perceivedAs,
        attribution: attributionCertainty,
        identityKnown: identityKnowledge === "identified",
      }),
      displayContext: {
        mode,
        perceivedAs,
        utterancePerceivedAs: access?.perceivedAs ?? perceivedAs,
        currentAccess,
        identityKnowledge,
        attributionCertainty,
        ...(apparentIdentity ? { apparentIdentity } : {}),
        ...(relationshipAddress ? { relationshipAddress } : {}),
      },
    }];
  });
}

async function buildEnvironmentProcessProposal(input: {
  llm: LlmProvider;
  state: BattleState;
  turn: number;
  supervisor: ReturnType<typeof normalizeSupervisor>;
}): Promise<EnvironmentProcessProposal | null> {
  const stagnationHint = `${input.supervisor.quietTurns} consecutive quiet turns with little condition change`;

  try {
    const raw = await input.llm.proposeHappening({
      scene: input.state.situation.scene,
      turn: input.turn,
      sideAName: input.state.sideA.displayName,
      sideBName: input.state.sideB.displayName,
      stagnationHint,
      previousHappenings: input.supervisor.recentHappenings,
      battlefield: input.state.battlefield,
    });
    const removeCategoryLabel = (value: string) =>
      value
        .replaceAll("【ハプニング】", "")
        .replaceAll("ハプニング", "")
        .trim();
    return {
      id: `hap_llm_${input.turn}`,
      title: (removeCategoryLabel(raw.title) || "場の変化").slice(0, 40),
      summary:
        (removeCategoryLabel(raw.summary) || "場の条件が変わり、膠着が崩れる。")
          .slice(0, 240),
      notes:
        (removeCategoryLabel(raw.notes) || "環境の変化が両者へ影響している。")
          .slice(0, 240),
      tags: raw.tags
        ?.filter((tag) => !tag.includes("ハプニング"))
        .map((tag) => tag.slice(0, 80))
        .slice(0, 6),
    };
  } catch (e) {
    console.warn("[supervisor] generated field change skipped", e);
    return null;
  }
}

async function advanceTurnWithLease(input: {
  userId: string;
  battleId: string;
  operationId: string;
  llm: LlmProvider;
  /** Optional progressive updates (SSE). */
  onProgress?: (event: BattleAdvanceStreamEvent) => void;
}): Promise<BattlePublic> {
  const emit = (event: BattleAdvanceStreamEvent) => {
    try {
      input.onProgress?.(event);
    } catch (e) {
      console.warn(
        "[battle] onProgress listener error",
        e instanceof Error ? e.message : e,
      );
    }
  };
  const meta = await battleRepo.getBattleMeta(input.battleId);
  const loadedState = await battleRepo.getBattle(input.battleId);
  if (!meta || !loadedState) throw new Error("BATTLE_NOT_FOUND");
  let state: BattleState = loadedState;
  if (meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  if (
    state.advanceOperation?.status === "active" &&
    state.advanceOperation.operationId !== input.operationId
  ) {
    throw new Error("ADVANCE_OPERATION_CONFLICT");
  }
  if (
    state.advanceOperation?.status === "completed" &&
    state.advanceOperation.operationId === input.operationId
  ) {
    const replayMine = state.assetManifest?.characters.a.snapshot ??
      await charRepo.getSheet(meta.side_a_character_id);
    const replayOpp = state.assetManifest?.characters.b.snapshot ??
      await charRepo.getSheet(meta.side_b_character_id);
    if (!replayMine || !replayOpp) throw new Error("CHARACTER_MISSING");
    return toBattlePublicForViewer(state, replayMine, null, replayOpp);
  }
  if (state.status !== "active") throw new Error("BATTLE_FINISHED");

  const phase = state.prologuePending
    ? "prologue" as const
    : state.aftermathPending
      ? "aftermath" as const
      : "combat" as const;
  if (!state.advanceOperation || state.advanceOperation.status === "completed") {
    state = {
      ...state,
      advanceOperation: {
        schemaVersion: 1,
        operationId: input.operationId,
        expectedRevision: state.battleRevision ?? 0,
        status: "active",
        phase,
        startedAt: new Date().toISOString(),
        completedAt: null,
        receiptIds: [],
      },
    };
  }

  // Backfill for older battles
  if (!state.policiesA) state.policiesA = [];
  if (!state.selectedPolicyIdsA) state.selectedPolicyIdsA = [];
  if (!state.policiesB) state.policiesB = [];
  if (!state.selectedPolicyIdsB) state.selectedPolicyIdsB = [];

  const mine = state.assetManifest?.characters.a.snapshot ??
    await charRepo.getSheet(meta.side_a_character_id);
  const opp = state.assetManifest?.characters.b.snapshot ??
    await charRepo.getSheet(meta.side_b_character_id);
  if (!mine || !opp) throw new Error("CHARACTER_MISSING");
  const dialoguePipeline = state.dialoguePipelineSnapshot
    ? {
        ...state.dialoguePipelineSnapshot,
        updatedAt: null,
        updatedBy: null,
      }
    : await dialoguePipelineRepo.getDialoguePipelineSettings();
  // Older active battles did not snapshot restoration targets.
  state.sideA.baseParameters ??= { ...mine.parameters };
  state.sideB.baseParameters ??= { ...opp.parameters };

  // --- Pre-combat prologue (口上・因縁) before any engine turn ---
  if (state.prologuePending) {
    return runPrologueTurn({
      state,
      meta,
      mine,
      opp,
      llm: input.llm,
      dialoguePipeline,
      emit,
      operationId: input.operationId,
    });
  }

  // --- Extra aftermath beat after KO (do not end the match mid-sentence) ---
  if (state.aftermathPending) {
    return runAftermathTurn({
      state,
      meta,
      mine,
      opp,
      llm: input.llm,
      dialoguePipeline,
      emit,
      operationId: input.operationId,
    });
  }

  emit({ type: "phase", phase: "resolving" });

  const upcomingTurn = state.turn + 1;
  let supervisor = normalizeSupervisor(state.supervisor);
  const dramaBefore = normalizeDramaState(state.dramaState);
  const dramaPhase = dramaPhaseForTurn(upcomingTurn, state.turnLimit);
  const environmentBeatDue =
    upcomingTurn > 1 &&
    (dramaBefore.turnsSinceEnvironmentBeat >= 2 ||
      dramaBefore.turnsSinceLocationChange >= 3 ||
      dramaBefore.repeatedActionA >= 2 ||
      dramaBefore.repeatedActionB >= 2);

  // Generate a novel field change only after the resolved turns show stagnation.
  let environmentProposal: EnvironmentProcessProposal | null = null;
  const inject = shouldInjectHappening(
    supervisor,
    upcomingTurn,
    state.turnLimit,
  );
  if (inject) {
    environmentProposal = await buildEnvironmentProcessProposal({
      llm: input.llm,
      state,
      turn: upcomingTurn,
      supervisor,
    });
  }

  const hpBeforeA = state.sideA.parameters.hp ?? 0;
  const hpBeforeB = state.sideB.parameters.hp ?? 0;

  // Clamp legacy inflated skill.power (LLM sometimes wrote 20–40 as "damage score")
  const safeSkills = (skills: Skill[]) => skills.map(balanceSkill);
  let causalExecution = state.causalExecution?.turn === upcomingTurn &&
      state.causalExecution.status !== "finished"
    ? state.causalExecution
    : null;
  if (!causalExecution) {
    const drawRange = 2 ** 32;
    const prepared = prepareSequentialBattleTurnInitiative({
      state,
      sideASkills: safeSkills(mine.skills),
      sideBSkills: safeSkills(opp.skills),
      sideABasicAttack: mine.basicAttack,
      sideBBasicAttack: opp.basicAttack,
      tieDrawSample: randomInt(0, drawRange) / drawRange,
    });
    if (!prepared) throw new Error("CAUSAL_TURN_PREPARATION_UNAVAILABLE");
    causalExecution = createCausalTurnExecution({
      executionId: `${state.id}:turn:${prepared.turn}`,
      battleId: state.id,
      turn: prepared.turn,
      expectedStateRevision: state.semanticState?.revision ?? 0,
      temporalPlan: prepared.temporalResolution,
      initiativeOrder: prepared.temporalResolution.initiativeOrder,
    });
    state = { ...state, causalExecution };
    await battleRepo.saveBattle(state, {
      sideAUserId: meta.side_a_user_id,
      sideACharacterId: meta.side_a_character_id,
      sideBCharacterId: meta.side_b_character_id,
    });
  }

  const engineInput = {
    state,
    sideASkills: safeSkills(mine.skills),
    sideBSkills: safeSkills(opp.skills),
    sideABasicAttack: mine.basicAttack,
    sideBBasicAttack: opp.basicAttack,
    temporalResolutionOverride: causalExecution.temporalPlan,
    executionId: causalExecution.executionId,
  };
  const resumedEngineContinuation = state.causalEngineContinuation;
  const turnRecordBefore = resumedEngineContinuation
    ? materializeBattleTurnStartState({
        state,
        continuation: resumedEngineContinuation,
      })
    : structuredClone(state);
  if (resumedEngineContinuation) {
    const resumedBucket = causalExecution.temporalPlan.buckets[causalExecution.bucketIndex];
    if (!resumedBucket) throw new Error("CAUSAL_BUCKET_MISSING");
    for (const side of resumedBucket.actorSides) {
      causalExecution = acceptCausalExecutionDecision({
        execution: causalExecution,
        side,
      });
    }
  }
  let engineResolved = resolveNextBattleTurnBucket({
    ...engineInput,
    engineContinuation: resumedEngineContinuation,
  });
  const firstBucketCommit = engineResolved.bucketCommits?.[0];
  if (!firstBucketCommit) throw new Error("CAUSAL_FIRST_BUCKET_COMMIT_MISSING");
  if (state.causalBucketCommit) {
    if (!resumedEngineContinuation) {
      // Compatibility for a checkpoint written before engine continuations.
      engineResolved = resolveTurn(engineInput);
    } else {
      causalExecution = commitCausalExecutionBucket({ execution: causalExecution });
      state = {
        ...state,
        causalExecution,
        causalEngineContinuation: engineResolved.engineContinuation,
      };
      if (engineResolved.engineContinuation) {
        await battleRepo.saveBattle(state, {
          sideAUserId: meta.side_a_user_id,
          sideACharacterId: meta.side_a_character_id,
          sideBCharacterId: meta.side_b_character_id,
        });
      }
    }
  } else {
    const firstBucket = causalExecution.temporalPlan.buckets[0];
    if (!firstBucket) throw new Error("CAUSAL_FIRST_BUCKET_MISSING");
    for (const side of firstBucket.actorSides) {
      causalExecution = acceptCausalExecutionDecision({
        execution: causalExecution,
        side,
      });
    }
    causalExecution = commitCausalExecutionBucket({ execution: causalExecution });
    state = {
      ...state,
      causalExecution,
      causalBucketCommit: firstBucketCommit,
      causalEngineContinuation: engineResolved.engineContinuation,
    };
    if (engineResolved.engineContinuation) {
      await battleRepo.saveBattle(state, {
        sideAUserId: meta.side_a_user_id,
        sideACharacterId: meta.side_a_character_id,
        sideBCharacterId: meta.side_b_character_id,
      });
    }
  }
  while (engineResolved.engineContinuation) {
    const nextBucket = causalExecution.temporalPlan.buckets[causalExecution.bucketIndex];
    if (!nextBucket) throw new Error("CAUSAL_BUCKET_MISSING");
    const continuation = engineResolved.engineContinuation;
    const laterSide = nextBucket.actorSides.length === 1
      ? nextBucket.actorSides[0]
      : undefined;
    if (laterSide) {
      let boundaryState = materializeBattleStateAtBucketBoundary({
        state,
        continuation,
      });
      if (boundaryState.semanticState) {
        const projected = projectObserverPerception({
          observerSide: laterSide,
          turn: boundaryState.turn,
          semanticState: boundaryState.semanticState,
          worldState: boundaryState.worldState,
          events: continuation.events,
          quantizedMechanicalEvidence: quantizeCommittedMechanicalEvidence(
            continuation.mechanicalEvidence,
          ),
          reserveEvidence: buildServerOnlyReserveCues({
            side: laterSide,
            parameters: laterSide === "a"
              ? boundaryState.sideA.parameters
              : boundaryState.sideB.parameters,
            baseParameters: laterSide === "a"
              ? boundaryState.sideA.baseParameters
              : boundaryState.sideB.baseParameters,
          }),
          sensoryEvidence: [],
          previousFrame: laterSide === "a"
            ? state.perceptionFrameA
            : state.perceptionFrameB,
          previousRegistry: laterSide === "a"
            ? state.perceptionRegistryA
            : state.perceptionRegistryB,
          legacyCounterpartIdentified: laterSide === "a"
            ? state.perceptionRegistryA === undefined
            : state.perceptionRegistryB === undefined,
        });
        boundaryState = laterSide === "a"
          ? {
              ...boundaryState,
              perceptionFrameA: projected.frame,
              perceptionRegistryA: projected.registry,
            }
          : {
              ...boundaryState,
              perceptionFrameB: projected.frame,
              perceptionRegistryB: projected.registry,
            };
      }
      const laterCombatant = laterSide === "a"
        ? boundaryState.sideA
        : boundaryState.sideB;
      const laterInput = (laterCombatant.parameters.hp ?? 0) > 0
        ? buildLaterBucketActionInput({
            state: boundaryState,
            sheet: laterSide === "a" ? mine : opp,
            counterpartSheet: laterSide === "a" ? opp : mine,
            side: laterSide,
          })
        : null;
      if (laterInput) {
        const priorDecision = state.causalLaterDecision;
        if (
          priorDecision?.executionId === causalExecution.executionId &&
          priorDecision.sourceBucketIndex === Math.max(0, causalExecution.bucketIndex - 1) &&
          priorDecision.side === laterSide &&
          priorDecision.acceptedAction
        ) {
          state = bindNextBucketDecision({
            state: boundaryState,
            continuation,
            side: laterSide,
            intent: priorDecision.acceptedAction,
          });
        } else {
          const startedAt = Date.now();
          let proposedAction: unknown | null = null;
          let providerFailure: string | null = null;
          try {
            proposedAction = (await input.llm.decideCharacterAction(laterInput))
              .proposedAction;
          } catch (error) {
            providerFailure = error instanceof Error ? error.message : "provider_error";
          }
          const validation = validateCharacterActionProposal({
            proposedAction,
            decision: laterInput.decision,
          });
          const fallback = validation.acceptedAction
            ? null
            : deterministicLaterBucketFallback(laterInput.decision);
          const acceptedAction = validation.acceptedAction ?? fallback;
          if (acceptedAction) {
            boundaryState = bindNextBucketDecision({
              state: boundaryState,
              continuation,
              side: laterSide,
              intent: acceptedAction,
            });
          }
          state = {
            ...boundaryState,
            causalLaterDecision: {
              schemaVersion: 1,
              executionId: causalExecution.executionId,
              sourceBucketIndex: Math.max(0, causalExecution.bucketIndex - 1),
              side: laterSide,
              status: validation.acceptedAction ? "accepted" : "fallback",
              acceptedAction,
              validation,
              provider: input.llm.name,
              model: input.llm.models?.fast ?? null,
              callCount: 1,
              tokenCount: null,
              estimatedCostUsd: null,
              elapsedMs: Math.max(0, Date.now() - startedAt),
              fallbackReason: validation.acceptedAction
                ? null
                : providerFailure ?? validation.reason ?? "deterministic_fallback",
            },
          };
          await battleRepo.saveBattle(state, {
            sideAUserId: meta.side_a_user_id,
            sideACharacterId: meta.side_a_character_id,
            sideBCharacterId: meta.side_b_character_id,
          });
        }
      }
    }
    for (const side of nextBucket.actorSides) {
      causalExecution = acceptCausalExecutionDecision({
        execution: causalExecution,
        side,
      });
    }
    engineResolved = resolveNextBattleTurnBucket({
      ...engineInput,
      state,
      engineContinuation: engineResolved.engineContinuation,
    });
    causalExecution = commitCausalExecutionBucket({ execution: causalExecution });
    state = {
      ...state,
      causalExecution,
      causalEngineContinuation: engineResolved.engineContinuation,
    };
    if (engineResolved.engineContinuation) {
      await battleRepo.saveBattle(state, {
        sideAUserId: meta.side_a_user_id,
        sideACharacterId: meta.side_a_character_id,
        sideBCharacterId: meta.side_b_character_id,
      });
    }
  }
  const freeActionPreparation = await prepareFreeActionsForTurn({
    llm: input.llm,
    state,
    mine,
    opp,
  });
  const committedFreeActions = commitFreeActionAdjudications({
    beforeState: state,
    resolvedState: engineResolved.state,
    actions: engineResolved.actions,
    events: engineResolved.events,
    preparation: freeActionPreparation,
  });
  const resolved = {
    ...engineResolved,
    state: committedFreeActions.state,
    actions: committedFreeActions.actions,
    events: committedFreeActions.events,
  };
  let next = resolved.state;
  let events = resolved.events;

  const hpAfterA = next.sideA.parameters.hp ?? 0;
  const hpAfterB = next.sideB.parameters.hp ?? 0;
  const maxHpA = next.sideA.parameters.maxHp ?? 100;
  const maxHpB = next.sideB.parameters.maxHp ?? 100;

  // Observation only — does not alter combat outcomes
  next = {
    ...next,
    balanceTrace: accumulateBattleBalanceTrace(next.balanceTrace, {
      hpBeforeA,
      hpBeforeB,
      hpAfterA,
      hpAfterB,
      maxHpA,
      maxHpB,
    }),
  };

  const quiet = isQuietTurn({
    events,
    hpBeforeA,
    hpBeforeB,
    hpAfterA,
    hpAfterB,
    maxHpA,
    maxHpB,
  });
  emit({ type: "phase", phase: "agents" });
  const semanticTurn = await reconcileSemanticState({
    llm: input.llm,
    stateBeforeTurn: turnRecordBefore,
    resolvedState: next,
    mine,
    opp,
    actions: resolved.actions,
    events,
    mechanicalEvidence: resolved.mechanicalEvidence,
    environmentBeatDue,
    environmentProposal,
    dramaPhase,
  });
  next = semanticTurn.state;
  events = [...events, ...semanticTurn.environmentEvents];
  const acceptedEnvironmentProposal =
    semanticTurn.environmentProcessReceipt?.status === "accepted"
      ? environmentProposal
      : null;
  supervisor = advanceSupervisorClock(
    supervisor,
    quiet,
    isPassiveTurn(events),
    acceptedEnvironmentProposal,
    hpAfterA,
    hpAfterB,
  );
  next = { ...next, supervisor };
  const semanticChanges = semanticChangeKinds(
    semanticTurn.status === "applied" ? semanticTurn.patch : null,
  );
  const environmentBeatCommitted =
    semanticTurn.environmentProcessReceipt?.status === "accepted" ||
    semanticChanges.locationChanged ||
    semanticChanges.environmentChanged;

  const perspective: NarrationPerspective =
    next.narrationStyle?.perspective ?? "external";
  let cognitionA: CharacterCognition | undefined;
  let cognitionB: CharacterCognition | undefined;
  // Seed reflect notes into battle-volatile memory before psyche so the same-turn
  // private appraisal can read them, then re-apply after agents so a psyche
  // rewrite cannot drop the in-match 【省察】/【指針】 scratch entries.
  next = applyReflectMemoryWrites(next, resolved.actions);
  const agentTurn = await advanceCharacterAgents({
    llm: input.llm,
    before: turnRecordBefore,
    after: next,
    mine,
    opp,
    events,
    actions: resolved.actions,
    environmentProcessReceipt: semanticTurn.environmentProcessReceipt ?? undefined,
    dialoguePipeline,
    sensoryEvidence: semanticTurn.sensoryEvidence,
    quantizedMechanicalEvidence: semanticTurn.quantizedMechanicalEvidence,
    mechanicalEvidence: semanticTurn.mechanicalEvidence,
  });
  next = applyReflectMemoryWrites(agentTurn.state, resolved.actions);
  const rec = (next.turnRecords ?? [])[(next.turnRecords ?? []).length - 1];
  cognitionA = rec?.cognitionA;
  cognitionB = rec?.cognitionB;

  const { focus, digests } = await resolveNarrationFocusAndDigests({
    llm: input.llm,
    perspective,
    turn: next.turn,
    scene: next.situation.scene,
    sideAName: next.sideA.displayName,
    sideBName: next.sideB.displayName,
    events,
    agentStateA: next.agentStateA,
    agentStateB: next.agentStateB,
    cognitionA,
    cognitionB,
    perceptionFrameA: next.perceptionFrameA,
    perceptionFrameB: next.perceptionFrameB,
  });
  emit({ type: "phase", phase: "narrating" });
  // ADR-0006: canonical advancement never consumes prior generated prose.
  const recentNarration: string[] = [];
  const recentSpeeches: NarrativeBlock["speeches"] = [];
  const actionBeats = buildNarrationActionBeats({
    actions: resolved.actions,
    events,
    mine,
    opp,
    state: next,
  });
  const perceptionView = narrationPerceptionViewForState({
    state: next,
    perspective,
    focus,
  });
  const causalProjection = perceptionView
    ? buildGuardedNarrationCausalProjection({
        mode: config.battleCausalNarrationMode,
        before: state,
        after: semanticTurn.state,
        actions: resolved.actions,
        events,
        mechanicalEvidence: semanticTurn.mechanicalEvidence,
        mechanicalEvidenceStatus: semanticTurn.mechanicalEvidenceStatus,
        perception: perceptionView,
        participantLabels: narrationParticipantLabels(perceptionView),
      })
    : undefined;
  const narrationView =
    perceptionView &&
    next.semanticState &&
    next.observationStatePublic &&
    next.perceptionFrameA &&
    next.perceptionFrameB
      ? buildNarrationTurnView({
          turn: next.turn,
          scene: next.situation.scene,
          perspective,
          focus,
          sideALabel: battleNarratorLabel(next, "a"),
          sideBLabel: battleNarratorLabel(next, "b"),
          profileAnchorA: buildNarratorRenderingProfileAnchor({
            sheet: mine,
            side: "a",
            currentStateOverrides: deriveBattleProfileStateOverrides({
              worldState: next.worldState,
              side: "a",
            }),
          }),
          profileAnchorB: buildNarratorRenderingProfileAnchor({
            sheet: opp,
            side: "b",
            currentStateOverrides: deriveBattleProfileStateOverrides({
              worldState: next.worldState,
              side: "b",
            }),
          }),
          sceneStateFacts: buildNarratorSceneStateFacts({
            state: next,
            mine,
            opp,
            perspective,
            focus,
          }),
          perception: perceptionView,
          semanticState: next.semanticState,
          publicObservation: next.observationStatePublic,
          frameA: next.perceptionFrameA,
          frameB: next.perceptionFrameB,
          registryA: next.perceptionRegistryA,
          registryB: next.perceptionRegistryB,
          events,
          actionBeats,
          ...(causalProjection ? { causalProjection } : {}),
          canonicalChange: {
            semantic: {
              status: rec?.canonicalTransition?.semantic?.status ?? "unavailable",
              changed: rec?.canonicalTransition?.semantic
                ? (rec.canonicalTransition.semantic.patch?.operations.length ?? 0) > 0
                : null,
            },
            world: {
              status: rec?.canonicalTransition?.world?.status ?? "unavailable",
              changed: rec?.canonicalTransition?.world
                ? (rec.canonicalTransition.world.transition?.operations.length ?? 0) > 0
                : null,
              operationKinds: rec?.worldImpact?.operationKinds ?? [],
            },
          },
          battlefield: next.battlefield,
          narratorContinuity: next.narratorContinuity,
        })
      : null;
  const characterSpeeches = buildNarratorCharacterSpeeches({
    state: next,
    sources: agentTurn.characterSpeeches,
    events: rec?.events ?? [],
    perspective,
    focus,
  });
  const subjectiveNarration = perceptionView?.mode === "self" ||
    perceptionView?.mode === "opponent";
  const identifierCatalog = narrationIdentifierCatalog({
    state: next,
    perspective,
    focus,
    view: perceptionView,
  });
  const narratorDrama = {
    phase: dramaPhase,
    turn: next.turn,
    turnLimit: next.turnLimit,
    repeatedActionA: dramaBefore.repeatedActionA,
    repeatedActionB: dramaBefore.repeatedActionB,
    lastActionSignatureA: dramaBefore.lastActionSignatureA,
    lastActionSignatureB: dramaBefore.lastActionSignatureB,
    recentBeatFingerprints: dramaBefore.recentBeatFingerprints,
    turnsSinceLocationChange: dramaBefore.turnsSinceLocationChange,
    turnsSinceEnvironmentBeat: dramaBefore.turnsSinceEnvironmentBeat,
    environmentBeatDue: environmentBeatCommitted,
    progressionHint: dramaProgressionHint({
      phase: dramaPhase,
      turn: next.turn,
      turnLimit: next.turnLimit,
      repeatedActionA: dramaBefore.repeatedActionA,
      repeatedActionB: dramaBefore.repeatedActionB,
      lastActionSignatureA: dramaBefore.lastActionSignatureA,
      lastActionSignatureB: dramaBefore.lastActionSignatureB,
      recentBeatFingerprints: dramaBefore.recentBeatFingerprints,
      turnsSinceLocationChange: dramaBefore.turnsSinceLocationChange,
    }) ?? undefined,
  };
  const narrationCallInput: Omit<
    Parameters<LlmProvider["narrateTurn"]>[0],
    "onProgress"
  > | null = narrationView
    ? {
        view: narrationView,
        recentNarration: subjectiveNarration ? [] : recentNarration,
        recentSpeeches: subjectiveNarration ? [] : recentSpeeches,
        drama: narratorDrama,
        innerDigests: digests,
        characterSpeeches,
        styleInstruction: next.narrationStyle?.instruction,
        styleName: next.narrationStyle?.displayName,
      }
    : null;
  const combatNarrationInput: DeferredNarrationInput = {
    kind: "combat",
    request: narrationCallInput ?? {},
  };
  const narrationTurnBrief = narrationView
    ? buildNarrationTurnBrief(narrationView)
    : null;
  let narrationResult: NarrationResult;
  try {
    if (!narrationView) {
      throw new Error("narration perception view unavailable");
    }
    if (!narrationCallInput) {
      throw new Error("narration call input unavailable");
    }
    // Retry policy belongs to the selected provider adapter. This envelope does
    // not duplicate a timeout, 429, or 503 attempt and never changes provider.
    throw new Error("narration deferred to ordered worker");
  } catch (e) {
    if (!(e instanceof Error && e.message === "narration deferred to ordered worker")) {
      console.warn("[battle] narrateTurn fallback", e instanceof Error ? e.message : e);
    }
    // Public log must stay narrator-shaped. Never dump engine event.summary or
    // raw action outcomes into the user-visible log.
    const fallbackDrama = {
      phase: dramaPhase,
      repeatedActionA: dramaBefore.repeatedActionA,
      repeatedActionB: dramaBefore.repeatedActionB,
      environmentBeatDue: environmentBeatCommitted,
      progressionHint: dramaProgressionHint({
        phase: dramaPhase,
        turn: next.turn,
        turnLimit: next.turnLimit,
        repeatedActionA: dramaBefore.repeatedActionA,
        repeatedActionB: dramaBefore.repeatedActionB,
        lastActionSignatureA: dramaBefore.lastActionSignatureA,
        lastActionSignatureB: dramaBefore.lastActionSignatureB,
        recentBeatFingerprints: dramaBefore.recentBeatFingerprints,
        turnsSinceLocationChange: dramaBefore.turnsSinceLocationChange,
      }) ?? undefined,
    };
    const fallbackNarrative = narrationView
      ? composeNarratorTurn({
          view: narrationView,
          drama: fallbackDrama,
          recentNarration,
        })
      : {
          turn: next.turn,
          narrator: [
            `${next.situation.scene}で、対峙が続く。`,
            "語りは途切れたが、場の緊張だけが残る。",
          ],
          speeches: [],
        };
    narrationResult = {
      ...fallbackNarrative,
      speeches: characterSpeeches.map((speech, index) => ({
        sourceSide: speech.side,
        speaker: speech.displayLabel ?? speech.speaker,
        text: speech.text,
        afterNarratorLine: fallbackNarrative.narrator.length <= 0
          ? -1
          : index === 0
            ? Math.max(0, Math.floor(fallbackNarrative.narrator.length / 2) - 1)
            : fallbackNarrative.narrator.length - 1,
      })),
    };
  }
  let narrative = publicNarrativeBlock(narrationResult);
  narrative = repairNarrativeBlockIdentifiers(narrative, identifierCatalog);
  const recentNarrationFingerprints = new Set(
    recentNarration.map(normalizePublicText).filter(Boolean),
  );
  narrative.narrator = narrative.narrator
    .map((line) => line.trim())
    .filter((line) => {
      const normalized = normalizePublicText(line);
      return normalized && !recentNarrationFingerprints.has(normalized);
    })
    .slice(0, 4);
  if (narrative.narrator.length < 2 && narrationView) {
    // Pad only through the narrator composer — never with engine telemetry.
    const composed = composeNarratorTurn({
      view: narrationView,
      drama: {
        phase: dramaPhase,
        repeatedActionA: dramaBefore.repeatedActionA,
        repeatedActionB: dramaBefore.repeatedActionB,
        environmentBeatDue: environmentBeatCommitted,
        progressionHint: dramaProgressionHint({
          phase: dramaPhase,
          turn: next.turn,
          turnLimit: next.turnLimit,
          repeatedActionA: dramaBefore.repeatedActionA,
          repeatedActionB: dramaBefore.repeatedActionB,
          lastActionSignatureA: dramaBefore.lastActionSignatureA,
          lastActionSignatureB: dramaBefore.lastActionSignatureB,
          recentBeatFingerprints: dramaBefore.recentBeatFingerprints,
          turnsSinceLocationChange: dramaBefore.turnsSinceLocationChange,
        }) ?? undefined,
      },
      recentNarration,
    });
    narrative.narrator = [
      ...narrative.narrator,
      ...composed.narrator,
    ]
      .filter((line, index, lines) => lines.indexOf(line) === index)
      .slice(0, 4);
  }
  narrative.speeches = finalizeCharacterSpeeches({
    narrative,
    sources: characterSpeeches,
  });
  narrative = repairNarrativeBlockIdentifiers(narrative, identifierCatalog);
  next = {
    ...next,
    dramaState: advanceDramaState({
      previous: dramaBefore,
      turn: next.turn,
      turnLimit: next.turnLimit,
      actions: resolved.actions,
      narrative,
      characterSpeeches: characterSpeeches.map((speech) => ({
        sourceSide: speech.side,
        text: speech.text,
      })),
      sideAName: next.sideA.displayName,
      sideBName: next.sideB.displayName,
      locationChanged: semanticChanges.locationChanged,
      environmentBeatOccurred:
        semanticTurn.environmentProcessReceipt?.status === "accepted" ||
        semanticChanges.environmentChanged,
    }),
  };
  emit({ type: "phase", phase: "finalizing" });

  // KO this turn: combat narrative is done, but official finish waits for aftermath advance.
  // Do not settle rating yet.
  if (next.aftermathPending) {
    next = completeAdvancePhases({
      state: next,
      operationId: input.operationId,
      phases: ["combat"],
      narrationInputs: { combat: combatNarrationInput },
    });
    await battleRepo.saveBattleWithNarrationOutbox(next, {
      sideAUserId: meta.side_a_user_id,
      sideACharacterId: meta.side_a_character_id,
      sideBCharacterId: meta.side_b_character_id,
      expectedRevision: next.advanceOperation?.expectedRevision,
    });
    return toBattlePublicForViewer(next, mine, null, opp);
  }

  let resultSummary: string | null = null;
  let judgmentNarrative: NarrativeBlock | null = null;
  let judgmentNarrationInput: DeferredNarrationInput | undefined;
  if (next.status === "finished") {
    if (next.finishReason === "turn_limit") {
      const turnFacts = buildRefereeTurnFacts(next.turnRecords ?? []);
      let refereeResult: RefereeResult | undefined;
      try {
        refereeResult = await withTimeout(
          input.llm.referee({
            sideAName: next.sideA.displayName,
            sideBName: next.sideB.displayName,
            engineWinnerSide: next.winnerSide,
            turnFacts,
            finalState: buildRefereeFinalState(next),
          }),
          FAST_LLM_ENVELOPE_TIMEOUT_MS,
          "referee",
        );
      } catch (error) {
        console.warn(
          "[battle] semantic adjudication failed; using deterministic fallback",
          error instanceof Error ? error.message : error,
        );
      }
      const adjudication = buildBattleAdjudication({
        turn: next.turn,
        engineWinnerSide: next.winnerSide,
        turnFacts,
        result: refereeResult,
      });
      next = {
        ...next,
        winnerSide: adjudication.winnerSide,
        adjudication,
      };
      const winnerName = adjudication.winnerSide === "a"
        ? next.sideA.displayName
        : adjudication.winnerSide === "b"
          ? next.sideB.displayName
          : null;
      let judgmentPresentation: JudgmentNarrationResult | undefined;
      judgmentNarrationInput = {
        kind: "judgment" as const,
        request: {
          turn: next.turn,
          scene: next.situation.scene,
          sideAName: next.sideA.displayName,
          sideBName: next.sideB.displayName,
          winnerSide: adjudication.winnerSide,
          winnerName,
          adjudicationReason: adjudication.reason,
          recentPublicNarration: [],
          styleInstruction: next.narrationStyle?.instruction,
          styleName: next.narrationStyle?.displayName,
        },
      };
      try {
        throw new Error("judgment narration deferred to ordered worker");
      } catch (error) {
        if (!(error instanceof Error && error.message === "judgment narration deferred to ordered worker")) {
          console.warn("[battle] narrateJudgment failed", error instanceof Error ? error.message : error);
        }
      }
      const judgmentBlock = repairNarrativeBlockIdentifiers(
        buildJudgmentNarrativeBlock({
          turn: next.turn,
          sideAName: next.sideA.displayName,
          sideBName: next.sideB.displayName,
          winnerSide: adjudication.winnerSide,
          adjudicationReason: adjudication.reason,
          presentation: judgmentPresentation,
        }),
        identifierCatalog,
      );
      resultSummary = judgmentBlock.narrator
        .filter((line) => line !== "——判定——")
        .join(" ");
      next = {
        ...next,
      };
      judgmentNarrative = judgmentBlock;
    } else {
      const winner =
        next.winnerSide === "a"
          ? next.sideA.displayName
          : next.winnerSide === "b"
            ? next.sideB.displayName
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

  let finishedExecution = causalExecution;
  while (finishedExecution.status === "awaiting_decision") {
    const bucket = finishedExecution.temporalPlan.buckets[finishedExecution.bucketIndex];
    if (!bucket) throw new Error("CAUSAL_BUCKET_MISSING");
    for (const side of bucket.actorSides) {
      finishedExecution = acceptCausalExecutionDecision({
        execution: finishedExecution,
        side,
      });
    }
    finishedExecution = commitCausalExecutionBucket({
      execution: finishedExecution,
    });
  }
  if (finishedExecution.status === "awaiting_finalize") {
    finishedExecution = finishCausalTurnExecution({ execution: finishedExecution });
  }
  next = {
    ...next,
    causalExecution: finishedExecution,
    causalBucketCommit: undefined,
    causalEngineContinuation: undefined,
  };
  next = completeAdvancePhases({
    state: next,
    operationId: input.operationId,
    phases: next.finishReason === "turn_limit"
      ? ["combat", "judgment"]
      : ["combat"],
    narrationInputs: {
      combat: combatNarrationInput,
      ...(judgmentNarrationInput ? { judgment: judgmentNarrationInput } : {}),
    },
  });

  await battleRepo.saveBattleWithNarrationOutbox(next, {
    sideAUserId: meta.side_a_user_id,
    sideACharacterId: meta.side_a_character_id,
    sideBCharacterId: meta.side_b_character_id,
    expectedRevision: next.advanceOperation?.expectedRevision,
  });

  return toBattlePublicForViewer(next, mine, resultSummary, opp);
}

function buildFrozenNarrationInput(
  state: BattleState,
  phase: "prologue" | "combat" | "judgment" | "aftermath",
) {
  const record = (state.turnRecords ?? []).at(-1);
  const snapshot = {
    schemaVersion: 1 as const,
    scene: state.situation.scene,
    perspective: state.narrationStyle?.perspective ?? "external" as const,
    participantLabels: {
      a: state.sideA.displayName,
      b: state.sideB.displayName,
    },
    winnerSide: state.winnerSide,
    finishReason: state.finishReason,
    adjudicationReason: state.adjudication?.reason ?? null,
    eventFacts: (record?.events ?? []).map((event) => ({
      type: event.type,
      actorSide: event.actorSide ?? null,
      targetSides: event.targetSides ?? [],
      intensity: event.intensity ?? null,
    })).slice(0, 48),
    characterSpeeches: (record?.events ?? [])
      .filter((event) => event.type === "utterance" && event.actorSide && event.utterance)
      .map((event) => ({
        sourceSide: event.actorSide as "a" | "b",
        text: event.utterance!.text,
      }))
      .slice(0, 8),
    assetGenerationIds: {
      sideA: state.assetManifest?.characters.a.generationId ?? null,
      sideB: state.assetManifest?.characters.b.generationId ?? null,
      battlefield: state.assetManifest?.battlefield.generationId ?? null,
      narrationStyle: state.assetManifest?.narrationStyle.generationId ?? null,
    },
  };
  return {
    snapshot,
    digest: requestDigest({ phase, combatTurn: state.turn, snapshot }),
  };
}

type DeferredNarrationInput = {
  kind: "prologue" | "combat" | "judgment" | "aftermath";
  request: Record<string, unknown>;
};

export function completeAdvancePhases(input: {
  state: BattleState;
  operationId: string;
  phases: readonly ("prologue" | "combat" | "judgment" | "aftermath")[];
  narrationInputs?: Partial<Record<
    "prologue" | "combat" | "judgment" | "aftermath",
    DeferredNarrationInput
  >>;
}): BattleState {
  const operation = input.state.advanceOperation;
  if (!operation || operation.operationId !== input.operationId) {
    throw new Error("ADVANCE_OPERATION_MISSING");
  }
  if (operation.status === "completed") return input.state;
  const fromRevision = operation.expectedRevision;
  if ((input.state.battleRevision ?? 0) !== fromRevision) {
    throw new Error("BATTLE_REVISION_CONFLICT");
  }
  if (input.phases.length === 0) throw new Error("ADVANCE_PHASES_EMPTY");
  const firstSequence = (input.state.phaseReceiptSequence ?? 0) + 1;
  const toRevision = fromRevision + input.phases.length;
  const committedAt = new Date().toISOString();
  const receipts = input.phases.map((phase, index) => {
    const sequence = firstSequence + index;
    const receiptFromRevision = fromRevision + index;
    const override = input.narrationInputs?.[phase];
    const frozen = override === undefined
      ? buildFrozenNarrationInput(input.state, phase)
      : {
          snapshot: override,
          digest: requestDigest({
            phase,
            combatTurn: input.state.turn,
            snapshot: override,
          }),
        };
    return {
      schemaVersion: 1 as const,
      id: `${input.state.id}:phase:${sequence}`,
      sequence,
      operationId: input.operationId,
      phase,
      combatTurn: phase === "combat" || phase === "judgment"
        ? input.state.turn
        : null,
      fromRevision: receiptFromRevision,
      toRevision: receiptFromRevision + 1,
      committedAt,
      narrationInput: frozen.snapshot,
      narrationInputDigest: frozen.digest,
    };
  });
  return {
    ...input.state,
    battleRevision: toRevision,
    phaseReceiptSequence: firstSequence + input.phases.length - 1,
    phaseReceipts: [
      ...(input.state.phaseReceipts ?? []),
      ...receipts,
    ].slice(-100),
    advanceOperation: {
      ...operation,
      status: "completed",
      completedAt: committedAt,
      receiptIds: receipts.map((receipt) => receipt.id),
    },
  };
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
  dialoguePipeline: DialoguePipelineSettings;
  emit?: (event: BattleAdvanceStreamEvent) => void;
  operationId: string;
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
    dialoguePipeline: input.dialoguePipeline,
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
  const prologueNarrationRequest = {
    scene: state.situation.scene,
    sideAName: narratorParticipantLabels.a,
    sideBName: narratorParticipantLabels.b,
    sideABlurb: profileAnchors.a ? input.mine.narrativeBlurb : undefined,
    sideBBlurb: profileAnchors.b ? input.opp.narrativeBlurb : undefined,
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
  };
  let narrationResult: NarrationResult;
  try {
    throw new Error("prologue narration deferred to ordered worker");
  } catch (e) {
    if (!(e instanceof Error && e.message === "prologue narration deferred to ordered worker")) {
      console.warn("[battle] narratePrologue failed", e);
    }
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
  }
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

  emit({ type: "phase", phase: "finalizing" });

  let next: BattleState = {
    ...state,
    openingPlanA: state.agentStateA?.currentGoal?.slice(0, 1200),
    openingPlanB: state.agentStateB?.currentGoal?.slice(0, 1200),
    turn: 0,
    prologuePending: false,
    updatedAt: new Date().toISOString(),
  };
  next = completeAdvancePhases({
    state: next,
    operationId: input.operationId,
    phases: ["prologue"],
    narrationInputs: {
      prologue: { kind: "prologue", request: prologueNarrationRequest },
    },
  });

  await battleRepo.saveBattleWithNarrationOutbox(next, {
    sideAUserId: input.meta.side_a_user_id,
    sideACharacterId: input.meta.side_a_character_id,
    sideBCharacterId: input.meta.side_b_character_id,
    expectedRevision: next.advanceOperation?.expectedRevision,
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
  dialoguePipeline: DialoguePipelineSettings;
  emit?: (event: BattleAdvanceStreamEvent) => void;
  operationId: string;
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
    dialoguePipeline: input.dialoguePipeline,
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
  const aftermathNarrationRequest = {
    turn: aftermathTurn,
    scene: state.situation.scene,
    sideAName: narratorParticipantLabels.a,
    sideBName: narratorParticipantLabels.b,
    winnerSide: state.winnerSide,
    winnerName: narratorWinnerName,
    fallenNames: narratorFallenNames,
    battlefield: state.battlefield,
    recentNarration: [],
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
  };
  let presentation: AftermathNarrationResult | undefined;
  try {
    throw new Error("aftermath narration deferred to ordered worker");
  } catch (e) {
    if (!(e instanceof Error && e.message === "aftermath narration deferred to ordered worker")) {
      console.warn("[battle] narrateAftermath failed", e);
    }
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
  emit({ type: "phase", phase: "finalizing" });

  let next: BattleState = {
    ...state,
    status: "finished",
    aftermathPending: false,
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
    // Persist only aftermath-authored privateMemory. Mid-fight reflect notes
    // live in battleVolatileMemory and must not become character opponent memory
    // unless the aftermath psyche synthesized them into privateMemory.
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

  next = completeAdvancePhases({
    state: next,
    operationId: input.operationId,
    phases: ["aftermath"],
    narrationInputs: {
      aftermath: { kind: "aftermath", request: aftermathNarrationRequest },
    },
  });

  await battleRepo.saveBattleWithNarrationOutbox(next, {
    sideAUserId: input.meta.side_a_user_id,
    sideACharacterId: input.meta.side_a_character_id,
    sideBCharacterId: input.meta.side_b_character_id,
    expectedRevision: next.advanceOperation?.expectedRevision,
  });
  // The winner card already states the mechanical result. The aftermath log is
  // LLM-authored, so do not append a second fixed-prose result summary here.
  return toBattlePublicForViewer(next, input.mine, null, input.opp);
}

export async function advanceTurn(input: {
  userId: string;
  battleId: string;
  operationId?: string;
  llm: LlmProvider;
  /** Optional progressive updates (SSE). */
  onProgress?: (event: BattleAdvanceStreamEvent) => void;
}): Promise<BattlePublic> {
  const meta = await battleRepo.getBattleMeta(input.battleId);
  if (!meta) throw new Error("BATTLE_NOT_FOUND");
  if (meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  return withBattleLease(input.battleId, () => advanceTurnWithLease({
    ...input,
    operationId: input.operationId ?? `legacy:${newId("advance")}`,
  }));
}

export async function performAction(input: {
  userId: string;
  battleId: string;
  llm: LlmProvider;
}): Promise<BattlePublic> {
  return advanceTurn(input);
}

export async function pickRandomOpponent(userId: string, myCharacterId: string) {
  const page = await charRepo.listPublicOpponents(userId, undefined, {
    limit: 50,
    offset: 0,
  });
  const candidates = page.characters.filter((c) => c.id !== myCharacterId);
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
