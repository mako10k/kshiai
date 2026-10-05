// R: Freeze typed, perspective-compiled narration sources before outbox persistence.
import {
  buildNarrateTurnPromptMaterial, buildNarrateProloguePromptMaterial,
  buildNarrateAftermathPromptMaterial, buildNarrateJudgmentPromptMaterial,
} from "./openai-compatible.js";
import { renderPromptSections } from "./prompt-prose.js";
import { AwarenessFrozenNarrationSchema, type AwarenessFrozenNarration } from "./awareness-frozen-narration.js";
import { CONTENT_ONLY_NARRATION_CONTRACT } from "./narration-prompt-contract.js";
import { CurrentAwarenessPromptRevision, type BattleNarratorContinuity } from "@kshiai/shared";
import type { LlmProvider } from "./types.js";

export type AwarenessNarrationPhaseInput =
  | { phase: "combat"; input: Omit<Parameters<LlmProvider["narrateTurn"]>[0], "onProgress"> }
  | { phase: "prologue"; input: Omit<Parameters<LlmProvider["narratePrologue"]>[0], "onProgress"> }
  | { phase: "aftermath"; input: Omit<Parameters<LlmProvider["narrateAftermath"]>[0], "onProgress"> }
  | { phase: "judgment"; input: Parameters<LlmProvider["narrateJudgment"]>[0] };

type FreezeIdentity = { battleId: string; turnReceiptId: string; urgent?: boolean; initialNarratorContinuity?: BattleNarratorContinuity };
type PromptRevision = NonNullable<AwarenessFrozenNarration["promptRevision"]>;
function combatRecognitionTarget(mode: "self" | "opponent" | "external" | "omniscient"): "a" | "b" | "reader" {
  return mode === "self" ? "a" : mode === "opponent" ? "b" : "reader";
}
function sceneRecognitionTarget(input: Extract<AwarenessNarrationPhaseInput, { phase: "prologue" | "aftermath" }>["input"]): "a" | "b" | "reader" {
  if (input.perspective === "self" || (input.perspective === "fluid" && input.focus === "self")) return "a";
  if (input.perspective === "foe" || (input.perspective === "fluid" && input.focus === "foe")) return "b";
  return "reader";
}
function freezeCombat(request: Extract<AwarenessNarrationPhaseInput, { phase: "combat" }>, identity: FreezeIdentity, promptRevision: PromptRevision): AwarenessFrozenNarration {
  const prompt = buildNarrateTurnPromptMaterial(request.input, CONTENT_ONLY_NARRATION_CONTRACT);
  const source: unknown = JSON.parse(prompt.user);
  return AwarenessFrozenNarrationSchema.parse({
    kind: "awareness-v5", promptRevision, phase: request.phase, ...identity, turn: request.input.view.turn,
    urgent: identity.urgent === true || (request.input.characterSpeeches?.length ?? 0) > 0,
    system: prompt.system, user: renderPromptSections([{ title: "確定した描写資料", value: source }]),
    sourceSpeeches: (request.input.characterSpeeches ?? []).map((speech) => ({ side: speech.side, text: speech.text })),
    recognitionTarget: combatRecognitionTarget(request.input.view.perception.mode),
    recognitionRefs: request.input.view.recognitionSubjects.map((subject) => subject.subjectRef), judgmentVerdict: null,
  });
}
function freezeJudgment(request: Extract<AwarenessNarrationPhaseInput, { phase: "judgment" }>, identity: FreezeIdentity, promptRevision: PromptRevision): AwarenessFrozenNarration {
  const prompt = buildNarrateJudgmentPromptMaterial(request.input, CONTENT_ONLY_NARRATION_CONTRACT);
  return AwarenessFrozenNarrationSchema.parse({
    kind: "awareness-v5", promptRevision, phase: request.phase, ...identity, turn: request.input.turn, urgent: true,
    system: prompt.system, user: renderPromptSections([{ title: "確定した描写資料", value: prompt.userData }]),
    sourceSpeeches: [], recognitionRefs: [],
    judgmentVerdict: request.input.winnerName ? `判定は ${request.input.winnerName} の勝利。` : "判定は引き分け。",
  });
}
function freezeScene(request: Extract<AwarenessNarrationPhaseInput, { phase: "prologue" | "aftermath" }>, identity: FreezeIdentity, promptRevision: PromptRevision): AwarenessFrozenNarration {
  const prompt = request.phase === "prologue" ? buildNarrateProloguePromptMaterial(request.input, CONTENT_ONLY_NARRATION_CONTRACT) : buildNarrateAftermathPromptMaterial(request.input, CONTENT_ONLY_NARRATION_CONTRACT);
  return AwarenessFrozenNarrationSchema.parse({
    kind: "awareness-v5", promptRevision, phase: request.phase, ...identity, turn: request.phase === "prologue" ? 0 : request.input.turn, urgent: true,
    system: prompt.system, user: renderPromptSections([{ title: "確定した描写資料", value: prompt.userData }]),
    sourceSpeeches: (request.input.characterSpeeches ?? []).map((speech) => ({ side: speech.side, text: speech.text })),
    recognitionTarget: sceneRecognitionTarget(request.input),
    recognitionRefs: (request.input.recognitionSubjects ?? []).map((subject) => subject.subjectRef), judgmentVerdict: null,
  });
}
export function freezeAwarenessNarration(
  request: AwarenessNarrationPhaseInput,
  identity: FreezeIdentity,
  promptRevision: PromptRevision = CurrentAwarenessPromptRevision,
): AwarenessFrozenNarration {
  if (request.phase === "combat") return freezeCombat(request, identity, promptRevision);
  if (request.phase === "judgment") return freezeJudgment(request, identity, promptRevision);
  return freezeScene(request, identity, promptRevision);
}
