// R: Verify completed awareness execution and summarize actual SDK token usage for public acceptance.
import { isDeepStrictEqual } from "node:util";
import { AwarenessNormalPolicy, CurrentAwarenessPromptRevision, type BattleAssetManifest } from "@kshiai/shared";
import { getAwarenessRuntime, type AwarenessRuntimeSnapshot } from "../repositories/battle-awareness.js";
import { listLlmUsageAttempts, type LlmUsageAttempt } from "../repositories/llm-usage.js";

export async function inspectAwarenessPublicObservation(battleId: string, manifest: BattleAssetManifest) {
  if (manifest.schemaVersion !== 5) throw new Error("PUBLIC_COMPLETION_REQUIRES_AWARENESS_V5");
  if (!isDeepStrictEqual(manifest.awarenessPolicy, AwarenessNormalPolicy)) throw new Error("PUBLIC_COMPLETION_POLICY_MISMATCH");
  let saved = await getAwarenessRuntime(battleId);
  const drainUntil = Date.now() + manifest.awarenessPolicy.narration.terminalDrainMs;
  while (saved?.runtime.status === "terminal" && saved.runtime.budget.physicalOutstanding > 0 && Date.now() < drainUntil) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000, drainUntil - Date.now())));
    saved = await getAwarenessRuntime(battleId);
  }
  const attempts = await listLlmUsageAttempts({ battleId });
  return verifyAwarenessPublicObservation(battleId, manifest, saved, attempts);
}

export function verifyAwarenessPublicObservation(
  battleId: string,
  manifest: Pick<Extract<BattleAssetManifest, { schemaVersion: 5 }>, "schemaVersion" | "awarenessPolicy" | "promptRevision">,
  saved: AwarenessRuntimeSnapshot | null,
  attempts: readonly LlmUsageAttempt[],
) {
  const checked = assertCompletedRuntime(battleId, manifest, saved);
  const budget = checked.runtime.budget;
  assertCompleteUsageLedger(battleId, attempts, budget.physicalAttempts);
  const tokens = attempts.reduce((summary, attempt) => ({
    prompt: summary.prompt + (attempt.promptTokens ?? 0),
    completion: summary.completion + (attempt.completionTokens ?? 0),
    total: summary.total + (attempt.totalTokens ?? 0),
    unknownAttempts: summary.unknownAttempts + Number(attempt.promptTokens === null || attempt.completionTokens === null || attempt.totalTokens === null),
  }), { prompt: 0, completion: 0, total: 0, unknownAttempts: 0 });
  if (tokens.total <= 0) throw new Error("PUBLIC_COMPLETION_REPORTED_TOKENS_MISSING");
  return {
    engine: "awareness-v5" as const, policyRevision: manifest.awarenessPolicy.revision,
    recordedPromptRevision: manifest.promptRevision, effectivePromptRevision: CurrentAwarenessPromptRevision,
    completedTicks: checked.runtime.tick, physicalAttemptLimit: manifest.awarenessPolicy.maxPhysicalAttempts,
    physicalAttempts: budget.physicalAttempts, physicalOutstanding: budget.physicalOutstanding,
    narrationPhysicalAttempts: attempts.filter((attempt) => attempt.role === "narration").length,
    reportedTokens: tokens, monetaryCost: "unknown_without_verified_prices" as const,
    attempts: attempts.map((attempt) => ({ id: attempt.id, role: attempt.role, provider: attempt.provider,
      requestedModel: attempt.requestedModel, responseModel: attempt.responseModel, status: attempt.status,
      promptTokens: attempt.promptTokens, completionTokens: attempt.completionTokens, totalTokens: attempt.totalTokens,
      elapsedMs: attempt.elapsedMs, responseDiagnostics: attempt.responseDiagnostics ?? null })),
  };
}

function assertCompletedRuntime(
  battleId: string,
  manifest: Pick<Extract<BattleAssetManifest, { schemaVersion: 5 }>, "awarenessPolicy">,
  saved: AwarenessRuntimeSnapshot | null,
): AwarenessRuntimeSnapshot {
  if (!saved || saved.battleId !== battleId || !isDeepStrictEqual(saved.runtime.policy, manifest.awarenessPolicy) || saved.runtime.status !== "terminal" || saved.runtime.incompleteReason !== null) {
    throw new Error("PUBLIC_COMPLETION_RUNTIME_NOT_FINISHED");
  }
  const budget = saved.runtime.budget;
  if (budget.physicalOutstanding !== 0 || budget.physicalAttempts > manifest.awarenessPolicy.maxPhysicalAttempts || budget.reservations.some((attempt) => attempt.physicalOutstanding)) {
    throw new Error("PUBLIC_COMPLETION_PHYSICAL_BUDGET_UNRESOLVED");
  }
  return saved;
}
function assertCompleteUsageLedger(battleId: string, attempts: readonly LlmUsageAttempt[], physicalAttempts: number): void {
  if (attempts.length === 0 || attempts.some((attempt) => attempt.battleId !== battleId || attempt.status === "started") || attempts.length !== physicalAttempts) {
    throw new Error("PUBLIC_COMPLETION_USAGE_ATTEMPTS_MISMATCH");
  }
  for (const role of ["creation", "subconscious", "narration"]) {
    if (!attempts.some((attempt) => attempt.role === role)) throw new Error(`PUBLIC_COMPLETION_USAGE_ROLE_MISSING:${role}`);
  }
}
