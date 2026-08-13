export const PROVIDER_OPERATION_TAXONOMY_REVISION =
  "battle-provider-operations-v1";

export const PROVIDER_OPERATION_LAYERS = {
  concretizeBattlefield: "encounter",
  prepareBattleEncounter: "encounter",
  adjudicateFreeActions: "environment",
  proposeSituation: "environment",
  reconcileTurnSemanticState: "environment",
  proposeHappening: "environment",
  advanceCharacterPsycheCompact: "deepPsyche",
  advanceCharacterPsyche: "deepPsyche",
  advanceCharacterAgentCompact: "characterExpression",
  advanceCharacterAgent: "characterExpression",
  decideCharacterAction: "characterExpression",
  chooseNarrationFocus: "narration",
  narratePrologue: "narration",
  narrateTurn: "narration",
  narrateJudgment: "narration",
  narrateAftermath: "narration",
  referee: "referee",
} as const;

export type ProviderOperationName = keyof typeof PROVIDER_OPERATION_LAYERS;
export type ProviderOperationLayer =
  (typeof PROVIDER_OPERATION_LAYERS)[ProviderOperationName];

export function providerOperationLayer(
  operation: string,
): ProviderOperationLayer | null {
  return Object.prototype.hasOwnProperty.call(PROVIDER_OPERATION_LAYERS, operation)
    ? PROVIDER_OPERATION_LAYERS[operation as ProviderOperationName]
    : null;
}
