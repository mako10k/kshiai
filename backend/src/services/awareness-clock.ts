// R: Bound awareness waiting without claiming cancellation of a physical model request.
import type { AwarenessExecutionClock } from "./awareness-execution.js";

/** A timer wake is not proof that the persisted wall-clock tick boundary has arrived. */
export async function waitForAwarenessTickBoundary(input: {
  notBefore: number;
  deadlineAt: number;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
}): Promise<void> {
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? ((durationMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  for (;;) {
    const current = now();
    if (current >= input.deadlineAt || input.notBefore >= input.deadlineAt) {
      throw new Error("AWARENESS_WAIT_DEADLINE");
    }
    const remaining = input.notBefore - current;
    if (remaining <= 0) return;
    await sleep(Math.min(remaining, input.deadlineAt - current));
  }
}

export function createAwarenessClock(now: () => number = Date.now): AwarenessExecutionClock {
  return {
    now,
    withDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
      const remaining = deadlineAt - now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        void promise.catch(() => undefined);
        return Promise.reject(new Error("AWARENESS_WAIT_DEADLINE"));
      }
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("AWARENESS_WAIT_DEADLINE")), remaining);
        promise.then(
          (value) => { clearTimeout(timer); resolve(value); },
          (error: unknown) => { clearTimeout(timer); reject(error); },
        );
      });
    },
  };
}
