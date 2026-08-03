import type {
  BattlefieldInstance,
  BattlefieldPreset,
  BattlePolicyOption,
  CharacterSheet,
  CharacterIdentity,
  CharacterAgentState,
  CharacterCognition,
  NarrativeBlock,
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

export type GenerateCharacterInput = {
  prompt: string;
  referenceTools?: CharacterReferenceTools;
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
    battlefield?: BattlefieldInstance | null;
  }): Promise<{
    title: string;
    summary: string;
    notes: string;
    coefficients?: Record<string, number>;
    tags?: string[];
    envHits?: Array<{
      target: "a" | "b" | "both";
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
  }): Promise<{ state: CharacterAgentState; speech: string | null }>;
  narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: TurnEvent[];
    /** Character-owned lines; narrator must not rewrite them. */
    agentSpeeches?: SpeechLine[];
    battlefield?: BattlefieldInstance | null;
    /** Narration style instruction for this match. */
    styleInstruction?: string;
    styleName?: string;
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
    battlefield?: BattlefieldInstance | null;
    styleInstruction?: string;
    styleName?: string;
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
    styleInstruction?: string;
    styleName?: string;
  }): Promise<NarrationResult>;
  /** Draft a custom narration style from free text. */
  generateNarrationStyle?(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
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
}
