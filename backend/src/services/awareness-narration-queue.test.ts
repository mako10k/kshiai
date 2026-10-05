// R: Verify narration batching bounds, frozen receipt identity and atomic ordered publication.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AwarenessLongMeasurementPolicy } from "@kshiai/shared";
import type { AwarenessNarrationReceiptResult } from "../llm/awareness-narration.js";
import { AwarenessAdmitNarrationReceipt, AwarenessCheckNarrationQueue, AwarenessClaimNarrationBatch, AwarenessInitializeNarrationQueue, AwarenessMarkNarrationTerminal, AwarenessNarrationQueueNext, AwarenessPublishNarrationBatch, AwarenessSettleNarrationBatch, type AwarenessNarrationQueueState } from "./awareness-narration-queue.js";

type Source = { description: string; speeches: string[] };
function initial(): AwarenessNarrationQueueState<Source> {
  return AwarenessInitializeNarrationQueue("battle", 180000);
}
function add(state: AwarenessNarrationQueueState<Source>, sequence: number, committedAt = sequence * 1000, urgent = false) {
  return AwarenessAdmitNarrationReceipt(state, { battleId: "battle", turnReceiptId: `receipt-${sequence}`, sequence, committedAt, inputDigest: `digest-${sequence}`, frozenInput: { description: `出来事${sequence}`, speeches: [] }, urgent }, committedAt).state;
}
function result(sequence: number): AwarenessNarrationReceiptResult {
  return { battleId: "battle", turnReceiptId: `receipt-${sequence}`, narration: { turn: sequence, narrator: ["動いた。", "近づいた。"], speeches: [], recognitionUpdates: [] } };
}
describe("awareness narration queue policy", () => {
  it("uses the bound long measurement window while preserving legacy timing defaults", () => {
    const initialLong = AwarenessInitializeNarrationQueue<Source>("battle", 600000);
    const receipt = { battleId: "battle", turnReceiptId: "long", sequence: 1, committedAt: 1000,
      inputDigest: "long-digest", frozenInput: { description: "出来事", speeches: [] }, urgent: true };
    const long = AwarenessAdmitNarrationReceipt(initialLong, receipt, 1000, AwarenessLongMeasurementPolicy).state;
    assert.equal(long.receipts[0]?.publicationDeadlineAt, 181000);
    const next = AwarenessNarrationQueueNext(long, 40000, 3, AwarenessLongMeasurementPolicy);
    assert.deepEqual(next, { disposition: "flush", receiptIds: ["long"], deadlineAt: 100000 });
    const terminal = AwarenessMarkNarrationTerminal(long, 2000);
    assert.equal(AwarenessNarrationQueueNext(terminal, 20000, 3, AwarenessLongMeasurementPolicy).disposition, "flush");
    assert.equal(AwarenessNarrationQueueNext(terminal, 92000, 3, AwarenessLongMeasurementPolicy).disposition, "stop");
    const claimed = AwarenessClaimNarrationBatch(long, { attemptId: "long-attempt", fence: 1, now: 40000 }, AwarenessLongMeasurementPolicy);
    const ready = AwarenessSettleNarrationBatch(claimed, { attemptId: "long-attempt", fence: 1, now: 80000,
      results: [{ ...result(1), turnReceiptId: "long" }], physicalFinished: true });
    assert.equal(AwarenessPublishNarrationBatch(ready, { attemptId: "long-attempt", fence: 1, now: 80001 }, AwarenessLongMeasurementPolicy).receipts[0]?.status, "published");
    assert.equal(AwarenessNarrationQueueNext(AwarenessAdmitNarrationReceipt(initialLong, receipt, 1000).state, 40000).disposition, "stop");
  });
  it("flushes three ordered receipts in one batch and blocks a second physical call", () => {
    let state = add(add(add(initial(), 1), 2), 3);
    const next = AwarenessNarrationQueueNext(state, 3000);
    assert.deepEqual(next, { disposition: "flush", receiptIds: ["receipt-1", "receipt-2", "receipt-3"], deadlineAt: 18000 });
    state = AwarenessClaimNarrationBatch(state, { attemptId: "attempt-1", fence: 1, now: 3000 });
    state = add(state, 4);
    assert.equal(AwarenessNarrationQueueNext(state, 4000).disposition, "wait");
    assert.throws(() => AwarenessClaimNarrationBatch(state, { attemptId: "attempt-2", fence: 1, now: 4000 }), /NOT_READY/);
  });
  it("uses oldest six-second flush and immediate urgent or terminal flush", () => {
    const state = add(initial(), 1);
    assert.deepEqual(AwarenessNarrationQueueNext(state, 6999), { disposition: "wait", reason: "flush_window", nextAt: 7000 });
    assert.equal(AwarenessNarrationQueueNext(state, 7000).disposition, "flush");
    assert.equal(AwarenessNarrationQueueNext(add(initial(), 1, 1000, true), 1000).disposition, "flush");
    assert.equal(AwarenessNarrationQueueNext(AwarenessMarkNarrationTerminal(state, 2000), 2000).disposition, "flush");
  });
  it("retains a copied immutable source and idempotent exact receipt admission", () => {
    const source = { description: "元の事実", speeches: ["あっ"] };
    const receipt = { battleId: "battle", turnReceiptId: "r", sequence: 1, committedAt: 1000, inputDigest: "digest", frozenInput: source, urgent: false };
    const admitted = AwarenessAdmitNarrationReceipt(initial(), receipt, 1000);
    source.speeches.push("改変");
    assert.deepEqual(admitted.state.receipts[0].frozenInput.speeches, ["あっ"]);
    assert.throws(() => admitted.state.receipts[0].frozenInput.speeches.push("変更"), TypeError);
    assert.equal(AwarenessAdmitNarrationReceipt(admitted.state, receipt, 2000).disposition, "duplicate");
    assert.throws(() => AwarenessAdmitNarrationReceipt(admitted.state, { ...receipt, inputDigest: "different" }, 2000), /DIGEST_CONFLICT/);
    assert.throws(() => AwarenessAdmitNarrationReceipt(admitted.state, { ...receipt, turnReceiptId: "other" }, 2000), /APPEND_ONLY/);
  });
  it("rejects a thirteenth pending beat and retains already published receipts", () => {
    let state = initial();
    for (let i = 1; i <= 12; i++) state = add(state, i);
    const rejected = AwarenessAdmitNarrationReceipt(state, { battleId: "battle", turnReceiptId: "r13", sequence: 13, committedAt: 13000, inputDigest: "d13", frozenInput: { description: "13", speeches: [] }, urgent: false }, 13000);
    assert.equal(rejected.disposition, "rejected");
    assert.equal(rejected.state.stoppedReason, "queue_capacity");
    assert.equal(rejected.state.receipts.length, 12);
    assert.equal(rejected.state.receipts.every((receipt) => receipt.status === "failed"), true);
  });
  it("stops on oldest publication deadline even while a physical call remains outstanding", () => {
    const state = AwarenessClaimNarrationBatch(add(initial(), 1, 1000, true), { attemptId: "a", fence: 1, now: 1000 });
    const stopped = AwarenessCheckNarrationQueue(state, 37000);
    assert.equal(stopped.stoppedReason, "publication_deadline");
    assert.equal(stopped.batch?.physicalOutstanding, true);
    const late = AwarenessSettleNarrationBatch(stopped, { attemptId: "a", fence: 1, now: 38000, results: [result(1)], physicalFinished: true });
    assert.equal(late.batch?.physicalOutstanding, false);
    assert.equal(late.receipts[0].status, "failed");
  });
  it("shortens terminal drain to the earliest global or receipt deadline", () => {
    const global = AwarenessInitializeNarrationQueue<Source>("battle", 10000);
    const state = AwarenessMarkNarrationTerminal(add(global, 1), 2000);
    const next = AwarenessNarrationQueueNext(state, 2000);
    assert.equal(next.disposition, "flush");
    if (next.disposition === "flush") assert.equal(next.deadlineAt, 10000);
    const terminal = AwarenessMarkNarrationTerminal(add(initial(), 1), 2000);
    assert.equal(AwarenessNarrationQueueNext(terminal, 17000).disposition, "stop");
    assert.equal(AwarenessMarkNarrationTerminal(terminal, 5000), terminal);
  });
  it("publishes whole single-attempt coverage in receipt order and keeps later queued work", () => {
    let state = AwarenessClaimNarrationBatch(add(add(add(initial(), 1), 2), 3), { attemptId: "a", fence: 1, now: 3000 });
    state = add(state, 4);
    const ready = AwarenessSettleNarrationBatch(state, { attemptId: "a", fence: 1, now: 4000, results: [result(1), result(2), result(3)], physicalFinished: true });
    assert.equal(ready.batch?.status, "ready");
    assert.equal(AwarenessNarrationQueueNext(ready, 4000).disposition, "wait");
    const published = AwarenessPublishNarrationBatch(ready, { attemptId: "a", fence: 1, now: 4001 });
    assert.deepEqual(published.receipts.map((receipt) => receipt.status), ["published", "published", "published", "queued"]);
    assert.throws(() => AwarenessPublishNarrationBatch(published, { attemptId: "a", fence: 1, now: 4002 }), /NOT_READY/);
    assert.equal(published.receipts[0].result?.turnReceiptId, "receipt-1");
  });
  it("rejects incomplete, reordered or stale result coverage without partial publication", () => {
    const state = AwarenessClaimNarrationBatch(add(add(add(initial(), 1), 2), 3), { attemptId: "a", fence: 1, now: 3000 });
    assert.equal(AwarenessSettleNarrationBatch(state, { attemptId: "a", fence: 2, now: 4000, results: [result(1), result(2), result(3)], physicalFinished: true }), state);
    for (const results of [[result(1)], [result(2), result(1), result(3)]]) {
      const failed = AwarenessSettleNarrationBatch(state, { attemptId: "a", fence: 1, now: 4000, results, physicalFinished: true });
      assert.equal(failed.stoppedReason, "batch_failed");
      assert.equal(failed.receipts.every((receipt) => receipt.status === "failed" && receipt.result === null), true);
    }
  });
  it("keeps unknown physical termination occupied after logical failure", () => {
    const state = AwarenessClaimNarrationBatch(add(initial(), 1, 1000, true), { attemptId: "a", fence: 1, now: 1000 });
    const failed = AwarenessSettleNarrationBatch(state, { attemptId: "a", fence: 1, now: 16000, results: null, physicalFinished: false });
    assert.equal(failed.batch?.physicalOutstanding, true);
    assert.equal(AwarenessNarrationQueueNext(failed, 16001).disposition, "stop");
    const detected = AwarenessCheckNarrationQueue(state, 16000);
    assert.equal(detected.stoppedReason, "batch_failed");
    assert.equal(detected.batch?.physicalOutstanding, true);
  });
});
