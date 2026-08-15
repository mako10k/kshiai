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
  CharacterDeepPsycheDelta,
  CharacterExpressionBrief,
  CharacterDeepPsycheUpdate,
  CharacterActionReactionContext,
  CharacterConversationContext,
  CharacterConversationEntry,
  DialogueThreadState,
  DialoguePipelineSettings,
  TurnObservationPacket,
  CharacterActionIntent,
  CharacterPerceptionFrame,
  InnerDigest,
  NarrativeBlock,
  NarrationFocus,
  NarrationPerspective,
  NarrationPresentationFocusMode,
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
  JudgmentPresentationProjection,
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
  EnvironmentProcessProposal,
  CharacterProfileSourceProjectionV2,
  CharacterDefinitionV2,
  CharacterDefinitionGapFillV2,
  CharacterDefinitionGapKey,
  CharacterDefinitionCheckFinding,
  CharacterConsciousSelfStaticProjectionV2,
  CharacterDeepPsycheStaticProjectionV2,
  CharacterNarrativeCueV2,
  CharacterNarratorStaticProjectionV2,
  CharacterObservableManifestationV2,
  AssetClaimRiskCode,
  BattlefieldDefinitionV2,
  BattlefieldEvolutionAffordanceV2,
  BattlefieldSceneSourceProjectionV2,
  NarrationDefinitionV2,
  NarrationStyleSourceProjectionV2,
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
  /** Deterministic forecast of the cost/readability penalty for repeating. */
  repetitionPenalty?: {
    ifRepeatedCount: number;
    staminaCost: number;
    effectMultiplier: number;
    opponentRead: boolean;
  };
};

export type CharacterActionDecisionInput = {
  /** Frozen self-only profile. Never includes the counterpart's private state. */
  character: CharacterSelfProfileAnchor;
  structuredSelf?: CharacterConsciousSelfStaticProjectionV2;
  /** Observer-relative facts committed before this decision boundary. */
  perception: CharacterPerceptionFrame;
  /** Server-owned legal choices and qualitative tactical constraints. */
  decision: CharacterActionDecisionContext;
};

export type CharacterDeepPsycheCompactInput = {
  contextMode: "compact";
  phase: "prologue" | "turn" | "aftermath";
  character: CharacterSelfProfileAnchor;
  stableDisposition?: CharacterDeepPsycheStaticProjectionV2;
  previous: Pick<CharacterAgentState,
    "privateMemory" | "currentGoal" | "emotion" | "beliefs" | "observations" |
    "speechStyle" | "lastSpeech" | "interior" | "dialogueThread">;
  turnObservation: TurnObservationPacket;
  conversation: { recentExchange: CharacterConversationEntry[] };
  /**
   * Owner-private, opponent-specific notes. This is deliberately separate
   * from privateMemory, which belongs to the current battle's inner state.
   */
  matchupMemory?: {
    preBattlePlan: string;
    postBattleReflection: string;
    battleCount: number;
  };
  dialoguePipeline?: DialoguePipelineSettings;
  social?: BattleSocialView;
  counterpart?: CharacterCounterpartKnowledge;
};

export type CharacterDeepPsycheAdvance =
  CharacterDeepPsycheUpdate & {
    delta?: CharacterDeepPsycheDelta;
    expressionBrief?: CharacterExpressionBrief;
    observableManifestations?: readonly CharacterObservableManifestationV2[];
    narrativeCues?: readonly CharacterNarrativeCueV2[];
  };

/** Conscious expression boundary: no raw latent psyche or interior state. */
export type CharacterConsciousPsycheProjection = Pick<
  CharacterAgentState,
  "emotion" | "speechStyle" | "selfReference"
>;

export type CharacterExpressionCompactInput = {
  contextMode: "compact";
  phase: "prologue" | "turn" | "aftermath";
  character: CharacterSelfProfileAnchor;
  structuredSelf?: CharacterConsciousSelfStaticProjectionV2;
  psyche: CharacterConsciousPsycheProjection;
  turnObservation: TurnObservationPacket;
  conversation: {
    recentExchange: CharacterConversationEntry[];
    anchoredExchange: CharacterConversationEntry | null;
  };
  relevantMemory: string | null;
  expressionBrief: CharacterExpressionBrief;
  observableManifestations?: readonly CharacterObservableManifestationV2[];
  social?: BattleSocialView;
  counterpart?: CharacterCounterpartKnowledge;
  decision?: CharacterActionDecisionContext;
};

export type CharacterDeepPsycheInput = CharacterDeepPsycheCompactInput | {
  contextMode?: "legacy";
  phase: "prologue" | "turn" | "aftermath";
  character: CharacterSelfProfileAnchor;
  stableDisposition?: CharacterDeepPsycheStaticProjectionV2;
  previous: CharacterAgentState;
  actionReaction: CharacterActionReactionContext;
  conversation: CharacterConversationContext;
  dialoguePipeline?: DialoguePipelineSettings;
  perception: CharacterPerceptionFrame;
  social?: BattleSocialView;
  counterpart?: CharacterCounterpartKnowledge;
};

export type CharacterExpressionInput = CharacterExpressionCompactInput | {
  contextMode?: "legacy";
  phase: "prologue" | "turn" | "aftermath";
  character: CharacterSelfProfileAnchor;
  structuredSelf?: CharacterConsciousSelfStaticProjectionV2;
  psyche: CharacterConsciousPsycheProjection;
  actionReaction: CharacterActionReactionContext;
  conversation: CharacterConversationContext;
  dialoguePipeline?: DialoguePipelineSettings;
  perception: CharacterPerceptionFrame;
  social?: BattleSocialView;
  counterpart?: CharacterCounterpartKnowledge;
  decision?: CharacterActionDecisionContext;
};

export type CharacterCounterpartKnowledge = {
  displayName: string;
  /** Current coarse condition is omitted when the counterpart is not accessible. */
  condition?: PerceivedCondition;
};

export type NarratorCharacterContextV2 = Readonly<{
  staticProjection: CharacterNarratorStaticProjectionV2;
  narrativeCues: readonly CharacterNarrativeCueV2[];
}>;

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

export type GenerateCharacterProfileInput = {
  /** Frozen owner instruction; usable for tone, never an independent fact allowlist. */
  sourceText: string;
  projection: CharacterProfileSourceProjectionV2;
};

export type GenerateCharacterDefinitionV2Input = {
  sourceText: string;
  /** Valid deterministic base carrying mechanics and stable references. */
  baseDefinition: CharacterDefinitionV2;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
};

export type GenerateCharacterProfileResult = {
  description: string;
  segments: Array<{
    id: string;
    text: string;
    kind: "fact" | "flavor";
    supportRefs: string[];
  }>;
  assistantMessage: string;
};

export type ValidateCharacterProfileClaimsInput = {
  projection: CharacterProfileSourceProjectionV2;
  profile: Pick<GenerateCharacterProfileResult, "description" | "segments">;
};

export type ValidateCharacterProfileClaimsResult = {
  segments: Array<{
    segmentId: string;
    verdict: "supported" | "flavor_only" | "unsupported";
    supportRefs: string[];
    riskCodes: AssetClaimRiskCode[];
  }>;
};

export type ReviewCharacterDefinitionV2Input = {
  sourceText: string;
  sourceKind: GenerateCharacterDefinitionV2Input["sourceKind"];
  baseDefinition: CharacterDefinitionV2;
  candidate: CharacterDefinitionV2;
  gaps: CharacterDefinitionGapKey[];
  findings: CharacterDefinitionCheckFinding[];
};

export type ReviewCharacterDefinitionV2Result = {
  verdict: "accept" | "revise";
  issues: CharacterDefinitionCheckFinding[];
  fill: CharacterDefinitionGapFillV2 | null;
};

export type GenerateBattlefieldSceneInput = {
  /** Frozen owner source is tone-only; projection owns publishable facts. */
  sourceText: string;
  projection: BattlefieldSceneSourceProjectionV2;
};

export type GenerateBattlefieldDefinitionV2Input = {
  sourceText: string;
  /** Valid deterministic base carrying stable IDs and bounded legacy facts. */
  baseDefinition: BattlefieldDefinitionV2;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
};

export type GenerateBattlefieldSceneResult = {
  description: string;
  segments: Array<{
    id: string;
    text: string;
    kind: "fact" | "flavor";
    supportRefs: string[];
  }>;
  assistantMessage: string;
};

export type ValidateBattlefieldSceneClaimsInput = {
  projection: BattlefieldSceneSourceProjectionV2;
  scene: Pick<GenerateBattlefieldSceneResult, "description" | "segments">;
};

export type ValidateBattlefieldSceneClaimsResult = {
  segments: Array<{
    segmentId: string;
    verdict: "supported" | "flavor_only" | "unsupported";
    supportRefs: string[];
    riskCodes: AssetClaimRiskCode[];
  }>;
};

export type GenerateNarrationDefinitionV2Input = {
  sourceText: string;
  baseDefinition: NarrationDefinitionV2;
  sourceKind: "create_instruction" | "revision_instruction" |
    "upgrade_description" | "import";
};

export type GenerateNarrationStyleDescriptionInput = {
  /** Frozen owner source is tone-only; projection owns publishable facts. */
  sourceText: string;
  projection: NarrationStyleSourceProjectionV2;
};

export type GenerateNarrationStyleDescriptionResult = {
  description: string;
  segments: Array<{
    id: string;
    text: string;
    kind: "fact" | "flavor";
    supportRefs: string[];
  }>;
  assistantMessage: string;
};

export type ValidateNarrationStyleClaimsInput = {
  projection: NarrationStyleSourceProjectionV2;
  style: Pick<GenerateNarrationStyleDescriptionResult, "description" | "segments">;
};

export type ValidateNarrationStyleClaimsResult = {
  segments: Array<{
    segmentId: string;
    verdict: "supported" | "flavor_only" | "unsupported";
    supportRefs: string[];
    riskCodes: AssetClaimRiskCode[];
  }>;
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
  generateCharacterDefinitionV2(
    input: GenerateCharacterDefinitionV2Input,
  ): Promise<CharacterDefinitionV2>;
  reviewCharacterDefinitionV2(
    input: ReviewCharacterDefinitionV2Input,
  ): Promise<ReviewCharacterDefinitionV2Result>;
  generateCharacterProfile(
    input: GenerateCharacterProfileInput,
  ): Promise<GenerateCharacterProfileResult>;
  validateCharacterProfileClaims(
    input: ValidateCharacterProfileClaimsInput,
  ): Promise<ValidateCharacterProfileClaimsResult>;
  inferCharacterIdentity(current: CharacterSheet): Promise<CharacterIdentity>;
  adjustCharacter(
    current: CharacterSheet,
    userMessage: string,
  ): Promise<AdjustCharacterResult>;
  generateBattlefieldPreset(input: {
    prompt: string;
    category?: BattlefieldPreset["category"];
  }): Promise<GenerateBattlefieldResult>;
  generateBattlefieldDefinitionV2(
    input: GenerateBattlefieldDefinitionV2Input,
  ): Promise<BattlefieldDefinitionV2>;
  generateBattlefieldScene(
    input: GenerateBattlefieldSceneInput,
  ): Promise<GenerateBattlefieldSceneResult>;
  validateBattlefieldSceneClaims(
    input: ValidateBattlefieldSceneClaimsInput,
  ): Promise<ValidateBattlefieldSceneClaimsResult>;
  generateNarrationDefinitionV2(
    input: GenerateNarrationDefinitionV2Input,
  ): Promise<NarrationDefinitionV2>;
  generateNarrationStyleDescription(
    input: GenerateNarrationStyleDescriptionInput,
  ): Promise<GenerateNarrationStyleDescriptionResult>;
  validateNarrationStyleClaims(
    input: ValidateNarrationStyleClaimsInput,
  ): Promise<ValidateNarrationStyleClaimsResult>;
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
    /** Supervisor noise. It is not a committed event until this call accepts it. */
    environmentProposal?: EnvironmentProcessProposal | null;
    dramaPhase?: "opening" | "rising" | "climax";
    /** Qualitative, committed mechanics only. Raw parameter values are forbidden. */
    mechanicalEvidence: PerceptionPromptInput["mechanicalEvidence"];
  }): Promise<{
    patch: TurnSemanticPatch | null;
    worldPatchStatus?: "valid" | "rejected";
    nextSituation?: Partial<Situation>;
    environmentDecision?: {
      status: "accepted" | "rejected";
      reason: string;
    } | null;
    sensoryEvidence?: PerceptionEvidence[];
    sensoryEvidenceStatus?: "valid" | "rejected" | "unavailable";
  }>;
  /**
   * Supervisor: propose a battlefield-grounded non-character action with a
   * persistent result. The canonical reconciler owns acceptance and effects.
   */
  proposeHappening(input: {
    scene: string;
    turn: number;
    sideAName: string;
    sideBName: string;
    stagnationHint: string;
    previousHappenings: Array<{ title: string; summary: string }>;
    battlefield?: BattlefieldInstance | null;
    /** The only structured evolution authority available for this proposal. */
    evolutionAffordance?: BattlefieldEvolutionAffordanceV2 | null;
    forbiddenDiscontinuities?: string[];
  }): Promise<{
    title: string;
    summary: string;
    notes: string;
    tags?: string[];
  }>;
  /**
   * Privately appraise the present turn before speech/action generation. This
   * stage owns psychological continuity; it never proposes mechanics or public
   * wording.
   */
  advanceCharacterPsyche(input: {
    phase: "prologue" | "turn" | "aftermath";
    character: CharacterSelfProfileAnchor;
    stableDisposition?: CharacterDeepPsycheStaticProjectionV2;
    previous: CharacterAgentState;
    actionReaction: CharacterActionReactionContext;
    conversation: CharacterConversationContext;
    dialoguePipeline?: DialoguePipelineSettings;
    perception: CharacterPerceptionFrame;
    social?: BattleSocialView;
    counterpart?: CharacterCounterpartKnowledge;
    contextMode?: "compact";
    turnObservation?: TurnObservationPacket;
    compactRecentExchange?: CharacterConversationEntry[];
  }): Promise<CharacterDeepPsycheAdvance>;
  /**
   * Choose one bounded action without producing speech or revising psyche.
   * This deliberately has a smaller context than advanceCharacterAgent.
   */
  decideCharacterAction(input: CharacterActionDecisionInput): Promise<{
    proposedAction: unknown | null;
  }>;
  /** Advance one character from its frozen observer-relative frame only. */
  advanceCharacterAgent(input: {
    phase: "prologue" | "turn" | "aftermath";
    character: CharacterSelfProfileAnchor;
    structuredSelf?: CharacterConsciousSelfStaticProjectionV2;
    psyche: CharacterConsciousPsycheProjection;
    actionReaction: CharacterActionReactionContext;
    conversation: CharacterConversationContext;
    dialoguePipeline?: DialoguePipelineSettings;
    perception: CharacterPerceptionFrame;
    social?: BattleSocialView;
    counterpart?: CharacterCounterpartKnowledge;
    decision?: CharacterActionDecisionContext;
    contextMode?: "compact";
    turnObservation?: TurnObservationPacket;
    expressionBrief?: CharacterExpressionBrief;
    observableManifestations?: readonly CharacterObservableManifestationV2[];
    compactRecentExchange?: CharacterConversationEntry[];
    anchoredExchange?: CharacterConversationEntry | null;
    relevantMemory?: string | null;
  }): Promise<{
    /** Echoed committed psyche for compatibility; the server ignores it. */
    state: CharacterAgentState;
    speech: string;
    /** Bounded model-authored candidate. Only the battle service may accept it. */
    proposedAction: unknown | null;
    /** Exact echo of one supplied proposal; the server still owns commitment. */
    realizedManifestation?: string | null;
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
    /** Explicit local-evaluation opt-in; ordinary battle requests omit it. */
    presentationFocusMode?: NarrationPresentationFocusMode;
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
    /** Perspective-selected static facts plus commit/evidence-gated dynamic cues. */
    structuredCharacterContexts?: Readonly<{
      a?: NarratorCharacterContextV2;
      b?: NarratorCharacterContextV2;
    }>;
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
    structuredCharacterContexts?: Readonly<{
      a?: NarratorCharacterContextV2;
      b?: NarratorCharacterContextV2;
    }>;
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
    structuredCharacterContexts?: Readonly<{
      a?: NarratorCharacterContextV2;
      b?: NarratorCharacterContextV2;
    }>;
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
    /** Audience-safe projection; raw adjudication prose is never admitted. */
    presentationProjection: JudgmentPresentationProjection;
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
