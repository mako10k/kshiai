import {
  AgencyFactsV1Schema, CharacterAgentStateSchema, CONSCIOUS_GOAL_POLICY_V3,
  decodeConsciousOutputV3, initialConsciousAgencyV1, initialPsycheReactionStateV1,
  projectPsycheReactionV1, type AgencyFactV1, type CharacterAgentState,
  type CharacterBattleCompilerInputsV2, type CharacterBattleCompilerInputsV3,
  BattleAssetManifestV3Schema, snapshotDialoguePipelineSettings,
  type BattleCharacterAssetBinding, type BattleState, type DialoguePipelineSettings,
} from "@kshiai/shared";
import type { CharacterExpressionCompactInputV3, CharacterAgentAdvanceResult, CharacterActionDecisionInput } from "./types.js";

export function boundConsciousCompiler(binding: BattleCharacterAssetBinding | undefined):
  CharacterBattleCompilerInputsV2 | CharacterBattleCompilerInputsV3 | undefined {
  return binding?.compilerInputsV3 ?? binding?.compilerInputsV2;
}

export function privateBattleGoal(state: BattleState, side: "a" | "b"): string {
  const agent = side === "a" ? state.agentStateA : state.agentStateB;
  if (state.assetManifest?.schemaVersion === 3) return agent?.consciousAgencyV1?.upperGoal?.statement ?? "";
  return (side === "a" ? state.openingPlanA : state.openingPlanB) ?? agent?.currentGoal ?? "";
}

export function legacyPublicOpeningPlan(state: BattleState, side: "a" | "b"): string | undefined {
  if (state.assetManifest?.schemaVersion === 3) return undefined;
  return (side === "a" ? state.agentStateA : state.agentStateB)?.currentGoal?.slice(0, 1200);
}

/** Compare typed frozen fields, without a serialization/parse round trip. */
export function assertConsciousBinding(state: BattleState, settings: DialoguePipelineSettings): void {
  if (settings.schemaVersion !== 3 && state.assetManifest?.schemaVersion !== 3) return;
  const manifest = BattleAssetManifestV3Schema.safeParse(state.assetManifest);
  if (settings.schemaVersion !== 3 || !manifest.success) throw new Error("BATTLE_CONTRACT_MISMATCH");
  const expected = manifest.data.dialoguePipeline.snapshot;
  const actual = snapshotDialoguePipelineSettings(settings);
  const stored = state.dialoguePipelineSnapshot;
  const keys = ["schemaVersion", "revision", "enabled", "conversationHistoryLimit", "contextProjectionMode",
    "recentExchangeLimit", "relevantMemoryLimit", "psychologyGuidance"] as const;
  if (!stored || keys.some((key) => expected[key] !== actual[key] || expected[key] !== stored[key])) {
    throw new Error("BATTLE_CONTRACT_MISMATCH");
  }
  if (!state.agentStateA?.consciousAgencyV1 || !state.agentStateB?.consciousAgencyV1 ||
      !state.agentStateA.reactionStateV1 || !state.agentStateB.reactionStateV1) {
    throw new Error("BATTLE_CONTRACT_MISMATCH");
  }
}

/** Reconstruct the closed request at the external provider boundary. */
export function consciousRequest(input: CharacterExpressionCompactInputV3): CharacterExpressionCompactInputV3 {
  return {
    contextMode: "compact", contractVersion: 3, phase: input.phase,
    character: input.character, structuredSelf: input.structuredSelf,
    agencyState: input.agencyState, reaction: input.reaction, goalPolicy: input.goalPolicy,
    facts: AgencyFactsV1Schema.parse(input.facts), turnObservation: input.turnObservation,
    utteranceHistory: input.utteranceHistory, observableManifestations: input.observableManifestations,
    ...(input.social ? { social: input.social } : {}),
    ...(input.counterpart ? { counterpart: input.counterpart } : {}),
    ...(input.phase !== "aftermath" && input.decision ? { decision: input.decision } : {}),
  };
}

export function consciousLaterRequest(input: CharacterActionDecisionInput) {
  const context = input.conscious;
  if (!context) throw new Error("BATTLE_CONTRACT_MISMATCH");
  return {
    contractVersion: 3, phase: "later", character: input.character,
    structuredSelf: input.structuredSelf, perception: input.perception, decision: input.decision,
    agencyState: context.agencyState, reaction: context.reaction, goalPolicy: context.goalPolicy,
    facts: AgencyFactsV1Schema.parse(context.facts), utteranceHistory: context.utteranceHistory,
  };
}

/** Enumerate only known paths in this bounded, observer-safe typed input. */
export function consciousFacts(input: Pick<CharacterExpressionCompactInputV3,
  "structuredSelf" | "character" | "decision" | "turnObservation" | "goalPolicy"
>): AgencyFactV1[] {
  const facts: AgencyFactV1[] = [
    { ref: "ordinary-goal", kind: "default_objective", sourcePath: "/goalPolicy" },
  ];
  input.structuredSelf.tendencies.forEach((_, index) => {
    facts.push({ ref: `tendency-${index}`, kind: "value", sourcePath: `/structuredSelf/tendencies/${index}` });
  });
  input.structuredSelf.background.forEach((_, index) => {
    facts.push({ ref: `background-${index}`, kind: "value", sourcePath: `/structuredSelf/background/${index}` });
  });
  input.structuredSelf.actionPrinciples.forEach((_, index) => {
    facts.push({ ref: `principle-${index}`, kind: "value", sourcePath: `/structuredSelf/actionPrinciples/${index}` });
  });
  if (input.structuredSelf.relationship) facts.push({ ref: "relationship", kind: "relationship", sourcePath: "/structuredSelf/relationship" });
  if (input.decision?.decisionProfile?.defaultObjective) {
    facts.push({ ref: "suggested-goal", kind: "suggested_objective", sourcePath: "/decision/decisionProfile/defaultObjective" });
  }
  facts.push({ ref: "self-abilities", kind: "ability", sourcePath: "/character" });
  if (input.decision) {
    facts.push({ ref: "current-reserves", kind: "reserve", sourcePath: "/decision/availableActions" });
    input.decision.availableActions.forEach((_, index) => {
      facts.push({ ref: `candidate-${index}`, kind: "candidate", sourcePath: `/decision/availableActions/${index}` });
    });
  }
  for (const key of ["selfResult", "counterpartResult", "ambientChange"] as const) {
    input.turnObservation[key].forEach((_, index) => {
      facts.push({ ref: `observation-${input.turnObservation.turn}-${key}-${index}`, kind: "observation", sourcePath: `/turnObservation/${key}/${index}` });
    });
  }
  return AgencyFactsV1Schema.parse(facts);
}

export function consciousReaction(state: CharacterAgentState, compiler: CharacterBattleCompilerInputsV2 | CharacterBattleCompilerInputsV3) {
  const projection = projectPsycheReactionV1(state.reactionStateV1 ?? initialPsycheReactionStateV1(), compiler.psycheTraits);
  return { action: projection.actionProjection, expression: projection.expressionProjection };
}

export function consciousResult(raw: unknown, phase: CharacterExpressionCompactInputV3["phase"]): CharacterAgentAdvanceResult {
  const output = decodeConsciousOutputV3(raw, phase);
  const expression = output.envelopeValid && output.phase !== "later" ? output : null;
  const choice = output.envelopeValid && output.phase !== "aftermath" ? output : null;
  return {
    contractVersion: 3,
    state: CharacterAgentStateSchema.parse({}),
    nextUtterance: expression?.nextUtterance.valid ? expression.nextUtterance.value : null,
    proposedAction: choice?.nextAction.valid ? choice.nextAction.value : null,
    proposedActionStatus: choice?.nextAction.valid ? "valid" : "invalid",
    realizedManifestation: expression?.realizedManifestation.valid ? expression.realizedManifestation.value : null,
    consciousOutput: output,
  };
}

export const CONSCIOUS_V3_PROMPT = `You are the character's single conscious agency, choosing goal, intent, action and speech together.
${CONSCIOUS_GOAL_POLICY_V3}
Use only frozen self, known relationship, observation and permitted actions. Reaction input is a tendency, not an order.
Evaluate your abilities, current reserves, reach, recent committed results and prior accepted intent against the upper goal. Choose the next feasible step with its costs and risks in mind; an intent is a concise conclusion, not a reasoning transcript.
Choose the Japanese utterance as this same character's action toward that aim: it may encourage yourself, probe, provoke, reassure or stay silent as appropriate. Merely restating observations is not the objective. Do not serialize private fields or basisRefs into speech; intended influence is not an accomplished effect.
For prologue/turn return exactly initialGoal, intent, nextAction, nextUtterance, realizedManifestation.
initialGoal: {statement:string1..240,basisRefs:string[1..6]} if agencyState.upperGoal is null, otherwise null.
intent: {aim:string1..160,basisRefs:string[1..8],rationale:string1..240}. Refs must be from facts; goal refs use only value/relationship/suggested_objective/default_objective.
nextAction is an existing permitted action intent object or null, not the full candidate metadata. Use kind; skill also needs skillId; reflect needs reflectionAnalysis and reflectionGuideline. Copy only valid references from decision. nextUtterance is nonblank string<=400 or null; silence and exact repeated text are legal.
realizedManifestation is exactly one supplied proposal string or null, never an invented effect.
For aftermath return only nextUtterance and realizedManifestation.
For later return only intent and nextAction. Keep the upper goal; already committed speech is history, do not speak again.
Your intent is not an executed effect or proof that the counterpart reacted as intended. Return JSON only.`;

export function mockConsciousResult(input: CharacterExpressionCompactInputV3): CharacterAgentAdvanceResult {
  const ref = input.facts.find((fact) => fact.kind === "value")?.ref ?? "ordinary-goal";
  return consciousResult(input.phase === "aftermath"
    ? { nextUtterance: null, realizedManifestation: null }
    : {
        initialGoal: input.agencyState.upperGoal ? null : { statement: "検証用の目標", basisRefs: [ref] },
        intent: { aim: "検証用の待機", rationale: "配線検証であり実モデルの判断ではない", basisRefs: [ref] },
        nextAction: null, nextUtterance: null, realizedManifestation: null,
      }, input.phase);
}
