import type { CharacterSheet, NarrativeBlock, Situation, TurnEvent } from "@kshiai/shared";

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
  proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
  }): Promise<SituationProposal>;
  narrateTurn(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: TurnEvent[];
  }): Promise<NarrationResult>;
  referee(input: {
    sideAName: string;
    sideBName: string;
    engineWinnerSide: "a" | "b" | "draw" | null;
    logSummaries: string[];
  }): Promise<RefereeResult>;
  generateImagePrompt?(appearanceSummary: string, extra?: string): Promise<string>;
}
