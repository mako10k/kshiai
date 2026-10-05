// R: Carry invocation-local evidence of received physical responses across result validation failures.
import { AsyncLocalStorage } from "node:async_hooks";

type CompletionState = { started: number; completed: number };
const observations = new AsyncLocalStorage<CompletionState>();

export class LlmPhysicalCompletionError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "LLM_RESULT_REJECTED_AFTER_RESPONSE", { cause });
    this.name = "LlmPhysicalCompletionError";
  }
}

/** These signals come only from the physical SDK observer, never from logical timeout or abort. */
export function observePhysicalAttemptStarted(): void {
  const state = observations.getStore();
  if (state) state.started += 1;
}
export function observePhysicalResponseCompleted(): void {
  const state = observations.getStore();
  if (state) state.completed += 1;
}

export async function withLlmPhysicalCompletion<T>(action: () => Promise<T>): Promise<T> {
  const state: CompletionState = { started: 0, completed: 0 };
  return observations.run(state, async () => {
    try { return await action(); }
    catch (error) {
      if (state.started > 0 && state.started === state.completed) throw new LlmPhysicalCompletionError(error);
      throw error;
    }
  });
}
