// R: Admit and observe one physical narration dispatch while preserving late-completion accounting.
import { type NarrativeBlock } from "@kshiai/shared";
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import { LlmPhysicalCompletionError, withLlmPhysicalCompletion } from "../llm/llm-physical-completion.js";
import { prepareAwarenessFrozenNarrationRequest, type AwarenessFrozenNarration, type AwarenessFrozenNarrationResult } from "../llm/awareness-frozen-narration.js";
import { prepareObservedAwarenessDispatch, verifyAwarenessDispatchQuote } from "../llm/awareness-dispatch-admission.js";
import { captureProviderHttpAttempts, withBattleProviderOperationContext } from "../llm/provider-accounting.js";
import { reserveNarrationAttempt } from "../repositories/battle-awareness-narration-reservation.js";
import type { AwarenessExecutionClock } from "./awareness-execution.js";
import { closeReservation } from "./awareness-narration-worker-lifecycle.js";
import { narrative } from "./awareness-narration-worker-material.js";
import type { Claimed, AwarenessNarrationWorkerInput } from "./awareness-narration-worker-contract.js";
export type NarrationDispatchOutcome = {
  reserved: boolean; httpAttempts: number; produced: NarrativeBlock[] | null;
  results: AwarenessFrozenNarrationResult[] | null; failureReason: string;
  physicalFinished: boolean; sent: boolean; finishedNow: number; finishedAt: string;
};
async function admitNarrationDispatch(input: AwarenessNarrationWorkerInput, selected: Claimed, clock: AwarenessExecutionClock, materials: readonly AwarenessFrozenNarration[]) {
  const provider = input.options.provider;
  const admission = input.options.admission;
  if (!provider || (!selected.observed && !admission?.pricingRevision.trim())) throw new Error("awareness_billing_proof_missing");
  if (provider.identity.provider !== "xai" || !provider.identity.fastModel.startsWith("grok-")) throw new Error("awareness_narration_route_invalid");
  const prepared = prepareAwarenessFrozenNarrationRequest(materials, selected.deadlineAt - clock.now(), selected.context, selected.policy);
  const priced = { provider: provider.identity.provider, model: provider.identity.fastModel, ...prepared };
  const proof = selected.observed ? prepareObservedAwarenessDispatch(priced, selected.policy.roles.narration)
    : await verifyAwarenessDispatchQuote(priced, admission?.billingContract, selected.policy.roles.narration);
  if (!proof || clock.now() >= selected.deadlineAt) throw new Error("awareness_billing_proof_missing");
  return { provider, prepared, proof, admission };
}
async function reserveNarrationDispatch(input: AwarenessNarrationWorkerInput, selected: Claimed, clock: AwarenessExecutionClock, admitted: Pick<Awaited<ReturnType<typeof admitNarrationDispatch>>, "proof" | "admission">, markReserved: () => void): Promise<void> {
  const { admission, proof } = admitted;
  await reserveNarrationAttempt({ battleId: input.battleId, ownerId: input.ownerId,
    fencingToken: selected.fence, attemptId: selected.attemptId,
    receiptIds: selected.entries.map(item => item.entry.receipt_id), now: new Date(clock.now()).toISOString(),
    requestDigest: proof.requestDigest, pricingRevision: selected.observed ? "unpriced" : admission?.pricingRevision ?? "unpriced",
    maximumUsd: proof.maximumChargeUsd });
  markReserved();
}
function observeLateNarrationCompletion(request: Promise<unknown>, input: AwarenessNarrationWorkerInput, selected: Claimed, clock: AwarenessExecutionClock): void {
  void request.then(async () => {
    await closeReservation(input.battleId, selected.attemptId, clock.now(), true, true);
  }, async (error: unknown) => {
    if (error instanceof LlmPhysicalCompletionError) await closeReservation(input.battleId, selected.attemptId, clock.now(), true, true);
  }).catch(() => { console.error("[awareness-narration] late physical receipt could not be recorded"); });
}
function narrationDispatchFailure(error: unknown, priorPhysicalFinished: boolean, httpAttempts: number) {
  const physicalFinished = error instanceof LlmPhysicalCompletionError || priorPhysicalFinished;
  const failureReason = error instanceof Error ? error.message : "awareness_narration_failed";
  if (error && typeof error === "object") {
    const count: unknown = Reflect.get(error,"httpAttempts");
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) httpAttempts = count;
  }
  return { physicalFinished, failureReason, httpAttempts };
}
export async function dispatchNarrationBatch(input: AwarenessNarrationWorkerInput, selected: Claimed, clock: AwarenessExecutionClock): Promise<NarrationDispatchOutcome> {
  let reserved = false;
  let httpAttempts = 0;
  let produced: NarrativeBlock[] | null = null;
  let results: AwarenessFrozenNarrationResult[] | null = null;
  let failureReason = "awareness_billing_proof_missing";
  let physicalFinished = false;
  let sent = false;
  const materials = selected.entries.map((item) => item.material);
  try {
    const admitted = await admitNarrationDispatch(input, selected, clock, materials);
    const { provider, prepared } = admitted;
    await reserveNarrationDispatch(input, selected, clock, admitted, () => { reserved = true; });
    if (clock.now() >= selected.deadlineAt) throw new Error("awareness_dispatch_deadline");
    sent = true;
    const request = withBattleProviderOperationContext(input.battleId, () => captureProviderHttpAttempts(() => withLlmPhysicalCompletion(() => withLlmUsageScope({ battleId: input.battleId, role: "narration", receiptIds: materials.map((material) => material.turnReceiptId) }, () => provider.narrateFrozenBatch(materials, prepared.options.timeoutMs, selected.context, selected.policy)))));
    observeLateNarrationCompletion(request, input, selected, clock);
    const generated = await clock.withDeadline(request, selected.deadlineAt);
    httpAttempts = generated.httpAttempts;
    physicalFinished = true;
    if (generated.value.length !== materials.length) throw new Error("awareness_batch_coverage_invalid");
    results = generated.value;
    produced = generated.value.map((result, index) => narrative(materials[index]!,result));
    failureReason = "awareness_batch_invalid";
  } catch (error) {
    const failure = narrationDispatchFailure(error, physicalFinished, httpAttempts);
    physicalFinished = failure.physicalFinished;
    failureReason = failure.failureReason;
    httpAttempts = failure.httpAttempts;
    produced = null;
  }
  const finishedNow = clock.now();
  const finishedAt = new Date(finishedNow).toISOString();
  if (reserved) await closeReservation(input.battleId, selected.attemptId, finishedNow, physicalFinished, sent);
  return { reserved, httpAttempts, produced, results, failureReason, physicalFinished, sent, finishedNow, finishedAt };
}
