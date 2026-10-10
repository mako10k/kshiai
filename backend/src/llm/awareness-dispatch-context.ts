// R: Carry the explicit adjudication admission guard across one asynchronous domain operation.
import { AsyncLocalStorage } from "node:async_hooks";
import type { AwarenessPricedRequest, AwarenessQuoteLimits } from "./awareness-dispatch-admission.js";

export type AwarenessPhysicalUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export interface AwarenessDispatchContext {
  readonly provider: string;
  readonly model: string;
  readonly limits: AwarenessQuoteLimits;
  /** Absolute battle deadline also bounds each physical SDK request. */
  readonly deadlineAt?: number;
  readonly rateLimitRetryBattleId?: string;
  /** Reservation, verified pricing, and unknown completion handling belong to the caller's guard. */
  run<T>(request: AwarenessPricedRequest, send: () => Promise<{ result: T; usage: AwarenessPhysicalUsage | null }>): Promise<T>;
}
const context = new AsyncLocalStorage<AwarenessDispatchContext>();
export function currentAwarenessDispatchContext(): AwarenessDispatchContext | undefined {
  return context.getStore();
}
export function withAwarenessDispatchContext<T>(guard: AwarenessDispatchContext, action: () => Promise<T>): Promise<T> {
  return context.run(guard, action);
}
