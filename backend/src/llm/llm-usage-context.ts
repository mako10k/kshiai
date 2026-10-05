// R: Attach optional domain correlation to physical LLM usage without importing domain execution.
import { AsyncLocalStorage } from "node:async_hooks";
export type LlmUsageScope = { battleId?: string; role?: string; side?: "a" | "b"; tick?: number; receiptIds?: readonly string[] };
const scopes = new AsyncLocalStorage<Readonly<LlmUsageScope>>();
export function currentLlmUsageScope(): Readonly<LlmUsageScope> | undefined { return scopes.getStore(); }
export function withLlmUsageScope<T>(scope: LlmUsageScope, action: () => Promise<T>): Promise<T> {
  return scopes.run(Object.freeze({ ...scope, ...(scope.receiptIds ? { receiptIds: Object.freeze([...scope.receiptIds]) } : {}) }), action);
}
