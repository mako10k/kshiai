// R: Reserve and retain adjudication costs around exact, verified physical model dispatches.
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import { AwarenessDefaultPolicy } from "@kshiai/shared";
import { newId } from "../id.js";
import type { AwarenessDispatchContext } from "../llm/awareness-dispatch-context.js";
import { prepareObservedAwarenessDispatch, verifyAwarenessDispatchQuote, type AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";
import { getAwarenessRuntime, reserveAwarenessAttempt, settleAwarenessAttempt } from "../repositories/battle-awareness.js";
import type { BattleLeaseFence } from "./distributed-guard.js";

export async function createAwarenessAdjudicationGuard(input: {
  battleId: string;
  fence: BattleLeaseFence;
  provider: string;
  model: string;
  contracts: readonly AwarenessVerifiedBillingContract[];
  now?: () => number;
}): Promise<AwarenessDispatchContext & { assertUsable(): void }> {
  const now = input.now ?? Date.now;
  const initial = await getAwarenessRuntime(input.battleId);
  if (!initial) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
  let failure: Error | null = initial.runtime.budget.reservations.some((attempt) =>
    attempt.role === "adjudication" && attempt.physicalOutstanding)
    ? new Error("AWARENESS_ADJUDICATION_OUTSTANDING") : null;
  const matching = input.contracts.filter((contract) => contract.provider === input.provider && contract.model === input.model);
  const limits = initial.runtime.policy.roles.adjudication;
  const assertUsable = () => { if (failure) throw failure; };
  const assertDeadline = (deadlineAt: number) => {
    if (now() >= deadlineAt) throw new Error("AWARENESS_ADJUDICATION_DEADLINE");
  };
  async function reserveAttempt(id: string, maximumUsd: number | null): Promise<void> {
    for (let retry = 0; retry < 5; retry += 1) {
      const current = await getAwarenessRuntime(input.battleId);
      if (!current) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
      assertDeadline(current.runtime.deadlineAt);
      try {
        await reserveAwarenessAttempt({ battleId: input.battleId, expectedRevision: current.revision,
          fence: input.fence, now: new Date(now()).toISOString() }, { id, role: "adjudication", maximumUsd });
        return;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "AWARENESS_REVISION_OR_LEASE_CONFLICT" || retry === 4) throw error;
      }
    }
  }

  return {
    provider: input.provider,
    model: input.model,
    limits,
    deadlineAt: initial.runtime.deadlineAt,
    assertUsable,
    async run(request, send) {
      assertUsable();
      const id = newId("awareness_adjudication");
      let reserved = false;
      let physicallyClosed = false;
      try {
        assertDeadline(initial.runtime.deadlineAt);
        if (request.provider !== input.provider || request.model !== input.model) throw new Error("AWARENESS_DISPATCH_SCOPE_MISMATCH");
        const proof = initial.runtime.policy.accountingMode === "observed" ? prepareObservedAwarenessDispatch(request, limits)
          : await verifyAwarenessDispatchQuote(request, matching.length === 1 ? matching[0] : undefined, limits);
        assertDeadline(initial.runtime.deadlineAt);
        if (!proof) throw new Error("AWARENESS_VERIFIED_ADMISSION_REQUIRED");
        await reserveAttempt(id, proof.maximumChargeUsd);
        reserved = true;
        assertDeadline(initial.runtime.deadlineAt);
        const receipt = await withLlmUsageScope({ battleId: input.battleId, role: "adjudication", tick: initial.runtime.tick }, send);
        physicallyClosed = true;
        // The provider receipt proves completion. It does not establish the actual dollar charge.
        await settleAwarenessAttempt({ battleId: input.battleId, id, outcome: "unknown",
          actualUsd: null, physicalOutstanding: false, finishedAt: now() });
        assertDeadline(initial.runtime.deadlineAt);
        return receipt.result;
      } catch (error) {
        failure = error instanceof Error ? error : new Error("AWARENESS_ADJUDICATION_FAILED");
        if (reserved) {
          await settleAwarenessAttempt({ battleId: input.battleId, id, outcome: "unknown",
            actualUsd: null, physicalOutstanding: !physicallyClosed, finishedAt: now() }).catch(() => undefined);
        }
        throw failure;
      }
    },
  };
}
