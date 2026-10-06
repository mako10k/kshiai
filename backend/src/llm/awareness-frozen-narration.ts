// R: Validate immutable narration material and receipt-scoped results at the awareness worker boundary.
import { z } from "zod";
import { currentNarrationContentRules } from "./narration-prompt-contract.js";
import { narrationReceiptContract } from "./narration-receipt-contract.js";
import { awarenessFrozenNarrationBatchSchema, awarenessFrozenNarrationResponseFormat } from "./awareness-narration-response-schema.js";
import { AwarenessDefaultPolicy, AwarenessPolicyV1Schema, type AwarenessPolicyV1, AwarenessFrozenNarrationSchema, type AwarenessFrozenNarration } from "@kshiai/shared";
import type { NarrationResult, AftermathNarrationResult, JudgmentNarrationResult } from "./types.js";
import type { PreparedAwarenessRequest } from "./awareness-request.js";
import { AwarenessNarratorDispatchContextSchema, type AwarenessNarratorDispatchContext } from "./awareness-narrator-context.js";
import { renderPromptSections } from "./prompt-prose.js";

export { AwarenessFrozenNarrationSchema } from "@kshiai/shared";
export type { AwarenessFrozenNarration } from "@kshiai/shared";
export type AwarenessFrozenNarrationResult =
  | { phase: "combat" | "prologue"; battleId: string; turnReceiptId: string; narration: NarrationResult }
  | { phase: "aftermath"; battleId: string; turnReceiptId: string; narration: AftermathNarrationResult }
  | { phase: "judgment"; battleId: string; turnReceiptId: string; narration: JudgmentNarrationResult };

function frames(materials: readonly AwarenessFrozenNarration[]): AwarenessFrozenNarration[] {
  const captured = materials.map((material) => AwarenessFrozenNarrationSchema.parse(material));
  const first = captured[0];
  if (!first || captured.length > 3 || (first.phase !== "combat" && captured.length !== 1) ||
      captured.some((item) => item.battleId !== first.battleId || item.phase !== first.phase) ||
      new Set(captured.map((item) => item.turnReceiptId)).size !== captured.length) throw new Error("AWARENESS_FROZEN_NARRATION_BATCH_INVALID");
  return captured;
}

export function prepareAwarenessFrozenNarrationRequest(materials: readonly AwarenessFrozenNarration[], timeoutMs?: number, context?: AwarenessNarratorDispatchContext, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy): PreparedAwarenessRequest {
  const captured = frames(materials);
  const limits = AwarenessPolicyV1Schema.parse(policy).roles.narration;
  const deadline = timeoutMs === undefined ? limits.deadlineMs : Math.min(timeoutMs, limits.deadlineMs);
  if (!Number.isFinite(deadline) || deadline <= 0) throw new Error("AWARENESS_NARRATION_DEADLINE_INVALID");
  const system = [
    ...captured.map((material) => `receipt ${material.turnReceiptId} の規則：\n${currentNarrationContentRules(material.system, material.phase)}`),
    narrationReceiptContract(captured),
  ].join("\n");
  const source = context ? AwarenessNarratorDispatchContextSchema.parse(context) : null;
  if (source && (captured.some((material) => material.recognitionTarget !== source.target) ||
      source.published.some((item) => item.battleId !== captured[0]!.battleId || captured.some((material) => material.turnReceiptId === item.turnReceiptId)))) {
    throw new Error("AWARENESS_NARRATOR_CONTEXT_SCOPE_MISMATCH");
  }
  const user = (source ? renderPromptSections([{ title: "すでに公開した情報と許された現在の認知", value: source }]) + "\n\n" : "") + captured.map((material) => [
    renderPromptSections([{ title: `確定receipt ${material.turnReceiptId}`, value: {
      battleId: material.battleId, turnReceiptId: material.turnReceiptId, phase: material.phase, turn: material.turn,
    } }]),
    material.user,
  ].join("\n\n")).join("\n\n");
  return { system, user, options: { tier: "fast", timeoutMs: deadline, maxCompletionTokens: limits.outputTokens, label: "awareness-v5:narration-frozen", responseFormat: awarenessFrozenNarrationResponseFormat(captured[0]!.phase, captured.length) } };
}

export function validateAwarenessFrozenNarrationResults(materials: readonly AwarenessFrozenNarration[], raw: unknown): AwarenessFrozenNarrationResult[] {
  const captured = frames(materials);
  const coverage = z.object({ receipts: z.array(z.unknown()) }).passthrough().parse(raw);
  if (coverage.receipts.length !== captured.length) throw new Error("AWARENESS_NARRATION_RECEIPT_COVERAGE_MISMATCH");
  const output = awarenessFrozenNarrationBatchSchema(captured[0]!.phase, captured.length).parse(raw);
  return output.receipts.map((result, index) => {
    const material = captured[index]!;
    if (result.battleId !== material.battleId || result.turnReceiptId !== material.turnReceiptId || result.turn !== material.turn || result.phase !== material.phase) throw new Error("AWARENESS_NARRATION_RECEIPT_IDENTITY_MISMATCH");
    if (result.phase === "judgment") return { phase: "judgment", battleId: result.battleId, turnReceiptId: result.turnReceiptId, narration: { before: result.before, after: result.after } };
    const expected = [...material.sourceSpeeches];
    const lineCount = result.phase === "aftermath" ? result.before.length + result.after.length : result.narrator.length;
    for (const speech of result.speeches) {
      if (speech.afterNarratorLine >= lineCount) throw new Error("AWARENESS_NARRATION_SPEECH_PLACEMENT_INVALID");
      if (speech.sourceSide === null) continue;
      const match = expected.findIndex((source) => source.side === speech.sourceSide && source.text === speech.text);
      if (match < 0) throw new Error("AWARENESS_NARRATION_SPEECH_SOURCE_MISMATCH");
      expected.splice(match, 1);
    }
    if (expected.length > 0) throw new Error("AWARENESS_NARRATION_SPEECH_SOURCE_MISSING");
    if (result.recognitionUpdates.some((update) => !material.recognitionRefs.includes(update.subjectRef))) throw new Error("AWARENESS_NARRATION_RECOGNITION_SOURCE_MISMATCH");
    const speeches = result.speeches.map((speech) => ({ speaker: speech.speaker, text: speech.text, afterNarratorLine: speech.afterNarratorLine, ...(speech.sourceSide === null ? {} : { sourceSide: speech.sourceSide }) }));
    if (result.phase === "aftermath") return { phase: "aftermath", battleId: result.battleId, turnReceiptId: result.turnReceiptId, narration: { before: result.before, after: result.after, speeches, recognitionUpdates: result.recognitionUpdates } };
    return { phase: result.phase, battleId: result.battleId, turnReceiptId: result.turnReceiptId, narration: { turn: result.turn, narrator: result.narrator, speeches, recognitionUpdates: result.recognitionUpdates } };
  });
}
