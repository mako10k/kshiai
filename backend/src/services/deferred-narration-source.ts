import type { AwarenessPromptRevision, BattleNarratorContinuity } from "@kshiai/shared";
// R: Bind typed deferred narration requests to immutable receipt-scoped prompt sources.
import { freezeAwarenessNarration } from "../llm/awareness-narration-phase.js";
import type { LlmProvider } from "../llm/types.js";

export type DeferredNarrationInput =
  | { kind: "combat"; urgent?: boolean; request: Omit<Parameters<LlmProvider["narrateTurn"]>[0], "onProgress"> }
  | { kind: "prologue"; request: Omit<Parameters<LlmProvider["narratePrologue"]>[0], "onProgress"> }
  | { kind: "aftermath"; request: Omit<Parameters<LlmProvider["narrateAftermath"]>[0], "onProgress"> }
  | { kind: "judgment"; request: Parameters<LlmProvider["narrateJudgment"]>[0] };

export function freezeDeferredAwarenessNarration(
  request: DeferredNarrationInput,
  identity: { battleId: string; turnReceiptId: string; initialNarratorContinuity?: BattleNarratorContinuity; promptRevision?: AwarenessPromptRevision },
) {
  const { promptRevision, ...sourceIdentity } = identity;
  switch (request.kind) {
    case "combat": return freezeAwarenessNarration({ phase: request.kind, input: request.request }, { ...sourceIdentity, urgent: request.urgent }, promptRevision);
    case "prologue": return freezeAwarenessNarration({ phase: request.kind, input: request.request }, sourceIdentity, promptRevision);
    case "aftermath": return freezeAwarenessNarration({ phase: request.kind, input: request.request }, sourceIdentity, promptRevision);
    case "judgment": return freezeAwarenessNarration({ phase: request.kind, input: request.request }, sourceIdentity, promptRevision);
  }
}
