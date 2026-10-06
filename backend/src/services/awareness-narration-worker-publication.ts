// R: Publish all batch presentations and narrator recognition atomically behind the lease fence.
import type { NarrativeBlock, AwarenessPipelineState } from "@kshiai/shared";
import type { AwarenessFrozenNarrationResult } from "../llm/awareness-frozen-narration.js";
import { withTransaction, type DatabaseConnection } from "../db.js";
import { getAwarenessRuntimeInTransaction } from "../repositories/battle-awareness.js";
import { commitAwarenessNarratorRecognition } from "../repositories/battle-awareness-narrator.js";
import { requireFence, failEntries, requeueInputOutbox } from "./awareness-narration-worker-lifecycle.js";
import type { NarrationDispatchOutcome } from "./awareness-narration-worker-dispatch.js";
import type { Claimed, AwarenessNarrationWorkerResult, AwarenessNarrationWorkerInput, AwarenessNarrationWorkerLeasePort } from "./awareness-narration-worker-contract.js";
async function deferClaimedBatch(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, selected: Claimed, finishedAt: string): Promise<void> {
  await connection.query("UPDATE battle_narration_attempts SET status='abandoned',http_attempts=0,finished_at=$2,error_class='budget_lease_busy' WHERE attempt_id=$1",[selected.attemptId,finishedAt]);
  await connection.query("UPDATE battle_awareness_narration_batches SET status='deferred',updated_at=$2 WHERE attempt_id=$1",[selected.attemptId,finishedAt]);
  for (const item of selected.entries) {
    await connection.query("UPDATE battle_narration_entries SET status='queued',active_attempt_id=NULL,updated_at=$3 WHERE battle_id=$1 AND receipt_id=$2 AND active_attempt_id=$4",[input.battleId,item.entry.receipt_id,finishedAt,selected.attemptId]);
    await connection.query("UPDATE battle_narration_outbox SET status='pending',dispatched_at=NULL,delivery_generation=delivery_generation+1 WHERE battle_id=$1 AND receipt_id=$2",[input.battleId,item.entry.receipt_id]);
  }
  if (input.outboxId && !selected.entries.some((item)=>item.entry.receipt_id===input.receiptId)) await requeueInputOutbox(connection, input);
  await ports.release(connection,input,selected.fence);
}
function narrationPublicationCurrent(selected: Claimed, outcome: NarrationDispatchOutcome, latestRuntime: AwarenessPipelineState): boolean {
  const terminalDeadline = latestRuntime.terminalAt === null ? Infinity : latestRuntime.terminalAt + latestRuntime.policy.narration.terminalDrainMs;
  return outcome.produced !== null && outcome.finishedNow < selected.deadlineAt && selected.entries.every((item) => outcome.finishedNow < Math.min(item.committedAt + latestRuntime.policy.narration.publicationDeadlineMs,latestRuntime.deadlineAt,terminalDeadline));
}
async function publishClaimedEntries(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, selected: Claimed, presentation: { produced: readonly NarrativeBlock[]; results: readonly AwarenessFrozenNarrationResult[] | null; finishedAt: string }): Promise<void> {
  const { produced, results, finishedAt } = presentation;
  // Every entry and presentation share this one transaction and one immutable batch attempt.
  for (let index=0;index<selected.entries.length;index++) {
    const item=selected.entries[index]!; const block=produced[index]!;
    const updated=await connection.query(`UPDATE battle_narration_entries SET status='completed',terminal_narrative_json=$3,active_attempt_id=NULL,updated_at=$4
      WHERE battle_id=$1 AND receipt_id=$2 AND active_attempt_id=$5 AND status='generating'`,[input.battleId,item.entry.receipt_id,JSON.stringify(block),finishedAt,selected.attemptId]);
    if(updated.rowCount!==1) throw new Error("NARRATION_STALE_ATTEMPT");
    const presentation=await connection.query(`INSERT INTO battle_presentations(battle_id,receipt_id,sequence,phase,combat_turn,input_digest,narrative_json,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(battle_id,receipt_id) DO NOTHING`,[input.battleId,item.entry.receipt_id,item.entry.sequence,item.entry.phase,item.entry.combat_turn,item.entry.input_digest,JSON.stringify(block),finishedAt]);
    if(presentation.rowCount!==1) throw new Error("AWARENESS_PRESENTATION_ALREADY_EXISTS");
    const receiptResult = results?.[index];
    const updates = receiptResult && receiptResult.phase !== "judgment" ? receiptResult.narration.recognitionUpdates ?? [] : [];
    if (updates.some((update) => !item.material.recognitionRefs.includes(update.subjectRef))) throw new Error("AWARENESS_NARRATION_RECOGNITION_SOURCE_MISMATCH");
    await commitAwarenessNarratorRecognition(connection, { battleId: input.battleId,sequence:Number(item.entry.sequence),
      turn:item.material.turn,target:item.material.recognitionTarget,allowedSubjectRefs:item.material.recognitionRefs,updates,now:finishedAt });
    await ports.appendEvent(connection,{battleId:input.battleId,receiptId:item.entry.receipt_id,sequence:Number(item.entry.sequence),phase:item.entry.phase,combatTurn:item.entry.combat_turn,status:"completed",narrative:block,now:finishedAt});
    await connection.query("UPDATE battle_narration_outbox SET status='completed' WHERE battle_id=$1 AND receipt_id=$2",[input.battleId,item.entry.receipt_id]);
  }
}
async function failClaimedBatch(connection: DatabaseConnection, input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, selected: Claimed, outcome: NarrationDispatchOutcome): Promise<void> {
  const { produced, failureReason, finishedAt, physicalFinished, sent } = outcome;
  await failEntries(connection,input,selected.entries.map((item) => item.entry),produced ? "awareness_publication_deadline" : failureReason,finishedAt,ports);
  await connection.query("UPDATE battle_awareness_narration_batches SET status=$2,updated_at=$3 WHERE attempt_id=$1",[selected.attemptId,physicalFinished || !sent ? "failed" : "unknown",finishedAt]);
}
export async function publishNarrationBatch(input: AwarenessNarrationWorkerInput, ports: AwarenessNarrationWorkerLeasePort, selected: Claimed, outcome: NarrationDispatchOutcome, initialNow: number): Promise<AwarenessNarrationWorkerResult> {
  const { reserved, httpAttempts, produced, results, failureReason, finishedNow, finishedAt } = outcome;
  const fence = selected.fence;
  return withTransaction(async (connection) => {
    if (!await requireFence(connection,input,fence,finishedAt)) return "acknowledged";
    if (!reserved && failureReason === "awareness_budget_lease_busy" && finishedNow < selected.deadlineAt) {
      await deferClaimedBatch(connection, input, ports, selected, finishedAt);
      return "deferred";
    }
    await connection.query(`UPDATE battle_narration_attempts SET status=$2,http_attempts=$3,token_count=NULL,estimated_cost_usd=NULL,elapsed_ms=$4,
      finished_at=$5,fallback_reason=$6,error_class=$6 WHERE attempt_id=$1 AND fencing_token=$7`, [selected.attemptId,produced ? "completed" : "failed",httpAttempts,Math.max(0,finishedNow-initialNow),finishedAt,produced ? null : failureReason,fence]);
    const exists = await connection.query("SELECT 1 FROM battles WHERE id=$1",[input.battleId]);
    if (!exists.rowCount) return "acknowledged";
    if (!await requireFence(connection,input,fence,finishedAt)) return "acknowledged";
    const latestSnapshot = await getAwarenessRuntimeInTransaction(connection,input.battleId);
    if(!latestSnapshot)throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    const latestRuntime = latestSnapshot.runtime;
    const valid = narrationPublicationCurrent(selected, outcome, latestRuntime);
    if (!valid || produced === null) {
      await failClaimedBatch(connection, input, ports, selected, outcome);
      await ports.release(connection,input,fence); return "failed";
    }
    await publishClaimedEntries(connection, input, ports, selected, { produced, results, finishedAt });
    await connection.query("UPDATE battle_awareness_narration_batches SET status='completed',updated_at=$2 WHERE attempt_id=$1",[selected.attemptId,finishedAt]);
    if(input.outboxId && !selected.entries.some((item)=>item.entry.receipt_id===input.receiptId)) await requeueInputOutbox(connection, input);
    await ports.release(connection,input,fence); return "completed";
  });
}
