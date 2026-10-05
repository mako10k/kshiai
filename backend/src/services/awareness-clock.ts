// R: Bound awareness waiting without claiming cancellation of a physical model request.
import type { AwarenessExecutionClock } from "./awareness-execution.js";

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
