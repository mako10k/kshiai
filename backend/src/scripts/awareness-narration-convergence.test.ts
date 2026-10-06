// R: Verify successful V5 convergence tolerates deferred claims without accepting unresolved or failed publication.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertNarrationConvergence, narrationConvergenceEvidence, type NarrationConvergenceEntry } from "./awareness-narration-convergence.js";
const complete: NarrationConvergenceEntry = {
  status: "completed", attemptCount: 1, blockedBySequence: null, lease: null, outbox: { status: "completed" },
};
test("V5 accepts successful batch receipts after multiple no-send deferrals", () => {
  assert.doesNotThrow(() => assertNarrationConvergence(5, [complete,
    { ...complete, attemptCount: 3 }, { ...complete, attemptCount: 31 }]));
});
test("V5 rejects failed, cancelled and unresolved receipts", () => {
  for (const entry of [
    { ...complete, status: "failed" }, { ...complete, status: "cancelled" }, { ...complete, status: "generating" },
    { ...complete, blockedBySequence: 1 }, { ...complete, blockedBySequence: undefined },
    { ...complete, lease: {} }, { ...complete, lease: undefined },
    { ...complete, outbox: { status: "pending" } }, { ...complete, outbox: null },
  ]) assert.throws(() => assertNarrationConvergence(5, [entry]), /successful terminal publication/);
});
test("V5 rejects empty, zero, negative, noninteger or missing claim counts", () => {
  assert.throws(() => assertNarrationConvergence(5, []));
  for (const attemptCount of [0, -1, 1.5, NaN, Infinity, undefined]) {
    assert.throws(() => assertNarrationConvergence(5, [{ ...complete, attemptCount }]));
  }
});
test("V4 retains historical terminal statuses and exactly one attempt", () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.doesNotThrow(() => assertNarrationConvergence(4, [{ ...complete, status }]));
  }
  assert.throws(() => assertNarrationConvergence(4, [{ ...complete, attemptCount: 3 }]), /one terminal attempt/);
  assert.throws(() => assertNarrationConvergence(4, [{ ...complete, status: "generating" }]));
});

test("convergence evidence describes V5 terminal uniqueness without claiming one historical attempt", () => {
  const v5 = narrationConvergenceEvidence(5, 38);
  assert.ok("oneTerminalSnapshotPerReceipt" in v5);
  assert.equal(v5.oneTerminalSnapshotPerReceipt, "passed");
  assert.equal("oneAttemptPerReceipt" in v5, false);
  assert.ok("claimCountSemantics" in v5);
  assert.match(v5.claimCountSemantics, /no-send deferrals/);
  const v4 = narrationConvergenceEvidence(4, 4);
  assert.ok("oneAttemptPerReceipt" in v4);
  assert.equal(v4.oneAttemptPerReceipt, "passed");
});
