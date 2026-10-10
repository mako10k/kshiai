// R: Admit each additional physical send against the immutable unified battle budget.
import { getUnifiedRuntime, mutateUnifiedRuntime } from "../repositories/unified-consciousness.js";
import { unifiedOperationalRuntime, settleBattleOperationalAttempt } from "../repositories/battle-operational-runtime.js";
import { budgetSnapshot } from "../repositories/awareness-reservation-budget.js";
import { currentLlmUsageScope } from "./llm-usage-context.js";
import { newId } from "../id.js";

export async function unifiedTransportAdmission(timeoutMs: number, adjudicationBattleId?: string) {
  const scope = adjudicationBattleId ? { battleId: adjudicationBattleId, role: "adjudication" } : currentLlmUsageScope();
  const battleId = scope?.battleId;
  if (!battleId || !["consciousness", "narration", "adjudication"].includes(scope.role ?? "")) return null;
  const current = await getUnifiedRuntime(battleId);
  if (current?.runtime.policy.revision !== "unified-consciousness-policy-v2") return null;
  const deadlineAt = Math.min(Date.now() + timeoutMs, current.runtime.deadlineAt);
  const terminalNarration = current.runtime.status === "terminal" && scope.role === "narration" && current.runtime.terminalAt !== null &&
    Date.now() < current.runtime.terminalAt + current.runtime.operatingPolicy.narration.terminalDrainMs;
  if (current.runtime.status !== "active" && !terminalNarration) throw new Error("CONSCIOUSNESS_TRANSPORT_INACTIVE");
  return {
    deadlineAt,
    async reserve(ordinal: number): Promise<string | null> {
      if (Date.now() >= deadlineAt) throw new Error("CONSCIOUSNESS_TRANSPORT_DEADLINE");
      // First sends already have a durable decision/narration reservation. The
      // adjudication guard runs inside each physical send and reserves every one.
      if (ordinal === 1 || scope.role === "adjudication") return null;
      const id = newId("transport_retry");
      await mutateUnifiedRuntime(battleId, undefined, (runtime) => {
        const operational = unifiedOperationalRuntime(runtime);
        const terminalNarration = runtime.status === "terminal" && scope.role === "narration" && runtime.terminalAt !== null &&
          Date.now() < runtime.terminalAt + runtime.operatingPolicy.narration.terminalDrainMs;
        if ((runtime.status !== "active" && !terminalNarration) || Date.now() >= Math.min(deadlineAt, runtime.deadlineAt)) throw new Error("CONSCIOUSNESS_TRANSPORT_DEADLINE");
        if (operational.budget.physicalAttempts >= runtime.policy.maxPhysicalAttempts ||
          operational.budget.physicalOutstanding >= runtime.policy.maxPhysicalConcurrent) throw new Error("CONSCIOUSNESS_TRANSPORT_BUDGET_EXCEEDED");
        return { ...runtime, budget: budgetSnapshot([...runtime.budget.reservations, {
          id, role: scope.role === "narration" ? "narration" : "conscious", maximumUsd: null,
          status: "reserved", actualUsd: null, physicalOutstanding: true,
        }]) };
      });
      return id;
    },
    async close(id: string | null, physicalFinished: boolean) {
      if (id === null) return;
      await settleBattleOperationalAttempt({ battleId, id, outcome: "unknown", actualUsd: null,
        physicalOutstanding: !physicalFinished, finishedAt: Date.now() });
    },
  };
}
