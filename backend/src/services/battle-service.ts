import {
  BattlePolicyOptionSchema,
  accumulateBattleBalanceTrace,
  advanceSupervisorClock,
  applySituationCoefficients,
  applyTurnSemanticPatch,
  balanceSkill,
  buildBattleTurnRecord,
  buildSemanticObservationState,
  createBattleState,
  happeningToEvents,
  happeningToSituationPatch,
  isPassiveTurn,
  isQuietTurn,
  normalizeSupervisor,
  resolveTurn,
  sheetCombatProfile,
  shouldInjectHappening,
  stanceLabel,
  summarizeSelectedPolicies,
  selectPolicyIdsByPerspective,
  toPublicCharacter,
  toPublicInstance,
  toPublicPolicyOption,
  type BattlePolicyOption,
  type BattlePublic,
  type BattleStance,
  type BattleState,
  type ResolvedBattleAction,
  type CharacterAgentState,
  type CharacterCognition,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type CharacterSheet,
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
  agentsUsefulForPerspective,
  buildInnerDigest,
  lockedFocusFromPerspective,
  needsFocusChoice,
  selectDigestsForFocus,
  defaultCharacterIdentity,
  advanceDramaState,
  dramaPhaseForTurn,
  normalizeDramaState,
} from "@kshiai/shared";
import {
  recordBattleFinished,
  recordSheetSnapshot,
} from "./balance-observe.js";
import { config } from "../config.js";
import { newId } from "../id.js";
import type { LlmProvider } from "../llm/index.js";
import type { NarrationActionBeat } from "../llm/types.js";
import * as battleRepo from "../repositories/battles.js";
import * as bfRepo from "../repositories/battlefields.js";
import * as charRepo from "../repositories/characters.js";
import * as styleRepo from "../repositories/narration-styles.js";
import { withBattleLease } from "./distributed-guard.js";

export function toBattlePublic(
  state: BattleState,
  mySheet: CharacterSheet,
  resultSummary?: string | null,
  oppSheet?: CharacterSheet | null,
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
      const slim = (x: {
        before: number;
        after: number;
        delta: number;
        provisionalAfter: boolean;
      }) => ({
        before: x.before,
        after: x.after,
        delta: x.delta,
        provisionalAfter: x.provisionalAfter,
      });
      return {
        applied: s.applied,
        ranked: s.ranked,
        sameOwner: s.sameOwner,
        overall: {
          sideA: slim(overall.sideA),
          sideB: slim(overall.sideB),
        },
        public: pub
          ? { sideA: slim(pub.sideA), sideB: slim(pub.sideB) }
          : null,
        sideA: slim(overall.sideA),
        sideB: slim(overall.sideB),
      };
    })(),
  };
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

  let policiesA = normalizePolicies(input.policies);
  if (policiesA.length === 0) {
    const gen = await input.llm.generateBattlePolicies({
      self: charPublicCtx(mine),
      foe: {
        displayName: opp.displayName,
        traits: opp.traits,
        narrativeBlurb: opp.narrativeBlurb,
      },
      field: {
        displayName: battlefield.displayName,
        category: battlefield.category,
        terrain: battlefield.terrain,
        obstacles: battlefield.obstacles,
        conditions: battlefield.conditions,
        narrativeBlurb: battlefield.narrativeSetup,
      },
    });
    policiesA = gen.options;
  }

  const selectedPolicyIdsA =
    input.selectedPolicyIds !== undefined
      ? selectPolicyIdsByPerspective(policiesA, input.selectedPolicyIds)
      : selectPolicyIdsByPerspective(
          policiesA,
          policiesA.filter((p) => p.defaultSelected).map((p) => p.id),
        );

  // Opponent policies: always LLM-generated with defaults auto-selected
  const genB = await input.llm.generateBattlePolicies({
    self: charPublicCtx(opp),
    foe: {
      displayName: mine.displayName,
      traits: mine.traits,
      narrativeBlurb: mine.narrativeBlurb,
    },
    field: {
      displayName: battlefield.displayName,
      category: battlefield.category,
      terrain: battlefield.terrain,
      obstacles: battlefield.obstacles,
      conditions: battlefield.conditions,
      narrativeBlurb: battlefield.narrativeSetup,
    },
  });
  const policiesB = genB.options;
  const selectedPolicyIdsB = selectPolicyIdsByPerspective(
    policiesB,
    policiesB.filter((p) => p.defaultSelected).map((p) => p.id),
  );

  const narrationStyle = await styleRepo.resolveNarrationStyleForUser(
    input.userId,
    input.narrationStyleId,
  );
  const narrationSnap = toNarrationSnapshot(narrationStyle);
  const priorMatchSummary = await battleRepo.findPriorMatchSummary(
    mine.id,
    opp.id,
  );

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
  });

  state = {
    ...state,
    prologuePending: true,
    log: [],
    updatedAt: new Date().toISOString(),
  };

  await battleRepo.saveBattle(state, {
    sideAUserId: input.userId,
    sideACharacterId: mine.id,
    sideBCharacterId: opp.id,
  });

  return toBattlePublic(state, mine, null, opp);
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

function initialAgentState(sheet: CharacterSheet): CharacterAgentState {
  return {
    privateMemory: "",
    currentGoal: "",
    emotion: "平静",
    beliefs: [],
    observations: [],
    speechStyle: "",
    selfReference: sheet.identity?.selfNames[0] ?? null,
    lastSpeech: null,
  };
}

async function advanceCharacterAgents(input: {
  llm: LlmProvider;
  before: BattleState;
  after: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
  events: TurnEvent[];
  actions: ResolvedBattleAction[];
}): Promise<{ state: BattleState }> {
  const record = buildBattleTurnRecord({
    before: input.before,
    after: input.after,
    events: input.events,
    actions: input.actions,
  });
  const cognitionA = record.cognitionA;
  const cognitionB = record.cognitionB;
  const identityA = input.mine.identity ?? defaultCharacterIdentity();
  const identityB = input.opp.identity ?? defaultCharacterIdentity();
  const previousA = input.after.agentStateA ?? initialAgentState(input.mine);
  const previousB = input.after.agentStateB ?? initialAgentState(input.opp);
  const stateWithRecord: BattleState = {
    ...input.after,
    turnRecords: [...(input.after.turnRecords ?? []), record].slice(-50),
  };
  let agents;
  try {
    agents = await withTimeout(Promise.allSettled([
      input.llm.advanceCharacterAgent({
        character: {
          displayName: input.mine.displayName,
          identity: identityA,
          traits: input.mine.traits,
          narrativeBlurb: input.mine.narrativeBlurb,
          skillNames: input.mine.skills.map((skill) => skill.name),
        },
        foeName: input.opp.displayName,
        previous: previousA,
        cognition: cognitionA,
        observation: input.after.observationStateA!,
      }),
      input.llm.advanceCharacterAgent({
        character: {
          displayName: input.opp.displayName,
          identity: identityB,
          traits: input.opp.traits,
          narrativeBlurb: input.opp.narrativeBlurb,
          skillNames: input.opp.skills.map((skill) => skill.name),
        },
        foeName: input.mine.displayName,
        previous: previousB,
        cognition: cognitionB,
        observation: input.after.observationStateB!,
      }),
    ]), 18_000, "advanceCharacterAgents");
  } catch (error) {
    console.warn(
      "[battle] character agents skipped",
      error instanceof Error ? error.message : error,
    );
    // Still surface a minimal reaction so neither side goes fully blank.
    return {
      state: stateWithRecord,
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
  return {
    state: {
      ...input.after,
      agentStateA: agentA?.state ?? previousA,
      agentStateB: agentB?.state ?? previousB,
      turnRecords: [
        ...(input.after.turnRecords ?? []),
        record,
      ].slice(-50),
    },
  };
}

export async function reconcileSemanticState(input: {
  llm: LlmProvider;
  stateBeforeTurn: BattleState;
  resolvedState: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  environmentBeatDue?: boolean;
  dramaPhase?: "opening" | "rising" | "climax";
}): Promise<{
  state: BattleState;
  patch: TurnSemanticPatch | null;
  status: "applied" | "rejected" | "skipped";
}> {
  const semanticBefore = input.stateBeforeTurn.semanticState;
  if (!semanticBefore) {
    return { state: input.resolvedState, patch: null, status: "skipped" };
  }
  const commitObservationState = (
    after: typeof semanticBefore,
    status: "applied" | "rejected" | "skipped",
    patch: TurnSemanticPatch | null,
  ): BattleState => ({
    ...input.resolvedState,
    semanticState: after,
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
  });
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
        dramaPhase: input.dramaPhase,
      }),
      16_000,
      "reconcileTurnSemanticState",
    );
    const applied = applyTurnSemanticPatch({
      state: semanticBefore,
      patch: proposed.patch,
      turn: input.resolvedState.turn,
      allowedSourceEventIds: new Set(
        input.events.flatMap((event) => event.id ? [event.id] : []),
      ),
    });
    if (!applied.ok) {
      console.warn(
        `[battle] semantic patch rejected ${applied.error.code}: ${applied.error.message}`,
      );
      return {
        state: commitObservationState(semanticBefore, "rejected", proposed.patch),
        patch: proposed.patch,
        status: "rejected",
      };
    }
    const situation = applySituationCoefficients(
      input.resolvedState.situation,
      {
        ...proposed.nextSituation,
        scene: applied.state.scene.summary || input.resolvedState.situation.scene,
      },
      input.resolvedState.battlefield?.coefficients,
    );
    return {
      state: {
        ...commitObservationState(applied.state, "applied", proposed.patch),
        situation,
      },
      patch: proposed.patch,
      status: "applied",
    };
  } catch (error) {
    console.warn(
      "[battle] semantic reconciliation skipped",
      error instanceof Error ? error.message : error,
    );
    return {
      state: commitObservationState(semanticBefore, "skipped", null),
      patch: null,
      status: "skipped",
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
}): Promise<{ focus: NarrationFocus; digests: InnerDigest[] }> {
  const summaryA = buildInnerDigest({
    side: "a",
    displayName: input.sideAName,
    agent: input.agentStateA,
    cognition: input.cognitionA,
    level: "summary",
  });
  const summaryB = buildInnerDigest({
    side: "b",
    displayName: input.sideBName,
    agent: input.agentStateB,
    cognition: input.cognitionB,
    level: "summary",
  });
  const detailA = buildInnerDigest({
    side: "a",
    displayName: input.sideAName,
    agent: input.agentStateA,
    cognition: input.cognitionA,
    level: "detail",
  });
  const detailB = buildInnerDigest({
    side: "b",
    displayName: input.sideBName,
    agent: input.agentStateB,
    cognition: input.cognitionB,
    level: "detail",
  });

  let focus = lockedFocusFromPerspective(input.perspective);
  if (focus == null || needsFocusChoice(input.perspective)) {
    try {
      if (input.llm.chooseNarrationFocus) {
        const chosen = await withTimeout(
          input.llm.chooseNarrationFocus({
            turn: input.turn,
            scene: input.scene,
            sideAName: input.sideAName,
            sideBName: input.sideBName,
            events: input.events,
            summaryA,
            summaryB,
          }),
          10_000,
          "chooseNarrationFocus",
        );
        focus = chosen.focus;
      } else {
        focus = "external";
      }
    } catch (e) {
      console.warn(
        "[battle] chooseNarrationFocus failed",
        e instanceof Error ? e.message : e,
      );
      focus = "external";
    }
  }

  return {
    focus,
    digests: selectDigestsForFocus({ focus, detailA, detailB }),
  };
}

function mergeSituationPatches(
  base: Partial<Situation>,
  happening: Partial<Situation> | null,
): Partial<Situation> {
  if (!happening) return base;
  return {
    scene: happening.scene ?? base.scene,
    notes: happening.notes ?? base.notes,
    coefficients: {
      ...(base.coefficients ?? {}),
      ...(happening.coefficients ?? {}),
    },
    tags: [
      ...new Set([...(base.tags ?? []), ...(happening.tags ?? [])]),
    ],
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

function replaceRepeatedPublicSpeeches(input: {
  narrative: { speeches: Array<{ speaker: string; text: string }> };
  recentSpeeches: Array<{ speaker: string; text: string }>;
  turn: number;
}) {
  const previous = new Map(
    input.recentSpeeches.map((line) => [
      `${line.speaker}:${normalizePublicText(line.text)}`,
      true,
    ]),
  );
  return input.narrative.speeches.map((line, index) => {
    const duplicate = previous.has(
      `${line.speaker}:${normalizePublicText(line.text)}`,
    );
    if (!duplicate || !normalizePublicText(line.text)) return line;
    return {
      ...line,
      text: (input.turn + index) % 2 === 0
        ? "（言葉を飲み、動きで応じる）"
        : "（次の変化へ意識を向ける）",
    };
  });
}

async function buildHappening(input: {
  llm: LlmProvider;
  state: BattleState;
  turn: number;
  supervisor: ReturnType<typeof normalizeSupervisor>;
}): Promise<HappeningPlan | null> {
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
      title: removeCategoryLabel(raw.title) || "場の変化",
      summary:
        removeCategoryLabel(raw.summary) || "場の条件が変わり、膠着が崩れる。",
      notes:
        removeCategoryLabel(raw.notes) || "環境の変化が両者へ影響している。",
      coefficients: raw.coefficients ?? { damage: 1.1 },
      tags: raw.tags?.filter((tag) => !tag.includes("ハプニング")),
      envHits: raw.envHits?.filter((hit) => hit.target === "both"),
    };
  } catch (e) {
    console.warn("[supervisor] generated field change skipped", e);
    return null;
  }
}

async function advanceTurnWithLease(input: {
  userId: string;
  battleId: string;
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
  const state = await battleRepo.getBattle(input.battleId);
  if (!meta || !state) throw new Error("BATTLE_NOT_FOUND");
  if (meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  if (state.status !== "active") throw new Error("BATTLE_FINISHED");

  // Backfill for older battles
  if (!state.policiesA) state.policiesA = [];
  if (!state.selectedPolicyIdsA) state.selectedPolicyIdsA = [];
  if (!state.policiesB) state.policiesB = [];
  if (!state.selectedPolicyIdsB) state.selectedPolicyIdsB = [];

  const mine = await charRepo.getSheet(meta.side_a_character_id);
  const opp = await charRepo.getSheet(meta.side_b_character_id);
  if (!mine || !opp) throw new Error("CHARACTER_MISSING");
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
      emit,
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
      emit,
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
  let happening: HappeningPlan | null = null;
  const inject = shouldInjectHappening(
    supervisor,
    upcomingTurn,
    state.turnLimit,
  );
  if (inject) {
    happening = await buildHappening({
      llm: input.llm,
      state,
      turn: upcomingTurn,
      supervisor,
    });
  }

  // Ordinary scene continuity is reconciled from committed turn effects below.
  // Only a supervisor-approved anti-stall happening may affect this turn.
  const baseSituation: Partial<Situation> = {
    scene: state.situation.scene,
    notes: state.situation.notes,
    coefficients: {},
  };

  const situationUpdate: Partial<Situation> = mergeSituationPatches(
    baseSituation,
    happening ? happeningToSituationPatch(happening) : null,
  );

  const hpBeforeA = state.sideA.parameters.hp ?? 0;
  const hpBeforeB = state.sideB.parameters.hp ?? 0;

  // Clamp legacy inflated skill.power (LLM sometimes wrote 20–40 as "damage score")
  const safeSkills = (skills: Skill[]) => skills.map(balanceSkill);
  const resolved = resolveTurn({
    state,
    sideASkills: safeSkills(mine.skills),
    sideBSkills: safeSkills(opp.skills),
    sideABasicAttack: mine.basicAttack,
    sideBBasicAttack: opp.basicAttack,
    situationUpdate,
    preEvents: happening ? happeningToEvents(happening) : undefined,
    envHits: happening?.envHits,
  });
  let next = resolved.state;
  const events = resolved.events;

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
  supervisor = advanceSupervisorClock(
    supervisor,
    quiet,
    isPassiveTurn(events),
    happening,
    hpAfterA,
    hpAfterB,
  );
  next = { ...next, supervisor };

  emit({ type: "phase", phase: "agents" });
  const semanticTurn = await reconcileSemanticState({
    llm: input.llm,
    stateBeforeTurn: state,
    resolvedState: next,
    mine,
    opp,
    actions: resolved.actions,
    events,
    environmentBeatDue,
    dramaPhase,
  });
  next = semanticTurn.state;
  const semanticChanges = semanticChangeKinds(
    semanticTurn.status === "applied" ? semanticTurn.patch : null,
  );
  const environmentBeatCommitted =
    semanticChanges.locationChanged || semanticChanges.environmentChanged;

  const perspective: NarrationPerspective =
    next.narrationStyle?.perspective ?? "external";
  let cognitionA: CharacterCognition | undefined;
  let cognitionB: CharacterCognition | undefined;

  if (agentsUsefulForPerspective(perspective)) {
    const agentTurn = await advanceCharacterAgents({
      llm: input.llm,
      before: state,
      after: next,
      mine,
      opp,
      events,
      actions: resolved.actions,
    });
    next = agentTurn.state;
    const rec = (next.turnRecords ?? [])[(next.turnRecords ?? []).length - 1];
    cognitionA = rec?.cognitionA;
    cognitionB = rec?.cognitionB;
  } else {
    // External: skip agents for latency; still store engine cognition.
    const turnRecord = buildBattleTurnRecord({
      before: state,
      after: next,
      events,
      actions: resolved.actions,
    });
    next = {
      ...next,
      turnRecords: [...(next.turnRecords ?? []), turnRecord].slice(-50),
    };
    cognitionA = turnRecord.cognitionA;
    cognitionB = turnRecord.cognitionB;
  }

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
  });

  emit({ type: "phase", phase: "narrating" });
  const recentBlocks = state.log.slice(-2);
  const recentNarration = recentBlocks.flatMap((block) => block.narrator).slice(-4);
  const recentSpeeches = recentBlocks.flatMap((block) => block.speeches).slice(-4);
  const actionBeats = buildNarrationActionBeats({
    actions: resolved.actions,
    events,
    mine,
    opp,
    state: next,
  });
  let narrative;
  try {
    // Per-attempt budget must cover primary abort (~14–16s) + router failover to
    // the next provider. A single 18s race was expiring mid-failover and dumping
    // raw engine events. Retry once after a full failed attempt.
    narrative = await withTimeoutAttempts(
      () =>
        input.llm.narrateTurn({
          turn: next.turn,
          scene: next.situation.scene,
          sideAName: next.sideA.displayName,
          sideBName: next.sideB.displayName,
          battlefield: next.battlefield,
          semanticObservation: next.observationStatePublic ?? null,
          events,
          actionBeats,
          recentNarration,
          recentSpeeches,
          drama: {
            phase: dramaPhase,
            repeatedActionA: dramaBefore.repeatedActionA,
            repeatedActionB: dramaBefore.repeatedActionB,
            environmentBeatDue: environmentBeatCommitted,
          },
          innerDigests: digests,
          focus,
          perspective,
          styleInstruction: next.narrationStyle?.instruction,
          styleName: next.narrationStyle?.displayName,
          onProgress: (progress) => {
            emit({
              type: "narrator",
              lines: progress.lines,
              draft: progress.draft ?? null,
              turn: next.turn,
            });
          },
        }),
      {
        timeoutMs: 32_000,
        attempts: 2,
        label: "narrateTurn",
        gapMs: 400,
      },
    );
  } catch (e) {
    console.warn(
      "[battle] narrateTurn fallback",
      e instanceof Error ? e.message : e,
    );
    const place = next.battlefield?.displayName ?? next.situation.scene;
    narrative = {
      turn: next.turn,
      narrator: [
        `第${next.turn}ターン — ${place}。`,
        ...events.map((ev) => ev.summary),
      ],
      speeches: [
        { speaker: next.sideA.displayName, text: "…" },
        { speaker: next.sideB.displayName, text: "…" },
      ],
    };
    emit({
      type: "narrator",
      lines: narrative.narrator,
      draft: null,
      turn: next.turn,
    });
  }
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
  if (narrative.narrator.length < 2) {
    narrative.narrator = [
      ...narrative.narrator,
      ...actionBeats.flatMap((beat) => [
        `${beat.actorName} は ${beat.actionName} を起こした。`,
        ...beat.outcomes,
      ]),
    ].filter((line, index, lines) => lines.indexOf(line) === index).slice(0, 4);
  }
  narrative.speeches = replaceRepeatedPublicSpeeches({
    narrative,
    recentSpeeches,
    turn: next.turn,
  });
  if (narrative.speeches?.length) {
    emit({ type: "speeches", speeches: narrative.speeches });
  }
  next = {
    ...next,
    agentStateA: next.agentStateA
      ? {
          ...next.agentStateA,
          lastSpeech:
            [...narrative.speeches]
              .reverse()
              .find((line) => line.speaker === next.sideA.displayName)?.text ??
            next.agentStateA.lastSpeech,
        }
      : next.agentStateA,
    agentStateB: next.agentStateB
      ? {
          ...next.agentStateB,
          lastSpeech:
            [...narrative.speeches]
              .reverse()
              .find((line) => line.speaker === next.sideB.displayName)?.text ??
            next.agentStateB.lastSpeech,
        }
      : next.agentStateB,
    dramaState: advanceDramaState({
      previous: dramaBefore,
      turn: next.turn,
      turnLimit: next.turnLimit,
      actions: resolved.actions,
      narrative,
      sideAName: next.sideA.displayName,
      sideBName: next.sideB.displayName,
      locationChanged: semanticChanges.locationChanged,
      environmentBeatOccurred:
        Boolean(happening) || semanticChanges.environmentChanged,
    }),
    log: [...next.log, narrative],
  };
  emit({ type: "phase", phase: "finalizing" });

  // KO this turn: combat narrative is done, but official finish waits for aftermath advance.
  // Do not settle rating yet.
  if (next.aftermathPending) {
    await battleRepo.saveBattle(next, {
      sideAUserId: meta.side_a_user_id,
      sideACharacterId: meta.side_a_character_id,
      sideBCharacterId: meta.side_b_character_id,
    });
    return toBattlePublic(next, mine, null, opp);
  }

  let resultSummary: string | null = null;
  if (next.status === "finished") {
    if (next.finishReason === "turn_limit") {
      const ref = await input.llm.referee({
        sideAName: next.sideA.displayName,
        sideBName: next.sideB.displayName,
        engineWinnerSide: next.winnerSide,
        logSummaries: next.log.flatMap((b) => b.narrator).slice(-12),
      });
      next = { ...next, winnerSide: ref.winnerSide };
      resultSummary = ref.summary;
      next = {
        ...next,
        log: [
          ...next.log,
          {
            turn: next.turn,
            narrator: ["——判定——", ref.summary],
            speeches: [],
          },
        ],
      };
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

  await battleRepo.saveBattle(next, {
    sideAUserId: meta.side_a_user_id,
    sideACharacterId: meta.side_a_character_id,
    sideBCharacterId: meta.side_b_character_id,
  });

  return toBattlePublic(next, mine, resultSummary, opp);
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
  if (agentsUsefulForPerspective(perspective)) {
    emit({ type: "phase", phase: "agents" });
    const prologueAgents = await advanceCharacterAgents({
      llm: input.llm,
      before: state,
      after: state,
      mine: input.mine,
      opp: input.opp,
      events: openEvents,
      actions: [],
    });
    state = prologueAgents.state;
  }
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
  });

  emit({ type: "phase", phase: "narrating" });
  let narrative;
  try {
    narrative = await withTimeout(
      input.llm.narratePrologue({
        scene: state.situation.scene,
        sideAName: state.sideA.displayName,
        sideBName: state.sideB.displayName,
        sideABlurb: input.mine.narrativeBlurb,
        sideBBlurb: input.opp.narrativeBlurb,
        sideATraits: input.mine.traits,
        sideBTraits: input.opp.traits,
        policySummary: policyLine,
        priorMatchSummary: state.priorMatchSummary ?? undefined,
        battlefield: state.battlefield,
        innerDigests: digests,
        focus,
        perspective,
        styleInstruction: state.narrationStyle?.instruction,
        styleName: state.narrationStyle?.displayName,
        onProgress: (progress) => {
          emit({
            type: "narrator",
            lines: progress.lines,
            draft: progress.draft ?? null,
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
    narrative = {
      turn: 0,
      narrator: [
        "——開幕——",
        `${place}で ${state.sideA.displayName} と ${state.sideB.displayName} が対峙する。`,
        state.battlefield?.narrativeSetup || state.situation.notes || "",
        state.priorMatchSummary
          ? `因縁 — ${state.priorMatchSummary}`
          : "",
        policyLine ? `${state.sideA.displayName} の方針: ${policyLine}` : "",
      ].filter(Boolean),
      speeches: [
        { speaker: state.sideA.displayName, text: "……始めよう。" },
        { speaker: state.sideB.displayName, text: "…" },
      ],
    };
    emit({
      type: "narrator",
      lines: narrative.narrator,
      draft: null,
      turn: 0,
    });
  }

  if (narrative.speeches?.length) {
    emit({ type: "speeches", speeches: narrative.speeches });
  }
  emit({ type: "phase", phase: "finalizing" });

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

  const next: BattleState = {
    ...state,
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

  return toBattlePublic(next, input.mine, null, input.opp);
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
  const state = input.state;
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
  });
  emit({ type: "phase", phase: "narrating" });
  let narrative;
  try {
    narrative = await withTimeout(
      input.llm.narrateAftermath({
        turn: aftermathTurn,
        scene: state.situation.scene,
        sideAName: state.sideA.displayName,
        sideBName: state.sideB.displayName,
        winnerSide: state.winnerSide,
        winnerName,
        fallenNames: fallen,
        battlefield: state.battlefield,
        recentNarration: state.log
          .slice(-2)
          .flatMap((b) => b.narrator)
          .slice(-8),
        innerDigests: digests,
        focus,
        perspective,
        styleInstruction: state.narrationStyle?.instruction,
        styleName: state.narrationStyle?.displayName,
        onProgress: (progress) => {
          emit({
            type: "narrator",
            lines: progress.lines,
            draft: progress.draft ?? null,
            turn: aftermathTurn,
          });
        },
      }),
      18_000,
      "narrateAftermath",
    );
  } catch (e) {
    console.warn("[battle] narrateAftermath failed", e);
    narrative = {
      turn: aftermathTurn,
      narrator: [
        "——決着の余波——",
        fallen.length
          ? `${fallen.join("と")} は地に伏し、戦いは静かに幕を閉じた。`
          : "戦場に余韻だけが残った。",
        winnerName
          ? `${winnerName} は息を整え、その先の運命を見据える。`
          : "どちらも立ってはいられない。",
      ],
      speeches: winnerName
        ? [{ speaker: winnerName, text: "……。" }]
        : [
            { speaker: state.sideA.displayName, text: "…" },
            { speaker: state.sideB.displayName, text: "…" },
          ],
    };
    emit({
      type: "narrator",
      lines: narrative.narrator,
      draft: null,
      turn: aftermathTurn,
    });
  }

  if (narrative.speeches?.length) {
    emit({ type: "speeches", speeches: narrative.speeches });
  }
  emit({ type: "phase", phase: "finalizing" });

  // Mark epilogue block for UI (prefix first line if missing)
  if (
    narrative.narrator[0] &&
    !narrative.narrator[0].includes("余波") &&
    !narrative.narrator[0].includes("エピローグ")
  ) {
    narrative = {
      ...narrative,
      narrator: ["——決着の余波——", ...narrative.narrator],
    };
  }

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

  await battleRepo.saveBattle(next, {
    sideAUserId: input.meta.side_a_user_id,
    sideACharacterId: input.meta.side_a_character_id,
    sideBCharacterId: input.meta.side_b_character_id,
  });

  // The winner card already states the mechanical result. The aftermath log is
  // LLM-authored, so do not append a second fixed-prose result summary here.
  return toBattlePublic(next, input.mine, null, input.opp);
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
  return toPublicCharacter(candidates[0]!, userId);
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

export { toPublicCharacter };
