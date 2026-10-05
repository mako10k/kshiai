// R: Select and settle ordered immutable narration receipts under the awareness batch policy.
import { AwarenessDefaultPolicy, type AwarenessPolicyV1 } from "@kshiai/shared";
import type { AwarenessNarrationReceiptResult } from "../llm/awareness-narration.js";

export type AwarenessNarrationQueueReceipt<Input> = {
  battleId: string;
  turnReceiptId: string;
  sequence: number;
  committedAt: number;
  publicationDeadlineAt: number;
  inputDigest: string;
  frozenInput: Input;
  urgent: boolean;
  status: "queued" | "generating" | "ready" | "published" | "failed";
  attemptId: string | null;
  result: AwarenessNarrationReceiptResult | null;
};
export type AwarenessNarrationQueueBatch = {
  attemptId: string;
  fence: number;
  receiptIds: string[];
  startedAt: number;
  deadlineAt: number;
  physicalOutstanding: boolean;
  status: "generating" | "ready" | "published" | "failed";
};
export type AwarenessNarrationQueueState<Input> = {
  battleId: string;
  globalDeadlineAt: number;
  terminalAt: number | null;
  fence: number;
  receipts: AwarenessNarrationQueueReceipt<Input>[];
  batch: AwarenessNarrationQueueBatch | null;
  usedAttemptIds: string[];
  stoppedReason: "queue_capacity" | "publication_deadline" | "batch_failed" | null;
};
export type AwarenessNarrationAdmission<Input> =
  | { disposition: "admitted" | "duplicate"; state: AwarenessNarrationQueueState<Input> }
  | { disposition: "rejected"; reason: "queue_capacity" | "publication_deadline" | "stopped"; state: AwarenessNarrationQueueState<Input> };
export type AwarenessNarrationQueueDecision =
  | { disposition: "wait"; reason: "empty" | "flush_window" | "active_batch"; nextAt: number | null }
  | { disposition: "stop"; reason: "queue_capacity" | "publication_deadline" | "batch_failed" }
  | { disposition: "flush"; receiptIds: string[]; deadlineAt: number };

function validTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error("AWARENESS_NARRATION_TIME_INVALID");
}
function freezeSource<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) freezeSource(child, seen);
  }
  return value;
}
export function AwarenessInitializeNarrationQueue<Input>(battleId: string, globalDeadlineAt: number): AwarenessNarrationQueueState<Input> {
  validTime(globalDeadlineAt);
  if (!battleId) throw new Error("AWARENESS_NARRATION_BATTLE_ID_MISSING");
  return { battleId, globalDeadlineAt, terminalAt: null, fence: 0, receipts: [], batch: null, usedAttemptIds: [], stoppedReason: null };
}
function deadline<Input>(state: AwarenessNarrationQueueState<Input>, receipt: AwarenessNarrationQueueReceipt<Input>, policy: AwarenessPolicyV1): number {
  return Math.min(receipt.publicationDeadlineAt, state.globalDeadlineAt,
    state.terminalAt === null ? Infinity : state.terminalAt + policy.narration.terminalDrainMs);
}
function pending<Input>(state: AwarenessNarrationQueueState<Input>): AwarenessNarrationQueueReceipt<Input>[] {
  return state.receipts.filter((receipt) => receipt.status === "queued" || receipt.status === "generating" || receipt.status === "ready");
}
function failUnpublished<Input>(state: AwarenessNarrationQueueState<Input>, reason: Exclude<AwarenessNarrationQueueState<Input>["stoppedReason"], null>): AwarenessNarrationQueueState<Input> {
  return { ...state, stoppedReason: reason,
    receipts: state.receipts.map((receipt) => receipt.status === "published" ? receipt : { ...receipt, status: "failed", result: null }),
    batch: state.batch && state.batch.status !== "published" ? { ...state.batch, status: "failed" } : state.batch };
}
export function AwarenessAdmitNarrationReceipt<Input>(state: AwarenessNarrationQueueState<Input>, receipt: Omit<AwarenessNarrationQueueReceipt<Input>, "publicationDeadlineAt" | "status" | "attemptId" | "result">, now: number, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy): AwarenessNarrationAdmission<Input> {
  validTime(now); validTime(receipt.committedAt);
  if (receipt.battleId !== state.battleId || !receipt.turnReceiptId || !receipt.inputDigest || !Number.isSafeInteger(receipt.sequence) || receipt.sequence < 1 || receipt.committedAt > now) throw new Error("AWARENESS_NARRATION_RECEIPT_INVALID");
  const existing = state.receipts.find((entry) => entry.turnReceiptId === receipt.turnReceiptId);
  if (existing) {
    if (existing.inputDigest !== receipt.inputDigest || existing.sequence !== receipt.sequence || existing.committedAt !== receipt.committedAt || existing.urgent !== receipt.urgent) throw new Error("AWARENESS_NARRATION_INPUT_DIGEST_CONFLICT");
    return { disposition: "duplicate", state };
  }
  if (state.receipts.some((entry) => entry.sequence >= receipt.sequence)) throw new Error("AWARENESS_NARRATION_SEQUENCE_NOT_APPEND_ONLY");
  if (state.terminalAt !== null && receipt.committedAt > state.terminalAt) throw new Error("AWARENESS_NARRATION_COMMIT_AFTER_TERMINAL");
  if (state.stoppedReason) return { disposition: "rejected", reason: "stopped", state };
  if (pending(state).some((entry) => now >= deadline(state, entry, policy))) return { disposition: "rejected", reason: "publication_deadline", state: failUnpublished(state, "publication_deadline") };
  const captured: AwarenessNarrationQueueReceipt<Input> = { ...receipt, frozenInput: freezeSource(structuredClone(receipt.frozenInput)),
    publicationDeadlineAt: receipt.committedAt + policy.narration.publicationDeadlineMs,
    status: "queued", attemptId: null, result: null };
  if (deadline(state, captured, policy) <= now) return { disposition: "rejected", reason: "publication_deadline", state: failUnpublished(state, "publication_deadline") };
  if (pending(state).length >= policy.narration.queueBeats) return { disposition: "rejected", reason: "queue_capacity", state: failUnpublished(state, "queue_capacity") };
  return { disposition: "admitted", state: { ...state, receipts: [...state.receipts, captured] } };
}
export function AwarenessMarkNarrationTerminal<Input>(state: AwarenessNarrationQueueState<Input>, now: number): AwarenessNarrationQueueState<Input> {
  validTime(now);
  if (state.terminalAt !== null) return state;
  return { ...state, terminalAt: now };
}
export function AwarenessNarrationQueueNext<Input>(state: AwarenessNarrationQueueState<Input>, now: number, maximumReceipts: 1 | 2 | 3 = 3, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy): AwarenessNarrationQueueDecision {
  validTime(now);
  if (state.stoppedReason) return { disposition: "stop", reason: state.stoppedReason };
  const unresolved = pending(state);
  if (unresolved.some((receipt) => now >= deadline(state, receipt, policy))) return { disposition: "stop", reason: "publication_deadline" };
  if (state.batch?.status === "generating" && now >= state.batch.deadlineAt) return { disposition: "stop", reason: "batch_failed" };
  if (state.batch && (state.batch.physicalOutstanding || state.batch.status === "ready" || state.batch.status === "generating")) return { disposition: "wait", reason: "active_batch", nextAt: state.batch.deadlineAt };
  const queued = unresolved.filter((receipt) => receipt.status === "queued").sort((left, right) => left.sequence - right.sequence);
  const first = queued[0];
  if (!first) return { disposition: "wait", reason: "empty", nextAt: null };
  const flushAt = first.committedAt + policy.narration.flushMs;
  if (queued.length < policy.narration.batchReceipts && now < flushAt && state.terminalAt === null && !queued.some((receipt) => receipt.urgent)) return { disposition: "wait", reason: "flush_window", nextAt: Math.min(flushAt, deadline(state, first, policy)) };
  const selected = queued.slice(0, maximumReceipts);
  return { disposition: "flush", receiptIds: selected.map((receipt) => receipt.turnReceiptId), deadlineAt: Math.min(now + policy.roles.narration.deadlineMs, ...selected.map((receipt) => deadline(state, receipt, policy))) };
}
export function AwarenessClaimNarrationBatch<Input>(state: AwarenessNarrationQueueState<Input>, input: { attemptId: string; fence: number; now: number; maximumReceipts?: 1 | 2 | 3 }, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy): AwarenessNarrationQueueState<Input> {
  if (!input.attemptId || state.usedAttemptIds.includes(input.attemptId) || !Number.isSafeInteger(input.fence) || input.fence < state.fence) throw new Error("AWARENESS_NARRATION_BATCH_IDENTITY_INVALID");
  const next = AwarenessNarrationQueueNext(state, input.now, input.maximumReceipts, policy);
  if (next.disposition !== "flush") throw new Error("AWARENESS_NARRATION_BATCH_NOT_READY");
  const selected = new Set(next.receiptIds);
  return { ...state, fence: input.fence, usedAttemptIds: [...state.usedAttemptIds, input.attemptId],
    batch: { attemptId: input.attemptId, fence: input.fence, receiptIds: next.receiptIds, startedAt: input.now, deadlineAt: next.deadlineAt, physicalOutstanding: true, status: "generating" },
    receipts: state.receipts.map((receipt) => selected.has(receipt.turnReceiptId) ? { ...receipt, status: "generating", attemptId: input.attemptId } : receipt) };
}
export function AwarenessSettleNarrationBatch<Input>(state: AwarenessNarrationQueueState<Input>, input: { attemptId: string; fence: number; now: number; results: readonly AwarenessNarrationReceiptResult[] | null; physicalFinished: boolean }): AwarenessNarrationQueueState<Input> {
  validTime(input.now);
  const batch = state.batch;
  if (!batch || batch.attemptId !== input.attemptId || batch.fence !== input.fence || state.fence !== input.fence) return state;
  const physicalOutstanding = batch.physicalOutstanding && !input.physicalFinished;
  if (batch.status === "failed" || state.stoppedReason) return { ...state, batch: { ...batch, physicalOutstanding } };
  if (batch.status !== "generating") return state;
  const results = input.results;
  const valid = input.physicalFinished && input.now < batch.deadlineAt && results !== null && results.length === batch.receiptIds.length && results.every((result, index) => result.battleId === state.battleId && result.turnReceiptId === batch.receiptIds[index]);
  if (!valid) {
    const failed = failUnpublished(state, "batch_failed");
    return { ...failed, batch: { ...batch, status: "failed", physicalOutstanding } };
  }
  // Index coverage was checked before any receipt is changed. Never splice different attempts.
  const captured = structuredClone(results);
  const byId = new Map(captured.map((result) => [result.turnReceiptId, result]));
  return { ...state, batch: { ...batch, status: "ready", physicalOutstanding: false }, receipts: state.receipts.map((receipt) => {
    const result = byId.get(receipt.turnReceiptId);
    return result ? { ...receipt, status: "ready", result } : receipt;
  }) };
}
export function AwarenessPublishNarrationBatch<Input>(state: AwarenessNarrationQueueState<Input>, input: { attemptId: string; fence: number; now: number }, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy): AwarenessNarrationQueueState<Input> {
  validTime(input.now);
  const batch = state.batch;
  if (!batch || batch.attemptId !== input.attemptId || batch.fence !== input.fence || state.fence !== input.fence || batch.status !== "ready" || batch.physicalOutstanding) throw new Error("AWARENESS_NARRATION_PUBLICATION_NOT_READY");
  const selected = state.receipts.filter((receipt) => batch.receiptIds.includes(receipt.turnReceiptId));
  if (state.stoppedReason || selected.length !== batch.receiptIds.length || selected.some((receipt) => receipt.status !== "ready" || receipt.attemptId !== batch.attemptId || !receipt.result || input.now >= deadline(state, receipt, policy))) return failUnpublished(state, "publication_deadline");
  return { ...state, batch: { ...batch, status: "published" }, receipts: state.receipts.map((receipt) => batch.receiptIds.includes(receipt.turnReceiptId) ? { ...receipt, status: "published" } : receipt) };
}
export function AwarenessCheckNarrationQueue<Input>(state: AwarenessNarrationQueueState<Input>, now: number, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy): AwarenessNarrationQueueState<Input> {
  const next = AwarenessNarrationQueueNext(state, now, 3, policy);
  return next.disposition === "stop" ? failUnpublished(state, next.reason) : state;
}
