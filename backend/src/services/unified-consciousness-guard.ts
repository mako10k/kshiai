// R: Reserve adjudication against the unified battle budget before any physical send.
import { isLlmRateLimitResponse } from "../llm/provider-errors.js";
import { getUnifiedRuntime } from "../repositories/unified-consciousness.js";
import type { AwarenessDispatchContext } from "../llm/awareness-dispatch-context.js";
import { prepareObservedAwarenessDispatch } from "../llm/awareness-dispatch-admission.js";
import { withLlmUsageScope, currentLlmUsageScope } from "../llm/llm-usage-context.js";
import { withLlmPhysicalCompletion, LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
import { mutateUnifiedRuntime } from "../repositories/unified-consciousness.js";
import { getBattleOperationalRuntime, settleBattleOperationalAttempt, unifiedOperationalRuntime } from "../repositories/battle-operational-runtime.js";
import { validateReservationAdmission, budgetSnapshot } from "../repositories/awareness-reservation-budget.js";
import { newId } from "../id.js";
import type { BattleLeaseFence } from "./distributed-guard.js";
export async function createUnifiedAdjudicationGuard(input: { battleId: string; fence: BattleLeaseFence; provider: string; model: string }): Promise<AwarenessDispatchContext & { assertUsable(): void }> {
  const initial = await getBattleOperationalRuntime(input.battleId);
  if (!initial) throw new Error("CONSCIOUSNESS_RUNTIME_NOT_FOUND");
  const retry429 = (await getUnifiedRuntime(input.battleId))?.runtime.policy.revision === "unified-consciousness-policy-v2";
  let failure: Error | null = initial.runtime.budget.reservations.some((item) => item.role === "adjudication" && item.physicalOutstanding)
    ? new Error("CONSCIOUSNESS_ADJUDICATION_OUTSTANDING") : null;
  const assertUsable = () => { if (failure) throw failure; };
  const limits = initial.runtime.policy.roles.adjudication;
  return { ...(retry429 ? { rateLimitRetryBattleId: input.battleId } : {}), provider: input.provider, model: input.model, limits, deadlineAt: initial.runtime.deadlineAt, assertUsable,
    async run(request, send) {
      assertUsable();
      if (request.provider !== input.provider || request.model !== input.model || Date.now() >= initial.runtime.deadlineAt) throw new Error("CONSCIOUSNESS_DISPATCH_INVALID");
      const proof = prepareObservedAwarenessDispatch(request, limits);
      if (!proof) throw new Error("CONSCIOUSNESS_ADMISSION_REJECTED");
      const id = newId("unified_adjudication");
      await mutateUnifiedRuntime(input.battleId, input.fence, (runtime) => {
        validateReservationAdmission(unifiedOperationalRuntime(runtime), { now: new Date().toISOString() }, { id, role: "adjudication", maximumUsd: null });
        return { ...runtime, budget: budgetSnapshot([...runtime.budget.reservations, { id, role: "adjudication", maximumUsd: null, status: "reserved", actualUsd: null, physicalOutstanding: true }]) };
      });
      let closed = false;
      try {
        const receipt = await withLlmPhysicalCompletion(() => withLlmUsageScope({ ...currentLlmUsageScope(), battleId: input.battleId, role: "adjudication" }, send));
        closed = true;
        await settleBattleOperationalAttempt({ battleId: input.battleId, id, outcome: "unknown", actualUsd: null, physicalOutstanding: false, finishedAt: Date.now() });
        if (Date.now() >= initial.runtime.deadlineAt) throw new Error("CONSCIOUSNESS_DEADLINE");
        return receipt.result;
      } catch (error) {
        const retryable = retry429 && isLlmRateLimitResponse(error);
        if (!retryable) failure = error instanceof Error ? error : new Error("CONSCIOUSNESS_ADJUDICATION_FAILED");
        await settleBattleOperationalAttempt({ battleId: input.battleId, id, outcome: "unknown", actualUsd: null,
          physicalOutstanding: !(closed || retryable || error instanceof LlmPhysicalCompletionError), finishedAt: Date.now() });
        throw error;
      }
    },
  };
}
