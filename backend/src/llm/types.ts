import type {
  BattlefieldInstance,
  BattlefieldPreset,
  BattlePolicyOption,
  BattleSemanticState,
  BattleSceneStateFact,
  CharacterImprovementMemo,
  CharacterSheet,
  CharacterIdentity,
  CharacterSelfProfileAnchor,
  CharacterAgentState,
  CharacterActionIntent,
  CharacterPerceptionFrame,
  InnerDigest,
  NarrativeBlock,
  NarrationFocus,
  NarrationPerspective,
  NarrationTurnView,
  NarratorRenderingProfileAnchors,
  NarratorContinuityView,
  NarratorRecognitionSubject,
  NarratorRecognitionUpdate,
  PerceivedCondition,
  Situation,
  TurnEvent,
  TurnSemanticPatch,
  ResolvedBattleAction,
  FinisherWindow,
  PerceptionEvidence,
  ObserverSafeAvailableAction,
  BattleAdjudicationReasonFact,
  BattleEncounterProposal,
  BattleSocialView,
  ApparentIdentityBelief,
  CurrentAccess,
  IdentityKnowledge,
  PerceptionCertainty,
  ParamKey,
  DecisionProfile,
  TacticalNeedFrame,
  LatentAffordanceProjection,
  OpportunityChain,
  FreeActionCanonicalRoot,
  FreeActionAdjudicationBatch,
} from "@kshiai/shared";
import type {
  PerceptionPromptInput,
} from "./perception-prompt-strategy.js";

export type CharacterReference = {
  id: string;
  displayName: string;
  identity: CharacterIdentity;
  appearanceSummary: string;
  traits: string[];
  narrativeBlurb: string;
  skillNames: string[];
  weaponName: string | null;
  armorName: string | null;
};

/** Owner-bound callbacks. Implementations must enforce scope before returning data. */
export type CharacterReferenceTools = {
  search(query: string, limit?: number): Promise<CharacterReference[]>;
  get(characterId: string): Promise<CharacterReference | null>;
};

export type CharacterActionDecisionContext = {
  nextTurn: number;
  turnsRemaining: number;
  availableActions: ObserverSafeAvailableAction[];
  finisher: FinisherWindow | null;
  /** Last executed/planned action for this side (for variety pressure). */
  lastAction?: {
    kind: CharacterActionIntent["kind"];
    skillId?: string;
    name?: string;
  } | null;
  /** How many consecutive turns this side repeated lastAction. */
  actionRepeatCount?: number;
  /**
   * none: free choice.
   * prefer_change: avoid repeating lastAction when alternatives exist.
   * require_change: nextAction must differ from lastAction when alternatives exist.
   */
  varietyPressure?: "none" | "prefer_change" | "require_change";
  decisionProfile?: DecisionProfile;
  tacticalNeed?: TacticalNeedFrame;
  affordances?: LatentAffordanceProjection[];
  opportunityChains?: OpportunityChain[];
};

export type CharacterCounterpartKnowledge = {
  displayName: string;
  /** Current coarse condition is omitted when the counterpart is not accessible. */
  condition?: PerceivedCondition;
};

/** Character-authored speech supplied to narration as immutable source material. */
export type CharacterSpeechDisplayContext = Readonly<{
  /** Resolved narration mode for this public rendering. */
  mode: "self" | "opponent" | "external" | "omniscient";
  /** View-safe participant wording; it may be an apparent form, not identity. */
  perceivedAs: string;
  /** Utterance-specific attribution wording from the selected observer. */
  utterancePerceivedAs: string;
  currentAccess: CurrentAccess;
  identityKnowledge: IdentityKnowledge;
  attributionCertainty: PerceptionCertainty;
  /** Observer-local appearance/identity belief, never canonical identity. */
  apparentIdentity?: ApparentIdentityBelief;
  /** How the selected character viewpoint addresses this counterpart. */
  relationshipAddress?: string;
}>;

export type CharacterSpeechSource = Readonly<{
  side: "a" | "b";
  /** Canonical server-only character name; adapters must not expose it as view evidence. */
  speaker: string;
  text: string;
  /** Server-selected fallback for the current presentation view. */
  displayLabel?: string;
  /** View-safe facts from which the narrator may freely word a display label. */
  displayContext?: CharacterSpeechDisplayContext;
}>;

/** Narrative-safe battle history for improvement analysis (no raw combat params). */
export type BattleHistorySearchHit = {
  battleId: string;
  result: "win" | "loss" | "draw" | "active" | "unknown";
  resultLabel: string | null;
  opponentName: string;
  turn: number;
  turnLimit: number;
  battlefieldName: string | null;
  scene: string;
  finishReason: string | null;
  updatedAt: string;
  skillMentions: string[];
  eventHighlights: string[];
};

export type BattleHistoryDetail = BattleHistorySearchHit & {
  policySummary: string | null;
  narrationExcerpts: string[];
  turnEventSummaries: string[];
};

/** Character-scoped battle history tools for coaching analysis. */
export type BattleHistoryTools = {
  search(query: string, limit?: number): Promise<BattleHistorySearchHit[]>;
  get(battleId: string): Promise<BattleHistoryDetail | null>;
};

export type CharacterConceptSnapshot = {
  displayName: string;
  traits: string[];
  narrativeBlurb: string;
  skillNames: string[];
  basicAttackName: string;
  weaponName: string | null;
  armorName: string | null;
};

export type AnalyzeCharacterImprovementInput = {
  character: CharacterConceptSnapshot;
  previousMemo: CharacterImprovementMemo;
  finishedBattles: number;
  battleTools: BattleHistoryTools;
};

export type AnalyzeCharacterImprovementResult = {
  strengths: string[];
  improvements: string[];
  summary: string;
  assistantMessage: string;
};

export type GenerateImprovementPromptInput = {
  character: CharacterConceptSnapshot;
  memo: CharacterImprovementMemo;
};

export type GenerateImprovementPromptResult = {
  prompt: string;
  assistantMessage: string;
};

export type GenerateCharacterInput = {
  prompt: string;
  referenceTools?: CharacterReferenceTools;
  /** Existing owner-scoped names that must not be reused by a new character. */
  reservedNames?: string[];
  /** Names rejected by the caller during this generation request. */
  rejectedNames?: string[];
};

export type GenerateCharacterResult = {
  sheet: Omit<
    CharacterSheet,
    "id" | "ownerUserId" | "createdAt" | "updatedAt"
  >;
  assistantMessage: string;
};

export type NarrationActionBeat = {
  actionId: string;
  actorSide: "a" | "b";
  actorName: string;
  actionKind: ResolvedBattleAction["kind"];
  actionName: string;
  description: string;
  intent: string;
  outcomes: string[];
};

export type AdjustCharacterResult = {
  sheetPatch: Partial<GenerateCharacterResult["sheet"]>;
  assistantMessage: string;
};

export type GenerateBattlefieldResult = {
  preset: Omit<
    BattlefieldPreset,
    "id" | "ownerUserId" | "createdAt" | "updatedAt" | "isSystem"
  >;
  assistantMessage: string;
};

export type AdjustBattlefieldResult = {
  presetPatch: Partial<GenerateBattlefieldResult["preset"]>;
  assistantMessage: string;
};

export type SituationProposal = Partial<Situation>;

export type NarrationResult = NarrativeBlock & {
  /** Narrator-only cognition produced by the same narration call. */
  recognitionUpdates?: NarratorRecognitionUpdate[];
};

/** Progressive narrator extraction while a chat completion is streaming. */
export type NarrationStreamProgress = {
  lines: string[];
  draft?: string | null;
};

export type RefereeResult = {
  winnerSide: "a" | "b" | "draw";
  /** Raw fact-based rationale. Public narration is produced in a later call. */
  reason: string;
  reasonFacts?: BattleAdjudicationReasonFact[];
};

export type JudgmentNarrationResult = {
  /** Presentation-only framing placed before the immutable verdict line. */
  before: string[];
  /** Presentation-only closing placed after the immutable verdict line. */
  after: string[];
};

export type AftermathNarrationResult = JudgmentNarrationResult & {
  /** Committed A/B reactions plus optional scene-grounded third-party rendering. */
  speeches: NonNullable<NarrationResult["speeches"]>;
  /** Narrator-only cognition produced by the same narration call. */
  recognitionUpdates?: NarratorRecognitionUpdate[];
};

/** Bounded committed facts for turn-limit review; never derived from narration. */
export type RefereeTurnFact = {
  turn: number;
  actions: Array<{
    actorSide: "a" | "b";
    kind: CharacterActionIntent["kind"];
    executed: boolean;
    skippedReason: string | null;
    resolutionReason: string | null;
  }>;
  effects: Array<{
    type: Exclude<TurnEvent["type"], "utterance">;
    actorSide: "a" | "b" | null;
    targetSides: Array<"a" | "b">;
    parameterKey: ParamKey | null;
    parameterDirection: "loss" | "gain" | null;
    intensity: "minor" | "moderate" | "heavy" | "critical" | null;
  }>;
  stateChanges: {
    a: { canFightBefore: boolean; canFightAfter: boolean };
    b: { canFightBefore: boolean; canFightAfter: boolean };
  };
  worldImpact: {
    status: "applied" | "rejected" | "skipped";
    operationKinds: string[];
  } | null;
};

export type RefereeFinalState = {
  a: {
    condition: PerceivedCondition;
    reserves: Record<"hp" | "mp" | "stamina", "empty" | "low" | "available" | "ample">;
  };
  b: {
    condition: PerceivedCondition;
    reserves: Record<"hp" | "mp" | "stamina", "empty" | "low" | "available" | "ample">;
  };
};

export interface LlmProvider {
  readonly name: string;
  /** Optional dual-tier model ids for diagnostics. */
  readonly models?: { engine: string; fast: string };
  generateCharacter(input: GenerateCharacterInput): Promise<GenerateCharacterResult>;
  inferCharacterIdentity(current: CharacterSheet): Promise<CharacterIdentity>;
  adjustCharacter(
    current: CharacterSheet,
    userMessage: string,
  ): Promise<AdjustCharacterResult>;
  generateBattlefieldPreset(input: {
    prompt: string;
    category?: BattlefieldPreset["category"];
  }): Promise<GenerateBattlefieldResult>;
  adjustBattlefieldPreset(
    current: BattlefieldPreset,
    userMessage: string,
  ): Promise<AdjustBattlefieldResult>;
  /** Expand a preset (or random theme) into a concrete match field. */
  concretizeBattlefield(input: {
    preset: BattlefieldPreset | null;
    random: boolean;
  }): Promise<BattlefieldInstance>;
  proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
    battlefield?: BattlefieldInstance | null;
  }): Promise<SituationProposal>;
  /** Propose battle-scoped presentation/social terms; server validates and freezes them. */
  prepareBattleEncounter(input: {
    sideA: {
      displayName: string;
      nicknames: string[];
      selfNames: string[];
      epithets: string[];
      traits: string[];
      narrativeBlurb: string;
    };
    sideB: {
      displayName: string;
      nicknames: string[];
      selfNames: string[];
      epithets: string[];
      traits: string[];
      narrativeBlurb: string;
    };
    field: {
      displayName: string;
      scene: string;
      terrain?: string;
      conditions: string[];
      narrativeSetup: string;
    };
    priorMatchSummary?: string | null;
  }): Promise<BattleEncounterProposal>;
  /** Interpret both sides' open attempts in one server-only call. */
  adjudicateFreeActions(input: {
    turn: number;
    scene: string;
    actors: {
      a: { displayName: string; capabilityEvidence: string[] };
      b: { displayName: string; capabilityEvidence: string[] };
    };
    intents: Array<{
      actorSide: "a" | "b";
      intent: CharacterActionIntent;
      perceivedAffordances: LatentAffordanceProjection[];
    }>;
    canonicalRoots: FreeActionCanonicalRoot[];
  }): Promise<FreeActionAdjudicationBatch>;
  /** Interpret committed turn facts into a proposed observable-world patch. */
  reconcileTurnSemanticState(input: {
    turn: number;
    before: BattleSemanticState;
    actions: ResolvedBattleAction[];
    events: TurnEvent[];
    battlefield?: BattlefieldInstance | null;
    characters: {
      a: {
        displayName: string;
        appearanceSummary: string;
        traits: string[];
        basicAttack: { name: string; description: string };
        skills: Array<{ id: string; name: string; description: string }>;
      };
      b: {
        displayName: string;
        appearanceSummary: string;
        traits: string[];
        basicAttack: { name: string; description: string };
        skills: Array<{ id: string; name: string; description: string }>;
      };
    };
    /** Request a non-mechanical location/object/environment change when plausible. */
    environmentBeatDue?: boolean;
    dramaPhase?: "opening" | "rising" | "climax";
    /** Qualitative, committed mechanics only. Raw parameter values are forbidden. */
    mechanicalEvidence: PerceptionPromptInput["mechanicalEvidence"];
  }): Promise<{
    patch: TurnSemanticPatch | null;
    worldPatchStatus?: "valid" | "rejected";
    nextSituation?: Partial<Situation>;
    sensoryEvidence?: PerceptionEvidence[];
    sensoryEvidenceStatus?: "valid" | "rejected" | "unavailable";
  }>;
  /**
   * Supervisor: invent a field-driven happening that breaks a stagnant fight.
   * Keep it coarse; engine applies light mechanical pressure separately.
   */
  proposeHappening(input: {
    scene: string;
    turn: number;
    sideAName: string;
    sideBName: string;
    stagnationHint: string;
    previousHappenings: Array<{ title: string; summary: string }>;
    battlefield?: BattlefieldInstance | null;
  }): Promise<{
    title: string;
    summary: string;
    notes: string;
    coefficients?: Record<string, number>;
    tags?: string[];
    envHits?: Array<{
      target: "both";
      kind: "damage" | "heal" | "disrupt";
      intensity: "minor" | "moderate";
    }>;
  }>;
  /** Advance one character from its frozen observer-relative frame only. */
  advanceCharacterAgent(input: {
    phase: "prologue" | "turn" | "aftermath";
    character: CharacterSelfProfileAnchor;
    previous: CharacterAgentState;
    perception: CharacterPerceptionFrame;
    /** Frozen asymmetric relationship terms for this battle. */
    social?: BattleSocialView;
    /** Present only when this frame identifies the counterpart. */
    counterpart?: CharacterCounterpartKnowledge;
    /** Omitted in aftermath, where the character plans no new combat turn. */
    decision?: CharacterActionDecisionContext;
  }): Promise<{
    state: CharacterAgentState;
    speech: string;
    nextAction?: CharacterActionIntent;
  }>;
  /**
   * Fluid perspective only: pick turn focus from thin summary digests.
   * Must not receive detail digests.
   */
  chooseNarrationFocus?(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: TurnEvent[];
    summaryA: InnerDigest;
    summaryB: InnerDigest;
  }): Promise<{ focus: NarrationFocus }>;
  narrateTurn(input: {
    /** Sole world/event source, already derived for the resolved perspective. */
    view: NarrationTurnView;
    recentNarration?: string[];
    recentSpeeches?: Array<{ speaker: string; text: string }>;
    drama?: {
      phase: "opening" | "rising" | "climax";
      turn: number;
      turnLimit: number;
      repeatedActionA: number;
      repeatedActionB: number;
      lastActionSignatureA?: string | null;
      lastActionSignatureB?: string | null;
      recentBeatFingerprints?: string[];
      turnsSinceLocationChange?: number;
      turnsSinceEnvironmentBeat?: number;
      environmentBeatDue: boolean;
      /** Server-derived progression cue: escalate, break stalemate, etc. */
      progressionHint?: string;
    };
    /** Already filtered digests for the resolved focus (may be empty). */
    innerDigests?: InnerDigest[];
    /** Character-authored lines. Narration may place and surface-style, not invent. */
    characterSpeeches?: readonly CharacterSpeechSource[];
    /** Narration style instruction for this match. */
    styleInstruction?: string;
    styleName?: string;
    /** When set, providers stream tokens and report partial narrator lines. */
    onProgress?: (progress: NarrationStreamProgress) => void;
  }): Promise<NarrationResult>;
  /**
   * Pre-combat prologue: opening lines, atmosphere, rivalry / fate.
   * Not a combat turn.
   */
  narratePrologue(input: {
    scene: string;
    sideAName: string;
    sideBName: string;
    sideABlurb?: string;
    sideBBlurb?: string;
    sideATraits?: string[];
    sideBTraits?: string[];
    policySummary?: string;
    /** Summary of last finished matchup between these two, if any. */
    priorMatchSummary?: string;
    innerDigests?: InnerDigest[];
    characterSpeeches?: readonly CharacterSpeechSource[];
    /** Rendering-only identity constraints, filtered for the resolved focus. */
    profileAnchors: NarratorRenderingProfileAnchors;
    /** Current ID-free object placements visible to this narration focus. */
    sceneStateFacts?: readonly BattleSceneStateFact[];
    focus?: NarrationFocus;
    perspective?: NarrationPerspective;
    narratorContinuity?: NarratorContinuityView | null;
    recognitionSubjects?: readonly NarratorRecognitionSubject[];
    battlefield?: BattlefieldInstance | null;
    styleInstruction?: string;
    styleName?: string;
    onProgress?: (progress: NarrationStreamProgress) => void;
  }): Promise<NarrationResult>;
  /**
   * Extra beat after KO: what becomes of the fallen / how the winner closes.
   * Not a combat turn — pure aftermath narration.
   */
  narrateAftermath(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    winnerSide: "a" | "b" | "draw" | null;
    winnerName: string | null;
    fallenNames: string[];
    battlefield?: BattlefieldInstance | null;
    recentNarration?: string[];
    innerDigests?: InnerDigest[];
    characterSpeeches?: readonly CharacterSpeechSource[];
    /** Rendering-only identity constraints, filtered for the resolved focus. */
    profileAnchors: NarratorRenderingProfileAnchors;
    /** Current ID-free object placements visible to this narration focus. */
    sceneStateFacts?: readonly BattleSceneStateFact[];
    focus?: NarrationFocus;
    perspective?: NarrationPerspective;
    narratorContinuity?: NarratorContinuityView | null;
    recognitionSubjects?: readonly NarratorRecognitionSubject[];
    styleInstruction?: string;
    styleName?: string;
    onProgress?: (progress: NarrationStreamProgress) => void;
  }): Promise<AftermathNarrationResult>;
  /**
   * Render an already-decided turn-limit judgment for the user. This call may
   * use public prose for continuity but has no result mutation authority.
   */
  narrateJudgment(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    winnerSide: "a" | "b" | "draw";
    winnerName: string | null;
    adjudicationReason: string;
    recentPublicNarration: string[];
    styleInstruction?: string;
    styleName?: string;
  }): Promise<JudgmentNarrationResult>;
  /** Draft a custom narration style from free text. */
  generateNarrationStyle?(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
    perspective?: NarrationPerspective;
  }>;
  referee(input: {
    sideAName: string;
    sideBName: string;
    engineWinnerSide: "a" | "b" | "draw" | null;
    /** Committed engine records only; public narration is deliberately absent. */
    turnFacts: RefereeTurnFact[];
    finalState: RefereeFinalState;
  }): Promise<RefereeResult>;
  /**
   * Generate case-based policy options from character traits + field.
   * Multi-select: defaultSelected marks recommended defaults.
   */
  generateBattlePolicies(input: {
    self: {
      displayName: string;
      traits: string[];
      skillNames: string[];
      narrativeBlurb: string;
      weaponName?: string | null;
    };
    foe?: {
      displayName: string;
      traits: string[];
      narrativeBlurb: string;
    } | null;
    field: {
      displayName: string;
      category: string;
      terrain?: string;
      obstacles?: string[];
      conditions?: string[];
      narrativeBlurb?: string;
    };
  }): Promise<{ options: BattlePolicyOption[]; rationale: string }>;
  /**
   * Analyze recent battle history via tools and produce owner memo notes.
   * Must preserve character concept; no raw parameter advice for players.
   */
  analyzeCharacterImprovement(
    input: AnalyzeCharacterImprovementInput,
  ): Promise<AnalyzeCharacterImprovementResult>;
  /**
   * Turn memo notes into a user chat message for adjustCharacter.
   * Amplify strengths; only improve non-concept-breaking weaknesses.
   */
  generateImprovementPrompt(
    input: GenerateImprovementPromptInput,
  ): Promise<GenerateImprovementPromptResult>;
}
