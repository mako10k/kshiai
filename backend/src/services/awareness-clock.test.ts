// R: Verify deadline waiting leaves late physical completion observable to its owner.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAwarenessClock, waitForAwarenessTickBoundary } from "./awareness-clock.js";

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

test("tick waiting rechecks a backward clock and an early timer wake", async () => {
  const times = [1000, 900, 1999, 2000];
  const sleeps: number[] = [];
  let index = 0;
  await waitForAwarenessTickBoundary({ notBefore: 2000, deadlineAt: 5000,
    now: () => times[index]!, sleep: async (duration) => { sleeps.push(duration); index += 1; } });
  assert.deepEqual(sleeps, [1000, 1100, 1]);
  assert.equal(times[index], 2000);
});

test("tick waiting stops at the global deadline instead of admitting the boundary", async () => {
  let current = 1000;
  await assert.rejects(waitForAwarenessTickBoundary({ notBefore: 2000, deadlineAt: 3000,
    now: () => current, sleep: async () => { current = 3000; } }), /AWARENESS_WAIT_DEADLINE/);
});

test("an already reached tick boundary requires no sleep", async () => {
  let sleeps = 0;
  await waitForAwarenessTickBoundary({ notBefore: 1000, deadlineAt: 3000,
    now: () => 2000, sleep: async () => { sleeps += 1; } });
  assert.equal(sleeps, 0);
});
