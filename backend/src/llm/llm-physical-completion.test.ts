// R: Verify physical response evidence stays local and never equates logical timeout with provider completion.
import assert from "node:assert/strict";
import { it } from "node:test";
import { LlmPhysicalCompletionError, observePhysicalAttemptStarted, observePhysicalResponseCompleted, withLlmPhysicalCompletion } from "./llm-physical-completion.js";

it("wraps validation rejection after a complete response and preserves cause", async () => {
  const rejection = new Error("INVALID_SHAPE");
  await assert.rejects(withLlmPhysicalCompletion(async () => {
    observePhysicalAttemptStarted(); observePhysicalResponseCompleted(); throw rejection;
  }), (error: unknown) => error instanceof LlmPhysicalCompletionError && error.cause === rejection && error.message === rejection.message);
});
it("leaves unsent and incomplete attempts unconfirmed", async () => {
  for (const started of [false, true]) {
    const rejection = new Error("TIMEOUT");
    await assert.rejects(withLlmPhysicalCompletion(async () => {
      if (started) observePhysicalAttemptStarted(); throw rejection;
    }), (error: unknown) => error === rejection);
  }
});
it("isolates concurrent calls and keeps a partially completed retry sequence unknown", async () => {
  const rejection = new Error("FAILED");
  const outcomes = await Promise.allSettled([withLlmPhysicalCompletion(async () => {
    observePhysicalAttemptStarted(); await Promise.resolve(); observePhysicalResponseCompleted(); throw rejection;
  }), withLlmPhysicalCompletion(async () => {
    observePhysicalAttemptStarted(); await Promise.resolve(); throw rejection;
  }), withLlmPhysicalCompletion(async () => {
    observePhysicalAttemptStarted(); observePhysicalResponseCompleted(); observePhysicalAttemptStarted(); throw rejection;
  })]);
  assert.ok(outcomes[0]?.status === "rejected" && outcomes[0].reason instanceof LlmPhysicalCompletionError);
  assert.ok(outcomes[1]?.status === "rejected" && outcomes[1].reason === rejection);
  assert.ok(outcomes[2]?.status === "rejected" && outcomes[2].reason === rejection);
});
it("returns successful values without changing their identity", async () => {
  const value = { accepted: true };
  assert.equal(await withLlmPhysicalCompletion(async () => value), value);
});
