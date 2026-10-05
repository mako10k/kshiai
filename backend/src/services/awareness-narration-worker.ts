// R: Orchestrate lease acquisition, batch claim, dispatch, and atomic narration publication.
import { query } from "../db.js";
import { getAwarenessRuntime } from "../repositories/battle-awareness.js";
import { createAwarenessClock } from "./awareness-clock.js";
import { readBattle } from "./awareness-narration-worker-lifecycle.js";
import { claimNarrationBatch } from "./awareness-narration-worker-claim.js";
import { dispatchNarrationBatch } from "./awareness-narration-worker-dispatch.js";
import { publishNarrationBatch } from "./awareness-narration-worker-publication.js";
import type { AwarenessNarrationWorkerInput, AwarenessNarrationWorkerLeasePort, AwarenessNarrationWorkerResult } from "./awareness-narration-worker-contract.js";
export type { VerifiedNarrationDispatchAdmission, AwarenessNarrationWorkerOptions, AwarenessNarrationWorkerInput, AwarenessNarrationWorkerResult, AwarenessNarrationWorkerLeasePort } from "./awareness-narration-worker-contract.js";
async function narrationDeliveryCurrent(input: AwarenessNarrationWorkerInput): Promise<boolean> {
  if (input.outboxId && input.deliveryGeneration !== undefined) {
    const delivery = await query<{ status: string; delivery_generation: number }>("SELECT status,delivery_generation FROM battle_narration_outbox WHERE outbox_id = $1 AND battle_id = $2", [input.outboxId, input.battleId]);
    if (!delivery.rows[0] || delivery.rows[0].status === "completed" || Number(delivery.rows[0].delivery_generation) !== input.deliveryGeneration) return false;
  }
  return true;
}
/** Existing V4 worker entrypoints call this only after a complete V5 manifest is observed. */
export async function processAwarenessNarrationWorker(input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort): Promise<AwarenessNarrationWorkerResult> {
  const clock = input.options.clock ?? createAwarenessClock();
  const initialNow = input.now?.getTime() ?? clock.now();
  const initialAt = new Date(initialNow).toISOString();
  const battle = await readBattle(input.battleId);
  if (!battle) return "acknowledged";
  if (battle.assetManifest?.schemaVersion !== 5) throw new Error("AWARENESS_NARRATION_REQUIRES_V5");
  const runtime = await getAwarenessRuntime(input.battleId);
  if (!runtime) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
  if (!await narrationDeliveryCurrent(input)) return "acknowledged";
  const fence = await ports.acquire({ battleId: input.battleId, ownerId: input.ownerId, now: initialAt,
    expiresAt: new Date(initialNow + (input.leaseMs ?? Math.max(60000, runtime.runtime.policy.roles.narration.deadlineMs + 5000))).toISOString() });
  const selected = await claimNarrationBatch(input, ports, fence, initialNow, initialAt);
  if (typeof selected === "string") return selected;
  const outcome = await dispatchNarrationBatch(input, selected, clock);
  return publishNarrationBatch(input, ports, selected, outcome, initialNow);
}
