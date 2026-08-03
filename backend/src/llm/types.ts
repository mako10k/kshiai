import type {
  BattlefieldInstance,
  BattlefieldPreset,
  BattlePolicyOption,
  CharacterImprovementMemo,
  CharacterSheet,
  CharacterIdentity,
  CharacterAgentState,
  CharacterCognition,
  InnerDigest,
  NarrativeBlock,
  NarrationFocus,
  NarrationPerspective,
  SpeechLine,
  Situation,
  TurnEvent,
} from "@kshiai/shared";

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

export type NarrationResult = NarrativeBlock;

/** Progressive narrator extraction while a chat completion is streaming. */
export type NarrationStreamProgress = {
  lines: string[];
  draft?: string | null;
};

export type RefereeResult = {
  winnerSide: "a" | "b" | "draw";
  summary: string;
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
  /** Advance one character in isolation from engine-authored cognition. */
  advanceCharacterAgent(input: {
    character: {
      displayName: string;
      identity: CharacterIdentity;
      traits: string[];
      narrativeBlurb: string;
      skillNames: string[];
    };
    foeName: string;
    previous: CharacterAgentState;
    cognition: CharacterCognition;
  }): Promise<{ state: CharacterAgentState; speech: string }>;
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
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: TurnEvent[];
    /**
     * @deprecated Public dialogue is narrator-authored. Kept for fallback only.
     */
    agentSpeeches?: SpeechLine[];
    /** Already filtered digests for the resolved focus (may be empty). */
    innerDigests?: InnerDigest[];
    focus?: NarrationFocus;
    perspective?: NarrationPerspective;
    battlefield?: BattlefieldInstance | null;
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
    focus?: NarrationFocus;
    perspective?: NarrationPerspective;
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
    focus?: NarrationFocus;
    perspective?: NarrationPerspective;
    styleInstruction?: string;
    styleName?: string;
    onProgress?: (progress: NarrationStreamProgress) => void;
  }): Promise<NarrationResult>;
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
    logSummaries: string[];
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
