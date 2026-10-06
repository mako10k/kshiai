// R: Claim an ordered immutable narration batch within one lease-fenced transaction.
import { type AwarenessPolicyV1, type AwarenessPipelineState, type BattleState } from "@kshiai/shared";
import { withTransaction, type DatabaseConnection } from "../db.js";
import { getAwarenessRuntimeInTransaction, settleAwarenessAttemptInTransaction } from "../repositories/battle-awareness.js";
import { captureAwarenessNarratorContext } from "../repositories/battle-awareness-narrator.js";
import { newId } from "../id.js";
import type { AwarenessFrozenNarration } from "../llm/awareness-frozen-narration.js";
import { requestDigest } from "./distributed-guard.js";
import { AwarenessNarrationQueueNext, type AwarenessNarrationQueueState } from "./awareness-narration-queue.js";
import { requireFence, failEntries, requeueInputOutbox } from "./awareness-narration-worker-lifecycle.js";
import { materialFromEntry } from "./awareness-narration-worker-material.js";
import type { Entry, Selected, Claimed, AwarenessNarrationWorkerResult, AwarenessNarrationWorkerInput, AwarenessNarrationWorkerLeasePort } from "./awareness-narration-worker-contract.js";
import { readAwarenessNarrationClaimSnapshot } from "./awareness-narration-claim-snapshot.js";
function committedAt(entry: Entry, currentBattle: BattleState): number {
  const receipt = currentBattle.phaseReceipts?.find((receipt) => receipt.id === entry.receipt_id);
  if (!receipt || receipt.phase !== entry.phase || receipt.narrationInputDigest !== entry.input_digest || requestDigest(receipt.narrationInput) !== requestDigest(materialFromEntry(entry))) throw new Error("AWARENESS_COMMITTED_NARRATION_RECEIPT_MISSING");
  const value = Date.parse(receipt.committedAt);
  if (!Number.isFinite(value)) throw new Error("AWARENESS_NARRATION_COMMIT_TIME_INVALID");
  return value;
}
async function handleOutstandingBatch(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, entries: readonly Entry[], timing: { fence: number; initialNow: number; initialAt: string }): Promise<AwarenessNarrationWorkerResult | null> {
  const { fence, initialNow, initialAt } = timing;
  const outstanding = entries.find((entry) => entry.status === "generating");
  if (!outstanding) return null;
  const batch = await connection.query<{ deadline_at: string }>("SELECT deadline_at FROM battle_awareness_narration_batches WHERE attempt_id = $1", [outstanding.active_attempt_id]);
  if (!batch.rows[0] || initialNow >= Date.parse(batch.rows[0].deadline_at)) {
    await failEntries(connection, input, entries, "awareness_batch_outstanding", initialAt, ports);
    if (outstanding.active_attempt_id) {
      await connection.query("UPDATE battle_awareness_narration_batches SET status = 'unknown',updated_at = $2 WHERE attempt_id = $1", [outstanding.active_attempt_id, initialAt]);
      const snapshot = await getAwarenessRuntimeInTransaction(connection, input.battleId, { lock: true });
      const reservation = snapshot?.runtime.budget.reservations.find((item) => item.id === outstanding.active_attempt_id);
      if (reservation && reservation.status !== "settled") await settleAwarenessAttemptInTransaction(connection, {
        battleId: input.battleId, id: reservation.id, finishedAt: initialNow,
        outcome: "unknown", actualUsd: null, physicalOutstanding: reservation.physicalOutstanding,
      });
    }
    await ports.release(connection, input, fence); return "failed";
  }
  await requeueInputOutbox(connection, input);
  await ports.release(connection, input, fence); return "deferred";
}

function prepareNarrationQueue(battleId: string, captured: Selected[], runtime: AwarenessPipelineState, fence: number) {
  const first = captured[0]!;
  const prefix: Selected[] = [];
  for (const item of captured) {
    if (item.material.recognitionTarget !== first.material.recognitionTarget || item.material.phase !== first.material.phase || prefix.length >= (first.material.phase === "combat" ? 3 : 1)) break;
    prefix.push(item);
  }
  const limit: 1 | 2 | 3 = prefix.length >= 3 ? 3 : prefix.length === 2 ? 2 : 1;
  const queue: AwarenessNarrationQueueState<AwarenessFrozenNarration> = {
    battleId, globalDeadlineAt: runtime.deadlineAt, terminalAt: runtime.terminalAt, fence, batch: null, usedAttemptIds: [], stoppedReason: null,
    receipts: captured.map((item) => ({ battleId, turnReceiptId: item.entry.receipt_id, sequence: Number(item.entry.sequence), committedAt: item.committedAt,
      publicationDeadlineAt: item.committedAt + runtime.policy.narration.publicationDeadlineMs, inputDigest: item.entry.input_digest,
      frozenInput: item.material, urgent: item.material.phase !== "combat" || item.material.urgent, status: "queued", attemptId: null, result: null })),
  };
  return { prefix, limit, queue };
}
async function recordClaim(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, claim: { fence: number; prefix: Selected[]; deadlineAt: number; initialAt: string; policy: AwarenessPolicyV1 }): Promise<Claimed> {
  const { fence, prefix, deadlineAt, initialAt, policy } = claim;
  const first = prefix[0]!;
  const earliest = (await connection.query<Entry>(`SELECT battle_id,receipt_id,sequence,phase,combat_turn,input_json,input_digest,
    status,active_attempt_id,attempt_count,created_at FROM battle_narration_entries WHERE battle_id=$1 ORDER BY sequence LIMIT 1`, [input.battleId])).rows[0];
  const initial = earliest ? materialFromEntry(earliest).initialNarratorContinuity : undefined;
  const context = await captureAwarenessNarratorContext(connection, { battleId: input.battleId,
    firstSequence: Number(first.entry.sequence), target: first.material.recognitionTarget,
    initial, now: initialAt });
  const attemptId = newId("awareness_narration");
  await connection.query(`INSERT INTO battle_narration_attempts (attempt_id,battle_id,receipt_id,fencing_token,status,provider,model,route,started_at)
    VALUES ($1,$2,$3,$4,'generating',$5,$6,'fast',$7)`, [attemptId,input.battleId,first.entry.receipt_id,fence,input.options.provider?.identity.provider ?? "unavailable",input.options.provider?.identity.fastModel ?? null,initialAt]);
  await connection.query(`INSERT INTO battle_awareness_narration_batches (attempt_id,battle_id,fencing_token,receipt_ids_json,deadline_at,status,created_at,updated_at,context_json,context_digest)
    VALUES ($1,$2,$3,$4,$5,'claimed',$6,$6,$7,$8)`, [attemptId,input.battleId,fence,JSON.stringify(prefix.map((item) => item.entry.receipt_id)),new Date(deadlineAt).toISOString(),initialAt,JSON.stringify(context),requestDigest(context)]);
  for (const item of prefix) {
    const claimed = await connection.query(`UPDATE battle_narration_entries SET status='generating',active_attempt_id=$3,attempt_count=attempt_count+1,updated_at=$4
      WHERE battle_id=$1 AND receipt_id=$2 AND status='queued'`, [input.battleId,item.entry.receipt_id,attemptId,initialAt]);
    if (claimed.rowCount !== 1) throw new Error("NARRATION_CLAIM_CONFLICT");
    await ports.appendEvent(connection,{ battleId:input.battleId,receiptId:item.entry.receipt_id,sequence:Number(item.entry.sequence),phase:item.entry.phase,combatTurn:item.entry.combat_turn,status:"generating",now:initialAt });
  }
  return { attemptId, fence, entries: prefix, deadlineAt, context, observed: policy.accountingMode === "observed", policy };
}
export async function claimNarrationBatch(input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, fence: number, initialNow: number, initialAt: string): Promise<Claimed | AwarenessNarrationWorkerResult> {
  return withTransaction(async (connection): Promise<Claimed | AwarenessNarrationWorkerResult> => {
    if (!await requireFence(connection, input, fence, initialAt)) throw new Error("NARRATION_STALE_FENCE");
    const snapshot = await readAwarenessNarrationClaimSnapshot(connection, input.battleId);
    if (!snapshot) { await ports.release(connection, input, fence); return "acknowledged"; }
    const { entries, battle: currentBattle, runtime: currentRuntime } = snapshot;
    if (!entries.length) { await ports.release(connection, input, fence); return "idle"; }
    const failed = await connection.query("SELECT 1 FROM battle_narration_entries WHERE battle_id = $1 AND status = 'failed' LIMIT 1", [input.battleId]);
    if (failed.rowCount || entries.length > currentRuntime.runtime.policy.narration.queueBeats) {
      await failEntries(connection, input, entries, failed.rowCount ? "awareness_narration_incomplete" : "awareness_queue_capacity", initialAt, ports);
      await ports.release(connection, input, fence); return "failed";
    }
    let captured: Selected[];
    try { captured = entries.map((entry) => ({ entry, material: materialFromEntry(entry), committedAt: committedAt(entry, currentBattle) })); }
    catch {
      await failEntries(connection, input, entries, "awareness_frozen_input_invalid", initialAt, ports);
      await ports.release(connection, input, fence); return "failed";
    }
    const terminalAt = currentRuntime.runtime.terminalAt;
    const publicationDeadline = (item: Selected) => Math.min(item.committedAt + currentRuntime.runtime.policy.narration.publicationDeadlineMs,
      currentRuntime.runtime.deadlineAt, terminalAt === null ? Infinity : terminalAt + currentRuntime.runtime.policy.narration.terminalDrainMs);
    if (captured.some((item) => initialNow >= publicationDeadline(item))) {
      await failEntries(connection, input, entries, "awareness_publication_deadline", initialAt, ports);
      await ports.release(connection, input, fence); return "failed";
    }
    const outstandingResult = await handleOutstandingBatch(connection, input, ports, entries, { fence, initialNow, initialAt });
    if (outstandingResult) return outstandingResult;
    const { prefix, limit, queue } = prepareNarrationQueue(input.battleId, captured, currentRuntime.runtime, fence);
    const decision = AwarenessNarrationQueueNext(queue, initialNow, limit, currentRuntime.runtime.policy);
    if (decision.disposition !== "flush") {
      await requeueInputOutbox(connection, input);
      await ports.release(connection, input, fence); return "deferred";
    }
    return recordClaim(connection, input, ports, { fence, prefix, deadlineAt: decision.deadlineAt, initialAt, policy: currentRuntime.runtime.policy });
  });
}
