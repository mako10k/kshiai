import {
  BattlePolicyOptionSchema,
  accumulateBattleBalanceTrace,
  advanceSupervisorClock,
  balanceSkill,
  buildBattleTurnRecord,
  buildCharacterAgentStateChange,
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
  type CharacterAgentState,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type CharacterSheet,
  type SpeechLine,
  type TurnEvent,
  type Skill,
  toNarrationSnapshot,
  type HappeningPlan,
  type Situation,
  type BattleAdvanceStreamEvent,
  defaultCharacterIdentity,
} from "@kshiai/shared";
import {
  recordBattleFinished,
  recordSheetSnapshot,
} from "./balance-observe.js";
import { config } from "../config.js";
import { newId } from "../id.js";
import type { LlmProvider } from "../llm/index.js";
import * as battleRepo from "../repositories/battles.js";
import * as bfRepo from "../repositories/battlefields.js";
import * as charRepo from "../repositories/characters.js";
import * as styleRepo from "../repositories/narration-styles.js";

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
    const preset = bfRepo.getPreset(input.battlefieldPresetId);
    if (!preset) throw new Error("BATTLEFIELD_NOT_FOUND");
    if (!preset.isSystem && preset.ownerUserId !== input.userId) {
      throw new Error("BATTLEFIELD_FORBIDDEN");
    }
    return input.llm.concretizeBattlefield({ preset, random: false });
  }

  const seed = bfRepo.pickRandomSystemPreset();
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
  const mine = charRepo.getSheet(input.myCharacterId);
  if (!mine || mine.ownerUserId !== input.userId) {
    throw new Error("MY_CHARACTER_NOT_FOUND");
  }
  const foe = input.opponentCharacterId
    ? charRepo.getSheet(input.opponentCharacterId)
    : null;

  let fieldPreset: BattlefieldPreset | null = null;
  if (input.battlefieldMode === "preset" && input.battlefieldPresetId) {
    fieldPreset = bfRepo.getPreset(input.battlefieldPresetId);
  } else if (input.battlefieldPresetId) {
    fieldPreset = bfRepo.getPreset(input.battlefieldPresetId);
  } else {
    fieldPreset = bfRepo.pickRandomSystemPreset();
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
  const mine = charRepo.getSheet(input.myCharacterId);
  const opp = charRepo.getSheet(input.opponentCharacterId);
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

  const narrationStyle = styleRepo.resolveNarrationStyleForUser(
    input.userId,
    input.narrationStyleId,
  );
  const narrationSnap = toNarrationSnapshot(narrationStyle);
  const priorMatchSummary = battleRepo.findPriorMatchSummary(
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

  // Light scene seed only — full opening monologue is the prologue advance.
  try {
    const sit = await withTimeout(
      input.llm.proposeSituation({
        scene: state.situation.scene,
        turn: 0,
        eventsHint: "opening",
        battlefield,
      }),
      8_000,
      "openingSituation",
    );
    if (sit.scene) state.situation.scene = sit.scene;
    if (sit.notes) state.situation.notes = sit.notes;
    if (sit.coefficients) {
      state.situation.coefficients = {
        ...state.situation.coefficients,
        ...sit.coefficients,
      };
    }
  } catch {
    /* keep concretized battlefield notes */
  }

  state = {
    ...state,
    prologuePending: true,
    log: [],
    updatedAt: new Date().toISOString(),
  };

  battleRepo.saveBattle(state, {
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
}): Promise<{ state: BattleState; speeches: SpeechLine[] }> {
  const record = buildBattleTurnRecord(input);
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
    agents = await withTimeout(Promise.all([
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
      speeches: [
        { speaker: input.mine.displayName, text: "…" },
        { speaker: input.opp.displayName, text: "…" },
      ],
    };
  }
  const [agentA, agentB] = agents;
  const completedRecord = {
    ...record,
    agentStateChangeA: buildCharacterAgentStateChange(previousA, agentA.state),
    agentStateChangeB: buildCharacterAgentStateChange(previousB, agentB.state),
  };
  // Speech is always non-empty (dialogue or stage reaction); never omit a side.
  const speeches: SpeechLine[] = [
    { speaker: input.mine.displayName, text: agentA.speech },
    { speaker: input.opp.displayName, text: agentB.speech },
  ];
  return {
    state: {
      ...input.after,
      agentStateA: agentA.state,
      agentStateB: agentB.state,
      turnRecords: [
        ...(input.after.turnRecords ?? []),
        completedRecord,
      ].slice(-50),
    },
    speeches,
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

export async function advanceTurn(input: {
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
  const meta = battleRepo.getBattleMeta(input.battleId);
  const state = battleRepo.getBattle(input.battleId);
  if (!meta || !state) throw new Error("BATTLE_NOT_FOUND");
  if (meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  if (state.status !== "active") throw new Error("BATTLE_FINISHED");

  // Backfill for older battles
  if (!state.policiesA) state.policiesA = [];
  if (!state.selectedPolicyIdsA) state.selectedPolicyIdsA = [];
  if (!state.policiesB) state.policiesB = [];
  if (!state.selectedPolicyIdsB) state.selectedPolicyIdsB = [];

  const mine = charRepo.getSheet(meta.side_a_character_id);
  const opp = charRepo.getSheet(meta.side_b_character_id);
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

  // Situation: short timeout preserves the current scene. Never block the turn.
  let baseSituation: Partial<Situation> = {
    scene: state.situation.scene,
    notes: state.situation.notes,
    coefficients: {},
  };
  try {
    baseSituation = await withTimeout(
      input.llm.proposeSituation({
        scene: state.situation.scene,
        turn: upcomingTurn,
        eventsHint: [
          `policies:${(state.selectedPolicyIdsA ?? []).join(",")}`,
          happening
            ? `supervisor:field_shift:${happening?.title ?? "env"}`
            : "supervisor:steady",
        ].join("|"),
        battlefield: state.battlefield,
      }),
      8_000,
      "proposeSituation",
    );
  } catch (e) {
    console.warn(
      "[battle] proposeSituation skipped",
      e instanceof Error ? e.message : e,
    );
  }

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
  const agentTurn = await advanceCharacterAgents({
    llm: input.llm,
    before: state,
    after: next,
    mine,
    opp,
    events,
  });
  next = agentTurn.state;
  if (agentTurn.speeches.length > 0) {
    emit({ type: "speeches", speeches: agentTurn.speeches });
  }

  emit({ type: "phase", phase: "narrating" });
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
          events,
          agentSpeeches: agentTurn.speeches,
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
    // Prefer finishing-blow lines first so mechanical fallback still names the KO.
    const ordered = [
      ...events.filter((ev) => /とどめ|決め手/.test(ev.summary)),
      ...events.filter((ev) => !/とどめ|決め手/.test(ev.summary)),
    ];
    narrative = {
      turn: next.turn,
      narrator: [
        `第${next.turn}ターン — ${place}。`,
        ...ordered.map((ev) => ev.summary),
      ],
      speeches: agentTurn.speeches,
    };
    emit({
      type: "narrator",
      lines: narrative.narrator,
      draft: null,
      turn: next.turn,
    });
  }
  next = { ...next, log: [...next.log, narrative] };
  emit({ type: "phase", phase: "finalizing" });

  // KO this turn: combat narrative is done, but official finish waits for aftermath advance.
  // Do not settle rating yet.
  if (next.aftermathPending) {
    battleRepo.saveBattle(next, {
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
    next = settleBattleRating(next);
    try {
      recordBattleFinished({
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

  battleRepo.saveBattle(next, {
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
  emit({ type: "phase", phase: "agents" });
  const prologueAgents = await advanceCharacterAgents({
    llm: input.llm,
    before: state,
    after: state,
    mine: input.mine,
    opp: input.opp,
    events: [{
      type: "situation",
      summary: `${state.situation.scene}で両者が対峙した。`,
    }],
  });
  state = prologueAgents.state;
  if (prologueAgents.speeches.length > 0) {
    emit({ type: "speeches", speeches: prologueAgents.speeches });
  }

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
        { speaker: state.sideB.displayName, text: "望むところだ。" },
      ],
    };
    emit({
      type: "narrator",
      lines: narrative.narrator,
      draft: null,
      turn: 0,
    });
  }

  narrative = { ...narrative, speeches: prologueAgents.speeches };
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

  battleRepo.saveBattle(next, {
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
      speeches: [],
    };
    emit({
      type: "narrator",
      lines: narrative.narrator,
      draft: null,
      turn: aftermathTurn,
    });
  }

  narrative = { ...narrative, speeches: [] };
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
  next = settleBattleRating(next);
  try {
    recordBattleFinished({
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

  battleRepo.saveBattle(next, {
    sideAUserId: input.meta.side_a_user_id,
    sideACharacterId: input.meta.side_a_character_id,
    sideBCharacterId: input.meta.side_b_character_id,
  });

  // The winner card already states the mechanical result. The aftermath log is
  // LLM-authored, so do not append a second fixed-prose result summary here.
  return toBattlePublic(next, input.mine, null, input.opp);
}

export async function performAction(input: {
  userId: string;
  battleId: string;
  llm: LlmProvider;
}): Promise<BattlePublic> {
  return advanceTurn(input);
}

export function pickRandomOpponent(userId: string, myCharacterId: string) {
  const all = charRepo.listPublicOpponents(userId);
  const candidates = all.filter((c) => c.id !== myCharacterId);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
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
