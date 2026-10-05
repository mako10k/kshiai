// R: Verify deadline waiting leaves late physical completion observable to its owner.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAwarenessClock } from "./awareness-clock.js";

test("an elapsed deadline rejects waiting but does not cancel the physical promise", async () => {
  let complete: ((value: string) => void) | undefined;
  const physical = new Promise<string>((resolve) => { complete = resolve; });
  const clock = createAwarenessClock(() => 100);
  await assert.rejects(clock.withDeadline(physical, 99), /AWARENESS_WAIT_DEADLINE/);
  assert.ok(complete);
  complete("late result");
  assert.equal(await physical, "late result");
});

test("a result before the deadline completes the wait", async () => {
  assert.equal(await createAwarenessClock().withDeadline(Promise.resolve("ready"), Date.now() + 1000), "ready");
});
