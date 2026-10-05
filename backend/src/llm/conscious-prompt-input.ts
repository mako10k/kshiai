// R: Project frozen conscious inputs into model-visible facts and prose without adding knowledge.
import type { AgencyPhase, ConsciousGenerationFieldV4, ConsciousOutputV4 } from "@kshiai/shared";
import type { CharacterExpressionCompactInputV4, CharacterActionDecisionContext } from "./types.js";
import { renderPromptSections } from "./prompt-prose.js";

export type ConsciousInput = Omit<CharacterExpressionCompactInputV4, "phase" | "turnObservation"> & {
  phase: AgencyPhase;
  turnObservation?: CharacterExpressionCompactInputV4["turnObservation"];
};
type Choice = { key: string; candidate: CharacterActionDecisionContext["availableActions"][number] };
export type ConsciousRepairInput = {
  previousResponse: unknown;
  errors: ConsciousOutputV4["errors"];
  repairFields: readonly ConsciousGenerationFieldV4[];
  fixedAction?: Readonly<Record<string, unknown>>;
  payloadFields?: readonly string[];
  preserveFields: readonly ConsciousGenerationFieldV4[];
  instruction: string;
};

function factContent(input: ConsciousInput, sourcePath: string): unknown {
  let value: unknown = input;
  for (const key of sourcePath.slice(1).split("/")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return null;
    value = Reflect.get(value, key);
  }
  return value;
}

export function prepareSpeechHistory(input: ConsciousInput["utteranceHistory"]) {
  let latestSelfIndex: number | null = null;
  let latestCounterpartIndex: number | null = null;
  input.recent.forEach((entry, index) => {
    if (entry.speaker === "self") latestSelfIndex = index;
    if (entry.speaker === "counterpart") latestCounterpartIndex = index;
  });
  return { recent: input.recent, latestSelfIndex, latestCounterpartIndex };
}

export function prepareConsciousPromptContext(
  input: ConsciousInput,
  choices: readonly Choice[],
  includeGoalPolicy: boolean,
) {
  return {
    ...input,
    utteranceHistory: prepareSpeechHistory(input.utteranceHistory),
    facts: input.facts.map((fact) => ({ ref: fact.ref, kind: fact.kind, content: factContent(input, fact.sourcePath) })),
    goalPolicy: includeGoalPolicy ? input.goalPolicy : undefined,
    decision: input.decision ? { ...input.decision, availableActions: undefined } : undefined,
    choices,
    manifestations: input.observableManifestations.map((manifestation, index) => ({ key: `manifestation-${index}`, ...manifestation })),
    observableManifestations: undefined,
  };
}

export function renderConsciousPromptInput(
  context: ReturnType<typeof prepareConsciousPromptContext>,
  repair?: ConsciousRepairInput,
): string {
  return renderPromptSections([
    { title: "あなたが現在知っていること", value: context },
    { title: "今回だけの修正依頼", value: repair },
  ]);
}
