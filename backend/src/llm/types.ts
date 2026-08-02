import type {
  BattlefieldInstance,
  BattlefieldPreset,
  BattlePolicyOption,
  CharacterSheet,
  NarrativeBlock,
  Situation,
  TurnEvent,
} from "@kshiai/shared";

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
  generateCharacter(prompt: string): Promise<GenerateCharacterResult>;
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
  narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: TurnEvent[];
    battlefield?: BattlefieldInstance | null;
  }): Promise<NarrationResult>;
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
  generateImagePrompt?(appearanceSummary: string, extra?: string): Promise<string>;
}
